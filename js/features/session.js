/**
 * The quiz runner shared by Practice, Test, Review, Mistakes, Bookmarks, Study-now blocks and
 * Rapid-fire. Logs every answer through engine/learner.js.
 * @module features/session
 */
import { h, mount, mmss } from '../ui/dom.js';
import { icon } from '../ui/icons.js';
import { sheet, confirmDialog, toast } from '../ui/overlay.js';
import { app, saveUser, saveUserNow } from '../state.js';
import { go } from '../router.js';
import { recordAttempt, finalizeSession, uid } from '../engine/learner.js';
import { selectAdaptive, eapEstimate } from '../engine/irt.js';
import { shuffle } from '../engine/stats.js';
import { instantiate } from '../utils/template.js';
import { mathText, whyPanel, labelMap } from './whyWrong.js';
import { sound, haptic } from '../utils/feedback.js';
import { loadChapter } from '../bank/chapterLoader.js';
import { t } from '../i18n.js';

/** Bookmark reasons (Feature 13). */
export const BOOKMARK_REASONS = [
  ['difficult', 'Difficult'], ['needsRevision', 'Needs revision'], ['important', 'Important'],
  ['frequentlyConfused', 'Frequently confused'], ['formula', 'Formula'], ['examinerTrap', 'Examiner trap'],
];

/**
 * @typedef {Object} SessionOptions
 * @property {'practice'|'test'|'review'|'rapid'} mode logged mode
 * @property {string} title
 * @property {object[]} questions questions with `_chapter` metadata
 * @property {object[]} [pool] wider pool for adaptive picking / "retry similar"
 * @property {number} [count] number of questions (adaptive)
 * @property {boolean} [adaptive]
 * @property {'immediate'|'end'} [feedback]
 * @property {boolean} [timed] @property {number} [totalSec] @property {number} [perQuestionSec]
 * @property {object} [scope] {category, subjectId, chapterIds}
 * @property {Array} [plan] remaining study-plan blocks to run afterwards
 * @property {boolean} [shuffleOptions]
 */

/** Prepare one item. */
function makeItem(q, shuffleOptions) {
  const inst = instantiate(q);
  const keys = Object.keys(inst.options);
  return { q: inst, order: shuffleOptions === false ? keys : shuffle(keys), selected: null, timeMs: 0, confidence: 2, changed: false, recorded: false, result: null };
}

/**
 * Create and start a session (navigates to #/session).
 * @param {SessionOptions} opts
 */
export function startSession(opts) {
  const qs = opts.questions || [];
  if (!qs.length && !(opts.adaptive && opts.pool?.length)) { toast('No questions available for this selection yet.'); return; }
  const s = {
    id: uid('s'), startedAt: new Date().toISOString(), index: 0, finished: false,
    mode: opts.mode, title: opts.title, scope: opts.scope || {}, plan: opts.plan || null,
    feedback: opts.feedback || (opts.mode === 'test' ? 'end' : 'immediate'),
    timed: !!opts.timed, totalSec: opts.totalSec || 0, perQuestionSec: opts.perQuestionSec || 0,
    shuffleOptions: opts.shuffleOptions !== false,
    pool: opts.pool || qs, items: [], adaptive: null,
  };
  if (opts.adaptive) {
    const subj = s.scope.subjectId;
    const theta0 = app.user.abilities?.bySubject?.[subj]?.theta ?? app.user.abilities?.theta ?? 0;
    s.adaptive = { count: Math.min(opts.count || 10, s.pool.length), theta0, theta: theta0, used: new Set() };
    const first = selectAdaptive(s.pool, theta0, { exclude: s.adaptive.used });
    s.adaptive.used.add(first.id);
    s.items.push(makeItem(first, s.shuffleOptions));
  } else {
    s.items = qs.map((q) => makeItem(q, s.shuffleOptions));
  }
  app.session = s;
  go('/session');
}

/** Number of questions the session will contain. */
function totalCount(s) {
  return s.adaptive ? s.adaptive.count : s.items.length;
}

/** Record an item's answer in the learner model. */
function record(s, item) {
  if (item.recorded) return;
  const ch = item.q._chapter;
  const res = recordAttempt(app.user, {
    question: item.q, category: ch.category, subjectId: ch.subjectId, chapterId: ch.id,
    selected: item.selected, timeMs: Math.max(500, item.timeMs), confidence: item.confidence, changedAnswer: item.changed,
    mode: s.mode, sessionId: s.id, bookmarked: !!(app.user.bookmarks || []).find((b) => b.questionId === item.q.id),
  }, { config: app.config, incoming: app.prereq.incoming });
  item.recorded = true;
  item.result = { isCorrect: res.attempt.isCorrect, errorType: res.errorType, propagation: res.propagation };
  if (res.propagation && res.propagation.rootCause !== ch.id) {
    const root = app.catalog.chapterById.get(res.propagation.rootCause);
    if (root) toast(`Repeated trouble here may come from a prerequisite: “${root.title}”. It was flagged for review.`, { ms: 6000 });
  }
  saveUser();
}

/** Bookmark sheet. */
export function bookmarkSheet(qid, onChange) {
  const u = app.user;
  u.bookmarks = u.bookmarks || [];
  let bm = u.bookmarks.find((b) => b.questionId === qid);
  const chosen = new Set(bm ? bm.reasons : []);
  const chips = BOOKMARK_REASONS.map(([k, label]) => {
    const c = h('button', { class: 'chip', type: 'button', 'aria-pressed': String(chosen.has(k)), onclick: () => { if (chosen.has(k)) chosen.delete(k); else chosen.add(k); c.setAttribute('aria-pressed', String(chosen.has(k))); } }, label);
    return c;
  });
  const close = sheet('Bookmark question', [
    h('p', { class: 'muted small' }, 'Pick one or more reasons. You can practise bookmarks by reason later.'),
    h('div', { class: 'row-wrap' }, chips),
    h('div', { class: 'grid-2 mt-4' },
      h('button', { class: 'btn', onclick: () => { u.bookmarks = u.bookmarks.filter((b) => b.questionId !== qid); saveUser(); close(); onChange?.(false); } }, 'Remove'),
      h('button', { class: 'btn btn-primary', onclick: () => {
        bm = u.bookmarks.find((b) => b.questionId === qid);
        const reasons = [...chosen];
        if (!reasons.length) reasons.push('needsRevision');
        if (bm) bm.reasons = reasons; else u.bookmarks.push({ questionId: qid, reasons, date: new Date().toISOString() });
        saveUser(); close(); onChange?.(true);
      } }, 'Save')),
  ]);
}

/** Note sheet. */
export function noteSheet(qid) {
  const u = app.user;
  u.notes = u.notes || {};
  const ta = h('textarea', { class: 'input-full', rows: 5, maxlength: 2000, 'aria-label': 'Note' });
  ta.value = u.notes[qid] || '';
  const close = sheet('Add a note', [ta, h('button', { class: 'btn btn-primary btn-block mt-3', onclick: () => {
    u.notes[qid] = ta.value.trim();
    const m = (u.mistakeBook || []).find((x) => x.questionId === qid);
    if (m) m.note = u.notes[qid];
    saveUser(); close(); toast('Note saved.');
  } }, 'Save note')]);
  setTimeout(() => ta.focus(), 50);
}

/** Insert a similar question (same chapter, same concept tag if possible). */
async function retrySimilar(s, item) {
  const used = new Set(s.items.map((i) => i.q.id));
  let pool = s.pool.filter((q) => q._chapter.id === item.q._chapter.id && !used.has(q.id));
  if (!pool.length) {
    try {
      const ch = app.catalog.chapterById.get(item.q._chapter.id);
      const r = await loadChapter(ch);
      pool = r.questions.filter((q) => !used.has(q.id)).map((q) => ({ ...q, _chapter: item.q._chapter }));
    } catch { pool = []; }
  }
  const same = pool.filter((q) => q.concept && q.concept === item.q.concept);
  const pick = (same.length ? same : pool)[0];
  if (!pick) { toast('No other question from this chapter yet.'); return false; }
  s.items.splice(s.index + 1, 0, makeItem(pick, s.shuffleOptions));
  if (s.adaptive) s.adaptive.count += 1;
  return true;
}

/**
 * Render the active session.
 * @param {HTMLElement} view
 * @returns {() => void} cleanup
 */
export function renderSession(view) {
  const s = app.session;
  if (!s || s.finished) { go('/home', { replace: true }); return () => {}; }
  document.body.classList.add('immersive');
  let qStart = performance.now();
  let tick = null;
  let qTimer = null;
  const sessionDeadline = s.timed && s.totalSec ? (s.deadline ||= Date.now() + s.totalSec * 1000) : 0;

  const timerEl = h('span', { class: 'timer-text calm', role: 'timer', 'aria-live': 'off' }, '00:00');
  const counterEl = h('span', { class: 'pill' });
  const bar = h('span', { style: { width: '0%' } });
  const body = h('div');
  const card = h('section', { class: 'card', 'aria-label': 'Question' },
    h('div', { class: 'exam-header' }, counterEl,
      h('span', { class: 'small muted ellipsis grow center', style: { padding: '0 .25rem' } }, s.title),
      timerEl,
      h('button', { class: 'icon-btn', 'aria-label': 'Exit session', onclick: exit }, icon('close'))),
    h('div', { class: 'progress session-progress', 'aria-hidden': 'true' }, bar),
    body);
  mount(view, card);

  function stopClock() { const now = performance.now(); const it = s.items[s.index]; if (it && !(s.feedback === 'immediate' && it.recorded)) it.timeMs += now - qStart; qStart = now; }

  function updateTimer() {
    if (sessionDeadline) {
      const left = (sessionDeadline - Date.now()) / 1000;
      timerEl.textContent = mmss(left);
      timerEl.className = 'timer-text' + (left > 60 ? ' calm' : '');
      if (left <= 0) { clearInterval(tick); toast('Time is up!'); finish(true); }
    } else if (s.mode === 'rapid') {
      // handled per question
    } else {
      const el = (Date.now() - Date.parse(s.startedAt)) / 1000;
      timerEl.textContent = mmss(el);
    }
  }
  tick = setInterval(updateTimer, 500);
  updateTimer();

  function exit() {
    confirmDialog('Leave this session?', 'Answers you have already given are saved. Unanswered questions are not counted.', { ok: 'Leave', danger: true }).then((ok) => { if (ok) finish(false); });
  }

  function onKey(e) {
    if (e.target && /INPUT|TEXTAREA|SELECT/.test(e.target.tagName)) return;
    const it = s.items[s.index];
    if (!it) return;
    const k = e.key.toUpperCase();
    const idx = '1234'.indexOf(k) >= 0 ? '1234'.indexOf(k) : 'ABCDE'.indexOf(k);
    if (idx >= 0 && idx < it.order.length && k.length === 1) { e.preventDefault(); choose(it.order[idx]); }
    else if (e.key === 'Enter' && nextBtnRef && !nextBtnRef.disabled) { e.preventDefault(); nextBtnRef.click(); }
  }
  document.addEventListener('keydown', onKey);
  let nextBtnRef = null;

  function choose(key) {
    const it = s.items[s.index];
    if (s.feedback === 'immediate') {
      if (it.recorded) return;
      it.selected = key;
      stopClock();
      record(s, it);
      if (it.result.isCorrect) { sound('correct'); } else { sound('wrong'); haptic([60, 40, 60]); }
      if (s.adaptive) {
        const resp = s.items.filter((x) => x.recorded).map((x) => ({ ...x.q.difficulty, correct: x.result.isCorrect }));
        s.adaptive.theta = eapEstimate(resp, { priorMean: s.adaptive.theta0 }).theta;
      }
      if (s.mode === 'rapid') { clearTimeout(qTimer); paint(); setTimeout(() => advance(), 750); return; }
      paint();
    } else {
      if (it.selected && it.selected !== key) it.changed = true;
      it.selected = key;
      paint();
    }
  }

  function advance() {
    if (s.feedback === 'end') stopClock();
    if (s.adaptive && s.items.length < s.adaptive.count && s.index === s.items.length - 1) {
      const next = selectAdaptive(s.pool, s.adaptive.theta, { exclude: new Set(s.items.map((i) => i.q.id)) });
      if (next) s.items.push(makeItem(next, s.shuffleOptions));
    }
    if (s.index < s.items.length - 1) { s.index++; qStart = performance.now(); paint(); }
    else finish(true);
  }

  function paint() {
    const it = s.items[s.index];
    const n = totalCount(s);
    counterEl.textContent = `Q ${s.index + 1} / ${n}`;
    bar.style.width = ((100 * (s.index + (it.recorded || it.selected ? 1 : 0))) / n).toFixed(1) + '%';
    const lm = labelMap(it.order);
    const reveal = s.feedback === 'immediate' && it.recorded;
    const opts = it.order.map((k) => {
      let cls = 'option';
      if (reveal) cls += k === it.q.answer ? ' correct' : k === it.selected ? ' wrong' : ' dim';
      else if (it.selected === k) cls += ' selected';
      return h('button', { class: cls, type: 'button', disabled: reveal, 'aria-pressed': String(it.selected === k), onclick: () => choose(k) },
        h('span', { class: 'option-label' }, lm[k]), mathText('span', 'option-text', it.q.options[k]));
    });
    const bookmarked = !!(app.user.bookmarks || []).find((b) => b.questionId === it.q.id);
    const tools = h('div', { class: 'q-tools' },
      h('span', { class: 'badge', title: it.q._chapter.title }, it.q._chapter.id),
      h('button', { class: 'btn btn-ghost btn-sm', type: 'button', 'aria-pressed': String(bookmarked), onclick: () => bookmarkSheet(it.q.id, () => paint()) }, icon('bookmark'), bookmarked ? 'Bookmarked' : 'Bookmark'));
    const conf = !reveal && s.mode !== 'rapid' ? h('div', { class: 'confidence', role: 'group', 'aria-label': 'How sure are you?' }, h('span', { class: 'small muted' }, 'How sure?'),
      [[1, 'Guessing'], [2, 'Unsure'], [3, 'Sure']].map(([v, l]) => h('button', { class: 'chip', type: 'button', 'aria-pressed': String(it.confidence === v), onclick: () => { it.confidence = v; paint(); } }, l))) : null;

    const parts = [mathText('div', 'question-text', it.q.stem), h('div', { class: 'options-grid' }, opts), conf, tools];
    nextBtnRef = null;
    if (s.feedback === 'immediate') {
      if (reveal) {
        parts.push(h('div', { class: 'callout mt-3 ' + (it.result.isCorrect ? 'success' : 'danger'), role: 'status' }, it.result.isCorrect ? '✅ Correct!' : '❌ Not quite — see why below.'));
        if (s.mode !== 'rapid') {
          parts.push(whyPanel(it.q, { selected: it.selected, order: it.order, errorType: it.result.errorType, isCorrect: it.result.isCorrect, compact: it.result.isCorrect }));
          if (!it.result.isCorrect) {
            parts.push(h('div', { class: 'row-wrap mt-3' },
              h('button', { class: 'btn btn-sm', onclick: () => noteSheet(it.q.id) }, icon('note'), 'Add note'),
              h('button', { class: 'btn btn-sm', onclick: async () => { if (await retrySimilar(s, it)) { toast('A similar question was added next.'); paint(); } } }, icon('refresh'), 'Retry a similar question')));
          }
          nextBtnRef = h('button', { class: 'btn btn-primary btn-block mt-4', onclick: advance }, s.index < totalCount(s) - 1 ? t('common.next') + ' →' : 'Finish');
          parts.push(nextBtnRef);
        }
      } else if (s.mode !== 'rapid') {
        parts.push(h('button', { class: 'btn btn-ghost btn-block mt-3', onclick: () => { it.selected = null; stopClock(); record(s, it); paint(); } }, "I don't know — show me"));
      }
    } else {
      const prev = h('button', { class: 'btn', disabled: s.index === 0, onclick: () => { stopClock(); s.index--; paint(); } }, '← ' + t('common.previous'));
      nextBtnRef = h('button', { class: 'btn btn-primary', disabled: s.index === s.items.length - 1, onclick: () => { stopClock(); s.index++; paint(); } }, t('common.next') + ' →');
      const palette = h('div', { class: 'palette', 'aria-label': 'Question palette' }, s.items.map((x, i) => h('button', { class: (x.selected ? 'answered' : '') + (i === s.index ? ' current' : ''), 'aria-label': `Question ${i + 1}${x.selected ? ', answered' : ''}`, onclick: () => { stopClock(); s.index = i; paint(); } }, String(i + 1))));
      parts.push(h('div', { class: 'nav-grid' }, prev, nextBtnRef), palette,
        h('button', { class: 'btn btn-danger btn-block mt-6', onclick: submitTest }, 'Submit Examination'));
    }
    if (s.mode === 'rapid') {
      const left = s.perQuestionSec;
      const clock = h('div', { class: 'rapid-clock', role: 'timer', 'aria-live': 'polite' }, String(left));
      parts.unshift(clock);
      clearTimeout(qTimer);
      if (!reveal) {
        const startAt = Date.now();
        const step = () => {
          const remain = Math.max(0, left - Math.floor((Date.now() - startAt) / 1000));
          clock.textContent = String(remain);
          clock.classList.toggle('low', remain <= 10);
          timerEl.textContent = mmss(remain);
          if (remain <= 0) { it.selected = null; stopClock(); record(s, it); haptic(200); paint(); setTimeout(advance, 600); return; }
          if (remain <= 5) sound('tick');
          qTimer = setTimeout(step, 250);
        };
        step();
      }
    }
    mount(body, parts);
  }

  async function submitTest() {
    stopClock();
    const unanswered = s.items.filter((x) => !x.selected).length;
    if (unanswered) {
      const ok = await confirmDialog('Submit examination?', `${unanswered} question(s) are unanswered and will count as skipped.`, { ok: 'Submit' });
      if (!ok) return;
    }
    finish(true);
  }

  async function finish(complete) {
    if (s.finished) return;
    s.finished = true;
    clearInterval(tick);
    clearTimeout(qTimer);
    if (s.feedback === 'end') {
      stopClock();
      for (const it of s.items) if (complete || it.selected) record(s, it);
    }
    const done = s.items.filter((x) => x.recorded);
    const qIndex = new Map(done.map((x) => [x.q.id, x.q]));
    finalizeSession(app.user, { sessionId: s.id, mode: s.mode, startedAt: s.startedAt, scope: s.scope }, { config: app.config, questionIndex: qIndex });
    app.user.meta.sessionsSinceAd = (app.user.meta.sessionsSinceAd || 0) + 1;
    await saveUserNow();
    const marks = app.config.practice?.marks || { correct: 1, wrong: -0.2 };
    const correct = done.filter((x) => x.result.isCorrect).length;
    const wrong = done.filter((x) => !x.result.isCorrect && x.selected).length;
    app.lastResult = {
      sessionId: s.id, mode: s.mode, title: s.title, scope: s.scope, plan: s.plan,
      items: done.map((x, i) => ({ q: x.q, order: x.order, selected: x.selected, isCorrect: x.result.isCorrect, errorType: x.result.errorType, timeMs: x.timeMs, index: i })),
      correct, wrong, skipped: done.length - correct - wrong, total: done.length,
      score: s.mode === 'test' ? correct * marks.correct + wrong * marks.wrong : correct,
      negative: s.mode === 'test', durationMs: Date.now() - Date.parse(s.startedAt),
    };
    app.session = null;
    go('/results', { replace: true });
  }

  paint();
  return () => {
    clearInterval(tick);
    clearTimeout(qTimer);
    document.removeEventListener('keydown', onKey);
    document.body.classList.remove('immersive');
  };
}

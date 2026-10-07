/**
 * Feature 7 — Memory Strength Map: every chapter coloured 🟢🟡🟠🔴, filters by status and
 * subject, tap → chapter sheet with forgetting curve and targeted practice.
 * @module features/memoryMap
 */
import { h, mount, pct, relDay } from '../ui/dom.js';
import { icon } from '../ui/icons.js';
import { sheet, toast } from '../ui/overlay.js';
import { forgettingCurve } from '../ui/charts.js';
import { app, subjectName, activeSubjectIds } from '../state.js';
import { chapterStats, conceptStats } from './insights.js';
import { STATUS, fuzzyMemberships } from '../engine/memoryMap.js';
import { curvePoints } from '../engine/forgettingRisk.js';
import { questionsOfChapters } from './qsource.js';
import { pickTargeted } from './studyNow.js';
import { startSession } from './session.js';
import { t } from '../i18n.js';

/**
 * Bottom sheet with chapter details + "Start targeted practice".
 * @param {string} chapterId
 */
export function chapterSheet(chapterId) {
  const ch = app.catalog.chapterById.get(chapterId);
  if (!ch) return;
  const s = chapterStats(app.user).get(chapterId);
  const concepts = conceptStats(app.user, chapterId).filter((c) => c.score < 0.7).slice(0, 4);
  const lastMistakes = (app.user.mistakeBook || []).filter((m) => m.chapterId === chapterId).sort((a, b) => b.date.localeCompare(a.date)).slice(0, 3);
  const nowDays = s?.lastReview ? (Date.now() - Date.parse(s.lastReview)) / 86400000 : -1;
  const root = s?.rootCause && s.rootCause !== chapterId ? app.catalog.chapterById.get(s.rootCause) : null;
  const fm = s?.health !== null && s?.health !== undefined ? fuzzyMemberships(s.health) : null;
  const close = sheet(`${ch.id} · ${ch.title}`, [
    h('p', { class: 'muted small' }, `${ch.subjectName} · ${ch.categoryLabel}`),
    s && s.health !== null ? h('div', { class: 'stats-grid' },
      h('div', { class: 'stat-box' }, 'Memory', h('strong', { class: 'text-primary' }, pct(s.health))),
      h('div', { class: 'stat-box' }, 'Accuracy', h('strong', null, pct(s.attempts ? s.correct / s.attempts : null))),
      h('div', { class: 'stat-box' }, 'Answered', h('strong', null, String(s.attempts)))) : h('p', null, ch.questionCount ? 'You have not practised this chapter yet.' : 'No questions yet for this chapter.'),
    s && s.health !== null ? h('p', null, h('span', { class: 'badge ' + s.status }, STATUS[s.status].emoji + ' ' + STATUS[s.status].label), ` · forgetting risk ${pct(s.risk)} · next review ${relDay(s.nextReview)}`) : null,
    app.user.settings.proView && fm ? h('p', { class: 'small muted' }, `Memberships: mastered ${pct(fm.mastered)}, revision ${pct(fm.revision)}, weak ${pct(fm.weak)}, critical ${pct(fm.critical)}`) : null,
    s?.stability ? h('div', { class: 'mt-3' }, h('div', { class: 'section-label' }, 'Forgetting curve'), forgettingCurve(curvePoints(s.stability, Math.max(10, Math.ceil(s.stability * 3)), app.config.forgetting?.weibullK ?? 1), nowDays)) : null,
    root ? h('div', { class: 'callout danger mt-3' }, `Root cause suspected: repeated mistakes here may come from the prerequisite “${root.title}” (${root.subjectName}). Practising it first should help.`) : null,
    concepts.length ? h('div', { class: 'mt-3' }, h('div', { class: 'section-label' }, 'Weak concepts'), h('div', { class: 'row-wrap mt-2' }, concepts.map((c) => h('span', { class: 'badge orange' }, `${c.concept} ${pct(c.score)}`)))) : null,
    lastMistakes.length ? h('div', { class: 'mt-3' }, h('div', { class: 'section-label' }, 'Last mistakes'), h('ul', { class: 'small', style: { paddingLeft: '1.2rem' } }, lastMistakes.map((m) => h('li', null, `${m.questionId} — ${m.errorType} (${relDay(m.date)})`)))) : null,
    h('div', { class: 'grid-2 mt-4' },
      h('a', { class: 'btn', href: `#/graph/${ch.subjectId}`, onclick: () => close() }, icon('graph'), 'Graph'),
      h('button', { class: 'btn btn-primary', disabled: !ch.questionCount, onclick: async () => {
        const ids = root ? [root.id, chapterId].filter((id) => app.catalog.chapterById.get(id)?.questionCount) : [chapterId];
        const pool = await questionsOfChapters(ids);
        if (!pool.length) { toast('No questions yet.'); return; }
        close();
        startSession({ mode: 'practice', title: 'Targeted: ' + ch.title, questions: pickTargeted(pool, Math.min(10, pool.length)), pool, scope: { category: ch.category, subjectId: ch.subjectId, chapterIds: ids } });
      } }, icon('target'), 'Start targeted practice')),
  ]);
}

/** @param {HTMLElement} view @param {object} _p @param {URLSearchParams} query */
export function renderMemoryMap(view, _p, query) {
  const subs = activeSubjectIds();
  let subject = query.get('subject') || 'all';
  let status = 'all';
  const cs = chapterStats(app.user);
  const out = h('div');
  const subjSel = h('select', { class: 'input-full', 'aria-label': 'Subject', onchange: () => { subject = subjSel.value; paint(); } }, h('option', { value: 'all' }, 'All active subjects'), subs.map((s) => h('option', { value: s, selected: s === subject }, subjectName(s))));
  const chips = h('div', { class: 'row-wrap mt-3' });
  const paintChips = () => mount(chips, [['all', 'All'], ['green', '🟢 Mastered'], ['yellow', '🟡 Revision'], ['orange', '🟠 Weak'], ['red', '🔴 Critical'], ['none', '⚪ Not started']].map(([k, l]) => h('button', { class: 'chip', 'aria-pressed': String(status === k), onclick: () => { status = k; paintChips(); paint(); } }, l)));
  function paint() {
    const ids = subject === 'all' ? subs : [subject];
    mount(out, ids.map((sid) => {
      const sub = app.catalog.subjectById.get(sid);
      const cells = sub.chapters.filter((c) => c.questionCount > 0 || status === 'all').map((c) => ({ c, s: cs.get(c.id) })).filter(({ s }) => status === 'all' || (s?.status || 'none') === status);
      if (!cells.length) return null;
      return h('section', { class: 'card' }, h('h2', null, sub.name), h('div', { class: 'memory-grid' }, cells.map(({ c, s }) => h('button', { class: 'memory-cell ' + (c.questionCount ? (s?.status || 'none') : 'none'), onclick: () => chapterSheet(c.id), 'aria-label': `${c.title}: ${s && s.status !== 'none' ? STATUS[s.status].label + ' ' + pct(s.health) : c.questionCount ? 'not started' : 'no questions yet'}` },
        h('span', { class: 'chapter-num' }, String(c.number)), h('span', { class: 'grow small' }, c.title), h('strong', { class: 'small' }, s && s.health !== null ? pct(s.health) : c.questionCount ? '—' : 'n/a')))));
    }).filter(Boolean));
    if (!out.childNodes.length) mount(out, h('section', { class: 'card' }, h('p', { class: 'muted' }, 'No chapters in this filter.')));
  }
  paintChips();
  paint();
  mount(view, h('h1', null, t('home.memoryMap')), h('section', { class: 'card' }, h('p', { class: 'muted small' }, 'Memory health combines how recently you reviewed (forgetting curve) with how well you know the chapter (Bayesian knowledge tracing). Tap any chapter for details.'), subjSel, chips), out);
}

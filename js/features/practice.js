/**
 * Feature 2 — Practice picker that scales to 3 categories / 30 subjects / 450 chapters:
 * category tabs → searchable subject grid → chapter list (15 rows) with multi-select,
 * difficulty, count and timing; plus per-chapter / per-subject offline download.
 * @module features/practice
 */
import { h, mount, debounce, pct } from '../ui/dom.js';
import { icon } from '../ui/icons.js';
import { toast, sheet } from '../ui/overlay.js';
import { app, saveUser } from '../state.js';
import { go } from '../router.js';
import { loadChapters, downloadForOffline } from '../bank/chapterLoader.js';
import { startSession } from './session.js';
import { chapterStats } from './insights.js';
import { shuffle } from '../engine/stats.js';
import { STATUS } from '../engine/memoryMap.js';
import { t } from '../i18n.js';
import * as db from '../storage/db.js';

/** Status badge for a chapter. */
export function statusBadge(st) {
  if (!st || st.status === 'none' || st.health === null) return h('span', { class: 'badge none' }, 'Not started');
  const s = STATUS[st.status];
  return h('span', { class: 'badge ' + st.status, title: s.label }, `${s.emoji} ${pct(st.health)}`);
}

/**
 * Practice landing: category tabs + subject grid + global chapter search.
 * @param {HTMLElement} view @param {object} _p @param {URLSearchParams} query
 */
export async function renderPractice(view, _p, query) {
  const cats = app.catalog.categories;
  const firstActive = (app.user.profile.activeSubjects || []).map((id) => app.catalog.subjectById.get(id)).find((s) => s && s.chapters.some((c) => c.questionCount));
  let cat = query.get('cat') || (await db.get('meta', 'lastCategory')) || firstActive?.category || cats[0].id;
  if (!cats.find((c) => c.id === cat)) cat = cats[0].id;
  const grid = h('div', { class: 'subject-grid', id: 'subject-grid' });
  const results = h('div', { class: 'chapter-list mt-3', 'aria-live': 'polite' });
  const search = h('input', { class: 'input-full', type: 'search', placeholder: t('practice.searchAll'), 'aria-label': t('practice.searchAll') });
  const tabs = h('div', { class: 'tabs', role: 'tablist', 'aria-label': 'Categories' });

  const paintTabs = () => mount(tabs, cats.map((c) => h('button', { class: 'tab', role: 'tab', 'aria-selected': String(c.id === cat), onclick: () => { cat = c.id; db.set('meta', 'lastCategory', cat); paintTabs(); paintGrid(); } }, c.label)));
  const paintGrid = () => {
    const c = cats.find((x) => x.id === cat);
    mount(grid, c.subjects.map((s) => {
      const n = s.chapters.reduce((a, ch) => a + (ch.questionCount || 0), 0);
      return h('a', { class: 'subject-card', href: `#/practice/subject/${encodeURIComponent(s.id)}` },
        h('span', { class: 'subject-code' }, s.id.replace('_', ' ')),
        h('span', { class: 'grow' }, h('span', { class: 'tile-title', style: { display: 'block' } }, s.name),
          h('span', { class: 'meta small muted' }, `${s.chapters.length} chapters · ${n ? n + ' questions' : 'No questions yet'}`),
          s.flags?.includes('needsReview') ? h('span', { class: 'badge orange', style: { marginLeft: '.4rem' } }, 'Titles under review') : null),
        icon('chevron', { cls: 'chev' }));
    }));
  };
  const runSearch = debounce(() => {
    const q = search.value.trim().toLowerCase();
    if (q.length < 2) { mount(results); grid.hidden = false; return; }
    grid.hidden = true;
    const hits = [];
    for (const ch of app.catalog.chapters) {
      if (ch.title.toLowerCase().includes(q) || ch.id.toLowerCase().includes(q) || ch.subjectName.toLowerCase().includes(q)) hits.push(ch);
      if (hits.length >= 30) break;
    }
    mount(results, hits.length ? hits.map((ch) => h('a', { class: 'list-row' + (ch.questionCount ? '' : ' disabled'), href: `#/practice/subject/${ch.subjectId}?ch=${ch.id}` },
      h('span', { class: 'chapter-num' }, String(ch.number)),
      h('span', { class: 'grow' }, h('span', { style: { display: 'block' } }, ch.title), h('span', { class: 'meta' }, `${ch.subjectName} · ${ch.categoryLabel}${ch.questionCount ? '' : ' · No questions yet'}`)),
      icon('chevron', { cls: 'chev' }))) : h('p', { class: 'muted' }, 'No chapters match.'));
  });
  search.addEventListener('input', runSearch);
  paintTabs();
  paintGrid();
  mount(view,
    h('h1', null, t('practice.title')),
    h('div', { class: 'row-wrap mb-4' },
      h('a', { class: 'chip', href: '#/review' }, icon('clock', { size: 18 }), t('home.review')),
      h('a', { class: 'chip', href: '#/mistakes' }, icon('note', { size: 18 }), t('home.mistakes')),
      h('a', { class: 'chip', href: '#/bookmarks' }, icon('bookmark', { size: 18 }), t('home.bookmarks')),
      h('a', { class: 'chip', href: '#/rapid' }, icon('bolt', { size: 18 }), t('home.rapid')),
      h('a', { class: 'chip', href: '#/study-now' }, icon('target', { size: 18 }), t('home.studyNow'))),
    h('section', { class: 'card' },
      tabs,
      h('div', { class: 'search mt-3' }, icon('search'), search),
      results,
      h('div', { class: 'mt-4' }, grid)));
}

/**
 * Subject page: chapter list with multi-select and session settings.
 * @param {HTMLElement} view @param {{id:string}} params @param {URLSearchParams} query
 */
export async function renderSubject(view, params, query) {
  const sub = app.catalog.subjectById.get(params.id);
  if (!sub) { go('/practice', { replace: true }); return; }
  const cs = chapterStats(app.user);
  const selected = new Set(query.get('ch') ? [query.get('ch')] : []);
  const settings = Object.assign({ mode: 'practice', difficulty: 'adaptive', count: app.config.practice?.defaultCount || 10, timed: false }, (await db.get('meta', 'practiceSettings')) || {});
  const list = h('div', { class: 'chapter-list' });
  const filter = h('input', { class: 'input-full', type: 'search', placeholder: t('practice.searchChapters'), 'aria-label': t('practice.searchChapters') });
  const startBtn = h('button', { class: 'btn btn-primary btn-block' });
  const countLabel = h('span', { class: 'small muted' });
  const available = sub.chapters.filter((c) => c.questionCount > 0);

  const paintStart = () => {
    const nQ = sub.chapters.filter((c) => selected.has(c.id)).reduce((a, c) => a + c.questionCount, 0);
    startBtn.disabled = selected.size === 0;
    startBtn.textContent = selected.size ? `${t('practice.start')} · ${selected.size} chapter${selected.size > 1 ? 's' : ''}` : t('practice.selectChapters');
    countLabel.textContent = selected.size ? `${nQ} questions available` : '';
  };
  const paintList = () => {
    const q = filter.value.trim().toLowerCase();
    mount(list, sub.chapters.filter((c) => !q || c.title.toLowerCase().includes(q) || String(c.number) === q).map((c) => {
      const has = c.questionCount > 0;
      const cb = h('input', { type: 'checkbox', checked: selected.has(c.id), disabled: !has, 'aria-label': 'Select ' + c.title, onchange: () => { if (cb.checked) selected.add(c.id); else selected.delete(c.id); paintStart(); } });
      return h('label', { class: 'list-row' + (has ? '' : ' disabled') }, cb,
        h('span', { class: 'chapter-num' }, String(c.number)),
        h('span', { class: 'grow' }, h('span', { style: { display: 'block' } }, c.title), h('span', { class: 'meta row-wrap', style: { alignItems: 'center', marginTop: '.2rem' } }, has ? `${c.questionCount} questions` : 'No questions yet', has ? statusBadge(cs.get(c.id)) : null)),
        has ? h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Download ' + c.title + ' for offline', title: 'Download for offline', onclick: (e) => { e.preventDefault(); offline([c]); } }, icon('download')) : null);
    }));
  };
  filter.addEventListener('input', paintList);

  async function offline(chs) {
    const prog = h('div', { class: 'progress mt-3' }, h('span', { style: { width: '0%' } }));
    const label = h('p', { class: 'small muted' }, 'Downloading…');
    const close = sheet('Download for offline', [label, prog]);
    const r = await downloadForOffline(chs, (d, n) => { prog.firstChild.style.width = (100 * d) / n + '%'; label.textContent = `Downloading ${d} / ${n}`; });
    close();
    toast(r.failed ? `${r.ok} saved, ${r.failed} failed (offline?).` : `${r.ok} chapter${r.ok > 1 ? 's' : ''} available offline.`);
  }

  const seg = (key, opts) => {
    const g = h('div', { class: 'seg', role: 'group' });
    const paint = () => mount(g, opts.map(([v, l]) => h('button', { type: 'button', 'aria-pressed': String(settings[key] === v), onclick: () => { settings[key] = v; paint(); } }, l)));
    paint();
    return g;
  };
  const countInput = h('input', { class: 'input-full', type: 'number', min: 1, max: app.config.practice?.maxCount || 100, value: settings.count, 'aria-label': 'Number of questions', oninput: () => { settings.count = Math.max(1, Math.min(app.config.practice?.maxCount || 100, parseInt(countInput.value, 10) || 10)); } });
  const timedCb = h('input', { type: 'checkbox', checked: settings.timed, onchange: () => { settings.timed = timedCb.checked; } });

  startBtn.addEventListener('click', async () => {
    const chs = sub.chapters.filter((c) => selected.has(c.id));
    db.set('meta', 'practiceSettings', settings);
    startBtn.disabled = true;
    startBtn.textContent = 'Loading questions…';
    const { questions, failed, dropped } = await loadChapters(chs);
    if (failed.length) toast(`${failed.length} chapter(s) could not be loaded offline.`);
    if (dropped) toast(`${dropped} invalid question(s) were skipped.`);
    paintStart();
    if (!questions.length) { toast('No questions available.'); return; }
    const count = Math.min(settings.count, questions.length);
    const scope = { category: sub.category, subjectId: sub.id, chapterIds: chs.map((c) => c.id) };
    const title = chs.length === 1 ? `${sub.name} · Ch ${chs[0].number}: ${chs[0].title}` : `${sub.name} · ${chs.length} chapters`;
    const timing = settings.timed ? { timed: true, totalSec: count * (app.config.practice?.secondsPerQuestionTimed || 72) } : {};
    if (settings.difficulty === 'adaptive' && settings.mode === 'practice') {
      startSession({ mode: 'practice', title, pool: questions, questions: [], adaptive: true, count, scope, ...timing });
      return;
    }
    const band = { easy: (b) => b < -0.5, medium: (b) => b >= -0.5 && b <= 0.5, hard: (b) => b > 0.5 }[settings.difficulty];
    let pool = band ? questions.filter((q) => band(q.difficulty.b)) : questions;
    if (pool.length < count) {
      if (band) toast(`Only ${pool.length} ${settings.difficulty} question(s); topping up with others.`);
      pool = [...shuffle(pool), ...shuffle(questions.filter((q) => !pool.includes(q)))];
    } else pool = shuffle(pool);
    startSession({ mode: settings.mode, title, questions: pool.slice(0, count), pool: questions, scope, feedback: settings.mode === 'test' ? 'end' : 'immediate', ...(settings.mode === 'test' ? { timed: true, totalSec: count * (app.config.practice?.secondsPerQuestionTimed || 72) } : timing) });
  });

  paintList();
  paintStart();
  mount(view,
    h('div', { class: 'row mb-3' }, h('a', { class: 'icon-btn', href: '#/practice', 'aria-label': 'Back to subjects' }, icon('back')),
      h('div', { class: 'grow' }, h('span', { class: 'subject-label' }, sub.categoryLabel), h('h1', { class: 'mt-0', style: { marginBottom: 0 } }, sub.name))),
    sub.flags?.includes('needsReview') ? h('div', { class: 'callout warn mb-4' }, 'The chapter titles of this subject are under review by the owner (they currently mirror Teaching Aptitude).') : null,
    h('section', { class: 'card' },
      h('div', { class: 'card-title' }, h('h2', null, 'Chapters'),
        h('div', { class: 'row-wrap' },
          h('button', { class: 'btn btn-sm', disabled: !available.length, onclick: () => { const all = available.every((c) => selected.has(c.id)); available.forEach((c) => (all ? selected.delete(c.id) : selected.add(c.id))); paintList(); paintStart(); } }, t('practice.selectAll')),
          h('a', { class: 'btn btn-sm', href: `#/graph/${sub.id}` }, icon('graph'), 'Graph'),
          h('button', { class: 'btn btn-sm', disabled: !available.length, onclick: () => offline(available) }, icon('download'), 'Offline'))),
      h('div', { class: 'search mb-3' }, icon('search'), filter),
      list),
    h('section', { class: 'card' },
      h('h2', null, 'Session settings'),
      h('div', { class: 'form-grid' },
        h('div', null, h('div', { class: 'section-label mb-2' }, 'Mode'), seg('mode', [['practice', 'Practice'], ['test', 'Timed test']]), h('p', { class: 'hint' }, 'Practice shows the explanation after every answer. Timed test works like the exam: review at the end, negative marking.')),
        h('div', null, h('div', { class: 'section-label mb-2' }, t('practice.difficulty')), seg('difficulty', [['adaptive', 'Adaptive'], ['easy', 'Easy'], ['medium', 'Medium'], ['hard', 'Hard']]), h('p', { class: 'hint' }, 'Adaptive picks questions you have a 70–80 % chance of answering — the sweet spot for learning.')),
        h('label', { class: 'field' }, h('span', null, t('practice.count')), countInput),
        h('label', { class: 'switch' }, h('span', null, t('practice.timed')), timedCb))),
    h('div', { class: 'sticky-actions' }, countLabel, startBtn));
  saveUser();
}

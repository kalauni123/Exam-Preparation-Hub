/**
 * Session results: score summary, per-chapter breakdown, full review with explanations,
 * and continuation of a "Study now" plan.
 * @module features/results
 */
import { h, mount, mmss, pct } from '../ui/dom.js';
import { icon } from '../ui/icons.js';
import { app } from '../state.js';
import { go } from '../router.js';
import { reviewItem } from './whyWrong.js';
import { startSession, noteSheet, bookmarkSheet } from './session.js';
import { adSlot, maybeInterstitial } from '../ads/adManager.js';
import { runPlanBlock } from './studyNow.js';

/** @param {HTMLElement} view */
export function renderResults(view) {
  const r = app.lastResult;
  if (!r) { go('/home', { replace: true }); return; }
  const acc = r.total ? r.correct / r.total : 0;
  const byCh = {};
  for (const it of r.items) {
    const k = it.q._chapter.id;
    byCh[k] = byCh[k] || { title: it.q._chapter.title, c: 0, n: 0 };
    byCh[k].n++;
    if (it.isCorrect) byCh[k].c++;
  }
  const wrongItems = r.items.filter((i) => !i.isCorrect);
  const filter = { mode: 'all' };
  const list = h('div');
  const paintList = () => {
    const items = filter.mode === 'wrong' ? wrongItems : r.items;
    mount(list, items.length ? items.map((it) => reviewItem(it.q, it, [
      h('button', { class: 'btn btn-sm', onclick: () => noteSheet(it.q.id) }, icon('note'), 'Note'),
      h('button', { class: 'btn btn-sm', onclick: () => bookmarkSheet(it.q.id) }, icon('bookmark'), 'Bookmark'),
    ])) : h('p', { class: 'muted mt-4' }, 'Nothing to show — perfect score!'));
  };
  const seg = h('div', { class: 'seg', role: 'group', 'aria-label': 'Review filter' },
    ...[['all', 'All'], ['wrong', 'Wrong only']].map(([k, l]) => {
      const b = h('button', { 'aria-pressed': String(filter.mode === k), onclick: () => { filter.mode = k; seg.querySelectorAll('button').forEach((x) => x.setAttribute('aria-pressed', String(x === b))); paintList(); } }, l);
      return b;
    }));
  paintList();

  const nextBlock = r.plan && r.plan.length ? r.plan[0] : null;
  mount(view,
    h('section', { class: 'card' },
      h('h1', null, r.mode === 'test' ? 'Examination Complete' : 'Session Complete'),
      h('p', { class: 'muted' }, r.title),
      h('div', { class: 'stats-grid' },
        h('div', { class: 'stat-box' }, r.negative ? 'Final Score' : 'Score', h('strong', { class: 'text-primary' }, r.negative ? r.score.toFixed(2) : `${r.correct}/${r.total}`)),
        h('div', { class: 'stat-box' }, 'Accuracy', h('strong', null, pct(acc))),
        h('div', { class: 'stat-box' }, 'Correct', h('strong', { class: 'text-success' }, String(r.correct)))),
      h('p', { class: 'small muted center' }, `Time ${mmss(r.durationMs / 1000)} · Wrong ${r.wrong} · Skipped ${r.skipped}` + (r.negative ? ` · Marking +${app.config.practice.marks.correct} / ${app.config.practice.marks.wrong}` : '')),
      nextBlock ? h('div', { class: 'callout mt-4' }, h('strong', null, 'Next in your plan: '), nextBlock.label, h('button', { class: 'btn btn-primary btn-block mt-3', onclick: () => runPlanBlock(nextBlock, r.plan.slice(1)) }, icon('play'), `Start (${nextBlock.minutes} min)`)) : null,
      h('div', { class: 'grid-2 mt-4' },
        wrongItems.length ? h('button', { class: 'btn', onclick: () => startSession({ mode: 'review', title: 'Retry wrong answers', questions: wrongItems.map((i) => i.q), scope: r.scope }) }, icon('refresh'), 'Retry wrong') : h('a', { class: 'btn', href: '#/practice' }, icon('practice'), 'Practise more'),
        h('a', { class: 'btn btn-primary', href: '#/home' }, 'Return to Dashboard'))),
    h('section', { class: 'card' },
      h('h2', null, 'By chapter'),
      h('div', { class: 'stack-sm' }, Object.entries(byCh).map(([id, v]) => h('div', null,
        h('div', { class: 'row between small' }, h('span', { class: 'ellipsis' }, `${id} · ${v.title}`), h('strong', null, `${v.c}/${v.n}`)),
        h('div', { class: 'progress ' + (v.c / v.n >= 0.85 ? 'green' : v.c / v.n >= 0.6 ? 'yellow' : v.c / v.n >= 0.4 ? 'orange' : 'red') }, h('span', { style: { width: (100 * v.c) / v.n + '%' } })))))),
    adSlot('results'),
    h('section', { class: 'card' },
      h('div', { class: 'card-title' }, h('h2', null, 'Review'), seg),
      list));
  maybeInterstitial('session-end');
}

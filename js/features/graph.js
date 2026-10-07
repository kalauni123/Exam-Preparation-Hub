/**
 * Section 7.5 — Knowledge Graph per subject: its 15 chapters as nodes plus ghosted
 * prerequisite chapters from other subjects. Colour = memory status, size = importance,
 * edges = prerequisites; the suspected root weakness is outlined in red.
 * @module features/graph
 */
import { h, mount } from '../ui/dom.js';
import { icon } from '../ui/icons.js';
import { dagGraph } from '../ui/charts.js';
import { app, chapterImportance } from '../state.js';
import { go } from '../router.js';
import { chapterStats } from './insights.js';
import { chapterSheet } from './memoryMap.js';

/** @param {HTMLElement} view @param {{id:string}} params */
export function renderGraph(view, params) {
  const sub = app.catalog.subjectById.get(params.id);
  if (!sub) { go('/practice', { replace: true }); return; }
  const cs = chapterStats(app.user);
  const own = new Set(sub.chapters.map((c) => c.id));
  const edges = app.prereq.edges.filter((e) => own.has(e.to) || own.has(e.from));
  const ghostIds = new Set(edges.flatMap((e) => [e.from, e.to]).filter((id) => !own.has(id) && edges.some((x) => x.from === id && own.has(x.to))));
  const roots = new Set([...own].map((id) => cs.get(id)?.rootCause).filter(Boolean));
  const failing = new Set([...own].filter((id) => cs.get(id)?.rootCause));
  const nodes = [
    ...sub.chapters.map((c) => ({ id: c.id, label: String(c.number), status: cs.get(c.id)?.status || 'none', size: chapterImportance(c.id), root: roots.has(c.id), title: `Chapter ${c.number}: ${c.title}` })),
    ...[...ghostIds].map((id) => { const c = app.catalog.chapterById.get(id); return { id, label: id, status: cs.get(id)?.status || 'none', size: 0.3, ghost: true, root: roots.has(id), title: `Prerequisite from ${c.subjectName}: ${c.title}` }; }),
  ];
  const usedEdges = edges.filter((e) => (own.has(e.from) || ghostIds.has(e.from)) && own.has(e.to)).map((e) => ({ ...e, hot: roots.has(e.from) && failing.has(e.to) }));
  const svg = dagGraph(nodes, usedEdges, (id) => chapterSheet(id));
  const otherSubs = app.catalog.categories.find((c) => c.id === sub.category).subjects;
  const sel = h('select', { class: 'input-full', 'aria-label': 'Subject', onchange: () => go('/graph/' + sel.value) }, otherSubs.map((s) => h('option', { value: s.id, selected: s.id === sub.id }, s.name)));
  const rootList = [...roots].map((id) => app.catalog.chapterById.get(id)).filter(Boolean);
  mount(view,
    h('h1', null, 'Knowledge graph'),
    h('section', { class: 'card' }, sel,
      h('p', { class: 'muted small mt-3' }, 'Arrows point from a prerequisite to the chapter that needs it. Tap a node for mastery, weak concepts, last mistakes and targeted practice. Prerequisites from other subjects appear faded.'),
      usedEdges.length ? null : h('p', { class: 'callout mt-3' }, 'No prerequisite links are defined for this subject yet (edit data/prerequisites.json). Nodes are still shown by chapter.'),
      h('div', { class: 'kg-wrap mt-3' }, svg),
      h('div', { class: 'legend' }, ['green', 'yellow', 'orange', 'red', 'none'].map((k) => h('span', null, h('i', { class: 'dot ' + k }), { green: 'Mastered', yellow: 'Revision', orange: 'Weak', red: 'Critical', none: 'Not started' }[k])), h('span', null, h('i', { class: 'dot', style: { background: 'transparent', border: '3px solid var(--danger)' } }), 'Root cause')),
      rootList.length ? h('div', { class: 'callout danger mt-3' }, h('strong', null, 'Root weakness detected: '), rootList.map((c) => `${c.title} (${c.subjectName})`).join(', '), '. When a chapter keeps failing, NeuroMCQ lowers its prerequisites’ knowledge estimates and points to the weakest one upstream.') : null,
      app.prereq.ok ? null : h('div', { class: 'callout danger mt-3' }, app.prereq.message),
      h('a', { class: 'btn btn-block mt-4', href: `#/practice/subject/${sub.id}` }, icon('practice'), 'Practise this subject')));
}

/**
 * Feature 11 — Question Analytics: attempts, % correct, most-picked wrong option, average
 * time and discrimination for each question (cohort = profiles on this device + imports).
 * @module features/questionAnalytics
 */
import { h, mount, pct } from '../ui/dom.js';
import { icon } from '../ui/icons.js';
import { sheet, toast, skeleton } from '../ui/overlay.js';
import { app, subjectName } from '../state.js';
import { loadCohort, importCohortFiles, clearCohort, responsesByQuestion } from './cohort.js';
import { cttItem, MIN_N } from '../engine/questionQuality.js';
import { questionsByIds } from './qsource.js';
import { chapterOfQuestion } from './insights.js';
import { mathText } from './whyWrong.js';

/** @param {HTMLElement} view */
export async function renderQA(view) {
  mount(view, h('h1', null, 'Question analytics'), skeleton(4));
  const { rows, users } = await loadCohort();
  const byQ = responsesByQuestion(rows);
  const ids = [...byQ.keys()];
  const subjects = [...new Set(ids.map((id) => app.catalog.chapterById.get(chapterOfQuestion(id))?.subjectId).filter(Boolean))];
  let subject = subjects[0] || '';
  const qmap = new Map((await questionsByIds(ids.slice(0, 3000))).map((q) => [q.id, q]));
  const out = h('div');
  const fileIn = h('input', { type: 'file', multiple: true, accept: '.json', class: 'hidden', onchange: async () => { const n = await importCohortFiles(fileIn.files); toast(`${n} learner file(s) added to the cohort.`); renderQA(view); } });
  const sel = h('select', { class: 'input-full', 'aria-label': 'Subject', onchange: () => { subject = sel.value; paint(); } }, subjects.map((s) => h('option', { value: s }, subjectName(s))));

  function paint() {
    const list = ids.filter((id) => app.catalog.chapterById.get(chapterOfQuestion(id))?.subjectId === subject && qmap.has(id))
      .map((id) => ({ id, q: qmap.get(id), stats: cttItem(qmap.get(id), byQ.get(id)), avg: byQ.get(id).reduce((s, r) => s + r.timeMs, 0) / byQ.get(id).length / 1000 }))
      .sort((a, b) => b.stats.n - a.stats.n);
    mount(out, list.length ? h('div', { class: 'table-wrap' }, h('table', { class: 'data' },
      h('thead', null, h('tr', null, ['Question', 'n', '% correct', 'Top wrong', 'Avg time', 'Discrim.'].map((x) => h('th', null, x)))),
      h('tbody', null, list.map((r) => h('tr', { style: { cursor: 'pointer' }, tabindex: 0, onclick: () => detail(r), onkeydown: (e) => { if (e.key === 'Enter') detail(r); } },
        h('td', null, r.id), h('td', null, String(r.stats.n)), h('td', null, pct(r.stats.p)), h('td', null, r.stats.mostPickedWrong || '—'),
        h('td', null, r.avg.toFixed(0) + ' s'), h('td', null, r.stats.discrimination === null ? `n<${MIN_N}` : r.stats.discrimination.toFixed(2))))))) : h('p', { class: 'muted' }, 'No responses recorded for this subject yet.'));
  }
  function detail(r) {
    const keys = Object.keys(r.q.options);
    const n = r.stats.n || 1;
    sheet(r.id, [
      mathText('p', 'break', r.q.stem),
      h('div', { class: 'mt-3' }, keys.map((k) => h('div', { class: 'dist-bar' }, h('strong', { class: k === r.q.answer ? 'text-success' : '' }, k), h('div', { class: 'progress ' + (k === r.q.answer ? 'green' : 'red') }, h('span', { style: { width: (100 * r.stats.counts[k]) / n + '%' } })), h('span', null, pct(r.stats.counts[k] / n))))),
      h('p', { class: 'small muted mt-3' }, `Difficulty p = ${r.stats.p.toFixed(2)} · discrimination ${r.stats.discrimination === null ? 'insufficient data (needs ' + MIN_N + ' responses)' : r.stats.discrimination.toFixed(2)} · non-functioning distractors: ${r.stats.nonFunctioning.join(', ') || 'none'}`),
      r.stats.flags.length ? h('div', { class: 'row-wrap mt-2' }, r.stats.flags.map((f) => h('span', { class: 'badge orange' }, f))) : null,
    ]);
  }
  paint();
  mount(view,
    h('h1', null, 'Question analytics'),
    h('section', { class: 'card' },
      h('p', { class: 'small muted' }, `Cohort: ${users} learner${users === 1 ? '' : 's'} on this device or imported · ${rows.length} responses. Statistics need at least ${MIN_N} responses per question to be reliable.`),
      fileIn,
      h('div', { class: 'grid-2' }, h('button', { class: 'btn', onclick: () => fileIn.click() }, icon('upload'), 'Import learner files'), h('button', { class: 'btn', onclick: async () => { await clearCohort(); renderQA(view); } }, icon('trash'), 'Clear imports')),
      subjects.length ? h('div', { class: 'mt-3' }, sel) : null),
    h('section', { class: 'card' }, out));
}

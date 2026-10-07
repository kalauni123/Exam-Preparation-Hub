/**
 * Feature 12 — Question Quality Engine (admin): ambiguous / duplicate (within and across
 * chapters) / two-correct suspicion / poor distractors / possibly wrong key / typos /
 * too easy / too hard / placeholder text / chapter-content mismatch.
 * @module features/quality
 */
import { h, mount } from '../ui/dom.js';
import { icon } from '../ui/icons.js';
import { sheet } from '../ui/overlay.js';
import { app } from '../state.js';
import { loadChapters } from '../bank/chapterLoader.js';
import { contentFlags, findDuplicates, cttItem } from '../engine/questionQuality.js';
import { loadCohort, responsesByQuestion } from './cohort.js';
import { mathText } from './whyWrong.js';

const FLAG_INFO = {
  placeholder: 'Placeholder text such as “Sample Question…” or “Option A”.',
  'two-correct-suspicion': 'Two options look identical, or both “all of the above” and “none of the above” appear.',
  'poor-distractors': 'Empty/duplicate options, or (with data) options almost nobody picks.',
  typo: 'Double spaces, repeated words or unbalanced math delimiters.',
  'chapter-mismatch': 'The content does not look like this chapter’s subject area.',
  'missing-explanation': 'No “why correct” explanation.',
  duplicate: 'Near-duplicate of another question (normalised 3-word shingles, Jaccard ≥ 0.7).',
  'too-easy': 'More than 95 % of learners answer correctly (needs ≥ 30 responses).',
  'too-hard': 'Fewer than 15 % answer correctly (needs ≥ 30 responses).',
  'low-discrimination': 'Strong learners are not more likely to get it right (point-biserial < 0.1).',
  'possibly-wrong-key': 'The top 27 % of learners prefer a different option than the key.',
};

/** @param {HTMLElement} view */
export function renderQuality(view) {
  const scopeSel = h('select', { class: 'input-full', 'aria-label': 'Scope' },
    h('option', { value: 'all' }, 'Every chapter that has questions'),
    ...app.catalog.categories.map((c) => h('option', { value: 'cat:' + c.id }, 'Category: ' + c.label)),
    ...[...app.catalog.subjectById.values()].map((s) => h('option', { value: 'sub:' + s.id }, 'Subject: ' + s.name)));
  const out = h('div');
  const bar = h('span', { style: { width: '0%' } });
  const prog = h('div', { class: 'progress mt-3 hidden' }, bar);

  async function run() {
    const v = scopeSel.value;
    let chs = app.catalog.chapters.filter((c) => c.questionCount > 0);
    if (v.startsWith('cat:')) chs = chs.filter((c) => c.category === v.slice(4));
    if (v.startsWith('sub:')) chs = chs.filter((c) => c.subjectId === v.slice(4));
    prog.classList.remove('hidden');
    const { questions, failed } = await loadChapters(chs, (d, n) => { bar.style.width = (100 * d) / n + '%'; });
    const { rows } = await loadCohort();
    const byQ = responsesByQuestion(rows);
    const flags = new Map();
    const add = (id, f, extra) => { if (!flags.has(id)) flags.set(id, []); flags.get(id).push(extra ? f + ' ' + extra : f); };
    for (const q of questions) {
      for (const f of contentFlags(q, q._chapter.category)) add(q.id, f);
      const resp = byQ.get(q.id);
      if (resp) for (const f of cttItem(q, resp).flags) if (f !== 'insufficient-data') add(q.id, f);
    }
    const dups = findDuplicates(questions, 0.7);
    for (const d of dups) { add(d.a, 'duplicate', `≈ ${d.b} (${Math.round(d.similarity * 100)}%)`); add(d.b, 'duplicate', `≈ ${d.a} (${Math.round(d.similarity * 100)}%)`); }
    const counts = {};
    for (const fl of flags.values()) for (const f of new Set(fl.map((x) => x.split(' ')[0]))) counts[f] = (counts[f] || 0) + 1;
    const qById = new Map(questions.map((q) => [q.id, q]));
    mount(out,
      h('p', null, `${questions.length} questions in ${chs.length} chapters checked${failed.length ? ` (${failed.length} chapters unavailable offline)` : ''}. ${flags.size} question(s) flagged.`),
      h('div', { class: 'row-wrap mb-4' }, Object.entries(counts).map(([k, n]) => h('span', { class: 'badge orange', title: FLAG_INFO[k] || k }, `${k}: ${n}`))),
      flags.size ? h('ul', { class: 'list' }, [...flags.entries()].map(([id, fl]) => h('li', null, h('button', { class: 'list-row', onclick: () => {
        const q = qById.get(id);
        sheet(id, [mathText('p', 'break', q.stem), h('ul', { class: 'stack-sm small', style: { paddingLeft: '1.2rem' } }, fl.map((f) => h('li', null, h('strong', null, f), ' — ', FLAG_INFO[f.split(' ')[0]] || ''))), h('p', { class: 'small muted mt-3' }, `File: data/${app.catalog.chapterById.get(q._chapter.id).files[0]}`)]);
      } }, h('span', { class: 'grow' }, h('span', { style: { display: 'block' } }, id), h('span', { class: 'meta' }, fl.join(' · '))), icon('chevron', { cls: 'chev' }))))) : h('div', { class: 'callout success' }, 'No problems found in this scope.'));
    prog.classList.add('hidden');
  }
  mount(view,
    h('h1', null, 'Question quality engine'),
    h('section', { class: 'card' },
      h('p', { class: 'muted small' }, 'Checks the question bank (and, when enough answers exist, response statistics) for common item-writing problems. Only the chapters in the chosen scope are downloaded.'),
      scopeSel, h('button', { class: 'btn btn-primary btn-block mt-3', onclick: run }, icon('shield'), 'Run checks'), prog),
    h('section', { class: 'card' }, out),
    h('section', { class: 'card' }, h('h2', null, 'What each flag means'), h('dl', { class: 'stack-sm small' }, Object.entries(FLAG_INFO).map(([k, v]) => h('div', null, h('dt', null, h('strong', null, k)), h('dd', { class: 'muted' }, v))))));
}

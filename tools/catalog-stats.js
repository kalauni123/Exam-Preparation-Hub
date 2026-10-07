/**
 * Owner tool: questions per chapter/subject, empty-chapter report, skeleton generator.
 */
import { indexCatalog } from '../js/bank/catalogLoader.js';
import { toCsv, downloadBlob } from '../js/storage/exportImport.js';
import { makeZip } from '../js/utils/zip.js';

const $ = (id) => document.getElementById(id);
const el = (tag, cls, ...kids) => { const e = document.createElement(tag); if (cls) e.className = cls; for (const k of kids) e.append(k instanceof Node ? k : document.createTextNode(String(k))); return e; };

const idx = indexCatalog(await (await fetch('../data/catalog.json', { cache: 'no-cache' })).json());
const total = idx.chapters.reduce((s, c) => s + (c.questionCount || 0), 0);
const empty = idx.chapters.filter((c) => !c.questionCount);
for (const [label, v] of [['Subjects', idx.subjectById.size], ['Chapters', idx.chapters.length], ['Questions', total], ['Empty chapters', empty.length]]) {
  $('summary').append(el('div', 'stat-box', label, el('strong', null, v)));
}
const t = el('table', 'data');
t.append(el('thead', null, el('tr', null, el('th', null, 'Category'), el('th', null, 'Subject'), el('th', null, 'Chapters with questions'), el('th', null, 'Questions'), el('th', null, 'Flags'))));
const tb = el('tbody');
for (const s of idx.subjectById.values()) {
  const n = s.chapters.reduce((a, c) => a + (c.questionCount || 0), 0);
  const w = s.chapters.filter((c) => c.questionCount).length;
  tb.append(el('tr', null, el('td', null, s.categoryLabel), el('td', null, `${s.id} · ${s.name}`), el('td', null, `${w} / ${s.chapters.length}`), el('td', null, n), el('td', null, (s.flags || []).join(', '))));
}
t.append(tb);
$('subjects').append(t);
$('empty').textContent = empty.map((c) => `${c.id}  ${c.title}  (data/${c.files[0]})`).join('\n') || 'None 🎉';
$('csv').addEventListener('click', () => {
  const rows = [['category', 'subject_id', 'subject', 'chapter_id', 'number', 'title', 'question_count', 'file']];
  for (const c of idx.chapters) rows.push([c.category, c.subjectId, c.subjectName, c.id, c.number, c.title, c.questionCount || 0, 'data/' + c.files[0]]);
  downloadBlob(new Blob([toCsv(rows)], { type: 'text/csv' }), 'catalog-stats.csv');
});
$('skel').addEventListener('click', () => {
  const files = idx.chapters.flatMap((c) => c.files.map((f) => ({ name: 'data/' + f, data: JSON.stringify({ schemaVersion: 1, chapterId: c.id, subjectId: c.subjectId, category: c.category, questions: [] }) + '\n' })));
  downloadBlob(makeZip(files), 'chapter-skeletons.zip');
});

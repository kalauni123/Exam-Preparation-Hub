/**
 * Owner tool: validate catalog + chapter files and fill questionCount.
 */
import { validateCatalog, validateChapterFile } from '../js/bank/bankValidator.js';
import { indexCatalog } from '../js/bank/catalogLoader.js';
import { contentFlags, findDuplicates } from '../js/engine/questionQuality.js';
import { downloadJson } from '../js/storage/exportImport.js';

const $ = (id) => document.getElementById(id);
const log = $('log');
let catalog = null;
let updated = null;

function line(text, cls) {
  const d = document.createElement('div');
  if (cls) d.className = cls;
  d.textContent = text;
  log.appendChild(d);
}

async function getCatalog() {
  if (catalog) return catalog;
  const res = await fetch('../data/catalog.json', { cache: 'no-cache' });
  catalog = await res.json();
  return catalog;
}

/** Validate one parsed chapter document; returns question list. */
function checkDoc(doc, ch, label) {
  const r = validateChapterFile(doc, ch);
  for (const e of r.errors) line(`✘ ${label}: ${e}`, 'bad');
  for (const q of r.questions) {
    const fl = contentFlags(q, ch.category).filter((f) => f !== 'missing-explanation');
    if (fl.length) line(`⚠ ${q.id}: ${fl.join(', ')}`, 'warn');
  }
  return r;
}

$('run').addEventListener('click', async () => {
  log.textContent = '';
  const cat = await getCatalog();
  const v = validateCatalog(cat);
  v.errors.forEach((e) => line('✘ catalog: ' + e, 'bad'));
  v.warnings.forEach((e) => line('⚠ catalog: ' + e, 'warn'));
  line(`Catalog: ${cat.categories.length} categories, ${v.subjects} subjects, ${v.chapters} chapters.`, v.ok ? 'ok' : 'bad');
  const idx = indexCatalog(cat);
  updated = JSON.parse(JSON.stringify(cat));
  const counts = new Map();
  const all = [];
  let missing = 0;
  let invalid = 0;
  const prog = $('progress');
  prog.classList.remove('hidden');
  const chs = idx.chapters;
  for (let i = 0; i < chs.length; i += 20) {
    await Promise.all(chs.slice(i, i + 20).map(async (ch) => {
      let n = 0;
      for (const f of ch.files) {
        try {
          const res = await fetch('../data/' + f, { cache: 'no-cache' });
          if (!res.ok) { missing++; line(`✘ missing file data/${f}`, 'bad'); continue; }
          const r = checkDoc(await res.json(), ch, f);
          invalid += r.dropped;
          n += r.questions.length;
          all.push(...r.questions.map((q) => ({ ...q, _ch: ch.id })));
        } catch (e) { missing++; line(`✘ data/${f}: ${e.message}`, 'bad'); }
      }
      counts.set(ch.id, n);
    }));
    prog.firstElementChild.style.width = (100 * Math.min(chs.length, i + 20)) / chs.length + '%';
  }
  const ids = new Set();
  let dupIds = 0;
  for (const q of all) { if (ids.has(q.id)) { dupIds++; line('✘ duplicate question id ' + q.id, 'bad'); } ids.add(q.id); }
  const dups = findDuplicates(all, 0.8);
  dups.slice(0, 50).forEach((d) => line(`⚠ near-duplicate: ${d.a} ≈ ${d.b} (${Math.round(d.similarity * 100)}%)`, 'warn'));
  let changed = 0;
  for (const c of updated.categories) for (const s of c.subjects) for (const ch of s.chapters) {
    const n = counts.get(ch.id) ?? 0;
    if (ch.questionCount !== n) { changed++; line(`ℹ ${ch.id}: questionCount ${ch.questionCount} → ${n}`); ch.questionCount = n; }
  }
  const total = [...counts.values()].reduce((a, b) => a + b, 0);
  const empty = [...counts.values()].filter((n) => n === 0).length;
  $('summary').textContent = `${total} valid questions · ${empty} empty chapters · ${missing} missing/unreadable files · ${invalid} invalid questions · ${dupIds} duplicate ids · ${dups.length} near-duplicates · ${changed} questionCount updates.`;
  $('summary').className = 'callout ' + (missing || invalid || dupIds || !v.ok ? 'danger' : 'success');
  $('dl').disabled = false;
  line('Done.', 'ok');
});

$('dl').addEventListener('click', () => { if (updated) downloadJson(updated, 'catalog.json'); });

async function checkFiles(files) {
  log.textContent = '';
  const idx = indexCatalog(await getCatalog());
  for (const f of files) {
    try {
      const doc = JSON.parse(await f.text());
      const ch = idx.chapterById.get(doc.chapterId);
      if (!ch) { line(`✘ ${f.name}: chapterId "${doc.chapterId}" is not in the catalog`, 'bad'); continue; }
      const r = checkDoc(doc, ch, f.name);
      line(`${r.errors.length ? '✘' : '✔'} ${f.name}: ${r.questions.length} valid, ${r.dropped} invalid → place at data/${ch.files[0]} and set questionCount ${r.questions.length} (bump "version" to refresh caches)`, r.errors.length ? 'bad' : 'ok');
    } catch (e) { line(`✘ ${f.name}: ${e.message}`, 'bad'); }
  }
}
$('pick').addEventListener('click', () => $('files').click());
$('files').addEventListener('change', () => checkFiles([...$('files').files]));
const drop = $('drop');
drop.addEventListener('dragover', (e) => { e.preventDefault(); drop.classList.add('over'); });
drop.addEventListener('dragleave', () => drop.classList.remove('over'));
drop.addEventListener('drop', (e) => { e.preventDefault(); drop.classList.remove('over'); checkFiles([...e.dataTransfer.files]); });

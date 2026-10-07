/**
 * Owner tool: legacy window.xxxChN = [...] files → new chapter JSON files (Section 7.6).
 */
import { parseLegacyFile, convertLegacy } from '../js/bank/legacyParser.js';
import { indexCatalog } from '../js/bank/catalogLoader.js';
import { downloadJson, downloadBlob } from '../js/storage/exportImport.js';
import { makeZip } from '../js/utils/zip.js';

const $ = (id) => document.getElementById(id);
const SAMPLES = ['teachingapt_ch1.js', 'comm_ch1.js', 'qm1_ch1.js'];
let idx = null;
let items = [];
const decisions = {};
let lastFiles = {};

const el = (tag, attrs = {}, ...kids) => {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) { if (k === 'class') e.className = v; else if (k.startsWith('on')) e.addEventListener(k.slice(2), v); else e.setAttribute(k, v); }
  for (const k of kids) e.append(k instanceof Node ? k : document.createTextNode(String(k)));
  return e;
};

async function catalogIndex() {
  if (!idx) idx = indexCatalog(await (await fetch('../data/catalog.json')).json());
  return idx;
}

async function load(sources) {
  await catalogIndex();
  items = [];
  const log = $('log');
  log.textContent = '';
  for (const { name, text } of sources) {
    try {
      const parsed = parseLegacyFile(text);
      if (!parsed.length) { log.append(el('div', { class: 'warn' }, `⚠ ${name}: no window.<name> = [...] assignment found`)); continue; }
      for (const p of parsed) {
        const arr = Array.isArray(p.items) ? p.items : [];
        log.append(el('div', { class: 'ok' }, `✔ ${name}: window.${p.globalName} → ${arr.length} item(s)`));
        items.push(...arr);
      }
    } catch (e) {
      log.append(el('div', { class: 'bad' }, `✘ ${name}: ${e.message}`));
    }
  }
  convert();
}

function convert() {
  const { files, report } = convertLegacy(items, idx, { reassign: decisions });
  lastFiles = files;
  $('summary').className = 'callout';
  $('summary').textContent = `${report.converted} converted · ${report.placeholders.length} placeholder(s) skipped · ${report.mismatches.length} chapter mismatch(es) · ${report.invalid.length} invalid · ${report.skipped.length} skipped.`;
  const mm = $('mismatches');
  mm.textContent = '';
  if (report.mismatches.length) {
    const options = idx.chapters.map((c) => `<option value="${c.id}">${c.id} — ${c.title.replace(/[<>&"]/g, '')}</option>`).join('');
    const table = el('div', { class: 'table-wrap' });
    const t = el('table', { class: 'data' }, el('thead', {}, el('tr', {}, el('th', {}, 'Legacy id'), el('th', {}, 'Filed under'), el('th', {}, 'Question'), el('th', {}, 'Decision'))));
    const tb = el('tbody');
    for (const m of report.mismatches) {
      const sel = el('select', { class: 'input-full', 'aria-label': 'Decision for ' + m.legacyId });
      sel.innerHTML = '<option value="skip">Skip</option>' + options; // static, escaped catalog text only
      sel.value = decisions[m.legacyId] || 'skip';
      sel.addEventListener('change', () => { decisions[m.legacyId] = sel.value; });
      tb.append(el('tr', {}, el('td', {}, m.legacyId), el('td', {}, m.chapterId), el('td', {}, m.stem), el('td', {}, sel)));
    }
    t.append(tb);
    table.append(t);
    mm.append(el('h3', {}, 'Content / chapter mismatches'), el('p', { class: 'small muted' }, 'Choose “Skip” or the chapter each question really belongs to, then press “Apply decisions & re-convert”.'), table);
  }
  if (report.placeholders.length) $('log').append(el('div', { class: 'warn' }, `⚠ Placeholders skipped: ${report.placeholders.join(', ')}`));
  for (const i of report.invalid) $('log').append(el('div', { class: 'bad' }, `✘ ${i.legacyId}: ${i.reason}`));
  const out = $('out');
  out.textContent = '';
  for (const [chId, doc] of Object.entries(files)) {
    const ch = idx.chapterById.get(chId);
    out.append(el('li', { class: 'list-row', style: 'cursor:default' }, el('span', { class: 'grow' }, `${ch.files[0]} — ${doc.questions.length} question(s)`), el('button', { class: 'btn btn-sm', type: 'button', onclick: () => downloadJson(doc, chId + '.json') }, 'Download')));
  }
  out.append(el('li', {}, el('button', { class: 'btn btn-sm', type: 'button', onclick: () => downloadJson(report, 'legacy-conversion-report.json') }, 'Download report')));
  $('zip').disabled = !Object.keys(files).length;
  $('rerun').disabled = !report.mismatches.length;
}

$('rerun').addEventListener('click', convert);
$('zip').addEventListener('click', () => {
  const zipFiles = Object.entries(lastFiles).map(([chId, doc]) => ({ name: 'data/' + idx.chapterById.get(chId).files[0], data: JSON.stringify(doc, null, 1) }));
  downloadBlob(makeZip(zipFiles), 'converted-legacy-questions.zip');
});
$('pick').addEventListener('click', () => $('files').click());
$('files').addEventListener('change', async () => load(await Promise.all([...$('files').files].map(async (f) => ({ name: f.name, text: await f.text() })))));
const drop = $('drop');
drop.addEventListener('dragover', (e) => { e.preventDefault(); drop.classList.add('over'); });
drop.addEventListener('dragleave', () => drop.classList.remove('over'));
drop.addEventListener('drop', async (e) => { e.preventDefault(); drop.classList.remove('over'); load(await Promise.all([...e.dataTransfer.files].map(async (f) => ({ name: f.name, text: await f.text() })))); });
$('samples').addEventListener('click', async () => load(await Promise.all(SAMPLES.map(async (n) => ({ name: n, text: await (await fetch('./legacy-samples/' + n)).text() })))));

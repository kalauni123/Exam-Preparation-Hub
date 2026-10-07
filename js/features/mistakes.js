/**
 * Feature 14 — Personal Mistake Notebook: auto-filled, organised by category / subject /
 * chapter / concept / error type / date / repeat count; filter, search, retry, print to PDF.
 * @module features/mistakes
 */
import { h, mount, fmtDate, debounce } from '../ui/dom.js';
import { icon } from '../ui/icons.js';
import { emptyState, toast } from '../ui/overlay.js';
import { app, subjectName, saveUser } from '../state.js';
import { questionsByIds } from './qsource.js';
import { startSession, noteSheet } from './session.js';
import { ERROR_LABELS } from '../engine/errorClassifier.js';
import { mathText } from './whyWrong.js';
import { t } from '../i18n.js';

/** @param {HTMLElement} view */
export async function renderMistakes(view) {
  const book = app.user.mistakeBook || [];
  if (!book.length) {
    mount(view, h('h1', null, t('home.mistakes')), h('section', { class: 'card' }, emptyState('note', 'Your notebook is empty', 'Every wrong answer is saved here automatically with its error type, so you can retry it later.')));
    return;
  }
  const f = { group: 'subject', status: 'open', q: '', type: '' };
  const out = h('div');
  const stems = new Map();
  const search = h('input', { class: 'input-full', type: 'search', placeholder: 'Search mistakes, notes, chapters…', 'aria-label': 'Search mistakes' });
  const groupSel = h('select', { class: 'input-full', 'aria-label': 'Group by', onchange: () => { f.group = groupSel.value; paint(); } },
    ...[['subject', 'Group by subject'], ['category', 'Group by category'], ['chapter', 'Group by chapter'], ['concept', 'Group by concept'], ['errorType', 'Group by error type'], ['date', 'Group by date'], ['repeat', 'Group by repeat count']].map(([v, l]) => h('option', { value: v }, l)));
  const statusSel = h('select', { class: 'input-full', 'aria-label': 'Status', onchange: () => { f.status = statusSel.value; paint(); } },
    h('option', { value: 'open' }, 'Open mistakes'), h('option', { value: 'resolved' }, 'Resolved (answered correctly later)'), h('option', { value: 'all' }, 'All'));
  const typeSel = h('select', { class: 'input-full', 'aria-label': 'Error type', onchange: () => { f.type = typeSel.value; paint(); } },
    h('option', { value: '' }, 'All error types'), ...Object.entries(ERROR_LABELS).map(([k, l]) => h('option', { value: k }, l)));
  search.addEventListener('input', debounce(() => { f.q = search.value.toLowerCase(); paint(); }, 150));

  const keyOf = (m) => {
    switch (f.group) {
      case 'category': return app.catalog.categories.find((c) => c.id === m.category)?.label || m.category;
      case 'chapter': return `${m.chapterId} · ${app.catalog.chapterById.get(m.chapterId)?.title || ''}`;
      case 'concept': return m.concept || '(no concept tag)';
      case 'errorType': return ERROR_LABELS[m.errorType] || m.errorType || 'Unclassified';
      case 'date': return m.date.slice(0, 10);
      case 'repeat': return m.repeatCount >= 3 ? 'Repeated 3+ times' : m.repeatCount === 2 ? 'Repeated twice' : 'Once';
      default: return subjectName(m.subjectId || app.catalog.chapterById.get(m.chapterId)?.subjectId);
    }
  };

  function filtered() {
    return book.filter((m) => (f.status === 'all' || (f.status === 'open' ? !m.resolved : m.resolved))
      && (!f.type || m.errorType === f.type)
      && (!f.q || [m.questionId, m.note, m.concept, app.catalog.chapterById.get(m.chapterId)?.title, stems.get(m.questionId)].join(' ').toLowerCase().includes(f.q)));
  }

  function paint() {
    const items = filtered().sort((a, b) => b.date.localeCompare(a.date));
    const groups = new Map();
    for (const m of items) { const k = keyOf(m); if (!groups.has(k)) groups.set(k, []); groups.get(k).push(m); }
    mount(out, items.length ? [...groups.entries()].map(([k, arr]) => h('details', { class: 'tree', open: groups.size <= 3 },
      h('summary', null, h('span', { class: 'grow' }, k), h('span', { class: 'badge red' }, String(arr.length)),
        h('button', { class: 'btn btn-sm no-print', onclick: async (e) => { e.preventDefault(); const qs = await questionsByIds(arr.map((m) => m.questionId)); startSession({ mode: 'review', title: 'Mistakes · ' + k, questions: qs }); } }, icon('refresh'), 'Retry')),
      h('div', { class: 'tree-body' }, arr.map((m) => h('div', { class: 'review-item' },
        h('div', { class: 'row-wrap mb-2' }, h('span', { class: 'badge' }, m.chapterId), h('span', { class: 'badge red' }, ERROR_LABELS[m.errorType] || m.errorType), m.repeatCount > 1 ? h('span', { class: 'badge orange' }, `×${m.repeatCount}`) : null, m.resolved ? h('span', { class: 'badge green' }, 'Resolved') : null, h('span', { class: 'small muted' }, fmtDate(m.date))),
        stems.has(m.questionId) ? mathText('p', 'break', stems.get(m.questionId)) : h('p', { class: 'small muted' }, m.questionId),
        m.note ? h('div', { class: 'callout mt-2 small' }, '📝 ' + m.note) : null,
        h('div', { class: 'row-wrap mt-2 no-print' },
          h('button', { class: 'btn btn-sm', onclick: () => noteSheet(m.questionId) }, icon('note'), 'Note'),
          h('button', { class: 'btn btn-sm', onclick: () => { m.resolved = !m.resolved; saveUser(); paint(); } }, m.resolved ? 'Reopen' : 'Mark resolved'))))))) : h('p', { class: 'muted' }, 'No mistakes match these filters.'));
  }

  mount(view,
    h('div', { class: 'row between' }, h('h1', null, t('home.mistakes')), h('button', { class: 'btn btn-sm no-print', onclick: () => window.print() }, icon('print'), 'PDF')),
    h('section', { class: 'card no-print' },
      h('div', { class: 'stats-grid' },
        h('div', { class: 'stat-box' }, 'Open', h('strong', { class: 'text-danger' }, String(book.filter((m) => !m.resolved).length))),
        h('div', { class: 'stat-box' }, 'Resolved', h('strong', { class: 'text-success' }, String(book.filter((m) => m.resolved).length))),
        h('div', { class: 'stat-box' }, 'Repeated', h('strong', null, String(book.filter((m) => m.repeatCount > 1).length)))),
      h('div', { class: 'search' }, icon('search'), search),
      h('div', { class: 'form-grid', style: { marginBottom: 0 } }, groupSel, statusSel, typeSel)),
    h('section', { class: 'card' }, out));
  paint();
  // Load stems lazily (only chapters that appear in the notebook) for search and display.
  try {
    const qs = await questionsByIds(book.slice(-300).map((m) => m.questionId));
    for (const q of qs) stems.set(q.id, q.stem);
    paint();
  } catch { toast('Some questions are not available offline.'); }
}

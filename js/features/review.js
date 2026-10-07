/**
 * Feature 4 — "Due today" spaced-repetition queue across all subjects, filterable by subject.
 * @module features/review
 */
import { h, mount, relDay } from '../ui/dom.js';
import { icon } from '../ui/icons.js';
import { emptyState } from '../ui/overlay.js';
import { app, subjectName } from '../state.js';
import { dueQueue, chapterOfQuestion } from './insights.js';
import { questionsByIds } from './qsource.js';
import { startSession } from './session.js';
import { LADDER_DAYS } from '../engine/spacedRepetition.js';
import { t } from '../i18n.js';

/** @param {HTMLElement} view @param {object} _p @param {URLSearchParams} query */
export function renderReview(view, _p, query) {
  let subject = query.get('subject') || '';
  const out = h('div');
  const all = dueQueue(app.user);
  const subjects = [...new Set(all.map((id) => app.catalog.chapterById.get(chapterOfQuestion(id))?.subjectId).filter(Boolean))];
  const upcoming = Object.entries(app.user.questionState || {}).filter(([, s]) => !s.retired && s.nextDue && Date.parse(s.nextDue) > Date.now()).sort((a, b) => Date.parse(a[1].nextDue) - Date.parse(b[1].nextDue));
  const retired = Object.values(app.user.questionState || {}).filter((s) => s.retired).length;
  const sel = h('select', { class: 'input-full', 'aria-label': 'Filter by subject', onchange: () => { subject = sel.value; paint(); } },
    h('option', { value: '' }, `All subjects (${all.length})`), ...subjects.map((s) => h('option', { value: s, selected: s === subject }, subjectName(s))));
  function paint() {
    const ids = subject ? dueQueue(app.user, subject) : all;
    if (!ids.length) {
      mount(out, emptyState('check', 'Nothing due right now', 'Questions you get wrong come back tomorrow, then after 3, 7 and 21 days. Consistently-correct questions fade out.', h('a', { class: 'btn btn-primary', href: '#/practice' }, 'Practise something new')));
      return;
    }
    const byCh = {};
    for (const id of ids) { const c = chapterOfQuestion(id); byCh[c] = (byCh[c] || 0) + 1; }
    mount(out,
      h('button', { class: 'btn btn-primary btn-block', onclick: async (e) => { e.target.disabled = true; const qs = await questionsByIds(ids.slice(0, 50)); startSession({ mode: 'review', title: `Due review (${qs.length})`, questions: qs }); } }, icon('play'), `Review ${Math.min(50, ids.length)} due question${ids.length > 1 ? 's' : ''}`),
      h('ul', { class: 'list mt-4' }, Object.entries(byCh).map(([c, n]) => {
        const ch = app.catalog.chapterById.get(c);
        return h('li', { class: 'list-row', style: { cursor: 'default' } }, h('span', { class: 'chapter-num' }, String(n)), h('span', { class: 'grow' }, h('span', { style: { display: 'block' } }, ch?.title || c), h('span', { class: 'meta' }, ch?.subjectName || '')));
      })));
  }
  paint();
  mount(view,
    h('h1', null, t('home.review')),
    h('section', { class: 'card' },
      h('div', { class: 'stats-grid' },
        h('div', { class: 'stat-box' }, 'Due now', h('strong', { class: 'text-primary' }, String(all.length))),
        h('div', { class: 'stat-box' }, 'Upcoming', h('strong', null, String(upcoming.length))),
        h('div', { class: 'stat-box' }, 'Faded out', h('strong', { class: 'text-success' }, String(retired)))),
      subjects.length > 1 ? sel : null,
      h('div', { class: 'mt-4' }, out)),
    upcoming.length ? h('section', { class: 'card' }, h('h2', null, 'Coming up'),
      h('p', { class: 'small muted' }, `Ladder: wrong → ${LADDER_DAYS.join(' → ')} days → faded.`),
      h('ul', { class: 'list' }, upcoming.slice(0, 8).map(([id, s]) => h('li', { class: 'list-row', style: { cursor: 'default' } }, h('span', { class: 'badge' }, 'Box ' + s.box), h('span', { class: 'grow ellipsis' }, id), h('span', { class: 'meta' }, relDay(s.nextDue)))))) : null);
}

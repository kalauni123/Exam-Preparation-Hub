/**
 * Feature 8 — Complete Syllabus Progress Map: Category → Subject → Chapter tree with mastery %
 * and status colour, "Study next" sort, collapsed by default (subjects render lazily on open).
 * @module features/syllabus
 */
import { h, mount, pct } from '../ui/dom.js';
import { app } from '../state.js';
import { chapterStats, rankChapters, subjectSummary } from './insights.js';
import { STATUS } from '../engine/memoryMap.js';
import { chapterSheet } from './memoryMap.js';
import { t } from '../i18n.js';

/** @param {HTMLElement} view */
export function renderSyllabus(view) {
  const cs = chapterStats(app.user);
  let sortNext = false;
  const out = h('div');
  const ranked = new Map(rankChapters(app.user, { subjectIds: [...app.catalog.subjectById.keys()] }).map((r, i) => [r.chapterId, i]));
  function chapterRows(sub) {
    const chs = [...sub.chapters];
    if (sortNext) chs.sort((a, b) => (ranked.get(a.id) ?? 1e9) - (ranked.get(b.id) ?? 1e9));
    return chs.map((c) => {
      const s = cs.get(c.id);
      const st = c.questionCount ? (s?.status || 'none') : 'none';
      return h('div', { class: 'syl-row', role: 'button', tabindex: 0, onclick: () => chapterSheet(c.id), onkeydown: (e) => { if (e.key === 'Enter') chapterSheet(c.id); } },
        h('span', { class: 'dot ' + st }),
        h('span', { class: 'grow' }, `${sub.name} › Chapter ${c.number}: ${c.title}`),
        h('span', { class: 'pct' }, c.questionCount ? (s && s.health !== null ? `${STATUS[st]?.emoji || ''} ${pct(s.health)}` : 'Not started') : h('span', { class: 'muted small' }, 'No questions yet')));
    });
  }
  function paint() {
    mount(out, app.catalog.categories.map((cat) => {
      const det = h('details', { class: 'tree' },
        h('summary', null, h('span', { class: 'grow' }, cat.label), h('span', { class: 'badge' }, `${cat.subjects.length} subjects`)));
      const body = h('div', { class: 'tree-body' });
      det.appendChild(body);
      det.addEventListener('toggle', () => {
        if (!det.open || body.childNodes.length) return;
        mount(body, cat.subjects.map((sub) => {
          const sum = subjectSummary(app.user, sub.id, cs);
          const sd = h('details', { class: 'tree' }, h('summary', null, h('span', { class: 'grow' }, sub.name),
            h('span', { class: 'small muted' }, sum.chaptersWithQuestions ? `${pct(sum.coverage)} covered` : 'No questions yet'),
            sum.health !== null ? h('span', { class: 'badge' }, pct(sum.health)) : null));
          const sb = h('div', { class: 'tree-body' });
          sd.appendChild(sb);
          sd.addEventListener('toggle', () => { if (sd.open && !sb.childNodes.length) mount(sb, chapterRows(sub)); });
          return sd;
        }));
      });
      return det;
    }));
  }
  const sortBtn = h('button', { class: 'chip', 'aria-pressed': 'false', onclick: () => { sortNext = !sortNext; sortBtn.setAttribute('aria-pressed', String(sortNext)); paint(); } }, 'Sort by “Study next”');
  paint();
  mount(view, h('h1', null, t('home.syllabus')), h('section', { class: 'card' }, h('p', { class: 'muted small' }, 'All 3 categories, 30 subjects and 450 chapters. Open a category, then a subject, to see each chapter’s memory health.'), sortBtn), h('section', { class: 'card' }, out));
}

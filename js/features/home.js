/**
 * Home: greeting, Today's Revision card (Feature 17), quick actions, active subjects,
 * backup reminder and a dashboard banner slot.
 * @module features/home
 */
import { h, mount, pct } from '../ui/dom.js';
import { icon } from '../ui/icons.js';
import { app, subjectName, activeSubjectIds } from '../state.js';
import { todayData, subjectSummary, chapterStats } from './insights.js';
import { backupDue, exportUser } from '../storage/exportImport.js';
import { adSlot } from '../ads/adManager.js';
import { maybeNotify } from './notify.js';
import { t } from '../i18n.js';
import { STATUS, statusFromHealth } from '../engine/memoryMap.js';

/** @param {HTMLElement} view */
export function renderHome(view) {
  const u = app.user;
  const td = todayData(u);
  const first = u.profile.name.split(' ')[0];
  const hour = new Date().getHours();
  const greet = hour < 12 ? t('home.morning') : hour < 17 ? t('home.afternoon') : t('home.evening');
  const cs = chapterStats(u);
  const subs = activeSubjectIds();
  const goalPct = Math.min(1, td.minutesToday / td.goal);

  const riskLines = td.atRisk.map((r) => h('div', { class: 'callout mt-2 small' }, `⚠️ High chance of forgetting “${r.title}” today (${pct(r.risk)} risk).`, ' ', h('a', { href: `#/practice/subject/${app.catalog.chapterById.get(r.chapterId)?.subjectId}?ch=${r.chapterId}`, style: { color: '#fff', textDecoration: 'underline' } }, 'Revise')));

  const tiles = [
    ['#/study-now', 'target', t('home.studyNow'), 'Personal plan for today'],
    ['#/review', 'clock', t('home.review'), `${td.due} due`],
    ['#/rapid', 'bolt', t('home.rapid'), '60-second sprint'],
    ['#/mistakes', 'note', t('home.mistakes'), `${(u.mistakeBook || []).filter((m) => !m.resolved).length} open`],
    ['#/bookmarks', 'bookmark', t('home.bookmarks'), `${(u.bookmarks || []).length} saved`],
    ['#/memory', 'brain', t('home.memoryMap'), 'Chapter strength'],
    ['#/syllabus', 'tree', t('home.syllabus'), 'Progress tree'],
    ['#/dna', 'dna', t('home.dna'), 'How you learn'],
  ];

  mount(view,
    h('div', { class: 'greeting' }, h('div', null, h('span', { class: 'subject-label' }, greet), h('h1', null, first + ' 👋')),
      h('span', { class: 'pill', title: 'Daily streak' }, '🔥 ' + td.streak + ' ' + t('home.days'))),
    backupDue(u, app.config.backupReminderDays || 7) ? h('div', { class: 'callout warn mb-4 row between' }, h('span', null, 'It has been a while since your last backup.'), h('button', { class: 'btn btn-sm', onclick: () => { exportUser(u); renderHome(view); } }, icon('download'), 'Back up')) : null,
    h('section', { class: 'card today-card' },
      h('div', { class: 'row between' }, h('h2', { style: { margin: 0 } }, t('home.today')), h('span', { class: 'small' }, new Date().toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'short' }))),
      h('div', { class: 'today-metrics' },
        h('div', null, h('strong', null, String(td.due)), h('span', null, t('home.due'))),
        h('div', null, h('strong', null, String(td.atRisk.length)), h('span', null, t('home.atRisk'))),
        h('div', null, h('strong', null, Math.round(td.minutesToday) + '/' + td.goal), h('span', null, 'min today'))),
      h('div', { class: 'progress', style: { background: 'rgba(255,255,255,.25)' }, 'aria-label': `Daily goal ${Math.round(goalPct * 100)} percent` }, h('span', { style: { width: goalPct * 100 + '%', background: '#fff' } })),
      riskLines,
      h('div', { class: 'grid-2 mt-4' },
        h('a', { class: 'btn', href: '#/study-now' }, icon('target'), t('home.studyNow')),
        h('a', { class: 'btn', href: td.due ? '#/review' : '#/practice' }, icon('play'), td.due ? t('home.reviewDue') : t('nav.practice')))),
    h('section', { class: 'card' },
      h('div', { class: 'tile-grid' }, tiles.map(([href, ic, title, sub]) => h('a', { class: 'tile', href }, h('span', { class: 'tile-icon' }, icon(/** @type any */ (ic))), h('span', { class: 'tile-title' }, title), h('span', { class: 'tile-sub' }, sub))))),
    h('section', { class: 'card' },
      h('div', { class: 'card-title' }, h('h2', null, t('home.mySubjects')), h('a', { class: 'btn btn-ghost btn-sm', href: '#/settings?focus=subjects' }, 'Edit')),
      subs.length ? h('div', { class: 'subject-grid' }, subs.map((sid) => {
        const s = subjectSummary(u, sid, cs);
        const st = s.health === null ? 'none' : statusFromHealth(s.health);
        return h('a', { class: 'subject-card', href: `#/practice/subject/${sid}` },
          h('span', { class: 'subject-code' }, sid.replace('_', ' ')),
          h('span', { class: 'grow' }, h('span', { style: { display: 'block' } }, subjectName(sid)),
            h('span', { class: 'meta small muted' }, s.attempts ? `Mastery ${pct(s.mastery)} · ${s.attempts} answered` : (s.chaptersWithQuestions ? 'Not started yet' : 'No questions yet'))),
          h('span', { class: 'badge ' + st }, st === 'none' ? '—' : STATUS[st].emoji));
      })) : h('p', { class: 'muted' }, 'No active subjects yet — choose some in Settings.')),
    adSlot('dashboard'));
  maybeNotify(td);
}

/**
 * Features 5 & 6 — Personal Performance Dashboard (Simple / Pro view, subject selector) and
 * the Category → Subject → Chapter → Concept drill-down.
 * @module features/analytics
 */
import { h, mount, pct } from '../ui/dom.js';
import { icon } from '../ui/icons.js';
import { infoTip, skeleton } from '../ui/overlay.js';
import { ring, radar, lineChart, heatmap, rangeBar } from '../ui/charts.js';
import { app, saveUser, subjectName, activeSubjectIds } from '../state.js';
import { skillScores, overallMastery, trendLabel, strengthByGroup, ewmaSeries } from '../engine/mastery.js';
import { speedSkill } from '../engine/responseTime.js';
import { fuzzyMemberships, statusFromHealth, STATUS } from '../engine/memoryMap.js';
import { confidenceLabel } from '../engine/stats.js';
import { ERROR_LABELS } from '../engine/errorClassifier.js';
import { chapterStats, streak, minutesByDay, rankChapters, conceptStats } from './insights.js';
import { predict } from './predict.js';
import { adSlot } from '../ads/adManager.js';
import { t } from '../i18n.js';

const SKILL_INFO = {
  conceptual: ['Conceptual', 'How well you answer “why/what” questions that test understanding.'],
  numerical: ['Numerical', 'Accuracy on calculation questions. Hidden for subjects without numericals.'],
  memory: ['Memory', 'Recall of facts, names, formulas and definitions.'],
  application: ['Application', 'Using ideas in new situations and scenarios.'],
  speed: ['Speed', 'How quickly you answer correctly compared with the expected time for each question.'],
  accuracy: ['Accuracy', 'Share of all your answers that were correct (recent answers count more).'],
};

/** Status colour key for a 0..1 score. */
const colorOf = (x) => (x === null || x === undefined ? 'none' : statusFromHealth(x));

/** @param {HTMLElement} view @param {object} _p @param {URLSearchParams} query */
export function renderAnalytics(view, _p, query) {
  const u = app.user;
  const pro = !!u.settings.proView;
  const subs = activeSubjectIds();
  let subject = query.get('subject') || 'all';
  const atts = (u.attempts || []).filter((a) => subject === 'all' ? subs.includes(a.subjectId) || !subs.length : a.subjectId === subject);
  const now = Date.now();
  const hl = app.config.recencyHalfLifeDays || 21;
  const { scores, counts } = skillScores(atts, { now, halfLifeDays: hl });
  const speed = speedSkill(atts.slice(-300).map((a) => ({ z: a.z, isCorrect: a.isCorrect })));
  const skills = { conceptual: scores.conceptual, numerical: scores.numerical, memory: scores.memory, application: scores.application, speed, accuracy: scores.accuracy };
  const mastery = overallMastery(skills, app.config.masteryWeights);

  const toggle = h('div', { class: 'seg', role: 'group', 'aria-label': 'View mode' },
    h('button', { 'aria-pressed': String(!pro), onclick: () => { u.settings.proView = false; saveUser(); renderAnalytics(view, _p, query); } }, 'Simple'),
    h('button', { 'aria-pressed': String(pro), onclick: () => { u.settings.proView = true; saveUser(); renderAnalytics(view, _p, query); } }, 'Pro'));
  const subjSel = h('select', { class: 'input-full', 'aria-label': 'Subject', onchange: () => { location.hash = '#/analytics' + (subjSel.value === 'all' ? '' : '?subject=' + subjSel.value); } },
    h('option', { value: 'all' }, 'All active subjects'), ...subs.map((s) => h('option', { value: s, selected: s === subject }, subjectName(s))));

  if (!atts.length) {
    mount(view, h('div', { class: 'row between' }, h('h1', null, t('nav.analytics')), toggle), h('section', { class: 'card' }, subjSel,
      h('div', { class: 'empty' }, icon('analytics'), h('h3', null, 'No data yet'), h('p', null, 'Answer a few questions and your dashboard will come alive. Tip: Settings → Load demo data previews every chart.'), h('a', { class: 'btn btn-primary', href: '#/practice' }, 'Start practising'))));
    return;
  }

  // Trend
  const trendPts = (u.trend?.ewma || []).filter((p) => subject === 'all' || (u.sessions.find((s) => s.sessionId === p.sessionId)?.scope?.subjectId ?? subject) === subject);
  const rawSeries = trendPts.map((p) => p.raw);
  const ewma = ewmaSeries(rawSeries, app.config.ewma?.alpha ?? 0.3);
  const tr = trendLabel(ewma, app.config.ewma?.slopeWindow ?? 8, app.config.ewma?.trendThresholdPct ?? 1.5);
  const trCls = tr.label === 'Improving' ? 'up' : tr.label === 'Declining' ? 'down' : 'flat';

  const cs = chapterStats(u, now);
  const counted = { green: 0, yellow: 0, orange: 0, red: 0 };
  for (const [id, s] of cs) if (s.status !== 'none' && (subject === 'all' || app.catalog.chapterById.get(id)?.subjectId === subject)) counted[s.status]++;

  const skillRows = Object.entries(SKILL_INFO).filter(([k]) => !(k === 'numerical' && skills.numerical === null)).map(([k, [name, info]]) => {
    const v = skills[k];
    return h('div', { class: 'skill' },
      h('span', { class: 'name' }, name, infoTip(name, info)),
      h('div', { class: 'progress ' + colorOf(v) }, h('span', { style: { width: (v ?? 0) * 100 + '%' } })),
      h('span', { class: 'val' }, pct(v)));
  });

  const predBox = h('div', null, skeleton(1));
  const top3 = rankChapters(u, { subjectIds: subject === 'all' ? subs : [subject] }).slice(0, 3);
  const theta = subject === 'all' ? { theta: u.abilities.theta, se: u.abilities.se } : (u.abilities.bySubject?.[subject] || { theta: 0, se: 1 });
  const fm = mastery === null ? null : fuzzyMemberships(mastery);
  const errCounts = {};
  for (const a of atts) if (a.errorType) errCounts[a.errorType] = (errCounts[a.errorType] || 0) + 1;

  mount(view,
    h('div', { class: 'row between' }, h('h1', null, t('nav.analytics')), toggle),
    h('section', { class: 'card card-tight mb-4' }, subjSel),
    h('div', { class: 'dash-grid' },
      h('section', { class: 'card' },
        h('div', { class: 'metric-head' }, h('h3', null, 'Overall Mastery'), infoTip('Overall Mastery', 'A weighted blend of your six skills: Conceptual 25 %, Numerical 20 %, Memory 15 %, Application 20 %, Speed 10 %, Accuracy 10 %. Recent answers count more than old ones.')),
        ring(mastery, { sub: 'mastery', color: `var(--st-${colorOf(mastery)})` }),
        h('p', { class: 'explain-line center mt-3' }, `Based on ${atts.length} answers · confidence ${confidenceLabel(atts.length)}.`),
        pro && fm ? h('p', { class: 'small muted center' }, `Fuzzy zones — Mastered ${pct(fm.mastered)}, Revision ${pct(fm.revision)}, Weak ${pct(fm.weak)}, Critical ${pct(fm.critical)}`) : null),
      h('section', { class: 'card' },
        h('div', { class: 'metric-head' }, h('h3', null, 'Skills'), infoTip('Skills', 'Each bar shows how strong you are in one kind of question. Green is strong, red needs work.')),
        skillRows,
        pro ? h('p', { class: 'small muted mt-3' }, 'Answers per type: ' + Object.entries(counts).filter(([k]) => k !== 'accuracy').map(([k, n]) => `${k} ${n}`).join(' · ')) : null),
      h('section', { class: 'card' },
        h('div', { class: 'metric-head' }, h('h3', null, 'Skill radar'), infoTip('Skill radar', 'The bigger and rounder the shape, the more balanced and strong you are.')),
        radar(Object.entries(SKILL_INFO).map(([k, [name]]) => ({ label: name, value: skills[k] })))),
      h('section', { class: 'card' },
        h('div', { class: 'metric-head' }, h('h3', null, 'Score trend'), h('span', { class: 'trend-badge ' + trCls }, `${tr.arrow} ${tr.label}`)),
        rawSeries.length ? lineChart([{ series: rawSeries, color: 'var(--text-muted)', dashed: true, name: 'Session score' }, { series: ewma, name: 'EWMA' }], { ariaLabel: 'Score trend' }) : h('p', { class: 'muted' }, 'Finish a session to start your trend.'),
        h('p', { class: 'explain-line' }, 'Solid line = smoothed score (EWMA, α = 0.3); dashed = each session.' + (pro ? ` Slope ${tr.slope.toFixed(2)} %-points per session over the last ${Math.min(8, ewma.length)}.` : ''))),
      h('section', { class: 'card' },
        h('div', { class: 'metric-head' }, h('h3', null, 'Study time'), h('span', { class: 'pill' }, '🔥 ' + streak(u) + ' day streak')),
        heatmap(minutesByDay(u)),
        h('p', { class: 'explain-line mt-2' }, 'Each square is a day — darker means more minutes studied.')),
      h('section', { class: 'card' },
        h('div', { class: 'metric-head' }, h('h3', null, 'Predicted score'), infoTip('Predicted score', 'We simulate your exam 5,000 times using what you know so far. The dot is the most likely score; the shaded bar covers 80 % of outcomes.')),
        predBox),
      h('section', { class: 'card' },
        h('div', { class: 'metric-head' }, h('h3', null, 'Memory map'), h('a', { class: 'btn btn-ghost btn-sm', href: '#/memory' }, 'Open')),
        h('div', { class: 'grid-2' }, Object.entries(counted).map(([k, n]) => h('div', { class: 'memory-cell ' + k, style: { cursor: 'default' } }, STATUS[k].emoji, ' ', STATUS[k].label, h('strong', { style: { marginLeft: 'auto' } }, String(n))))),
        h('p', { class: 'explain-line mt-2' }, 'How well each practised chapter is remembered right now.')),
      h('section', { class: 'card' },
        h('div', { class: 'metric-head' }, h('h3', null, "Today's plan"), h('a', { class: 'btn btn-ghost btn-sm', href: '#/study-now' }, 'Build plan')),
        h('ol', { class: 'stack-sm', style: { paddingLeft: '1.2rem' } }, top3.map((r) => h('li', null, h('strong', null, r.title), h('div', { class: 'small muted' }, r.reasons.join(', ')))))),
      pro ? h('section', { class: 'card' },
        h('h3', null, 'Pro metrics'),
        h('div', { class: 'stack-sm small' },
          h('div', null, `IRT ability θ = ${theta.theta?.toFixed(2)} ± ${theta.se?.toFixed(2)} (EAP, 3PL)`),
          h('div', null, `Battle rating ${Math.round(u.rating.glicko.r)} ± ${Math.round(u.rating.glicko.rd)} (Glicko-2)`),
          h('div', null, `Learner speed τ = ${(u.abilities.tau || 0).toFixed(2)} (log-seconds, + = faster)`),
          h('div', null, 'Error types: ' + (Object.entries(errCounts).sort((a, b) => b[1] - a[1]).map(([k, n]) => `${ERROR_LABELS[k] || k} ${n}`).join(' · ') || 'none yet'))),
        h('div', { class: 'row-wrap mt-3' }, h('a', { class: 'btn btn-sm', href: '#/qa' }, icon('library'), 'Question analytics'), h('a', { class: 'btn btn-sm', href: '#/quality' }, icon('shield'), 'Quality engine'))) : null,
      h('section', { class: 'card span-2' }, h('div', { class: 'metric-head' }, h('h3', null, 'Strong & weak areas'), infoTip('Drill-down', 'Tap a row to go deeper: category → subject → chapter → concept. Confidence shows how much data supports each number.')), drillDown(atts))),
    adSlot('dashboard'));

  predict({ subjectIds: subject === 'all' ? subs : [subject] }).then((p) => {
    if (!p.overall) { mount(predBox, h('p', { class: 'muted' }, 'Not enough data yet.')); return; }
    const o = p.overall;
    mount(predBox,
      rangeBar(o.loPct, o.medianPct, o.hiPct),
      h('p', { class: 'center mt-2' }, h('strong', null, `${Math.round(o.medianPct)}%`), ` likely (80 % range ${Math.round(o.loPct)}–${Math.round(o.hiPct)}%) · `, h('span', { class: 'badge' }, o.readiness)),
      h('p', { class: 'explain-line' }, p.mode === 'profile' ? `Using the “${p.profileName}” blueprint.` : (p.profileName ? `The “${p.profileName}” blueprint numbers are not filled in yet, so this is a generic per-subject estimate.` : 'Generic per-subject estimate (no exam profile selected).')),
      p.caveat ? h('p', { class: 'callout warn small mt-2' }, p.caveat) : null,
      pro ? h('div', { class: 'table-wrap mt-3' }, h('table', { class: 'data' }, h('thead', null, h('tr', null, h('th', null, 'Subject'), h('th', null, 'Median'), h('th', null, '80 % range'))),
        h('tbody', null, Object.entries(p.bySubject).map(([sid, r]) => h('tr', null, h('td', null, subjectName(sid)), h('td', null, Math.round(r.medianPct) + '%'), h('td', null, `${Math.round(r.loPct)}–${Math.round(r.hiPct)}%`)))))) : null);
  }).catch(() => mount(predBox, h('p', { class: 'muted' }, 'Prediction unavailable.')));
}

/**
 * Drill-down widget.
 * @param {object[]} atts
 * @returns {HTMLElement}
 */
function drillDown(atts) {
  const box = h('div');
  const path = [];
  const levels = ['category', 'subjectId', 'chapterId', 'concept'];
  const nameOf = (lvl, key) => {
    if (lvl === 'category') return app.catalog.categories.find((c) => c.id === key)?.label || key;
    if (lvl === 'subjectId') return subjectName(key);
    if (lvl === 'chapterId') return `${key} · ${app.catalog.chapterById.get(key)?.title || ''}`;
    return key;
  };
  function paint() {
    const depth = path.length;
    let scoped = atts;
    path.forEach((k, i) => { scoped = scoped.filter((a) => a[levels[i]] === k); });
    const lvl = levels[depth];
    const crumbs = h('nav', { class: 'drill-crumbs', 'aria-label': 'Drill-down path' },
      h('button', { onclick: () => { path.length = 0; paint(); } }, 'All'),
      ...path.map((k, i) => [h('span', { 'aria-hidden': 'true' }, '›'), h('button', { onclick: () => { path.length = i + 1; paint(); } }, nameOf(levels[i], k))]));
    if (!lvl) { mount(box, crumbs); return; }
    let rows;
    if (lvl === 'concept') {
      rows = conceptStats(app.user, path[2]).map((c) => ({ key: c.concept, score: c.score, n: c.n, confidence: c.confidence }));
    } else {
      const g = strengthByGroup(scoped, (a) => a[lvl] || null, { halfLifeDays: app.config.recencyHalfLifeDays || 21 });
      rows = Object.entries(g).map(([key, v]) => ({ key, score: v.score, n: v.n, confidence: v.confidence }));
    }
    rows.sort((a, b) => a.score - b.score);
    mount(box, crumbs, rows.length ? h('ul', { class: 'list' }, rows.map((r) => h('li', null, h('button', { class: 'list-row', disabled: lvl === 'concept', onclick: () => { if (lvl !== 'concept') { path.push(r.key); paint(); } } },
      h('span', { class: 'dot ' + colorOf(r.score) }),
      h('span', { class: 'grow' }, h('span', { style: { display: 'block' } }, nameOf(lvl, r.key)), h('span', { class: 'meta' }, `${r.n} answers · confidence ${r.confidence}`)),
      h('strong', null, pct(r.score)), lvl !== 'concept' ? icon('chevron', { cls: 'chev' }) : null)))) : h('p', { class: 'muted' }, 'No concept tags recorded for this chapter yet.'),
    h('p', { class: 'explain-line mt-2' }, 'Sorted weakest first. Strength uses all your history with recent answers weighted more.'));
  }
  paint();
  return box;
}

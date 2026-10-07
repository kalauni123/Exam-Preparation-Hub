/**
 * Feature 9 — "What should I study now?": builds a timed plan from the priority score
 * (Section 9.11) and runs it block by block.
 * @module features/studyNow
 */
import { h, mount, pct } from '../ui/dom.js';
import { icon } from '../ui/icons.js';
import { toast, skeleton } from '../ui/overlay.js';
import { app, subjectName, activeSubjectIds } from '../state.js';
import { buildPlan } from '../engine/recommender.js';
import { rankChapters, dueQueue } from './insights.js';
import { questionsByIds, questionsOfChapters } from './qsource.js';
import { startSession } from './session.js';
import { shuffle } from '../engine/stats.js';
import { selectAdaptive } from '../engine/irt.js';
import { t } from '../i18n.js';

/**
 * Pick n questions from a pool, favouring the 0.70–0.80 success band and unseen items.
 * @param {object[]} pool @param {number} n @returns {object[]}
 */
export function pickTargeted(pool, n) {
  const seen = new Set((app.user.attempts || []).slice(-500).map((a) => a.questionId));
  const fresh = shuffle(pool.filter((q) => !seen.has(q.id)));
  const rest = shuffle(pool.filter((q) => seen.has(q.id)));
  const out = [];
  const theta = app.user.abilities?.theta ?? 0;
  const candidates = [...fresh, ...rest];
  const used = new Set();
  while (out.length < n && used.size < candidates.length) {
    const q = selectAdaptive(candidates, theta, { exclude: used }) || candidates.find((c) => !used.has(c.id));
    used.add(q.id);
    out.push(q);
  }
  return shuffle(out);
}

/**
 * Run one plan block; remaining blocks continue from the results screen.
 * @param {object} block @param {object[]} rest
 */
export async function runPlanBlock(block, rest) {
  const plan = rest && rest.length ? rest : null;
  if (block.kind === 'review') {
    const ids = dueQueue(app.user).slice(0, block.count);
    const qs = await questionsByIds(ids);
    if (!qs.length) { toast('Nothing due — moving on.'); if (plan) runPlanBlock(plan[0], plan.slice(1)); return; }
    startSession({ mode: 'review', title: block.label, questions: qs, plan });
  } else if (block.kind === 'mistakes') {
    const ids = (app.user.mistakeBook || []).filter((m) => !m.resolved).sort((a, b) => b.repeatCount - a.repeatCount || b.date.localeCompare(a.date)).slice(0, block.count).map((m) => m.questionId);
    const qs = await questionsByIds(ids);
    if (!qs.length) { toast('No open mistakes — moving on.'); if (plan) runPlanBlock(plan[0], plan.slice(1)); return; }
    startSession({ mode: 'review', title: block.label, questions: qs, plan });
  } else if (block.kind === 'rapid') {
    const pool = await questionsOfChapters(block.chapterIds);
    const qs = pickTargeted(pool, block.count);
    startSession({ mode: 'rapid', title: block.label, questions: qs, perQuestionSec: 30, feedback: 'immediate', plan });
  } else {
    const pool = await questionsOfChapters(block.chapterIds);
    const qs = pickTargeted(pool, block.count);
    const ch = app.catalog.chapterById.get(block.chapterIds[0]);
    startSession({ mode: 'practice', title: block.label, questions: qs, pool, scope: { category: ch?.category, subjectId: ch?.subjectId, chapterIds: block.chapterIds }, plan });
  }
}

/** @param {HTMLElement} view */
export function renderStudyNow(view) {
  const minutesDefault = app.user.profile.dailyMinutes || app.config.studyNow?.defaultMinutes || 35;
  let minutes = minutesDefault;
  let subjectFilter = 'all';
  const out = h('div');
  const minutesSel = h('div', { class: 'seg', role: 'group', 'aria-label': 'Available time' });
  const subs = activeSubjectIds();
  const subjSel = h('select', { class: 'input-full', 'aria-label': 'Subjects', onchange: () => { subjectFilter = subjSel.value; build(); } },
    h('option', { value: 'all' }, 'All active subjects (mixed by exam profile)'), ...subs.map((s) => h('option', { value: s }, subjectName(s))));
  const paintMinutes = () => mount(minutesSel, [10, 20, 35, 60, 90].map((m) => h('button', { 'aria-pressed': String(m === minutes), onclick: () => { minutes = m; paintMinutes(); build(); } }, m + 'm')));
  paintMinutes();

  function build() {
    mount(out, skeleton(2));
    const ranked = rankChapters(app.user, { subjectIds: subjectFilter === 'all' ? subs : [subjectFilter] });
    if (!ranked.length) { mount(out, h('div', { class: 'callout warn' }, 'Your active subjects have no questions yet. Choose subjects with questions in Settings → Active subjects.')); return; }
    const due = dueQueue(app.user, subjectFilter === 'all' ? null : subjectFilter).length;
    const mistakes = (app.user.mistakeBook || []).filter((m) => !m.resolved && (subjectFilter === 'all' || m.subjectId === subjectFilter)).length;
    // Mix subjects: take the best chapter of each subject first (exam-profile importance already in priority).
    const bySub = new Map();
    for (const r of ranked) if (!bySub.has(r.subjectId)) bySub.set(r.subjectId, r);
    const mixed = [...[...bySub.values()].sort((a, b) => b.priority - a.priority), ...ranked.filter((r) => bySub.get(r.subjectId) !== r)];
    const plan = buildPlan({ minutes, dueCount: due, mistakeCount: mistakes, ranked: mixed, minutesPerQuestion: app.config.studyNow?.minutesPerQuestion });
    const top = mixed[0];
    mount(out,
      h('section', { class: 'card' },
        h('div', { class: 'card-title' }, h('h2', null, `Your ${minutes}-minute plan`), h('span', { class: 'badge' }, `${plan.length} blocks`)),
        plan.map((b, i) => h('div', { class: 'plan-block' },
          h('div', { class: 'plan-min' }, h('div', null, String(b.minutes), h('small', null, 'min'))),
          h('div', { class: 'grow' }, h('div', null, `${i + 1}. ${b.label}`), h('div', { class: 'small muted' }, `${b.count} question${b.count > 1 ? 's' : ''}` + (b.kind === 'review' ? ` · ${due} due` : ''))),
          h('button', { class: 'btn btn-primary btn-sm', 'aria-label': 'Start block ' + (i + 1), onclick: () => runPlanBlock(b, plan.slice(i + 1)) }, icon('play'))))),
      top ? h('section', { class: 'card' },
        h('h2', null, 'Why these chapters?'),
        h('p', null, h('strong', null, top.title), ` (${subjectName(top.subjectId)}) is first because ${top.reasons.join(', ')}.`),
        h('ol', { class: 'stack-sm', style: { paddingLeft: '1.2rem' } }, mixed.slice(0, 5).map((r) => h('li', null, `${r.title} — priority ${pct(r.priority)}`, h('span', { class: 'small muted' }, ' · ' + r.reasons.join(', ')))))) : null);
  }
  build();
  mount(view,
    h('h1', null, '🎯 ' + t('home.studyNow')),
    h('section', { class: 'card' },
      h('p', { class: 'muted' }, 'A personalised session built from your weak chapters, recent mistakes, due reviews, forgetting risk, chapter importance and exam date.'),
      h('div', { class: 'form-grid' }, h('div', null, h('div', { class: 'section-label mb-2' }, 'Time available'), minutesSel), subjSel)),
    out);
}

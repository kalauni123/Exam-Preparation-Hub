/**
 * Shared learner analytics derived from the user document + catalog (used by many screens).
 * @module features/insights
 */
import { app, activeSubjectIds, chapterImportance } from '../state.js';
import { currentHealth, statusFromHealth } from '../engine/memoryMap.js';
import { forgettingRisk } from '../engine/forgettingRisk.js';
import { dueQuestionIds } from '../engine/spacedRepetition.js';
import { chapterPriority, examProximityWeight, mistakeRecency } from '../engine/recommender.js';
import { masteryOf } from '../engine/learner.js';
import { strengthByGroup } from '../engine/mastery.js';
import { confidenceLabel } from '../engine/stats.js';

/**
 * Per-chapter state at `now`.
 * @param {object} user @param {number} [now]
 * @returns {Map<string,{attempts:number,correct:number,health:number|null,status:string,risk:number,dueNow:boolean,mistakeDates:string[],rootCause?:string,nextReview?:string,lastReview?:string,stability?:number}>}
 */
export function chapterStats(user, now = Date.now()) {
  const out = new Map();
  if (!user) return out;
  const wR = app.config.memory?.retentionWeight ?? 0.6;
  const k = app.config.forgetting?.weibullK ?? 1;
  for (const [key, st] of Object.entries(user.conceptState || {})) {
    if (key.includes('#')) continue;
    const health = st.lastReview ? currentHealth(st, now, wR) : null;
    out.set(key, {
      attempts: st.attempts || 0, correct: st.correct || 0, health,
      status: health === null ? 'none' : statusFromHealth(health),
      risk: forgettingRisk(st, now, k), dueNow: !!st.nextReview && Date.parse(st.nextReview) <= now,
      mistakeDates: [], rootCause: st.rootCause, nextReview: st.nextReview, lastReview: st.lastReview, stability: st.stability,
    });
  }
  for (const m of user.mistakeBook || []) {
    if (m.resolved) continue;
    const s = out.get(m.chapterId);
    if (s) s.mistakeDates.push(m.date);
  }
  return out;
}

/**
 * Concept-tag stats inside one chapter.
 * @param {object} user @param {string} chapterId
 * @returns {Array<{concept:string,score:number,n:number,confidence:string}>}
 */
export function conceptStats(user, chapterId) {
  const g = strengthByGroup((user.attempts || []).filter((a) => a.chapterId === chapterId && a.concept), (a) => a.concept);
  return Object.entries(g).map(([concept, v]) => ({ concept, score: v.score, n: v.n, confidence: v.confidence })).sort((a, b) => a.score - b.score);
}

/**
 * Subject-level summary.
 * @param {object} user @param {string} subjectId @param {Map} [cs] chapterStats
 */
export function subjectSummary(user, subjectId, cs = chapterStats(user)) {
  const sub = app.catalog.subjectById.get(subjectId);
  const atts = (user.attempts || []).filter((a) => a.subjectId === subjectId);
  const withQ = sub.chapters.filter((c) => c.questionCount > 0);
  const healths = sub.chapters.map((c) => cs.get(c.id)?.health).filter((x) => x !== null && x !== undefined);
  const touched = sub.chapters.filter((c) => (cs.get(c.id)?.attempts || 0) > 0).length;
  return {
    subjectId, name: sub.name, category: sub.category, attempts: atts.length,
    accuracy: atts.length ? atts.filter((a) => a.isCorrect).length / atts.length : null,
    mastery: atts.length ? masteryOf(atts, app.config.masteryWeights) : null,
    health: healths.length ? healths.reduce((a, b) => a + b, 0) / healths.length : null,
    coverage: withQ.length ? touched / withQ.length : 0,
    chaptersWithQuestions: withQ.length, confidence: confidenceLabel(atts.length),
  };
}

/** Number and ids of questions due for review now. @param {object} user */
export function dueQueue(user, subjectFilter) {
  const ids = dueQuestionIds(user?.questionState || {});
  if (!subjectFilter) return ids;
  return ids.filter((id) => app.catalog.chapterById.get(chapterOfQuestion(id))?.subjectId === subjectFilter);
}

/** Chapter id embedded in a question id ("QM1-05-0003" → "QM1-05"). @param {string} qid */
export function chapterOfQuestion(qid) {
  const m = /^(.*-\d{2})-\d{4}$/.exec(qid);
  return m ? m[1] : '';
}

/**
 * Daily streak (consecutive days with at least one attempt, ending today or yesterday).
 * @param {object} user @returns {number}
 */
export function streak(user) {
  const days = new Set((user.attempts || []).map((a) => a.ts.slice(0, 10)));
  let n = 0;
  const d = new Date();
  if (!days.has(d.toISOString().slice(0, 10))) d.setDate(d.getDate() - 1);
  while (days.has(d.toISOString().slice(0, 10))) { n++; d.setDate(d.getDate() - 1); }
  return n;
}

/** Minutes studied per day from attempt times. @param {object} user @returns {Object<string,number>} */
export function minutesByDay(user) {
  const m = {};
  for (const a of user.attempts || []) {
    const k = a.ts.slice(0, 10);
    m[k] = (m[k] || 0) + Math.min(a.timeMs || 0, 300000) / 60000;
  }
  return m;
}

/**
 * Rank chapters (with questions, in active subjects) by study priority.
 * @param {object} user @param {{subjectIds?:string[], now?:number}} [opt]
 * @returns {Array<{chapterId:string,title:string,subjectId:string,priority:number,reasons:string[],available:number,status:string,health:number|null}>}
 */
export function rankChapters(user, opt = {}) {
  const now = opt.now ?? Date.now();
  const cs = chapterStats(user, now);
  const subs = opt.subjectIds || activeSubjectIds();
  const prox = examProximityWeight(user.profile.examDate, now);
  const dueIds = dueQuestionIds(user.questionState || {}, now);
  const dueChapters = new Set(dueIds.map(chapterOfQuestion));
  const w = app.config.studyNow?.weights;
  const out = [];
  for (const sid of subs) {
    const sub = app.catalog.subjectById.get(sid);
    if (!sub) continue;
    for (const ch of sub.chapters) {
      if (!ch.questionCount) continue;
      const s = cs.get(ch.id);
      const f = {
        health: s?.health ?? 0.35,
        mistakeRecency: mistakeRecency(s?.mistakeDates || [], now),
        examProximity: prox,
        importance: chapterImportance(ch.id),
        dueNow: (s?.dueNow || dueChapters.has(ch.id)) ? 1 : 0,
        forgettingRisk: s?.risk ?? 0,
      };
      const p = chapterPriority(f, w);
      if (!s) p.reasons = ['you have not practised it yet', ...p.reasons].slice(0, 3);
      out.push({ chapterId: ch.id, title: ch.title, subjectId: sid, priority: p.priority, reasons: p.reasons, available: ch.questionCount, status: s?.status || 'none', health: s?.health ?? null });
    }
  }
  return out.sort((a, b) => b.priority - a.priority);
}

/**
 * Today-card data.
 * @param {object} user
 */
export function todayData(user) {
  const now = Date.now();
  const cs = chapterStats(user, now);
  const threshold = app.config.forgetting?.riskThreshold ?? 0.5;
  const atRisk = [...cs.entries()].filter(([, s]) => s.risk >= threshold && s.attempts > 0).sort((a, b) => b[1].risk - a[1].risk).slice(0, 3)
    .map(([id, s]) => ({ chapterId: id, title: app.catalog.chapterById.get(id)?.title || id, risk: s.risk }));
  const due = dueQuestionIds(user.questionState || {}, now).length;
  const todayKey = new Date().toISOString().slice(0, 10);
  const minutesToday = minutesByDay(user)[todayKey] || 0;
  return { due, atRisk, streak: streak(user), minutesToday, goal: user.profile.dailyMinutes || 35 };
}

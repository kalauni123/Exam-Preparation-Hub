/**
 * Learner-state transitions: the single place where an answered question updates every
 * model (attempt log, BKT, SM-2, memory health, question ladder, mistake book, error model,
 * prerequisite propagation) and where a finished session updates EWMA, IRT θ and skills.
 * Functions mutate the passed user document and return a summary of what changed.
 * @module engine/learner
 */
import { bktUpdate, BKT_DEFAULTS, propagateSuspicion, recentFailures } from './bkt.js';
import { qualityFromResponse, sm2Update, ladderUpdate } from './spacedRepetition.js';
import { memoryHealth, statusFromHealth, currentHealth } from './memoryMap.js';
import { itemBeta, classifyTime, learnerTau, speedSkill } from './responseTime.js';
import { classifyError, updateModel } from './errorClassifier.js';
import { skillScores, overallMastery, ewmaSeries } from './mastery.js';
import { eapEstimate } from './irt.js';

let seq = 0;
/** Short unique id. @param {string} p prefix @returns {string} */
export function uid(p) {
  seq = (seq + 1) % 1e6;
  return p + '-' + Date.now().toString(36) + '-' + seq.toString(36) + Math.random().toString(36).slice(2, 6);
}

/**
 * Apply BKT + SM-2 to one concept-state key.
 * @returns {object} new state
 */
function updateConcept(prev, correct, quality, now, cfg) {
  const p = { ...BKT_DEFAULTS, ...(cfg.bkt || {}) };
  const pL = prev?.bktPKnown ?? p.pL0;
  const { next } = bktUpdate(pL, correct, p);
  const sm = sm2Update(prev || {}, quality, now);
  const init = cfg.memory?.initialStabilityDays ?? 1.5;
  const stability = correct ? Math.max(init, sm.interval * 1.2) : init;
  const st = { ...(prev || {}), ...sm, bktPKnown: next, stability, attempts: (prev?.attempts || 0) + 1, correct: (prev?.correct || 0) + (correct ? 1 : 0) };
  st.memoryHealth = memoryHealth(1, next, cfg.memory?.retentionWeight ?? 0.6);
  st.status = statusFromHealth(st.memoryHealth);
  return st;
}

/**
 * Record one answered question.
 * @param {object} user user document (schema v2), mutated
 * @param {{question:object, category:string, subjectId:string, chapterId:string, selected:string|null,
 *          timeMs:number, confidence?:number, changedAnswer?:boolean, mode:string, sessionId:string,
 *          bookmarked?:boolean}} input
 * @param {{config?:object, incoming?:Map, now?:number}} [ctx]
 * @returns {{attempt:object, time:object, errorType:string|null, errorProbs:object|null, propagation:object|null}}
 */
export function recordAttempt(user, input, ctx = {}) {
  const cfg = ctx.config || {};
  const now = ctx.now ?? Date.now();
  const q = input.question;
  const selected = input.selected ?? null;
  const isCorrect = selected !== null && selected === q.answer;
  const beta = itemBeta(q);
  const tau = user.abilities?.tau ?? 0;
  const time = classifyTime(isCorrect, input.timeMs, beta, tau);
  const confidence = input.confidence ?? 2;
  const attempt = {
    attemptId: uid('a'), ts: new Date(now).toISOString(), sessionId: input.sessionId, mode: input.mode,
    questionId: q.id, category: input.category, subjectId: input.subjectId, chapterId: input.chapterId,
    concept: q.concept || '', qType: q.type || 'conceptual', b: q.difficulty?.b ?? 0,
    selected, correct: q.answer, isCorrect, timeMs: Math.round(input.timeMs), confidence,
    changedAnswer: !!input.changedAnswer, bookmarked: !!input.bookmarked, beta, z: time.z,
  };

  // Memory models: chapter key and optional chapter#concept key.
  const quality = qualityFromResponse(isCorrect, time.ratio, confidence);
  user.conceptState = user.conceptState || {};
  const keys = [input.chapterId];
  if (q.concept) keys.push(input.chapterId + '#' + q.concept);
  for (const k of keys) user.conceptState[k] = updateConcept(user.conceptState[k], isCorrect, quality, now, cfg);

  // Per-question review ladder.
  user.questionState = user.questionState || {};
  const ls = ladderUpdate(user.questionState[q.id], isCorrect, now);
  if (ls) user.questionState[q.id] = ls;

  // Error analysis & mistake book.
  let errorType = null;
  let errorProbs = null;
  if (!isCorrect) {
    const tag = selected && q.distractorTags ? q.distractorTags[selected] : undefined;
    const ev = { tag, rushing: time.rushing || selected === null, slow: time.ratio > 2, confidence, changed: !!input.changedAnswer };
    const res = classifyError(user.errorModel, ev, input.category === 'aptitude');
    errorType = res.type;
    errorProbs = res.probs;
    user.errorModel = updateModel(user.errorModel, errorType, tag);
    attempt.errorType = errorType;
    user.mistakeBook = user.mistakeBook || [];
    const existing = user.mistakeBook.find((m) => m.questionId === q.id);
    if (existing) {
      existing.repeatCount += 1; existing.date = attempt.ts; existing.errorType = errorType; existing.resolved = false;
    } else {
      user.mistakeBook.push({ questionId: q.id, chapterId: input.chapterId, subjectId: input.subjectId, category: input.category, concept: q.concept || '', date: attempt.ts, errorType, repeatCount: 1, note: '', resolved: false });
    }
  } else if (user.mistakeBook) {
    const m = user.mistakeBook.find((x) => x.questionId === q.id);
    if (m) m.resolved = true;
  }

  user.attempts = user.attempts || [];
  user.attempts.push(attempt);

  // Backward propagation when a chapter keeps failing.
  let propagation = null;
  const bk = cfg.bkt || {};
  if (!isCorrect && ctx.incoming && recentFailures(user.attempts, input.chapterId, bk.failureWindow ?? 5) >= (bk.failureThreshold ?? 3)) {
    const res = propagateSuspicion(input.chapterId, ctx.incoming, user.conceptState, { lambda: bk.propagationLambda ?? 0.85 });
    if (res.affected.length) {
      user.conceptState = res.state;
      for (const a of res.affected) {
        const st = user.conceptState[a.chapterId];
        if (st.lastReview) {
          st.memoryHealth = currentHealth(st, now, cfg.memory?.retentionWeight ?? 0.6);
          st.status = statusFromHealth(st.memoryHealth);
        }
      }
      user.conceptState[input.chapterId].rootCause = res.rootCause;
      propagation = res;
    }
  }
  if (user.meta) user.meta.updatedAt = attempt.ts;
  return { attempt, time, errorType, errorProbs, propagation };
}

/**
 * Recompute the six skill scores from the full attempt history.
 * @param {object} user @param {{now?:number, halfLifeDays?:number}} [opt]
 * @returns {object} skills (0..1, null when unknown)
 */
export function recomputeSkills(user, opt = {}) {
  const atts = user.attempts || [];
  const { scores } = skillScores(atts, opt);
  const recent = atts.slice(-300);
  const speed = speedSkill(recent.map((a) => ({ z: a.z, isCorrect: a.isCorrect })));
  user.skills = {
    conceptual: scores.conceptual, numerical: scores.numerical, memory: scores.memory,
    application: scores.application, speed, accuracy: scores.accuracy,
  };
  return user.skills;
}

/**
 * Overall mastery of the user (or a filtered subset of attempts).
 * @param {object[]} attempts @param {object} [weights] @param {object} [opt]
 * @returns {number|null}
 */
export function masteryOf(attempts, weights, opt = {}) {
  const { scores } = skillScores(attempts, opt);
  const speed = speedSkill(attempts.slice(-300).map((a) => ({ z: a.z, isCorrect: a.isCorrect })));
  return overallMastery({ ...scores, speed }, weights);
}

/**
 * Finish a session: store it, extend the EWMA trend, re-estimate θ (overall, per subject and
 * per skill) by EAP, recompute skills and learner speed τ.
 * @param {object} user
 * @param {{sessionId:string, mode:string, startedAt:string, scope:object}} session
 * @param {{config?:object, now?:number, questionIndex?:Map<string,object>}} [ctx]
 * @returns {object} stored session record
 */
export function finalizeSession(user, session, ctx = {}) {
  const now = ctx.now ?? Date.now();
  const cfg = ctx.config || {};
  const atts = (user.attempts || []).filter((a) => a.sessionId === session.sessionId);
  const score = atts.filter((a) => a.isCorrect).length;
  const rec = { ...session, endedAt: new Date(now).toISOString(), score, total: atts.length };
  user.sessions = user.sessions || [];
  if (!atts.length) return rec;
  user.sessions.push(rec);

  // EWMA trend over per-session percentage.
  const pct = (100 * score) / atts.length;
  const raw = [...(user.trend?.raw || []), pct].slice(-200);
  const ew = ewmaSeries(raw, cfg.ewma?.alpha ?? 0.3);
  user.trend = { raw, ewma: [...(user.trend?.ewma || []), { ts: rec.endedAt, value: ew[ew.length - 1], raw: pct, sessionId: rec.sessionId }].slice(-200) };

  // IRT ability (EAP) from recent responses.
  const recent = (user.attempts || []).slice(-250);
  const resp = recent.map((a) => {
    const d = ctx.questionIndex?.get(a.questionId)?.difficulty || { a: 1, b: a.b ?? 0, c: 0.25 };
    return { a: d.a ?? 1, b: d.b ?? 0, c: d.c ?? 0.25, correct: a.isCorrect, subjectId: a.subjectId, qType: a.qType };
  });
  const overall = eapEstimate(resp);
  const bySubject = {};
  const bySkill = {};
  for (const sid of new Set(resp.map((r) => r.subjectId))) bySubject[sid] = eapEstimate(resp.filter((r) => r.subjectId === sid));
  for (const t of new Set(resp.map((r) => r.qType))) bySkill[t] = eapEstimate(resp.filter((r) => r.qType === t));
  user.abilities = { ...(user.abilities || {}), theta: overall.theta, se: overall.se, bySubject, bySkill };
  user.abilities.tau = learnerTau(recent.map((a) => ({ beta: a.beta ?? 3.8, timeMs: a.timeMs })));
  recomputeSkills(user, { now, halfLifeDays: cfg.recencyHalfLifeDays ?? 21 });
  return rec;
}

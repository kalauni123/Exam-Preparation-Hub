/**
 * Section 9.7 — Score prediction with Beta–Binomial posteriors and Monte Carlo simulation.
 * Runs in a Web Worker (prediction.worker.js) with a main-thread fallback.
 * @module engine/prediction
 */
import { recencyWeight, betaSample, mulberry32, logistic, logit, quantile, mean } from './stats.js';

/**
 * Beta posterior from recency-weighted counts:  α = α₀ + Σw·correct,  β = β₀ + Σw·wrong.
 * @param {Array<{ts:string,isCorrect:boolean}>} attempts
 * @param {{now?:number,halfLifeDays?:number,priorAlpha?:number,priorBeta?:number}} [opt]
 * @returns {{alpha:number,beta:number,n:number,mean:number}}
 */
export function betaPosterior(attempts, opt = {}) {
  const now = opt.now ?? Date.now();
  const hl = opt.halfLifeDays ?? 21;
  let a = opt.priorAlpha ?? 2;
  let b = opt.priorBeta ?? 2;
  for (const t of attempts) {
    const w = recencyWeight(t.ts, now, hl);
    if (t.isCorrect) a += w; else b += w;
  }
  return { alpha: a, beta: b, n: attempts.length, mean: a / (a + b) };
}

/**
 * @typedef {Object} SimSection
 * @property {string} name
 * @property {number} questionCount
 * @property {number} marksPerQuestion
 * @property {number} negativeMarking marks deducted per wrong answer
 * @property {Array<{subjectId:string,alpha:number,beta:number}>} subjects
 * @property {number[]} bValues IRT b-values available in the bank for these subjects
 */

/**
 * Monte Carlo exam simulation. For every simulation and section, a success probability is
 * drawn per subject from its Beta posterior, adjusted per question by bank difficulty
 *   p_q = σ(logit(p_s) − 0.6·(b_q − b̄)),
 * and every question is answered (correct → +marks, wrong → −negative).
 * @param {{sections:SimSection[], sims?:number, seed?:number}} spec
 * @returns {{scores:number[], maxScore:number, median:number, lo:number, hi:number, meanPct:number, medianPct:number, loPct:number, hiPct:number, readiness:string}}
 */
export function simulateExam(spec) {
  const sims = Math.max(1000, spec.sims ?? 5000);
  const rand = mulberry32(spec.seed ?? 12345);
  const sections = spec.sections.filter((s) => s.questionCount > 0 && s.subjects.length);
  const maxScore = sections.reduce((s, x) => s + x.questionCount * x.marksPerQuestion, 0);
  const scores = new Array(sims);
  const bMeans = sections.map((s) => (s.bValues.length ? mean(s.bValues) : 0));
  for (let k = 0; k < sims; k++) {
    let score = 0;
    for (let si = 0; si < sections.length; si++) {
      const sec = sections[si];
      const ps = sec.subjects.map((sub) => betaSample(sub.alpha, sub.beta, rand));
      for (let q = 0; q < sec.questionCount; q++) {
        const p0 = ps[Math.floor(rand() * ps.length)];
        const b = sec.bValues.length ? sec.bValues[Math.floor(rand() * sec.bValues.length)] : 0;
        const p = logistic(logit(p0) - 0.6 * (b - bMeans[si]));
        score += rand() < p ? sec.marksPerQuestion : -sec.negativeMarking;
      }
    }
    scores[k] = score;
  }
  const median = quantile(scores, 0.5);
  const lo = quantile(scores, 0.1);
  const hi = quantile(scores, 0.9);
  const pct = (x) => (maxScore ? (100 * x) / maxScore : 0);
  return {
    scores, maxScore, median, lo, hi,
    meanPct: pct(mean(scores)), medianPct: pct(median), loPct: pct(lo), hiPct: pct(hi),
    readiness: readinessLabel(pct(median)),
  };
}

/**
 * Plain-language readiness label from a median percentage.
 * @param {number} pct @returns {string}
 */
export function readinessLabel(pct) {
  if (pct >= 70) return 'Exam-ready';
  if (pct >= 55) return 'Almost ready';
  if (pct >= 40) return 'Building up';
  return 'Not ready yet';
}

/**
 * Turn an exam profile + posteriors into a simulation spec. Sections whose blueprint numbers
 * are still null are skipped; if none remain, `generic` is true and the caller should use
 * {@link genericSpec}.
 * @param {object} profile exam profile from examProfiles.json
 * @param {Object<string,{alpha:number,beta:number}>} posteriors by subjectId
 * @param {Object<string,number[]>} bBySubject IRT b-values per subject
 * @returns {{sections:SimSection[], generic:boolean, missing:string[]}}
 */
export function profileSpec(profile, posteriors, bBySubject) {
  const sections = [];
  const missing = [];
  for (const paper of profile?.papers || []) {
    for (const s of paper.sections || []) {
      if (!(s.questionCount > 0) || !(s.marksPerQuestion > 0)) { missing.push(s.name); continue; }
      const subs = s.subjectIds.filter((id) => posteriors[id]).map((id) => ({ subjectId: id, ...posteriors[id] }));
      const used = subs.length ? subs : s.subjectIds.map((id) => ({ subjectId: id, alpha: 2, beta: 2 }));
      sections.push({
        name: s.name, questionCount: s.questionCount, marksPerQuestion: s.marksPerQuestion,
        negativeMarking: s.negativeMarking || 0, subjects: used,
        bValues: s.subjectIds.flatMap((id) => bBySubject[id] || []),
      });
    }
  }
  return { sections, generic: sections.length === 0, missing };
}

/**
 * Generic per-subject spec: 100 one-mark questions, no negative marking, per subject.
 * @param {Object<string,{alpha:number,beta:number}>} posteriors
 * @param {Object<string,number[]>} bBySubject
 * @returns {SimSection[]}
 */
export function genericSpec(posteriors, bBySubject) {
  return Object.entries(posteriors).map(([id, p]) => ({
    name: id, questionCount: 100, marksPerQuestion: 1, negativeMarking: 0,
    subjects: [{ subjectId: id, ...p }], bValues: bBySubject[id] || [],
  }));
}

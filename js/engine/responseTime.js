/**
 * Section 9.4 — Lognormal response-time model.
 *   ln(T_ij) ~ N(β_j − τ_i, σ²)
 * β_j = item time intensity (cohort mean log-time or a per-type/difficulty default),
 * τ_i = learner speed (positive = faster than expected).
 * @module engine/responseTime
 */
import { mean, normalCdf } from './stats.js';

/** Default expected seconds per question type at difficulty b = 0. */
export const BASE_SECONDS = Object.freeze({ conceptual: 45, numerical: 90, memory: 30, application: 60 });

/** Default residual SD of log-time. */
export const SIGMA = 0.5;

/**
 * Item time intensity β_j (log-seconds).
 * @param {{type?:string,difficulty?:{b?:number}}} q
 * @param {number[]} [cohortLogTimes] observed ln(seconds) from other learners
 * @returns {number}
 */
export function itemBeta(q, cohortLogTimes) {
  if (cohortLogTimes && cohortLogTimes.length >= 10) return mean(cohortLogTimes);
  const base = BASE_SECONDS[q?.type] || BASE_SECONDS.conceptual;
  const b = q?.difficulty?.b ?? 0;
  return Math.log(base) + 0.25 * b;
}

/**
 * Learner speed τ_i = mean(β_j − ln t_ij) shrunk toward 0 with k pseudo-observations.
 * @param {Array<{beta:number,timeMs:number}>} history @param {number} [k=5]
 * @returns {number}
 */
export function learnerTau(history, k = 5) {
  const d = history.filter((h) => h.timeMs > 0).map((h) => h.beta - Math.log(h.timeMs / 1000));
  if (!d.length) return 0;
  return (d.reduce((s, x) => s + x, 0)) / (d.length + k);
}

/**
 * z-score of an observed time:  z = (ln t − (β − τ)) / σ.
 * @param {number} timeMs @param {number} beta @param {number} [tau=0] @param {number} [sigma=SIGMA]
 * @returns {number}
 */
export function timeZ(timeMs, beta, tau = 0, sigma = SIGMA) {
  return (Math.log(Math.max(0.2, timeMs / 1000)) - (beta - tau)) / sigma;
}

/**
 * Classify one response.
 *   speedDeficit: correct but t > 3× expected
 *   rushing:      wrong and t < ¼ expected (z < −2.77 ≈ ln 4/σ)
 * @param {boolean} correct @param {number} timeMs @param {number} beta @param {number} [tau=0]
 * @returns {{expectedMs:number, ratio:number, z:number, speedDeficit:boolean, rushing:boolean}}
 */
export function classifyTime(correct, timeMs, beta, tau = 0) {
  const expectedMs = Math.exp(beta - tau) * 1000;
  const ratio = timeMs / expectedMs;
  const z = timeZ(timeMs, beta, tau);
  return { expectedMs, ratio, z, speedDeficit: correct && ratio > 3, rushing: !correct && ratio < 0.25 };
}

/**
 * Speed skill in [0,1]: mean of Φ(−z) over correct responses (being faster than expected
 * scores high; extreme rushing on wrong answers is excluded from this skill).
 * @param {Array<{z:number,isCorrect:boolean}>} items @returns {number|null}
 */
export function speedSkill(items) {
  const xs = items.filter((i) => i.isCorrect && Number.isFinite(i.z)).map((i) => normalCdf(-i.z));
  return xs.length ? mean(xs) : null;
}

/**
 * Section 9.5 — Forgetting-risk prediction with a Weibull hazard.
 *   h(t) = (k/S)(t/S)^(k−1),  Surv(t) = exp(−(t/S)^k),  risk = 1 − Surv(t_now)
 * With k = 1 this is the Ebbinghaus exponential curve.
 * @module engine/forgettingRisk
 */
import { DAY_MS } from './stats.js';

/** @param {number} t days @param {number} S stability @param {number} [k=1] @returns {number} */
export function hazard(t, S, k = 1) {
  if (S <= 0) return Infinity;
  return (k / S) * Math.pow(Math.max(t, 1e-9) / S, k - 1);
}

/** @param {number} t days @param {number} S stability @param {number} [k=1] @returns {number} */
export function survival(t, S, k = 1) {
  if (S <= 0) return 0;
  return Math.exp(-Math.pow(Math.max(0, t) / S, k));
}

/**
 * Forgetting risk at `now` for a concept state.
 * @param {{stability?:number,lastReview?:string}} st @param {number} [now=Date.now()] @param {number} [k=1]
 * @returns {number} risk in [0,1] (0 when never reviewed)
 */
export function forgettingRisk(st, now = Date.now(), k = 1) {
  if (!st || !st.lastReview) return 0;
  const t = (now - Date.parse(st.lastReview)) / DAY_MS;
  return 1 - survival(t, st.stability || 1, k);
}

/**
 * Points for a small forgetting-curve chart.
 * @param {number} S @param {number} [days=30] @param {number} [k=1] @param {number} [steps=30]
 * @returns {Array<{t:number,s:number}>}
 */
export function curvePoints(S, days = 30, k = 1, steps = 30) {
  const pts = [];
  for (let i = 0; i <= steps; i++) {
    const t = (days * i) / steps;
    pts.push({ t, s: survival(t, S, k) });
  }
  return pts;
}

/**
 * Section 9.2 — Memory strength (Ebbinghaus retention × BKT) and fuzzy status zones.
 * @module engine/memoryMap
 */
import { DAY_MS, clamp } from './stats.js';

/**
 * Ebbinghaus retention  R(t) = exp(−t/S).
 * @param {number} tDays days since last review @param {number} S stability in days
 * @returns {number}
 */
export function retention(tDays, S) {
  if (S <= 0) return 0;
  return Math.exp(-Math.max(0, tDays) / S);
}

/**
 * Memory health  H = R(t)^(2·wR) · K^(2·(1−wR))  — the product H = R·K of the specification,
 * written as a weighted product so the blend can be tuned. With wR = 0.5 it is exactly R·K;
 * the default wR = 0.6 (0.6 retention / 0.4 BKT) gives R^1.2 · K^0.8.
 * H is 0 if either factor is 0 and 1 only if both are 1.
 * @param {number} R retention in [0,1] @param {number} K BKT P(known) in [0,1]
 * @param {number} [wR=0.6]
 * @returns {number}
 */
export function memoryHealth(R, K, wR = 0.6) {
  return Math.pow(clamp(R, 0, 1), 2 * wR) * Math.pow(clamp(K, 0, 1), 2 * (1 - wR));
}

/** Trapezoid membership μ(x) for corners a ≤ b ≤ c ≤ d. */
function trap(x, a, b, c, d) {
  if (x <= a || x >= d) return (x <= a && a === b) || (x >= d && c === d) ? 1 : 0;
  if (x < b) return (x - a) / (b - a);
  if (x <= c) return 1;
  return (d - x) / (d - c);
}

/**
 * Fuzzy trapezoidal memberships with ±0.05 overlap around the crisp cut points
 * 0.40 / 0.60 / 0.85.
 * @param {number} h memory health in [0,1]
 * @returns {{mastered:number,revision:number,weak:number,critical:number}}
 */
export function fuzzyMemberships(h) {
  const x = clamp(h, 0, 1);
  return {
    critical: trap(x, -1, -1, 0.35, 0.45),
    weak: trap(x, 0.35, 0.45, 0.55, 0.65),
    revision: trap(x, 0.55, 0.65, 0.80, 0.90),
    mastered: trap(x, 0.80, 0.90, 2, 2),
  };
}

/** Status keys, colours and labels. */
export const STATUS = Object.freeze({
  green: { key: 'green', zone: 'mastered', label: 'Mastered', emoji: '🟢' },
  yellow: { key: 'yellow', zone: 'revision', label: 'Needs Revision', emoji: '🟡' },
  orange: { key: 'orange', zone: 'weak', label: 'Weak', emoji: '🟠' },
  red: { key: 'red', zone: 'critical', label: 'Critical', emoji: '🔴' },
});

/**
 * Dominant fuzzy zone → status colour (ties go to the better zone).
 * @param {number} h @returns {'green'|'yellow'|'orange'|'red'}
 */
export function statusFromHealth(h) {
  const m = fuzzyMemberships(h);
  const order = [['mastered', 'green'], ['revision', 'yellow'], ['weak', 'orange'], ['critical', 'red']];
  let best = order[3];
  let bestVal = -1;
  for (const z of order) {
    if (m[z[0]] > bestVal + 1e-9) { best = z; bestVal = m[z[0]]; }
  }
  return /** @type any */ (best[1]);
}

/**
 * Current memory health of a concept state at time `now`.
 * @param {{bktPKnown?:number,stability?:number,lastReview?:string}} st
 * @param {number} [now=Date.now()] @param {number} [wR=0.6]
 * @returns {number}
 */
export function currentHealth(st, now = Date.now(), wR = 0.6) {
  if (!st || !st.lastReview) return 0;
  const t = (now - Date.parse(st.lastReview)) / DAY_MS;
  return memoryHealth(retention(t, st.stability || 1), st.bktPKnown ?? 0.3, wR);
}

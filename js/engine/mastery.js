/**
 * Section 9.1 — Overall mastery (weighted aggregation) and EWMA trend.
 * @module engine/mastery
 */
import { recencyWeight, lsSlope, confidenceLabel } from './stats.js';

/** Default mastery weights (Σ = 1). */
export const DEFAULT_WEIGHTS = Object.freeze({
  conceptual: 0.25, numerical: 0.2, memory: 0.15, application: 0.2, speed: 0.1, accuracy: 0.1,
});

/** Question types that feed type-based skills. */
export const TYPE_SKILLS = ['conceptual', 'numerical', 'memory', 'application'];

/**
 * Recency-weighted accuracy per question type, plus overall accuracy.
 *   score_type = Σ wᵢ·correctᵢ / Σ wᵢ,   wᵢ = 0.5^(ageᵢ/halfLife)
 * @param {Array<{ts:string,isCorrect:boolean,qType?:string}>} attempts
 * @param {{now?:number, halfLifeDays?:number}} [opt]
 * @returns {{scores:Object<string,number|null>, weights:Object<string,number>, counts:Object<string,number>}}
 */
export function skillScores(attempts, opt = {}) {
  const now = opt.now ?? Date.now();
  const hl = opt.halfLifeDays ?? 21;
  const num = {};
  const den = {};
  const cnt = {};
  for (const k of [...TYPE_SKILLS, 'accuracy']) { num[k] = 0; den[k] = 0; cnt[k] = 0; }
  for (const a of attempts) {
    const w = recencyWeight(a.ts, now, hl);
    const t = TYPE_SKILLS.includes(a.qType) ? a.qType : 'conceptual';
    const c = a.isCorrect ? 1 : 0;
    num[t] += w * c; den[t] += w; cnt[t] += 1;
    num.accuracy += w * c; den.accuracy += w; cnt.accuracy += 1;
  }
  const scores = {};
  for (const k of Object.keys(num)) scores[k] = den[k] > 0 ? num[k] / den[k] : null;
  return { scores, weights: den, counts: cnt };
}

/**
 * Overall mastery  M = Σ wᵢ·Scoreᵢ  with Σwᵢ = 1. Skills that have no data (null) are
 * dropped and the remaining weights renormalised (needed for aptitude subjects without
 * numerical items).
 * @param {Object<string,number|null>} skills scores in [0,1] or null
 * @param {Object<string,number>} [weights]
 * @returns {number|null} mastery in [0,1] or null when nothing is known
 */
export function overallMastery(skills, weights = DEFAULT_WEIGHTS) {
  let s = 0;
  let wsum = 0;
  for (const [k, w] of Object.entries(weights)) {
    const v = skills[k];
    if (v === null || v === undefined || Number.isNaN(v)) continue;
    s += w * v;
    wsum += w;
  }
  return wsum > 0 ? s / wsum : null;
}

/**
 * EWMA series  S_t = α·Y_t + (1−α)·S_{t−1},  S_0 = Y_0.
 * @param {number[]} ys @param {number} [alpha=0.3] @returns {number[]}
 */
export function ewmaSeries(ys, alpha = 0.3) {
  const out = [];
  for (let i = 0; i < ys.length; i++) out.push(i === 0 ? ys[0] : alpha * ys[i] + (1 - alpha) * out[i - 1]);
  return out;
}

/**
 * Trend label from the least-squares slope of the last N points (values in %-points per test).
 * Improving if slope > +threshold, Declining if slope < −threshold, else Stable.
 * @param {number[]} series values in percent @param {number} [window=8] @param {number} [threshold=1.5]
 * @returns {{slope:number,label:'Improving'|'Stable'|'Declining',arrow:string}}
 */
export function trendLabel(series, window = 8, threshold = 1.5) {
  const tail = series.slice(-window);
  const slope = lsSlope(tail);
  if (tail.length >= 2 && slope > threshold) return { slope, label: 'Improving', arrow: '↑' };
  if (tail.length >= 2 && slope < -threshold) return { slope, label: 'Declining', arrow: '↓' };
  return { slope, label: 'Stable', arrow: '→' };
}

/**
 * Recency-weighted strength of arbitrary groups (category, subject, chapter, concept).
 * @param {Array<object>} attempts
 * @param {(a:object)=>string|null} keyFn group key per attempt (null = skip)
 * @param {{now?:number, halfLifeDays?:number}} [opt]
 * @returns {Object<string,{score:number,n:number,weight:number,confidence:string,correct:number}>}
 */
export function strengthByGroup(attempts, keyFn, opt = {}) {
  const now = opt.now ?? Date.now();
  const hl = opt.halfLifeDays ?? 21;
  const acc = {};
  for (const a of attempts) {
    const k = keyFn(a);
    if (!k) continue;
    const w = recencyWeight(a.ts, now, hl);
    const g = acc[k] || (acc[k] = { num: 0, den: 0, n: 0, correct: 0 });
    g.num += w * (a.isCorrect ? 1 : 0);
    g.den += w;
    g.n += 1;
    if (a.isCorrect) g.correct += 1;
  }
  const out = {};
  for (const [k, g] of Object.entries(acc)) {
    out[k] = { score: g.den ? g.num / g.den : 0, n: g.n, weight: g.den, confidence: confidenceLabel(g.n), correct: g.correct };
  }
  return out;
}

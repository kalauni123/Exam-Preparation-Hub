/**
 * Shared numeric helpers for the NeuroMCQ engine. Pure functions only.
 * @module engine/stats
 */

/** Milliseconds in one day. */
export const DAY_MS = 86400000;

/**
 * Clamp x into [lo, hi].
 * @param {number} x @param {number} lo @param {number} hi @returns {number}
 */
export function clamp(x, lo, hi) {
  return Math.min(hi, Math.max(lo, x));
}

/**
 * Arithmetic mean (0 for an empty array).
 * @param {number[]} xs @returns {number}
 */
export function mean(xs) {
  if (!xs.length) return 0;
  let s = 0;
  for (const x of xs) s += x;
  return s / xs.length;
}

/**
 * Population variance.
 * @param {number[]} xs @returns {number}
 */
export function variance(xs) {
  if (xs.length < 2) return 0;
  const m = mean(xs);
  let s = 0;
  for (const x of xs) s += (x - m) * (x - m);
  return s / xs.length;
}

/**
 * Exponential recency weight with a half-life:  w = 0.5^(Δt / halfLife).
 * @param {string|number} ts ISO time or epoch ms of the event
 * @param {number} now epoch ms
 * @param {number} halfLifeDays
 * @returns {number} weight in (0, 1]
 */
export function recencyWeight(ts, now, halfLifeDays) {
  const t = typeof ts === 'number' ? ts : Date.parse(ts);
  const ageDays = Math.max(0, (now - t) / DAY_MS);
  return Math.pow(0.5, ageDays / Math.max(0.001, halfLifeDays));
}

/**
 * Least-squares slope of ys against x = 0..n-1:
 *   slope = Σ(x−x̄)(y−ȳ) / Σ(x−x̄)²
 * @param {number[]} ys @returns {number}
 */
export function lsSlope(ys) {
  const n = ys.length;
  if (n < 2) return 0;
  const xm = (n - 1) / 2;
  const ym = mean(ys);
  let num = 0;
  let den = 0;
  for (let i = 0; i < n; i++) {
    num += (i - xm) * (ys[i] - ym);
    den += (i - xm) * (i - xm);
  }
  return den === 0 ? 0 : num / den;
}

/** Logistic function σ(x) = 1/(1+e^{−x}). @param {number} x @returns {number} */
export function logistic(x) {
  return 1 / (1 + Math.exp(-x));
}

/** Logit log(p/(1−p)) with clamping. @param {number} p @returns {number} */
export function logit(p) {
  const q = clamp(p, 1e-6, 1 - 1e-6);
  return Math.log(q / (1 - q));
}

/**
 * Standard normal CDF Φ(z) (Abramowitz–Stegun 7.1.26 erf approximation, |ε| < 1.5e-7).
 * @param {number} z @returns {number}
 */
export function normalCdf(z) {
  const x = Math.abs(z) / Math.SQRT2;
  const t = 1 / (1 + 0.3275911 * x);
  const y = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x);
  return z >= 0 ? 0.5 * (1 + y) : 0.5 * (1 - y);
}

/**
 * Seeded PRNG (mulberry32). Returns a function producing uniform numbers in [0,1).
 * @param {number} seed @returns {() => number}
 */
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function rand() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Standard normal sample via Box–Muller.
 * @param {() => number} rand @returns {number}
 */
export function normalSample(rand) {
  let u = 0;
  while (u === 0) u = rand();
  const v = rand();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

/**
 * Gamma(shape, 1) sample (Marsaglia–Tsang; boost for shape < 1).
 * @param {number} shape @param {() => number} rand @returns {number}
 */
export function gammaSample(shape, rand) {
  if (shape < 1) {
    const u = rand();
    return gammaSample(shape + 1, rand) * Math.pow(u || 1e-12, 1 / shape);
  }
  const d = shape - 1 / 3;
  const c = 1 / Math.sqrt(9 * d);
  for (;;) {
    let x;
    let v;
    do {
      x = normalSample(rand);
      v = 1 + c * x;
    } while (v <= 0);
    v = v * v * v;
    const u = rand();
    if (u < 1 - 0.0331 * x * x * x * x) return d * v;
    if (Math.log(u) < 0.5 * x * x + d * (1 - v + Math.log(v))) return d * v;
  }
}

/**
 * Beta(α, β) sample = X/(X+Y), X~Gamma(α), Y~Gamma(β).
 * @param {number} a @param {number} b @param {() => number} rand @returns {number}
 */
export function betaSample(a, b, rand) {
  const x = gammaSample(a, rand);
  const y = gammaSample(b, rand);
  return x / (x + y);
}

/**
 * Quantile of a numeric array (linear interpolation, does not mutate input).
 * @param {number[]} xs @param {number} q in [0,1] @returns {number}
 */
export function quantile(xs, q) {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const pos = (s.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return s[lo] + (s[hi] - s[lo]) * (pos - lo);
}

/**
 * Fisher–Yates shuffle with an optional PRNG; returns a new array.
 * @template T @param {T[]} arr @param {() => number} [rand] @returns {T[]}
 */
export function shuffle(arr, rand = Math.random) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * Sample-size confidence label used across analytics.
 * @param {number} n number of (weighted) observations @returns {'low'|'medium'|'high'}
 */
export function confidenceLabel(n) {
  if (n < 10) return 'low';
  if (n < 30) return 'medium';
  return 'high';
}

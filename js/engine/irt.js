/**
 * Section 9.6 — Three-parameter logistic IRT, EAP ability estimation and adaptive selection.
 * @module engine/irt
 */

/**
 * 3PL probability  P(θ) = c + (1−c) / (1 + e^{−a(θ−b)}).
 * @param {number} theta @param {{a?:number,b?:number,c?:number}} d @returns {number}
 */
export function p3pl(theta, d) {
  const a = d.a ?? 1;
  const b = d.b ?? 0;
  const c = d.c ?? 0.25;
  return c + (1 - c) / (1 + Math.exp(-a * (theta - b)));
}

/**
 * Fisher information of a 3PL item:
 *   I(θ) = a² · (Q/P) · ((P − c)/(1 − c))²,  Q = 1 − P
 * @param {number} theta @param {{a?:number,b?:number,c?:number}} d @returns {number}
 */
export function fisherInfo(theta, d) {
  const a = d.a ?? 1;
  const c = d.c ?? 0.25;
  const P = p3pl(theta, d);
  const Q = 1 - P;
  if (P <= 0 || c >= 1) return 0;
  return a * a * (Q / P) * Math.pow((P - c) / (1 - c), 2);
}

/**
 * Bayesian EAP ability on a grid with a standard-normal prior:
 *   θ̂ = Σ θ_k L(θ_k) φ(θ_k) / Σ L(θ_k) φ(θ_k),  SE = √(Σ (θ_k−θ̂)² w_k / Σ w_k)
 * @param {Array<{a?:number,b?:number,c?:number,correct:boolean}>} responses
 * @param {{min?:number,max?:number,points?:number,priorMean?:number,priorSd?:number}} [grid]
 * @returns {{theta:number, se:number}}
 */
export function eapEstimate(responses, grid = {}) {
  const min = grid.min ?? -4;
  const max = grid.max ?? 4;
  const n = grid.points ?? 81;
  const mu = grid.priorMean ?? 0;
  const sd = grid.priorSd ?? 1;
  const thetas = [];
  const logw = [];
  for (let k = 0; k < n; k++) {
    const t = min + ((max - min) * k) / (n - 1);
    let ll = -0.5 * Math.pow((t - mu) / sd, 2);
    for (const r of responses) {
      const p = Math.min(1 - 1e-9, Math.max(1e-9, p3pl(t, r)));
      ll += r.correct ? Math.log(p) : Math.log(1 - p);
    }
    thetas.push(t);
    logw.push(ll);
  }
  const m = Math.max(...logw);
  const w = logw.map((l) => Math.exp(l - m));
  const W = w.reduce((s, x) => s + x, 0);
  const theta = thetas.reduce((s, t, i) => s + t * w[i], 0) / W;
  const v = thetas.reduce((s, t, i) => s + (t - theta) * (t - theta) * w[i], 0) / W;
  return { theta, se: Math.sqrt(v) };
}

/**
 * Adaptive item selection: among candidates, prefer items whose predicted success lies in
 * the target band [lo, hi] (default 0.70–0.80); within the band maximise Fisher information;
 * otherwise pick the item whose success probability is closest to the band.
 * @template T
 * @param {T[]} items each with a `difficulty` object
 * @param {number} theta
 * @param {{lo?:number,hi?:number,exclude?:Set<string>}} [opt]
 * @returns {T|null}
 */
export function selectAdaptive(items, theta, opt = {}) {
  const lo = opt.lo ?? 0.7;
  const hi = opt.hi ?? 0.8;
  let best = null;
  let bestScore = -Infinity;
  for (const it of items) {
    if (opt.exclude && opt.exclude.has(it.id)) continue;
    const d = it.difficulty || {};
    const p = p3pl(theta, d);
    const dist = p < lo ? lo - p : p > hi ? p - hi : 0;
    const score = fisherInfo(theta, d) - 10 * dist;
    if (score > bestScore) { bestScore = score; best = it; }
  }
  return best;
}

/**
 * Section 9.3 — Bayesian Knowledge Tracing per chapter, prerequisite DAG utilities and
 * backward suspicion propagation.
 * @module engine/bkt
 */

/** Default BKT parameters. */
export const BKT_DEFAULTS = Object.freeze({ pL0: 0.3, pT: 0.15, pS: 0.1, pG: 0.2 });

/**
 * One BKT step.
 *   correct: P(L|c) = P(L)(1−S) / [P(L)(1−S) + (1−P(L))G]
 *   wrong:   P(L|w) = P(L)S / [P(L)S + (1−P(L))(1−G)]
 *   then     P(L') = P(L|obs) + (1 − P(L|obs))·T
 * @param {number} pL prior probability the chapter is known
 * @param {boolean} correct observed response
 * @param {{pT:number,pS:number,pG:number}} [p]
 * @returns {{posterior:number, next:number}}
 */
export function bktUpdate(pL, correct, p = BKT_DEFAULTS) {
  const { pT, pS, pG } = p;
  let post;
  if (correct) post = (pL * (1 - pS)) / (pL * (1 - pS) + (1 - pL) * pG);
  else post = (pL * pS) / (pL * pS + (1 - pL) * (1 - pG));
  const next = post + (1 - post) * pT;
  return { posterior: post, next };
}

/**
 * Check that prerequisite edges form a DAG (Kahn's algorithm).
 * @param {Array<{from:string,to:string}>} edges
 * @returns {{ok:boolean, order:string[], cycleNodes:string[]}}
 */
export function checkDag(edges) {
  const indeg = new Map();
  const adj = new Map();
  for (const { from, to } of edges) {
    if (!adj.has(from)) adj.set(from, []);
    adj.get(from).push(to);
    indeg.set(to, (indeg.get(to) || 0) + 1);
    if (!indeg.has(from)) indeg.set(from, 0);
  }
  const queue = [...indeg.entries()].filter(([, d]) => d === 0).map(([n]) => n);
  const order = [];
  while (queue.length) {
    const n = queue.shift();
    order.push(n);
    for (const m of adj.get(n) || []) {
      indeg.set(m, indeg.get(m) - 1);
      if (indeg.get(m) === 0) queue.push(m);
    }
  }
  const cycleNodes = [...indeg.entries()].filter(([, d]) => d > 0).map(([n]) => n);
  return { ok: cycleNodes.length === 0, order, cycleNodes };
}

/**
 * Map chapterId → list of {from, weight} prerequisite edges (incoming).
 * @param {Array<{from:string,to:string,weight?:number}>} edges
 * @returns {Map<string, Array<{from:string,weight:number}>>}
 */
export function incomingMap(edges) {
  const m = new Map();
  for (const e of edges) {
    if (!m.has(e.to)) m.set(e.to, []);
    m.get(e.to).push({ from: e.from, weight: e.weight ?? 0.5 });
  }
  return m;
}

/**
 * Backward propagation of suspicion. When a chapter keeps failing, every upstream
 * prerequisite at graph distance d, reached through a path whose edge weights multiply to
 * w, receives a suspicion strength  s = λ^d · w  and its knowledge estimate is decayed:
 *   P(L) ← P(L) · (1 − (1−λ)·s)
 * (λ = 0.85 by default, so a direct prerequisite with weight 0.7 loses ≈ 9 % of P(L)).
 * The root cause is the upstream chapter (or the chapter itself) with the lowest P(L)
 * after the update.
 * @param {string} chapterId failing chapter
 * @param {Map<string, Array<{from:string,weight:number}>>} incoming
 * @param {Object<string,{bktPKnown:number}>} state concept states (mutated copy returned)
 * @param {{lambda?:number,maxDepth?:number}} [opt]
 * @returns {{state:Object, affected:Array<{chapterId:string,depth:number,before:number,after:number}>, rootCause:string}}
 */
export function propagateSuspicion(chapterId, incoming, state, opt = {}) {
  const lambda = opt.lambda ?? 0.85;
  const maxDepth = opt.maxDepth ?? 4;
  const next = { ...state };
  const affected = [];
  const seen = new Set([chapterId]);
  let frontier = [{ id: chapterId, depth: 0, w: 1 }];
  while (frontier.length) {
    const nf = [];
    for (const node of frontier) {
      if (node.depth >= maxDepth) continue;
      for (const e of incoming.get(node.id) || []) {
        if (seen.has(e.from)) continue;
        seen.add(e.from);
        const depth = node.depth + 1;
        const strength = Math.pow(lambda, depth) * e.weight * node.w;
        const before = next[e.from]?.bktPKnown ?? BKT_DEFAULTS.pL0;
        const after = Math.max(0.01, before * (1 - (1 - lambda) * strength));
        next[e.from] = { ...(next[e.from] || {}), bktPKnown: after };
        affected.push({ chapterId: e.from, depth, before, after });
        nf.push({ id: e.from, depth, w: e.weight * node.w });
      }
    }
    frontier = nf;
  }
  let rootCause = chapterId;
  let low = next[chapterId]?.bktPKnown ?? 1;
  for (const a of affected) {
    if (a.after < low) { low = a.after; rootCause = a.chapterId; }
  }
  return { state: next, affected, rootCause };
}

/**
 * Count failures for a chapter among its last `window` attempts.
 * @param {Array<{chapterId:string,isCorrect:boolean}>} attempts chronological
 * @param {string} chapterId @param {number} [window=5]
 * @returns {number}
 */
export function recentFailures(attempts, chapterId, window = 5) {
  let n = 0;
  let seen = 0;
  for (let i = attempts.length - 1; i >= 0 && seen < window; i--) {
    if (attempts[i].chapterId !== chapterId) continue;
    seen++;
    if (!attempts[i].isCorrect) n++;
  }
  return n;
}

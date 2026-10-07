/**
 * Section 9.8 — Glicko-2 rating system (Glickman, "Example of the Glicko-2 system", 2013).
 * @module engine/glicko2
 */

const SCALE = 173.7178;

/**
 * Convert a Glicko rating to the Glicko-2 scale:  μ = (r − 1500)/173.7178,  φ = RD/173.7178.
 * @param {{r:number,rd:number}} p @returns {{mu:number,phi:number}}
 */
export function toG2(p) {
  return { mu: (p.r - 1500) / SCALE, phi: p.rd / SCALE };
}

/** g(φ) = 1/√(1 + 3φ²/π²). @param {number} phi @returns {number} */
export function g(phi) {
  return 1 / Math.sqrt(1 + (3 * phi * phi) / (Math.PI * Math.PI));
}

/** E(μ, μj, φj) = 1/(1 + exp(−g(φj)(μ − μj))). */
export function expected(mu, muj, phij) {
  return 1 / (1 + Math.exp(-g(phij) * (mu - muj)));
}

/**
 * One rating-period update (Steps 1–8 of Glickman's algorithm, Illinois root finding for σ').
 * @param {{r:number,rd:number,sigma:number}} player
 * @param {Array<{r:number,rd:number,score:number}>} games score 1 win, 0.5 draw, 0 loss
 * @param {number} [tau=0.5] system constant
 * @returns {{r:number,rd:number,sigma:number}}
 */
export function glicko2Update(player, games, tau = 0.5) {
  const { mu, phi } = toG2(player);
  const sigma = player.sigma;
  if (!games.length) {
    // Step 6 only: no games → RD grows.
    const phiStar = Math.sqrt(phi * phi + sigma * sigma);
    return { r: player.r, rd: Math.min(350, phiStar * SCALE), sigma };
  }
  // Step 3: estimated variance v.
  let vInv = 0;
  let deltaSum = 0;
  for (const gm of games) {
    const o = toG2(gm);
    const gj = g(o.phi);
    const E = expected(mu, o.mu, o.phi);
    vInv += gj * gj * E * (1 - E);
    deltaSum += gj * (gm.score - E);
  }
  const v = 1 / vInv;
  // Step 4: estimated improvement Δ.
  const delta = v * deltaSum;
  // Step 5: new volatility σ' via the Illinois algorithm.
  const a = Math.log(sigma * sigma);
  const eps = 0.000001;
  const f = (x) => {
    const ex = Math.exp(x);
    return (ex * (delta * delta - phi * phi - v - ex)) / (2 * Math.pow(phi * phi + v + ex, 2)) - (x - a) / (tau * tau);
  };
  let A = a;
  let B;
  if (delta * delta > phi * phi + v) {
    B = Math.log(delta * delta - phi * phi - v);
  } else {
    let k = 1;
    while (f(a - k * tau) < 0) k++;
    B = a - k * tau;
  }
  let fA = f(A);
  let fB = f(B);
  let guard = 0;
  while (Math.abs(B - A) > eps && guard++ < 200) {
    const C = A + ((A - B) * fA) / (fB - fA);
    const fC = f(C);
    if (fC * fB <= 0) { A = B; fA = fB; } else { fA /= 2; }
    B = C; fB = fC;
  }
  const sigmaNew = Math.exp(A / 2);
  // Step 6–7: new φ and μ.
  const phiStar = Math.sqrt(phi * phi + sigmaNew * sigmaNew);
  const phiNew = 1 / Math.sqrt(1 / (phiStar * phiStar) + 1 / v);
  const muNew = mu + phiNew * phiNew * deltaSum;
  // Step 8: back to Glicko scale.
  return { r: muNew * SCALE + 1500, rd: Math.min(350, phiNew * SCALE), sigma: sigmaNew };
}

/**
 * Elo expected score used only for matchmaking previews:  E = 1/(1 + 10^((rB − rA)/400)).
 * @param {number} rA @param {number} rB @returns {number}
 */
export function eloExpected(rA, rB) {
  return 1 / (1 + Math.pow(10, (rB - rA) / 400));
}

/** Fixed AI opponent ratings. */
export const AI_RATINGS = Object.freeze({ easy: 1100, medium: 1400, hard: 1700, elite: 2000 });

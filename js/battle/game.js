/**
 * Battle rules shared by every mode: scoring with speed bonus, AI opponents, per-player
 * option shuffles and CSV export.
 * @module battle/game
 */
import { p3pl } from '../engine/irt.js';
import { mulberry32, normalSample, shuffle } from '../engine/stats.js';
import { itemBeta } from '../engine/responseTime.js';
import { toCsv } from '../storage/exportImport.js';

/**
 * Points for one answer (host-timestamp based):
 *   correct → 100 + round(bonusMax · (1 − elapsed/limit)),  wrong / no answer → 0
 * @param {boolean} correct @param {number} elapsedMs @param {number} limitMs @param {number} [bonusMax=50]
 * @returns {number}
 */
export function points(correct, elapsedMs, limitMs, bonusMax = 50) {
  if (!correct) return 0;
  const f = Math.max(0, Math.min(1, 1 - elapsedMs / limitMs));
  return 100 + Math.round(bonusMax * f);
}

/** Map a Glicko rating to an IRT ability θ (1500 → 0, ±200 per logit). */
export function ratingToTheta(r) {
  return (r - 1500) / 200;
}

/**
 * Simulate an AI answer.
 * @param {object} q question @param {number} rating AI rating @param {number} limitMs @param {() => number} rand
 * @returns {{key:string|null, elapsedMs:number}}
 */
export function aiAnswer(q, rating, limitMs, rand) {
  const theta = ratingToTheta(rating);
  const p = p3pl(theta, q.difficulty || {});
  const correct = rand() < p;
  const keys = Object.keys(q.options);
  const wrong = keys.filter((k) => k !== q.answer);
  const speed = Math.exp(itemBeta(q) - 0.35 * theta + normalSample(rand) * 0.35) * 1000;
  const elapsedMs = Math.min(limitMs - 300, Math.max(1500, speed * 0.6));
  return { key: correct ? q.answer : wrong[Math.floor(rand() * wrong.length)], elapsedMs };
}

/**
 * Deterministic per-player option order (anti-cheat: neighbours see different letters).
 * @param {object} q @param {string} playerId @returns {string[]}
 */
export function playerOrder(q, playerId) {
  let seed = 0;
  for (const c of playerId + q.id) seed = (seed * 31 + c.charCodeAt(0)) >>> 0;
  return shuffle(Object.keys(q.options), mulberry32(seed));
}

/**
 * Leaderboard from a scores map.
 * @param {Object<string,{name:string,score:number,correct:number}>} players
 * @returns {Array<{id:string,name:string,score:number,correct:number,rank:number}>}
 */
export function leaderboard(players) {
  return Object.entries(players).map(([id, p]) => ({ id, ...p })).sort((a, b) => b.score - a.score || b.correct - a.correct).map((p, i) => ({ ...p, rank: i + 1 }));
}

/**
 * CSV of a finished battle (host export).
 * @param {object[]} questions @param {Object<string,{name:string,answers:Object}>} players
 * @returns {string}
 */
export function battleCsv(questions, players) {
  const rows = [['player', 'question', 'selected', 'correct', 'is_correct', 'time_ms', 'points']];
  for (const [, p] of Object.entries(players)) {
    questions.forEach((q, i) => {
      const a = p.answers?.[i] || {};
      rows.push([p.name, q.id, a.key ?? '', q.answer, a.key === q.answer ? 1 : 0, a.elapsedMs ?? '', a.points ?? 0]);
    });
  }
  return toCsv(rows);
}

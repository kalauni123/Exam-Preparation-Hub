/**
 * Section 9.11 — "What should I study now?" priority score and time-budgeted plan.
 *   priority = w1·(1−H) + w2·mistakeRecency + w3·examProximity + w4·importance
 *            + w5·dueNow + w6·forgettingRisk          (weights normalised to Σ = 1)
 * The plan is filled greedily by priority per minute.
 * @module engine/recommender
 */
import { DAY_MS, clamp } from './stats.js';

export const DEFAULT_PRIORITY_WEIGHTS = Object.freeze({
  weakness: 0.3, mistakeRecency: 0.15, examProximity: 0.1, importance: 0.15, dueNow: 0.15, forgettingRisk: 0.15,
});

const REASON_TEXT = {
  weakness: 'memory health is low',
  mistakeRecency: 'you made mistakes here recently',
  examProximity: 'your exam is getting close',
  importance: 'it carries weight in your exam',
  dueNow: 'a review is due now',
  forgettingRisk: 'you are likely to forget it soon',
};

/**
 * Exam-proximity weight: 0 with no date; rises linearly from 0 (≥120 days) to 1 (exam day).
 * @param {string} examDate ISO date or '' @param {number} [now] @returns {number}
 */
export function examProximityWeight(examDate, now = Date.now()) {
  if (!examDate) return 0;
  const days = (Date.parse(examDate) - now) / DAY_MS;
  if (!Number.isFinite(days)) return 0;
  return clamp(1 - days / 120, 0, 1);
}

/**
 * Mistake recency in [0,1]: max over the chapter's mistakes of exp(−age/7 days).
 * @param {string[]} mistakeDates ISO dates @param {number} [now] @returns {number}
 */
export function mistakeRecency(mistakeDates, now = Date.now()) {
  let m = 0;
  for (const d of mistakeDates) m = Math.max(m, Math.exp(-Math.max(0, now - Date.parse(d)) / (7 * DAY_MS)));
  return m;
}

/**
 * Priority of a chapter with its top-3 explanatory reasons.
 * @param {{health:number, mistakeRecency:number, examProximity:number, importance:number, dueNow:number, forgettingRisk:number}} f features in [0,1]
 * @param {Object<string,number>} [w]
 * @returns {{priority:number, reasons:string[], contributions:Object<string,number>}}
 */
export function chapterPriority(f, w = DEFAULT_PRIORITY_WEIGHTS) {
  const feats = {
    weakness: 1 - clamp(f.health, 0, 1),
    mistakeRecency: clamp(f.mistakeRecency, 0, 1),
    examProximity: clamp(f.examProximity, 0, 1) * clamp(f.importance, 0, 1),
    importance: clamp(f.importance, 0, 1),
    dueNow: f.dueNow ? 1 : 0,
    forgettingRisk: clamp(f.forgettingRisk, 0, 1),
  };
  const wsum = Object.values(w).reduce((s, x) => s + x, 0) || 1;
  const contributions = {};
  let priority = 0;
  for (const k of Object.keys(feats)) {
    contributions[k] = ((w[k] || 0) / wsum) * feats[k];
    priority += contributions[k];
  }
  const reasons = Object.entries(contributions).filter(([, v]) => v > 0.01).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([k]) => REASON_TEXT[k]);
  return { priority, reasons, contributions };
}

/**
 * Build a timed study plan.
 * @param {{minutes:number, dueCount:number, mistakeCount:number, ranked:Array<{chapterId:string,title:string,priority:number,reasons:string[],available:number}>, minutesPerQuestion?:number}} input
 * @returns {Array<{kind:'review'|'targeted'|'mistakes'|'rapid', minutes:number, count:number, chapterIds:string[], label:string, reasons?:string[]}>}
 */
export function buildPlan(input) {
  const mpq = input.minutesPerQuestion ?? 1.25;
  let remaining = Math.max(5, input.minutes);
  const blocks = [];
  if (input.dueCount > 0) {
    const m = Math.min(Math.round(remaining * 0.3), Math.ceil(input.dueCount * mpq * 0.8), remaining);
    if (m >= 2) { blocks.push({ kind: 'review', minutes: m, count: Math.max(1, Math.floor(m / (mpq * 0.8))), chapterIds: [], label: 'Spaced-repetition review' }); remaining -= m; }
  }
  const rapid = remaining >= 20 ? 5 : 0;
  const mistakes = input.mistakeCount > 0 && remaining >= 12 ? Math.min(5, Math.ceil(input.mistakeCount * mpq)) : 0;
  let targeted = remaining - rapid - mistakes;
  const chosen = [];
  const perChapterMin = 5;
  const candidates = input.ranked.filter((c) => c.available > 0);
  // Greedy by priority per minute (each chapter slot costs perChapterMin).
  for (const c of candidates.sort((a, b) => b.priority / perChapterMin - a.priority / perChapterMin)) {
    if (targeted < perChapterMin && chosen.length) break;
    chosen.push(c);
    targeted -= perChapterMin;
    if (chosen.length >= 4) break;
  }
  const targetedMin = remaining - rapid - mistakes;
  if (chosen.length && targetedMin > 0) {
    blocks.push({
      kind: 'targeted', minutes: targetedMin, count: Math.max(3, Math.floor(targetedMin / mpq)),
      chapterIds: chosen.map((c) => c.chapterId), label: 'Targeted practice: ' + chosen.map((c) => c.title).slice(0, 2).join(', ') + (chosen.length > 2 ? '…' : ''),
      reasons: chosen[0].reasons,
    });
  }
  if (mistakes) blocks.push({ kind: 'mistakes', minutes: mistakes, count: Math.max(2, Math.floor(mistakes / mpq)), chapterIds: [], label: 'Retry your mistakes' });
  if (rapid) blocks.push({ kind: 'rapid', minutes: rapid, count: 5, chapterIds: chosen.map((c) => c.chapterId), label: 'Rapid-fire finisher' });
  return blocks;
}

/**
 * Section 9.2 (scheduling) and Feature 4 — SM-2 chapter scheduling and the per-question
 * review ladder (wrong → 1 → 3 → 7 → 21 days → retired).
 * @module engine/spacedRepetition
 */
import { DAY_MS, clamp } from './stats.js';

/** Per-question ladder intervals in days (box index → days). */
export const LADDER_DAYS = [1, 3, 7, 21];

/**
 * Map a response to SM-2 quality q ∈ 0..5.
 *   wrong: 0 (confident & fast, i.e. a real misconception), 1 (normal), 2 (low confidence)
 *   correct: 5 fast & confident, 4 normal, 3 slow or unsure
 * @param {boolean} correct
 * @param {number} timeRatio observed time / expected time
 * @param {number} [confidence=2] 1 = low, 2 = medium, 3 = high
 * @returns {number}
 */
export function qualityFromResponse(correct, timeRatio, confidence = 2) {
  if (!correct) {
    if (confidence >= 3) return 0;
    if (confidence <= 1) return 2;
    return 1;
  }
  if (timeRatio > 1.5 || confidence <= 1) return 3;
  if (timeRatio < 0.8 && confidence >= 2) return 5;
  return 4;
}

/**
 * SM-2 update.
 *   EF' = EF + (0.1 − (5−q)(0.08 + (5−q)·0.02)),  EF ≥ 1.3
 *   q ≥ 3: reps=1 → I=1, reps=2 → I=3, else I = round(I·EF')
 *   q < 3: I = 1, reps = 0, lapses++
 * @param {{easiness?:number,interval?:number,reps?:number,lapses?:number}} s previous state
 * @param {number} q quality 0..5
 * @param {number} [now=Date.now()]
 * @returns {{easiness:number,interval:number,reps:number,lapses:number,lastReview:string,nextReview:string}}
 */
export function sm2Update(s, q, now = Date.now()) {
  const ef0 = s.easiness ?? 2.5;
  const ef = Math.max(1.3, ef0 + (0.1 - (5 - q) * (0.08 + (5 - q) * 0.02)));
  let reps = s.reps ?? 0;
  let interval = s.interval ?? 0;
  let lapses = s.lapses ?? 0;
  if (q >= 3) {
    reps += 1;
    if (reps === 1) interval = 1;
    else if (reps === 2) interval = 3;
    else interval = Math.max(1, Math.round(interval * ef));
  } else {
    reps = 0;
    interval = 1;
    lapses += 1;
  }
  return {
    easiness: ef,
    interval,
    reps,
    lapses,
    lastReview: new Date(now).toISOString(),
    nextReview: new Date(now + interval * DAY_MS).toISOString(),
  };
}

/**
 * Per-question ladder. A question enters the ladder on its first mistake; each correct
 * review climbs one box; a correct answer from the last box retires it (fades out);
 * any mistake drops it back to box 0 (review tomorrow).
 * @param {{box?:number,nextDue?:string,history?:Array,retired?:boolean}|undefined} st
 * @param {boolean} correct
 * @param {number} [now=Date.now()]
 * @returns {{box:number,nextDue:string,history:Array,retired:boolean}|undefined} undefined when the question never needs review
 */
export function ladderUpdate(st, correct, now = Date.now()) {
  const history = [...(st?.history || []), { ts: new Date(now).toISOString(), c: correct ? 1 : 0 }].slice(-12);
  if (!st && correct) return undefined;
  if (!correct) {
    return { box: 0, nextDue: new Date(now + LADDER_DAYS[0] * DAY_MS).toISOString(), history, retired: false };
  }
  const box = clamp((st.box ?? 0) + 1, 0, LADDER_DAYS.length);
  if (box >= LADDER_DAYS.length) {
    return { box, nextDue: '', history, retired: true };
  }
  return { box, nextDue: new Date(now + LADDER_DAYS[box] * DAY_MS).toISOString(), history, retired: false };
}

/**
 * Question ids due for review at `now`.
 * @param {Object<string,{nextDue:string,retired?:boolean}>} questionState
 * @param {number} [now=Date.now()]
 * @returns {string[]} sorted most-overdue first
 */
export function dueQuestionIds(questionState, now = Date.now()) {
  return Object.entries(questionState || {})
    .filter(([, s]) => s && !s.retired && s.nextDue && Date.parse(s.nextDue) <= now)
    .sort((a, b) => Date.parse(a[1].nextDue) - Date.parse(b[1].nextDue))
    .map(([id]) => id);
}

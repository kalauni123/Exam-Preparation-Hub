/**
 * Feature 16 — Learning DNA: a descriptive profile computed from the attempt log and the
 * other engine outputs (no new statistical model).
 * @module engine/learningDNA
 */
import { strengthByGroup } from './mastery.js';
import { mean } from './stats.js';
import { ERROR_LABELS } from './errorClassifier.js';

/**
 * Compute the Learning DNA card.
 * @param {object} user user document
 * @param {(subjectId:string)=>string} subjectName lookup
 * @param {{now?:number}} [opt]
 * @returns {object|null} null when there are fewer than 20 attempts
 */
export function computeDNA(user, subjectName, opt = {}) {
  const atts = user.attempts || [];
  if (atts.length < 20) return null;
  const now = opt.now ?? Date.now();
  const bySub = strengthByGroup(atts, (a) => a.subjectId, { now });
  const subs = Object.entries(bySub).filter(([, v]) => v.n >= 8).sort((a, b) => b[1].score - a[1].score);
  const strong = subs.slice(0, 2).filter(([, v]) => v.score >= 0.6).map(([k, v]) => ({ subjectId: k, name: subjectName(k), score: v.score }));
  const weak = subs.slice(-2).reverse().filter(([, v]) => v.score < 0.6).map(([k, v]) => ({ subjectId: k, name: subjectName(k), score: v.score }));

  // Preferred difficulty: band with the best accuracy among bands with ≥ 8 attempts.
  const band = (b) => (b < -0.5 ? 'Easy' : b > 0.5 ? 'Hard' : 'Medium');
  const byBand = strengthByGroup(atts, (a) => band(a.b ?? 0), { now });
  const comfortable = Object.entries(byBand).filter(([, v]) => v.n >= 8 && v.score >= 0.7).map(([k]) => k);
  const preferredDifficulty = comfortable.includes('Hard') ? 'Hard' : comfortable.includes('Medium') ? 'Medium' : 'Easy';

  const errCounts = {};
  for (const a of atts) if (a.errorType) errCounts[a.errorType] = (errCounts[a.errorType] || 0) + 1;
  const commonMistakes = Object.entries(errCounts).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([k, n]) => ({ type: k, label: ERROR_LABELS[k] || k, n }));

  const avgResponseSec = mean(atts.slice(-300).map((a) => a.timeMs / 1000));
  const byType = strengthByGroup(atts, (a) => a.qType, { now });
  const conceptual = byType.conceptual?.score ?? null;
  const memory = byType.memory?.score ?? null;
  let style = 'Balanced';
  if (conceptual !== null && memory !== null) {
    if (conceptual - memory > 0.1) style = 'Conceptual thinker';
    else if (memory - conceptual > 0.1) style = 'Strong memoriser';
  }

  // Retention: accuracy on questions seen before vs first-time.
  const seen = new Set();
  let reC = 0; let reN = 0;
  for (const a of atts) {
    if (seen.has(a.questionId)) { reN++; if (a.isCorrect) reC++; }
    seen.add(a.questionId);
  }
  const retention = reN >= 5 ? reC / reN : null;

  const rushed = atts.filter((a) => !a.isCorrect && a.z < -2.77).length;
  const guessingRate = rushed / atts.length;

  // Exam temperament: timed vs untimed accuracy and late-session drop.
  const timed = atts.filter((a) => a.mode === 'test' || a.mode === 'rapid' || a.mode === 'battle');
  const untimed = atts.filter((a) => a.mode === 'practice' || a.mode === 'review');
  const accT = timed.length >= 10 ? mean(timed.map((a) => (a.isCorrect ? 1 : 0))) : null;
  const accU = untimed.length >= 10 ? mean(untimed.map((a) => (a.isCorrect ? 1 : 0))) : null;
  let temperament = 'Not enough timed data yet';
  if (accT !== null && accU !== null) {
    const d = accT - accU;
    temperament = d < -0.1 ? 'Feels time pressure' : d > 0.05 ? 'Thrives under pressure' : 'Steady under pressure';
  }

  const tips = [];
  if (guessingRate > 0.08) tips.push('You answer some questions very fast and get them wrong — slow down and eliminate options first.');
  if (commonMistakes[0]?.type === 'sign-error') tips.push('Sign errors are your top trap: write the sign convention before substituting numbers.');
  if (commonMistakes[0]?.type === 'formula-confusion') tips.push('Formula confusion is common for you: keep a one-page formula sheet per chapter and test yourself on it.');
  if (commonMistakes[0]?.type === 'unit-error') tips.push('Convert every quantity to SI units before calculating.');
  if (retention !== null && retention < 0.6) tips.push('Questions you have seen before are often missed again — use the Due-today review queue daily.');
  if (temperament === 'Feels time pressure') tips.push('Practise timed tests in short bursts (Rapid-fire) to get comfortable with the clock.');
  if (weak[0]) tips.push(`Give ${weak[0].name} a short daily slot — it is currently your weakest subject.`);
  if (!tips.length) tips.push('Great balance — keep mixing subjects and reviewing due items.');

  return { strong, weak, preferredDifficulty, commonMistakes, avgResponseSec, style, retention, guessingRate, temperament, tips, computedAt: new Date(now).toISOString(), attempts: atts.length };
}

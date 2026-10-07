/**
 * Demo data generator (Section 15): ~60 days of realistic practice in the pilot subjects
 * (QM1 + STAT), fed through the real learner engine so every dashboard can be previewed.
 * @module utils/demoData
 */
import { app } from '../state.js';
import { loadChapters } from '../bank/chapterLoader.js';
import { recordAttempt, finalizeSession, uid } from '../engine/learner.js';
import { p3pl } from '../engine/irt.js';
import { itemBeta } from '../engine/responseTime.js';
import { mulberry32, normalSample } from '../engine/stats.js';
import { glicko2Update, AI_RATINGS } from '../engine/glicko2.js';

/**
 * Generate demo history into `user` (mutates it).
 * @param {object} user @param {{days?:number, seed?:number, perDay?:number}} [opt]
 * @returns {Promise<number>} attempts added
 */
export async function generateDemoData(user, opt = {}) {
  const days = opt.days ?? 60;
  const rand = mulberry32(opt.seed ?? (parseInt(user.profile.phoneHash?.slice(0, 6) || 'abc', 16) || 99));
  const subjects = ['QM1', 'STAT'].filter((s) => app.catalog.subjectById.has(s));
  const chapters = subjects.flatMap((s) => app.catalog.subjectById.get(s).chapters.map((c) => app.catalog.chapterById.get(c.id))).filter((c) => c.questionCount > 0);
  const { questions } = await loadChapters(chapters);
  if (!questions.length) throw new Error('Pilot chapters could not be loaded (are you offline?).');
  const byCh = new Map();
  for (const q of questions) { if (!byCh.has(q._chapter.id)) byCh.set(q._chapter.id, []); byCh.get(q._chapter.id).push(q); }
  const chIds = [...byCh.keys()];
  // Latent ability per chapter grows with practice; some chapters are intrinsically harder.
  const base = Object.fromEntries(chIds.map((id) => [id, -0.8 + normalSample(rand) * 0.6]));
  const practice = Object.fromEntries(chIds.map((id) => [id, 0]));
  const start = Date.now() - days * 86400000;
  let added = 0;
  const kinds = ['practice', 'practice', 'practice', 'test', 'review', 'rapid'];
  for (let d = 0; d < days; d++) {
    if (rand() < 0.22) continue; // rest days
    const sessions = rand() < 0.35 ? 2 : 1;
    for (let sIdx = 0; sIdx < sessions; sIdx++) {
      const mode = kinds[Math.floor(rand() * kinds.length)];
      const t0 = start + d * 86400000 + (8 + sIdx * 6 + rand() * 4) * 3600000;
      const unlocked = Math.min(chIds.length, 4 + Math.floor((d / days) * chIds.length));
      const pickCh = [];
      for (let k = 0; k < 2 + Math.floor(rand() * 2); k++) pickCh.push(chIds[Math.floor(rand() * unlocked)]);
      const sessionId = uid('demo');
      let tNow = t0;
      const n = 8 + Math.floor(rand() * 10);
      for (let i = 0; i < n; i++) {
        const cid = pickCh[i % pickCh.length];
        const pool = byCh.get(cid);
        const q = pool[Math.floor(rand() * pool.length)];
        const theta = base[cid] + 0.9 * Math.log1p(practice[cid] / 6) + (mode === 'rapid' ? -0.3 : 0);
        const pc = p3pl(theta, q.difficulty);
        const correct = rand() < pc;
        const keys = Object.keys(q.options);
        const wrongKeys = keys.filter((k) => k !== q.answer);
        const selected = correct ? q.answer : (mode === 'rapid' && rand() < 0.1 ? null : wrongKeys[Math.floor(rand() * wrongKeys.length)]);
        const expected = Math.exp(itemBeta(q)) * 1000;
        const timeMs = Math.max(2500, expected * Math.exp(normalSample(rand) * 0.45 + (correct ? -0.1 : 0.05) + (mode === 'rapid' ? -0.6 : 0)));
        tNow += timeMs + 4000;
        recordAttempt(user, {
          question: q, category: q._chapter.category, subjectId: q._chapter.subjectId, chapterId: cid,
          selected, timeMs, confidence: correct ? (rand() < 0.7 ? 3 : 2) : (rand() < 0.5 ? 1 : 2), changedAnswer: rand() < 0.05,
          mode, sessionId,
        }, { config: app.config, incoming: app.prereq.incoming, now: tNow });
        practice[cid] += 1;
        added++;
        if (!correct && rand() < 0.08) {
          user.bookmarks = user.bookmarks || [];
          if (!user.bookmarks.find((b) => b.questionId === q.id)) user.bookmarks.push({ questionId: q.id, reasons: [rand() < 0.5 ? 'difficult' : 'formula'], date: new Date(tNow).toISOString() });
        }
      }
      finalizeSession(user, { sessionId, mode, startedAt: new Date(t0).toISOString(), scope: { category: 'msc', subjectId: subjects[0], chapterIds: [...new Set(pickCh)] } }, { config: app.config, now: tNow });
    }
    if (d % 12 === 5) {
      const lvl = ['easy', 'medium', 'hard'][Math.floor(rand() * 3)];
      const win = rand() < (lvl === 'easy' ? 0.75 : lvl === 'medium' ? 0.5 : 0.3);
      const g = user.rating.glicko;
      const next = glicko2Update(g, [{ r: AI_RATINGS[lvl], rd: 50, score: win ? 1 : 0 }], app.config.battle?.glickoTau ?? 0.5);
      user.rating.glicko = next;
      user.rating.history.push({ ts: new Date(start + d * 86400000).toISOString(), r: next.r, rd: next.rd, opponent: 'AI ' + lvl, result: win ? 'win' : 'loss' });
    }
  }
  // Keep everything chronological if the profile already had real history.
  user.attempts.sort((a, b) => a.ts.localeCompare(b.ts));
  user.sessions.sort((a, b) => a.endedAt.localeCompare(b.endedAt));
  const raw = user.sessions.filter((s) => s.total).map((s) => ({ ts: s.endedAt, raw: (100 * s.score) / s.total, sessionId: s.sessionId }));
  const alpha = app.config.ewma?.alpha ?? 0.3;
  let prev = null;
  user.trend = { raw: raw.map((r) => r.raw).slice(-200), ewma: raw.map((r) => { prev = prev === null ? r.raw : alpha * r.raw + (1 - alpha) * prev; return { ts: r.ts, value: prev, raw: r.raw, sessionId: r.sessionId }; }).slice(-200) };
  user.meta.updatedAt = new Date().toISOString();
  return added;
}

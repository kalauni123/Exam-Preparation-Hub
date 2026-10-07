/**
 * Cohort response data for question analytics / CTT: every profile on this device plus any
 * user files the owner imports (stored compactly; never sent anywhere).
 * @module features/cohort
 */
import * as db from '../storage/db.js';
import { listLocalUsers, loadUser } from '../storage/userStore.js';
import { migrate } from '../storage/schema.js';

/**
 * @typedef {{u:string, s:string, q:string, sel:string|null, c:boolean, t:number}} CohortRow
 */

/** Compact rows from a user document. */
function rowsOf(user) {
  const id = user.profile.userId;
  return (user.attempts || []).map((a) => ({ u: id, s: id + ':' + a.sessionId, q: a.questionId, sel: a.selected ?? null, c: !!a.isCorrect, t: a.timeMs || 0 }));
}

/**
 * Load all cohort rows (local profiles + imported files).
 * @returns {Promise<{rows:CohortRow[], users:number}>}
 */
export async function loadCohort() {
  const rows = [];
  const ids = new Set();
  for (const p of await listLocalUsers()) {
    const u = await loadUser(p.userId);
    if (u) { rows.push(...rowsOf(u)); ids.add(p.userId); }
  }
  const imported = (await db.get('meta', 'cohort')) || [];
  for (const r of imported) if (!ids.has(r.u)) rows.push(r);
  const users = new Set(rows.map((r) => r.u)).size;
  return { rows, users };
}

/**
 * Import cohort user files (JSON exports of other learners).
 * @param {FileList|File[]} files @returns {Promise<number>} users imported
 */
export async function importCohortFiles(files) {
  const existing = (await db.get('meta', 'cohort')) || [];
  let n = 0;
  for (const f of files) {
    try {
      const doc = migrate(JSON.parse(await f.text()));
      const uid = doc.profile.userId;
      const kept = existing.filter((r) => r.u !== uid);
      existing.length = 0;
      existing.push(...kept, ...rowsOf(doc));
      n++;
    } catch { /* skip bad file */ }
  }
  await db.set('meta', 'cohort', existing);
  return n;
}

/** Remove imported cohort data. */
export async function clearCohort() {
  await db.del('meta', 'cohort');
}

/**
 * Group rows into per-question response arrays with respondent (session) totals.
 * @param {CohortRow[]} rows
 * @returns {Map<string, Array<{selected:string|null,isCorrect:boolean,total:number,timeMs:number}>>}
 */
export function responsesByQuestion(rows) {
  const totals = new Map();
  for (const r of rows) totals.set(r.s, (totals.get(r.s) || 0) + (r.c ? 1 : 0));
  const out = new Map();
  for (const r of rows) {
    if (!out.has(r.q)) out.set(r.q, []);
    out.get(r.q).push({ selected: r.sel, isCorrect: r.c, total: totals.get(r.s), timeMs: r.t });
  }
  return out;
}

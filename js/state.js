/**
 * Central application state and small cross-cutting helpers.
 * No globals are attached to window; modules import `app`.
 * @module state
 */
import { saveUser as persistUser, flush } from './storage/userStore.js';

/** Event bus for app-wide notifications ('user', 'theme', 'catalog', 'sw-update'). */
export const bus = new EventTarget();

/**
 * @typedef {Object} AppState
 * @property {object} config data/config.json
 * @property {import('./bank/catalogLoader.js').CatalogIndex|null} catalog
 * @property {{edges:Array, incoming:Map, ok:boolean, message:string}} prereq
 * @property {object} profiles data/examProfiles.json
 * @property {object|null} user active user document
 * @property {object|null} session active quiz session (in memory)
 * @property {object|null} lastResult last finished session summary
 * @property {object} flags misc runtime flags
 */

/** @type {AppState} */
export const app = {
  config: {},
  catalog: null,
  prereq: { edges: [], incoming: new Map(), ok: true, message: '' },
  profiles: { profiles: [] },
  user: null,
  session: null,
  lastResult: null,
  flags: { startedAt: Date.now() },
};

/** Persist the current user (debounced). */
export function saveUser() {
  if (app.user) persistUser(app.user);
}

/** Persist immediately. @returns {Promise<void>} */
export async function saveUserNow() {
  if (app.user) await flush(app.user);
}

/** Set the active user and notify listeners. @param {object|null} u */
export function setUser(u) {
  app.user = u;
  bus.dispatchEvent(new CustomEvent('user', { detail: u }));
}

/** Subject display name. @param {string} id @returns {string} */
export function subjectName(id) {
  return app.catalog?.subjectById.get(id)?.name || id;
}

/** Chapter info. @param {string} id */
export function chapterInfo(id) {
  return app.catalog?.chapterById.get(id) || null;
}

/** Active subject ids for the current user (falls back to subjects with questions). @returns {string[]} */
export function activeSubjectIds() {
  const a = app.user?.profile?.activeSubjects || [];
  if (a.length) return a.filter((id) => app.catalog?.subjectById.has(id));
  if (!app.catalog) return [];
  return [...app.catalog.subjectById.values()].filter((s) => s.chapters.some((c) => c.questionCount > 0)).map((s) => s.id);
}

/** Selected exam profile object or null. */
export function examProfile() {
  const id = app.user?.profile?.examTarget;
  return (app.profiles.profiles || []).find((p) => p.id === id) || null;
}

/**
 * Chapter importance from the exam profile (default 0.5).
 * @param {string} chapterId @returns {number}
 */
export function chapterImportance(chapterId) {
  const prof = examProfile();
  const ch = chapterInfo(chapterId);
  if (!prof || !ch) return 0.5;
  let imp = 0;
  for (const paper of prof.papers || []) {
    for (const s of paper.sections || []) {
      if ((s.chapterIds || []).includes(chapterId) || (s.subjectIds || []).includes(ch.subjectId)) imp = Math.max(imp, s.importance ?? 0.5);
    }
  }
  return imp || 0.3;
}

/**
 * Lazy, concurrency-limited chapter loading with LRU + IndexedDB caching and offline fallback.
 * Never loads all chapters at start-up — only the ones a screen actually needs.
 * @module bank/chapterLoader
 */
import { LRU, getPersisted, putPersisted } from './bankCache.js';
import { validateChapterFile } from './bankValidator.js';

const memory = new LRU(60);
const inflight = new Map();
let active = 0;
const waiters = [];
let LIMIT = 6;
/** Running count of questions dropped by validation (shown as a warning in the UI). */
export const loadStats = { dropped: 0, failed: 0 };

/** Configure the loader. @param {{concurrency?:number,lruSize?:number}} c */
export function configureLoader(c = {}) {
  if (c.concurrency) LIMIT = c.concurrency;
  if (c.lruSize) memory.max = c.lruSize;
}

async function acquire() {
  if (active < LIMIT) { active++; return; }
  await new Promise((r) => waiters.push(r));
  active++;
}
function release() {
  active--;
  const w = waiters.shift();
  if (w) w();
}

/**
 * Fetch one file path (relative to ./data/) as JSON with the concurrency limit.
 * @param {string} path @returns {Promise<{json:any, bytes:number}>}
 */
async function fetchJson(path, version) {
  await acquire();
  try {
    const res = await fetch('./data/' + path + '?v=' + encodeURIComponent(version ?? 1));
    if (!res.ok) throw new Error('HTTP ' + res.status + ' for ' + path);
    const text = await res.text();
    return { json: JSON.parse(text), bytes: text.length };
  } finally {
    release();
  }
}

/**
 * Load a chapter's questions.
 * @param {import('./catalogLoader.js').ChapterInfo} chapter
 * @param {{forceNetwork?:boolean}} [opt]
 * @returns {Promise<{questions:object[], dropped:number, fromCache:boolean, offline:boolean}>}
 */
export function loadChapter(chapter, opt = {}) {
  const key = chapter.id;
  if (!opt.forceNetwork) {
    const m = memory.get(key);
    if (m && m.version === chapter.version) return Promise.resolve({ questions: m.questions, dropped: m.dropped, fromCache: true, offline: false });
  }
  if (inflight.has(key)) return inflight.get(key);
  const p = (async () => {
    const persisted = await getPersisted(key);
    if (persisted && persisted.version === chapter.version && !opt.forceNetwork) {
      memory.set(key, persisted);
      return { questions: persisted.questions, dropped: persisted.dropped, fromCache: true, offline: false };
    }
    try {
      const parts = await Promise.all((chapter.files || []).map((f) => fetchJson(f, chapter.version)));
      let questions = [];
      let dropped = 0;
      let bytes = 0;
      for (const { json, bytes: b } of parts) {
        const r = validateChapterFile(json, chapter);
        questions = questions.concat(r.questions);
        dropped += r.dropped;
        bytes += b;
      }
      const rec = { chapterId: key, version: chapter.version, questions, dropped, savedAt: new Date().toISOString(), bytes };
      memory.set(key, rec);
      putPersisted(rec);
      loadStats.dropped += dropped;
      return { questions, dropped, fromCache: false, offline: false };
    } catch (err) {
      if (persisted) {
        memory.set(key, persisted);
        return { questions: persisted.questions, dropped: persisted.dropped, fromCache: true, offline: true };
      }
      loadStats.failed++;
      throw new Error(`Chapter ${chapter.title} is not available offline yet.`);
    }
  })();
  inflight.set(key, p);
  p.finally(() => inflight.delete(key));
  return p;
}

/**
 * Load several chapters, tolerating individual failures.
 * @param {Array<import('./catalogLoader.js').ChapterInfo>} chapters
 * @param {(done:number,total:number)=>void} [onProgress]
 * @returns {Promise<{questions:Array<object>, failed:string[], dropped:number}>} questions carry `_chapter` metadata
 */
export async function loadChapters(chapters, onProgress) {
  let done = 0;
  const failed = [];
  let dropped = 0;
  const all = [];
  await Promise.all(chapters.map(async (ch) => {
    try {
      const r = await loadChapter(ch);
      dropped += r.dropped;
      for (const q of r.questions) all.push({ ...q, _chapter: { id: ch.id, subjectId: ch.subjectId, category: ch.category, title: ch.title } });
    } catch {
      failed.push(ch.id);
    }
    done++;
    if (onProgress) onProgress(done, chapters.length);
  }));
  const order = new Map(chapters.map((c, i) => [c.id, i]));
  all.sort((a, b) => order.get(a._chapter.id) - order.get(b._chapter.id) || a.id.localeCompare(b.id));
  return { questions: all, failed, dropped };
}

/**
 * Pre-fetch chapters for offline use (also warms the service-worker cache).
 * @param {Array<import('./catalogLoader.js').ChapterInfo>} chapters
 * @param {(done:number,total:number)=>void} [onProgress]
 * @returns {Promise<{ok:number, failed:number}>}
 */
export async function downloadForOffline(chapters, onProgress) {
  let ok = 0;
  let failed = 0;
  let done = 0;
  await Promise.all(chapters.map(async (ch) => {
    try { await loadChapter(ch, { forceNetwork: true }); ok++; } catch { failed++; }
    done++;
    if (onProgress) onProgress(done, chapters.length);
  }));
  return { ok, failed };
}

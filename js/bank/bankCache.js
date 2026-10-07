/**
 * Two-level cache for chapter question sets: in-memory LRU + IndexedDB ('chapters' store).
 * @module bank/bankCache
 */
import * as db from '../storage/db.js';

/** Simple LRU map. */
export class LRU {
  /** @param {number} max */
  constructor(max = 60) { this.max = max; this.map = new Map(); }
  /** @param {string} k */
  get(k) {
    if (!this.map.has(k)) return undefined;
    const v = this.map.get(k);
    this.map.delete(k);
    this.map.set(k, v);
    return v;
  }
  /** @param {string} k @param {any} v */
  set(k, v) {
    if (this.map.has(k)) this.map.delete(k);
    this.map.set(k, v);
    while (this.map.size > this.max) this.map.delete(this.map.keys().next().value);
  }
  /** @param {string} k */
  has(k) { return this.map.has(k); }
}

/**
 * Persisted chapter record.
 * @typedef {{chapterId:string, version:number, questions:object[], dropped:number, savedAt:string, bytes:number}} CachedChapter
 */

/** @param {string} chapterId @returns {Promise<CachedChapter|undefined>} */
export function getPersisted(chapterId) {
  return db.get('chapters', chapterId);
}

/** @param {CachedChapter} rec @returns {Promise<boolean>} */
export function putPersisted(rec) {
  return db.set('chapters', rec.chapterId, rec);
}

/**
 * Summary of what is stored offline.
 * @returns {Promise<{chapters:number, bytes:number, ids:string[]}>}
 */
export async function offlineSummary() {
  const ids = await db.keys('chapters');
  let bytes = 0;
  for (const id of ids) {
    const r = await db.get('chapters', id);
    bytes += r?.bytes || 0;
  }
  return { chapters: ids.length, bytes, ids };
}

/** Remove every cached chapter. @returns {Promise<void>} */
export async function clearChapters() {
  for (const id of await db.keys('chapters')) await db.del('chapters', id);
}

/**
 * Loads data/catalog.json once (the only bank file fetched at start-up) and builds indexes.
 * @module bank/catalogLoader
 */
import { validateCatalog } from './bankValidator.js';
import * as db from '../storage/db.js';

let catalogPromise = null;

/**
 * @typedef {Object} ChapterInfo
 * @property {string} id @property {number} number @property {string} title
 * @property {string[]} files @property {number} questionCount @property {number} version
 * @property {string} subjectId @property {string} subjectName @property {string} category @property {string} categoryLabel
 */

/**
 * @typedef {Object} CatalogIndex
 * @property {object} raw
 * @property {Array<{id:string,label:string,subjects:object[]}>} categories
 * @property {Map<string,object>} subjectById
 * @property {Map<string,ChapterInfo>} chapterById
 * @property {ChapterInfo[]} chapters all chapters in catalog order
 * @property {{errors:string[],warnings:string[]}} validation
 */

/**
 * Build indexes from a raw catalog.
 * @param {object} raw @returns {CatalogIndex}
 */
export function indexCatalog(raw) {
  const v = validateCatalog(raw);
  const subjectById = new Map();
  const chapterById = new Map();
  const chapters = [];
  for (const c of raw.categories || []) {
    for (const s of c.subjects || []) {
      const sub = { ...s, category: c.id, categoryLabel: c.label };
      subjectById.set(s.id, sub);
      for (const ch of s.chapters || []) {
        const info = { ...ch, subjectId: s.id, subjectName: s.name, category: c.id, categoryLabel: c.label };
        chapterById.set(ch.id, info);
        chapters.push(info);
      }
    }
  }
  return { raw, categories: raw.categories || [], subjectById, chapterById, chapters, validation: { errors: v.errors, warnings: v.warnings } };
}

/**
 * Load the catalog (network first, IndexedDB copy as offline fallback).
 * @returns {Promise<CatalogIndex>}
 */
export function loadCatalog() {
  if (catalogPromise) return catalogPromise;
  catalogPromise = (async () => {
    let raw = null;
    try {
      const res = await fetch('./data/catalog.json', { cache: 'no-cache' });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      raw = await res.json();
      db.set('meta', 'catalog', raw);
    } catch (err) {
      raw = await db.get('meta', 'catalog');
      if (!raw) throw new Error('Could not load the subject catalog. Check your connection and try again.');
    }
    return indexCatalog(raw);
  })();
  catalogPromise.catch(() => { catalogPromise = null; });
  return catalogPromise;
}

/**
 * Fetch a small JSON data file with an IndexedDB fallback.
 * @param {string} name file name inside ./data/
 * @param {any} fallback value if both network and cache fail
 * @returns {Promise<any>}
 */
export async function loadDataFile(name, fallback) {
  try {
    const res = await fetch('./data/' + name, { cache: 'no-cache' });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const json = await res.json();
    db.set('meta', 'file:' + name, json);
    return json;
  } catch {
    const cached = await db.get('meta', 'file:' + name);
    return cached ?? fallback;
  }
}

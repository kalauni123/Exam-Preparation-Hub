/**
 * Minimal promise-based key-value store over IndexedDB with a localStorage fallback.
 * Object stores: 'users' (one JSON document per user), 'chapters' (cached chapter files),
 * 'meta' (small app settings).
 * @module storage/db
 */

const DB_NAME = 'neuromcq';
const DB_VERSION = 1;
const STORES = ['users', 'chapters', 'meta'];
let dbPromise = null;
let useFallback = false;

/** @returns {Promise<IDBDatabase|null>} */
function open() {
  if (useFallback) return Promise.resolve(null);
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve) => {
    try {
      if (!('indexedDB' in self)) { useFallback = true; resolve(null); return; }
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        for (const s of STORES) if (!db.objectStoreNames.contains(s)) db.createObjectStore(s);
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => { useFallback = true; resolve(null); };
      req.onblocked = () => { useFallback = true; resolve(null); };
    } catch {
      useFallback = true;
      resolve(null);
    }
  });
  return dbPromise;
}

const lsKey = (store, key) => `neuromcq:${store}:${key}`;

/**
 * Read a value.
 * @param {'users'|'chapters'|'meta'} store @param {string} key
 * @returns {Promise<any>}
 */
export async function get(store, key) {
  const db = await open();
  if (!db) {
    try { const v = localStorage.getItem(lsKey(store, key)); return v ? JSON.parse(v) : undefined; } catch { return undefined; }
  }
  return new Promise((resolve) => {
    try {
      const r = db.transaction(store, 'readonly').objectStore(store).get(key);
      r.onsuccess = () => resolve(r.result);
      r.onerror = () => resolve(undefined);
    } catch { resolve(undefined); }
  });
}

/**
 * Write a value.
 * @param {'users'|'chapters'|'meta'} store @param {string} key @param {any} value
 * @returns {Promise<boolean>} true on success
 */
export async function set(store, key, value) {
  const db = await open();
  if (!db) {
    try { localStorage.setItem(lsKey(store, key), JSON.stringify(value)); return true; } catch { return false; }
  }
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(store, 'readwrite');
      tx.objectStore(store).put(value, key);
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => resolve(false);
      tx.onabort = () => resolve(false);
    } catch { resolve(false); }
  });
}

/**
 * Delete a value.
 * @param {'users'|'chapters'|'meta'} store @param {string} key @returns {Promise<void>}
 */
export async function del(store, key) {
  const db = await open();
  if (!db) { try { localStorage.removeItem(lsKey(store, key)); } catch { /* ignore */ } return; }
  await new Promise((resolve) => {
    try {
      const tx = db.transaction(store, 'readwrite');
      tx.objectStore(store).delete(key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    } catch { resolve(); }
  });
}

/**
 * List all keys of a store.
 * @param {'users'|'chapters'|'meta'} store @returns {Promise<string[]>}
 */
export async function keys(store) {
  const db = await open();
  if (!db) {
    const out = [];
    try {
      const pre = `neuromcq:${store}:`;
      for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (k && k.startsWith(pre)) out.push(k.slice(pre.length)); }
    } catch { /* ignore */ }
    return out;
  }
  return new Promise((resolve) => {
    try {
      const r = db.transaction(store, 'readonly').objectStore(store).getAllKeys();
      r.onsuccess = () => resolve(r.result.map(String));
      r.onerror = () => resolve([]);
    } catch { resolve([]); }
  });
}

/**
 * Remove everything (all stores).
 * @returns {Promise<void>}
 */
export async function clearAll() {
  for (const s of STORES) for (const k of await keys(s)) await del(s, k);
}

/** @returns {boolean} whether the localStorage fallback is in use */
export function isFallback() {
  return useFallback;
}

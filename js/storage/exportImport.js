/**
 * Layer B — file export/import of a user's data (no server needed).
 * @module storage/exportImport
 */
import { importUserDoc } from './userStore.js';

/**
 * Trigger a download of a JSON document.
 * @param {any} obj @param {string} filename
 */
export function downloadJson(obj, filename) {
  const blob = new Blob([JSON.stringify(obj, null, 2)], { type: 'application/json' });
  downloadBlob(blob, filename);
}

/**
 * Trigger a download of any blob.
 * @param {Blob} blob @param {string} filename
 */
export function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

/**
 * Export the user's file as `<userId>.json` (same name as data/users/<userId>.json).
 * @param {object} user
 */
export function exportUser(user) {
  user.meta = user.meta || {};
  user.meta.lastBackupAt = new Date().toISOString();
  downloadJson(user, `${user.profile.userId}.json`);
}

/**
 * Read a File chosen by the user and import it.
 * @param {File} file @returns {Promise<object>} imported user document
 */
export async function importUserFile(file) {
  if (file.size > 25 * 1024 * 1024) throw new Error('File is too large (max 25 MB).');
  const text = await file.text();
  let raw;
  try { raw = JSON.parse(text); } catch { throw new Error('This file is not valid JSON.'); }
  return importUserDoc(raw);
}

/**
 * Whether the backup reminder should be shown.
 * @param {object} user @param {number} [days=7] @returns {boolean}
 */
export function backupDue(user, days = 7) {
  if (!user?.attempts?.length) return false;
  const last = Date.parse(user.meta?.lastBackupAt || user.profile?.createdAt || 0);
  return Date.now() - last > days * 86400000;
}

/**
 * Convert rows to CSV text (RFC 4180 quoting).
 * @param {Array<Array<any>>} rows @returns {string}
 */
export function toCsv(rows) {
  return rows.map((r) => r.map((c) => {
    const s = String(c ?? '');
    return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  }).join(',')).join('\n');
}

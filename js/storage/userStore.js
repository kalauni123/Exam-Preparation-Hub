/**
 * Layer A — per-user documents stored separately in IndexedDB under `neuromcq:user:<userId>`
 * (localStorage fallback). Registration, login and debounced saving.
 * @module storage/userStore
 */
import * as db from './db.js';
import { emptyUser, migrate, validateUser } from './schema.js';
import { makeUserId, normalizePhone, isValidPhone, maskPhone, sha256Hex } from '../utils/crypto.js';

const KEY = (id) => 'neuromcq:user:' + id;
const timers = new Map();

/**
 * List profiles stored on this device (summary only, never the phone).
 * @returns {Promise<Array<{userId:string,name:string,phoneMasked:string,createdAt:string,updatedAt:string}>>}
 */
export async function listLocalUsers() {
  const keys = (await db.keys('users')).filter((k) => k.startsWith('neuromcq:user:'));
  const out = [];
  for (const k of keys) {
    const u = await db.get('users', k);
    if (u?.profile) out.push({ userId: u.profile.userId, name: u.profile.name, phoneMasked: u.profile.phoneMasked, createdAt: u.profile.createdAt, updatedAt: u.meta?.updatedAt || '' });
  }
  return out.sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''));
}

/**
 * Load a user document (repairing missing fields).
 * @param {string} userId @returns {Promise<object|null>}
 */
export async function loadUser(userId) {
  const u = await db.get('users', KEY(userId));
  if (!u) return null;
  try { return migrate(u); } catch { return null; }
}

/**
 * Persist immediately.
 * @param {object} user @returns {Promise<boolean>}
 */
export async function saveUserNow(user) {
  user.meta = user.meta || {};
  user.meta.updatedAt = new Date().toISOString();
  return db.set('users', KEY(user.profile.userId), user);
}

/**
 * Debounced save (coalesces rapid answer-by-answer updates).
 * @param {object} user @param {number} [delay=400]
 */
export function saveUser(user, delay = 400) {
  const id = user.profile.userId;
  clearTimeout(timers.get(id));
  timers.set(id, setTimeout(() => { timers.delete(id); saveUserNow(user); }, delay));
}

/** Flush all pending debounced saves. @param {object} [user] */
export async function flush(user) {
  for (const [id, t] of timers) { clearTimeout(t); timers.delete(id); }
  if (user) await saveUserNow(user);
}

/**
 * Register a new profile.
 * @param {{name:string, phone:string}} input
 * @param {object} regCfg config.registration
 * @returns {Promise<object>} the new user document
 */
export async function registerUser(input, regCfg = {}) {
  const name = String(input.name || '').trim().replace(/\s+/g, ' ');
  if (name.length < 2 || name.length > 80) throw new Error('Please enter your full name (2–80 characters).');
  const phone = normalizePhone(input.phone);
  if (!isValidPhone(phone, regCfg)) {
    throw new Error(regCfg.nepalPhoneOnly !== false ? 'Enter a valid 10-digit Nepali mobile number starting with 98 or 97.' : 'Enter a valid phone number.');
  }
  const { userId, phoneHash } = await makeUserId(name, phone);
  if (await db.get('users', KEY(userId))) throw new Error('This profile already exists on this device — please log in instead.');
  const doc = emptyUser({ userId, name, phoneHash, phoneMasked: maskPhone(phone) });
  await saveUserNow(doc);
  return doc;
}

/**
 * Find a local profile by phone number.
 * @param {string} phoneRaw @returns {Promise<object|null>}
 */
export async function findByPhone(phoneRaw) {
  const phone = normalizePhone(phoneRaw);
  const hash = await sha256Hex(phone);
  for (const k of await db.keys('users')) {
    const u = await db.get('users', k);
    if (u?.profile?.phoneHash === hash) return migrate(u);
  }
  return null;
}

/**
 * Import (or replace) a user document after validation.
 * @param {object} raw parsed JSON @param {Function} [mapping] v1 mapping
 * @returns {Promise<object>} imported document
 */
export async function importUserDoc(raw, mapping) {
  const doc = migrate(raw, mapping);
  const problems = validateUser(doc);
  if (problems.length) throw new Error('Invalid user file: ' + problems.join('; '));
  await saveUserNow(doc);
  return doc;
}

/** Delete a profile. @param {string} userId */
export async function deleteUser(userId) {
  await db.del('users', KEY(userId));
}

/** Remember which profile is active on this device. */
export async function setCurrentUserId(id) { await db.set('meta', 'currentUser', id || ''); }
/** @returns {Promise<string>} */
export async function getCurrentUserId() { return (await db.get('meta', 'currentUser')) || ''; }

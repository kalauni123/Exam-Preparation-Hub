/**
 * User-file schema (v2): creation, validation and migration (v1 → v2).
 * See README "User data model" for the documented structure.
 * @module storage/schema
 */

export const USER_SCHEMA_VERSION = 2;
const MAX_ATTEMPTS = 50000;

/**
 * Empty v2 user document.
 * @param {{userId:string,name:string,phoneHash:string,phoneMasked:string}} p
 * @returns {object}
 */
export function emptyUser(p) {
  const now = new Date().toISOString();
  return {
    schemaVersion: USER_SCHEMA_VERSION,
    profile: { userId: p.userId, name: p.name, phoneHash: p.phoneHash, phoneMasked: p.phoneMasked, createdAt: now, examTarget: '', examDate: '', dailyMinutes: 35, activeSubjects: [] },
    attempts: [], sessions: [], conceptState: {}, questionState: {},
    abilities: { theta: 0, se: 1, bySubject: {}, bySkill: {}, tau: 0 },
    skills: { conceptual: null, numerical: null, memory: null, application: null, speed: null, accuracy: null },
    trend: { ewma: [], raw: [] },
    rating: { glicko: { r: 1500, rd: 350, sigma: 0.06 }, history: [] },
    mistakeBook: [], bookmarks: [], dna: {}, errorModel: { counts: {}, byTag: {} }, notes: {},
    settings: { theme: 'light', sound: true, haptics: true, reducedMotion: false, language: 'en', proView: false },
    meta: { lastBackupAt: '', updatedAt: now, rapidBonus: 0, extraHints: 0, sessionsSinceAd: 0 },
  };
}

const isObj = (x) => x !== null && typeof x === 'object' && !Array.isArray(x);

/**
 * Validate an (untrusted) user document. Returns problems; empty means acceptable.
 * @param {any} u @returns {string[]}
 */
export function validateUser(u) {
  const p = [];
  if (!isObj(u)) return ['not a JSON object'];
  if (u.schemaVersion !== USER_SCHEMA_VERSION) p.push(`schemaVersion must be ${USER_SCHEMA_VERSION}`);
  if (!isObj(u.profile) || typeof u.profile.userId !== 'string' || !/^[a-z0-9-]{3,120}$/.test(u.profile.userId)) p.push('profile.userId missing or invalid');
  if (!isObj(u.profile) || typeof u.profile.name !== 'string' || u.profile.name.length > 120) p.push('profile.name missing or too long');
  if (!Array.isArray(u.attempts)) p.push('attempts must be an array');
  else if (u.attempts.length > MAX_ATTEMPTS) p.push('too many attempts');
  else if (u.attempts.some((a) => !isObj(a) || typeof a.questionId !== 'string' || typeof a.isCorrect !== 'boolean')) p.push('attempt records malformed');
  for (const k of ['sessions', 'mistakeBook', 'bookmarks']) if (u[k] !== undefined && !Array.isArray(u[k])) p.push(`${k} must be an array`);
  for (const k of ['conceptState', 'questionState']) if (u[k] !== undefined && !isObj(u[k])) p.push(`${k} must be an object`);
  return p;
}

/**
 * Fill any missing v2 fields with defaults (forward-compatible repair).
 * @param {object} u @returns {object}
 */
export function repairUser(u) {
  const base = emptyUser({ userId: u.profile.userId, name: u.profile.name, phoneHash: u.profile.phoneHash || '', phoneMasked: u.profile.phoneMasked || '' });
  const out = { ...base, ...u };
  out.profile = { ...base.profile, ...u.profile };
  out.settings = { ...base.settings, ...(u.settings || {}) };
  out.meta = { ...base.meta, ...(u.meta || {}) };
  out.abilities = { ...base.abilities, ...(u.abilities || {}) };
  out.skills = { ...base.skills, ...(u.skills || {}) };
  out.trend = { ...base.trend, ...(u.trend || {}) };
  out.rating = { ...base.rating, ...(u.rating || {}) };
  out.errorModel = { ...base.errorModel, ...(u.errorModel || {}) };
  return out;
}

/**
 * Migrate a v1 document (subject/topic/concept records) to v2 (category/subjectId/chapterId).
 * Records whose (subject, topic) can be mapped through `mapping` get that chapterId;
 * otherwise they are parked under chapterId "UNMAPPED".
 * @param {object} v1 user document with schemaVersion 1
 * @param {(rec:{subject?:string,topic?:string,concept?:string})=>({category:string,subjectId:string,chapterId:string}|null)} mapping
 * @returns {object} v2 document
 */
export function migrateV1toV2(v1, mapping) {
  const prof = v1.profile || {};
  const doc = emptyUser({ userId: prof.userId, name: prof.name, phoneHash: prof.phoneHash || '', phoneMasked: prof.phoneMasked || '' });
  doc.profile = { ...doc.profile, ...prof, activeSubjects: prof.activeSubjects || [] };
  const mapRec = (r) => {
    const m = mapping ? mapping(r) : null;
    return m ? { category: m.category, subjectId: m.subjectId, chapterId: m.chapterId } : { category: 'unknown', subjectId: 'UNMAPPED', chapterId: 'UNMAPPED' };
  };
  doc.attempts = (v1.attempts || []).map((a) => {
    const { subject, topic, ...rest } = a;
    return { ...rest, ...mapRec(a), concept: a.concept || '' };
  });
  doc.sessions = v1.sessions || [];
  doc.mistakeBook = (v1.mistakeBook || []).map((m) => {
    const { subject, topic, ...rest } = m;
    return { ...rest, chapterId: mapRec(m).chapterId };
  });
  doc.bookmarks = v1.bookmarks || [];
  doc.questionState = v1.questionState || {};
  doc.rating = v1.rating || doc.rating;
  doc.settings = { ...doc.settings, ...(v1.settings || {}) };
  // v1 conceptState was keyed by concept; re-key by mapped chapter where possible.
  for (const [k, st] of Object.entries(v1.conceptState || {})) {
    const m = mapRec({ concept: k });
    const key = m.chapterId === 'UNMAPPED' ? 'UNMAPPED#' + k : m.chapterId;
    doc.conceptState[key] = st;
  }
  return doc;
}

/**
 * Bring any supported document to the current schema.
 * @param {object} u @param {Function} [mapping] v1 mapping
 * @returns {object}
 */
export function migrate(u, mapping) {
  if (!isObj(u)) throw new Error('Not a user document');
  if (u.schemaVersion === 1) return repairUser(migrateV1toV2(u, mapping));
  if (u.schemaVersion === USER_SCHEMA_VERSION) return repairUser(u);
  throw new Error('Unsupported schemaVersion ' + u.schemaVersion);
}

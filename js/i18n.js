/**
 * UI translations (English + Nepali) from data/i18n.json.
 * @module i18n
 */
let dict = { en: {}, ne: {} };
let lang = 'en';

/** Load dictionaries. @param {object} json */
export function setDictionaries(json) {
  if (json && typeof json === 'object') dict = { en: json.en || {}, ne: json.ne || {} };
}

/** Set active language. @param {string} l */
export function setLang(l) {
  lang = l === 'ne' ? 'ne' : 'en';
  document.documentElement.lang = lang === 'ne' ? 'ne' : 'en';
}

/** @returns {string} */
export function getLang() { return lang; }

/**
 * Translate a key with {var} interpolation; falls back to English, then to the key.
 * @param {string} key @param {Object<string,string|number>} [vars] @returns {string}
 */
export function t(key, vars) {
  let s = dict[lang]?.[key] ?? dict.en?.[key] ?? key;
  if (vars) for (const [k, v] of Object.entries(vars)) s = s.replaceAll('{' + k + '}', String(v));
  return s;
}

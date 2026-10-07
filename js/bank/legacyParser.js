/**
 * Section 7.6 — Parser and converter for the legacy portal's question files:
 *   window.someCh1 = [ { id: "T1-01", subjectCode: "TECH", chapterCode: "TECH-01",
 *                        question: "…", options: { A: "…", … }, correctAnswer: "C", explanation: "…" } ];
 * A small hand-written recursive-descent parser for the JavaScript object-literal subset.
 * No eval / new Function is used anywhere.
 * @module bank/legacyParser
 */
import { contentFlags } from '../engine/questionQuality.js';

/**
 * Parse a JS object-literal value (object, array, string, number, boolean, null).
 * Supports unquoted keys, single/double quoted strings, escapes, comments and trailing commas.
 * @param {string} src
 * @param {number} [start=0]
 * @returns {{value:any, end:number}}
 */
export function parseLiteral(src, start = 0) {
  let i = start;
  const err = (msg) => { throw new SyntaxError(`${msg} at offset ${i}`); };
  function ws() {
    for (;;) {
      while (i < src.length && /\s/.test(src[i])) i++;
      if (src[i] === '/' && src[i + 1] === '/') { while (i < src.length && src[i] !== '\n') i++; continue; }
      if (src[i] === '/' && src[i + 1] === '*') { const e = src.indexOf('*/', i + 2); i = e < 0 ? src.length : e + 2; continue; }
      break;
    }
  }
  function str() {
    const q = src[i++];
    let out = '';
    while (i < src.length && src[i] !== q) {
      let c = src[i++];
      if (c === '\\') {
        c = src[i++];
        const map = { n: '\n', t: '\t', r: '\r', b: '\b', f: '\f', v: '\v', 0: '\0' };
        if (c === 'u') { out += String.fromCharCode(parseInt(src.substr(i, 4), 16)); i += 4; continue; }
        if (c === 'x') { out += String.fromCharCode(parseInt(src.substr(i, 2), 16)); i += 2; continue; }
        if (c === '\n') continue; // line continuation
        out += c in map ? map[c] : c;
        continue;
      }
      out += c;
    }
    if (src[i] !== q) err('Unterminated string');
    i++;
    return out;
  }
  function ident() {
    const m = /^[A-Za-z_$][\w$]*/.exec(src.slice(i, i + 200));
    if (!m) err('Expected identifier');
    i += m[0].length;
    return m[0];
  }
  function value() {
    ws();
    const c = src[i];
    if (c === '{') {
      i++;
      const o = {};
      for (;;) {
        ws();
        if (src[i] === '}') { i++; return o; }
        let k;
        if (src[i] === '"' || src[i] === "'") k = str();
        else if (/[0-9]/.test(src[i])) { const m = /^\d+/.exec(src.slice(i)); k = m[0]; i += k.length; }
        else k = ident();
        ws();
        if (src[i] !== ':') err('Expected :');
        i++;
        o[k] = value();
        ws();
        if (src[i] === ',') { i++; continue; }
        if (src[i] === '}') { i++; return o; }
        err('Expected , or }');
      }
    }
    if (c === '[') {
      i++;
      const a = [];
      for (;;) {
        ws();
        if (src[i] === ']') { i++; return a; }
        a.push(value());
        ws();
        if (src[i] === ',') { i++; continue; }
        if (src[i] === ']') { i++; return a; }
        err('Expected , or ]');
      }
    }
    if (c === '"' || c === "'") return str();
    if (c === '`') {
      // Template literal without substitutions.
      i++;
      const e = src.indexOf('`', i);
      if (e < 0) err('Unterminated template');
      const s = src.slice(i, e);
      if (s.includes('${')) err('Template substitutions are not supported');
      i = e + 1;
      return s;
    }
    const num = /^-?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?/.exec(src.slice(i, i + 40));
    if (num) { i += num[0].length; return Number(num[0]); }
    const id = ident();
    if (id === 'true') return true;
    if (id === 'false') return false;
    if (id === 'null') return null;
    if (id === 'undefined') return undefined;
    err('Unexpected token ' + id);
    return undefined;
  }
  const v = value();
  return { value: v, end: i };
}

/**
 * Parse a whole legacy file. Finds every `window.<name> = <literal>;` assignment.
 * @param {string} text file contents
 * @returns {Array<{globalName:string, items:any}>}
 */
export function parseLegacyFile(text) {
  const out = [];
  const re = /window\.([A-Za-z_$][\w$]*)\s*=\s*/g;
  let m;
  while ((m = re.exec(text))) {
    const { value, end } = parseLiteral(text, re.lastIndex);
    out.push({ globalName: m[1], items: value });
    re.lastIndex = end;
  }
  return out;
}

/** True if a legacy question is a placeholder ("Sample Question…", "Option A"). */
export function isPlaceholder(item) {
  const stem = String(item?.question || '');
  if (/sample question/i.test(stem)) return true;
  const opts = Object.values(item?.options || {}).map(String);
  return opts.length > 0 && opts.every((o) => /^\s*option\s*[a-e]\s*$/i.test(o));
}

/**
 * Convert parsed legacy items to new-format chapter files.
 * @param {any[]} items legacy question objects
 * @param {{chapterById:Map<string,object>}} catalogIndex index from catalogLoader
 * @param {{reassign?:Object<string,string|'skip'>}} [opt] per-legacy-id decision for mismatches
 * @returns {{files:Object<string,{schemaVersion:number,chapterId:string,subjectId:string,category:string,questions:object[]}>,
 *            report:{converted:number, placeholders:string[], mismatches:Array<{legacyId:string,chapterId:string,stem:string,reason:string}>, invalid:Array<{legacyId:string,reason:string}>, skipped:string[]}}}
 */
export function convertLegacy(items, catalogIndex, opt = {}) {
  const files = {};
  const report = { converted: 0, placeholders: [], mismatches: [], invalid: [], skipped: [] };
  const reassign = opt.reassign || {};
  const serial = {};
  for (const it of Array.isArray(items) ? items : []) {
    const legacyId = String(it?.id ?? '');
    if (!it || typeof it !== 'object') { report.invalid.push({ legacyId, reason: 'not an object' }); continue; }
    if (isPlaceholder(it)) { report.placeholders.push(legacyId); continue; }
    let chapterId = String(it.chapterCode || '');
    const options = it.options && typeof it.options === 'object' ? Object.fromEntries(Object.entries(it.options).map(([k, v]) => [String(k).toUpperCase(), String(v)])) : null;
    const answer = String(it.correctAnswer || '').toUpperCase();
    if (!it.question || !options || Object.keys(options).length < 2 || !(answer in options)) {
      report.invalid.push({ legacyId, reason: 'missing question/options or answer not among options' });
      continue;
    }
    let ch = catalogIndex.chapterById.get(chapterId);
    if (!ch) { report.invalid.push({ legacyId, reason: `unknown chapter ${chapterId}` }); continue; }
    const probe = { stem: it.question, options, explanation: { whyCorrect: it.explanation } };
    const flags = contentFlags(probe, ch.category);
    if (flags.includes('chapter-mismatch')) {
      const decision = reassign[legacyId];
      const target = decision && decision !== 'skip' ? catalogIndex.chapterById.get(decision) : null;
      report.mismatches.push({ legacyId, chapterId, stem: String(it.question).slice(0, 140), reason: `content does not look like ${ch.category} material`, action: target ? `re-assigned to ${decision}` : 'skipped' });
      if (!target) { report.skipped.push(legacyId); continue; }
      chapterId = decision;
      ch = target;
    }
    serial[chapterId] = (serial[chapterId] || 0) + 1;
    const q = {
      id: `${chapterId}-${String(9000 + serial[chapterId]).padStart(4, '0')}`, // 9001–9999 reserved for legacy imports
      concept: '',
      type: 'conceptual',
      difficulty: { a: 1, b: 0, c: 0.25 },
      stem: String(it.question),
      options,
      answer,
      explanation: { whyCorrect: typeof it.explanation === 'string' ? it.explanation : '', whyWrong: {}, conceptTested: '', trapUsed: '', howToModify: '', howToAvoid: '' },
      distractorTags: {},
      template: null,
      tags: [],
      source: 'legacy MCQ\'s-Portal import',
      legacyId,
      needsReview: true,
    };
    if (!files[chapterId]) files[chapterId] = { schemaVersion: 1, chapterId, subjectId: ch.subjectId, category: ch.category, questions: [] };
    files[chapterId].questions.push(q);
    report.converted++;
  }
  return { files, report };
}

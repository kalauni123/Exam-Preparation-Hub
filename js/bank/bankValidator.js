/**
 * Schema validation for catalog.json and chapter files (Sections 7.1–7.2, 13).
 * All fetched/imported JSON is treated as untrusted.
 * @module bank/bankValidator
 */

const TYPES = new Set(['conceptual', 'numerical', 'memory', 'application']);
const ID_RE = /^[A-Z][A-Z0-9_]*-\d{2}$/;

/** @param {any} x @returns {x is object} */
const isObj = (x) => x !== null && typeof x === 'object' && !Array.isArray(x);
const isStr = (x) => typeof x === 'string';

/**
 * Validate the catalog structure.
 * @param {any} cat
 * @returns {{ok:boolean, errors:string[], warnings:string[], subjects:number, chapters:number}}
 */
export function validateCatalog(cat) {
  const errors = [];
  const warnings = [];
  let subjects = 0;
  let chapters = 0;
  if (!isObj(cat) || !Array.isArray(cat.categories)) return { ok: false, errors: ['catalog.categories must be an array'], warnings, subjects, chapters };
  const subjectIds = new Set();
  const chapterIds = new Set();
  for (const c of cat.categories) {
    if (!isObj(c) || !isStr(c.id) || !isStr(c.label) || !Array.isArray(c.subjects)) { errors.push('Invalid category entry'); continue; }
    for (const s of c.subjects) {
      subjects++;
      if (!isObj(s) || !isStr(s.id) || !isStr(s.name) || !Array.isArray(s.chapters)) { errors.push(`Invalid subject in ${c.id}`); continue; }
      if (subjectIds.has(s.id)) errors.push(`Duplicate subject id ${s.id}`);
      subjectIds.add(s.id);
      if (s.chapters.length !== 15) warnings.push(`${s.id} has ${s.chapters.length} chapters (expected 15)`);
      for (const ch of s.chapters) {
        chapters++;
        if (!isObj(ch) || !isStr(ch.id) || !isStr(ch.title)) { errors.push(`Invalid chapter in ${s.id}`); continue; }
        if (!ID_RE.test(ch.id)) errors.push(`Bad chapter id format ${ch.id}`);
        if (!ch.id.startsWith(s.id + '-')) errors.push(`Chapter ${ch.id} does not start with subject id ${s.id}`);
        if (chapterIds.has(ch.id)) errors.push(`Duplicate chapter id ${ch.id}`);
        chapterIds.add(ch.id);
        if (!Array.isArray(ch.files) || !ch.files.length || !ch.files.every(isStr)) errors.push(`Chapter ${ch.id} needs a non-empty files array`);
        else if (ch.files.some((f) => f.startsWith('/') || f.includes('..'))) errors.push(`Chapter ${ch.id} has an unsafe file path`);
      }
    }
  }
  return { ok: errors.length === 0, errors, warnings, subjects, chapters };
}

/**
 * Validate one question.
 * @param {any} q
 * @param {string} chapterId
 * @returns {string[]} problems (empty = valid)
 */
export function validateQuestion(q, chapterId) {
  const p = [];
  if (!isObj(q)) return ['question is not an object'];
  if (!isStr(q.id) || !q.id.startsWith(chapterId + '-') || !/-\d{4}$/.test(q.id)) p.push(`id must be ${chapterId}-NNNN`);
  if (!isStr(q.stem) || !q.stem.trim()) p.push('stem missing');
  if (!isObj(q.options)) p.push('options missing');
  else {
    const keys = Object.keys(q.options);
    if (keys.length < 2 || keys.length > 5) p.push('options must have 2–5 entries');
    if (!keys.every((k) => /^[A-E]$/.test(k) && isStr(q.options[k]))) p.push('option keys must be A–E with string values');
    if (!keys.includes(q.answer)) p.push('answer must be one of the option keys');
  }
  if (q.type !== undefined && !TYPES.has(q.type)) p.push('type must be conceptual|numerical|memory|application');
  if (q.difficulty !== undefined) {
    const d = q.difficulty;
    if (!isObj(d) || ['a', 'b', 'c'].some((k) => d[k] !== undefined && typeof d[k] !== 'number')) p.push('difficulty must be {a,b,c} numbers');
  }
  if (q.explanation !== undefined && !isObj(q.explanation) && !isStr(q.explanation)) p.push('explanation must be an object');
  return p;
}

/**
 * Normalise a valid question: defaults for omitted fields, string explanation → object.
 * @param {object} q @returns {object}
 */
export function normalizeQuestion(q) {
  const ex = isStr(q.explanation) ? { whyCorrect: q.explanation } : (q.explanation || {});
  return {
    ...q,
    concept: isStr(q.concept) ? q.concept : '',
    type: TYPES.has(q.type) ? q.type : 'conceptual',
    difficulty: { a: q.difficulty?.a ?? 1, b: q.difficulty?.b ?? 0, c: q.difficulty?.c ?? 0.25 },
    explanation: {
      whyCorrect: isStr(ex.whyCorrect) ? ex.whyCorrect : '',
      whyWrong: isObj(ex.whyWrong) ? ex.whyWrong : {},
      conceptTested: isStr(ex.conceptTested) ? ex.conceptTested : '',
      trapUsed: isStr(ex.trapUsed) ? ex.trapUsed : '',
      howToModify: isStr(ex.howToModify) ? ex.howToModify : '',
      howToAvoid: isStr(ex.howToAvoid) ? ex.howToAvoid : '',
    },
    distractorTags: isObj(q.distractorTags) ? q.distractorTags : {},
    tags: Array.isArray(q.tags) ? q.tags.filter(isStr) : [],
  };
}

/**
 * Validate a chapter file and return the cleaned questions (invalid ones dropped).
 * @param {any} doc parsed chapter JSON
 * @param {{id:string, subjectId:string, category:string}} chapter catalog chapter info
 * @returns {{questions:object[], dropped:number, errors:string[]}}
 */
export function validateChapterFile(doc, chapter) {
  const errors = [];
  if (!isObj(doc)) return { questions: [], dropped: 0, errors: ['file is not a JSON object'] };
  if (doc.chapterId !== chapter.id) errors.push(`chapterId ${doc.chapterId} ≠ ${chapter.id}`);
  if (doc.subjectId !== chapter.subjectId) errors.push(`subjectId ${doc.subjectId} ≠ ${chapter.subjectId}`);
  if (doc.category !== chapter.category) errors.push(`category ${doc.category} ≠ ${chapter.category}`);
  if (!Array.isArray(doc.questions)) return { questions: [], dropped: 0, errors: [...errors, 'questions must be an array'] };
  const out = [];
  const seen = new Set();
  let dropped = 0;
  for (const q of doc.questions) {
    const p = validateQuestion(q, chapter.id);
    if (!p.length && seen.has(q.id)) p.push('duplicate id');
    if (p.length) { dropped++; errors.push(`${q?.id ?? '?'}: ${p.join('; ')}`); continue; }
    seen.add(q.id);
    out.push(normalizeQuestion(q));
  }
  return { questions: out, dropped, errors };
}

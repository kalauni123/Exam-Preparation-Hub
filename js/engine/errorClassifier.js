/**
 * Section 9.10 — Error-type classification with a Laplace-smoothed, count-based Bayesian
 * classifier per learner.
 *   posterior(c) ∝ prior(c) · Π likelihood(evidence | c)
 *   prior(c) = (n_c + 1) / (N + |C|)                 (learner's own history, Laplace)
 *   likelihood(tag | c) = (n_{tag,c} + 1) / (n_c + |T|)   learned from past classifications,
 *   multiplied by a fixed evidence table for the distractor tag, timing and confidence.
 * @module engine/errorClassifier
 */

/** Physics error categories. */
export const PHYSICS_TYPES = ['sign-error', 'formula-confusion', 'unit-error', 'concept-confusion', 'careless', 'guessing'];
/** Extra categories allowed for aptitude chapters. */
export const APTITUDE_TYPES = ['factual-recall', 'definition-confusion', 'date-number-mixup', 'similar-term-confusion'];

/** Human-readable labels. */
export const ERROR_LABELS = Object.freeze({
  'sign-error': 'Sign error',
  'formula-confusion': 'Formula confusion',
  'unit-error': 'Unit / power-of-ten error',
  'concept-confusion': 'Concept confusion',
  careless: 'Careless / time pressure',
  guessing: 'Guessing',
  'factual-recall': 'Factual recall gap',
  'definition-confusion': 'Definition confusion',
  'date-number-mixup': 'Date / number mix-up',
  'similar-term-confusion': 'Similar-term confusion',
});

/**
 * Evidence multipliers. A distractor tag strongly suggests its own category.
 * @param {string} cat @param {{tag?:string,rushing?:boolean,slow?:boolean,confidence?:number,changed?:boolean}} ev
 * @returns {number}
 */
function evidenceLikelihood(cat, ev) {
  let L = 1;
  if (ev.tag) L *= ev.tag === cat ? 6 : 0.6;
  if (ev.rushing) L *= cat === 'guessing' ? 4 : cat === 'careless' ? 2.5 : 0.7;
  if (ev.slow) L *= cat === 'concept-confusion' || cat === 'formula-confusion' ? 1.6 : 0.9;
  if (ev.confidence === 1) L *= cat === 'guessing' ? 2.5 : 0.9;
  if (ev.confidence === 3) L *= cat === 'concept-confusion' || cat === 'definition-confusion' ? 2 : cat === 'guessing' ? 0.3 : 1;
  if (ev.changed) L *= cat === 'careless' ? 1.8 : 1;
  return L;
}

/**
 * Classify one wrong answer.
 * @param {{counts?:Object<string,number>, byTag?:Object<string,Object<string,number>>}} model learner model
 * @param {{tag?:string,rushing?:boolean,slow?:boolean,confidence?:number,changed?:boolean}} ev evidence
 * @param {boolean} [aptitude=false] include aptitude categories
 * @returns {{type:string, probs:Object<string,number>}}
 */
export function classifyError(model, ev, aptitude = false) {
  const cats = aptitude ? [...PHYSICS_TYPES, ...APTITUDE_TYPES] : PHYSICS_TYPES;
  const counts = model?.counts || {};
  const N = cats.reduce((s, c) => s + (counts[c] || 0), 0);
  const tagRow = ev.tag ? (model?.byTag?.[ev.tag] || {}) : null;
  const scores = {};
  let Z = 0;
  for (const c of cats) {
    const prior = ((counts[c] || 0) + 1) / (N + cats.length);
    const learned = tagRow ? ((tagRow[c] || 0) + 1) / ((counts[c] || 0) + cats.length) : 1;
    const s = prior * learned * evidenceLikelihood(c, ev);
    scores[c] = s;
    Z += s;
  }
  let best = cats[0];
  for (const c of cats) { scores[c] /= Z; if (scores[c] > scores[best]) best = c; }
  return { type: best, probs: scores };
}

/**
 * Update the learner's count model with a classified error (returns a new object).
 * @param {object} model @param {string} type @param {string} [tag]
 * @returns {{counts:Object<string,number>, byTag:Object<string,Object<string,number>>}}
 */
export function updateModel(model, type, tag) {
  const counts = { ...(model?.counts || {}) };
  counts[type] = (counts[type] || 0) + 1;
  const byTag = { ...(model?.byTag || {}) };
  if (tag) byTag[tag] = { ...(byTag[tag] || {}), [type]: ((byTag[tag] || {})[type] || 0) + 1 };
  return { counts, byTag };
}

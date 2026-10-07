/**
 * Section 9.9 + Feature 12 — Classical Test Theory statistics and bank-content checks.
 * @module engine/questionQuality
 */
import { mean } from './stats.js';

/** Minimum number of responses before CTT statistics are reported. */
export const MIN_N = 30;

/**
 * Normalise text for similarity: strip LaTeX delimiters/commands, lowercase, keep words.
 * @param {string} s @returns {string}
 */
export function normalizeText(s) {
  return String(s || '')
    .replace(/\\[()[\]]/g, ' ')
    .replace(/\\[a-zA-Z]+/g, (m) => ' ' + m.slice(1) + ' ')
    .toLowerCase()
    .replace(/[^a-z0-9α-ω]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Word k-shingles of a normalised string.
 * @param {string} text @param {number} [k=3] @returns {Set<string>}
 */
export function shingles(text, k = 3) {
  const w = normalizeText(text).split(' ').filter(Boolean);
  const out = new Set();
  if (w.length < k) { if (w.length) out.add(w.join(' ')); return out; }
  for (let i = 0; i + k <= w.length; i++) out.add(w.slice(i, i + k).join(' '));
  return out;
}

/** Jaccard index |A∩B|/|A∪B|. @param {Set<string>} a @param {Set<string>} b @returns {number} */
export function jaccard(a, b) {
  if (!a.size && !b.size) return 1;
  let inter = 0;
  for (const x of a) if (b.has(x)) inter++;
  return inter / (a.size + b.size - inter);
}

/**
 * Near-duplicate detection within and across chapters using an inverted shingle index
 * (only pairs sharing at least one shingle are compared).
 * @param {Array<{id:string,stem:string,options?:object}>} questions
 * @param {number} [threshold=0.7]
 * @returns {Array<{a:string,b:string,similarity:number}>}
 */
export function findDuplicates(questions, threshold = 0.7) {
  const sh = questions.map((q) => shingles(q.stem + ' ' + Object.values(q.options || {}).join(' ')));
  const index = new Map();
  sh.forEach((set, i) => { for (const s of set) { if (!index.has(s)) index.set(s, []); index.get(s).push(i); } });
  const pairs = [];
  const done = new Set();
  sh.forEach((set, i) => {
    const cand = new Set();
    for (const s of set) for (const j of index.get(s)) if (j > i) cand.add(j);
    for (const j of cand) {
      const key = i + ':' + j;
      if (done.has(key)) continue;
      done.add(key);
      const sim = jaccard(set, sh[j]);
      if (sim >= threshold) pairs.push({ a: questions[i].id, b: questions[j].id, similarity: sim });
    }
  });
  return pairs.sort((x, y) => y.similarity - x.similarity);
}

const PLACEHOLDER_STEM = /sample question|lorem ipsum|question text here|^\s*q\d*\s*$/i;
const PLACEHOLDER_OPT = /^\s*option\s*[a-e]\s*$/i;
const PHYSICS_WORDS = /\b(momentum|potential energy|wave ?function|hamiltonian|lagrangian|quantum|photon|electron|torque|inertia|entropy|kinetic|velocity|acceleration|eigen|oscillator|magnetic|electric field|newton|joule|kelvin|lattice|boson|fermion|schr[öo]dinger|commutator|moment of inertia|orbit|wavelength|frequency|collisions?|conserved|gravitational|fluid|particles?|kepler|escape velocity|bernoulli|damped|damping|oscillat\w*|rigid body|angular|incline|spring constant|eigen\w*)\b|\\(frac|hbar|nabla|mathbf)/i;
const APTITUDE_WORDS = /\b(teaching|teacher|learner|classroom|curriculum|pedagog|communication|university|ugc|research|hypothesis|sampling|ict|environment|pollution|evaluation|student|education|syllabus)\b/i;

/**
 * Static content checks on one question.
 * @param {object} q question (new schema)
 * @param {string} [category] 'aptitude' | 'bsc' | 'msc'
 * @returns {string[]} flag codes
 */
export function contentFlags(q, category) {
  const flags = [];
  const opts = Object.entries(q.options || {});
  const stem = String(q.stem || '');
  if (PLACEHOLDER_STEM.test(stem) || opts.some(([, v]) => PLACEHOLDER_OPT.test(String(v)))) flags.push('placeholder');
  const norm = opts.map(([, v]) => String(v).toLowerCase().replace(/\s+/g, '').replace(/\\[,;! ]/g, ''));
  if (new Set(norm).size < norm.length) flags.push('two-correct-suspicion');
  const joined = opts.map(([, v]) => String(v).toLowerCase()).join(' | ');
  if (/all of the above/.test(joined) && /none of the above/.test(joined)) flags.push('two-correct-suspicion');
  if (opts.some(([, v]) => !String(v).trim()) || opts.some(([, v]) => normalizeText(v) === normalizeText(stem))) flags.push('poor-distractors');
  const all = stem + ' ' + opts.map(([, v]) => v).join(' ');
  const prose = stem.replace(/\\\(.*?\\\)|\\\[.*?\\\]/gs, 'MATH');
  if (/ {2,}/.test(prose) || /\b([a-z]{2,}) \1\b/i.test(prose)) flags.push('typo');
  const openI = (all.match(/\\\(/g) || []).length;
  const closeI = (all.match(/\\\)/g) || []).length;
  const openD = (all.match(/\\\[/g) || []).length;
  const closeD = (all.match(/\\\]/g) || []).length;
  if (openI !== closeI || openD !== closeD) flags.push('typo');
  if (!q.explanation || !q.explanation.whyCorrect) flags.push('missing-explanation');
  if (category === 'aptitude' && PHYSICS_WORDS.test(all) && !APTITUDE_WORDS.test(all)) flags.push('chapter-mismatch');
  if ((category === 'bsc' || category === 'msc') && APTITUDE_WORDS.test(all) && !PHYSICS_WORDS.test(all)) flags.push('chapter-mismatch');
  return [...new Set(flags)];
}

/**
 * Point-biserial correlation between a 0/1 item score and a continuous (rest) score:
 *   r_pb = (M₁ − M₀)/s · √(p·q)
 * @param {number[]} item 0/1 @param {number[]} rest @returns {number}
 */
export function pointBiserial(item, rest) {
  const n = item.length;
  if (n < 2) return 0;
  const m = mean(rest);
  const s = Math.sqrt(rest.reduce((acc, x) => acc + (x - m) * (x - m), 0) / n);
  if (s === 0) return 0;
  const ones = rest.filter((_, i) => item[i] === 1);
  const zeros = rest.filter((_, i) => item[i] !== 1);
  if (!ones.length || !zeros.length) return 0;
  const p = ones.length / n;
  return ((mean(ones) - mean(zeros)) / s) * Math.sqrt(p * (1 - p));
}

/**
 * CTT analysis of one item.
 * @param {{answer:string,options:object}} q
 * @param {Array<{selected:string,isCorrect:boolean,total:number}>} responses total = respondent/session score including this item
 * @returns {object} statistics + flags
 */
export function cttItem(q, responses) {
  const n = responses.length;
  const keys = Object.keys(q.options || {});
  const counts = Object.fromEntries(keys.map((k) => [k, 0]));
  for (const r of responses) if (r.selected in counts) counts[r.selected]++;
  const correct = responses.filter((r) => r.isCorrect).length;
  const p = n ? correct / n : 0;
  const wrongPicks = keys.filter((k) => k !== q.answer);
  const wrongTotal = wrongPicks.reduce((s, k) => s + counts[k], 0);
  let mostPickedWrong = null;
  for (const k of wrongPicks) if (!mostPickedWrong || counts[k] > counts[mostPickedWrong]) mostPickedWrong = k;
  const out = { n, p, counts, mostPickedWrong: wrongTotal ? mostPickedWrong : null, discrimination: null, nonFunctioning: [], flags: [] };
  if (n < MIN_N) { out.flags.push('insufficient-data'); return out; }
  const item = responses.map((r) => (r.isCorrect ? 1 : 0));
  const rest = responses.map((r, i) => r.total - item[i]);
  out.discrimination = pointBiserial(item, rest);
  if (wrongTotal > 0) out.nonFunctioning = wrongPicks.filter((k) => counts[k] / wrongTotal < 0.05);
  if (p > 0.95) out.flags.push('too-easy');
  if (p < 0.15) out.flags.push('too-hard');
  if (out.discrimination < 0.1) out.flags.push('low-discrimination');
  if (out.nonFunctioning.length) out.flags.push('poor-distractors');
  // Possibly wrong key: in the top 27 % by rest score, another option beats the key.
  const order = responses.map((r, i) => ({ r, rest: rest[i] })).sort((a, b) => b.rest - a.rest);
  const top = order.slice(0, Math.max(1, Math.round(n * 0.27)));
  const topCounts = Object.fromEntries(keys.map((k) => [k, 0]));
  for (const { r } of top) if (r.selected in topCounts) topCounts[r.selected]++;
  const topBest = keys.reduce((a, b) => (topCounts[b] > topCounts[a] ? b : a), keys[0]);
  if (topBest !== q.answer && topCounts[topBest] > topCounts[q.answer]) { out.flags.push('possibly-wrong-key'); out.suspectedKey = topBest; }
  return out;
}

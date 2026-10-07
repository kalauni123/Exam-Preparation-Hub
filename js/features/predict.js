/**
 * Client for score prediction (Section 9.7): builds Beta posteriors and runs the Monte Carlo
 * simulation in a Web Worker (main-thread fallback if workers are unavailable).
 * @module features/predict
 */
import { app, examProfile, activeSubjectIds } from '../state.js';
import { betaPosterior, profileSpec, genericSpec, simulateExam } from '../engine/prediction.js';

let worker = null;
let seq = 0;
const pending = new Map();

function getWorker() {
  if (worker !== null) return worker;
  try {
    worker = new Worker(new URL('../engine/prediction.worker.js', import.meta.url), { type: 'module' });
    worker.onmessage = (e) => { const p = pending.get(e.data.id); if (p) { pending.delete(e.data.id); e.data.error ? p.reject(new Error(e.data.error)) : p.resolve(e.data.results); } };
    worker.onerror = () => { worker = false; for (const p of pending.values()) p.reject(new Error('worker failed')); pending.clear(); };
  } catch { worker = false; }
  return worker;
}

function runSpecs(specs) {
  const w = getWorker();
  if (!w) {
    const out = {};
    for (const s of specs) { const r = simulateExam(s); delete r.scores; out[s.key] = r; }
    return Promise.resolve(out);
  }
  const id = ++seq;
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    w.postMessage({ id, specs });
    setTimeout(() => { if (pending.has(id)) { pending.delete(id); reject(new Error('timeout')); } }, 20000);
  }).catch(() => {
    const out = {};
    for (const s of specs) { const r = simulateExam(s); delete r.scores; out[s.key] = r; }
    return out;
  });
}

/**
 * Predict exam score for the user.
 * @param {{subjectIds?:string[]}} [opt]
 * @returns {Promise<{mode:'profile'|'generic', profileName?:string, missing:string[], overall:object|null, bySubject:Object<string,object>, n:number, caveat:string}>}
 */
export async function predict(opt = {}) {
  const user = app.user;
  const subs = opt.subjectIds || activeSubjectIds();
  const posteriors = {};
  const bBySubject = {};
  let n = 0;
  const pc = app.config.prediction || {};
  for (const sid of subs) {
    const atts = (user.attempts || []).filter((a) => a.subjectId === sid);
    if (!atts.length) continue;
    n += atts.length;
    posteriors[sid] = betaPosterior(atts, { halfLifeDays: app.config.recencyHalfLifeDays, priorAlpha: pc.priorAlpha, priorBeta: pc.priorBeta });
    bBySubject[sid] = atts.map((a) => a.b ?? 0);
  }
  const sims = pc.simulations || 5000;
  const specs = [];
  const prof = examProfile();
  let mode = 'generic';
  let missing = [];
  if (prof) {
    const ps = profileSpec(prof, posteriors, bBySubject);
    missing = ps.missing;
    if (!ps.generic) { mode = 'profile'; specs.push({ key: '__overall', sections: ps.sections, sims, seed: 2026 }); }
  }
  const gen = genericSpec(posteriors, bBySubject);
  for (const sec of gen) specs.push({ key: sec.name, sections: [sec], sims: Math.max(1000, Math.round(sims / 2)), seed: 7 });
  if (mode === 'generic' && gen.length) specs.push({ key: '__overall', sections: gen, sims, seed: 2026 });
  const res = specs.length ? await runSpecs(specs) : {};
  const overall = res.__overall || null;
  delete res.__overall;
  const caveat = n < 30 ? 'Based on very little data so far — treat this as a rough guess until you have answered at least 30 questions per subject.' : n < 150 ? 'Moderate data: the range will narrow as you practise more.' : '';
  return { mode, profileName: prof?.name, missing, overall, bySubject: res, n, caveat };
}

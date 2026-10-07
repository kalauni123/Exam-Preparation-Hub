/**
 * Web Worker wrapper for Monte Carlo score prediction (keeps the UI thread responsive).
 * Message in:  { id, specs: Array<{key, sections, sims, seed}> }
 * Message out: { id, results: Object<key, result> } or { id, error }
 */
import { simulateExam } from './prediction.js';

self.onmessage = (ev) => {
  const { id, specs } = ev.data || {};
  try {
    const results = {};
    for (const s of specs || []) {
      const r = simulateExam(s);
      delete r.scores; // keep the message small
      results[s.key] = r;
    }
    self.postMessage({ id, results });
  } catch (err) {
    self.postMessage({ id, error: String(err && err.message ? err.message : err) });
  }
};

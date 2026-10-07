/**
 * Parametric question templates (Feature 2: "parametric numbers via template").
 * Template format inside a question:
 *   "template": { "vars": { "E": [3.5, 4, 4.5], "phi": [2.1, 2.3] }, "decimals": 2 }
 * and the stem / options / explanation contain {{expr}} placeholders, e.g. {{E-phi}}.
 * Expressions are evaluated by a tiny safe recursive-descent parser (numbers, variables,
 * + − × ÷ ^, parentheses, sqrt/sin/cos/tan/exp/log/ln/abs/round, pi, e). No eval.
 * @module utils/template
 */

/**
 * Evaluate an arithmetic expression with variables.
 * @param {string} src @param {Object<string,number>} vars @returns {number}
 */
export function evalExpr(src, vars = {}) {
  let i = 0;
  const s = src.replace(/\s+/g, '');
  const fns = { sqrt: Math.sqrt, sin: Math.sin, cos: Math.cos, tan: Math.tan, exp: Math.exp, log: Math.log10, ln: Math.log, abs: Math.abs, round: Math.round };
  const consts = { pi: Math.PI, e: Math.E };
  function primary() {
    if (s[i] === '(') { i++; const v = expr(); if (s[i] !== ')') throw new Error('Missing )'); i++; return v; }
    if (s[i] === '-') { i++; return -primary(); }
    if (s[i] === '+') { i++; return primary(); }
    const num = /^(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?/.exec(s.slice(i));
    if (num) { i += num[0].length; return parseFloat(num[0]); }
    const id = /^[A-Za-z_][A-Za-z0-9_]*/.exec(s.slice(i));
    if (id) {
      i += id[0].length;
      const name = id[0];
      if (s[i] === '(' && fns[name]) { i++; const v = expr(); if (s[i] !== ')') throw new Error('Missing )'); i++; return fns[name](v); }
      if (name in vars) return Number(vars[name]);
      if (name in consts) return consts[name];
      throw new Error('Unknown name ' + name);
    }
    throw new Error('Unexpected input at ' + i);
  }
  function power() {
    const b = primary();
    if (s[i] === '^') { i++; return Math.pow(b, power()); }
    return b;
  }
  function term() {
    let v = power();
    while (s[i] === '*' || s[i] === '/') { const op = s[i++]; const r = power(); v = op === '*' ? v * r : v / r; }
    return v;
  }
  function expr() {
    let v = term();
    while (s[i] === '+' || s[i] === '-') { const op = s[i++]; const r = term(); v = op === '+' ? v + r : v - r; }
    return v;
  }
  const v = expr();
  if (i !== s.length) throw new Error('Trailing input');
  return v;
}

/** Format a number with up to `d` decimals, trimming zeros. */
function fmt(x, d) {
  if (!Number.isFinite(x)) return String(x);
  const r = Number(x.toFixed(d));
  return String(r);
}

/**
 * Fill {{expr}} placeholders in a string.
 * @param {string} text @param {Object<string,number>} vars @param {number} d decimals
 * @returns {string}
 */
export function fill(text, vars, d) {
  return String(text).replace(/\{\{([^}]+)\}\}/g, (_, e) => {
    try { return fmt(evalExpr(e, vars), d); } catch { return '?'; }
  });
}

/**
 * Instantiate a templated question (returns the question unchanged if it has no template).
 * Retries until all option texts are distinct.
 * @param {object} q @param {() => number} [rand=Math.random] @returns {object}
 */
export function instantiate(q, rand = Math.random) {
  const t = q.template;
  if (!t || typeof t !== 'object' || !t.vars) return q;
  const d = t.decimals ?? 2;
  for (let attempt = 0; attempt < 20; attempt++) {
    const vars = {};
    for (const [k, v] of Object.entries(t.vars)) {
      if (Array.isArray(v)) vars[k] = v[Math.floor(rand() * v.length)];
      else if (v && typeof v === 'object') {
        const steps = Math.max(0, Math.floor((v.max - v.min) / (v.step || 1)));
        vars[k] = v.min + (v.step || 1) * Math.floor(rand() * (steps + 1));
      }
    }
    const options = Object.fromEntries(Object.entries(q.options).map(([k, v]) => [k, fill(v, vars, d)]));
    if (new Set(Object.values(options)).size !== Object.keys(options).length) continue;
    const ex = q.explanation || {};
    const fillObj = (o) => Object.fromEntries(Object.entries(o || {}).map(([k, v]) => [k, typeof v === 'string' ? fill(v, vars, d) : v]));
    return {
      ...q,
      stem: fill(q.stem, vars, d),
      options,
      explanation: { ...fillObj(ex), whyWrong: fillObj(ex.whyWrong) },
      _vars: vars,
    };
  }
  return q;
}

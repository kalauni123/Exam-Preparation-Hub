/**
 * Tiny XSS-safe DOM builder. Text children always become text nodes; only the app's own
 * constant SVG icon strings are ever parsed as markup (see icons.js).
 * @module ui/dom
 */

/**
 * Create an element.
 *   h('button', {class:'btn', onclick: fn, 'aria-label': 'x'}, 'Text', childNode)
 * @param {string} tag
 * @param {Object<string, any>|null} [attrs]
 * @param {...any} children strings, numbers, Nodes, arrays, null/false (skipped)
 * @returns {HTMLElement}
 */
export function h(tag, attrs, ...children) {
  const svgTags = new Set(['svg', 'g', 'path', 'circle', 'line', 'polyline', 'polygon', 'rect', 'text', 'defs', 'linearGradient', 'stop', 'title', 'desc', 'marker', 'tspan']);
  const el = svgTags.has(tag) ? document.createElementNS('http://www.w3.org/2000/svg', tag) : document.createElement(tag);
  if (attrs) {
    for (const [k, v] of Object.entries(attrs)) {
      if (v === undefined || v === null || v === false) continue;
      if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
      else if (k === 'class' || k === 'className') el.setAttribute('class', Array.isArray(v) ? v.filter(Boolean).join(' ') : v);
      else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
      else if (k === 'dataset') Object.assign(el.dataset, v);
      else if (k === 'value' && 'value' in el) el.value = v;
      else if (k === 'checked' || k === 'disabled' || k === 'selected' || k === 'open' || k === 'hidden') { if (v) el.setAttribute(k, ''); if (k in el) el[k] = !!v; }
      else el.setAttribute(k, v === true ? '' : String(v));
    }
  }
  append(el, children);
  return el;
}

/**
 * Append children (recursively flattening arrays).
 * @param {Node} el @param {any[]} children
 */
export function append(el, children) {
  for (const c of children) {
    if (c === null || c === undefined || c === false || c === true) continue;
    if (Array.isArray(c)) append(el, c);
    else if (c instanceof Node) el.appendChild(c);
    else el.appendChild(document.createTextNode(String(c)));
  }
}

/** Remove all children. @param {Node} el */
export function clear(el) {
  while (el.firstChild) el.removeChild(el.firstChild);
}

/**
 * Replace the contents of a container.
 * @param {Node} el @param {...any} children
 */
export function mount(el, ...children) {
  clear(el);
  append(el, children);
}

/** Query helper. @param {string} sel @param {ParentNode} [root] @returns {HTMLElement|null} */
export const $ = (sel, root = document) => root.querySelector(sel);

/**
 * Debounce.
 * @template {Function} F @param {F} fn @param {number} ms @returns {F}
 */
export function debounce(fn, ms) {
  let t;
  return /** @type any */ ((...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); });
}

/** Percentage string. @param {number|null} x 0..1 @param {number} [d=0] @returns {string} */
export function pct(x, d = 0) {
  if (x === null || x === undefined || Number.isNaN(x)) return '—';
  return (x * 100).toFixed(d) + '%';
}

/** Human date. @param {string} iso @returns {string} */
export function fmtDate(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}

/** Relative day label. @param {string} iso @returns {string} */
export function relDay(iso) {
  if (!iso) return '—';
  const days = Math.round((Date.parse(iso) - Date.now()) / 86400000);
  if (days === 0) return 'today';
  if (days === 1) return 'tomorrow';
  if (days === -1) return 'yesterday';
  return days > 0 ? `in ${days} days` : `${-days} days ago`;
}

/** mm:ss. @param {number} sec @returns {string} */
export function mmss(sec) {
  const s = Math.max(0, Math.round(sec));
  return String(Math.floor(s / 60)).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0');
}

/** Bytes → KB/MB. @param {number} b @returns {string} */
export function fmtBytes(b) {
  if (b < 1024) return b + ' B';
  if (b < 1048576) return (b / 1024).toFixed(1) + ' KB';
  return (b / 1048576).toFixed(2) + ' MB';
}

/**
 * Section 12 — formula rendering with the locally vendored KaTeX (no CDN).
 * KaTeX is loaded lazily the first time a text actually contains math delimiters, so
 * aptitude (plain-text) chapters have zero math overhead.
 * @module ui/math
 */

const MATH_RE = /\\\(|\\\[|\$\$/;
let loading = null;

/** Physics-package style macros used by the portal's LaTeX. */
const MACROS = {
  '\\ket': '\\left|#1\\right\\rangle',
  '\\bra': '\\left\\langle#1\\right|',
  '\\braket': '\\left\\langle#1\\middle|#2\\right\\rangle',
  '\\expval': '\\left\\langle#1\\right\\rangle',
  '\\abs': '\\left|#1\\right|',
  '\\norm': '\\left\\lVert#1\\right\\rVert',
  '\\dv': '\\frac{d#1}{d#2}',
  '\\pdv': '\\frac{\\partial#1}{\\partial#2}',
  '\\comm': '\\left[#1,#2\\right]',
  '\\vb': '\\mathbf{#1}',
  '\\vu': '\\hat{\\mathbf{#1}}',
  '\\Tr': '\\operatorname{Tr}',
  '\\order': '\\mathcal{O}\\left(#1\\right)',
};

/** Load a classic script once. */
function loadScript(src) {
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = src;
    s.async = true;
    s.onload = resolve;
    s.onerror = () => reject(new Error('Failed to load ' + src));
    document.head.appendChild(s);
  });
}

/** Ensure KaTeX + auto-render + CSS are available. @returns {Promise<boolean>} */
function ensureKatex() {
  if (window.renderMathInElement) return Promise.resolve(true);
  if (loading) return loading;
  loading = (async () => {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = './vendor/katex/katex.min.css';
    document.head.appendChild(link);
    await loadScript('./vendor/katex/katex.min.js');
    await loadScript('./vendor/katex/auto-render.min.js');
    return true;
  })().catch(() => { loading = null; return false; });
  return loading;
}

/**
 * True if a string contains math delimiters.
 * @param {string} s @returns {boolean}
 */
export function hasMath(s) {
  return MATH_RE.test(String(s || ''));
}

/**
 * Render math inside an element whose text was set with textContent (XSS-safe: KaTeX only
 * transforms text nodes; raw HTML in the source is never interpreted).
 * @param {HTMLElement} el
 * @returns {Promise<void>}
 */
export async function renderMath(el) {
  if (!el || !hasMath(el.textContent)) return;
  const ok = await ensureKatex();
  if (!ok || !window.renderMathInElement) return;
  try {
    window.renderMathInElement(el, {
      delimiters: [
        { left: '$$', right: '$$', display: true },
        { left: '\\[', right: '\\]', display: true },
        { left: '\\(', right: '\\)', display: false },
      ],
      throwOnError: false,
      trust: false,
      strict: 'ignore',
      macros: { ...MACROS },
      ignoredTags: ['script', 'noscript', 'style', 'textarea', 'pre', 'code', 'option'],
    });
  } catch { /* leave source text visible */ }
}

/**
 * Hash router (#/path/:param?query) — refresh-safe on GitHub Pages and Netlify.
 * @module router
 */

/** @typedef {(view:HTMLElement, params:Object<string,string>, query:URLSearchParams) => (void|Promise<void>|(() => void))} RouteHandler */

const routes = [];
let current = { path: '', cleanup: null };
let beforeEach = null;
let afterEach = null;

/**
 * Register a route.
 * @param {string} pattern e.g. '/practice/subject/:id'
 * @param {RouteHandler} handler
 * @param {{immersive?:boolean, nav?:string, public?:boolean, title?:string}} [meta]
 */
export function route(pattern, handler, meta = {}) {
  const keys = [];
  const re = new RegExp('^' + pattern.replace(/\/:([a-zA-Z_]+)/g, (_, k) => { keys.push(k); return '/([^/]+)'; }) + '/?$');
  routes.push({ pattern, re, keys, handler, meta });
}

/** Guard hook: return a redirect path or null. @param {(r:{pattern:string,meta:object})=>string|null} fn */
export function setBeforeEach(fn) { beforeEach = fn; }
/** After-navigation hook. @param {(r:object)=>void} fn */
export function setAfterEach(fn) { afterEach = fn; }

/**
 * Navigate.
 * @param {string} path e.g. '/home' @param {{replace?:boolean}} [opt]
 */
export function go(path, opt = {}) {
  const target = '#' + (path.startsWith('/') ? path : '/' + path);
  if (opt.replace) location.replace(target);
  else if (location.hash === target) resolve();
  else location.hash = target;
}

/** Re-render the current route. */
export function refresh() { resolve(); }

/** Current path without '#'. */
export function currentPath() { return (location.hash || '#/home').slice(1).split('?')[0]; }

async function resolve() {
  const raw = (location.hash || '#/home').slice(1);
  const [path, qs] = raw.split('?');
  const query = new URLSearchParams(qs || '');
  let match = null;
  let params = {};
  for (const r of routes) {
    const m = r.re.exec(path);
    if (m) { match = r; params = Object.fromEntries(r.keys.map((k, i) => [k, decodeURIComponent(m[i + 1])])); break; }
  }
  if (!match) { go('/home', { replace: true }); return; }
  if (beforeEach) {
    const redirect = beforeEach(match);
    if (redirect && redirect !== path) { go(redirect, { replace: true }); return; }
  }
  if (typeof current.cleanup === 'function') { try { current.cleanup(); } catch { /* ignore */ } }
  const view = document.getElementById('view');
  const fresh = view.cloneNode(false);
  view.replaceWith(fresh);
  fresh.className = 'view';
  current = { path, cleanup: null };
  if (afterEach) afterEach(match);
  try {
    const cleanup = await match.handler(fresh, params, query);
    if (current.path === path) current.cleanup = cleanup || null;
  } catch (err) {
    console.warn(err);
    fresh.textContent = '';
    const box = document.createElement('div');
    box.className = 'card';
    const h = document.createElement('h2');
    h.textContent = 'Something went wrong';
    const p = document.createElement('p');
    p.textContent = String(err && err.message ? err.message : err);
    const a = document.createElement('a');
    a.href = '#/home';
    a.className = 'btn btn-primary mt-4';
    a.textContent = 'Go home';
    box.append(h, p, a);
    fresh.appendChild(box);
  }
  const h1 = fresh.querySelector('h1');
  if (h1) { h1.setAttribute('tabindex', '-1'); h1.focus({ preventScroll: true }); }
  window.scrollTo(0, 0);
}

/** Start listening. */
export function start() {
  window.addEventListener('hashchange', resolve);
  resolve();
}

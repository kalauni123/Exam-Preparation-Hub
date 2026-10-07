/**
 * NeuroMCQ entry point: loads config + catalog (the only bank file loaded at start-up),
 * restores the active profile, registers routes and the service worker.
 * @module main
 */
import { app, bus, setUser } from './state.js';
import { route, start, setBeforeEach, setAfterEach } from './router.js';
import { loadCatalog, loadDataFile } from './bank/catalogLoader.js';
import { configureLoader, loadStats } from './bank/chapterLoader.js';
import { checkDag, incomingMap } from './engine/bkt.js';
import { getCurrentUserId, loadUser, flush } from './storage/userStore.js';
import { setDictionaries, setLang, t } from './i18n.js';
import { applyTheme, applyMotion } from './main-helpers.js';
import { h, mount } from './ui/dom.js';
import { icon } from './ui/icons.js';
import { toast } from './ui/overlay.js';
import { initAds, needsConsent, setConsent } from './ads/adManager.js';



/**
 * Lazy route handler: the feature module is fetched only when its screen is opened,
 * keeping start-up to the shell + catalog.
 * @param {string} path module path @param {string} name exported render function
 */
const lazy = (path, name) => async (view, params, query) => (await import(path))[name](view, params, query);

const NAV = [
  ['home', '#/home', 'home', 'nav.home'],
  ['practice', '#/practice', 'practice', 'nav.practice'],
  ['battle', '#/battle', 'battle', 'nav.battle'],
  ['analytics', '#/analytics', 'analytics', 'nav.analytics'],
  ['profile', '#/profile', 'profile', 'nav.profile'],
];

/** Render header actions and bottom navigation (once). */
function renderChrome() {
  const nav = document.getElementById('bottom-nav');
  mount(nav, h('ul', null, NAV.map(([key, href, ic, label]) => h('li', null, h('a', { href, dataset: { nav: key } }, icon(/** @type any */ (ic)), h('span', null, t(label)))))));
  const themeBtn = document.getElementById('theme-toggle');
  themeBtn.replaceChildren(icon(document.documentElement.dataset.theme === 'dark' ? 'sun' : 'moon'));
  themeBtn.onclick = () => {
    const next = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
    applyTheme(next);
    themeBtn.replaceChildren(icon(next === 'dark' ? 'sun' : 'moon'));
    if (app.user) { app.user.settings.theme = next; import('./state.js').then((m) => m.saveUser()); }
  };
}

/** Highlight the active tab. @param {string} key */
function setActiveNav(key) {
  document.querySelectorAll('#bottom-nav a').forEach((a) => {
    if (a.dataset.nav === key) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
  });
}

/** Register every route. */
function registerRoutes() {
  route('/welcome', lazy('./features/welcome.js', 'renderWelcome'), { public: true, nav: '' });
  route('/onboarding', lazy('./features/welcome.js', 'renderOnboarding'), { nav: '' });
  route('/home', lazy('./features/home.js', 'renderHome'), { nav: 'home' });
  route('/practice', lazy('./features/practice.js', 'renderPractice'), { nav: 'practice' });
  route('/practice/subject/:id', lazy('./features/practice.js', 'renderSubject'), { nav: 'practice' });
  route('/session', lazy('./features/session.js', 'renderSession'), { nav: 'practice' });
  route('/results', lazy('./features/results.js', 'renderResults'), { nav: 'practice' });
  route('/review', lazy('./features/review.js', 'renderReview'), { nav: 'practice' });
  route('/mistakes', lazy('./features/mistakes.js', 'renderMistakes'), { nav: 'practice' });
  route('/bookmarks', lazy('./features/bookmarks.js', 'renderBookmarks'), { nav: 'practice' });
  route('/rapid', lazy('./features/rapidFire.js', 'renderRapid'), { nav: 'practice' });
  route('/study-now', lazy('./features/studyNow.js', 'renderStudyNow'), { nav: 'home' });
  route('/analytics', lazy('./features/analytics.js', 'renderAnalytics'), { nav: 'analytics' });
  route('/memory', lazy('./features/memoryMap.js', 'renderMemoryMap'), { nav: 'analytics' });
  route('/syllabus', lazy('./features/syllabus.js', 'renderSyllabus'), { nav: 'analytics' });
  route('/graph/:id', lazy('./features/graph.js', 'renderGraph'), { nav: 'analytics' });
  route('/dna', lazy('./features/dna.js', 'renderDNA'), { nav: 'profile' });
  route('/qa', lazy('./features/questionAnalytics.js', 'renderQA'), { nav: 'profile' });
  route('/quality', lazy('./features/quality.js', 'renderQuality'), { nav: 'profile' });
  route('/battle', lazy('./features/battle.js', 'renderBattle'), { nav: 'battle' });
  route('/library', lazy('./features/library.js', 'renderLibrary'), { nav: 'battle' });
  route('/profile', lazy('./features/settings.js', 'renderProfile'), { nav: 'profile' });
  route('/settings', lazy('./features/settings.js', 'renderSettings'), { nav: 'profile' });
  setBeforeEach((r) => {
    if (!app.user && !r.meta.public) return '/welcome';
    if (app.user && r.pattern === '/welcome') return '/home';
    return null;
  });
  setAfterEach((r) => {
    setActiveNav(r.meta.nav || '');
    document.getElementById('bottom-nav').hidden = !app.user;
    if (r.pattern !== '/session') document.body.classList.remove('immersive');
  });
}

/** Service worker registration with an update prompt. */
function registerSW() {
  if (!('serviceWorker' in navigator)) return;
  if (location.protocol !== 'https:' && location.hostname !== 'localhost' && location.hostname !== '127.0.0.1') return;
  navigator.serviceWorker.register('./sw.js', { scope: './' }).then((reg) => {
    const prompt = (w) => toast(t('app.updateReady'), { action: t('app.refresh'), onAction: () => w.postMessage({ type: 'SKIP_WAITING' }) });
    if (reg.waiting && navigator.serviceWorker.controller) prompt(reg.waiting);
    reg.addEventListener('updatefound', () => {
      const w = reg.installing;
      w?.addEventListener('statechange', () => { if (w.state === 'installed' && navigator.serviceWorker.controller) prompt(w); });
    });
  }).catch(() => { /* offline-first is optional; the app still works online */ });
  let reloaded = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => { if (!reloaded) { reloaded = true; location.reload(); } });
  navigator.serviceWorker.addEventListener('message', (e) => { if (e.data?.type === 'NAVIGATE' && e.data.url) location.hash = e.data.url.split('#')[1] || '/home'; });
}

/** Consent banner for ads (UMP/GDPR-style), only when ads are enabled. */
function consentBanner() {
  if (!needsConsent()) return;
  const el = h('div', { class: 'consent', role: 'dialog', 'aria-label': 'Ad consent' }, h('div', { class: 'card' },
    h('p', { class: 'small' }, 'NeuroMCQ is free and may show a few ads on the dashboard and results pages (never during questions). Do you allow personalised ads? ', h('a', { href: './privacy.html' }, 'Privacy policy')),
    h('div', { class: 'grid-2 mt-3' }, h('button', { class: 'btn btn-sm', onclick: () => { setConsent('denied'); el.remove(); } }, 'No thanks'), h('button', { class: 'btn btn-primary btn-sm', onclick: () => { setConsent('granted'); el.remove(); } }, 'Allow'))));
  document.body.appendChild(el);
}

async function boot() {
  const view = document.getElementById('view');
  try {
    const [config, catalog, prereq, profiles, i18n] = await Promise.all([
      loadDataFile('config.json', {}),
      loadCatalog(),
      loadDataFile('prerequisites.json', { edges: [] }),
      loadDataFile('examProfiles.json', { profiles: [] }),
      loadDataFile('i18n.json', { en: {}, ne: {} }),
    ]);
    app.config = config || {};
    app.catalog = catalog;
    app.profiles = profiles || { profiles: [] };
    setDictionaries(i18n);
    configureLoader(app.config.chapterLoader || {});
    const edges = (prereq?.edges || []).filter((e) => catalog.chapterById.has(e.from) && catalog.chapterById.has(e.to));
    const dag = checkDag(edges);
    app.prereq = dag.ok
      ? { edges, incoming: incomingMap(edges), ok: true, message: '' }
      : { edges: [], incoming: new Map(), ok: false, message: 'data/prerequisites.json contains a cycle involving ' + dag.cycleNodes.join(', ') + ' — prerequisite links were ignored until it is fixed.' };
    if (catalog.validation.errors.length) console.warn('Catalog problems:', catalog.validation.errors);
    await initAds();
    const id = await getCurrentUserId();
    if (id) {
      const u = await loadUser(id);
      if (u) setUser(u);
    }
  } catch (err) {
    mount(view, h('section', { class: 'card' }, h('h1', null, 'Could not start NeuroMCQ'), h('p', null, err.message), h('button', { class: 'btn btn-primary', onclick: () => location.reload() }, 'Try again')));
    return;
  }
  const s = app.user?.settings;
  applyTheme(s?.theme || (localStorage.getItem('neuromcq:theme') || 'light'));
  applyMotion(!!s?.reducedMotion);
  setLang(s?.language || 'en');
  renderChrome();
  registerRoutes();
  bus.addEventListener('user', () => {
    const st = app.user?.settings;
    if (st) { applyTheme(st.theme); applyMotion(st.reducedMotion); setLang(st.language); }
    renderChrome();
  });
  if (matchMedia) matchMedia('(prefers-color-scheme: dark)').addEventListener?.('change', () => { if ((app.user?.settings?.theme || 'light') === 'system') applyTheme('system'); });
  start();
  registerSW();
  consentBanner();
  window.addEventListener('pagehide', () => { if (app.user) flush(app.user); });
  document.addEventListener('visibilitychange', () => { if (document.hidden && app.user) flush(app.user); });
  window.addEventListener('unhandledrejection', (e) => { console.warn('Unhandled:', e.reason); e.preventDefault(); });
  setInterval(() => { if (loadStats.dropped) { toast(`${loadStats.dropped} invalid question(s) were skipped while loading.`); loadStats.dropped = 0; } }, 5000);
  if (!navigator.onLine) toast(t('app.offline'));
  window.addEventListener('offline', () => toast(t('app.offline')));
}

boot();

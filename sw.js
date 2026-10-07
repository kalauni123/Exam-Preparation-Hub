/* NeuroMCQ service worker — offline-first, relative paths only (works from a GitHub Pages
 * sub-path and a Netlify root).
 *  • App shell: precached, cache-first.
 *  • catalog.json / examProfiles.json / config / i18n / prerequisites / users index:
 *    stale-while-revalidate.
 *  • Chapter files (data/questions/…?v=<version>): cache-first, refreshed in the background;
 *    a new catalog version changes the URL, so updated chapters are fetched automatically.
 *  • Navigations: network-first, falling back to the cached app shell, then offline.html.
 */
const VERSION = 'd22c398652';
const SHELL = 'neuromcq-shell-' + VERSION;
const DATA = 'neuromcq-data';
const CHAPTERS = 'neuromcq-chapters';
const PRECACHE = [
  './',
  "./assets/icons/apple-touch-icon.png",
  "./assets/icons/favicon.svg",
  "./assets/icons/icon-192.png",
  "./assets/icons/icon-512.png",
  "./assets/icons/maskable-512.png",
  "./assets/icons/shortcut-due.png",
  "./assets/icons/shortcut-rapid.png",
  "./assets/icons/shortcut-study.png",
  "./css/base.css",
  "./css/components.css",
  "./css/screens.css",
  "./css/tokens.css",
  "./data/catalog.json",
  "./data/config.json",
  "./data/examProfiles.json",
  "./data/i18n.json",
  "./data/prerequisites.json",
  "./index.html",
  "./js/ads/adManager.js",
  "./js/bank/bankCache.js",
  "./js/bank/bankValidator.js",
  "./js/bank/catalogLoader.js",
  "./js/bank/chapterLoader.js",
  "./js/bank/legacyParser.js",
  "./js/battle/game.js",
  "./js/battle/transport.js",
  "./js/engine/bkt.js",
  "./js/engine/errorClassifier.js",
  "./js/engine/forgettingRisk.js",
  "./js/engine/glicko2.js",
  "./js/engine/irt.js",
  "./js/engine/learner.js",
  "./js/engine/learningDNA.js",
  "./js/engine/mastery.js",
  "./js/engine/memoryMap.js",
  "./js/engine/prediction.js",
  "./js/engine/prediction.worker.js",
  "./js/engine/questionQuality.js",
  "./js/engine/recommender.js",
  "./js/engine/responseTime.js",
  "./js/engine/spacedRepetition.js",
  "./js/engine/stats.js",
  "./js/features/analytics.js",
  "./js/features/battle.js",
  "./js/features/bookmarks.js",
  "./js/features/cohort.js",
  "./js/features/dna.js",
  "./js/features/graph.js",
  "./js/features/home.js",
  "./js/features/insights.js",
  "./js/features/library.js",
  "./js/features/memoryMap.js",
  "./js/features/mistakes.js",
  "./js/features/notify.js",
  "./js/features/practice.js",
  "./js/features/predict.js",
  "./js/features/qsource.js",
  "./js/features/quality.js",
  "./js/features/questionAnalytics.js",
  "./js/features/rapidFire.js",
  "./js/features/results.js",
  "./js/features/review.js",
  "./js/features/session.js",
  "./js/features/settings.js",
  "./js/features/studyNow.js",
  "./js/features/syllabus.js",
  "./js/features/welcome.js",
  "./js/features/whyWrong.js",
  "./js/i18n.js",
  "./js/main-helpers.js",
  "./js/main.js",
  "./js/router.js",
  "./js/state.js",
  "./js/storage/db.js",
  "./js/storage/exportImport.js",
  "./js/storage/schema.js",
  "./js/storage/syncAdapter.js",
  "./js/storage/userStore.js",
  "./js/ui/charts.js",
  "./js/ui/dom.js",
  "./js/ui/icons.js",
  "./js/ui/math.js",
  "./js/ui/overlay.js",
  "./js/utils/crypto.js",
  "./js/utils/demoData.js",
  "./js/utils/feedback.js",
  "./js/utils/template.js",
  "./js/utils/zip.js",
  "./manifest.webmanifest",
  "./offline.html",
  "./privacy.html",
  "./vendor/fonts/inter-500.woff",
  "./vendor/fonts/inter-600.woff",
  "./vendor/fonts/inter-700.woff",
  "./vendor/fonts/inter-800.woff",
  "./vendor/fonts/inter-900.woff",
  "./vendor/katex/auto-render.min.js",
  "./vendor/katex/fonts/KaTeX_AMS-Regular.woff2",
  "./vendor/katex/fonts/KaTeX_Caligraphic-Bold.woff2",
  "./vendor/katex/fonts/KaTeX_Caligraphic-Regular.woff2",
  "./vendor/katex/fonts/KaTeX_Fraktur-Bold.woff2",
  "./vendor/katex/fonts/KaTeX_Fraktur-Regular.woff2",
  "./vendor/katex/fonts/KaTeX_Main-Bold.woff2",
  "./vendor/katex/fonts/KaTeX_Main-BoldItalic.woff2",
  "./vendor/katex/fonts/KaTeX_Main-Italic.woff2",
  "./vendor/katex/fonts/KaTeX_Main-Regular.woff2",
  "./vendor/katex/fonts/KaTeX_Math-BoldItalic.woff2",
  "./vendor/katex/fonts/KaTeX_Math-Italic.woff2",
  "./vendor/katex/fonts/KaTeX_SansSerif-Bold.woff2",
  "./vendor/katex/fonts/KaTeX_SansSerif-Italic.woff2",
  "./vendor/katex/fonts/KaTeX_SansSerif-Regular.woff2",
  "./vendor/katex/fonts/KaTeX_Script-Regular.woff2",
  "./vendor/katex/fonts/KaTeX_Size1-Regular.woff2",
  "./vendor/katex/fonts/KaTeX_Size2-Regular.woff2",
  "./vendor/katex/fonts/KaTeX_Size3-Regular.woff2",
  "./vendor/katex/fonts/KaTeX_Size4-Regular.woff2",
  "./vendor/katex/fonts/KaTeX_Typewriter-Regular.woff2",
  "./vendor/katex/katex.min.css",
  "./vendor/katex/katex.min.js",
];
const SWR = /\/data\/(catalog|examProfiles|config|i18n|prerequisites)\.json$|\/data\/users\/index\.json$/;

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(SHELL);
    // Add individually so one missing optional file never breaks installation.
    await Promise.all(PRECACHE.map((u) => cache.add(new Request(u, { cache: 'reload' })).catch(() => null)));
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    for (const k of await caches.keys()) if (k.startsWith('neuromcq-shell-') && k !== SHELL) await caches.delete(k);
    await self.clients.claim();
  })());
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting();
});

async function staleWhileRevalidate(req, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(req);
  const network = fetch(req).then((res) => { if (res && res.ok) cache.put(req, res.clone()); return res; }).catch(() => null);
  return cached || (await network) || new Response('{}', { status: 503, headers: { 'Content-Type': 'application/json' } });
}

async function cacheFirst(req, cacheName, refresh) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(req);
  if (cached) {
    if (refresh) fetch(req).then((res) => { if (res && res.ok) cache.put(req, res.clone()); }).catch(() => {});
    return cached;
  }
  try {
    const res = await fetch(req);
    if (res && res.ok) cache.put(req, res.clone());
    return res;
  } catch {
    // Same chapter, older version, is better than nothing offline.
    const any = await cache.match(req, { ignoreSearch: true });
    return any || new Response('{"error":"offline"}', { status: 503, headers: { 'Content-Type': 'application/json' } });
  }
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // ads, Firebase, Supabase: network only
  if (req.mode === 'navigate') {
    event.respondWith((async () => {
      try {
        const res = await fetch(req);
        const cache = await caches.open(SHELL);
        if (res.ok && url.pathname.endsWith('/')) cache.put('./index.html', res.clone());
        return res;
      } catch {
        return (await caches.match('./index.html', { ignoreSearch: true })) || (await caches.match('./offline.html')) || new Response('Offline', { status: 503 });
      }
    })());
    return;
  }
  if (SWR.test(url.pathname)) { event.respondWith(staleWhileRevalidate(req, DATA)); return; }
  if (url.pathname.includes('/data/questions/')) { event.respondWith(cacheFirst(req, CHAPTERS, true)); return; }
  if (url.pathname.includes('/data/users/')) { event.respondWith(staleWhileRevalidate(req, DATA)); return; }
  if (url.pathname.endsWith('/sw.js')) return;
  event.respondWith(cacheFirst(req, SHELL, false));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const target = (event.notification.data && event.notification.data.url) || './';
  event.waitUntil((async () => {
    const all = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const c of all) { c.postMessage({ type: 'NAVIGATE', url: target }); return c.focus(); }
    return self.clients.openWindow(target);
  })());
});

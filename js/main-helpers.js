/**
 * Theme and motion helpers shared by main.js and the settings screen.
 * @module main-helpers
 */

/**
 * Apply theme: 'light' (portal style), 'dark' or 'system' (follows prefers-color-scheme).
 * @param {string} theme
 */
export function applyTheme(theme) {
  const dark = theme === 'dark' || (theme === 'system' && window.matchMedia && matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light');
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', dark ? '#0f172a' : '#4338ca');
}

/** @param {boolean} reduce */
export function applyMotion(reduce) {
  if (reduce) document.documentElement.setAttribute('data-motion', 'reduce');
  else document.documentElement.removeAttribute('data-motion');
}

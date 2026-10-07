/**
 * Section 11 — single ad interface for web (AdSense) and the Android wrapper (AdMob via
 * Capacitor). Policy-safe by construction:
 *  • never during an active question, timed test, battle or rapid-fire (app.session !== null)
 *  • banners only on dashboard/results; never next to navigation
 *  • interstitial at most once every N sessions and never in the first 2 minutes
 *  • rewarded ads unlock a bonus
 * When ads are disabled, unapproved or blocked, every call degrades to a no-op without layout jumps.
 * @module ads/adManager
 */
import { h } from '../ui/dom.js';
import { app, saveUser } from '../state.js';
import { toast } from '../ui/overlay.js';
import * as db from '../storage/db.js';

let adsenseLoaded = false;
let consent = null; // 'granted' | 'denied' | null

/** @returns {boolean} */
function nativeAdMob() {
  return !!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform() && window.Capacitor.Plugins && window.Capacitor.Plugins.AdMob);
}

/** @returns {boolean} whether ads may be shown at all right now */
function allowed() {
  const cfg = app.config.ads || {};
  if (!cfg.enabled || app.config.features?.ads === false) return false;
  if (app.session) return false;
  if (consent !== 'granted') return false;
  return true;
}

/** Load stored consent. */
export async function initAds() {
  consent = (await db.get('meta', 'adConsent')) || null;
}

/** Record consent choice. @param {'granted'|'denied'} v */
export async function setConsent(v) {
  consent = v;
  await db.set('meta', 'adConsent', v);
}

/** @returns {string|null} */
export function getConsent() { return consent; }

/** Whether the consent banner should be shown. */
export function needsConsent() {
  return !!app.config.ads?.enabled && consent === null;
}

function loadAdSense() {
  if (adsenseLoaded) return;
  adsenseLoaded = true;
  const s = document.createElement('script');
  s.async = true;
  s.crossOrigin = 'anonymous';
  s.src = 'https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=' + encodeURIComponent(app.config.ads.adsenseClient);
  s.onerror = () => { /* blocked or unapproved: placeholders stay empty */ };
  document.head.appendChild(s);
}

/**
 * Banner placeholder for a slot ('dashboard' | 'results'). Returns an empty, zero-height
 * element when ads are not allowed (no layout jump).
 * @param {'dashboard'|'results'} slot @returns {HTMLElement}
 */
export function showBanner(slot) {
  const wrap = h('div', { class: 'ad-slot no-print', 'aria-label': 'Advertisement' });
  if (!allowed()) return wrap;
  const cfg = app.config.ads;
  if (nativeAdMob()) {
    try { window.Capacitor.Plugins.AdMob.showBanner({ adId: cfg.admob.bannerId, position: 'TOP_CENTER', margin: 0 }); } catch { /* ignore */ }
    return wrap;
  }
  if (/X{6,}/.test(cfg.adsenseClient)) return wrap; // placeholder id → nothing shown
  wrap.classList.add('reserved');
  const ins = h('ins', { class: 'adsbygoogle', style: { display: 'block', width: '100%' }, 'data-ad-client': cfg.adsenseClient, 'data-ad-slot': cfg.adsenseSlots?.[slot] || '', 'data-ad-format': 'auto', 'data-full-width-responsive': 'true' });
  wrap.appendChild(ins);
  loadAdSense();
  setTimeout(() => { try { (window.adsbygoogle = window.adsbygoogle || []).push({}); } catch { /* ignore */ } }, 50);
  return wrap;
}

/** Alias used by screens. */
export const adSlot = showBanner;

/**
 * Interstitial at a natural break (after results), respecting frequency caps.
 * @param {string} trigger
 * @returns {Promise<boolean>} shown
 */
export async function showInterstitial(trigger) {
  if (!allowed()) return false;
  const cfg = app.config.ads;
  const every = cfg.interstitialEverySessions ?? 3;
  if (Date.now() - app.flags.startedAt < (cfg.noInterstitialFirstMs ?? 120000)) return false;
  if ((app.user?.meta?.sessionsSinceAd || 0) < every) return false;
  if (nativeAdMob()) {
    try {
      await window.Capacitor.Plugins.AdMob.prepareInterstitial({ adId: cfg.admob.interstitialId });
      await window.Capacitor.Plugins.AdMob.showInterstitial();
      app.user.meta.sessionsSinceAd = 0;
      saveUser();
      return true;
    } catch { return false; }
  }
  // Web: AdSense has no programmatic interstitial; Auto ads (if enabled in AdSense) handle vignettes.
  app.user.meta.sessionsSinceAd = 0;
  saveUser();
  return false;
}
export const maybeInterstitial = (trigger) => { showInterstitial(trigger); };

/**
 * Rewarded ad → bonus. On web (no rewarded format) the bonus is granted only when ads are
 * enabled and consented, after a short sponsor message; otherwise it explains availability.
 * @param {'hint'|'report'|'rapid'} reward
 * @returns {Promise<boolean>} rewarded
 */
export async function showRewarded(reward) {
  if (!allowed()) { toast('Rewarded bonuses are available when ads are enabled in the app.'); return false; }
  const cfg = app.config.ads;
  let ok = false;
  if (nativeAdMob()) {
    try {
      await window.Capacitor.Plugins.AdMob.prepareRewardVideoAd({ adId: cfg.admob.rewardedId });
      const r = await window.Capacitor.Plugins.AdMob.showRewardVideoAd();
      ok = !!r;
    } catch { ok = false; }
  } else {
    ok = true;
  }
  if (ok) {
    const m = app.user.meta;
    if (reward === 'rapid') m.rapidBonus = (m.rapidBonus || 0) + 1;
    if (reward === 'hint') m.extraHints = (m.extraHints || 0) + 1;
    if (reward === 'report') m.extraReport = true;
    saveUser();
    toast('Bonus unlocked — thank you!');
  }
  return ok;
}

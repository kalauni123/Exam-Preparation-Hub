/**
 * Feature 17 — local notifications with specific messages (Notifications API through the
 * service worker when permitted). Background push and home-screen widgets need the Android
 * wrapper (see README).
 * @module features/notify
 */
import { app } from '../state.js';
import * as db from '../storage/db.js';

/** Ask for permission (must be called from a user gesture). @returns {Promise<string>} */
export async function requestNotifications() {
  if (!('Notification' in window)) return 'unsupported';
  try { return await Notification.requestPermission(); } catch { return 'denied'; }
}

/**
 * Show at most one specific reminder per day when the app is opened.
 * @param {{due:number, atRisk:Array<{title:string,risk:number}>}} td
 */
export async function maybeNotify(td) {
  if (app.config.features?.notifications === false) return;
  if (!('Notification' in window) || Notification.permission !== 'granted') return;
  const key = 'lastNotify:' + app.user.profile.userId;
  const today = new Date().toISOString().slice(0, 10);
  if ((await db.get('meta', key)) === today) return;
  let body = '';
  if (td.atRisk.length) body = `⚠️ High chance of forgetting “${td.atRisk[0].title}” today — a 5-minute review will lock it in.`;
  else if (td.due) body = `${td.due} question${td.due > 1 ? 's are' : ' is'} due for review — about ${Math.ceil(td.due * 0.8)} minutes.`;
  if (!body) return;
  await db.set('meta', key, today);
  try {
    const reg = await navigator.serviceWorker?.getRegistration();
    if (reg) reg.showNotification('NeuroMCQ', { body, icon: './assets/icons/icon-192.png', badge: './assets/icons/icon-192.png', tag: 'neuromcq-daily', data: { url: './#/review' } });
    else new Notification('NeuroMCQ', { body });
  } catch { /* ignore */ }
}

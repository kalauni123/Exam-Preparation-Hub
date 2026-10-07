/**
 * Sound (WebAudio beeps, no audio files) and haptics (navigator.vibrate), respecting settings.
 * @module utils/feedback
 */
import { app } from '../state.js';

let ctx = null;

/**
 * Play a short tone.
 * @param {'correct'|'wrong'|'tick'|'start'} kind
 */
export function sound(kind) {
  if (!app.user?.settings?.sound) return;
  try {
    ctx = ctx || new (window.AudioContext || window.webkitAudioContext)();
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    const f = { correct: [660, 880], wrong: [220, 160], tick: [1000, 1000], start: [440, 660] }[kind] || [440, 440];
    o.frequency.setValueAtTime(f[0], ctx.currentTime);
    o.frequency.linearRampToValueAtTime(f[1], ctx.currentTime + 0.12);
    g.gain.setValueAtTime(kind === 'tick' ? 0.03 : 0.08, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.18);
    o.connect(g).connect(ctx.destination);
    o.start();
    o.stop(ctx.currentTime + 0.2);
  } catch { /* audio unavailable */ }
}

/**
 * Vibrate if enabled and supported.
 * @param {number|number[]} pattern
 */
export function haptic(pattern) {
  if (app.user?.settings?.haptics === false) return;
  try { if (navigator.vibrate) navigator.vibrate(pattern); } catch { /* ignore */ }
}

/**
 * Toasts, bottom sheets, confirm dialogs and ⓘ info tooltips.
 * @module ui/overlay
 */
import { h } from './dom.js';
import { icon } from './icons.js';

let toastWrap = null;

/**
 * Show a toast.
 * @param {string} msg @param {{action?:string, onAction?:()=>void, ms?:number}} [opt]
 */
export function toast(msg, opt = {}) {
  if (!toastWrap) {
    toastWrap = h('div', { class: 'toast-wrap', role: 'status', 'aria-live': 'polite' });
    document.body.appendChild(toastWrap);
  }
  const t = h('div', { class: 'toast' }, h('span', null, msg), opt.action ? h('button', { onclick: () => { opt.onAction?.(); t.remove(); } }, opt.action) : null);
  toastWrap.appendChild(t);
  setTimeout(() => t.remove(), opt.ms ?? (opt.action ? 9000 : 3200));
}

/**
 * Open a bottom sheet (modal dialog). Returns a close function.
 * @param {string} title @param {Node|Node[]} body @param {{onClose?:()=>void, label?:string}} [opt]
 * @returns {() => void}
 */
export function sheet(title, body, opt = {}) {
  const prevFocus = document.activeElement;
  const titleId = 'sheet-' + Math.random().toString(36).slice(2, 8);
  let closed = false;
  const close = () => {
    if (closed) return;
    closed = true;
    backdrop.remove();
    document.removeEventListener('keydown', onKey);
    opt.onClose?.();
    if (prevFocus && prevFocus.focus) prevFocus.focus();
  };
  const onKey = (e) => { if (e.key === 'Escape') close(); };
  const closeBtn = h('button', { class: 'icon-btn', 'aria-label': 'Close', onclick: close }, icon('close'));
  const panel = h('div', { class: 'sheet', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': titleId },
    h('div', { class: 'sheet-handle', 'aria-hidden': 'true' }),
    h('div', { class: 'sheet-head' }, h('h2', { id: titleId }, title), closeBtn),
    h('div', { class: 'sheet-body' }, body));
  const backdrop = h('div', { class: 'sheet-backdrop', onclick: (e) => { if (e.target === backdrop) close(); } }, panel);
  document.body.appendChild(backdrop);
  document.addEventListener('keydown', onKey);
  setTimeout(() => closeBtn.focus(), 30);
  return close;
}

/**
 * Promise-based confirm dialog.
 * @param {string} title @param {string} message @param {{ok?:string, cancel?:string, danger?:boolean}} [opt]
 * @returns {Promise<boolean>}
 */
export function confirmDialog(title, message, opt = {}) {
  return new Promise((resolve) => {
    let answered = false;
    const done = (v) => { if (answered) return; answered = true; close(); resolve(v); };
    const close = sheet(title, [
      h('p', null, message),
      h('div', { class: 'grid-2 mt-4' },
        h('button', { class: 'btn', onclick: () => done(false) }, opt.cancel || 'Cancel'),
        h('button', { class: opt.danger ? 'btn btn-danger' : 'btn btn-primary', onclick: () => done(true) }, opt.ok || 'OK')),
    ], { onClose: () => { if (!answered) { answered = true; resolve(false); } } });
  });
}

/**
 * Small ⓘ button that explains a metric in plain language.
 * @param {string} title @param {string} text @returns {HTMLButtonElement}
 */
export function infoTip(title, text) {
  return /** @type any */ (h('button', { class: 'info', type: 'button', 'aria-label': 'About ' + title, title: text, onclick: (e) => { e.stopPropagation(); sheet(title, h('p', null, text)); } }, 'i'));
}

/**
 * Skeleton placeholder block.
 * @param {number} [lines=3] @returns {HTMLElement}
 */
export function skeleton(lines = 3) {
  return h('div', { 'aria-busy': 'true', 'aria-label': 'Loading' }, h('div', { class: 'skeleton sk-block' }), ...Array.from({ length: lines }, (_, i) => h('div', { class: 'skeleton sk-line', style: { width: 90 - i * 15 + '%' } })));
}

/**
 * Empty-state block.
 * @param {string} iconName @param {string} title @param {string} [text] @param {Node} [action]
 * @returns {HTMLElement}
 */
export function emptyState(iconName, title, text, action) {
  return h('div', { class: 'empty' }, icon(/** @type any */ (iconName)), h('h3', null, title), text ? h('p', null, text) : null, action || null);
}

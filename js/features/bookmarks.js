/**
 * Feature 13 — Smart bookmarks with reasons and filtered practice.
 * @module features/bookmarks
 */
import { h, mount } from '../ui/dom.js';
import { icon } from '../ui/icons.js';
import { emptyState } from '../ui/overlay.js';
import { app, saveUser } from '../state.js';
import { questionsByIds } from './qsource.js';
import { startSession, BOOKMARK_REASONS } from './session.js';
import { mathText } from './whyWrong.js';
import { t } from '../i18n.js';

/** @param {HTMLElement} view */
export async function renderBookmarks(view) {
  const bms = app.user.bookmarks || [];
  if (!bms.length) {
    mount(view, h('h1', null, t('home.bookmarks')), h('section', { class: 'card' }, emptyState('bookmark', 'No bookmarks yet', 'Tap “Bookmark” on any question and choose reasons such as Formula or Examiner trap.')));
    return;
  }
  const reasonsSel = new Set();
  const out = h('div', { class: 'stack' });
  const qs = new Map((await questionsByIds(bms.map((b) => b.questionId))).map((q) => [q.id, q]));
  const label = Object.fromEntries(BOOKMARK_REASONS);
  const chips = h('div', { class: 'row-wrap' });
  const paintChips = () => mount(chips, BOOKMARK_REASONS.map(([k, l]) => {
    const n = bms.filter((b) => b.reasons.includes(k)).length;
    return h('button', { class: 'chip', 'aria-pressed': String(reasonsSel.has(k)), disabled: !n, onclick: () => { if (reasonsSel.has(k)) reasonsSel.delete(k); else reasonsSel.add(k); paintChips(); paint(); } }, `${l} (${n})`);
  }));
  const current = () => bms.filter((b) => !reasonsSel.size || b.reasons.some((r) => reasonsSel.has(r)));
  function paint() {
    const list = current();
    mount(out,
      h('button', { class: 'btn btn-primary btn-block', disabled: !list.length, onclick: () => startSession({ mode: 'practice', title: 'Bookmarked questions', questions: list.map((b) => qs.get(b.questionId)).filter(Boolean) }) }, icon('play'), `Practise ${list.length} bookmarked`),
      ...list.map((b) => {
        const q = qs.get(b.questionId);
        return h('div', { class: 'review-item' },
          h('div', { class: 'row-wrap mb-2' }, h('span', { class: 'badge' }, b.questionId), ...b.reasons.map((r) => h('span', { class: 'badge yellow' }, label[r] || r))),
          q ? mathText('p', 'break', q.stem) : h('p', { class: 'muted small' }, 'Question not available offline.'),
          h('button', { class: 'btn btn-sm mt-2', onclick: () => { app.user.bookmarks = app.user.bookmarks.filter((x) => x !== b); saveUser(); renderBookmarks(view); } }, icon('trash'), 'Remove'));
      }));
  }
  paintChips();
  paint();
  mount(view, h('h1', null, t('home.bookmarks')), h('section', { class: 'card' }, h('p', { class: 'muted small' }, 'Filter by reason:'), chips), h('section', { class: 'card' }, out));
}

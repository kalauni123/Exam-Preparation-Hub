/**
 * Feature 3 — "Why did I get it wrong?" panel and the shared question-review renderer.
 * Empty explanation fields are hidden gracefully.
 * @module features/whyWrong
 */
import { h } from '../ui/dom.js';
import { renderMath } from '../ui/math.js';
import { ERROR_LABELS } from '../engine/errorClassifier.js';

/**
 * Map from original option key → displayed label for a presentation order.
 * @param {string[]} order original keys in display order
 * @returns {Object<string,string>}
 */
export function labelMap(order) {
  const labels = 'ABCDE';
  return Object.fromEntries(order.map((k, i) => [k, labels[i]]));
}

/** Text node container that renders math lazily. */
export function mathText(tag, cls, text) {
  const el = h(tag, { class: cls }, String(text ?? ''));
  renderMath(el);
  return el;
}

/**
 * Build the explanation panel.
 * @param {object} q question (normalised)
 * @param {{selected:string|null, order:string[], errorType?:string|null, isCorrect:boolean, compact?:boolean}} ctx
 * @returns {HTMLElement}
 */
export function whyPanel(q, ctx) {
  const lm = labelMap(ctx.order || Object.keys(q.options));
  const ex = q.explanation || {};
  const sec = (title, text, cls) => (text && String(text).trim() ? h('div', { class: 'explain-section ' + (cls || '') }, h('h4', null, title), mathText('div', 'break', text)) : null);
  const kids = [];
  if (!ctx.isCorrect) {
    kids.push(h('div', { class: 'verdict' },
      h('div', { class: 'yours' }, '❌ Your answer: ', ctx.selected ? lm[ctx.selected] : 'not answered', ctx.selected ? mathText('span', 'option-text', ' — ' + q.options[ctx.selected]) : null),
      h('div', { class: 'right' }, '✅ Correct answer: ', lm[q.answer], mathText('span', 'option-text', ' — ' + q.options[q.answer]))));
    if (ctx.errorType) kids.push(h('p', { class: 'mt-3' }, h('span', { class: 'badge red' }, 'Likely error: ' + (ERROR_LABELS[ctx.errorType] || ctx.errorType))));
  }
  kids.push(sec('Why the correct answer is right', ex.whyCorrect, 'good'));
  if (!ctx.compact) {
    const ww = ex.whyWrong || {};
    const wrongKeys = (ctx.order || Object.keys(q.options)).filter((k) => k !== q.answer && ww[k]);
    if (wrongKeys.length) {
      kids.push(h('div', { class: 'explain-section bad' }, h('h4', null, 'Why the other options are wrong'),
        h('ul', { class: 'stack-sm', style: { listStyle: 'none' } }, wrongKeys.map((k) => h('li', null, h('strong', null, lm[k] + ': '), mathText('span', 'break', ww[k]))))));
    }
    kids.push(sec('Concept tested', ex.conceptTested));
    kids.push(sec('Trap used', ex.trapUsed));
    kids.push(sec('How the question could be modified', ex.howToModify));
    kids.push(sec('How to avoid this mistake', ex.howToAvoid));
  }
  return h('div', { class: 'explanation-box', role: 'region', 'aria-label': 'Explanation' }, kids);
}

/**
 * Read-only review card for a finished question.
 * @param {object} q @param {{selected:string|null, order:string[], isCorrect:boolean, errorType?:string|null, index:number}} r
 * @param {Node[]} [actions]
 * @returns {HTMLElement}
 */
export function reviewItem(q, r, actions = []) {
  const lm = labelMap(r.order);
  const opts = r.order.map((k) => h('div', { class: 'option ' + (k === q.answer ? 'correct' : k === r.selected ? 'wrong' : 'dim') },
    h('span', { class: 'option-label' }, lm[k]), mathText('span', 'option-text', q.options[k])));
  return h('div', { class: 'review-item' },
    h('div', { class: 'row between mb-2' }, h('span', { class: 'pill' }, 'Q' + (r.index + 1)), h('span', { class: 'badge ' + (r.isCorrect ? 'green' : 'red') }, r.isCorrect ? 'Correct' : r.selected ? 'Wrong' : 'Skipped')),
    mathText('p', 'break', q.stem),
    h('div', { class: 'options-grid mt-3' }, opts),
    whyPanel(q, { ...r, compact: r.isCorrect }),
    actions.length ? h('div', { class: 'row-wrap mt-3' }, actions) : null);
}

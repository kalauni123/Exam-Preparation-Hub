/**
 * Feature 16 — Learning DNA card (shareable).
 * @module features/dna
 */
import { h, mount, pct } from '../ui/dom.js';
import { icon } from '../ui/icons.js';
import { emptyState, toast } from '../ui/overlay.js';
import { app, saveUser, subjectName } from '../state.js';
import { computeDNA } from '../engine/learningDNA.js';
import { t } from '../i18n.js';

/** Plain-text version for sharing. */
function dnaText(d, name) {
  return [`🧬 ${name}'s Learning DNA (NeuroMCQ)`,
    `Strong: ${d.strong.map((s) => s.name).join(', ') || '—'}`,
    `Needs work: ${d.weak.map((s) => s.name).join(', ') || '—'}`,
    `Style: ${d.style} · Comfortable difficulty: ${d.preferredDifficulty}`,
    `Avg response: ${d.avgResponseSec.toFixed(0)} s · Exam temperament: ${d.temperament}`,
    `Top traps: ${d.commonMistakes.map((m) => m.label).join(', ') || '—'}`].join('\n');
}

/** @param {HTMLElement} view */
export function renderDNA(view) {
  const d = computeDNA(app.user, subjectName);
  if (!d) {
    mount(view, h('h1', null, t('home.dna')), h('section', { class: 'card' }, emptyState('dna', 'Your Learning DNA needs ~20 answers', 'Keep practising — your learning profile will appear here.', h('a', { class: 'btn btn-primary', href: '#/practice' }, 'Practise'))));
    return;
  }
  app.user.dna = d;
  saveUser();
  const item = (title, value, sub) => h('div', { class: 'dna-item' }, h('h4', null, title), h('div', null, value), sub ? h('div', { class: 'small muted' }, sub) : null);
  const share = async () => {
    const text = dnaText(d, app.user.profile.name);
    try {
      if (navigator.share) await navigator.share({ title: 'My Learning DNA', text });
      else { await navigator.clipboard.writeText(text); toast('Copied to clipboard.'); }
    } catch { /* cancelled */ }
  };
  mount(view,
    h('div', { class: 'row between' }, h('h1', null, '🧬 ' + t('home.dna')), h('button', { class: 'btn btn-sm', onclick: share }, icon('share'), 'Share')),
    h('section', { class: 'card dna-card' },
      h('p', { class: 'muted small' }, `Computed from ${d.attempts} answers.`),
      h('div', { class: 'dna-grid' },
        item('Strong subjects', d.strong.map((s) => `${s.name} (${pct(s.score)})`).join(', ') || '—'),
        item('Weak subjects', d.weak.map((s) => `${s.name} (${pct(s.score)})`).join(', ') || '—'),
        item('Learning style', d.style, 'Conceptual vs memorisation accuracy'),
        item('Comfortable difficulty', d.preferredDifficulty),
        item('Common mistakes', d.commonMistakes.map((m) => `${m.label} (${m.n})`).join(', ') || 'None yet'),
        item('Average response time', `${d.avgResponseSec.toFixed(0)} s`),
        item('Retention', d.retention === null ? 'Not enough repeats yet' : pct(d.retention), 'Accuracy on questions seen before'),
        item('Guessing behaviour', pct(d.guessingRate), 'Very fast wrong answers'),
        item('Exam temperament', d.temperament))),
    h('section', { class: 'card' }, h('h2', null, 'Personal tips'), h('ul', { class: 'stack-sm', style: { paddingLeft: '1.2rem' } }, d.tips.map((tip) => h('li', null, tip)))));
}

/**
 * Feature 15 — 60-second Rapid-Fire: 10 × 60 s (configurable), weighted toward high-value
 * and weak chapters, with haptics and sound.
 * @module features/rapidFire
 */
import { h, mount } from '../ui/dom.js';
import { icon } from '../ui/icons.js';
import { toast } from '../ui/overlay.js';
import { app, saveUser, activeSubjectIds, subjectName } from '../state.js';
import { rankChapters } from './insights.js';
import { questionsOfChapters } from './qsource.js';
import { pickTargeted } from './studyNow.js';
import { startSession } from './session.js';
import { showRewarded } from '../ads/adManager.js';
import { t } from '../i18n.js';

/** @param {HTMLElement} view */
export function renderRapid(view) {
  const cfg = app.config.rapidFire || { questions: 10, secondsPerQuestion: 60 };
  const st = { n: cfg.questions, sec: cfg.secondsPerQuestion, subject: 'all' };
  const subs = activeSubjectIds();
  const nSel = h('select', { class: 'input-full', 'aria-label': 'Questions', onchange: () => { st.n = +nSel.value; } }, [5, 10, 15, 20].map((n) => h('option', { value: n, selected: n === st.n }, `${n} questions`)));
  const sSel = h('select', { class: 'input-full', 'aria-label': 'Seconds per question', onchange: () => { st.sec = +sSel.value; } }, [20, 30, 45, 60, 90].map((n) => h('option', { value: n, selected: n === st.sec }, `${n} s per question`)));
  const subSel = h('select', { class: 'input-full', 'aria-label': 'Subject', onchange: () => { st.subject = subSel.value; } }, h('option', { value: 'all' }, 'All active subjects'), subs.map((s) => h('option', { value: s }, subjectName(s))));
  const soundCb = h('input', { type: 'checkbox', checked: !!app.user.settings.sound, onchange: () => { app.user.settings.sound = soundCb.checked; saveUser(); } });

  async function go(bonus) {
    const ranked = rankChapters(app.user, { subjectIds: st.subject === 'all' ? subs : [st.subject] });
    if (!ranked.length) { toast('No questions in your active subjects yet.'); return; }
    const top = ranked.slice(0, 6).map((r) => r.chapterId);
    const pool = await questionsOfChapters(top);
    const qs = pickTargeted(pool, Math.min(st.n, pool.length));
    if (bonus) { app.user.meta.rapidBonus = Math.max(0, (app.user.meta.rapidBonus || 0) - 1); saveUser(); }
    startSession({ mode: 'rapid', title: bonus ? 'Bonus Rapid-Fire' : 'Rapid-Fire', questions: qs, perQuestionSec: st.sec, feedback: 'immediate' });
  }
  const bonus = app.user.meta.rapidBonus || 0;
  mount(view,
    h('h1', null, '⚡ ' + t('home.rapid')),
    h('section', { class: 'card' },
      h('p', null, 'Answer fast! Questions are drawn from your weakest and most important chapters. Unanswered questions are marked wrong when the clock runs out.'),
      h('div', { class: 'form-grid' }, nSel, sSel, subSel, h('label', { class: 'switch' }, h('span', null, 'Sound effects'), soundCb)),
      h('button', { class: 'btn btn-primary btn-block', onclick: () => go(false) }, icon('bolt'), 'Start Rapid-Fire'),
      bonus ? h('button', { class: 'btn btn-block mt-3', onclick: () => go(true) }, icon('star'), `Play bonus round (${bonus} left)`) :
        h('button', { class: 'btn btn-ghost btn-block mt-3', onclick: async () => { if (await showRewarded('rapid')) renderRapid(view); } }, icon('star'), 'Unlock a bonus round (rewarded ad)')));
}

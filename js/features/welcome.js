/**
 * Feature 1 — profiles: pick a local profile, log in by phone, register, or import a profile.
 * Phones are never shown in full after registration.
 * @module features/welcome
 */
import { h, mount } from '../ui/dom.js';
import { icon } from '../ui/icons.js';
import { toast } from '../ui/overlay.js';
import { app, setUser } from '../state.js';
import { go } from '../router.js';
import { listLocalUsers, loadUser, registerUser, findByPhone, setCurrentUserId, importUserDoc } from '../storage/userStore.js';
import { importUserFile } from '../storage/exportImport.js';
import { loadDataFile } from '../bank/catalogLoader.js';
import { t } from '../i18n.js';

async function enter(u) {
  await setCurrentUserId(u.profile.userId);
  setUser(u);
  go(u.profile.activeSubjects?.length ? '/home' : '/onboarding', { replace: true });
}

/** @param {HTMLElement} view */
export async function renderWelcome(view) {
  const locals = await listLocalUsers();
  const seeds = (await loadDataFile('users/index.json', { users: [] }))?.users || [];
  const seedNotLocal = seeds.filter((s) => !locals.find((l) => l.userId === s.userId));
  const err = h('p', { class: 'error-text', role: 'alert' });
  const name = h('input', { class: 'input-full', autocomplete: 'name', maxlength: 80, required: true, placeholder: 'e.g. Your name' });
  const phone = h('input', { class: 'input-full', type: 'tel', inputmode: 'numeric', autocomplete: 'tel', maxlength: 16, required: true, placeholder: '98XXXXXXXX' });
  const loginPhone = h('input', { class: 'input-full', type: 'tel', inputmode: 'numeric', autocomplete: 'tel', maxlength: 16, placeholder: '98XXXXXXXX', 'aria-label': 'Phone number' });
  const fileIn = h('input', { type: 'file', accept: 'application/json,.json', class: 'hidden', onchange: async () => {
    const f = fileIn.files[0];
    if (!f) return;
    try { const u = await importUserFile(f); toast('Profile imported.'); enter(u); } catch (e) { err.textContent = e.message; }
  } });

  const register = h('form', { class: 'form-grid', onsubmit: async (e) => {
    e.preventDefault();
    err.textContent = '';
    try { const u = await registerUser({ name: name.value, phone: phone.value }, app.config.registration); toast('Welcome, ' + u.profile.name.split(' ')[0] + '!'); enter(u); } catch (ex) { err.textContent = ex.message; }
  } },
    h('label', { class: 'field' }, h('span', null, t('welcome.fullName')), name),
    h('label', { class: 'field' }, h('span', null, t('welcome.phone')), phone, h('p', { class: 'hint' }, 'Used only to identify your profile on this device. It is hashed and shown masked (98****1234).')),
    h('button', { class: 'btn btn-primary btn-block', type: 'submit' }, t('welcome.create')));

  const login = h('form', { class: 'row', onsubmit: async (e) => {
    e.preventDefault();
    err.textContent = '';
    const u = await findByPhone(loginPhone.value);
    if (u) enter(u); else err.textContent = 'No profile with this number on this device. Create one below or import your backup.';
  } }, h('div', { class: 'grow' }, loginPhone), h('button', { class: 'btn btn-primary', type: 'submit' }, t('welcome.login')));

  mount(view,
    h('section', { class: 'card' },
      h('div', { class: 'hero' }, h('div', { class: 'logo text-primary' }, icon('logo', { size: 72 })), h('h1', null, 'NeuroMCQ'), h('p', { class: 'muted' }, t('welcome.tagline'))),
      locals.length ? h('div', { class: 'mb-4' }, h('div', { class: 'section-label mb-2' }, t('welcome.profilesHere')),
        h('div', { class: 'profile-pick' }, locals.map((p) => h('button', { class: 'list-row', onclick: async () => { const u = await loadUser(p.userId); if (u) enter(u); } },
          h('span', { class: 'avatar' }, p.name.slice(0, 1).toUpperCase()), h('span', { class: 'grow' }, h('span', { style: { display: 'block' } }, p.name), h('span', { class: 'meta' }, p.phoneMasked)), icon('chevron', { cls: 'chev' }))))) : null,
      seedNotLocal.length ? h('div', { class: 'mb-4' }, h('div', { class: 'section-label mb-2' }, 'Profiles published with this site'),
        h('div', { class: 'profile-pick' }, seedNotLocal.map((p) => h('button', { class: 'list-row', onclick: async () => {
          const raw = await loadDataFile('users/' + p.userId + '.json', null);
          if (!raw) { err.textContent = 'Could not load that profile.'; return; }
          try { enter(await importUserDoc(raw)); } catch (e2) { err.textContent = e2.message; }
        } }, h('span', { class: 'avatar' }, p.displayName.slice(0, 1)), h('span', { class: 'grow' }, p.displayName), icon('chevron', { cls: 'chev' }))))) : null,
      h('div', { class: 'section-label mb-2' }, t('welcome.loginPhone')), login, err),
    h('section', { class: 'card' }, h('h2', null, t('welcome.newProfile')), register),
    h('section', { class: 'card card-tight center' }, fileIn, h('button', { class: 'btn btn-ghost', onclick: () => fileIn.click() }, icon('upload'), t('welcome.import')),
      h('p', { class: 'small muted mt-2' }, 'Your data stays on this device. ', h('a', { href: './privacy.html' }, 'Privacy policy'))));
}

/** Onboarding: exam target, date, daily minutes and active subjects. @param {HTMLElement} view */
export function renderOnboarding(view) {
  const u = app.user;
  const p = u.profile;
  const err = h('p', { class: 'error-text', role: 'alert' });
  const exam = h('select', { class: 'input-full' }, h('option', { value: '' }, 'No specific exam (generic mode)'), ...(app.profiles.profiles || []).map((x) => h('option', { value: x.id, selected: x.id === p.examTarget }, x.name)));
  const date = h('input', { class: 'input-full', type: 'date', value: p.examDate || '' });
  const minutes = h('input', { class: 'input-full', type: 'number', min: 5, max: 300, value: p.dailyMinutes || 35 });
  const chosen = new Set(p.activeSubjects || []);
  const picker = subjectPicker(chosen);
  mount(view,
    h('h1', null, t('onboarding.title')),
    h('section', { class: 'card' },
      h('div', { class: 'form-grid' },
        h('label', { class: 'field' }, h('span', null, 'Exam target'), exam),
        h('label', { class: 'field' }, h('span', null, 'Exam date (optional)'), date),
        h('label', { class: 'field' }, h('span', null, 'Daily study minutes'), minutes))),
    h('section', { class: 'card' }, h('h2', null, 'Choose your active subjects'), h('p', { class: 'muted small' }, 'Your home screen, plans and analytics focus on these. You can change them any time in Settings.'), picker),
    err,
    h('div', { class: 'sticky-actions' }, h('button', { class: 'btn btn-primary btn-block', onclick: async () => {
      if (!chosen.size) { err.textContent = 'Pick at least one subject.'; return; }
      p.examTarget = exam.value; p.examDate = date.value; p.dailyMinutes = Math.max(5, Math.min(300, parseInt(minutes.value, 10) || 35));
      p.activeSubjects = [...chosen];
      const { saveUserNow } = await import('../state.js');
      await saveUserNow();
      go('/home', { replace: true });
    } }, 'Continue')));
}

/**
 * Category-grouped subject checklist.
 * @param {Set<string>} chosen mutated
 * @returns {HTMLElement}
 */
export function subjectPicker(chosen) {
  return h('div', null, app.catalog.categories.map((c) => h('div', { class: 'mt-4' },
    h('div', { class: 'section-label mb-2' }, c.label),
    h('div', { class: 'subject-grid' }, c.subjects.map((s) => {
      const n = s.chapters.reduce((a, ch) => a + (ch.questionCount || 0), 0);
      const cb = h('input', { type: 'checkbox', checked: chosen.has(s.id), onchange: () => { if (cb.checked) chosen.add(s.id); else chosen.delete(s.id); } });
      return h('label', { class: 'list-row' }, cb, h('span', { class: 'grow' }, h('span', { style: { display: 'block' } }, s.name), h('span', { class: 'meta' }, n ? `${n} questions` : 'No questions yet')));
    })))));
}

/**
 * Feature 18 — Settings and Profile screens: theme, sound, haptics, reduced motion, language,
 * active subjects, exam target, offline downloads manager, export / import / delete,
 * backup reminder, optional sync, demo data, ad consent.
 * @module features/settings
 */
import { h, mount, fmtDate, fmtBytes } from '../ui/dom.js';
import { icon } from '../ui/icons.js';
import { toast, confirmDialog, sheet } from '../ui/overlay.js';
import { app, bus, saveUser, saveUserNow, setUser, activeSubjectIds } from '../state.js';
import { go } from '../router.js';
import { exportUser, importUserFile } from '../storage/exportImport.js';
import { deleteUser, setCurrentUserId } from '../storage/userStore.js';
import { offlineSummary, clearChapters } from '../bank/bankCache.js';
import { downloadForOffline } from '../bank/chapterLoader.js';
import { createSync } from '../storage/syncAdapter.js';
import { subjectPicker } from './welcome.js';
import { applyTheme, applyMotion } from '../main-helpers.js';
import { setLang, t } from '../i18n.js';
import { requestNotifications } from './notify.js';
import { setConsent, getConsent } from '../ads/adManager.js';
import { generateDemoData } from '../utils/demoData.js';

/** Profile hub. @param {HTMLElement} view */
export function renderProfile(view) {
  const p = app.user.profile;
  const link = (href, ic, label, sub) => h('a', { class: 'list-row', href }, h('span', { class: 'tile-icon' }, icon(ic)), h('span', { class: 'grow' }, h('span', { style: { display: 'block' } }, label), sub ? h('span', { class: 'meta' }, sub) : null), icon('chevron', { cls: 'chev' }));
  mount(view,
    h('h1', null, t('nav.profile')),
    h('section', { class: 'card' },
      h('div', { class: 'row' }, h('span', { class: 'avatar', style: { width: '56px', height: '56px', fontSize: '1.4rem' } }, p.name.slice(0, 1).toUpperCase()),
        h('div', { class: 'grow' }, h('div', { class: 'subject-title' }, p.name), h('div', { class: 'small muted' }, p.phoneMasked + ' · since ' + fmtDate(p.createdAt)), h('div', { class: 'xs muted break' }, p.userId)))),
    h('section', { class: 'card' }, h('ul', { class: 'list' },
      h('li', null, link('#/settings', 'settings', t('nav.settings'), 'Theme, language, subjects, data')),
      h('li', null, link('#/dna', 'dna', t('home.dna'), 'Your learning profile')),
      h('li', null, link('#/memory', 'brain', t('home.memoryMap'), 'Chapter memory strength')),
      h('li', null, link('#/syllabus', 'tree', t('home.syllabus'), 'Full progress tree')),
      h('li', null, link('#/mistakes', 'note', t('home.mistakes'), 'Notebook & PDF')),
      h('li', null, link('#/bookmarks', 'bookmark', t('home.bookmarks'), 'Saved questions')),
      h('li', null, link('#/qa', 'library', 'Question analytics', 'Per-question statistics')),
      h('li', null, link('#/quality', 'shield', 'Question quality engine', 'Admin checks for the bank')),
      h('li', null, link('./tools/validate-bank.html', 'check', 'Owner tools', 'Validator, legacy converter, catalog stats')),
      h('li', null, link('./privacy.html', 'info', 'Privacy policy')))),
    h('section', { class: 'card' }, h('button', { class: 'btn btn-block', onclick: async () => { await saveUserNow(); await setCurrentUserId(''); setUser(null); go('/welcome', { replace: true }); } }, icon('logout'), t('profile.switch'))));
}

/** Settings. @param {HTMLElement} view @param {object} _p @param {URLSearchParams} query */
export async function renderSettings(view, _p, query) {
  const u = app.user;
  const s = u.settings;
  const sw = (label, key, after) => {
    const cb = h('input', { type: 'checkbox', checked: !!s[key], onchange: () => { s[key] = cb.checked; saveUser(); after?.(); } });
    return h('label', { class: 'switch' }, h('span', null, label), cb);
  };
  const themeSel = h('select', { class: 'input-full', 'aria-label': 'Theme', onchange: () => { s.theme = themeSel.value; saveUser(); applyTheme(s.theme); bus.dispatchEvent(new CustomEvent('user')); } },
    [['light', 'Light (portal style)'], ['dark', 'Dark'], ['system', 'Follow system']].map(([v, l]) => h('option', { value: v, selected: s.theme === v }, l)));
  const langSel = h('select', { class: 'input-full', 'aria-label': 'Language', onchange: async () => { s.language = langSel.value; setLang(s.language); await saveUserNow(); location.reload(); } },
    h('option', { value: 'en', selected: s.language !== 'ne' }, 'English'), h('option', { value: 'ne', selected: s.language === 'ne' }, 'नेपाली (Nepali)'));
  const p = u.profile;
  const exam = h('select', { class: 'input-full', onchange: () => { p.examTarget = exam.value; saveUser(); } }, h('option', { value: '' }, 'No specific exam (generic)'), ...(app.profiles.profiles || []).map((x) => h('option', { value: x.id, selected: x.id === p.examTarget }, x.name)));
  const date = h('input', { class: 'input-full', type: 'date', value: p.examDate || '', onchange: () => { p.examDate = date.value; saveUser(); } });
  const minutes = h('input', { class: 'input-full', type: 'number', min: 5, max: 300, value: p.dailyMinutes, onchange: () => { p.dailyMinutes = Math.max(5, Math.min(300, parseInt(minutes.value, 10) || 35)); saveUser(); } });
  const chosen = new Set(p.activeSubjects || []);
  const offlineBox = h('div', { class: 'small muted' }, 'Calculating…');
  const fileIn = h('input', { type: 'file', accept: '.json,application/json', class: 'hidden', onchange: async () => {
    try { const doc = await importUserFile(fileIn.files[0]); if (doc.profile.userId === u.profile.userId) { setUser(doc); toast('Data restored.'); } else { toast('Imported profile ' + doc.profile.name + '. Switch profile to use it.'); } } catch (e) { toast(e.message); }
  } });
  const sync = createSync(app.config.sync);
  const subjectsCard = h('section', { class: 'card', id: 'subjects' }, h('h2', null, 'Active subjects'), subjectPicker(chosen),
    h('button', { class: 'btn btn-primary btn-block mt-4', onclick: () => { if (!chosen.size) { toast('Pick at least one subject.'); return; } p.activeSubjects = [...chosen]; saveUser(); toast('Subjects saved.'); } }, 'Save subjects'));

  mount(view,
    h('h1', null, t('nav.settings')),
    h('section', { class: 'card' }, h('h2', null, 'Appearance & feedback'),
      h('div', { class: 'form-grid' },
        h('label', { class: 'field' }, h('span', null, 'Theme'), themeSel),
        h('label', { class: 'field' }, h('span', null, 'Language'), langSel),
        sw('Sound effects', 'sound'), sw('Haptics (vibration)', 'haptics'), sw('Reduce motion', 'reducedMotion', () => applyMotion(s.reducedMotion)),
        h('button', { class: 'btn', onclick: async () => { const r = await requestNotifications(); toast(r === 'granted' ? 'Reminders enabled.' : r === 'unsupported' ? 'Notifications are not supported here.' : 'Notifications were not allowed.'); } }, icon('bell'), 'Enable study reminders'))),
    h('section', { class: 'card' }, h('h2', null, 'Exam & goals'), h('div', { class: 'form-grid' },
      h('label', { class: 'field' }, h('span', null, 'Exam target'), exam, h('p', { class: 'hint' }, 'Exam blueprints live in data/examProfiles.json and must be filled in by the owner.')),
      h('label', { class: 'field' }, h('span', null, 'Exam date'), date),
      h('label', { class: 'field' }, h('span', null, 'Daily minutes'), minutes))),
    subjectsCard,
    h('section', { class: 'card' }, h('h2', null, 'Offline downloads'), offlineBox,
      h('div', { class: 'grid-2 mt-3' },
        h('button', { class: 'btn', onclick: async () => {
          const chs = activeSubjectIds().flatMap((sid) => app.catalog.subjectById.get(sid).chapters.map((c) => app.catalog.chapterById.get(c.id))).filter((c) => c.questionCount > 0);
          const bar = h('span', { style: { width: '0%' } });
          const close = sheet('Downloading active subjects', [h('div', { class: 'progress' }, bar)]);
          const r = await downloadForOffline(chs, (d, n) => { bar.style.width = (100 * d) / n + '%'; });
          close(); toast(`${r.ok} chapters saved offline.`); paintOffline();
        } }, icon('download'), 'Download active subjects'),
        h('button', { class: 'btn', onclick: async () => { if (await confirmDialog('Clear offline questions?', 'Chapters will be downloaded again when you open them.', { danger: true, ok: 'Clear' })) { await clearChapters(); if (window.caches) { for (const k of await caches.keys()) if (k.includes('chapters')) await caches.delete(k); } paintOffline(); } } }, icon('trash'), 'Clear'))),
    h('section', { class: 'card' }, h('h2', null, 'Your data'),
      h('p', { class: 'small muted' }, `Last backup: ${u.meta.lastBackupAt ? fmtDate(u.meta.lastBackupAt) : 'never'} · ${u.attempts.length} answers recorded · reminder every ${app.config.backupReminderDays || 7} days.`),
      fileIn,
      h('div', { class: 'grid-2' },
        h('button', { class: 'btn', onclick: () => { exportUser(u); saveUser(); toast('Saved as ' + u.profile.userId + '.json'); } }, icon('download'), 'Download my data'),
        h('button', { class: 'btn', onclick: () => fileIn.click() }, icon('upload'), 'Import data')),
      sync.name !== 'off' ? h('button', { class: 'btn btn-block mt-3', onclick: async () => { const pin = prompt('Sync PIN'); const r = await sync.push(u, { pin: pin || '' }); toast(r.message); } }, icon('refresh'), `Sync now (${sync.name})`) : h('p', { class: 'hint mt-3' }, 'Automatic sync is off (see README to enable it).'),
      h('button', { class: 'btn btn-block mt-3', onclick: async () => {
        if (!(await confirmDialog('Load demo data?', 'Adds about 60 days / 1,000 simulated answers in Quantum Mechanics - I and Statistical Mechanics to THIS profile so you can preview every chart. Use a test profile if you want to keep your real data clean.', { ok: 'Load demo' }))) return;
        const close = sheet('Generating demo data…', [h('p', { class: 'muted' }, 'This takes a few seconds.')]);
        try { const n = await generateDemoData(u); await saveUserNow(); close(); toast(`${n} demo answers added.`); go('/analytics'); } catch (e) { close(); toast(e.message); }
      } }, icon('wand'), 'Load demo data'),
      h('button', { class: 'btn btn-danger btn-block mt-3', onclick: async () => {
        if (!(await confirmDialog('Delete all my data?', 'This permanently removes this profile and its history from this device. Download a backup first if you may need it.', { danger: true, ok: 'Delete' }))) return;
        await deleteUser(u.profile.userId); await setCurrentUserId(''); setUser(null); go('/welcome', { replace: true });
      } }, icon('trash'), 'Delete all my data')),
    app.config.ads?.enabled ? h('section', { class: 'card' }, h('h2', null, 'Ads & privacy'), h('p', { class: 'small muted' }, 'Current choice: ' + (getConsent() || 'not set')),
      h('div', { class: 'grid-2' }, h('button', { class: 'btn', onclick: () => { setConsent('granted'); toast('Thanks!'); } }, 'Allow ads'), h('button', { class: 'btn', onclick: () => { setConsent('denied'); toast('Ads turned off.'); } }, 'No ads'))) : null,
    h('p', { class: 'center xs muted mt-4' }, `NeuroMCQ ${app.config.appVersion || ''} · ${app.catalog.chapters.length} chapters · ${[...app.catalog.subjectById.keys()].length} subjects`));

  async function paintOffline() {
    const sum = await offlineSummary();
    offlineBox.textContent = `${sum.chapters} chapter file${sum.chapters === 1 ? '' : 's'} stored offline · ${fmtBytes(sum.bytes)}`;
  }
  paintOffline();
  if (query.get('focus') === 'subjects') setTimeout(() => subjectsCard.scrollIntoView({ behavior: 'smooth' }), 100);
}

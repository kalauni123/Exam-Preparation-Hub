/**
 * Section 10 — Question Library and "Pull into battle" flow: filter Category → Subject →
 * Chapter, difficulty and tags, tick questions, pull them into the battle set.
 * @module features/library
 */
import { h, mount, debounce } from '../ui/dom.js';
import { icon } from '../ui/icons.js';
import { toast } from '../ui/overlay.js';
import { app } from '../state.js';
import { go } from '../router.js';
import { loadChapters } from '../bank/chapterLoader.js';
import { mathText } from './whyWrong.js';

/** Currently pulled battle set (in memory for this visit). */
export function battleSet() {
  return app.flags.battleSet || [];
}

/** @param {HTMLElement} view */
export function renderLibrary(view) {
  const f = { cat: app.catalog.categories.find((c) => c.subjects.some((s) => s.chapters.some((ch) => ch.questionCount)))?.id || app.catalog.categories[0].id, sub: '', chs: new Set(), diff: 'any', tag: '', q: '' };
  const picked = new Map((app.flags.battleSet || []).map((q) => [q.id, q]));
  let loaded = [];
  const catSel = h('select', { class: 'input-full', 'aria-label': 'Category' });
  const subSel = h('select', { class: 'input-full', 'aria-label': 'Subject' });
  const chBox = h('div', { class: 'row-wrap' });
  const diffSel = h('select', { class: 'input-full', 'aria-label': 'Difficulty', onchange: () => { f.diff = diffSel.value; paintList(); } }, [['any', 'Any difficulty'], ['easy', 'Easy'], ['medium', 'Medium'], ['hard', 'Hard']].map(([v, l]) => h('option', { value: v }, l)));
  const tagSel = h('select', { class: 'input-full', 'aria-label': 'Tag', onchange: () => { f.tag = tagSel.value; paintList(); } });
  const search = h('input', { class: 'input-full', type: 'search', placeholder: 'Search question text', 'aria-label': 'Search question text' });
  search.addEventListener('input', debounce(() => { f.q = search.value.toLowerCase(); paintList(); }, 150));
  const list = h('div', { class: 'stack-sm' });
  const pullBtn = h('button', { class: 'btn btn-primary btn-block' });

  const paintCats = () => { mount(catSel, app.catalog.categories.map((c) => h('option', { value: c.id, selected: c.id === f.cat }, c.label))); };
  const paintSubs = () => {
    const c = app.catalog.categories.find((x) => x.id === f.cat);
    const subs = c.subjects;
    if (!subs.find((s) => s.id === f.sub)) f.sub = (subs.find((s) => s.chapters.some((ch) => ch.questionCount)) || subs[0]).id;
    mount(subSel, subs.map((s) => h('option', { value: s.id, selected: s.id === f.sub }, s.name)));
  };
  const paintChs = () => {
    const s = app.catalog.subjectById.get(f.sub);
    mount(chBox, s.chapters.map((ch) => h('button', { class: 'chip', disabled: !ch.questionCount, 'aria-pressed': String(f.chs.has(ch.id)), title: ch.title, onclick: () => { if (f.chs.has(ch.id)) f.chs.delete(ch.id); else f.chs.add(ch.id); paintChs(); loadSel(); } }, `Ch ${ch.number}`)));
  };
  async function loadSel() {
    const chs = [...f.chs].map((id) => app.catalog.chapterById.get(id));
    mount(list, h('p', { class: 'muted' }, chs.length ? 'Loading…' : 'Choose one or more chapters above.'));
    loaded = chs.length ? (await loadChapters(chs)).questions : [];
    const tags = [...new Set(loaded.flatMap((q) => q.tags || []))];
    mount(tagSel, h('option', { value: '' }, 'Any tag'), tags.map((t) => h('option', { value: t }, t)));
    paintList();
  }
  const band = (b) => (b < -0.5 ? 'easy' : b > 0.5 ? 'hard' : 'medium');
  function visible() {
    return loaded.filter((q) => (f.diff === 'any' || band(q.difficulty.b) === f.diff) && (!f.tag || (q.tags || []).includes(f.tag)) && (!f.q || q.stem.toLowerCase().includes(f.q)));
  }
  function paintList() {
    const vis = visible();
    mount(list,
      vis.length ? h('button', { class: 'btn btn-sm', onclick: () => { const all = vis.every((q) => picked.has(q.id)); vis.forEach((q) => (all ? picked.delete(q.id) : picked.set(q.id, q))); paintList(); } }, 'Tick / untick all shown') : null,
      ...vis.map((q) => {
        const cb = h('input', { type: 'checkbox', checked: picked.has(q.id), onchange: () => { if (cb.checked) picked.set(q.id, q); else picked.delete(q.id); paintPull(); } });
        return h('label', { class: 'list-row' }, cb, h('span', { class: 'grow' }, mathText('span', 'break', q.stem), h('span', { class: 'meta', style: { display: 'block' } }, `${q.id} · ${band(q.difficulty.b)}`)));
      }));
    paintPull();
  }
  const paintPull = () => { pullBtn.textContent = `Pull ${picked.size} question${picked.size === 1 ? '' : 's'} into battle`; pullBtn.disabled = !picked.size; };
  pullBtn.addEventListener('click', () => { app.flags.battleSet = [...picked.values()]; toast(`${picked.size} questions pulled into battle.`); go('/battle'); });
  catSel.addEventListener('change', () => { f.cat = catSel.value; f.chs.clear(); paintSubs(); paintChs(); loadSel(); });
  subSel.addEventListener('change', () => { f.sub = subSel.value; f.chs.clear(); paintChs(); loadSel(); });
  paintCats(); paintSubs(); paintChs(); paintPull();
  mount(list, h('p', { class: 'muted' }, 'Choose one or more chapters above.'));
  mount(view,
    h('div', { class: 'row mb-3' }, h('a', { class: 'icon-btn', href: '#/battle', 'aria-label': 'Back to battle' }, icon('back')), h('h1', { class: 'mt-0', style: { margin: 0 } }, 'Question library')),
    h('section', { class: 'card' }, h('div', { class: 'form-grid' }, catSel, subSel, h('div', null, h('div', { class: 'section-label mb-2' }, 'Chapters'), chBox), h('div', { class: 'grid-2' }, diffSel, tagSel), h('div', { class: 'search' }, icon('search'), search))),
    h('section', { class: 'card' }, list),
    h('div', { class: 'sticky-actions' }, pullBtn, picked.size ? h('button', { class: 'btn btn-ghost btn-block mt-2', onclick: () => { picked.clear(); app.flags.battleSet = []; paintList(); } }, 'Clear pulled set') : null));
}

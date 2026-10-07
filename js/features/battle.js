/**
 * Feature 10 / Section 10 — Battle Mode: Solo vs AI (Glicko-2 rated), Pass-and-play and Live
 * rooms with a 6-digit PIN (host-authoritative, pluggable transport).
 * @module features/battle
 */
import { h, mount, pct } from '../ui/dom.js';
import { icon } from '../ui/icons.js';
import { toast, confirmDialog } from '../ui/overlay.js';
import { app, saveUserNow } from '../state.js';
import { go } from '../router.js';
import { glicko2Update, eloExpected, AI_RATINGS } from '../engine/glicko2.js';
import { recordAttempt, finalizeSession, uid } from '../engine/learner.js';
import { mulberry32 } from '../engine/stats.js';
import { points, aiAnswer, playerOrder, leaderboard, battleCsv } from '../battle/game.js';
import { createTransport, makePin } from '../battle/transport.js';
import { mathText, whyPanel, labelMap, reviewItem } from './whyWrong.js';
import { battleSet } from './library.js';
import { rankChapters } from './insights.js';
import { questionsOfChapters } from './qsource.js';
import { pickTargeted } from './studyNow.js';
import { listLocalUsers, loadUser, saveUserNow as persistNow } from '../storage/userStore.js';
import { downloadBlob } from '../storage/exportImport.js';
import { sound, haptic } from '../utils/feedback.js';

const LIMIT_SEC = () => app.config.battle?.secondsPerQuestion || 30;
const BONUS = () => app.config.battle?.speedBonusMax ?? 50;

/** Questions for a battle: the pulled set, or 10 from the user's weakest active chapters. */
async function battleQuestions(n = 10) {
  const pulled = battleSet();
  if (pulled.length) return pulled.slice(0, 50);
  const ranked = rankChapters(app.user).slice(0, 6).map((r) => r.chapterId);
  const pool = await questionsOfChapters(ranked);
  return pickTargeted(pool, Math.min(n, pool.length));
}

/** Record one battle answer into a user document. */
function logAnswer(user, q, key, elapsedMs, sessionId) {
  const ch = q._chapter || app.catalog.chapterById.get(q.id.replace(/-\d{4}$/, ''));
  recordAttempt(user, { question: q, category: ch.category, subjectId: ch.subjectId, chapterId: ch.id, selected: key ?? null, timeMs: elapsedMs || LIMIT_SEC() * 1000, mode: 'battle', sessionId }, { config: app.config, incoming: app.prereq.incoming });
}

/** Ensure `_chapter` metadata on payload questions (joiners receive bare question objects). */
function withChapter(q) {
  if (q._chapter) return q;
  const chId = q.id.replace(/-\d{4}$/, '');
  const ch = app.catalog.chapterById.get(chId);
  return { ...q, _chapter: ch ? { id: ch.id, subjectId: ch.subjectId, category: ch.category, title: ch.title } : { id: chId, subjectId: chId.split('-')[0], category: 'unknown', title: chId } };
}

/**
 * Question + options with countdown.
 * @param {object} q @param {string[]} order
 * @param {{limitMs:number, onAnswer:(key:string|null, elapsedMs:number)=>void, header?:Node, startAt?:number}} o
 * @returns {{el:HTMLElement, stop:()=>void}}
 */
function roundView(q, order, o) {
  const lm = labelMap(order);
  const start = o.startAt || Date.now();
  let done = false;
  const clock = h('div', { class: 'rapid-clock', role: 'timer' }, String(Math.round(o.limitMs / 1000)));
  const answer = (k) => {
    if (done) return;
    done = true;
    clearInterval(timer);
    const el = Date.now() - start;
    btns.forEach((b) => { b.disabled = true; if (b.dataset.key === k) b.classList.add('selected'); });
    o.onAnswer(k, el);
  };
  const btns = order.map((k) => { const b = h('button', { class: 'option', type: 'button', dataset: { key: k }, onclick: () => answer(k) }, h('span', { class: 'option-label' }, lm[k]), mathText('span', 'option-text', q.options[k])); return b; });
  const timer = setInterval(() => {
    const left = Math.max(0, Math.ceil((o.limitMs - (Date.now() - start)) / 1000));
    clock.textContent = String(left);
    clock.classList.toggle('low', left <= 5);
    if (left <= 0) answer(null);
  }, 200);
  return { el: h('div', null, o.header || null, clock, mathText('div', 'question-text', q.stem), h('div', { class: 'options-grid' }, btns)), stop: () => { done = true; clearInterval(timer); } };
}

/** Leaderboard rows. */
function lbView(rows, meId) {
  return h('div', { class: 'leaderboard' }, rows.map((r) => h('div', { class: 'lb-row' + (r.id === meId ? ' me' : '') }, h('strong', null, '#' + r.rank), h('span', { class: 'ellipsis' }, r.name, r.warn ? ' ⚠️' : ''), h('strong', null, String(r.score)))));
}

/** Podium for the top three. */
function podium(rows) {
  const p = [rows[1], rows[0], rows[2]];
  return h('div', { class: 'podium', 'aria-label': 'Podium' }, p.map((r, i) => h('div', { class: ['p2', 'p1', 'p3'][i] }, r ? `${['🥈', '🥇', '🥉'][i]} ${r.name}\n${r.score}` : '')));
}

/** Option distribution bars. */
function distView(q, dist, order) {
  const lm = labelMap(order || Object.keys(q.options));
  const total = Object.values(dist).reduce((a, b) => a + b, 0) || 1;
  return h('div', { class: 'mt-3' }, (order || Object.keys(q.options)).map((k) => h('div', { class: 'dist-bar' }, h('strong', { class: k === q.answer ? 'text-success' : '' }, lm[k]), h('div', { class: 'progress ' + (k === q.answer ? 'green' : 'red') }, h('span', { style: { width: (100 * (dist[k] || 0)) / total + '%' } })), h('span', null, pct((dist[k] || 0) / total)))));
}

// ------------------------------------------------------------------ hub
/** @param {HTMLElement} view @param {object} _p @param {URLSearchParams} query */
export function renderBattle(view, _p, query) {
  const mode = query.get('mode');
  if (mode === 'solo') return soloGame(view, query.get('level') || 'medium');
  if (mode === 'pass') return passSetup(view);
  if (mode === 'host') return hostRoom(view, query.get('local') === '1');
  if (mode === 'join') return joinRoom(view, query.get('local') === '1');
  const g = app.user.rating.glicko;
  const pulled = battleSet();
  const live = app.config.battle?.live || {};
  const liveReady = live.provider && live.provider !== 'none';
  mount(view,
    h('h1', null, '⚔️ Battle'),
    h('section', { class: 'card' },
      h('div', { class: 'row between' }, h('div', null, h('div', { class: 'section-label' }, 'Your battle rating'), h('div', { class: 'subject-title' }, `${Math.round(g.r)} ± ${Math.round(g.rd)}`)), h('a', { class: 'btn btn-sm', href: '#/library' }, icon('library'), 'Question library')),
      h('p', { class: 'small muted mt-2' }, pulled.length ? `Using your pulled set of ${pulled.length} questions.` : 'No set pulled — battles use 10 questions from your weakest active chapters. Use the Question library to choose exact questions.')),
    h('section', { class: 'card' },
      h('h2', null, icon('robot', { size: 22 }), ' Solo vs AI'),
      h('p', { class: 'small muted' }, 'Fully offline. Your Glicko-2 rating updates after each battle.'),
      h('div', { class: 'grid-2' }, Object.entries(AI_RATINGS).map(([lvl, r]) => h('a', { class: 'tile', href: `#/battle?mode=solo&level=${lvl}` },
        h('span', { class: 'tile-title' }, lvl[0].toUpperCase() + lvl.slice(1)), h('span', { class: 'tile-sub' }, `Rating ${r} · your win chance ≈ ${pct(eloExpected(g.r, r))}`))))),
    h('section', { class: 'card' },
      h('h2', null, icon('users', { size: 22 }), ' Pass-and-play'),
      h('p', { class: 'small muted' }, '2–4 players on one device. Each player answers the same question in turn.'),
      h('a', { class: 'btn btn-block', href: '#/battle?mode=pass' }, 'Set up players')),
    h('section', { class: 'card' },
      h('h2', null, icon('wifi', { size: 22 }), ' Live room with PIN'),
      liveReady ? h('div', { class: 'grid-2' }, h('a', { class: 'btn btn-primary', href: '#/battle?mode=host' }, 'Host a room'), h('a', { class: 'btn', href: '#/battle?mode=join' }, 'Join with PIN')) : h('div', null,
        h('div', { class: 'callout' }, h('strong', null, 'Set up live mode: '), 'live rooms across different phones need a free real-time backend. Add a Firebase Realtime Database URL (or Supabase URL + anon key) in data/config.json → battle.live and set provider to "firebase" or "supabase". Step-by-step instructions are in README → Live battles.'),
        h('p', { class: 'small muted mt-3' }, 'Meanwhile you can try a live room on this device: open the app in two browser tabs, host in one and join in the other.'),
        h('div', { class: 'grid-2' }, h('a', { class: 'btn', href: '#/battle?mode=host&local=1' }, 'Host (this device)'), h('a', { class: 'btn', href: '#/battle?mode=join&local=1' }, 'Join (this device)')))));
}

// ------------------------------------------------------------------ solo
async function soloGame(view, level) {
  const rating = AI_RATINGS[level] || AI_RATINGS.medium;
  const qs = (await battleQuestions(10)).map(withChapter);
  if (!qs.length) { toast('No questions available.'); go('/battle'); return; }
  document.body.classList.add('immersive');
  const sessionId = uid('b');
  const rand = mulberry32(Date.now() & 0xffffffff);
  const limitMs = LIMIT_SEC() * 1000;
  const me = { name: app.user.profile.name.split(' ')[0], score: 0, correct: 0, answers: {} };
  const ai = { name: `AI (${level})`, score: 0, correct: 0, answers: {} };
  const card = h('section', { class: 'card' });
  mount(view, card);
  let i = 0;
  let current = null;
  const startedAt = new Date().toISOString();
  const header = () => h('div', { class: 'exam-header' }, h('span', { class: 'pill' }, `Q ${i + 1} / ${qs.length}`), h('div', { class: 'vs', style: { flex: 1 } }, h('span', null, `${me.name} ${me.score}`), h('span', null, 'vs'), h('span', null, `${ai.score} ${ai.name}`)),
    h('button', { class: 'icon-btn', 'aria-label': 'Quit battle', onclick: async () => { if (await confirmDialog('Quit battle?', 'Quitting counts as a loss for your rating.', { danger: true, ok: 'Quit' })) finish(true); } }, icon('close')));
  function next() {
    const q = qs[i];
    const order = playerOrder(q, app.user.profile.userId);
    const aiRes = aiAnswer(q, rating, limitMs, rand);
    current = roundView(q, order, { limitMs, header: header(), onAnswer: (key, el) => {
      const ok = key === q.answer;
      const pts = points(ok, el, limitMs, BONUS());
      me.score += pts; if (ok) me.correct++;
      me.answers[i] = { key, elapsedMs: el, points: pts };
      const aiOk = aiRes.key === q.answer;
      const aiPts = points(aiOk, aiRes.elapsedMs, limitMs, BONUS());
      ai.score += aiPts; if (aiOk) ai.correct++;
      ai.answers[i] = { key: aiRes.key, elapsedMs: aiRes.elapsedMs, points: aiPts };
      logAnswer(app.user, q, key, el, sessionId);
      if (ok) sound('correct'); else { sound('wrong'); haptic(80); }
      const lm = labelMap(order);
      mount(card, header(),
        h('div', { class: 'callout ' + (ok ? 'success' : 'danger') }, ok ? `✅ +${pts} points` : '❌ No points', ' · ', `AI ${aiOk ? 'was right' : 'was wrong'} (${(aiRes.elapsedMs / 1000).toFixed(1)} s)`),
        mathText('div', 'question-text mt-3', q.stem),
        h('div', { class: 'options-grid' }, order.map((k) => h('div', { class: 'option ' + (k === q.answer ? 'correct' : k === key ? 'wrong' : 'dim') }, h('span', { class: 'option-label' }, lm[k]), mathText('span', 'option-text', q.options[k])))),
        ok ? null : whyPanel(q, { selected: key, order, isCorrect: false }),
        h('button', { class: 'btn btn-primary btn-block mt-4', onclick: () => { i++; if (i < qs.length) next(); else finish(false); } }, i < qs.length - 1 ? 'Next question →' : 'See result'));
    } });
    mount(card, current.el);
  }
  async function finish(quit) {
    current?.stop();
    const score = quit ? 0 : me.score > ai.score ? 1 : me.score === ai.score ? 0.5 : 0;
    const before = app.user.rating.glicko;
    const after = glicko2Update(before, [{ r: rating, rd: 50, score }], app.config.battle?.glickoTau ?? 0.5);
    app.user.rating.glicko = after;
    app.user.rating.history.push({ ts: new Date().toISOString(), r: after.r, rd: after.rd, opponent: ai.name, result: score === 1 ? 'win' : score === 0.5 ? 'draw' : 'loss', score: me.score, opponentScore: ai.score });
    finalizeSession(app.user, { sessionId, mode: 'battle', startedAt, scope: { opponent: ai.name } }, { config: app.config });
    await saveUserNow();
    document.body.classList.remove('immersive');
    const answered = qs.map((q, k) => ({ q, order: playerOrder(q, app.user.profile.userId), selected: me.answers[k]?.key ?? null, isCorrect: me.answers[k]?.key === q.answer, index: k })).filter((_, k) => me.answers[k]);
    mount(view,
      h('section', { class: 'card center' },
        h('h1', null, score === 1 ? '🏆 You win!' : score === 0.5 ? '🤝 Draw' : '💪 Good fight'),
        h('div', { class: 'vs' }, h('div', null, h('div', { class: 'score' }, String(me.score)), me.name), h('strong', null, 'vs'), h('div', null, h('div', { class: 'score' }, String(ai.score)), ai.name)),
        h('p', { class: 'mt-3' }, `Rating ${Math.round(before.r)} → `, h('strong', null, String(Math.round(after.r))), ` (${after.r >= before.r ? '+' : ''}${Math.round(after.r - before.r)}) · RD ${Math.round(after.rd)}`),
        h('div', { class: 'grid-2 mt-4' }, h('a', { class: 'btn', href: '#/battle' }, 'Battle hub'), h('a', { class: 'btn btn-primary', href: `#/battle?mode=solo&level=${level}&r=${Date.now()}` }, 'Rematch'))),
      h('section', { class: 'card' }, h('h2', null, 'Post-battle review'), answered.map((r) => reviewItem(r.q, r))));
  }
  next();
  return () => { current?.stop(); document.body.classList.remove('immersive'); };
}

// ------------------------------------------------------------------ pass-and-play
async function passSetup(view) {
  const locals = await listLocalUsers();
  const rows = [];
  const list = h('div', { class: 'stack-sm' });
  const addRow = (preset) => {
    if (rows.length >= 4) return;
    const sel = h('select', { class: 'input-full', 'aria-label': 'Player ' + (rows.length + 1) }, h('option', { value: '' }, 'Guest'), locals.map((p) => h('option', { value: p.userId, selected: preset === p.userId }, p.name)));
    const name = h('input', { class: 'input-full', placeholder: 'Guest name', maxlength: 30, 'aria-label': 'Guest name' });
    const row = { sel, name };
    sel.addEventListener('change', () => { name.hidden = !!sel.value; });
    name.hidden = !!preset;
    rows.push(row);
    list.appendChild(h('div', { class: 'grid-2' }, sel, name));
  };
  addRow(app.user.profile.userId);
  addRow('');
  mount(view,
    h('h1', null, 'Pass-and-play'),
    h('section', { class: 'card' }, h('p', { class: 'small muted' }, 'Players with a local profile get the result saved to their own file. Guests are not saved.'), list,
      h('button', { class: 'btn btn-sm mt-3', onclick: () => addRow('') }, '+ Add player'),
      h('button', { class: 'btn btn-primary btn-block mt-4', onclick: async () => {
        const players = rows.map((r, k) => {
          const id = r.sel.value || 'guest-' + k;
          const nm = r.sel.value ? locals.find((p) => p.userId === r.sel.value).name.split(' ')[0] : (r.name.value.trim() || 'Player ' + (k + 1));
          return { id, name: nm, local: !!r.sel.value, score: 0, correct: 0, answers: {} };
        });
        if (new Set(players.map((p) => p.id)).size !== players.length) { toast('Each profile can play only once.'); return; }
        passGame(view, players);
      } }, icon('play'), 'Start')));
}

async function passGame(view, players) {
  const qs = (await battleQuestions(8)).map(withChapter);
  if (!qs.length) { toast('No questions available.'); return; }
  document.body.classList.add('immersive');
  const limitMs = LIMIT_SEC() * 1000;
  const sessionId = uid('p');
  const card = h('section', { class: 'card' });
  mount(view, card);
  let qi = 0;
  let pi = 0;
  let current = null;
  function handoff() {
    const p = players[pi];
    mount(card, h('div', { class: 'center' }, h('span', { class: 'pill' }, `Question ${qi + 1} / ${qs.length}`), h('h1', { class: 'mt-4' }, `Pass the phone to ${p.name}`), h('p', { class: 'muted' }, 'Others, please look away 🙈'), h('button', { class: 'btn btn-primary btn-block mt-4', onclick: play }, `I am ${p.name} — show question`)));
  }
  function play() {
    const p = players[pi];
    const q = qs[qi];
    const order = playerOrder(q, p.id);
    current = roundView(q, order, { limitMs, header: h('div', { class: 'exam-header' }, h('span', { class: 'pill' }, p.name), h('span', { class: 'small muted' }, `Q ${qi + 1}/${qs.length}`)), onAnswer: (key, el) => {
      const pts = points(key === q.answer, el, limitMs, BONUS());
      p.answers[qi] = { key, elapsedMs: el, points: pts };
      p.score += pts; if (key === q.answer) p.correct++;
      pi++;
      if (pi < players.length) handoff(); else reveal();
    } });
    mount(card, current.el);
  }
  function reveal() {
    const q = qs[qi];
    const dist = {};
    for (const p of players) { const k = p.answers[qi]?.key; if (k) dist[k] = (dist[k] || 0) + 1; }
    const fastest = players.filter((p) => p.answers[qi]?.key === q.answer).sort((a, b) => a.answers[qi].elapsedMs - b.answers[qi].elapsedMs)[0];
    mount(card, h('span', { class: 'pill' }, `Question ${qi + 1} results`),
      mathText('div', 'question-text mt-3', q.stem), h('div', { class: 'callout success' }, '✅ ', mathText('span', '', q.options[q.answer])),
      distView(q, dist), fastest ? h('p', { class: 'mt-3' }, '⚡ Fastest correct: ', h('strong', null, fastest.name)) : null,
      h('h3', { class: 'mt-4' }, 'Leaderboard'), lbView(leaderboard(Object.fromEntries(players.map((p) => [p.id, p])))),
      h('button', { class: 'btn btn-primary btn-block mt-4', onclick: () => { qi++; pi = 0; if (qi < qs.length) handoff(); else end(); } }, qi < qs.length - 1 ? 'Next question' : 'Final results'));
  }
  async function end() {
    document.body.classList.remove('immersive');
    for (const p of players.filter((x) => x.local)) {
      const u = p.id === app.user.profile.userId ? app.user : await loadUser(p.id);
      if (!u) continue;
      qs.forEach((q, k) => logAnswer(u, q, p.answers[k]?.key, p.answers[k]?.elapsedMs, sessionId));
      finalizeSession(u, { sessionId, mode: 'battle', startedAt: new Date().toISOString(), scope: { passAndPlay: true } }, { config: app.config });
      if (u === app.user) await saveUserNow(); else await persistNow(u);
    }
    const rows = leaderboard(Object.fromEntries(players.map((p) => [p.id, p])));
    mount(view, h('section', { class: 'card center' }, h('h1', null, '🏁 Final results'), podium(rows), lbView(rows),
      h('div', { class: 'grid-2 mt-4' }, h('button', { class: 'btn', onclick: () => downloadBlob(new Blob([battleCsv(qs, Object.fromEntries(players.map((p) => [p.id, p])))], { type: 'text/csv' }), 'battle-results.csv') }, icon('download'), 'CSV'), h('a', { class: 'btn btn-primary', href: '#/battle' }, 'Battle hub'))),
      h('section', { class: 'card' }, h('h2', null, 'Review'), qs.map((q, k) => reviewItem(q, { order: Object.keys(q.options), selected: players[0].answers[k]?.key ?? null, isCorrect: players[0].answers[k]?.key === q.answer, index: k }))));
  }
  handoff();
  return () => { current?.stop(); document.body.classList.remove('immersive'); };
}

// ------------------------------------------------------------------ live: host
async function hostRoom(view, forceLocal) {
  const transport = createTransport(app.config.battle?.live, forceLocal);
  if (!transport) { go('/battle', { replace: true }); return; }
  const pin = makePin();
  const players = {};
  const state = { phase: 'lobby', qi: -1, startedAt: 0, paused: false, pausedLeft: 0, qs: [], timer: null, limitMs: LIMIT_SEC() * 1000, dist: {} };
  const card = h('section', { class: 'card' });
  mount(view, h('h1', null, 'Host a live room'), card);
  const send = (m) => transport.send({ ...m, from: 'host', at: Date.now() }).catch(() => toast('Message failed — check your connection.'));
  try {
    await transport.open(pin, (m) => {
      if (!m || m.from === 'host') return;
      if (m.type === 'join' && state.phase === 'lobby' && !players[m.playerId]) { players[m.playerId] = { name: String(m.name || 'Player').slice(0, 24), score: 0, correct: 0, answers: {}, warn: false }; paint(); send({ type: 'lobby', players: Object.entries(players).map(([id, p]) => ({ id, name: p.name })) }); }
      if (m.type === 'answer' && state.phase === 'question' && m.index === state.qi && players[m.playerId] && !players[m.playerId].answers[m.index]) {
        const q = state.qs[state.qi];
        const el = Math.max(0, Date.now() - state.startedAt); // host timestamp
        const ok = m.key === q.answer;
        const pts = points(ok, el, state.limitMs, BONUS());
        const p = players[m.playerId];
        p.answers[m.index] = { key: m.key, elapsedMs: el, points: pts };
        p.score += pts; if (ok) p.correct++;
        if (m.key) state.dist[m.key] = (state.dist[m.key] || 0) + 1;
        paint();
        if (Object.values(players).every((x) => x.answers[state.qi])) reveal();
      }
      if (m.type === 'visibility' && players[m.playerId]) { players[m.playerId].warn = !!m.hidden; paint(); }
    });
  } catch (e) {
    mount(card, h('div', { class: 'callout danger' }, e.message), h('a', { class: 'btn mt-3', href: '#/battle' }, 'Back'));
    return;
  }
  state.qs = (await battleQuestions(10)).map((q) => { const { _chapter, ...rest } = q; return rest; });

  function startQuestion() {
    state.qi++;
    if (state.qi >= state.qs.length) { end(); return; }
    state.phase = 'question';
    state.dist = {};
    state.startedAt = Date.now();
    send({ type: 'question', index: state.qi, limitMs: state.limitMs });
    clearTimeout(state.timer);
    state.timer = setTimeout(reveal, state.limitMs + 500);
    paint();
  }
  function reveal() {
    if (state.phase !== 'question') return;
    clearTimeout(state.timer);
    state.phase = 'reveal';
    const q = state.qs[state.qi];
    const fastest = Object.entries(players).filter(([, p]) => p.answers[state.qi]?.key === q.answer).sort((a, b) => a[1].answers[state.qi].elapsedMs - b[1].answers[state.qi].elapsedMs)[0];
    send({ type: 'reveal', index: state.qi, answer: q.answer, dist: state.dist, leaderboard: leaderboard(players).map(({ id, name, score, rank, correct }) => ({ id, name, score, rank, correct })), fastest: fastest ? fastest[1].name : null, scores: Object.fromEntries(Object.entries(players).map(([id, p]) => [id, p.answers[state.qi] || null])) });
    paint();
  }
  function end() {
    state.phase = 'end';
    send({ type: 'end', leaderboard: leaderboard(players).map(({ id, name, score, rank, correct }) => ({ id, name, score, rank, correct })) });
    paint();
  }
  function paint() {
    const rows = leaderboard(players);
    if (state.phase === 'lobby') {
      mount(card, h('p', { class: 'center muted' }, `Room PIN (${transport.name === 'local' ? 'this device only' : transport.name})`), h('div', { class: 'pin' }, pin),
        h('p', { class: 'center small muted' }, `${state.qs.length} questions · ${LIMIT_SEC()} s each. Players open NeuroMCQ → Battle → Join with PIN.`),
        h('h3', { class: 'mt-4' }, `Players (${rows.length})`),
        rows.length ? h('div', { class: 'leaderboard' }, rows.map((r) => h('div', { class: 'lb-row' }, h('span', null, '👤'), h('span', null, r.name), h('button', { class: 'btn btn-sm', onclick: () => { delete players[r.id]; send({ type: 'kick', playerId: r.id }); paint(); } }, 'Kick')))) : h('p', { class: 'muted' }, 'Waiting for players…'),
        h('button', { class: 'btn btn-primary btn-block mt-4', disabled: !rows.length || !state.qs.length, onclick: () => { state.phase = 'started'; send({ type: 'start', questions: state.qs, limitMs: state.limitMs, total: state.qs.length }); setTimeout(startQuestion, 1200); } }, icon('play'), 'Start battle'));
      return;
    }
    const q = state.qs[Math.max(0, state.qi)];
    const answered = Object.values(players).filter((p) => p.answers[state.qi]).length;
    const controls = h('div', { class: 'row-wrap mt-3' },
      state.phase === 'question' ? h('button', { class: 'btn btn-sm', onclick: () => {
        if (!state.paused) { state.paused = true; state.pausedLeft = state.limitMs - (Date.now() - state.startedAt); clearTimeout(state.timer); send({ type: 'pause' }); }
        else { state.paused = false; state.startedAt = Date.now() - (state.limitMs - state.pausedLeft); state.timer = setTimeout(reveal, state.pausedLeft + 500); send({ type: 'resume', remainingMs: state.pausedLeft }); }
        paint();
      } }, icon(state.paused ? 'play' : 'pause'), state.paused ? 'Resume' : 'Pause') : null,
      state.phase === 'question' ? h('button', { class: 'btn btn-sm', onclick: reveal }, icon('skip'), 'Skip / reveal now') : null,
      state.phase === 'reveal' ? h('button', { class: 'btn btn-primary btn-sm', onclick: startQuestion }, state.qi < state.qs.length - 1 ? 'Next question' : 'Finish') : null,
      h('button', { class: 'btn btn-sm', onclick: () => downloadBlob(new Blob([battleCsv(state.qs, players)], { type: 'text/csv' }), `battle-${pin}.csv`) }, icon('download'), 'Export CSV'));
    mount(card,
      h('div', { class: 'exam-header' }, h('span', { class: 'pill' }, state.phase === 'end' ? 'Finished' : `Q ${state.qi + 1} / ${state.qs.length}`), h('span', { class: 'small' }, `PIN ${pin}`), h('span', { class: 'pill' }, `${answered}/${rows.length} answered`)),
      state.phase === 'end' ? [h('h2', { class: 'center' }, '🏁 Final standings'), podium(rows)] : [mathText('div', 'question-text', q.stem), state.phase === 'reveal' ? distView(q, state.dist) : h('p', { class: 'muted' }, state.paused ? '⏸ Paused' : 'Collecting answers…')],
      h('h3', { class: 'mt-4' }, 'Live leaderboard'), lbView(rows), rows.some((r) => r.warn) ? h('p', { class: 'small text-warning mt-2' }, '⚠️ = player switched away from the app during a question.') : null,
      controls);
  }
  paint();
  return () => { clearTimeout(state.timer); transport.close(); };
}

// ------------------------------------------------------------------ live: join
function joinRoom(view, forceLocal) {
  const transport = createTransport(app.config.battle?.live, forceLocal);
  if (!transport) { go('/battle', { replace: true }); return; }
  const playerId = app.user.profile.userId + '-' + Math.random().toString(36).slice(2, 6);
  const pinIn = h('input', { class: 'input-full', inputmode: 'numeric', maxlength: 6, placeholder: '6-digit PIN', 'aria-label': 'Room PIN', style: { fontSize: '1.6rem', textAlign: 'center', letterSpacing: '.3em' } });
  const nameIn = h('input', { class: 'input-full', maxlength: 24, value: app.user.profile.name.split(' ')[0], 'aria-label': 'Display name' });
  const card = h('section', { class: 'card' });
  const st = { qs: [], limitMs: 30000, mine: {}, current: null, sessionId: uid('l'), joined: false, recorded: false };
  const send = (m) => transport.send({ ...m, from: playerId, playerId }).catch(() => toast('Connection problem.'));
  const onVis = () => { if (st.current) send({ type: 'visibility', hidden: document.hidden }); if (document.hidden && st.current) toast('Stay in the app during questions — the host can see when you switch away.'); };

  function onMsg(m) {
    if (!m || m.from === playerId) return;
    if (m.type === 'lobby') { if (m.players.find((p) => p.id === playerId)) mount(card, h('div', { class: 'center' }, h('h2', null, '✅ You are in!'), h('p', { class: 'muted' }, `Waiting for the host to start… (${m.players.length} players)`))); }
    if (m.type === 'kick' && m.playerId === playerId) { st.current?.stop(); mount(card, h('div', { class: 'callout danger' }, 'The host removed you from this room.'), h('a', { class: 'btn mt-3', href: '#/battle' }, 'Back')); transport.close(); }
    if (m.type === 'start') { st.qs = (m.questions || []).map(withChapter); st.limitMs = m.limitMs || 30000; document.body.classList.add('immersive'); mount(card, h('h2', { class: 'center' }, 'Get ready…')); }
    if (m.type === 'question') {
      const q = st.qs[m.index];
      if (!q) return;
      const order = playerOrder(q, playerId);
      st.current?.stop();
      st.current = roundView(q, order, { limitMs: m.limitMs || st.limitMs, header: h('div', { class: 'exam-header' }, h('span', { class: 'pill' }, `Q ${m.index + 1} / ${st.qs.length}`), h('span', { class: 'small' }, 'Live')), onAnswer: (key, el) => {
        st.mine[m.index] = { key, el, order };
        send({ type: 'answer', index: m.index, key });
        mount(card, h('div', { class: 'center' }, h('h2', null, key ? 'Answer locked in 🔒' : '⏰ Time up'), h('p', { class: 'muted' }, 'Waiting for the others…')));
      } });
      mount(card, st.current.el);
    }
    if (m.type === 'pause') mount(card, h('div', { class: 'center' }, h('h2', null, '⏸ Paused by host')));
    if (m.type === 'reveal') {
      st.current?.stop();
      st.current = null;
      const q = st.qs[m.index];
      const mine = st.mine[m.index];
      const ok = mine?.key === m.answer;
      const myRow = (m.leaderboard || []).find((r) => r.id === playerId);
      mount(card, h('div', { class: 'callout ' + (ok ? 'success' : 'danger') }, ok ? `✅ Correct! +${m.scores?.[playerId]?.points ?? ''}` : '❌ Not this time'),
        mathText('div', 'question-text mt-3', q.stem), distView(q, m.dist || {}, mine?.order),
        !ok ? whyPanel(q, { selected: mine?.key ?? null, order: mine?.order || Object.keys(q.options), isCorrect: false, compact: true }) : null,
        m.fastest ? h('p', { class: 'mt-3' }, '⚡ Fastest correct: ', h('strong', null, m.fastest)) : null,
        h('h3', { class: 'mt-4' }, myRow ? `You are #${myRow.rank} with ${myRow.score} points` : 'Leaderboard'), lbView(m.leaderboard || [], playerId));
    }
    if (m.type === 'end') finish(m.leaderboard || []);
  }
  async function finish(rows) {
    document.body.classList.remove('immersive');
    if (!st.recorded) {
      st.recorded = true;
      st.qs.forEach((q, k) => { if (st.mine[k]) logAnswer(app.user, q, st.mine[k].key, st.mine[k].el, st.sessionId); });
      finalizeSession(app.user, { sessionId: st.sessionId, mode: 'battle', startedAt: new Date().toISOString(), scope: { live: true } }, { config: app.config });
      await saveUserNow();
    }
    mount(view, h('section', { class: 'card center' }, h('h1', null, '🏁 Battle over'), podium(rows), lbView(rows, playerId), h('a', { class: 'btn btn-primary btn-block mt-4', href: '#/battle' }, 'Battle hub')),
      h('section', { class: 'card' }, h('h2', null, 'Your review'), st.qs.map((q, k) => st.mine[k] ? reviewItem(q, { order: st.mine[k].order, selected: st.mine[k].key, isCorrect: st.mine[k].key === q.answer, index: k }) : null)));
    transport.close();
  }
  mount(view, h('h1', null, 'Join a live room'), card);
  mount(card, h('div', { class: 'form-grid' }, h('label', { class: 'field' }, h('span', null, 'Room PIN'), pinIn), h('label', { class: 'field' }, h('span', null, 'Your name'), nameIn)),
    h('button', { class: 'btn btn-primary btn-block', onclick: async () => {
      const pin = pinIn.value.replace(/\D/g, '');
      if (pin.length !== 6) { toast('Enter the 6-digit PIN.'); return; }
      try { await transport.open(pin, onMsg); } catch (e) { toast(e.message); return; }
      st.joined = true;
      send({ type: 'join', name: nameIn.value.trim() || 'Player' });
      mount(card, h('div', { class: 'center' }, h('h2', null, 'Joining room ' + pin + '…'), h('p', { class: 'muted' }, 'If nothing happens, check the PIN with your host.')));
    } }, 'Join'));
  document.addEventListener('visibilitychange', onVis);
  return () => { st.current?.stop(); document.removeEventListener('visibilitychange', onVis); document.body.classList.remove('immersive'); transport.close(); };
}

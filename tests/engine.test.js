/**
 * Self-contained browser test runner for the NeuroMCQ engine and question bank.
 * Open tests/engine.test.html from the deployed site (or any static server).
 */
import { bktUpdate, checkDag, incomingMap, propagateSuspicion } from '../js/engine/bkt.js';
import { glicko2Update, eloExpected } from '../js/engine/glicko2.js';
import { sm2Update, ladderUpdate, qualityFromResponse, dueQuestionIds } from '../js/engine/spacedRepetition.js';
import { ewmaSeries, trendLabel, overallMastery, skillScores } from '../js/engine/mastery.js';
import { pointBiserial, cttItem, contentFlags, findDuplicates } from '../js/engine/questionQuality.js';
import { mulberry32, betaSample, mean } from '../js/engine/stats.js';
import { simulateExam, betaPosterior } from '../js/engine/prediction.js';
import { p3pl, fisherInfo, eapEstimate, selectAdaptive } from '../js/engine/irt.js';
import { statusFromHealth, memoryHealth, retention, fuzzyMemberships } from '../js/engine/memoryMap.js';
import { forgettingRisk, survival, hazard } from '../js/engine/forgettingRisk.js';
import { classifyTime, itemBeta } from '../js/engine/responseTime.js';
import { classifyError, updateModel } from '../js/engine/errorClassifier.js';
import { chapterPriority, buildPlan } from '../js/engine/recommender.js';
import { parseLegacyFile, convertLegacy } from '../js/bank/legacyParser.js';
import { validateCatalog, validateChapterFile } from '../js/bank/bankValidator.js';
import { indexCatalog } from '../js/bank/catalogLoader.js';
import { migrate, validateUser, emptyUser } from '../js/storage/schema.js';
import { sha256Hex } from '../js/utils/crypto.js';
import { recordAttempt, finalizeSession } from '../js/engine/learner.js';
import { evalExpr, instantiate } from '../js/utils/template.js';
import { crc32 } from '../js/utils/zip.js';

const results = [];
let group = '';
const near = (a, b, tol = 1e-4) => Math.abs(a - b) <= tol;
function test(name, fn) {
  results.push({ group, name, fn });
}
function assert(cond, msg) { if (!cond) throw new Error(msg || 'assertion failed'); }
function eq(a, b, msg) { if (a !== b) throw new Error(`${msg || ''} expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`); }
function close(a, b, tol, msg) { if (!near(a, b, tol)) throw new Error(`${msg || ''} expected ≈${b}, got ${a}`); }

// ---------------------------------------------------------------- BKT
group = '9.3 Bayesian Knowledge Tracing';
test('correct response posterior and learning step', () => {
  const r = bktUpdate(0.3, true, { pT: 0.15, pS: 0.1, pG: 0.2 });
  close(r.posterior, 0.27 / 0.41, 1e-9, 'P(L|c)');
  close(r.next, 0.709756, 1e-5, "P(L')");
});
test('wrong response posterior and learning step', () => {
  const r = bktUpdate(0.3, false, { pT: 0.15, pS: 0.1, pG: 0.2 });
  close(r.posterior, 0.03 / 0.59, 1e-9, 'P(L|w)');
  close(r.next, 0.193220, 1e-5, "P(L')");
});
test('DAG check detects a cycle', () => {
  assert(checkDag([{ from: 'A', to: 'B' }, { from: 'B', to: 'C' }]).ok, 'acyclic graph should pass');
  const bad = checkDag([{ from: 'A', to: 'B' }, { from: 'B', to: 'C' }, { from: 'C', to: 'A' }]);
  assert(!bad.ok && bad.cycleNodes.length === 3, 'cycle must be reported');
});
test('backward propagation decays prerequisites by λ^depth × weight and finds root cause', () => {
  const inc = incomingMap([{ from: 'P', to: 'C', weight: 1 }, { from: 'G', to: 'P', weight: 1 }]);
  const st = { C: { bktPKnown: 0.2 }, P: { bktPKnown: 0.5 }, G: { bktPKnown: 0.21 } };
  const r = propagateSuspicion('C', inc, st, { lambda: 0.85 });
  close(r.state.P.bktPKnown, 0.5 * (1 - 0.15 * 0.85), 1e-9, 'depth 1');
  close(r.state.G.bktPKnown, 0.21 * (1 - 0.15 * 0.85 * 0.85), 1e-9, 'depth 2');
  eq(r.rootCause, 'G', 'root cause');
});

// ---------------------------------------------------------------- Glicko-2
group = '9.8 Glicko-2';
test("Glickman's worked example (r=1464.06, RD=151.52, σ=0.05999)", () => {
  const r = glicko2Update({ r: 1500, rd: 200, sigma: 0.06 }, [{ r: 1400, rd: 30, score: 1 }, { r: 1550, rd: 100, score: 0 }, { r: 1700, rd: 300, score: 0 }], 0.5);
  close(r.r, 1464.06, 0.01, 'rating');
  close(r.rd, 151.52, 0.01, 'RD');
  close(r.sigma, 0.05999, 0.00001, 'volatility');
});
test('no games: RD grows, rating unchanged', () => {
  const r = glicko2Update({ r: 1500, rd: 200, sigma: 0.06 }, []);
  eq(r.r, 1500);
  assert(r.rd > 200, 'RD should increase');
});
test('Elo expected score symmetry', () => {
  close(eloExpected(1500, 1500), 0.5, 1e-12);
  close(eloExpected(1900, 1500), 1 / (1 + Math.pow(10, -1)), 1e-12);
});

// ---------------------------------------------------------------- SM-2
group = '9.2 SM-2 scheduling & review ladder';
test('SM-2 sequence 5,5,5 then failure', () => {
  let s = sm2Update({}, 5, 0);
  eq(s.interval, 1); close(s.easiness, 2.6, 1e-9);
  s = sm2Update(s, 5, 0);
  eq(s.interval, 3); close(s.easiness, 2.7, 1e-9);
  s = sm2Update(s, 5, 0);
  eq(s.interval, 8); close(s.easiness, 2.8, 1e-9);
  s = sm2Update(s, 2, 0);
  eq(s.interval, 1); eq(s.reps, 0); eq(s.lapses, 1); close(s.easiness, 2.48, 1e-9);
});
test('EF never drops below 1.3', () => {
  let s = {};
  for (let i = 0; i < 20; i++) s = sm2Update(s, 0, 0);
  close(s.easiness, 1.3, 1e-9);
});
test('quality mapping', () => {
  eq(qualityFromResponse(true, 0.5, 3), 5);
  eq(qualityFromResponse(true, 2, 2), 3);
  eq(qualityFromResponse(false, 1, 3), 0);
});
test('ladder: wrong → 1 → 3 → 7 → 21 days → retired', () => {
  const D = 86400000;
  let s = ladderUpdate(undefined, true, 0);
  eq(s, undefined, 'first-time correct never scheduled');
  s = ladderUpdate(undefined, false, 0); eq(Date.parse(s.nextDue), 1 * D);
  s = ladderUpdate(s, true, 0); eq(Date.parse(s.nextDue), 3 * D);
  s = ladderUpdate(s, true, 0); eq(Date.parse(s.nextDue), 7 * D);
  s = ladderUpdate(s, true, 0); eq(Date.parse(s.nextDue), 21 * D);
  s = ladderUpdate(s, true, 0); assert(s.retired, 'retired');
  eq(dueQuestionIds({ q1: { nextDue: new Date(5).toISOString() }, q2: s }, 10).join(), 'q1');
});

// ---------------------------------------------------------------- Mastery & EWMA
group = '9.1 Mastery & EWMA';
test('EWMA with α = 0.3', () => {
  const s = ewmaSeries([50, 70, 90], 0.3);
  close(s[0], 50, 1e-12); close(s[1], 56, 1e-12); close(s[2], 66.2, 1e-12);
});
test('trend labels with ±1.5 threshold', () => {
  eq(trendLabel([10, 20, 30]).label, 'Improving');
  eq(trendLabel([30, 20, 10]).label, 'Declining');
  eq(trendLabel([50, 50.5, 51]).label, 'Stable');
});
test('mastery renormalises when numerical data are missing', () => {
  const m = overallMastery({ conceptual: 0.8, numerical: null, memory: 0.6, application: 0.7, speed: 0.5, accuracy: 0.7 });
  const w = { conceptual: 0.25, memory: 0.15, application: 0.2, speed: 0.1, accuracy: 0.1 };
  const exp = (0.25 * 0.8 + 0.15 * 0.6 + 0.2 * 0.7 + 0.1 * 0.5 + 0.1 * 0.7) / Object.values(w).reduce((a, b) => a + b, 0);
  close(m, exp, 1e-12);
});
test('recency weighting favours recent attempts', () => {
  const now = Date.parse('2026-01-31T00:00:00Z');
  const atts = [{ ts: '2025-11-01T00:00:00Z', isCorrect: false, qType: 'conceptual' }, { ts: '2026-01-30T00:00:00Z', isCorrect: true, qType: 'conceptual' }];
  assert(skillScores(atts, { now, halfLifeDays: 21 }).scores.conceptual > 0.9, 'recent correct dominates');
});

// ---------------------------------------------------------------- CTT
group = '9.9 Question quality (CTT)';
test('point-biserial on a toy set', () => {
  close(pointBiserial([1, 1, 0, 0], [4, 3, 2, 1]), 0.894427, 1e-5);
});
test('insufficient data below N = 30', () => {
  const r = cttItem({ answer: 'A', options: { A: '1', B: '2' } }, [{ selected: 'A', isCorrect: true, total: 3 }]);
  assert(r.flags.includes('insufficient-data'));
});
test('possibly-wrong key detection', () => {
  const resp = [];
  for (let i = 0; i < 40; i++) resp.push({ selected: i < 20 ? 'B' : 'A', isCorrect: i >= 20, total: i < 20 ? 9 : 2 });
  const r = cttItem({ answer: 'A', options: { A: 'x', B: 'y', C: 'z', D: 'w' } }, resp);
  assert(r.flags.includes('possibly-wrong-key') && r.suspectedKey === 'B', JSON.stringify(r.flags));
  assert(r.nonFunctioning.includes('C'), 'C is non-functioning');
});
test('placeholder, mismatch and duplicate checks', () => {
  assert(contentFlags({ stem: 'Sample Question for Chapter 1?', options: { A: 'Option A', B: 'Option B' } }, 'aptitude').includes('placeholder'));
  assert(contentFlags({ stem: 'The moment of inertia of a solid cylinder is', options: { A: 'x', B: 'y' }, explanation: { whyCorrect: 'k' } }, 'aptitude').includes('chapter-mismatch'));
  const d = findDuplicates([{ id: 'a', stem: 'What is the de Broglie wavelength of an electron of energy 100 eV?', options: {} }, { id: 'b', stem: 'What is the de Broglie wavelength of an electron of energy 100 eV ?', options: {} }, { id: 'c', stem: 'Completely different question text here about entropy', options: {} }]);
  eq(d.length, 1); eq(d[0].a + d[0].b, 'ab');
});

// ---------------------------------------------------------------- PRNG & Monte Carlo
group = '9.7 Score prediction';
test('seeded PRNG is deterministic', () => {
  const a = mulberry32(42); const b = mulberry32(42);
  for (let i = 0; i < 5; i++) eq(a(), b());
  close(mulberry32(42)(), 0.6011037519201636, 1e-15);
});
test('Beta sampler mean ≈ α/(α+β)', () => {
  const r = mulberry32(3);
  const xs = Array.from({ length: 20000 }, () => betaSample(3, 7, r));
  close(mean(xs), 0.3, 0.01);
});
test('Monte Carlo (seeded) is reproducible and centred', () => {
  const spec = { sections: [{ name: 'x', questionCount: 100, marksPerQuestion: 1, negativeMarking: 0, subjects: [{ subjectId: 'A', alpha: 50, beta: 50 }], bValues: [] }], sims: 5000, seed: 7 };
  const r1 = simulateExam(spec); const r2 = simulateExam(spec);
  eq(r1.median, r2.median, 'reproducible');
  close(r1.median, 50, 2);
  assert(r1.lo < r1.median && r1.median < r1.hi, '80% interval ordered');
});
test('Beta posterior with prior Beta(2,2)', () => {
  const now = Date.now();
  const p = betaPosterior([{ ts: new Date(now).toISOString(), isCorrect: true }], { now });
  close(p.alpha, 3, 1e-9); close(p.beta, 2, 1e-9);
});

// ---------------------------------------------------------------- IRT
group = '9.6 Item Response Theory';
test('3PL and Fisher information', () => {
  close(p3pl(0, { a: 1, b: 0, c: 0.25 }), 0.625, 1e-12);
  close(fisherInfo(0, { a: 1, b: 0, c: 0 }), 0.25, 1e-12);
});
test('EAP with no data equals the prior (θ≈0, SE≈1)', () => {
  const r = eapEstimate([]);
  close(r.theta, 0, 1e-9); close(r.se, 1, 0.01);
});
test('EAP moves up after correct answers on hard items', () => {
  const r = eapEstimate(Array.from({ length: 10 }, () => ({ a: 1.2, b: 1, c: 0.2, correct: true })));
  assert(r.theta > 0.8 && r.se < 1, JSON.stringify(r));
});
test('adaptive selection targets 0.70–0.80 success', () => {
  const items = [-3, -1, 0, 0.5, 2].map((b, i) => ({ id: 'i' + i, difficulty: { a: 1.5, b, c: 0.2 } }));
  const it = selectAdaptive(items, 0.8);
  const p = p3pl(0.8, it.difficulty);
  assert(p >= 0.6 && p <= 0.9, 'p=' + p);
});

// ---------------------------------------------------------------- Memory & forgetting
group = '9.2/9.5 Memory health, fuzzy status, forgetting risk';
test('fuzzy status cut points 0.85 / 0.60 / 0.40', () => {
  eq(statusFromHealth(0.9), 'green'); eq(statusFromHealth(0.85), 'green'); eq(statusFromHealth(0.84), 'yellow');
  eq(statusFromHealth(0.6), 'yellow'); eq(statusFromHealth(0.59), 'orange'); eq(statusFromHealth(0.4), 'orange'); eq(statusFromHealth(0.39), 'red');
  const m = fuzzyMemberships(0.62);
  assert(m.weak > 0 && m.revision > 0, 'overlap region has two memberships');
});
test('retention and memory health', () => {
  close(retention(2, 2), Math.exp(-1), 1e-12);
  close(memoryHealth(0.5, 0.5, 0.5), 0.25, 1e-12);
  close(memoryHealth(1, 1), 1, 1e-12);
});
test('Weibull k=1 survival and hazard', () => {
  close(survival(3, 3, 1), Math.exp(-1), 1e-12);
  close(hazard(5, 2, 1), 0.5, 1e-12);
  close(forgettingRisk({ stability: 2, lastReview: new Date(0).toISOString() }, 2 * 86400000), 1 - Math.exp(-1), 1e-9);
});

// ---------------------------------------------------------------- Response time & errors
group = '9.4/9.10 Response time & error classification';
test('speed deficit and rushing flags', () => {
  const beta = itemBeta({ type: 'conceptual', difficulty: { b: 0 } });
  close(Math.exp(beta), 45, 1e-9);
  assert(classifyTime(true, 45000 * 3.5, beta).speedDeficit);
  assert(classifyTime(false, 45000 * 0.1, beta).rushing);
  assert(!classifyTime(true, 45000, beta).speedDeficit);
});
test('distractor tag drives the Bayesian classifier; model is Laplace-updated', () => {
  const r = classifyError({}, { tag: 'sign-error' });
  eq(r.type, 'sign-error');
  close(Object.values(r.probs).reduce((a, b) => a + b, 0), 1, 1e-9);
  const m = updateModel({}, 'sign-error', 'sign-error');
  eq(m.counts['sign-error'], 1);
  eq(classifyError({}, { rushing: true, confidence: 1 }).type, 'guessing');
});

// ---------------------------------------------------------------- Recommender
group = '9.11 Study-now priority';
test('priority is the normalised weighted sum', () => {
  const r = chapterPriority({ health: 0, mistakeRecency: 0, examProximity: 0, importance: 0, dueNow: 0, forgettingRisk: 0 });
  close(r.priority, 0.3, 1e-12);
  const r2 = chapterPriority({ health: 1, mistakeRecency: 1, examProximity: 1, importance: 1, dueNow: 1, forgettingRisk: 1 });
  close(r2.priority, 0.7, 1e-12);
});
test('plan fills the time budget', () => {
  const plan = buildPlan({ minutes: 35, dueCount: 8, mistakeCount: 4, ranked: [{ chapterId: 'X-01', title: 'X', priority: 0.5, reasons: ['r'], available: 6 }] });
  const total = plan.reduce((s, b) => s + b.minutes, 0);
  eq(total, 35, 'minutes');
  assert(plan.some((b) => b.kind === 'targeted') && plan.some((b) => b.kind === 'review'));
});

// ---------------------------------------------------------------- Learner state & schema
group = 'Learner state, user schema & ids';
test('recordAttempt updates every model', () => {
  const u = emptyUser({ userId: 'test-user-0000-abcdef', name: 'T', phoneHash: 'x', phoneMasked: '98****0000' });
  const q = { id: 'QM1-01-0001', answer: 'B', type: 'numerical', difficulty: { a: 1, b: 0, c: 0.25 }, distractorTags: { A: 'sign-error' }, concept: 'photo' };
  const r = recordAttempt(u, { question: q, category: 'msc', subjectId: 'QM1', chapterId: 'QM1-01', selected: 'A', timeMs: 30000, mode: 'practice', sessionId: 's1' });
  eq(u.attempts.length, 1); eq(r.errorType, 'sign-error');
  assert(u.conceptState['QM1-01'] && u.conceptState['QM1-01#photo'], 'concept states');
  assert(u.questionState['QM1-01-0001'].box === 0, 'ladder');
  eq(u.mistakeBook.length, 1);
  finalizeSession(u, { sessionId: 's1', mode: 'practice', startedAt: new Date().toISOString(), scope: {} });
  eq(u.sessions.length, 1); eq(u.trend.ewma.length, 1);
  assert(validateUser(u).length === 0, validateUser(u).join());
});
test('export/import round-trip is lossless', () => {
  const u = emptyUser({ userId: 'abc-1234-ffffff', name: 'A', phoneHash: 'h', phoneMasked: '98****1234' });
  u.attempts.push({ questionId: 'X-01-0001', isCorrect: true, ts: '2026-01-01T00:00:00.000Z' });
  const back = migrate(JSON.parse(JSON.stringify(u)));
  eq(JSON.stringify(back), JSON.stringify(u));
});
test('v1 → v2 migration maps or parks records under UNMAPPED', () => {
  const v1 = { schemaVersion: 1, profile: { userId: 'old-0001-aaaaaa', name: 'Old' }, attempts: [{ questionId: 'q1', isCorrect: true, subject: 'qm', topic: 'box' }, { questionId: 'q2', isCorrect: false, subject: 'zz', topic: 'none' }] };
  const v2 = migrate(v1, (r) => (r.subject === 'qm' ? { category: 'msc', subjectId: 'QM1', chapterId: 'QM1-06' } : null));
  eq(v2.schemaVersion, 2); eq(v2.attempts[0].chapterId, 'QM1-06'); eq(v2.attempts[1].chapterId, 'UNMAPPED');
  assert(!('subject' in v2.attempts[0]), 'old fields removed');
});
test('SHA-256 and optional seed profiles', async () => {
  eq(await sha256Hex('abc'), 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  const response = await fetch('../data/users/index.json');
  if (response.status === 404) return;
  assert(response.ok, 'seed profile index request');
  const idx = await response.json();
  assert(Array.isArray(idx.users), 'seed profile index shape');
  for (const { userId } of idx.users) {
    const profile = await fetch(`../data/users/${userId}.json`);
    assert(profile.ok, 'seed profile request: ' + userId);
    eq(validateUser(await profile.json()).length, 0, userId);
  }
});

// ---------------------------------------------------------------- Utilities
group = 'Parametric templates & utilities';
test('safe expression evaluator (no eval)', () => {
  close(evalExpr('E-phi', { E: 4, phi: 2.9 }), 1.1, 1e-12);
  close(evalExpr('2^3^2'), 512, 1e-12);
  close(evalExpr('sqrt(16)+round(2.6)*-1'), 1, 1e-12);
  let threw = false; try { evalExpr('alert(1)'); } catch { threw = true; }
  assert(threw, 'unknown functions rejected');
});
test('template instantiation keeps options distinct and the key fixed', () => {
  const q = { id: 'X-01-0001', answer: 'B', options: { A: '{{E+phi}}', B: '{{E-phi}}', C: '{{phi}}', D: '{{E}}' }, stem: 'E={{E}}', explanation: { whyCorrect: '{{E-phi}}' }, template: { vars: { E: [3.5, 4, 4.5, 5], phi: [2.1, 2.3, 2.6, 2.9] }, decimals: 2 } };
  for (let i = 0; i < 30; i++) {
    const r = instantiate(q, mulberry32(i));
    eq(new Set(Object.values(r.options)).size, 4, 'distinct');
    close(Number(r.options.B), r._vars.E - r._vars.phi, 1e-9);
    eq(r.explanation.whyCorrect, r.options.B);
  }
});
test('CRC-32 for the ZIP writer', () => {
  eq(crc32(new TextEncoder().encode('The quick brown fox jumps over the lazy dog')), 0x414fa339);
});

// ---------------------------------------------------------------- Bank
group = 'Question bank & catalog';
let catalog = null;
test('catalog = Appendix A exactly (30 subjects, 450 chapters, same order & titles)', async () => {
  catalog = await (await fetch('../data/catalog.json')).json();
  const appendix = await (await fetch('./appendixA.json')).json();
  const v = validateCatalog(catalog);
  assert(v.ok, v.errors.join('; '));
  eq(v.subjects, 30, 'subjects'); eq(v.chapters, 450, 'chapters');
  const flat = catalog.categories.flatMap((c) => c.subjects.flatMap((s) => s.chapters.map((ch) => ({ id: ch.id, title: ch.title }))));
  eq(JSON.stringify(flat), JSON.stringify(appendix));
  eq(catalog.categories.map((c) => c.label).join('|'), 'Aptitude Tests|BSc Physics|MSc Physics');
  assert(catalog.categories[0].subjects.find((s) => s.id === 'RESEARCH').flags.includes('needsReview'));
});
test('every chapter file exists, validates, and question ids are unique & prefixed', async () => {
  const idx = indexCatalog(catalog);
  const allIds = new Set();
  let total = 0;
  const chs = idx.chapters;
  for (let i = 0; i < chs.length; i += 25) {
    await Promise.all(chs.slice(i, i + 25).map(async (ch) => {
      for (const f of ch.files) {
        const res = await fetch('../data/' + f);
        assert(res.ok, 'missing ' + f);
        const doc = await res.json();
        const r = validateChapterFile(doc, ch);
        eq(r.errors.length, 0, ch.id + ' ' + r.errors.join(';'));
        eq(r.questions.length, ch.questionCount, ch.id + ' questionCount');
        for (const q of r.questions) {
          assert(q.id.startsWith(ch.id + '-'), q.id);
          assert(!allIds.has(q.id), 'duplicate ' + q.id);
          allIds.add(q.id);
        }
        total += r.questions.length;
      }
    }));
  }
  assert(total >= 180, 'pilot bank has ' + total);
  for (const s of ['QM1', 'STAT']) for (const ch of idx.subjectById.get(s).chapters) assert(ch.questionCount >= 6, ch.id + ' needs ≥ 6');
});
test('prerequisites form a DAG over catalog chapters', async () => {
  const pr = await (await fetch('../data/prerequisites.json')).json();
  const idx = indexCatalog(catalog);
  for (const e of pr.edges) assert(idx.chapterById.has(e.from) && idx.chapterById.has(e.to), e.from + '→' + e.to);
  const d = checkDag(pr.edges);
  assert(d.ok, 'cycle: ' + d.cycleNodes.join(','));
});
test('legacy converter round-trips a sample and reports placeholders & mismatches', async () => {
  const idx = indexCatalog(catalog);
  const placeholderSrc = 'window.qm1Ch1 = [ { id: "QM11-01", subjectCode: "QM1", chapterCode: "QM1-01", question: "Sample Question for Chapter 1 in Quantum Mechanics - I? \\\\(\\\\text{Equation} = 1\\\\)", options: { A: "Option A", B: "Option B", C: "Option C", D: "Option D" }, correctAnswer: "A", explanation: "Sample explanation for Chapter 1." } ];';
  const good = `// comment\nwindow.x = [ { id: 'Q-1', subjectCode: "QM1", chapterCode: "QM1-02", question: "Uncertainty in \\\\( \\\\Delta x \\\\)?", options: { A: "a", B: 'b', C: "c", D: "d", }, correctAnswer: "C", explanation: "Because." }, ];`;
  const text = await (await fetch('../tools/legacy-samples/teachingapt_ch1.js')).text();
  const parsed = [...parseLegacyFile(placeholderSrc), ...parseLegacyFile(good), ...parseLegacyFile(text)];
  const items = parsed.flatMap((p) => p.items);
  const { files, report } = convertLegacy(items, idx);
  eq(report.placeholders.length, 1, 'placeholders');
  assert(report.mismatches.length >= 15, 'physics questions under TECH-01 must be reported: ' + report.mismatches.length);
  eq(files['QM1-02'].questions[0].stem, 'Uncertainty in \\( \\Delta x \\)?');
  eq(files['QM1-02'].questions[0].answer, 'C');
  eq(files['QM1-02'].questions[0].legacyId, 'Q-1');
  const v = validateChapterFile(JSON.parse(JSON.stringify(files['QM1-02'])), idx.chapterById.get('QM1-02'));
  eq(v.errors.length, 0, v.errors.join());
  const re = convertLegacy(items, idx, { reassign: { 'T1-01': 'MECH-03' } });
  assert(re.files['MECH-03'] && re.files['MECH-03'].questions.length === 1, 're-assign works');
});

// ---------------------------------------------------------------- run
async function run() {
  const out = document.getElementById('out');
  let pass = 0;
  let fail = 0;
  let current = '';
  for (const t of results) {
    if (t.group !== current) {
      current = t.group;
      const h = document.createElement('h2');
      h.textContent = current;
      out.appendChild(h);
    }
    const row = document.createElement('div');
    row.className = 'row';
    try {
      await t.fn();
      pass++;
      row.classList.add('ok');
      row.textContent = '✔ ' + t.name;
    } catch (e) {
      fail++;
      row.classList.add('bad');
      row.textContent = '✘ ' + t.name + ' — ' + e.message;
      t.error = e.message;
    }
    out.appendChild(row);
  }
  const sum = document.getElementById('summary');
  sum.textContent = `${pass} passed · ${fail} failed · ${results.length} total`;
  sum.className = fail ? 'bad' : 'ok';
  window.__TEST_RESULTS = { pass, fail, total: results.length, failures: results.filter((r) => r.error).map((r) => r.group + ' / ' + r.name + ': ' + r.error) };
}
run();

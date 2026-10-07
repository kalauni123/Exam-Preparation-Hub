# NeuroMCQ — Smart MCQ Practice PWA

NeuroMCQ is an installable, offline-first MCQ learning app for **TU Assistant Professor, NET, BSc Physics and MSc Physics** preparation. It covers **3 categories · 30 subjects · 450 chapters** (exactly the MCQ's-Portal catalog) and keeps one question file per chapter. On top of that it runs a learner model: spaced repetition, memory maps, a knowledge graph, IRT ability estimates, score prediction, Glicko-2 battles and more.

It is plain HTML, CSS and JavaScript (ES modules). There is **no build step and no server**, and it runs as-is on **GitHub Pages** and **Netlify**.

The look follows the owner's *MCQ's-Portal*: the Inter font, bold text, indigo `#4338ca`, a `#f3f4f6` background, 20 px cards, 10 px buttons and 12 px option rows, with the same mobile rules. A dark theme is available in Settings and from the header button.

---

## 1. Deploy in 5 minutes

The ZIP already contains everything: 450 chapter files, icons, the service worker, vendored KaTeX and Inter fonts. You don't need to move, rename or edit any file.

### Option A — Netlify (easiest)
1. Extract the ZIP.
2. Open <https://app.netlify.com/drop> and drag the **extracted folder** (the one containing `index.html`) onto the page.
3. Done. `netlify.toml` already sets `publish = "."`, the security headers, the CSP and the cache rules.
   *(If you connect a Git repository instead, leave the build command empty and set the publish directory to `.`.)*

### Option B — GitHub Pages
The project has more than 600 files. **GitHub's web uploader accepts only about 100 files per drag-and-drop**, so push with `git` (or GitHub Desktop):

```bash
# Create an empty repository on github.com, then in this folder:
git push -u origin main
```
The GitHub Actions workflow deploys the site to Pages whenever you push to `main`. It enables Pages for the repository on its first run. After the workflow succeeds, the site is live at `https://<your-user>.github.io/<repository>/`.

`.nojekyll` is included so GitHub serves every file unchanged. All paths are relative and routing uses the hash (`#/home`), so refreshing any screen never gives a 404, both under `/neuromcq/` and at a Netlify root. GitHub Pages hosts only the static site; Netlify Functions for optional server-side sync are not available there. Local profiles in `data/users/` are ignored by Git and are not published.

**GitHub Desktop alternative:** File → Add local repository → choose the folder → “create a repository” → Publish repository. Then wait for the Pages workflow to finish.

### Updating later
Edit or replace the files and push (or drag the folder to Netlify again). Installed apps show **“New version available — Refresh”**. If you change files and want the offline cache refreshed immediately, change any character of the `VERSION` string at the top of `sw.js`.

---

## 2. What's inside

```
/                      index.html  404.html  offline.html  privacy.html  manifest.webmanifest  sw.js
                       netlify.toml  _redirects  .nojekyll  ads.txt  robots.txt  README.md
css/                   tokens.css (all colours/spacing/radii/shadows)  base.css  components.css  screens.css
js/main.js             boot: loads ONLY config + catalog, registers lazy routes & the service worker
js/router.js state.js i18n.js main-helpers.js
js/storage/            db.js (IndexedDB + localStorage fallback) userStore.js schema.js exportImport.js syncAdapter.js
js/bank/               catalogLoader.js chapterLoader.js bankCache.js bankValidator.js legacyParser.js
js/engine/             mastery irt bkt spacedRepetition memoryMap responseTime glicko2 forgettingRisk
                       prediction(+worker) questionQuality errorClassifier recommender learningDNA learner stats
js/features/           one file per screen (home, practice, session, results, analytics, battle, …)
js/ui/                 dom.js (XSS-safe builder) icons.js overlay.js charts.js (hand-written SVG) math.js (KaTeX)
js/ads/adManager.js    js/battle/ transport.js game.js    js/utils/ crypto template feedback demoData zip
data/catalog.json      Category → Subject → Chapter (source of truth, 450 chapters)
data/questions/<category>/<SUBJECT>/<CHAPTER>.json   ← one file per chapter (450 files)
data/prerequisites.json examProfiles.json config.json i18n.json
data/users/               local profile files (git-ignored; not published)
tools/                 validate-bank.html  convert-legacy.html  catalog-stats.html  legacy-samples/
tests/engine.test.html 45 known-answer tests (engine + catalog + bank + converter)
vendor/                katex/ (formula rendering, local)  fonts/ (Inter, local)
netlify/functions/saveUser.js   optional GitHub sync (off by default)
assets/icons/          192, 512, maskable-512, apple-touch, shortcut icons, favicon.svg
```

### Features (all working offline once loaded)
- **Profiles:** register with full name and Nepali mobile number (98/97 + 8 digits). After registration the number is shown masked and stored as a SHA-256 hash. Supports several profiles per device, phone login, and profile import/export.
- **Practice:** category tabs, then a searchable subject grid, then a chapter list with multi-select. Choose Adaptive / Easy / Medium / Hard, the number of questions, and timed or untimed. Question order and option order are randomised, and **parametric numbers** come from the `template` field (see `QM1-01-0001`).
- **“Why did I get it wrong?”** shows your answer ❌ and the correct answer ✅, why the correct answer is right, why each wrong option is wrong, the concept tested, the trap used, how the question could be modified, how to avoid the mistake, and the classified error type. It also offers **Add note** and **Retry a similar question**.
- **Timed test mode** works like the portal: previous/next, a question palette, Submit, negative marking (+1 / −0.2 in `config.json`) and full review.
- **Spaced repetition:** a wrong answer comes back after 1 day, then 3, 7 and 21 days, then fades out. The **Due today** queue covers all subjects and can be filtered by subject.
- **Dashboard (Simple/Pro):** mastery ring, six skill bars with ⓘ, radar, EWMA trend with Improving/Stable/Declining, streak and heat-map, predicted score range with readiness, memory summary, today's plan. Drill-down goes **Category → Subject → Chapter → Concept** with confidence levels. Pro view adds IRT θ±SE, Glicko rating, fuzzy memberships and error types.
- **Memory Strength Map** 🟢🟡🟠🔴, **Syllabus Progress Map** (all 450 chapters, collapsed and lazily rendered), **Knowledge Graph per subject** with ghost prerequisites and root-cause highlighting.
- **🎯 Study now:** a timed plan for the minutes you have (review → targeted MCQs → mistakes → rapid-fire), with one-tap start per block and the top reasons explained.
- **60-second Rapid-Fire** with haptics, sound, and a rewarded bonus round.
- **Mistake Notebook:** group by category, subject, chapter, concept, error type, date or repeat count. Search, retry, notes, and **PDF** export through the print stylesheet.
- **Smart bookmarks** with reasons (difficult, needs revision, important, frequently confused, formula, examiner trap) and filtered practice.
- **Learning DNA** card (shareable), **Question Analytics** per question, and the **Question Quality Engine** (admin).
- **Battle:** Solo vs AI (Easy 1100 / Medium 1400 / Hard 1700 / Elite 2000, Glicko-2 rated), Pass-and-play for 2–4 players, and Live rooms with a 6-digit PIN. The **Question Library** lets you pull a chosen set into a battle.
- **Settings:** theme, sound, haptics, reduced motion, **English / नेपाली** interface, active subjects, exam target and date, offline downloads manager with total size, export / import / delete, backup reminder (every 7 days), optional sync, and **Load demo data**.

---

## 3. Adding questions (no code changes)

1. Open the chapter file, e.g. `data/questions/aptitude/TECH/TECH-01.json` (every chapter already has a valid empty file).
2. Add questions in this schema:

```json
{
  "schemaVersion": 1, "chapterId": "TECH-01", "subjectId": "TECH", "category": "aptitude",
  "questions": [
    {
      "id": "TECH-01-0001",
      "concept": "levels-of-teaching",
      "type": "conceptual",
      "difficulty": { "a": 1.0, "b": 0.0, "c": 0.25 },
      "stem": "Question text. Maths allowed: \\( E = mc^2 \\) or \\[ \\int_0^1 x\\,dx \\]",
      "options": { "A": "…", "B": "…", "C": "…", "D": "…" },
      "answer": "B",
      "explanation": {
        "whyCorrect": "…", "whyWrong": { "A": "…", "C": "…", "D": "…" },
        "conceptTested": "…", "trapUsed": "…", "howToModify": "…", "howToAvoid": "…"
      },
      "distractorTags": { "A": "definition-confusion", "C": "factual-recall", "D": "similar-term-confusion" },
      "template": null, "tags": ["tu-assistant-professor"], "source": "…",
      "legacyId": null, "needsReview": false
    }
  ]
}
```
Rules:
- The id is `<CHAPTER_ID>-<4 digits>`. **Never renumber or reuse an id**, because learner history depends on it.
- `answer` must be one of the option keys. Questions can have 2–5 options.
- `type` may be omitted and defaults to `conceptual`.
- Distractor tags are `sign-error`, `formula-confusion`, `unit-error`, `concept-confusion`, `careless`, `guessing`, and for aptitude also `factual-recall`, `definition-confusion`, `date-number-mixup`, `similar-term-confusion`.
- If one optional field is empty, only that section of the explanation is hidden.
- Big chapters can be split: list several files in the catalog's `files` array (`TECH-01.json`, `TECH-01.p2.json`).

3. Open **`tools/validate-bank.html`** on your site (Profile → Owner tools) and press **Validate**. It checks every file and lets you **download an updated `catalog.json` with `questionCount` filled in**. Replace `data/catalog.json` with it.
4. **Bump that chapter's `"version"`** in `catalog.json` (e.g. 1 → 2) so phones that already cached the chapter download the new one.
5. Push or redeploy.

Chapters with 0 questions are shown greyed with “No questions yet” and are excluded from practice.

**Parametric questions:** set `"template": {"vars": {"E": [3.5, 4, 4.5], "phi": [2.1, 2.3]}, "decimals": 2}` and write `{{E}}`, `{{E-phi}}` and so on in the stem, options and explanations. The expressions are evaluated by a small safe parser that supports + − × ÷ ^ (), sqrt, sin, cos, tan, exp, log, ln, abs, round, pi and e. Nothing is passed to `eval`.

### Starter bank
- **180 original pilot questions:** Quantum Mechanics - I (`QM1`) and Statistical Mechanics (`STAT`), 6 per chapter, each with full explanations and distractor tags. They are marked `"source": "AI-generated, verify before publishing"`, so please have a subject expert review them before relying on them.
- The other 420 chapter files are valid empty skeletons.

### Converting the old portal files — `tools/convert-legacy.html`
Pick the old `database/*.js` files. They are parsed with a hand-written parser and never executed.
- Placeholders (“Sample Question…”, “Option A”) are skipped and listed.
- Content that doesn't match its chapter is reported, and you choose **Skip** or **re-assign** it to a chapter.
- You can download each chapter file or **all of them as a ZIP**.
- Imported questions get ids `…-9001` upward and `needsReview: true`.

Try it with **“bundled sample files”**: `tools/legacy-samples/teachingapt_ch1.js` contains 21 mechanics questions filed under `TECH-01`, and all 21 are reported as mismatches.

> **Data-quality notes kept from the portal:**
> (1) *Research Aptitude* (`RESEARCH`) has Teaching Aptitude's chapter titles. They are kept verbatim and flagged `needsReview` (one JSON edit in the catalog fixes it).
> (2) `researchapt_ch1.js` and `teachingapt_ch1.js` contain physics questions, so they were **not** imported into aptitude chapters. Use the converter to re-assign them.
> (3) The other legacy files are placeholders, so those chapters count as empty.
> (4) Overlapping subjects (MATH/MATH1, MECH/CM, QM1-15/QM2-01, the relativity chapters) stay separate. The Quality Engine's cross-chapter duplicate check flags accidental copies.

---

## 4. Owner-editable data files

| File | Purpose |
|---|---|
| `data/catalog.json` | 3 categories → 30 subjects → 450 chapters. Titles verbatim from the portal. `flags`, `questionCount`, `version` and `files` per chapter. |
| `data/examProfiles.json` | **“TU Assistant Professor”** and **“NET Physics”** blueprints. All numbers (`questionCount`, `marksPerQuestion`, `negativeMarking`, `durationMinutes`) are deliberately `null`: fill them from the official notice. Until then, score prediction shows a clearly labelled generic estimate. `importance` (0–1) feeds “Study now”. |
| `data/prerequisites.json` | 88 starter chapter→chapter edges for the physics subjects, marked `proposedByAI: true` for your review. The app checks it is a DAG at start-up; if you introduce a cycle, the links are ignored and a message names the chapters. |
| `data/config.json` | Mastery weights, EWMA, BKT, SM-2, forgetting threshold, IRT target band, Monte Carlo runs, study-now weights, marks, battle timing, phone rule (`nepalPhoneOnly`), sync, ads and feature flags. |
| `data/i18n.json` | English and Nepali interface strings (navigation, home, practice, welcome). Add keys to translate more. |

---

## 5. User data model (one file per user)

Every profile is a single JSON document. It lives in IndexedDB under `neuromcq:user:<userId>`, falling back to localStorage. **Download my data** exports a portable JSON backup. Local profile files placed in `data/users/` are git-ignored and are not included in the public repository.

- `userId = slug(name)-<last 4 digits>-<first 6 hex of SHA-256(phone)>`.
- Public deployments do not include seed profiles. Users create local profiles or import a backup.

Schema v2 (see `js/storage/schema.js`):
```
schemaVersion: 2
profile        userId, name, phoneHash, phoneMasked, createdAt, examTarget, examDate, dailyMinutes, activeSubjects[]
attempts[]     attemptId, ts, sessionId, mode, questionId, category, subjectId, chapterId, concept,
               selected, correct, isCorrect, timeMs, confidence, changedAnswer, bookmarked,
               qType, b, beta, z, errorType          (extra fields used by the engine)
sessions[]     sessionId, mode, startedAt, endedAt, score, total, scope{category, subjectId, chapterIds}
conceptState   {"<chapterId>" | "<chapterId>#<concept>": bktPKnown, stability, easiness, interval, reps, lapses,
                lastReview, nextReview, memoryHealth, status, rootCause?}
questionState  {"<questionId>": box, nextDue, history[], retired}
abilities      theta, se, bySubject{}, bySkill{}, tau
skills         conceptual, numerical, memory, application, speed, accuracy
trend          ewma[{ts, value, raw, sessionId}], raw[]
rating         glicko{r, rd, sigma}, history[]
mistakeBook[]  questionId, chapterId, subjectId, category, concept, date, errorType, repeatCount, note, resolved
bookmarks[]    questionId, reasons[], date
dna, errorModel, notes, settings, meta{lastBackupAt, updatedAt, rapidBonus, sessionsSinceAd}
```
`migrate()` upgrades v1 documents (`subject/topic/concept`) to v2. Records it cannot map are parked under `chapterId: "UNMAPPED"`. Imported files are validated before use.

### Three storage layers
- **A — Local (default):** IndexedDB per profile. Works everywhere, including offline.
- **B — File export/import:** Settings → Download my data / Import data. A reminder appears after 7 days without a backup.
- **C — Optional automatic sync (off by default):** see §6.

> **Privacy:** GitHub Pages and Netlify **cannot write files from the browser**, which is why Layer C needs a function or a database.
> A SHA-256 of a 10-digit phone number can be brute-forced, so keep synced user files in a **private** repository or database.
> Public deployments do not include shared user profiles. If you add any, do not publish personal profile data. If learners may be minors, obtain guardian consent. Fill in `privacy.html` before going public.

---

## 6. Optional sync (Layer C)

**Netlify Function → GitHub** (`netlify/functions/saveUser.js`):
1. Create a fine-grained GitHub token with **Contents: Read and write** on one (preferably private) data repository.
2. In Netlify go to **Site configuration → Environment variables** and add `GITHUB_TOKEN`, `GITHUB_REPO` (`owner/repo`), `GITHUB_BRANCH` (`main`) and `SYNC_PIN` (a shared secret).
3. In `data/config.json`, set `"sync": { "enabled": true, "provider": "netlify", … }` and redeploy.
4. Settings → **Sync now** asks for the PIN and commits `data/users/<userId>.json`.

The function enforces the PIN, a rate limit, schema checks, a 1 MB size limit, and refuses unmasked phone numbers. **The token never reaches the browser.**

**Firebase / Supabase:** set `provider` to `firebase` (`sync.firebase.databaseURL`) or `supabase` (`url`, `anonKey`, table `neuromcq_users(user_id text primary key, doc jsonb)`). Both use the same `push/pull` interface. Protect them with database rules or row-level security.

---

## 7. Live battles (PIN rooms)

Solo vs AI and Pass-and-play need no setup. Live rooms across different phones need a free real-time backend. In `data/config.json → battle.live`:

- **Firebase Realtime Database (recommended):**
  1. Create a project and a Realtime Database.
  2. Put its URL in `battle.live.firebase.databaseURL` and set `"provider": "firebase"`.
  3. Example rules:
     `{"rules":{"neuromcq_rooms":{"$pin":{".read":true,"events":{"$e":{".write":"!data.exists()"}}}}}}`
     Delete old rooms occasionally.
- **Supabase:**
  ```sql
  create table neuromcq_events (id bigserial primary key, room text not null, payload jsonb not null, created_at timestamptz default now());
  alter table neuromcq_events enable row level security;
  create policy "rooms read" on neuromcq_events for select using (true);
  create policy "rooms insert" on neuromcq_events for insert with check (true);
  ```
  Set `"provider": "supabase"`, `url` and `anonKey`. The adapter polls every second.
- **Without a backend:** “Host (this device)” and “Join (this device)” use `BroadcastChannel`. Open the app in two tabs to try the full flow.

The host is authoritative: scores use host timestamps (100 points + up to 50 speed bonus), each player sees their own option shuffle, and switching away from the tab raises a warning on the host screen. The host can pause, skip, kick and export CSV. Each player's answers are saved to their own user file, and players get a post-battle review with the explanation panel.

> The prompt also lists WebRTC peer-to-peer as an option. It was not built, because it still needs a signalling server; the Firebase and Supabase adapters fill that role.

---

## 8. Ads (AdSense + AdMob)

`js/ads/adManager.js` exposes `showBanner(slot)`, `showInterstitial(trigger)` and `showRewarded(reward)`. **Ads are disabled by default** (`ads.enabled: false`).

- **Web (AdSense):**
  1. Get approved.
  2. Set `ads.enabled: true`, `adsenseClient: "ca-pub-…"` and the slot ids.
  3. Edit `ads.txt` (remove the `#` and insert your publisher id).

  While the placeholder `ca-pub-XXXXXXXXXXXXXXXX` is present, or ads are blocked, slots stay empty with no layout jump.
- **Android (AdMob):** used automatically when the app runs inside Capacitor with `@capacitor-community/admob`. **AdMob does not work in a plain browser or PWA.**
- **Policy-safe by design:**
  - Never during a question, timed test, battle or rapid-fire.
  - Banners only on the dashboard and results pages, never next to the navigation.
  - Interstitials at most once every 3 sessions and never in the first 2 minutes.
  - Rewarded ads unlock a bonus Rapid-Fire round, an extra hint, or an extra report.
  - A consent banner (UMP/GDPR-style) appears when ads are enabled. `privacy.html` is a template to complete.

---

## 9. The maths engine (Section 9) — where each model lives

| Model | File | Formula |
|---|---|---|
| Mastery & EWMA | `engine/mastery.js` | `M = Σ wᵢ·Scoreᵢ` (weights renormalised when a skill has no data); `S_t = 0.3·Y_t + 0.7·S_{t−1}`; least-squares slope, ±1.5 %-points → Improving/Stable/Declining |
| Memory health & fuzzy status | `engine/memoryMap.js` | `R = e^{−t/S}`, `H = R^{2w}·K^{2(1−w)}` (= R·K at w=½, default w=0.6); trapezoids around 0.40 / 0.60 / 0.85 |
| SM-2 & ladder | `engine/spacedRepetition.js` | `EF' = EF + 0.1 − (5−q)(0.08 + 0.02(5−q))`, EF ≥ 1.3, intervals 1, 3, I·EF; question ladder 1→3→7→21 d |
| BKT + propagation | `engine/bkt.js` | standard posterior + learn step (P(L0)=0.3, T=0.15, S=0.1, G=0.2); after ≥3 failures in 5, prerequisites decay by `(1−λ)·λ^d·w`, λ=0.85; DAG check |
| Response time | `engine/responseTime.js` | `ln T ~ N(β_j − τ_i, σ²)`; speed deficit if correct and >3× expected; rushing if wrong and <¼ expected |
| Forgetting risk | `engine/forgettingRisk.js` | Weibull `h(t) = (k/S)(t/S)^{k−1}`, risk `= 1 − e^{−(t/S)^k}`, alert at ≥ 0.5 |
| IRT | `engine/irt.js` | 3PL, Fisher information, EAP on an 81-point grid in −4..4 with an N(0,1) prior; adaptive pick targets 70–80 % success |
| Score prediction | `engine/prediction.js` + worker | Beta(2,2) prior, recency-weighted counts, ≥ 5,000 seeded Monte Carlo runs over the exam blueprint (negative marking, bank difficulty), median + 80 % interval |
| Glicko-2 | `engine/glicko2.js` | full algorithm with the Illinois σ solver, τ = 0.5; reproduces Glickman's example (1464.06 / 151.52 / 0.05999) |
| CTT quality | `engine/questionQuality.js` | p, point-biserial (rest score), non-functioning distractors (<5 %), wrong-key check on the top 27 %, N ≥ 30 |
| Error classifier | `engine/errorClassifier.js` | Laplace-smoothed count-based Bayes per learner + distractor tag, timing and confidence evidence |
| Study now | `engine/recommender.js` | `priority = Σ wᵢ·featureᵢ` (normalised), greedy fill of the time budget, top-3 reasons |

---

## 10. Testing

- **`tests/engine.test.html`** runs 45 known-answer tests in the browser: BKT posteriors, Glickman's Glicko-2 example, SM-2 sequences, the review ladder, EWMA and trend, the point-biserial toy set, the seeded PRNG and Monte Carlo, IRT, fuzzy cut points, the Weibull model, error classification, the planner, schema migration and export round-trip, SHA-256 and optional seed-profile validation, **catalog = Appendix A exactly**, all 450 files present and valid, unique prefixed question ids, the prerequisite DAG, the legacy converter round-trip, templates and the ZIP CRC.
- **Load demo data** (Settings) adds about 60 days of simulated answers in QM1 and STAT to the current profile, so every dashboard can be previewed.

**Manual QA checklist:**
- Screen widths 320, 360 and 412 px, plus landscape, with no horizontal scroll.
- Install from Android Chrome (⋮ → Install app).
- Airplane mode after the first visit: the app and any opened or downloaded chapters still work.
- Slow 3G (DevTools), dark and light themes, reduced motion.
- TalkBack: every chart has a text summary or aria-label.
- The practice picker stays smooth with all 450 chapters (only the selected category's subjects and 15 chapters are ever rendered; search shows at most 30 hits).

---

## 11. Android app (APK/AAB)

**A. Trusted Web Activity (simplest):**
```bash
npm i -g @bubblewrap/cli
bubblewrap init --manifest https://<your-site>/manifest.webmanifest
bubblewrap build          # produces app-release-signed.apk and .aab
```
Then publish `/.well-known/assetlinks.json` on the site with the SHA-256 fingerprint that Bubblewrap prints, so the address bar disappears. On GitHub Pages project sites, `.well-known` must be at the domain root, so use a custom domain or Netlify.

**B. Capacitor (needed for AdMob, native notifications and widgets):**
```bash
npm init -y && npm i @capacitor/core @capacitor/cli @capacitor/android @capacitor-community/admob @capacitor/splash-screen
npx cap init NeuroMCQ com.yourname.neuromcq --web-dir=.
npx cap add android
npx cap sync
npx cap open android      # Android Studio → Build → Generate Signed Bundle (AAB)
```
Add your AdMob app id to `AndroidManifest.xml` and the ad unit ids to `config.json → ads.admob`. **True home-screen widgets and background push notifications need this wrapper.** The PWA can only show local notifications while the app is opened (Settings → Enable study reminders) and offers manifest shortcuts (Due now, Rapid-fire, Study now).

---

## 12. Honest notes and limitations

- **Design:** the reference portal's light indigo style is the default. The prompt's “dark-first, neon/glass” direction was traded for fidelity to MCQ's-Portal, as you asked. The dark theme is a tonal mirror of the same palette.
- **Lighthouse:** Lighthouse was not available in the build environment, so the ≥ 90 scores are not measured. What *was* measured, on a cold load with slow-4G throttling and 4× CPU slowdown:
  - First contentful paint about 0.9 s.
  - About 34 requests at start-up, **with zero chapter files**. Screens are lazy-loaded modules and fonts and KaTeX are local.

  Run Lighthouse in Chrome DevTools after deploying.
- **Nepali:** the navigation and main headings are translated; deeper screens are still in English (add keys to `data/i18n.json`).
- **Pilot questions** are AI-written. Verify them before publishing, and remove `needsReview` from converted legacy questions after checking.
- **Exam blueprints** are intentionally empty. No official marking scheme was invented.
- **Live battles** need Firebase or Supabase for cross-device play.
- **Ads:** AdSense on the web has no rewarded format, so web rewards are granted directly when ads are enabled and consented.

### Suggestions (not applied to the catalog)
- Replace `RESEARCH`'s 15 titles with real research-methodology chapters (e.g. Meaning and types of research, Research ethics, Sampling, Hypothesis, Data analysis, Thesis writing).
- Consider tagging cross-listed chapters (MATH ↔ MATH1, CM ↔ CM_MSC) so one question pool can feed both.

---

## 13. Credits & licences
- KaTeX (MIT) — `vendor/katex/LICENSE`.
- Inter font (SIL OFL 1.1) — `vendor/fonts/LICENSE-Inter.txt`.
- Everything else was written for this project.

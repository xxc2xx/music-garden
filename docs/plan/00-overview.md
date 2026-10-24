# Music Garden V2 — approved plan (2026-10-24)

> Source of record for the V2 work. Status per PR is tracked at the bottom.


## Context

The parent pasted an external product/code review plus a "master plan" prompt (plan-only audit → Music Garden V2). Since that review was written, Garden moved to its own repo (`~/music-garden`, public, staging at xxc2xx.github.io/music-garden/staging/) and its home already leads with Play today plus a grown-ups gate.

The review's main thesis matches the code: **Garden is the child product, Pitch Trainer is the engine and the grown-ups' toolbox.** What's missing:
- reliability: every screen should clean up the same way;
- one practice log a parent can read;
- one guided daily session, Hear → Sing → Find → Play → Read → Reward, including the writing practice from her semester.

**Primary success test.** Her teacher's (Yamaha) order is listen → sing → play → read. We give her the iPad and say only "Play some music":
- she starts a session without help;
- she finishes several connected activities;
- she gets immediate praise;
- she comes back the next day without losing progress.

**Secondary.** The parent can see what she learned, what to practise next, and whether the app is working.

Constraints (kept from the existing projects):
- vanilla classic scripts; no build, no npm, no backend, no runtime AI;
- staging only; nothing goes live without the parent's go;
- Codex review (medium effort) before each push;
- shared modules are edited only in pitch-trainer and synced (`tools/sync-core.sh`);
- the music-eco IndexedDB is never version-bumped, because live and staging share one origin;
- no book lyrics or scans.

## Audit — findings (evidence-graded)

| ID | Sev | Status | Where | Finding | Fix |
|---|---|---|---|---|---|
| G1 | P1 | CONFIRMED (code) | garden.js:727 | Quiz auto-advance `setTimeout(1700)` has no guard. Tapping Home in that window runs `quizStep`/`quizDone` anyway: on Home it speaks the next question, and on the last question it jumps to the Done screen. | Generation token / lifecycle (PR1) |
| G2 | P2 | CONFIRMED | garden.js:519 | `finishLearn` runs 450 ms after the last note even if she has left; it records and opens a result sheet on a hidden screen. | Same |
| G3 | P1 | LIKELY (iOS, see beat-hive EVAL #18) | garden.js `openSong`→`micStart` | In mic mode the mic opens when the song screen opens and stays open through Listen and results. iOS's voice route can drop speaker volume. | Mic open only during a Learn/Play run (PR1) |
| G4 | P2 | CONFIRMED | garden.js resize handler | After a Play!, `run = {mode:'played'}`, so `!run` is false and the staff never refits on rotation. | Lifecycle state, not a `run` sentinel |
| G5 | P1 | CONFIRMED | garden.js `today` | Today lives only in memory. A refresh or Home mid-session loses the step; the plan isn't a stable daily snapshot. | Persist `{day, steps, i}` (PR3) |
| G6 | P1 | CONFIRMED | garden.js `state` | Garden progress is only in `garden_v1`. Pitch Trainer's Progress page and teacher summary can't see Garden practice. There are now three logs: `pitchTrainer_flow*` localStorage, `music-eco-log` IDB, `garden_v1`. | Garden writes `MC.log` (PR3) |
| G7 | P2 | CONFIRMED | garden.js quiz | A wrong answer records only the target, not what she picked, so the app can't tell "mixes up Re and Mi". | Store picked note (PR3) |
| G8 | P3 | CONFIRMED | garden.js `record` | Each Learn replay that earns a strawberry adds +1 to the basket, so she can farm berries. Harmless, but rewards should be granted once per step. | Reward once per Today step / per day per song (PR4) |
| P1a | P1 | CONFIRMED | pitch-trainer index.html | `id="apiKeyWrap"` appears twice (OMR + Anthropic rows). | Unique ids (PR2) |
| P1b | P2 | CONFIRMED | index.html | Text colours #484868 / #3a3a5a / #5a5a7a on #0f0e17 (11 uses) measure 1.8–2.9:1 contrast. | Raise to ≥4.5:1 (PR2) |
| P1c | P2 | LIKELY | index.html:1439 | Hiding the page while Beat is running calls `endFlowSession()`; when she comes back, the metronome loop keeps going but no new session is open, so those taps are never logged. | On visible: if running, start a new session (PR2) |
| P1d | P2 | CONFIRMED (Codex) | songs.js:289 | Listen/Play-along can start before `loadMedia` resolves, so a song with a recording plays the synth instead. | Await `mediaReady` in start paths (PR2) |
| P1e | P3 | CONFIRMED | index.html | No `window.onerror` / `unhandledrejection` capture anywhere, so device bugs leave no trace. | Debug ring buffer (PR0) |
| P1f | P3 | CONFIRMED | index.html | Six AudioContext creation sites (dj, kb, listen, early-import, play, dj-again). They mostly work. Merging is risky; the iOS unlock depends on them. | Don't merge in V2; leave as is (Pitch Trainer is the parent tool now) |
| S0 | **P0** | CONFIRMED | pitch-trainer staging index.html | Staging writes the same `pitchTrainer_flowSessions/flowAttempts/onboarded/avatar` localStorage keys that LIVE reads (`git show origin/main:index.html`), so staging Beat practice and test runs show up in live Beat Stats. | Environment namespaces (PR0) |
| S1 | P1 | CONFIRMED | all three repos | `music-eco`, `music-eco-log` and `musicEco_*`/`garden_v1` have one name for every environment. Live doesn't use them yet, but go-live would inherit test data. | Same |
| X1 | — | NOT A BUG | sound.js | Codex says the smplr constructors need `new`. In the browser, smplr 1.1.0's factories work and `Sound.sampled === true`. | None |
| X2 | — | DECISION | sw.js (both) | The page HTML is never cached offline, deliberately (an old page booting new JS broke before). | Keep; Garden shows an "offline" note instead of a blank screen (PR8) |

Review claims already resolved by the split:
- "Today buried in Songs";
- "five equal tabs";
- "avatar onboarding in the child path";
- "OMR / API keys in the child shell": none of these are in Garden, and they stay in Pitch Trainer as grown-up tools.


## Revision 2 — what changed and why

The parent's review raised five architecture gaps:
1. `env` field ≠ isolation;
2. no canonical session/attempt contract;
3. no cross-repo module governance;
4. hard-coded rules;
5. self-reported singing could pass as verified.

Audit facts behind the answers:
- LIVE pitch-trainer (root `index.html` on `main`) uses only `pitchTrainer_flowSessions`, `pitchTrainer_flowAttempts`, `pitchTrainer_onboarded` and `pitchTrainer_avatar`.
- LIVE beat-hive uses none of the music-eco stores.
- `music-eco` (takes/audio), `music-eco-log` (sessions/items), `musicEco_level|kbRange|latencyMs|today|stickers|analyzerUrl` and `garden_v1` are therefore **only used by staging builds**, but staging is what she actually uses, so it holds her real progress.

## Decisions (revised)

1. **Garden is the only child shell.** Pitch Trainer stays the grown-ups' workspace (Studio, import, OMR, DJ, Progress, calibration). No child redesign there.
2. **Reuse the engine.** Garden vendors `music-core`, `hear`, `midi` and `sound`, plus `echo.js`/`notes.js` for their pure exports only (`Echo.patterns/matchSung/adapt/liveSeg/STAGES`, `Notes.box/pickRound/traceScore/analyzeWrite/scoreWrite/noteGuide`).
3. **Lifecycle:** a Garden-only `Life` helper (`timeout/raf/on/end` + generation number); screens `{enter, exit}`; one visibility handler pauses the session and exits the run. AudioContexts are never closed.
4. **Hard environment isolation** (see D1): separate database and key names per environment, derived from the URL path. The `env` field remains only as a secondary tag.
5. **One learning store** `music-learn<ns>` with explicit session/attempt/skill contracts (D2), owned by `music-core.js`.
   - `MC.log` (old `music-eco-log`) becomes a legacy read path, migrated once.
   - Pitch Trainer Progress and Garden both read the new store.
   - Flow (Beat) moves in when Beat joins Garden (PR7); until then its keys are namespaced (D1).
6. **Module governance:** pitch-trainer is the source of truth, consumers pin versions with lock files, and API contracts are tested (D3).
7. **Rules as versioned config** (`garden-rules.js`), with separate skill dimensions; every threshold is an initial heuristic (D4).
8. **Evidence-graded outcomes:** sing results are mic-verified / uncertain / self-reported / unavailable / skipped; only verified evidence feeds accuracy (D5).
9. **Behind Grown-ups:** as before, plus export/import, diagnostics, skip-step and a storage-health line.
10. **Hidden in V2:** DJ, OMR/photo, Studio/import, instruments, avatar, recording uploads.
11. **MVP (V2.0)** = PR0–PR4.

## D1. Environment isolation (hard boundary)

- **`MC.env()`**, decided once at load from `location`:

  | Condition | Env |
  |---|---|
  | path contains `/staging/` | `stg` |
  | host is `localhost`/`127.0.0.1` | `dev` |
  | `?env=test` (any env) | `test`, for automated runs |
  | otherwise | `prod` (`''`) |

  `MC.ns(name)` returns `name` in prod and `name@<env>` elsewhere.
- **Everything persistent goes through `MC.ns`:**

  | Thing | prod name | staging name |
  |---|---|---|
  | content DB | `music-eco` | `music-eco@stg` |
  | learning DB (new) | `music-learn` | `music-learn@stg` |
  | legacy log DB | `music-eco-log` (read-only, migrate) | — |
  | prefs | `musicEco_level` … `garden_v1` | `musicEco_level@stg` … `garden_v1@stg` |
  | Flow (pitch-trainer) | `pitchTrainer_flow*` (live, untouched) | `pitchTrainer_flow*@stg` |

- **Device-level key:** `musicEco_latencyMs` is speaker calibration, not progress, so it's shared within an env, not across envs.
- **Migration** (staging, one time, idempotent): on first open of a namespaced staging build, if `meta.migrated_v1` is missing in `music-learn@stg`:
  - copy legacy `music-eco-log` sessions/items into `music-learn@stg` (ids preserved, prefixed `leg_`, attempts expanded from `notes[]` where present);
  - copy `music-eco` takes/audio into `music-eco@stg` (skip blobs > 25 MB, logging a skip);
  - copy `musicEco_*`, `garden_v1` and the staging-written `pitchTrainer_flow*` into `@stg` keys;
  - then set the marker.
  - It's copy-only: legacy stores are never modified, so a crash mid-way leaves a missing marker and a retry re-puts the same ids with no duplicates.
- **Live stays untouched.** Prod names keep their current owners; no live code changes.
  - Flow data that staging has already mixed into live keys can't be separated reliably: rows carry no env tag. It's documented, not "cleaned".
  - Live Beat Stats stops receiving new staging rows from PR0 on.
- **Compatibility:**
  - old staging builds (pre-PR0) still read and write the un-namespaced legacy stores and simply don't see newer data;
  - new builds never write legacy names;
  - live never opens `@stg`.
- **Rollback:** revert the staging deploy. The old build reads its legacy stores, which still hold everything up to migration day; the copy step never deletes. Re-deploying the new build skips migration because the marker is set.
- **Go-live:** the prod name `music-learn` is fresh, with no live installs carrying it. At go-live, Grown-ups → "Move progress from test version" runs an explicit staging-to-prod import (same idempotent copy), shown to the parent before running.
- **Tests and dev never touch real data:** automated runs use `?env=test` and clear `@test` stores before and after.

## D2. Canonical contracts (local-first, lightweight)

All records carry `schema`, `env`, `app` (`'garden'|'pt'`) and `rules` (the rules version that produced derived values).

```
Session  { id:'s_<ts36>_<rnd6>', schema:1, env, app, kind:'today'|'song'|'quiz'|'sing'|'find'|'write'|'free',
           contentId, planId?, stepIdx?, day:'YYYY-MM-DD' (local, at start), startedAt (epoch ms),
           endedAt|null, activeMs, status:'started'|'paused'|'completed'|'exited'|'interrupted'|'error',
           input:'screen'|'key'|'midi'|'mic', pageId, attemptCount, applied:false, summary:{} (derived) }
Attempt  { id:'<sessionId>.<seq>', schema:1, sessionId, day, t (ms since session start, perf clock),
           at (epoch ms), skill:'pitch'|'echo'|'reading'|'rhythm'|'motor'|'writing', target:{m|pattern|step},
           observed:{m|pattern|score}|null, outcome:'correct'|'wrong'|'miss'|'uncertain'|'self'|'skipped'|'unavailable',
           evidence:'clock'|'mic-verified'|'mic-uncertain'|'self'|'none', conf (0..1)|null,
           errMs (signed, latency-corrected)|null, timing:'clock'|'mic-est'|null, hints, firstTry:boolean }
Skill    key 'skill:<dimension>:<target>'  { schema:1, n, ok, box, lastDay, dueDay, recent:[0/1 ×10],
           correctDays:['YYYY-MM-DD'…max 5], mastered:boolean, rules }
Song     key 'song:<id>' { learned:boolean, bestPlay, lastPlay, due, phrasesDone:[] }
DailyPlan key 'plan:<day>' { id:'p_<day>', rules, createdAt, steps:[{id, type, required, needs:[], fallback,
           status:'pending'|'active'|'done'|'skipped'|'unavailable', sessionId?}], i, rewarded:[stepId] }
Meta     key 'schema' | 'migrated_v1' | 'pageId'
```

- **Stores** (`music-learn<ns>` v1):
  - `sessions` (keyPath `id`; idx `day`, `kind`);
  - `attempts` (keyPath `id`; idx `sessionId`, `day`, `skill`);
  - `items` (out-of-line key: skills, songs, plans);
  - `meta`.
- **IDs and dedup:** ids are generated on the client when the event happens, and attempts use a deterministic `sessionId.seq`. Every write is a `put`, so a retry is idempotent. Migration ids are `leg_<old>`.
- **Time:**
  - `at` (wall clock) is for days and reports;
  - `t` and `errMs` come from `performance.now()` relative to session start; audio-clock times are converted once per run;
  - `day` is fixed at session start, so midnight-spanning sessions count once.
- **Lifecycle:**
  - `start`: put with status `started`.
  - `pause`: page hidden; `activeMs` is accumulated.
  - `resume`: within 5 minutes and same screen → same id, back to `started`; otherwise → `exited`.
  - `complete`: status `completed` plus derived summary.
  - `exit`: the child leaves mid-step.
  - `error`: a lifecycle exception.
  - On each app open, `recover()` marks any `started`/`paused` session with a different `pageId` as `interrupted`, with `endedAt` = its last attempt `at`.
- **Partial sessions:**
  - their attempts count toward skill evidence (real answers);
  - they don't count as a "completed activity" and earn no rewards;
  - "interrupted" or "exited" never counts as failure.
- **Raw vs derived:**
  - attempts are raw and append-only;
  - session `summary`, `Skill` and `Song` items are derived caches, applied **once** per session: on completion (or recovery) the same transaction writes the items and sets `session.applied = true`, so re-running recovery or completion doesn't apply them twice;
  - `MC.learn.rebuild()` can recompute all derived items from attempts under the current rules, and is used after a rules change.
- **Metrics:**

  | Metric | Definition |
  |---|---|
  | practice minutes | Σ `activeMs` of sessions with ≥1 attempt |
  | practice day | a day with ≥1 completed session |
  | completed activity | sessions with status `completed` |
  | accuracy per skill | `ok/n` over the last 20 attempts with `evidence ∈ {clock, mic-verified}` |
  | timing | median `|errMs|` and mean signed `errMs` from `timing:'clock'` only; `mic-est` shown separately as "approximate" |

  Skills are never blended into one %.
- **Validation:** `MC.learn.validate(rec)` checks required fields, enums, types and schema. An invalid record is dropped into the debug ring buffer, never thrown into the child path. A newer `schema` read by older code is shown as "unknown" and skipped.

## D3. Shared-module governance

- **Source of truth:** `~/pitch-trainer`.

  | Shared module | Consumers |
  |---|---|
  | `music-core.js` | garden, beat-hive |
  | `hear.js` | garden, beat-hive |
  | `midi.js` | garden, beat-hive |
  | `sound.js` | garden |
  | `echo.js` | garden |
  | `notes.js` | garden |

  Consumers never edit vendored files.
- **Versioning:**
  - each module exports `VERSION` (semver) and starts with a `/* @shared <name> <version> */` header;
  - `pitch-trainer/shared-manifest.json` lists `{module: {version, api:[exported names + arity], consumers}}`;
  - **major** = removed/renamed export or changed return shape, **minor** = additive, **patch** = fix.
- **Sync:** `tools/sync-core.sh <consumer> [--major] [--to <commit>]` copies modules and writes the consumer's `vendor.lock.json` `{module: {version, sha256, sourceCommit, uses:[names]}}`. It refuses a major bump without `--major`.
- **Consumer gate** (`tools/qc.js` in garden and beat-hive):
  - each vendored file's sha256 must equal its lock, otherwise it was edited locally → FAIL;
  - the source being ahead is only a WARN ("update available"), not a fail;
  - every name in `uses` must exist in the vendored module → FAIL if missing.
- **Producer gate** (`pitch-trainer/tools/consumers-test.sh`, run before pushing any shared-module change): for each consumer, copy the candidate modules into a temp worktree and run that consumer's `qc.js` + tests (`garden-test.mjs`, `exec-check.js`). Any failure blocks the push (wired into the existing pre-push Codex flow as a precondition).
- **Rollback:** `sync-core.sh <consumer> --to <commit>` restores a prior module version; the consumer's own git revert is enough on its side. Locks record `sourceCommit`, so it's always clear what a consumer runs.

## D4. Rules as versioned configuration

- **`garden-rules.js`:** pure data plus `RULES.version`, e.g. `'2026.10.1'`. Every threshold is labelled an *initial heuristic* to be tuned from her data, not an educational standard.

```
skills: {
  pitch:   { what:'hear a note → name/find it without a visual cue', masteryBox:4, masteryDays:2, regressMisses:[2,5] },
  echo:    { what:'sing back a heard pattern (mic-verified only)', advanceGood:4, easeMisses:2 },      // = Echo.adapt today
  reading: { what:'staff note → name', masteryBox:4, masteryDays:2, regressMisses:[2,5] },
  rhythm:  { what:'Play! timing (clock evidence only)', greatMs:110, goodMs:230, steadySdMs:120 },
  motor:   { what:'right key first try in Learn/Find', masteryFirstTry:0.85, window:20 },
  writing: { what:'place/trace/write score', passScore:70, stepsUp:['place','trace','write'] } },
review:      { intervalsDays:[1,2,4,7,14], maxPromotionsPerDay:1 },
difficulty:  { newNoteWhenMastered:true, unlockAccuracy:0.85, unlockMinN:10, tempo:{start:60, step:8, max:92} },
frustration: { wrongInRow:3, maxTriesPerStep:3, stepMaxSec:150, action:'hint→easier→skip' },
today:       { order:['hear','sing','find','play','read','write','reward'], readQs:3 }
```

- **Versioning:** sessions, attempts, plans and skills store `rules`. A rules change never rewrites history; derived items are recomputed only by explicit `rebuild()`. Today's plan keeps the version it was created with.
- **Visibility:** Grown-ups shows a read-only "Rules in use" card with each threshold.

## D5. Singing, input confidence and optional steps

- **Sing outcomes:**

  | Outcome | Evidence | When |
  |---|---|---|
  | correct / wrong | `mic-verified` | stable pitch, clarity ≥ conf threshold |
  | uncertain | `mic-uncertain` | no stable pitch or low clarity |
  | self | `self` | she tapped "I sang it", whether with no mic or after an uncertain take |
  | unavailable | `none` | no mic API or permission denied |
  | skipped | `none` | grown-up skip or child exit |

  Only `mic-verified` updates the `echo` skill. `self` counts toward practice minutes and the step's reward (participation), never accuracy.
- **Other inputs:**
  - mic notes in Find/Play carry `conf`;
  - below threshold → `uncertain`, not `wrong`;
  - mic timing → `timing:'mic-est'`, excluded from rhythm accuracy.
- **DailyPlan steps** carry `required`, `needs` (`'mic'`, `'feature:write'`) and a `fallback`.
  - Capabilities are resolved when the plan is built and again when each step is entered.
  - **Mic:** Sing is `required:false`, falling back to "Sing along" (self) → `unavailable` if even that's turned off.
  - **Writing before PR5:** `FEATURES.write = false`, so the step isn't generated at all (no dead "unavailable" step).
  - **Completion:** the plan is complete when all *required* steps are `done`; optional ones may be `skipped`/`unavailable`.
  - **Rewards:** one per step id, recorded in `rewarded`, so reloads and replays can't re-grant.
  - **Plan snapshot:**
    - reused for the whole day, even after an app update;
    - an unknown step type in an old snapshot → that step is marked `unavailable`;
    - a corrupt snapshot → regenerated with the same seed (`hash(day)`), giving the same plan.

## Failure-injection tests (new, in PR0 harness; extended per PR)

- **Storage unavailable:**
  - a memory `Store` adapter with switches: `localStorage` throws, `indexedDB` undefined, `put` rejects with QuotaExceeded;
  - asserts: app boots, all child flows run, a progress-unsaved banner appears in Grown-ups only, no uncaught errors, and queued attempts flush when storage returns.
- **Corrupt data:** non-JSON or wrong-typed `garden_v1`, a session with an unknown schema, an attempt missing fields → defaults, skipped, logged, never thrown.
- **Stale async:** fake timers and RAF in `exec-check.js`:
  - answer the last quiz question → `exit()` → advance 2 s → no `quizStep`, no `say`, no screen change;
  - same for Learn's 450 ms finish and Listen's highlight timers;
  - a mic frame after `micStop` is ignored.
- **Interrupted recovery:**
  - write a `started` session + 5 attempts with an old `pageId`, then boot → `interrupted`, attempts intact, derived items applied exactly once, Today resumes at the same step, no second reward;
  - run `recover()` twice → identical state.
- **Dedup/idempotence:** put the same attempt twice → 1 record; `complete()` twice → items applied once; run migration twice, or kill it mid-copy and retry → same counts, no `leg_` duplicates.
- **Shared-module incompatibility:**
  - remove an export used by Garden in a temp copy → consumer gate FAILs;
  - change `staffStep`'s return shape → the Garden contract test fails;
  - edit a vendored file locally → sha mismatch FAIL;
  - a major version without `--major` → sync refuses.
- **Environment isolation:** with `?env=test`, writes land only in `@test` names, and a scan of prod-named stores finds zero records with `env:'test'`.

## PR dependency map (revised)

```
PR0 harness + governance + env isolation (P0 S0)  ──┬──> PR1 Garden lifecycle (G1–G4)
                                                    ├──> PR2 pitch-trainer fixes (P1a–d) + Flow keys verified namespaced
                                                    └──> PR3 learning store + contracts + rules config + migration
PR1 + PR3 ──> PR4 Today V2 (capability-aware plan, sing evidence)  ──> PR5 Writing (flips FEATURES.write)
PR3 ──> PR6 Grown-ups dashboard v2 (skills, next steps, rules card, export/import, storage health)
PR4 ──> PR7 Explore (Beat moves into music-learn)      all ──> PR8 device QA + go-live readiness
```

Moved earlier:
- **S0** (staging contaminating live Beat Stats) is the only true P0 and is in **PR0**. It needs `MC.env/ns`, a shared-module change, so governance lands in the same PR, first.
- **G1** (stale timer jumps to Done) stays in **PR1**. It's child-visible but non-destructive, and PR1 follows immediately.
- **P1a–P1d** don't block anything and stay in PR2.

| PR | Repo(s) | Content | Done when |
|---|---|---|---|
| PR0 | pitch-trainer, music-garden, beat-hive | `VERSION` + manifest + lock files + sync flags + consumer/producer gates; `MC.env/ns` (staging/dev/test); pitch-trainer staging Flow/onboard/avatar keys via `ns`; split `garden-core.js` + `garden-rules.js` skeleton; `garden-test.mjs`, `exec-check.js` (fake timers), failure-injection suite v1; duplicate-id/contrast checks; `?debug=1` ring buffer | Live Beat Stats gets no new staging rows (verified by key scan); all gates green; injected-failure tests pass |
| PR1 | music-garden | `Life`, screen enter/exit, G1–G4, mic only during runs, visibility pause | Stale-async tests pass; rapid Home taps → no sound, speech or jump |
| PR2 | pitch-trainer | P1a–P1d | As before |
| PR3 | pitch-trainer (`music-core` learn API, Progress), music-garden | `music-learn<ns>` v1 stores, contracts + validate/recover/rebuild, staging migration, Garden writes sessions/attempts/items/plan, rules versioning, export/import JSON | Recovery/dedup/migration tests pass; Pitch Trainer Progress shows Garden practice; old staging build still opens (rollback drill) |
| PR4 | music-garden | Today V2 with `required/needs/fallback`, sing evidence, rewards per step id | Full session in Chrome with mic denied and allowed; reload mid-session resumes, no double reward |
| PR5 | music-garden | Write step + tile; `FEATURES.write = true` | Writing scores match the pitch-trainer Notes tests |
| PR6 | music-garden | Dashboard: skills separated, evidence-aware accuracy, confusion pairs, next steps from rules, rules card, storage health | Sentences match a seeded fixture |
| PR7 | later | Explore + Beat into `music-learn` | — |
| PR8 | music-garden | Device QA, offline notice, a11y, `navigator.storage.persist()` request, go-live import flow | All gates; child test |

## Code ownership and file impact

- **pitch-trainer (engine owner):**
  - `music-core.js`: `VERSION`, `env/ns`, `MC.learn` (open/validate/start/attempt/complete/recover/rebuild/migrate/export/import); `MC.log` kept as legacy reader;
  - `hear.js`, `midi.js`, `sound.js`, `echo.js`, `notes.js`: `VERSION` only;
  - `index.html`: Flow/onboard/avatar keys via `ns`, P1a–P1c;
  - `songs.js`: P1d;
  - `progress.js`: reads `MC.learn`;
  - `shared-manifest.json`, `tools/sync-core.sh`, `tools/consumers-test.sh`, `tools/core-test.mjs` (+learn, env, migration tests).
- **music-garden (child app owner):**
  - `garden-core.js` (new, pure), `garden-rules.js` (new, config);
  - `garden.js` (Life, InputHub evidence, Store adapter over `MC.learn`, plan, screens, debug);
  - `index.html`, `vendor.lock.json`;
  - `tools/qc.js` (lock gate), `tools/garden-test.mjs`, `tools/exec-check.js`;
  - `docs/plan/00–03`.
- **beat-hive (consumer):** `vendor.lock.json`; `tools/qc.js` moves from "drift = fail" to the lock model.

## Acceptance criteria (updated)

- **Isolation:** after PR0, a key/DB scan on the origin shows staging writes only to `@stg` names, and live keys get no new rows from staging. After the PR3 migration, her staging progress is identical before and after (counts per kind). A rollback drill (deploy the previous staging build) opens without errors.
- **Data:**
  - every attempt belongs to exactly one session;
  - no duplicate ids after retries;
  - derived items equal `rebuild()` output;
  - partial sessions never earn rewards or count as completed;
  - self-reported singing never changes echo accuracy.
- **Governance:** a shared-module change can't be pushed if any consumer's gate fails; consumers can't run a locally edited vendored file.
- **Rules:** changing a threshold in `garden-rules.js` changes behaviour only after a version bump and leaves history untouched.
- **Child:** first sound in ≤2 taps; Today completes with the mic allowed or denied; reload resumes; no stale sound or speech after Home; zero console errors in a scripted run.
- **Parent:** each skill is shown separately with its evidence source; next-step sentences are traceable to rules and data.

## Verification

- `node tools/qc.js` + `node tools/garden-test.mjs` + `node tools/exec-check.js` (garden);
- `node tools/core-test.mjs` + `tools/consumers-test.sh` (pitch-trainer);
- `node tools/qc.js` (beat-hive);
- scripted Chrome runs with `?env=test` (full Today; mic denied; rapid exits; reload mid-step; storage-blocked);
- Codex medium review before each push; staging only;
- device checklist (unchanged list, plus a private-mode/IDB-blocked run and the iOS 7-day storage check after installing to the Home Screen).

## Remaining risks

- **Safari storage eviction:** Safari can clear script-written storage for sites not added to the Home Screen after 7 days without a visit. Mitigation: install to the Home Screen (PR8 prompt in Grown-ups), `navigator.storage.persist()`, and a periodic export reminder.
- **Mixed live Flow history:** pre-PR0 staging rows are already inside live `pitchTrainer_flow*` and can't be told apart.
- **Mic thresholds** (clarity, onset) are untuned for her piano and room. `uncertain` protects accuracy but may make Sing feel unresponsive.
- **Heuristic rules:** mastery may unlock too fast or too slow; the version stamps let us tune without corrupting history.
- **Migration size:** large recordings in `music-eco` copy slowly on the iPad; we skip blobs over 25 MB and log it.
- **Shared origin:** all xxc2xx apps can read each other's storage. That's acceptable, since they're all the same owner's, but it means no secrets in storage beyond the existing API key fields (pitch-trainer, grown-up tools).

## Open decisions (defaults chosen; the parent can change)

- Staging stays her daily app until go-live; the go-live import is an explicit Grown-ups action.
- Sing defaults to the mic, with self-report always offered; if iOS volume drop (G3) shows on her iPad, default to "Sing along".
- Writing joins Today in PR5.
- Pitch Trainer gets no child redesign.

## Status

| PR | State |
|---|---|
| PR0 | done 2026-10-24 — pitch-trainer 5cc2b2c, music-garden 1007918, beat-hive acaef7c. Deferred by plan: IDB + garden_v1 env scoping (PR3, needs copy-migration). Noted: beat-hive SONG-bank MIDI remap for >16 pitches (P2, pre-existing). |
| PR1 | done — Life per screen visit; G1–G4 fixed with regression tests (fail on the old code); mic open only during Learn/Play runs |
| PR2–PR8 | not started |

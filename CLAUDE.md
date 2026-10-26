# Music Garden

A music app for the founder's daughter (4, Yamaha Junior Music Course since 3):
her class book on a real staff, play-along with Taiko-style beat scoring, and
a note-reading quiz. Split out of `~/pitch-trainer` on 2026-10-24.

## Shape

- `index.html` (markup, CSS, inline SVG art) + `garden.js` (all logic,
  classic script → `window.Garden`). No backend, no npm, no build step.
- Vendored from `~/pitch-trainer`: `music-core.js`, `hear.js`, `midi.js`,
  `sound.js`, `echo.js` (pure `matchSung` / `liveSeg` only), pinned by `vendor.lock.json` (version, sha256, source commit,
  and the engine names this app uses). **Never edit them here** — a local
  edit fails `tools/shared.mjs verify`. Edit in pitch-trainer, run its
  `tools/consumers-test.sh` (proves the change against this repo's gate),
  then `tools/sync-core.sh`. The source being newer only warns.
- `garden-core.js` = pure logic (node-tested), `garden-rules.js` = learning
  thresholds as versioned data (initial heuristics, bump `version` on any
  change), `garden.js` = the app.
- Same origin as Pitch Trainer and Beat Hive (`xxc2xx.github.io`), so
  storage is shared. Every name goes through `MusicCore.ns` (staging =
  `garden_v1@stg`, `musicEco_latencyMs@stg`, IDB `music-learn@stg`); never
  write an un-scoped name. Practice log = `MusicCore.learn()` (sessions
  `g-song` / `g-quiz` / `g-sing` / `g-today`, attempts with evidence); Today's
  plan is snapshotted in `garden_v1.today` (+ practice-log item `plan:<day>`)
  so a refresh resumes at the first unfinished step. Grown-ups → Saved
  progress = storage health + backup file export / merge-only restore. `sw.js` only deletes caches
  starting with its own prefix (`mg-`).

## What it does

The clean kid-facing app (the main `index.html` stays the full tool). One big
choice per screen, spoken prompts, grown-up settings behind a 1.5 s
press-and-hold. Unicorn / bunny / strawberry art is inline SVG symbols in
`garden.html`; strawberries are the reward. State: `garden_v1` (env-scoped) + the practice log.

- **My book**: her Yamaha JMC tunes (do-re-do … five-finger hill, plus the
  bass-clef version) in `SONGS` as `[midi, beats]`, drawn by `staffSvg`
  (clef glyph sized from its canvas ink box). Our own titles; no book lyrics.
- **Song screen**: Listen (app plays) · Learn (waits for each note, key hint
  optional) · Play! (Taiko-style: count-in, playhead, per-note verdict
  great ≤110 ms / good ≤230 ms / early-late / wrong / missed, combo, results
  with a timing chart, "Hear me" replays her recorded notes over the beat).
  Only the note name is judged, not the octave.
- **Note quiz**: name the note / which staff is X / name the shining note in
  a song; weighted toward notes she misses; bass clef is a grown-up toggle.
- **Today** (class order, one song): Listen → Sing it back → Learn (find the
  notes) → Play! → read 3 notes. Sing is optional: the mic opens only while
  she sings and judges the tune's shape (mic-verified / uncertain); no mic or
  mic denied → "I sang it" (self-reported, never counted as accuracy). Each
  step pays strawberries once per day (`rewarded[stepId]`, Again only tops up
  to the step max in `garden-rules.js` `today.rewards`); a finished day can be
  replayed for fun with no extra pay. Outside Today a replayed song pays its
  taking-part strawberry once a day (G8).
- Input: on-screen keys, computer keys, MIDI (Chrome/Mac), or microphone
  (energy-onset + `Hear.pitchTracker`; ignores our own sounds via `muteUntil`
  and the beat clicks). Shares `musicEco_latencyMs` with Pitch Trainer.

## Rules

- **Staging only.** Work on `dev`. `main` is the deploy branch: `staging/`
  (+ README). Nothing goes to the root of `main` until the parent says go live.
- Gate: `sh tools/gate.sh` = `qc.js` (syntax, lock + API, sw list, unique
  ids) + `garden-test.mjs` (pure logic) + `exec-check.mjs` (boots the real
  scripts in a fake DOM with fake time; failure injection: storage throws /
  full / corrupt data, callbacks after leaving a screen). Known bugs sit in
  its `XFAIL` list with their audit id until their PR fixes them.
- `?debug=1` shows a live diagnostics panel (screen, run, audio, input,
  MIDI, mic, rules version, last errors). Errors are always kept in a
  30-entry memory ring buffer — no audio, photos or child data.
- V2 plan and audit: `docs/plan/00-overview.md` (PR0–PR8, data contracts).
- Release: `sh tools/gate.sh` → Codex review
  (`~/busy-brain/claude-config/hooks/codex-review-run.sh ~/music-garden`) →
  push `dev` → `tools/stage.sh ~/music-garden dev <files…>` →
  `git -C $TMPDIR/stage-music-garden push origin HEAD:main`.
  Files: index.html garden.js garden-core.js garden-rules.js music-core.js hear.js midi.js sound.js echo.js sw.js manifest.json icon-192.png icon-512.png
- Bump `CACHE` in `sw.js` when the file list changes; add new scripts to `STATIC`.
- Tunes come from her book's exercises; use our own titles and no book lyrics
  or scans (Yamaha copyright).
- Kid screens: one big choice per screen, no reading required, no emoji, no red ✗.

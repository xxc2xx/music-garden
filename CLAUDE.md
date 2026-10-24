# Music Garden

A music app for the founder's daughter (4, Yamaha Junior Music Course since 3):
her class book on a real staff, play-along with Taiko-style beat scoring, and
a note-reading quiz. Split out of `~/pitch-trainer` on 2026-10-24.

## Shape

- `index.html` (markup, CSS, inline SVG art) + `garden.js` (all logic,
  classic script → `window.Garden`). No backend, no npm, no build step.
- Vendored from `~/pitch-trainer`: `music-core.js`, `hear.js`, `midi.js`,
  `sound.js`, pinned by `vendor.lock.json` (version, sha256, source commit,
  and the engine names this app uses). **Never edit them here** — a local
  edit fails `tools/shared.mjs verify`. Edit in pitch-trainer, run its
  `tools/consumers-test.sh` (proves the change against this repo's gate),
  then `tools/sync-core.sh`. The source being newer only warns.
- `garden-core.js` = pure logic (node-tested), `garden-rules.js` = learning
  thresholds as versioned data (initial heuristics, bump `version` on any
  change), `garden.js` = the app.
- Same origin as Pitch Trainer and Beat Hive (`xxc2xx.github.io`), so
  `localStorage` is shared: Garden uses `garden_v1`; it reads Pitch Trainer's
  speaker calibration `musicEco_latencyMs`. `sw.js` only deletes caches
  starting with its own prefix (`mg-`).

## What it does

The clean kid-facing app (the main `index.html` stays the full tool). One big
choice per screen, spoken prompts, grown-up settings behind a 1.5 s
press-and-hold. Unicorn / bunny / strawberry art is inline SVG symbols in
`garden.html`; strawberries are the reward. State: `localStorage.garden_v1`.

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
- **Today**: 4-question quiz → Learn the current song → Play! it.
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
  Files: index.html garden.js music-core.js hear.js midi.js sound.js sw.js manifest.json icon-192.png icon-512.png
- Bump `CACHE` in `sw.js` when the file list changes; add new scripts to `STATIC`.
- Tunes come from her book's exercises; use our own titles and no book lyrics
  or scans (Yamaha copyright).
- Kid screens: one big choice per screen, no reading required, no emoji, no red ✗.

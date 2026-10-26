/* garden-rules.js — Music Garden's learning rules as versioned DATA.
   Classic script → window.GardenRules; under node, module.exports.

   Every number here is an INITIAL HEURISTIC chosen for a 4-year-old in the
   Yamaha Junior Music Course — not a validated educational standard. Tune
   them from her own data. Rules are versioned: records store the version
   that produced them, a change never rewrites history, and derived progress
   is only recomputed on an explicit rebuild (plan D4).

   Bump `version` whenever a value changes.
   Skill dimensions are kept SEPARATE — never blended into one percentage.
*/
(function(root){
  'use strict';
  const GardenRules = {
    version: '2026.10.2',
    skills: {
      pitch:   { what: 'hear a note → name or find it without a visual cue', masteryBox: 4, masteryDays: 2, regressMisses: [2, 5] },
      echo:    { what: 'sing back a heard pattern (microphone-verified only)', advanceGood: 4, easeMisses: 2, minClarity: 0.8 },
      reading: { what: 'staff note → its name', masteryBox: 4, masteryDays: 2, regressMisses: [2, 5] },
      rhythm:  { what: 'Play! timing (clock evidence only: screen keys / MIDI)', greatMs: 110, goodMs: 230, steadySdMs: 120 },
      motor:   { what: 'right key on the first try (Learn / Find)', masteryFirstTry: 0.85, window: 20 },
      writing: { what: 'place / trace / write a note on the staff', passScore: 70, stepsUp: ['place', 'trace', 'write'] },
    },
    review:      { intervalsDays: [1, 2, 4, 7, 14], maxPromotionsPerDay: 1 },
    difficulty:  { newNoteWhenMastered: true, unlockAccuracy: 0.85, unlockMinN: 10, tempo: { start: 60, step: 8, max: 92 } },
    frustration: { wrongInRow: 3, maxTriesPerStep: 3, stepMaxSec: 150, action: 'hint → easier → skip' },
    // Today follows her class order: listen → sing → find it → play → read.
    // Each step pays its strawberries once per day; a replay only tops up to
    // the step's best (never past `max`). Optional steps may be skipped.
    today:       { order: ['hear', 'sing', 'find', 'play', 'read', 'write', 'reward'], readQs: 3,
                   rewards: { hear: 1, sing: 1, find: 3, play: 3, read: 3, write: 1 } },
    sing:        { listenSec: 6, quietSec: 1.5, maxTries: 3 },
    play:        { points: { great: 100, good: 75, ok: 40, wrong: 0, miss: 0 }, berries: [30, 60, 85] },
    features:    { write: false },        // Writing joins Today in PR5
  };
  root.GardenRules = GardenRules;
  if(typeof module !== 'undefined' && module.exports) module.exports = GardenRules;
})(typeof window !== 'undefined' ? window : globalThis);

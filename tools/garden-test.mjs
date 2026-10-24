// node tools/garden-test.mjs — unit tests for Garden's pure logic
// (garden-core.js + garden-rules.js). No DOM, no audio, no storage.
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const MC = require('../music-core.js');
globalThis.MusicCore = MC;
const R = require('../garden-rules.js');
const G = require('../garden-core.js');

let fail = 0;
const ok = (c, m) => { console.log((c ? '  ok    ' : '  FAIL  ') + m); if(!c) fail++; };
const seeded = (seed) => () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 2 ** 32; };   // deterministic tests

// rules: versioned, every skill says what it measures, dimensions stay separate
ok(/^\d{4}\.\d{2}\.\d+$/.test(R.version), `rules version '${R.version}'`);
ok(['pitch', 'echo', 'reading', 'rhythm', 'motor', 'writing'].every(k => R.skills[k] && R.skills[k].what), 'six separate skill dimensions, each described');
ok(R.features.write === false, 'Writing feature flag off until PR5');

// verdicts follow the rules thresholds
const { greatMs, goodMs } = R.skills.rhythm;
ok(G.verdictOf(0) === 'great' && G.verdictOf(-greatMs) === 'great' && G.verdictOf(greatMs + 1) === 'good', 'great ≤ greatMs, either side');
ok(G.verdictOf(goodMs) === 'good' && G.verdictOf(goodMs + 1) === 'ok', 'good ≤ goodMs, then early/late');
ok(G.verdictOf(10, true) === 'good' && G.verdictOf(200, true) === 'ok', 'a wrong key first downgrades one level');
ok(G.scoreOf([{ v: 'great' }, { v: 'good' }, null, { v: 'ok' }]) === 54, 'score averages points, null = miss');
ok(G.scoreOf([]) === 0, 'empty run scores 0');
ok([[85, 3], [84, 2], [60, 2], [59, 1], [30, 1], [29, 0]].every(([p, b]) => G.berriesFor(p) === b), 'strawberries at 30 / 60 / 85');

// distractors: two, distinct names, same clef, never the answer
const rnd = seeded(7), pool = [60, 62, 64, 65, 67, 48, 50, 52, 53, 55];
let good = true;
for(let i = 0; i < 200; i++){
  const m = pool[i % pool.length], d = G.distractors(m, pool, rnd);
  if(d.length !== 2 || d.some(x => MC.pc(x) === MC.pc(m)) || MC.pc(d[0]) === MC.pc(d[1]) || d.some(x => (x < 60) !== (m < 60))) good = false;
}
ok(good, 'distractors: 2 distinct names, same clef, never the answer (200 seeded draws)');

// her book: every tune fills whole bars, stays in its clef's five-finger range
G.SONGS.forEach(s => {
  const bar = G.beatsPerBar(s), beats = G.songBeats(s), notes = s.notes.filter(n => n[0] != null).map(n => n[0]);
  const [lo, hi] = s.clef === 'F' ? [48, 55] : [60, 67];
  ok(beats % bar === 0 && notes.every(m => m >= lo && m <= hi), `${s.title}: ${beats} beats in ${bar}s, notes ${lo}–${hi}`);
});
ok(G.targetsOf(G.SONGS[3]).length === 13 && G.songBeats(G.SONGS[3]) === 16, 'Hot Cross Buns: 13 notes over 16 beats');
ok(new Set(G.SONGS.map(s => s.id)).size === G.SONGS.length, 'song ids unique');

// timing summary: wrong keys and misses never count toward timing
const t = G.timingSummary([{ v: 'great', dt: -80 }, { v: 'good', dt: -120 }, { v: 'wrong', dt: null }, null]);
ok(t.bias === -100 && t.n === 2 && /early/.test(t.text), 'timing uses played notes only; early reads as early');
ok(G.timingSummary([{ v: 'great', dt: 10 }]).text === '', 'one note is not enough for a timing tip');

console.log(fail ? `\nGARDEN TEST FAIL (${fail})` : '\nGARDEN TEST PASS');
process.exit(fail ? 1 : 0);

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

// Today's plan (D5): class order, capability-aware, stable, rewards once
const ids = G.SONGS.map(s => s.id);
const p = G.buildPlan('2026-10-25', 'hcb', { mic: true });
ok(p.steps.map(s => s.type).join() === 'hear,sing,find,play,read', `class order without Writing (flag off): ${p.steps.map(s => s.type)}`);
ok(p.steps.every(s => s.status === 'pending') && p.steps.find(s => s.type === 'sing').required === false, 'all pending; Sing is optional');
ok(G.stepMode(p.steps[1], { mic: true }) === 'full' && G.stepMode(p.steps[1], { mic: false }) === 'self', 'Sing: mic → full, no mic → "I sang it" fallback');
ok(G.stepMode({ type: 'mystery' }, {}) === 'unavailable', 'unknown step type → unavailable');
const noMic = G.buildPlan('2026-10-25', 'hcb', {});
ok(noMic.steps.find(s => s.type === 'sing').status === 'pending', 'no mic: Sing still in the plan (runs its fallback), not dropped');
p.steps[0].status = 'done'; p.steps[1].status = 'skipped'; p.steps[2].status = 'active';
ok(G.nextStep(p) === 2 && !G.planComplete(p), 'next = first pending/active; not complete yet');
['find', 'play', 'read'].forEach(t => p.steps.find(s => s.type === t).status = 'done');
ok(G.planComplete(p) && G.nextStep(p) === -1, 'complete when every REQUIRED step is done (skipped Sing allowed)');

// rewards: once per step id; a replay only tops up, never past the step max
const q = G.buildPlan('2026-10-25', 'drd', { mic: true }), play = q.steps.find(s => s.type === 'play'), hear = q.steps[0];
ok(G.topUp(q, hear, 1) === 1 && G.topUp(q, hear, 1) === 0, 'hear pays 1 once; the replay pays 0');
ok(G.topUp(q, play, 1) === 1 && G.topUp(q, play, 3) === 2 && G.topUp(q, play, 2) === 0 && G.topUp(q, play, 9) === 0, 'play: 1, then tops up to 3, never more');
ok(G.topUp(q, q.steps[2], 0) === 1, 'finishing a step always pays at least 1');
ok(G.planBerries(q) === 5, 'plan total = sum of step rewards');

// restore: same day only, damaged/old formats rebuild, nothing re-granted
const snap = JSON.parse(JSON.stringify(q)); snap.steps[0].status = 'done'; snap.steps[1].status = 'active';
const r = G.restorePlan(snap, '2026-10-25', ids);
ok(r && r.steps[1].status === 'pending' && r.steps[0].status === 'done' && r.rewarded.play === 3, 'restore: an active step runs again; done + rewards kept');
ok(G.topUp(r, r.steps.find(s => s.type === 'play'), 3) === 0, 'after a reload the same step cannot pay twice');
ok(G.restorePlan(snap, '2026-10-26', ids) === null, 'yesterday\'s plan → null (fresh day)');
ok(G.restorePlan(Object.assign({}, snap, { song: 'gone' }), '2026-10-25', ids) === null, 'unknown song → null');
ok(G.restorePlan({ day: '2026-10-25', song: 'drm', i: 1, berries: 2 }, '2026-10-25', ids) === null, 'PR3-format snapshot (no steps) → null');
ok(G.restorePlan({ day: '2026-10-25', song: 'drm', steps: [null] }, '2026-10-25', ids) === null && G.restorePlan('x', '2026-10-25', ids) === null, 'damaged snapshot → null, no throw');
const odd = G.restorePlan(Object.assign({}, snap, { steps: snap.steps.concat([{ id: 'dance', type: 'dance', status: 'pending' }]), rewarded: { play: 99, hear: -1, ghost: 2 } }), '2026-10-25', ids);
ok(odd.steps[odd.steps.length - 1].status === 'unavailable' && odd.steps[odd.steps.length - 1].required === false, 'a step type from a newer version → unavailable, never required');
ok(odd.rewarded.play === 3 && !('hear' in odd.rewarded) && !('ghost' in odd.rewarded), 'rewards clamped to the step max; junk dropped');

// the sung tune: opening notes up to the first rest
ok(G.singPattern(G.SONGS.find(s => s.id === 'hcb')).join() === '64,62,60' && G.singPattern(G.SONGS.find(s => s.id === 'hill')).join() === '60,62,64,65', 'sing pattern = opening phrase, 2–4 notes');
ok(G.SONGS.every(s => { const n = G.singPattern(s).length; return n >= 2 && n <= 4; }), 'every song has a 2–4 note sing pattern');

console.log(fail ? `\nGARDEN TEST FAIL (${fail})` : '\nGARDEN TEST PASS');
process.exit(fail ? 1 : 0);

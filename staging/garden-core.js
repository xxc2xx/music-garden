/* garden-core.js — Music Garden's PURE logic: no DOM, no audio, no storage.
   Classic script → window.GardenCore; under node, module.exports (tools/garden-test.mjs).
   Depends on music-core.js (pc only) and garden-rules.js (thresholds).
*/
(function(root){
  'use strict';
  const MC = root.MusicCore || (typeof require !== 'undefined' ? require('./music-core.js') : null);
  const RULES = root.GardenRules || (typeof require !== 'undefined' ? require('./garden-rules.js') : null);

  /* ── Her book, in class order (fixed do: do = C). [midi, beats], null = rest ── */
  const SONGS = [
    { id: 'drd', title: 'Do Re Do', clef: 'G', time: 'C', notes: [[60,1],[62,1],[60,1],[null,1]] },
    { id: 'drm', title: 'Up to Mi', clef: 'G', time: 'C', notes: [[60,1],[62,1],[64,1],[null,1]] },
    { id: 'mrd', title: 'Down from Mi', clef: 'G', time: 'C', notes: [[64,1],[62,1],[60,1],[null,1]] },
    { id: 'hcb', title: 'Hot Cross Buns', clef: 'G', time: [2,4],
      notes: [[64,1],[62,1],[60,1],[null,1],[64,1],[62,1],[60,1],[null,1],[60,1],[60,1],[62,1],[62,1],[64,1],[62,1],[60,1],[null,1]] },
    { id: 'fa', title: 'Up to Fa and back', clef: 'G', time: 'C', notes: [[60,1],[62,1],[64,1],[65,1],[64,1],[62,1],[60,1],[null,1]] },
    { id: 'sol', title: 'Steps to Sol', clef: 'G', time: 'C',
      notes: [[60,1],[62,1],[64,1],[null,1],[64,1],[65,1],[67,1],[null,1],[67,1],[65,1],[64,1],[null,1],[64,1],[62,1],[60,1],[null,1]] },
    { id: 'hill', title: 'Five-finger hill', clef: 'G', time: 'C', notes: [[60,1],[62,1],[64,1],[65,1],[67,4],[67,1],[65,1],[64,1],[62,1],[60,4]] },
    { id: 'low', title: 'Low hill (left hand)', clef: 'F', time: 'C', notes: [[48,1],[50,1],[52,1],[53,1],[55,4],[55,1],[53,1],[52,1],[50,1],[48,4]] },
  ];
  const beatsPerBar = (song) => song.time === 'C' ? 4 : song.time[0];
  function targetsOf(song){
    let beat = 0; const out = [];
    song.notes.forEach(([m, b], i) => { if(m != null) out.push({ i, m, beat, b }); beat += b; });
    return out;
  }
  const songBeats = (song) => song.notes.reduce((a, n) => a + n[1], 0);

  /* ── Scoring (pure) ── */
  const WIN = { great: RULES.skills.rhythm.greatMs, good: RULES.skills.rhythm.goodMs };
  const POINTS = RULES.play.points;
  function verdictOf(dtMs, wrongTry){
    const a = Math.abs(dtMs);
    let v = a <= WIN.great ? 'great' : a <= WIN.good ? 'good' : 'ok';
    if(wrongTry) v = v === 'great' ? 'good' : 'ok';
    return v;
  }
  function scoreOf(judged){
    if(!judged.length) return 0;
    return Math.round(judged.reduce((a, j) => a + POINTS[j ? j.v : 'miss'], 0) / judged.length);
  }
  const berriesFor = (pct) => RULES.play.berries.filter(t => pct >= t).length;
  function timingSummary(judged){
    const dts = judged.filter(j => j && j.dt != null && j.v !== 'wrong').map(j => j.dt);
    if(dts.length < 2) return { bias: 0, sd: 0, n: dts.length, text: '' };
    const mean = dts.reduce((a, b) => a + b, 0) / dts.length;
    const sd = Math.sqrt(dts.reduce((a, b) => a + (b - mean) ** 2, 0) / dts.length);
    const text = Math.abs(mean) < 45 ? 'Right on the beat!'
      : mean < 0 ? 'A little early — wait for the click.' : 'A little late — get ready a bit sooner.';
    return { bias: Math.round(mean), sd: Math.round(sd), n: dts.length, text };
  }
  // two wrong answers for a note: nearest scale neighbours first, all different names
  function distractors(m, pool, rnd){
    rnd = rnd || Math.random;
    const same = pool.filter(x => (x < 60) === (m < 60) && MC.pc(x) !== MC.pc(m));
    const byDist = same.slice().sort((a, b) => (Math.abs(a - m) - Math.abs(b - m)) || (rnd() - 0.5));
    const near = byDist.slice(0, 3);
    const out = [];
    while(out.length < 2 && near.length){ out.push(near.splice(Math.floor(rnd() * near.length), 1)[0]); }
    return out;
  }


  const GardenCore = { SONGS, beatsPerBar, targetsOf, songBeats, WIN, POINTS, verdictOf, scoreOf, berriesFor, timingSummary, distractors };
  root.GardenCore = GardenCore;
  if(typeof module !== 'undefined' && module.exports) module.exports = GardenCore;
})(typeof window !== 'undefined' ? window : globalThis);

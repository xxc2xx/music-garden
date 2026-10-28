/* adventure-core.js — Melody Adventure's PURE logic: no DOM, no audio.
   Classic script → window.AdventureCore; under node, module.exports
   (tools/garden-test.mjs). Depends on music-core.js (midiToFreq, pc) and
   garden-core.js (SONGS, targetsOf).

   A level walks her through a short phrase from her book, repeated so it
   lasts long enough to practise (Do Re Do → 9 notes). At each note the app
   plays it, then listens:
     sung / played right → she jumps over it and the note name pops up
     clearly off          → she stumbles; the note stays for another try
     silence / unclear    → nothing happens (never a jump in silence)

   Pitch matching (matcher) — engineering starting values, not norms:
     tolerance   ±75 cents (beginner)
     stable      the pitch must hold ≥ 120 ms within ±50 cents of itself
     fresh onset after any judgement she must stop or change note before the
                 next one counts, so one long "Do" can't pass Do–Do
     singing     octave-forgiving (children rarely sing in the written octave);
                 keys / MIDI use the exact note (judgeKey)
*/
(function(root){
  'use strict';
  const MC = root.MusicCore || (typeof require !== 'undefined' ? require('./music-core.js') : null);
  const GC = root.GardenCore || (typeof require !== 'undefined' ? require('./garden-core.js') : null);

  const DEFAULTS = { tolCents: 75, stableMs: 120, selfCents: 50, minClarity: 0.8, releaseMs: 80, reps: 3 };
  const SOLF = ['Do', 'Do♯', 'Re', 'Re♯', 'Mi', 'Fa', 'Fa♯', 'Sol', 'Sol♯', 'La', 'La♯', 'Ti'];

  // one level per book song, each a different tune: a 3–4 note song repeats
  // 3× (Do Re Do → 9 notes), up to 8 notes twice, longer songs play whole
  function levelFrom(song, reps){
    const phrase = GC.targetsOf(song).map(t => t.m);
    reps = reps || (phrase.length <= 4 ? DEFAULTS.reps : phrase.length <= 8 ? 2 : 1);
    const notes = [];
    for(let r = 0; r < reps; r++) phrase.forEach((m, i) => notes.push({ m, name: SOLF[MC.pc(m)], rep: r, i }));
    return { id: 'adv_' + song.id, songId: song.id, title: song.title, phrase, notes };
  }

  // cents from the target; octave-free folds to the nearest octave of it
  function centsOff(midiFloat, target, octaveFree){
    let c = (midiFloat - target) * 100;
    if(octaveFree) c -= 1200 * Math.round(c / 1200);
    return c;
  }
  const freqToMidi = (f) => 69 + 12 * Math.log2(f / 440);

  // Feed one mic frame at a time: push({ t (ms), freq|null, clarity }).
  // Returns null, or one judgement { ok, midi, cents, clarity } per sung note.
  function matcher(target, o){
    o = Object.assign({}, DEFAULTS, o || {});
    let run = null;              // the note being held: { t0, last, ms:[], cl:[] }
    let needRelease = false;     // a judgement was made: wait for silence or a new note
    let quietSince = null;
    const med = (a) => { const s = a.slice().sort((x, y) => x - y); return s[s.length >> 1]; };
    return {
      get target(){ return target; },
      setTarget(m){ target = m; run = null; needRelease = true; quietSince = null; },
      // outside her turn (the app's own note playing, walking, jumping):
      // never judge; real silence still ends a note, sound does not — so one
      // long held "Do" can't count again for the next Do
      observe(f){
        const voiced = f && f.freq > 0 && f.clarity >= o.minClarity;
        if(voiced){ quietSince = null; return; }
        if(quietSince == null) quietSince = f ? f.t : 0;
        if(f && f.t - quietSince >= o.releaseMs){ needRelease = false; run = null; }
      },
      push(f){
        const voiced = f && f.freq > 0 && f.clarity >= o.minClarity;
        if(!voiced){
          if(quietSince == null) quietSince = f ? f.t : 0;
          if(f && f.t - quietSince >= o.releaseMs){ needRelease = false; run = null; }
          return null;
        }
        quietSince = null;
        const m = freqToMidi(f.freq);
        if(run && Math.abs((m - med(run.ms)) * 100) > o.selfCents){
          run = null; needRelease = false;           // she moved to another note: a fresh onset
        }
        if(needRelease) return null;
        if(!run) run = { t0: f.t, ms: [], cl: [] };
        run.ms.push(m); run.cl.push(f.clarity); run.last = f.t;
        if(f.t - run.t0 < o.stableMs) return null;
        const mid = med(run.ms), cents = centsOff(mid, target, o.octaveFree !== false);
        needRelease = true;
        const clarity = run.cl.reduce((a, b) => a + b, 0) / run.cl.length;
        run = null;
        return { ok: Math.abs(cents) <= o.tolCents, midi: +mid.toFixed(2), cents: Math.round(cents), clarity: +clarity.toFixed(2) };
      },
    };
  }
  // on-screen keys / MIDI: the exact note, octave included
  const judgeKey = (m, target) => m === target;

  // results[i] = { m, name, tries, firstTry } for each note she finished
  function summary(level, results){
    const total = level.notes.length, hit = results.filter(Boolean).length;
    const first = results.filter(r => r && r.firstTry).length;
    const byName = {};
    level.notes.forEach((n, i) => {
      const r = results[i], b = byName[n.name] = byName[n.name] || { name: n.name, m: n.m, n: 0, first: 0 };
      b.n++; if(r && r.firstTry) b.first++;
    });
    const chips = Object.values(byName).map(b => ({ name: b.name, m: b.m, matched: b.first === b.n, first: b.first, n: b.n }));
    const weak = chips.filter(c => !c.matched).sort((a, b) => a.first / a.n - b.first / b.n)[0] || null;
    return { total, hit, first, pct: total ? Math.round(first / total * 100) : 0, chips,
      line: weak ? `Great effort! Let's practise ${weak.name} one more time.` : hit === total ? 'Every note on the first try!' : 'Great effort!' };
  }

  const AdventureCore = { DEFAULTS, SOLF, levelFrom, centsOff, freqToMidi, matcher, judgeKey, summary };
  root.AdventureCore = AdventureCore;
  if(typeof module !== 'undefined' && module.exports) module.exports = AdventureCore;
})(typeof window !== 'undefined' ? window : globalThis);

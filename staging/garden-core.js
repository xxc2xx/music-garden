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

  /* ── Today's plan (plan D5): one stable snapshot per day ──
     steps run in the rules' order; `needs` are checked on this device when
     the plan is built AND again when a step starts. An optional step whose
     need is missing runs its fallback (Sing → "I sang it"). The day is done
     when every REQUIRED step is done. rewarded[stepId] = strawberries paid. */
  const STEP_DEFS = {
    hear:  { required: true,  needs: [] },
    sing:  { required: false, needs: ['mic'], fallback: 'self' },
    find:  { required: true,  needs: [] },
    play:  { required: true,  needs: [] },
    read:  { required: true,  needs: [] },
    write: { required: false, needs: ['feature:write'] },
  };
  const STATUSES = ['pending', 'active', 'done', 'skipped', 'unavailable'];
  const featureOn = (n) => !!(RULES.features || {})[n.slice(8)];
  // how a step runs here: 'full', its fallback, or 'unavailable'
  function stepMode(step, caps){
    const def = STEP_DEFS[step && step.type]; if(!def) return 'unavailable';
    const ok = def.needs.every(n => n.startsWith('feature:') ? featureOn(n) : !!(caps || {})[n]);
    return ok ? 'full' : def.fallback || 'unavailable';
  }
  function buildPlan(day, songId, caps){
    const steps = RULES.today.order
      .filter(t => STEP_DEFS[t] && STEP_DEFS[t].needs.every(n => !n.startsWith('feature:') || featureOn(n)))   // a feature that is off: no dead step
      .map(t => ({ id: t, type: t, required: STEP_DEFS[t].required, needs: STEP_DEFS[t].needs.slice(), fallback: STEP_DEFS[t].fallback || null, status: 'pending' }));
    steps.forEach(s => { if(stepMode(s, caps) === 'unavailable') s.status = 'unavailable'; });
    return { id: 'p_' + day, day, rules: RULES.version, song: songId, steps, rewarded: {} };
  }
  // a saved snapshot → today's plan, or null (other day, unknown song, old or
  // damaged format: the caller builds a fresh one). A step type this version
  // doesn't know becomes 'unavailable'; a step left 'active' runs again.
  function restorePlan(snap, day, songIds){
    if(!snap || typeof snap !== 'object' || snap.day !== day || !songIds.includes(snap.song) || !Array.isArray(snap.steps) || !snap.steps.length) return null;
    const steps = [];
    for(const s of snap.steps){
      if(!s || typeof s.id !== 'string' || typeof s.type !== 'string') return null;
      const known = !!STEP_DEFS[s.type], st = STATUSES.includes(s.status) ? s.status : 'pending';
      steps.push({ id: s.id, type: s.type, required: known ? STEP_DEFS[s.type].required : false, needs: known ? STEP_DEFS[s.type].needs.slice() : [],
        fallback: known ? STEP_DEFS[s.type].fallback || null : null, status: !known ? 'unavailable' : st === 'active' ? 'pending' : st });
    }
    const rewarded = {};
    Object.entries(snap.rewarded && typeof snap.rewarded === 'object' ? snap.rewarded : {}).forEach(([k, v]) => {
      const st = steps.find(s => s.id === k);
      if(st && Number.isFinite(v) && v > 0) rewarded[k] = Math.min(Math.floor(v), RULES.today.rewards[st.type] || 1);
    });
    return { id: 'p_' + day, day, rules: typeof snap.rules === 'string' ? snap.rules : RULES.version, song: snap.song, steps, rewarded };
  }
  const nextStep = (plan) => plan.steps.findIndex(s => s.status === 'pending' || s.status === 'active');
  const planComplete = (plan) => plan.steps.every(s => !s.required || s.status === 'done');
  // a finished step earns 1..max (taking part always counts); a replay only
  // pays the difference up to its best, so reloads and replays never re-grant
  function topUp(plan, step, earned){
    const max = RULES.today.rewards[step.type] || 1;
    const n = Math.max(1, Math.min(max, Math.floor(earned) || 0)), had = plan.rewarded[step.id] || 0;
    if(n <= had) return 0;
    plan.rewarded[step.id] = n;
    return n - had;
  }
  const planBerries = (plan) => Object.values(plan.rewarded).reduce((a, b) => a + b, 0);
  // the little tune she sings back: the song's opening notes up to its first
  // rest (2–4 notes), e.g. Hot Cross Buns → Mi Re Do
  function singPattern(song){
    const out = [];
    for(const [m] of song.notes){ if(m == null){ if(out.length >= 2) break; continue; } out.push(m); if(out.length === 4) break; }
    return out;
  }

  const GardenCore = { SONGS, beatsPerBar, targetsOf, songBeats, WIN, POINTS, verdictOf, scoreOf, berriesFor, timingSummary, distractors,
    STEP_DEFS, stepMode, buildPlan, restorePlan, nextStep, planComplete, topUp, planBerries, singPattern };
  root.GardenCore = GardenCore;
  if(typeof module !== 'undefined' && module.exports) module.exports = GardenCore;
})(typeof window !== 'undefined' ? window : globalThis);

/* adventure.js — Melody Adventure: a 2D pixel side-scroller over her book's
   phrases. Classic script → window.Adventure. Depends on garden.js
   (window.Garden.bridge), adventure-core.js, hear.js, sound.js.

   Learn & Explore mode (no timing pressure): she walks up to each note, the
   app plays it, then listens.
     right note → she jumps over it and the note name pops up like a coin
     clear miss → she stumbles; the note stays, the app plays it again
     silence    → nothing (after a while the app plays the note again)
   The mic opens only for the level (G3) and ignores the app's own notes
   (mute window). On-screen keys and her MIDI keyboard always work too —
   they need the exact note; singing may be in any octave.
   Character: the generic GroovyG sprite from Beat Hive (never her likeness).
*/
(function(){
  'use strict';
  const B = window.Garden.bridge, MC = B.MC, AC = window.AdventureCore, GC = window.GardenCore;
  const $ = (s) => document.querySelector(s);

  /* ── Pixel art (16×16, digits index the palette, '.' = empty) ── */
  const GIRL = { pal: ['#1A1A1A', '#F2C9A0', '#F0348A', '#FFFFFF', '#E8253F', '#2A1A12'], px: [
    '..111.54.45.111.', '..111.55455.111.', '...1111111111...', '..111111111111..', '..111111111111..',
    '..112662266211..', '..112222222211..', '....22222222....', '22..11111111..22', '.2..11111111..2.',
    '...4444444444...', '..333433343333..', '.33343333433343.', '.43333433343333.', '....22....22....', '...222....222...'] };
  // poses map an output pixel back to the base sprite (as Beat Hive does)
  function poseXY(pose, x, y){
    switch(pose){
      case 'step':  return [x + (y > 12 ? (x < 8 ? 1 : -1) : 0), y];          // legs apart
      case 'jump':  return [x, y + (y > 12 ? 1 : 0)];                           // legs tucked
      case 'lean':  return [x + Math.round(2 * (15 - y) / 15), y];              // stumble back
      case 'squash':return [x, Math.round((y - 2) * 16 / 14)];
      default:      return [x, y];
    }
  }
  function drawSprite(g, spr, pose, x, y, scale, flash){
    for(let py = 0; py < 16; py++) for(let px = 0; px < 16; px++){
      const [sx, sy] = poseXY(pose, px, py);
      if(sx < 0 || sx > 15 || sy < 0 || sy > 15) continue;
      const c = spr.px[sy][sx]; if(c === '.') continue;
      g.fillStyle = flash && c !== '6' ? flash : spr.pal[+c - 1] || '#000';
      g.fillRect(Math.round(x + px * scale), Math.round(y + py * scale), scale, scale);
    }
  }

  /* ── World ── */
  const W = 240, H = 135, GROUND = 104, SP = 2, GAP = 70, FIRST = 110;
  const COL = { skyTop: '#CDB8FF', skyBot: '#FFE3F1', hillFar: '#E9D8FF', hillNear: '#D9C3FF', dirt: '#F6DDB6', dirtDark: '#E9C796',
    grass: '#9ED68E', grassDark: '#6FB566', ink: '#3A2E4F', cloud: '#FFFFFF', flag: '#F0348A' };

  let adv = null;                       // the running level
  function noteX(i){ return FIRST + i * GAP; }

  function open(song){
    B.actx(); B.show('adventure');
    const level = AC.levelFrom(song || GC.SONGS[0]);
    const lifeNow = B.life();
    adv = { level, lifeNow, i: 0, x: 20, y: 0, state: 'walk', t: 0, tState: 0, results: [], tries: 0, pops: [], sparks: [],
      done: level.notes.map(() => false), stumbleAt: -1, camX: 0, mic: null, micState: 'off', lastVoice: 0, matcher: AC.matcher(level.notes[0].m),
      ses: B.track('g-adventure', { contentId: level.id, extra: { title: level.title, notes: level.notes.length } }) };
    lifeNow.onEnd(stop);
    $('#advTitle').textContent = level.title;
    $('#advSum').hidden = true;
    $('#advMsg').textContent = '';
    // G3–G4 (Do is the 4th key); a left-hand tune gets the octave below (G2–G3)
    const lo = Math.min(...level.notes.map(n => n.m)) < 55 ? 43 : 55;
    adv.keys = [lo, lo + 12];
    B.buildPiano($('#advPiano'), lo, lo + 12, { labels: B.S().labels });
    B.setSink((m, t, src) => onKey(m, src));
    sizeCanvas();
    startMic();
    let last = performance.now();
    const loop = (ts) => {
      if(!adv || adv.lifeNow !== lifeNow || !lifeNow.alive) return;
      const dt = Math.min(0.05, (ts - last) / 1000); last = ts;
      step(dt); draw();
      adv.raf = requestAnimationFrame(loop);
    };
    adv.raf = requestAnimationFrame(loop);
    B.say(`Let's go! Sing each note.`);
  }
  function stop(){
    if(!adv) return;
    cancelAnimationFrame(adv.raf);
    micStop();
    try{ Sound.cancel('adv'); }catch(e){}
    if(adv.ses && !adv.ses.ended) B.close(adv.ses, 'exited', { hit: adv.results.filter(Boolean).length });
    B.setSink(null);
    adv = null;
  }

  /* ── Flow ── */
  function setState(s){ adv.state = s; adv.tState = 0; }
  function cur(){ return adv.level.notes[adv.i]; }
  function hearNote(){
    const c = B.actx(), n = cur(); if(!c || !n) return;
    Sound.schedule(n.m, c.currentTime + 0.05, 0.75, { vel: 90, tag: 'adv' });
    B.mute(1.1);                                    // the mic must not hear the app's note
    adv.matcher.setTarget(n.m);                     // her answer needs a fresh note after this
    $('#advMsg').textContent = 'Listen…';
  }
  function step(dt){
    adv.t += dt; adv.tState += dt;
    const n = cur();
    if(adv.state === 'walk'){
      const stopAt = n ? noteX(adv.i) - 30 : noteX(adv.level.notes.length) + 10;
      adv.x = Math.min(stopAt, adv.x + 46 * dt);
      if(adv.x >= stopAt){ if(n){ setState('hear'); hearNote(); } else finish(); }
    } else if(adv.state === 'hear'){
      if(adv.tState > 1.15){ setState('turn'); $('#advMsg').textContent = adv.micState === 'on' ? `Your turn — sing ${n.name}!` : `Your turn — find ${n.name}!`; }
    } else if(adv.state === 'turn'){
      if(adv.tState > 8){ setState('hear'); hearNote(); }         // quiet for a while: hear it again (not a try)
    } else if(adv.state === 'jump'){
      const p = Math.min(1, adv.tState / 0.7), x0 = noteX(adv.i - 1) - 30;
      adv.x = x0 + 60 * p; adv.y = -Math.sin(Math.PI * p) * 34;
      if(p >= 1){ adv.y = 0; setState('walk'); }
    } else if(adv.state === 'stumble'){
      const p = Math.min(1, adv.tState / 0.6);
      adv.y = -Math.sin(Math.PI * p) * 6; adv.x = noteX(adv.i) - 30 - Math.sin(Math.PI * p) * 6;
      if(p >= 1){ adv.y = 0; setState('hear'); hearNote(); }
    }
    adv.pops.forEach(p => { p.t += dt; }); adv.pops = adv.pops.filter(p => p.t < 1.1);
    adv.sparks.forEach(s => { s.t += dt; s.x += s.vx * dt; s.y += s.vy * dt; s.vy += 90 * dt; }); adv.sparks = adv.sparks.filter(s => s.t < 0.7);
    const want = Math.max(0, adv.x - 70);
    adv.camX += (want - adv.camX) * Math.min(1, dt * 5);
  }
  // one judgement for the current note (mic or keys)
  function judge(ok, how){
    if(!adv || adv.state !== 'turn') return;
    const n = cur();
    adv.tries++;
    adv.ses.attempt(Object.assign({ target: { m: n.m, i: adv.i }, outcome: ok ? 'correct' : 'wrong', firstTry: adv.tries === 1 }, how));
    if(ok){
      adv.results[adv.i] = { m: n.m, name: n.name, tries: adv.tries, firstTry: adv.tries === 1 };
      adv.done[adv.i] = true;
      const nx = noteX(adv.i);
      adv.pops.push({ x: nx, y: GROUND - 34, text: n.name, col: MC.colorOf(n.m), t: 0 });
      for(let k = 0; k < 10; k++) adv.sparks.push({ x: nx, y: GROUND - 26, vx: (Math.random() - 0.5) * 90, vy: -40 - Math.random() * 60, t: 0, col: k % 2 ? '#FFE27A' : MC.colorOf(n.m) });
      B.chime(); B.say(n.name + '!');
      adv.i++; adv.tries = 0;
      if(cur()) adv.matcher.setTarget(cur().m);
      setState('jump');
      $('#advMsg').textContent = '';
    } else {
      B.boop();
      setState('stumble');
      $('#advMsg').textContent = 'Oops — listen again!';
    }
  }
  function onKey(m, src){
    if(!adv) return;
    if(adv.state !== 'turn') return;                    // keys still make sound, they just don't count yet
    judge(AC.judgeKey(m, cur().m), { skill: 'motor', observed: { m }, evidence: 'clock', extra: { src } });
  }
  function finish(){
    setState('end');
    const sm = AC.summary(adv.level, adv.results);
    B.close(adv.ses, 'completed', { hit: sm.hit, total: sm.total, firstTry: sm.first, pct: sm.pct });
    const berries = B.berriesFor(sm.pct);
    const add = B.grantOnce('adv:' + adv.level.id, Math.max(1, berries));
    micStop();
    $('#advMsg').textContent = '';
    $('#advHit').textContent = sm.hit; $('#advTotal').textContent = sm.total; $('#advPct').textContent = sm.pct + '%';
    $('#advChips').innerHTML = sm.chips.map(c => `<span class="advchip ${c.matched ? 'ok' : 'again'}" style="--c:${MC.colorOf(c.m)}"><b>${c.name}</b>${c.matched ? 'Matched' : 'Practise'}</span>`).join('');
    $('#advLine').textContent = sm.line + (add ? ` +${add} strawberr${add === 1 ? 'y' : 'ies'}!` : '');
    $('#advSum').hidden = false;
    B.chime(); B.say(`Melody complete! ${sm.line}`);
    const idx = GC.SONGS.findIndex(s => s.id === adv.level.songId), next = GC.SONGS[idx + 1];
    $('#advNext').hidden = !next;
    $('#advNext').onclick = () => open(next);
    const again = GC.SONGS[idx];
    $('#advAgain').onclick = () => open(again);
    done.last = { level: adv.level.id, summary: sm };
  }
  const done = {};

  /* ── Microphone: frames → matcher → judge ── */
  async function startMic(){
    const a = adv, md = navigator.mediaDevices;
    if(!md || !md.getUserMedia){ a.micState = 'none'; return; }
    a.micState = 'starting';
    let stream;
    try{ stream = await md.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false } }); }
    catch(e){ if(adv === a){ a.micState = 'denied'; $('#advMic').textContent = 'No microphone — tap the keys'; } return; }
    if(adv !== a || !a.lifeNow.alive){ stream.getTracks().forEach(t => t.stop()); return; }
    const c = B.actx(), src = c.createMediaStreamSource(stream), an = c.createAnalyser();
    an.fftSize = 2048; an.smoothingTimeConstant = 0; src.connect(an);
    const buf = new Float32Array(an.fftSize);
    const iv = setInterval(() => {
      if(adv !== a) return;
      an.getFloatTimeDomainData(buf);
      let r = 0; for(let i = 0; i < buf.length; i++) r += buf[i] * buf[i]; r = Math.sqrt(r / buf.length);
      const t = performance.now(), res = r < 0.01 ? null : Hear.mpm(buf, c.sampleRate);
      const f = res ? { t, freq: res.freq, clarity: res.clarity } : { t, freq: null, clarity: 0 };
      if(B.muted() || a.state !== 'turn'){ a.matcher.observe(f); return; }     // the app's own note / not her turn
      const out = a.matcher.push(f);
      if(out) judge(out.ok, { skill: 'echo', observed: { m: Math.round(out.midi) }, evidence: 'mic-verified', conf: out.clarity, extra: { cents: out.cents } });
    }, 20);
    a.mic = { stream, src, iv }; a.micState = 'on';
    $('#advMic').textContent = 'Listening 🎤';
  }
  function micStop(){
    const a = adv; if(!a || !a.mic) return;
    clearInterval(a.mic.iv);
    try{ a.mic.stream.getTracks().forEach(t => t.stop()); }catch(e){}
    try{ a.mic.src.disconnect(); }catch(e){}
    a.mic = null; a.micState = 'off'; $('#advMic').textContent = '';
  }

  /* ── Drawing ── */
  let cv = null, g = null;
  function sizeCanvas(){
    cv = $('#advCanvas'); if(!cv) return;
    cv.width = W; cv.height = H; g = cv.getContext('2d'); g.imageSmoothingEnabled = false;
  }
  function px(x, y, w, h, c){ g.fillStyle = c; g.fillRect(Math.round(x), Math.round(y), w, h); }
  function draw(){
    if(!g || !adv) return;
    const cam = Math.round(adv.camX);
    // sky in pixel bands
    for(let b = 0; b < 6; b++){ g.fillStyle = mix(COL.skyTop, COL.skyBot, b / 5); g.fillRect(0, b * 18, W, 18); }
    // clouds + hills (parallax)
    [[30, 18], [130, 30], [220, 14], [320, 26]].forEach(([x, y]) => cloud(((x - cam * 0.2) % 360 + 360) % 360 - 40, y));
    for(let x = 0; x < W; x += 4){ const wx = x + cam * 0.4; const h = 18 + Math.round(8 * Math.sin(wx / 37) + 5 * Math.sin(wx / 13)); px(x, GROUND - h, 4, h, COL.hillFar); }
    for(let x = 0; x < W; x += 4){ const wx = x + cam * 0.7; const h = 9 + Math.round(5 * Math.sin(wx / 23 + 1)); px(x, GROUND - h, 4, h, COL.hillNear); }
    // ground: grass top + dirt tiles
    px(0, GROUND, W, 4, COL.grass); px(0, GROUND + 4, W, 2, COL.grassDark); px(0, GROUND + 6, W, H - GROUND - 6, COL.dirt);
    for(let x = -((cam) % 16); x < W; x += 16){ px(x + 2, GROUND + 12, 4, 3, COL.dirtDark); px(x + 10, GROUND + 22, 3, 3, COL.dirtDark); }
    // notes
    adv.level.notes.forEach((n, i) => { const x = noteX(i) - cam; if(x > -30 && x < W + 30) noteBlock(x, n, adv.done[i], i === adv.i); });
    // finish flag
    const fx = noteX(adv.level.notes.length) + 30 - cam;
    if(fx < W + 20){ px(fx, GROUND - 44, 2, 44, COL.ink); px(fx + 2, GROUND - 44, 16, 10, COL.flag); px(fx + 2, GROUND - 34, 10, 2, COL.flag); }
    // her
    const pose = adv.state === 'jump' ? 'jump' : adv.state === 'stumble' ? 'lean' : adv.state === 'walk' ? (Math.floor(adv.t * 7) % 2 ? 'step' : 'base')
      : adv.state === 'end' ? (Math.floor(adv.t * 3) % 2 ? 'jump' : 'base') : 'base';
    const flash = adv.state === 'stumble' && Math.floor(adv.tState * 12) % 2 ? '#FF8FA3' : null;
    drawSprite(g, GIRL, pose, adv.x - cam - 16, GROUND - 32 + adv.y, SP, flash);
    // speech bubble while it's her turn / listening
    if(adv.state === 'hear' || adv.state === 'turn'){
      const bx = adv.x - cam - 4, by = GROUND - 56 + Math.round(Math.sin(adv.t * 6) * (adv.state === 'turn' ? 1.5 : 0));
      px(bx, by, 22, 14, '#FFFFFF'); px(bx + 4, by + 14, 4, 3, '#FFFFFF');
      g.fillStyle = COL.ink; g.font = 'bold 9px system-ui'; g.textAlign = 'center';
      g.fillText(adv.state === 'hear' ? '♪' : (adv.micState === 'on' ? '🎤' : '👆'), bx + 11, by + 11);
    }
    // coin-style pops + sparkles
    adv.pops.forEach(p => {
      const k = p.t / 1.1, y = p.y - 30 * Math.min(1, k * 1.6);
      g.globalAlpha = k < 0.7 ? 1 : Math.max(0, 1 - (k - 0.7) / 0.3);
      g.font = 'bold 14px "Baloo 2",system-ui'; g.textAlign = 'center'; g.lineWidth = 3; g.strokeStyle = '#FFFFFF';
      g.strokeText(p.text, p.x - cam, y); g.fillStyle = p.col; g.fillText(p.text, p.x - cam, y);
      g.globalAlpha = 1;
    });
    adv.sparks.forEach(s => { g.globalAlpha = Math.max(0, 1 - s.t / 0.7); px(s.x - cam, s.y, 2, 2, s.col); g.globalAlpha = 1; });
  }
  function noteBlock(x, n, done, now){
    const c = done ? '#E3D7F0' : MC.colorOf(n.m), y = GROUND, ink = done ? '#CFC2DF' : COL.ink;
    // a big pixel note standing on the grass: outlined head + stem + flag
    px(x - 11, y - 15, 22, 15, ink); px(x - 13, y - 12, 26, 9, ink);           // outline
    px(x - 10, y - 14, 20, 13, c);   px(x - 12, y - 11, 24, 7, c);             // head
    px(x - 10, y - 13, 3, 2, done ? c : '#FFFFFF');                            // shine (clear of the label)
    px(x + 9, y - 44, 4, 34, ink); px(x + 13, y - 44, 8, 5, ink); px(x + 13, y - 39, 5, 4, ink);
    if(!done){
      g.fillStyle = '#FFFFFF'; g.font = 'bold 9px system-ui'; g.textAlign = 'center'; g.fillText(n.name, x, y - 4);
      if(now){ const by = y - 58 + Math.round(Math.sin(adv.t * 5) * 2); px(x - 2, by, 4, 7, '#FFE27A'); px(x - 2, by + 9, 4, 3, '#FFE27A'); }   // "!" over the next note
    }
  }
  function cloud(x, y){ px(x, y, 22, 6, COL.cloud); px(x + 4, y - 4, 12, 4, COL.cloud); px(x - 3, y + 2, 28, 4, COL.cloud); }
  function mix(a, b, t){
    const p = (h) => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16)), A = p(a), Bc = p(b);
    return '#' + A.map((v, i) => Math.round(v + (Bc[i] - v) * t).toString(16).padStart(2, '0')).join('');
  }

  // first level she hasn't finished yet today (else the first)
  function nextSong(){
    const st = B.state(), keys = (st.grants && st.grants.keys) || {};
    return GC.SONGS.find(s => !keys['adv:adv_' + s.id]) || GC.SONGS[0];
  }
  // the page goes to the background: close the mic (it must never listen
  // unseen); coming back reopens it if the level is still going
  function onVisibility(hidden){
    if(!adv) return;
    if(hidden){ micStop(); try{ Sound.cancel('adv'); }catch(e){} }
    else if(adv.state !== 'end' && !adv.mic && adv.micState !== 'denied' && adv.micState !== 'none'){ startMic(); if(adv.state === 'turn'){ setState('hear'); hearNote(); } }
  }
  document.addEventListener('visibilitychange', () => onVisibility(document.hidden));

  // the level row on Home: one per book phrase, a tick once she has finished it today
  function renderLevels(){
    const box = $('#advLevels'); if(!box) return;
    const keys = (B.state().grants && B.state().grants.keys) || {};
    box.innerHTML = '';
    GC.SONGS.forEach((s, i) => {
      const b = document.createElement('button'); b.type = 'button';
      const doneToday = !!keys['adv:adv_' + s.id];
      b.className = 'advlevel' + (doneToday ? ' done' : '');
      b.innerHTML = `${i + 1}<small>${s.title}</small>`;
      b.setAttribute('aria-label', `Level ${i + 1}: ${s.title}${doneToday ? ', done today' : ''}`);
      b.addEventListener('click', () => open(s));
      box.appendChild(b);
    });
  }
  $('#advPlay').addEventListener('click', () => open(nextSong()));
  $('#advHome').addEventListener('click', () => { B.show('home'); renderLevels(); });
  document.querySelectorAll('#adventure .home').forEach(b => b.addEventListener('click', renderLevels));
  renderLevels();

  // Home: she runs in place beside a note — only while Home is on screen
  (function hero(){
    const c = $('#advHero'); if(!c || !c.getContext) return;
    const hg = c.getContext('2d'); if(!hg || !hg.fillRect) return;
    hg.imageSmoothingEnabled = false;
    let t0 = performance.now();
    const tick = (ts) => {
      requestAnimationFrame(tick);
      if($('#home').hidden) return;
      const t = (ts - t0) / 1000, hop = Math.max(0, Math.sin(t * 3.2)) ;
      hg.clearRect(0, 0, c.width, c.height);
      hg.fillStyle = COL.grass; hg.fillRect(0, 34, c.width, 3); hg.fillStyle = COL.dirt; hg.fillRect(0, 37, c.width, 5);
      const nx = 70, col = MC.colorOf(60);
      hg.fillStyle = col; hg.fillRect(nx - 5, 27, 10, 7); hg.fillRect(nx - 6, 28, 12, 5); hg.fillStyle = COL.ink; hg.fillRect(nx + 4, 12, 2, 18);
      drawSprite(hg, GIRL, hop > 0.2 ? 'jump' : (Math.floor(t * 7) % 2 ? 'step' : 'base'), 22, 18 - Math.round(hop * 10), 1, null);
    };
    requestAnimationFrame(tick);
  })();
  window.Adventure = { open, _visibility: onVisibility, _state: () => adv, _last: () => done.last, _judge: (ok) => judge(ok, { skill: 'motor', evidence: 'clock' }) };
})();

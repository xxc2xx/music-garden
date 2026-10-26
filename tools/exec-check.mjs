// node tools/exec-check.mjs — boots the REAL app scripts (vendored engine +
// garden-rules/core + garden.js) in a fake DOM with fake time, then injects
// failures. Catches what a parse check can't: init-order (TDZ) errors, null
// lookups, storage that throws, corrupt saved data, and callbacks that fire
// after the child has left a screen.
//
// Known bugs are listed in XFAIL with their audit id: they are EXPECTED to
// fail until their PR lands. If one starts passing, the gate tells you to
// move it out of XFAIL (so a fix can't silently regress later).
import fs from 'fs';
import path from 'path';
import vm from 'vm';
import { fileURLToPath } from 'url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const SCRIPTS = (fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8').match(/<script src="([\w.-]+\.js)"><\/script>/g) || [])
  .map(t => t.match(/src="([^"]+)"/)[1]);
const XFAIL = {};                      // audit id → PR that fixes it

// ── fake DOM ─────────────────────────────────────────────────────────────
class ClassList { constructor(){ this.s = new Set(); } add(...c){ c.forEach(x => this.s.add(x)); } remove(...c){ c.forEach(x => this.s.delete(x)); }
  toggle(c, f){ const on = f === undefined ? !this.s.has(c) : !!f; on ? this.s.add(c) : this.s.delete(c); return on; } contains(c){ return this.s.has(c); } }
function makeEnv(opts){
  opts = opts || {};
  const reg = new Map(), created = [];
  let clock = 0, seq = 0; const timers = new Map();
  const spoken = [];
  class El {
    constructor(tag, id){ this.tagName = String(tag).toUpperCase(); this.id = id || ''; this.hidden = false; this.dataset = {}; this.attrs = {};
      this.listeners = {}; this.children = []; this._html = ''; this.textContent = ''; this.classList = new ClassList(); this.value = ''; this.checked = false;
      this.clientWidth = 900; this.clientHeight = 600; this.scrollLeft = 0; this.parentNode = null;
      this.style = { setProperty(){}, removeProperty(){}, cssText: '' }; }
    get className(){ return [...this.classList.s].join(' '); } set className(v){ this.classList = new ClassList(); String(v).split(/\s+/).filter(Boolean).forEach(c => this.classList.add(c)); }
    get innerHTML(){ return this._html; } set innerHTML(v){ this._html = String(v); this.children = []; }
    insertAdjacentHTML(_, h){ this._html += h; }
    appendChild(c){ this.children.push(c); c.parentNode = this; return c; }
    addEventListener(t, f){ (this.listeners[t] = this.listeners[t] || []).push(f); } removeEventListener(){}
    fire(t, ev){ (this.listeners[t] || []).slice().forEach(f => f(Object.assign({ type: t, target: this, preventDefault(){}, detail: 1, pointerId: 1 }, ev || {}))); }
    click(){ this.fire('click'); }
    querySelector(sel){ return sel.startsWith('#') ? doc.getElementById(sel.slice(1)) : new El('div'); }
    querySelectorAll(){ return []; }
    setAttribute(k, v){ this.attrs[k] = String(v); } getAttribute(k){ return k in this.attrs ? this.attrs[k] : null; } removeAttribute(k){ delete this.attrs[k]; }
    getBoundingClientRect(){ return { left: 0, top: 0, width: 100, height: 100 }; } getBBox(){ return { x: 0, y: 0, width: 10, height: 10 }; }
    setPointerCapture(){} releasePointerCapture(){} focus(){} remove(){}
    getContext(){ return { font: '', measureText: () => ({ actualBoundingBoxAscent: 75, actualBoundingBoxDescent: 25, actualBoundingBoxLeft: 0 }) }; }
    play(){ return Promise.resolve(); } pause(){}
  }
  const homes = [0, 1, 2, 3].map(i => new El('button', 'home' + i));
  const doc = {
    body: new El('body'), hidden: false,
    getElementById(id){ if(!reg.has(id)) reg.set(id, new El('div', id)); return reg.get(id); },
    querySelector(sel){ return sel.startsWith('#') ? doc.getElementById(sel.slice(1)) : new El('div'); },
    querySelectorAll(sel){ return sel === '.home' ? homes : []; },
    createElement(tag){ const e = new El(tag); created.push(e); return e; },
    createRange(){ return { selectNodeContents(){} }; },
    addEventListener(){}, removeEventListener(){},
  };
  const store = {};
  const ls = opts.storage === 'throws'
    ? { getItem(){ throw new Error('SecurityError'); }, setItem(){ throw new Error('SecurityError'); }, removeItem(){ throw new Error('SecurityError'); } }
    : { getItem: k => (k in store ? store[k] : null), setItem: (k, v) => { if(opts.storage === 'quota') throw Object.assign(new Error('QuotaExceededError'), { name: 'QuotaExceededError' }); store[k] = String(v); }, removeItem: k => { delete store[k]; } };
  Object.assign(store, opts.seed || {});
  const win = {
    document: doc, localStorage: ls, console: { log(){}, warn(){}, error(){} },
    location: { pathname: '/music-garden/', search: '?env=test', hostname: 'example.test' },
    navigator: {}, performance: { now: () => clock },
    setTimeout: (f, ms) => { const id = ++seq; timers.set(id, { t: clock + (ms || 0), f }); return id; },
    clearTimeout: (id) => timers.delete(id),
    setInterval: (f, ms) => { const id = ++seq; timers.set(id, { t: clock + ms, f, every: ms }); return id; },
    clearInterval: (id) => timers.delete(id),
    requestAnimationFrame: (f) => win.setTimeout(() => f(clock), 16), cancelAnimationFrame: (id) => timers.delete(id),
    speechSynthesis: { speak(u){ spoken.push(u.text); }, cancel(){}, speaking: false },
    SpeechSynthesisUtterance: class { constructor(t){ this.text = t; } },
    getSelection: () => ({ removeAllRanges(){}, addRange(){} }),
    addEventListener(){}, removeEventListener(){},
  };
  // optional fake Web Audio + microphone (counts opens/closes; no real sound)
  const mic = { opens: 0, live: 0, denied: !!opts.micDenied, freq: null };
  if(opts.audio){
    const param = () => ({ value: 0, setValueAtTime(){}, exponentialRampToValueAtTime(){}, linearRampToValueAtTime(){}, setTargetAtTime(){}, cancelScheduledValues(){} });
    const node = () => ({ connect(){}, disconnect(){}, start(){}, stop(){}, setPeriodicWave(){}, gain: param(), frequency: param(), detune: param(), Q: param(), pan: param(),
      threshold: param(), knee: param(), ratio: param(), attack: param(), release: param(), delayTime: param(), offset: param(),
      fftSize: 2048, smoothingTimeConstant: 0, buffer: null, type: '', curve: null, onended: null,
      getFloatTimeDomainData(b){ if(mic.freq == null || !mic.live) return b.fill(0); for(let i = 0; i < b.length; i++) b[i] = 0.3 * Math.sin(2 * Math.PI * mic.freq * i / 48000); } });
    win.AudioContext = class { constructor(){ this.state = 'running'; this.sampleRate = 48000; this.destination = node(); this.outputLatency = 0; this.baseLatency = 0; }
      get currentTime(){ return clock / 1000; } resume(){ return Promise.resolve(); } close(){ return Promise.resolve(); }
      createGain(){ return node(); } createOscillator(){ return node(); } createBufferSource(){ return node(); } createAnalyser(){ return node(); }
      createMediaStreamSource(){ return node(); } createBuffer(){ return { getChannelData: () => new Float32Array(16) }; }
      createBiquadFilter(){ return node(); } createDynamicsCompressor(){ return node(); } createWaveShaper(){ return node(); } createStereoPanner(){ return node(); }
      createDelay(){ return node(); } createConstantSource(){ return node(); } createPeriodicWave(){ return {}; } createMediaStreamDestination(){ return Object.assign(node(), { stream: {} }); } };
    if(opts.noMic) return finish();
    win.navigator.mediaDevices = { getUserMedia: () => mic.denied ? Promise.reject(Object.assign(new Error('denied'), { name: 'NotAllowedError' }))
      : (mic.opens++, mic.live++, Promise.resolve({ getTracks: () => [{ stop(){ mic.live--; } }] })) };
  }
  return finish();
  function finish(){
  win.window = win; win.self = win;
  const ctx = vm.createContext(win);
  const advance = (ms) => {
    const end = clock + ms;
    for(;;){
      let next = null; for(const [id, t] of timers) if(t.t <= end && (!next || t.t < next[1].t)) next = [id, t];
      if(!next) break;
      const [id, t] = next; clock = t.t;
      if(t.every) t.t += t.every; else timers.delete(id);
      t.f();
    }
    clock = end;
  };
  return { win, ctx, doc, reg, created, spoken, store, advance, homes, mic,
    $: (id) => doc.getElementById(id), boot(){ for(const f of SCRIPTS) vm.runInContext(fs.readFileSync(path.join(ROOT, f), 'utf8'), ctx, { filename: f }); } };
  }
}

// ── tests ────────────────────────────────────────────────────────────────
let fail = 0;
const result = (name, pass, detail) => {
  const x = XFAIL[name];
  if(x){ console.log(pass ? `  XPASS ${name} — fixed? move it out of XFAIL (${x})` : `  xfail ${name} (known, fix in ${x})`); if(pass) fail++; return; }
  console.log((pass ? '  ok    ' : '  FAIL  ') + name + (pass || !detail ? '' : ' — ' + detail)); if(!pass) fail++;
};
function test(name, opts, fn){
  const env = makeEnv(opts);
  try{ env.boot(); }catch(e){ return result(name, false, 'boot threw: ' + e.message); }
  try{ const r = fn(env); result(name, r === true, typeof r === 'string' ? r : ''); }catch(e){ result(name, false, 'threw: ' + e.message); }
}
// answer the current quiz question correctly (tries the newest answer buttons)
function answerQuiz(env){
  const btns = env.created.filter(e => e.classList.contains('ans') || e.classList.contains('choice')).slice(-3);
  const fb = env.$('quizFb'), yes = () => /Yes/.test(fb.innerHTML);
  fb.innerHTML = '';                            // the last question's "Yes!" must not count for this one
  for(const b of btns){ b.click(); if(yes()) return true; }
  for(const m of [60, 62, 64, 65, 67, 48, 50, 52, 53, 55]){ env.win.Garden._press(m); if(yes()) return true; }   // "find it on the piano"
  return false;
}

test('boots: home shown, Garden defined, env=test', {}, (env) =>
  !!env.win.Garden && env.$('home').hidden === false && env.$('quiz').hidden === true && env.win.MusicCore.env() === 'test' || 'bad boot state');

test('boots with localStorage throwing (private mode / blocked)', { storage: 'throws' }, (env) => {
  env.$('tQuiz').click(); env.advance(100);
  return env.$('quiz').hidden === false && answerQuiz(env) || 'quiz not usable without storage';
});

test('boots when storage is full (QuotaExceeded on write)', { storage: 'quota' }, (env) => {
  env.$('tQuiz').click(); return answerQuiz(env) || 'quiz not usable on a full disk';
});

test('corrupt saved data → defaults', { seed: { garden_v1: '{{not json' } }, (env) =>
  env.win.Garden._state().settings.tempo === 76 || 'settings not defaulted');

test('wrong-typed saved data → defaults', { seed: { garden_v1: JSON.stringify({ settings: 5, songs: 'x', quiz: null, days: {}, berries: 'lots' }) } }, (env) => {
  const s = env.win.Garden._state();
  return (s.settings.tempo === 76 && typeof s.songs === 'object' && !Array.isArray(s.songs) && Array.isArray(s.days) && typeof s.berries === 'number') || 'wrong types survived: ' + JSON.stringify({ songs: typeof s.songs, days: Array.isArray(s.days), berries: typeof s.berries });
});

test('G1: quiz auto-advance after Home', {}, (env) => {
  env.$('tQuiz').click();
  if(!answerQuiz(env)) return 'could not answer';
  const said = env.spoken.length;
  env.homes[0].click();                     // she leaves straight after a right answer
  env.advance(2500);
  return (env.spoken.length === said && env.$('home').hidden === false && env.$('done').hidden === true) || `after Home: spoke ${env.spoken.length - said} more, done shown=${!env.$('done').hidden}`;
});

test('G2: Learn finish after Home', {}, (env) => {
  env.$('tBook').click();
  const song = env.created.find(e => e.classList.contains('song')); song.click();
  env.$('mLearn').click();
  [60, 62, 60].forEach(m => env.win.Garden._press(m));
  env.homes[0].click();
  env.advance(1000);
  return !env.win.Garden._state().songs.drd || 'recorded a Learn result after she left';
});

test('Play! run ends cleanly when she leaves mid-song', {}, (env) => {
  env.$('tBook').click();
  env.created.find(e => e.classList.contains('song')).click();
  env.$('mPlay').click(); env.advance(1500);
  env.homes[0].click(); env.advance(8000);
  return (env.win.Garden._run() === null && env.$('result').hidden !== false) || 'run still alive after Home';
});

test('no uncaught errors recorded during these flows', {}, (env) => {
  env.$('tQuiz').click(); answerQuiz(env); env.advance(2000);
  env.$('tPiano').click(); env.win.Garden._press(64);
  return env.win.Garden._errors().length === 0 || JSON.stringify(env.win.Garden._errors());
});

const micMode = { audio: true, seed: { garden_v1: JSON.stringify({ settings: { input: 'mic' } }) } };
const flush = () => new Promise(r => setImmediate(r));   // let getUserMedia promises settle
async function atest(name, opts, fn){
  const env = makeEnv(opts);
  try{ env.boot(); }catch(e){ return result(name, false, 'boot threw: ' + e.message); }
  try{ const r = await fn(env); result(name, r === true, typeof r === 'string' ? r : ''); }catch(e){ result(name, false, 'threw: ' + e.message); }
}
const openSong = (env) => { env.$('tBook').click(); env.created.find(e => e.classList.contains('song')).click(); };

await atest('G3: opening a song does not open the mic', micMode, async (env) => {
  openSong(env); await flush();
  return env.mic.opens === 0 || `mic opened ${env.mic.opens}× just by opening the song`;
});
await atest('G3: Learn opens the mic and finishing releases it', micMode, async (env) => {
  openSong(env); env.$('mLearn').click(); await flush();
  if(env.mic.live !== 1) return `mic not open during Learn (live=${env.mic.live})`;
  [60, 62, 60].forEach(m => env.win.Garden._press(m)); env.advance(600); await flush();
  return env.mic.live === 0 || `mic still open after Learn finished (live=${env.mic.live})`;
});
await atest('G3: leaving mid-Play releases the mic', micMode, async (env) => {
  openSong(env); env.$('mPlay').click(); await flush();
  if(env.mic.live !== 1) return 'mic not open during Play!';
  env.advance(1500); env.homes[0].click(); await flush();
  return env.mic.live === 0 || 'mic left open after Home';
});
await atest('G3: Home while the mic permission is still pending → closed when it arrives', micMode, async (env) => {
  openSong(env); env.$('mLearn').click();       // getUserMedia not settled yet
  env.homes[0].click(); await flush();
  return env.mic.live === 0 || 'a late permission left the mic open';
});
await atest('mic denied → Learn still works with the screen keys', Object.assign({ micDenied: true }, micMode), async (env) => {
  openSong(env); env.$('mLearn').click(); await flush();
  [60, 62, 60].forEach(m => env.win.Garden._press(m)); env.advance(600);
  return !!env.win.Garden._state().songs.drd || 'Learn did not finish';
});
await atest('Again during the Learn finish delay records once', { audio: true }, async (env) => {
  openSong(env); env.$('mLearn').click();
  [60, 62, 60].forEach(m => env.win.Garden._press(m));
  env.$('mLearn').click();                      // she taps Learn again inside the 450 ms
  env.advance(1000);
  const a = (env.win.Garden._state().songs.drd || { attempts: [] }).attempts.length;
  return a === 0 || `recorded ${a} Learn result(s) from a run she restarted`;
});
await atest('Today: Home during the last quiz answer stays home', { audio: true }, async (env) => {
  env.$('play').click();
  for(let q = 0; q < 3; q++){ answerQuiz(env); env.advance(1800); }
  answerQuiz(env); env.homes[0].click(); env.advance(3000);
  return (env.$('home').hidden === false && env.$('song').hidden !== false && env.$('done').hidden !== false) || 'Today moved on after Home';
});

const d = new Date(), todayKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
// practice-log evidence (Codex P2): the store is swapped for the in-memory
// adapter after boot, so the attempts Garden writes can be read back
const memLearn = (env) => { const MC = env.win.MusicCore, A = MC.memAdapter(MC.LEARN_STORES), L = MC.createLearn(A); MC.learn = () => L; return A; };
await atest('Play!: a wrong key with nothing right after is logged as the wrong note', { audio: true }, async (env) => {
  const A = memLearn(env);
  openSong(env); env.$('mPlay').click(); await flush();
  const r = env.win.Garden._run(), spb = 60 / env.win.Garden._state().settings.tempo;
  const due = (r.beat0 + r.tg[0].beat * spb) * 1000;
  env.advance(Math.max(0, due - 40 - env.win.performance.now()));
  env.win.Garden._press(r.tg[0].m === 62 ? 64 : 62);           // a wrong key on the first note, never corrected
  env.advance(30000); await flush();
  const first = [...A.data.attempts.values()].sort((a, b) => a.t - b.t)[0];
  return (first && first.outcome === 'wrong' && first.observed && first.observed.m !== r.tg[0].m && first.evidence === 'clock')
    || 'first attempt: ' + JSON.stringify(first && { outcome: first.outcome, observed: first.observed, evidence: first.evidence });
});
test('Reset all progress also forgets an unfinished Today', { seed: { garden_v1: JSON.stringify({ today: { day: todayKey, song: 'drm', i: 1, berries: 1, done: false }, berries: 4 }) } }, (env) => {
  env.$('gReset').click(); env.$('gReset').click();
  return env.win.Garden._state().today === undefined || 'Today snapshot survived the reset';
});

// ── Today V2 (PR4): hear → sing → find → play → read, rewards once per step ──
const G = (env) => env.win.Garden;
const onSong = (env, only) => env.$('song').hidden === false && ['mListen', 'mLearn', 'mPlay'].every(id => env.$(id).hidden === (id !== only));
const stepOf = (env) => { const p = G(env)._plan(); return p ? p.steps.find(s => s.status === 'active') : null; };
const statusOf = (env) => JSON.parse(env.store['garden_v1@test'] || env.store.garden_v1 || '{}').today;
const berries = (env) => G(env)._state().berries;
const NOTES = { 60: 261.63, 62: 293.66, 64: 329.63, 65: 349.23, 67: 392.0 };
async function doHear(env){ env.$('mListen').click(); env.advance(4500); G(env)._todayNext(); }
async function singNotes(env, ms, notes){          // she sings into the fake mic
  env.advance(5000);                                // the tune + spoken hint finish first (the mic ignores them)
  env.$('singGo').click(); await flush(); env.advance(100);
  for(const m of notes){ env.mic.freq = NOTES[m]; env.advance(ms); env.mic.freq = null; env.advance(160); }
  env.advance(2500); await flush();
}
async function doFind(env, song){ env.$('mLearn').click(); song.forEach(m => G(env)._press(m)); env.advance(600); G(env)._todayNext(); }
async function doPlay(env){ env.$('mPlay').click(); env.advance(20000); G(env)._todayNext(); }
function doRead(env){ for(let q = 0; q < 12 && env.$('quiz').hidden === false; q++){ answerQuiz(env); env.advance(2500); } }

await atest('Today V2: full session with the mic allowed — singing is mic-verified', { audio: true }, async (env) => {
  const A = memLearn(env);
  env.$('play').click();
  if(!onSong(env, 'mListen')) return 'Today does not start with Listen';
  await doHear(env);
  if(env.$('sing').hidden !== false) return 'step 2 is not Sing';
  if(env.$('singGo').hidden) return 'My turn hidden although a mic exists';
  await singNotes(env, 400, [60, 62, 60]);
  if(env.mic.live !== 0) return 'mic still open after singing';
  const sung = [...A.data.attempts.values()].filter(a => a.skill === 'echo');
  if(!(sung.length === 1 && sung[0].outcome === 'correct' && sung[0].evidence === 'mic-verified')) return 'sing attempt: ' + JSON.stringify(sung.map(a => [a.outcome, a.evidence, a.observed])) + ' fb=' + env.$('singFb').textContent;
  if(env.$('singNext').hidden) return 'no Next after singing';
  G(env)._todayNext();
  if(!onSong(env, 'mLearn')) return 'step 3 is not Learn';
  await doFind(env, [60, 62, 60]);
  if(!onSong(env, 'mPlay')) return 'step 4 is not Play!';
  await doPlay(env);
  if(env.$('quiz').hidden !== false) return 'step 5 is not the quiz';
  doRead(env);
  if(env.$('done').hidden !== false) return 'did not reach All done';
  const t = statusOf(env);
  const paid = Object.values(t.rewarded).reduce((a, b) => a + b, 0);
  return (t.steps.every(s => s.status === 'done') && paid === berries(env) && G(env)._errors().filter(e => e.kind !== 'storage').length === 0)   // the fake env has no IndexedDB
    || 'end state: ' + JSON.stringify({ steps: t.steps, rewarded: t.rewarded, basket: berries(env), errors: G(env)._errors() });
});

await atest('Today V2: mic denied → Sing falls back to "I sang it" (self, never accuracy) and the day completes', Object.assign({ micDenied: true }, { audio: true }), async (env) => {
  const A = memLearn(env);
  env.$('play').click(); await doHear(env);
  env.advance(5000); env.$('singGo').click(); await flush();
  if(!env.$('singGo').hidden) return 'My turn still offered after the mic was denied';
  env.$('singSelf').click(); await flush(); G(env)._todayNext();
  const sung = [...A.data.attempts.values()].filter(a => a.skill === 'echo').map(a => a.outcome + '/' + a.evidence);
  if(sung.join() !== 'unavailable/none,self/self') return 'sing attempts: ' + sung.join();
  await doFind(env, [60, 62, 60]); await doPlay(env); doRead(env);
  return env.$('done').hidden === false || 'day did not complete with the mic denied';
});

await atest('Today V2: no microphone on the device → Sing starts as "Sing along"', { audio: true, noMic: true }, async (env) => {
  env.$('play').click(); await doHear(env);
  return (env.$('sing').hidden === false && env.$('singGo').hidden === true && env.$('singSelf').hidden === false) || 'sing screen offered the mic on a device without one';
});

await atest('Today V2: singing too quietly → uncertain, step stays open, "I sang it" still there', { audio: true }, async (env) => {
  const A = memLearn(env);
  env.$('play').click(); await doHear(env);
  env.advance(5000); env.$('singGo').click(); await flush(); env.advance(7000); await flush();
  const sung = [...A.data.attempts.values()].filter(a => a.skill === 'echo');
  return (sung.length === 1 && sung[0].outcome === 'uncertain' && sung[0].evidence === 'mic-uncertain' && stepOf(env).type === 'sing' && env.$('singSelf').hidden === false && env.mic.live === 0)
    || 'got ' + JSON.stringify({ sung: sung.map(a => a.outcome), step: stepOf(env) && stepOf(env).type, mic: env.mic.live });
});

await atest('Today V2: Skip on the optional Sing step → skipped, no strawberry, on to Learn', { audio: true }, async (env) => {
  env.$('play').click(); await doHear(env);
  const b = berries(env);
  env.$('singSkip').click();
  return (onSong(env, 'mLearn') && berries(env) === b && statusOf(env).steps[1].status === 'skipped') || 'skip did not move on cleanly';
});

await atest('Today V2: Home while singing closes the mic', { audio: true }, async (env) => {
  env.$('play').click(); await doHear(env);
  env.advance(5000); env.$('singGo').click(); await flush();
  if(env.mic.live !== 1) return 'mic not open while singing';
  env.homes[0].click(); env.advance(8000); await flush();
  return env.mic.live === 0 || 'mic left open after Home';
});

await atest('Today V2: reload mid-session resumes at the next step, no double reward', { audio: true }, async (env) => {
  env.$('play').click(); await doHear(env);
  env.$('singSelf').click();
  const b = berries(env);
  const env2 = makeEnv({ audio: true, seed: Object.assign({}, env.store) });
  env2.boot(); env2.$('play').click();
  if(!onSong(env2, 'mLearn')) return 'did not resume at Learn after a reload';
  if(berries(env2) !== b) return `basket changed on reload: ${b} → ${berries(env2)}`;
  env2.$('mLearn').click(); [60, 62, 60].forEach(m => G(env2)._press(m)); env2.advance(600);
  const after = berries(env2);
  env2.$('mLearn').click(); [60, 62, 60].forEach(m => G(env2)._press(m)); env2.advance(600);     // Again
  return (after > b && berries(env2) === after) || `Learn paid ${after - b}, Again paid ${berries(env2) - after} (want >0 then 0)`;
});

await atest('Today V2: Listen again on a finished step pays nothing more', { audio: true }, async (env) => {
  env.$('play').click(); env.$('mListen').click(); env.advance(4500);
  const b = berries(env);
  env.$('mListen').click(); env.advance(4500);
  return (b === 1 && berries(env) === 1) || `paid ${b} then ${berries(env)}`;
});

await atest('Today V2: yesterday\'s plan starts fresh at Listen', { audio: true, seed: { garden_v1: JSON.stringify({ today: { day: '2000-01-01', song: 'drm', steps: [{ id: 'hear', type: 'hear', status: 'done' }], rewarded: { hear: 1 } } }) } }, async (env) => {
  env.$('play').click();
  return onSong(env, 'mListen') || 'an old day\'s plan was resumed';
});

await atest('Today V2: a plan naming an unknown song, or the old PR3 format, starts fresh, no throw', { audio: true, seed: { garden_v1: JSON.stringify({ today: { day: todayKey, song: 'drm', i: 2, berries: 9 } }) } }, async (env) => {
  env.$('play').click();
  return (onSong(env, 'mListen') && G(env)._errors().length === 0) || 'old-format snapshot was not replaced';
});

await atest('Today V2: a finished day replays the same steps for fun, paying no more', { audio: true }, async (env) => {
  env.$('play').click(); await doHear(env); env.$('singSelf').click(); G(env)._todayNext();
  await doFind(env, [60, 62, 60]); await doPlay(env); doRead(env);
  if(env.$('done').hidden !== false) return 'first round did not finish';
  const b = berries(env);
  env.$('doneHome').click(); env.$('play').click();
  if(!onSong(env, 'mListen')) return 'second round did not start at Listen';
  await doHear(env);
  return berries(env) === b || `second round paid ${berries(env) - b} more`;
});

await atest('G8: replaying a song in free play pays the taking-part strawberry once a day', { audio: true }, async (env) => {
  openSong(env);
  const learn = () => { env.$('mLearn').click(); [60, 62, 60].forEach(m => G(env)._press(m)); env.advance(600); };
  learn(); const first = berries(env);
  learn(); learn();
  return (first >= 1 && berries(env) === first) || `first Learn paid ${first}, two replays paid ${berries(env) - first} more`;
});

console.log(fail ? `\nEXEC CHECK FAIL (${fail})` : '\nEXEC CHECK PASS');
process.exit(fail ? 1 : 0);

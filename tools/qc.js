// node tools/qc.js — gate before every push: syntax, vendored-module drift,
// offline list, and every script index.html loads exists.
const fs = require('fs'), path = require('path'), { execSync } = require('child_process');
const root = path.join(__dirname, '..');
let fail = 0;
const ok = (c, m) => { console.log((c ? '  ok    ' : '  FAIL  ') + m); if(!c) fail++; };

const js = fs.readdirSync(root).filter(f => f.endsWith('.js'));
js.forEach(f => { try{ execSync(`node --check "${path.join(root, f)}"`, { stdio: 'pipe' }); ok(true, `${f} parses`); }catch(e){ ok(false, `${f} parses: ${e.stderr}`); } });

// shared modules are vendored from ~/pitch-trainer (edit there, then its tools/sync-core.sh)
const PT = process.env.PITCH_TRAINER || path.join(root, '..', 'pitch-trainer');
['music-core.js', 'hear.js', 'midi.js', 'sound.js'].forEach(f => {
  if(!fs.existsSync(path.join(PT, f))) return ok(true, `${f}: ~/pitch-trainer not here, drift check skipped`);
  ok(fs.readFileSync(path.join(PT, f), 'utf8') === fs.readFileSync(path.join(root, f), 'utf8'), `${f} matches ~/pitch-trainer`);
});

const sw = fs.readFileSync(path.join(root, 'sw.js'), 'utf8');
js.filter(f => f !== 'sw.js').forEach(f => ok(sw.includes(`'./${f}'`), `${f} is in sw.js STATIC`));
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
(html.match(/<script src="([\w.-]+\.js)"><\/script>/g) || []).forEach(t => { const f = t.match(/src="([^"]+)"/)[1]; ok(fs.existsSync(path.join(root, f)), `index.html loads ${f}`); });

console.log(fail ? `\nQC FAIL (${fail})` : '\nQC PASS');
process.exit(fail ? 1 : 0);

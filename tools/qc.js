// node tools/qc.js — static gate: syntax, vendored engine (lock + API),
// offline list, every script index.html loads exists, unique ids.
// Full gate (with behaviour tests): sh tools/gate.sh
const fs = require('fs'), path = require('path'), { execFileSync, execSync } = require('child_process');
const root = path.join(__dirname, '..');
let fail = 0;
const ok = (c, m) => { console.log((c ? '  ok    ' : '  FAIL  ') + m); if(!c) fail++; };

const js = fs.readdirSync(root).filter(f => f.endsWith('.js'));
js.forEach(f => { try{ execSync(`node --check "${path.join(root, f)}"`, { stdio: 'pipe' }); ok(true, `${f} parses`); }catch(e){ ok(false, `${f} parses: ${e.stderr}`); } });

// shared engine modules: pinned by vendor.lock.json, never edited here
try{ execFileSync('node', [path.join(__dirname, 'shared.mjs'), 'verify', root], { stdio: 'inherit' }); }
catch(e){ fail++; }

const sw = fs.readFileSync(path.join(root, 'sw.js'), 'utf8');
js.filter(f => f !== 'sw.js').forEach(f => ok(sw.includes(`'./${f}'`), `${f} is in sw.js STATIC`));
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const loaded = (html.match(/<script src="([\w.-]+\.js)"><\/script>/g) || []).map(t => t.match(/src="([^"]+)"/)[1]);
loaded.forEach(f => ok(fs.existsSync(path.join(root, f)), `index.html loads ${f}`));
js.filter(f => f !== 'sw.js' && !loaded.includes(f)).forEach(f => ok(false, `${f} exists but index.html never loads it`));

// one element per id (a duplicate makes getElementById pick the wrong one)
const ids = [...html.matchAll(/\sid="([^"]+)"/g)].map(m => m[1]);
const dup = ids.filter((v, i) => ids.indexOf(v) !== i);
ok(!dup.length, `${ids.length} element ids, all unique${dup.length ? ' — duplicates: ' + [...new Set(dup)].join(', ') : ''}`);

console.log(fail ? `\nQC FAIL (${fail})` : '\nQC PASS');
process.exit(fail ? 1 : 0);

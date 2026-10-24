const CACHE = 'mg-v1';
// Every app on xxc2xx.github.io shares one Cache Storage (Pitch Trainer 'pt-',
// Beat Hive 'bh-', old 'pitch-vN'): only ever delete OUR caches (same prefix).
const PREFIX = CACHE.replace(/v\d+$/, '');

const STATIC = ['./icon-192.png', './icon-512.png', './manifest.json',
                './music-core.js', './hear.js', './midi.js', './sound.js', './garden.js'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(STATIC)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE && k.startsWith(PREFIX)).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  // HTML and JS always revalidated (Pages caches them 10 min; old JS against
  // new HTML breaks). Keep the latest JS as the offline copy — never the HTML.
  if (url.pathname.endsWith('.html') || url.pathname.endsWith('.js') || url.pathname.endsWith('/') || url.pathname === '') {
    e.respondWith(
      fetch(e.request.mode === 'navigate' ? e.request.url : e.request, { cache: 'no-cache' }).then(r => {
        if (r.ok && url.pathname.endsWith('.js')) { const copy = r.clone(); caches.open(CACHE).then(c => c.put(e.request, copy)); }
        return r;
      }).catch(() => caches.match(e.request, { ignoreSearch: true }))
    );
    return;
  }
  e.respondWith(caches.match(e.request).then(r => r || fetch(e.request)));
});

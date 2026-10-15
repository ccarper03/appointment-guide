/* Appointment Guide service worker: works offline at the model with weak signal. */
const CACHE = 'ag-v1';
const CORE = [
  './', 'index.html', 'app.css', 'app.js', 'manifest.webmanifest',
  'data/app-data.js', 'data/talk-locked.js',
  'vendor/pdf-lib.min.js', 'forms/wwrea-blank.pdf', 'forms/wwrea.png', 'assets/sitemap.jpg',
  'icons/icon-192.png', 'icons/icon-512.png', 'icons/apple-touch-icon.png'
];
const PLANS = ['alec', 'calhoun', 'cali', 'galen', 'hanover', 'hayden', 'jackson', 'landon', 'linville', 'robie', 'savannah', 'sierra'];
const PRECACHE = CORE.concat(PLANS.flatMap((p) => [`assets/plans/${p}.jpg`, `assets/elev/${p}.jpg`]));

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => Promise.all(PRECACHE.map((u) => c.add(u).catch(() => null)))).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k.startsWith('ag-') && k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});

/* Fresh first for the app and its data (so rate and lot updates show up), cached copy when offline.
   Everything is stored without its ?v= query so there is one copy per file. */
const FRESH = /\/(index\.html|app\.js|app\.css|app-data\.js|talk-locked\.js|manifest\.webmanifest)?$/;
const keyOf = (url) => url.origin + url.pathname;
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return;
  if (req.mode === 'navigate' || FRESH.test(url.pathname)) {
    e.respondWith(fetch(req).then((res) => {
      if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(keyOf(url), copy)); }
      return res;
    }).catch(() => caches.match(keyOf(url)).then((r) => r || caches.match(req, { ignoreSearch: true })).then((r) => r || caches.match('./'))));
    return;
  }
  e.respondWith(caches.match(keyOf(url)).then((hit) => hit || fetch(req).then((res) => {
    if (res.ok && /\.(jpg|png|pdf|js|css)$/.test(url.pathname)) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(keyOf(url), copy)); }
    return res;
  })));
});

/* 入れ物のファイルを手元に置いておき、電波がないときでもアプリをひらけるようにする。
   つながるときは、いつも新しいほうを使う。santei-atlas から読んだページとデータは shell.js が別に持つ。 */
const CACHE = 'santei-atlas-app-shell-v2';
const FILES = [
  './', './index.html', './shell.js', './shell.css', './manifest.webmanifest',
  './icon.svg', './icon-180.png', './icon-192.png', './icon-512.png', './icon-maskable-512.png',
];
self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(c => c.addAll(FILES)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', event => {
  event.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(k => k.startsWith('santei-atlas-app-shell-') && k !== CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});
self.addEventListener('fetch', event => {
  const req = event.request;
  const url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== self.location.origin || url.pathname.includes('/__data/')) return; // GitHub API・フォント・図の部品はそのまま
  event.respondWith(fetch(req).then(res => {
    if (res.ok) { const copy = res.clone(); caches.open(CACHE).then(c => c.put(req, copy)); }
    return res;
  }).catch(() => caches.match(req, { ignoreSearch: true }).then(hit => hit || caches.match(new URL('./index.html', self.registration.scope).href))));
});

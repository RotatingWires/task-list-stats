const CACHE = 'task-list-stats-shell';
const STATIC = ['/', '/index.html', '/login.html', '/login.js', '/version.json', '/auth.css', '/style.css', '/analysis-tabs.css', '/theme.js', '/theme.css', '/app.js', '/overview.js', '/history.js', '/patterns.js', '/analysis-tabs.js', '/ui.js', '/charts.js', '/fun.js', '/manifest.webmanifest', '/icons/stats.svg'];
self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(STATIC)));
  self.skipWaiting();
});
self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)));
    const cache = await caches.open(CACHE);
    const requests = await cache.keys();
    await Promise.all(requests.filter(request => !STATIC.includes(new URL(request.url).pathname)).map(request => cache.delete(request)));
  })());
  self.clients.claim();
});
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(fetch(event.request));
    return;
  }
  if (event.request.method !== 'GET' || url.origin !== self.location.origin) return;
  event.respondWith(
    fetch(event.request, { cache: 'no-store' }).then(response => {
      const copy = response.clone();
      caches.open(CACHE).then(cache => cache.put(event.request, copy));
      return response;
    }).catch(() => caches.match(event.request).then(hit => hit || caches.match(url.pathname)))
  );
});

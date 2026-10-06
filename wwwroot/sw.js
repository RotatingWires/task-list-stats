const CACHE = 'task-list-stats-shell-v2.0.16';
const STATIC = ['/', '/index.html', '/login.html', '/login.js', '/version.json', '/auth.css', '/style.css', '/analysis-tabs.css', '/theme.js', '/theme.css', '/milestones.css', '/app.js', '/overview.js', '/history.js', '/patterns.js', '/analysis-tabs.js?v=2.0.16', '/ui.js?v=2.0.16', '/charts.js', '/fun.js', '/milestones.js?v=2.0.16', '/manifest.webmanifest', '/icons/stats.svg'];
self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(STATIC)));
  self.skipWaiting();
});
self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))));
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
    fetch(event.request).then(response => {
      const copy = response.clone();
      caches.open(CACHE).then(cache => cache.put(event.request, copy));
      return response;
    }).catch(() => caches.match(event.request).then(hit => hit || caches.match(url.pathname)))
  );
});

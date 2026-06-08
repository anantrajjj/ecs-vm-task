'use strict';

const CACHE = 'brick-v2';

self.addEventListener('install', e => {
  // Build precache URLs relative to the SW scope so this works on any origin
  // (office VM at /  OR  GitHub Pages at /ecs-vm-task/)
  const base = self.registration.scope;
  e.waitUntil(
    caches.open(CACHE)
      .then(c => c.addAll([base, base + 'game.js?v=2']))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// Network-first, cache fallback — serves from cache when the port is unreachable
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  const { pathname } = new URL(e.request.url);
  if (pathname === '/health' || pathname === '/version' || pathname === '/metrics' || pathname === '/ready') return;

  e.respondWith(
    fetch(e.request)
      .then(r => {
        if (r.ok) caches.open(CACHE).then(c => c.put(e.request, r.clone()));
        return r;
      })
      .catch(() => caches.match(e.request))
  );
});

'use strict';

const CACHE = 'brick-v2';
const PRECACHE = ['/', '/game.js?v=2'];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE)
      .then(c => c.addAll(PRECACHE))
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

// Network-first, cache fallback — page loads from network when reachable,
// from cache when the network/port is unreachable (e.g. cellular carrier blocking port 8089)
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  const { pathname } = new URL(e.request.url);
  // Let API/health endpoints bypass the cache entirely
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

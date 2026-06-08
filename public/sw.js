'use strict';

const CACHE = 'brick-v2';
const NETWORK_TIMEOUT_MS = 3000;

self.addEventListener('install', e => {
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

self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  const { pathname } = new URL(e.request.url);
  if (pathname === '/health' || pathname === '/version' || pathname === '/metrics' || pathname === '/ready') return;

  // Race network against a 3s timeout — if the port is blocked/unreachable on
  // mobile, fall back to cache immediately instead of waiting 30-75s for TCP timeout
  e.respondWith(
    caches.open(CACHE).then(async cache => {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), NETWORK_TIMEOUT_MS);

      try {
        const response = await fetch(e.request, { signal: controller.signal });
        clearTimeout(timer);
        if (response.ok) cache.put(e.request, response.clone());
        return response;
      } catch {
        clearTimeout(timer);
        const cached = await cache.match(e.request);
        return cached || Response.error();
      }
    })
  );
});

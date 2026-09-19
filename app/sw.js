/* ============================================================
 * Alexander Bots — service worker.
 * Network-only pass-through: it must NEVER serve stale cached
 * app code. No app assets are cached here at all.
 * ============================================================ */
'use strict';

self.addEventListener('install', function (event) {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener('activate', function (event) {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', function (event) {
  // Pass straight through to the network; no cache reads, no cache writes.
  event.respondWith(fetch(event.request));
});

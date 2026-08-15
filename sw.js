/*
 * ReadingStar offline app shell.
 *
 * The two placeholders below are replaced at build time by
 * `vite.config.ts` (readingstar-offline-app-shell plugin) with the exact
 * asset list of that build. The worker:
 *
 * - caches only same-origin build artifacts listed in the precache
 *   manifest — never runtime data, never cross-origin requests;
 * - never intercepts same-origin `/api/` routes, so TTS and any future
 *   pilot endpoints always see live network failures, not stale caches;
 * - serves the cached shell for navigations so an installed ReadingStar
 *   opens with no network at all.
 *
 * Family data (profiles, passages, recordings) lives in IndexedDB and is
 * never touched by this cache.
 */

/* global ["apple-touch-icon.png","assets/ParentDashboard-BWi0uK6P.js","assets/PlayerWrapper-kl7OAxr_.js","assets/index-ByNjO0Jg.css","assets/index-DZlGenaW.js","assets/ttsClientContract-mS81Vfh8.js","favicon.svg","icon-192.png","icon-512.png","icon-maskable-192.png","icon-maskable-512.png","index.html","manifest.webmanifest"], a2af785a3ad8 */

const PRECACHE_MANIFEST = ["apple-touch-icon.png","assets/ParentDashboard-BWi0uK6P.js","assets/PlayerWrapper-kl7OAxr_.js","assets/index-ByNjO0Jg.css","assets/index-DZlGenaW.js","assets/ttsClientContract-mS81Vfh8.js","favicon.svg","icon-192.png","icon-512.png","icon-maskable-192.png","icon-maskable-512.png","index.html","manifest.webmanifest"];
const BUILD_ID = 'a2af785a3ad8';
const CACHE_NAME = `readingstar-shell-${BUILD_ID}`;
const API_PREFIX = new URL('api/', self.registration.scope).pathname;

const precacheUrls = () =>
  PRECACHE_MANIFEST.map((assetPath) => new URL(assetPath, self.registration.scope).href);

const documentUrl = () => new URL('index.html', self.registration.scope).href;

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE_NAME);
      // 'reload' bypasses any stale HTTP cache so a new build precaches
      // exactly what was just deployed.
      await Promise.all(
        precacheUrls().map((url) => cache.add(new Request(url, { cache: 'reload' }))),
      );
    })(),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)),
      );
      await self.clients.claim();
    })(),
  );
});

// Every precached URL holds exactly one build artifact, so URL equality is
// a sufficient match key. `ignoreVary` keeps entries usable when the host
// adds `Vary: Origin` (vite preview and some CDNs), which would otherwise
// make same-origin script/style requests carrying an Origin header miss
// entries stored without one.
const MATCH_OPTIONS = { ignoreSearch: true, ignoreVary: true };

const shellEntry = async (request) => {
  const cache = await caches.open(CACHE_NAME);
  const cached = await cache.match(request, MATCH_OPTIONS);
  if (cached) return cached;
  // A navigation can arrive before the precache finished (or with a URL
  // outside the manifest); fall back to the cached document, then network.
  const document = await cache.match(documentUrl(), MATCH_OPTIONS);
  if (document) return document;
  return fetch(request);
};

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith(API_PREFIX)) return;

  if (request.mode === 'navigate') {
    event.respondWith(shellEntry(request));
    return;
  }

  event.respondWith(
    (async () => {
      const cache = await caches.open(CACHE_NAME);
      const cached = await cache.match(request, MATCH_OPTIONS);
      if (cached) return cached;
      // Same-origin subresources are all hashed build artifacts; anything
      // not precached goes straight through untouched.
      return fetch(request);
    })(),
  );
});

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

/* global ["apple-touch-icon.png","assets/ParentDashboard-BdWdkU3x.js","assets/PlayerWrapper-Zbl0XE7o.js","assets/index-DgS5CYHk.js","assets/index-xbjuSMS4.css","assets/nunito-latin-var-CjueodBP.woff2","assets/ttsWarmup-B7qd1eNP.js","favicon.svg","fonts/Nunito-OFL.txt","icon-192.png","icon-512.png","icon-maskable-192.png","icon-maskable-512.png","index.html","manifest.webmanifest"], 0b78f73375a6 */

const PRECACHE_MANIFEST = ["apple-touch-icon.png","assets/ParentDashboard-BdWdkU3x.js","assets/PlayerWrapper-Zbl0XE7o.js","assets/index-DgS5CYHk.js","assets/index-xbjuSMS4.css","assets/nunito-latin-var-CjueodBP.woff2","assets/ttsWarmup-B7qd1eNP.js","favicon.svg","fonts/Nunito-OFL.txt","icon-192.png","icon-512.png","icon-maskable-192.png","icon-maskable-512.png","index.html","manifest.webmanifest"];
const BUILD_ID = '0b78f73375a6';
const CACHE_NAME = `readingstar-shell-${BUILD_ID}`;
const API_PREFIX = new URL('api/', self.registration.scope).pathname;

const precacheUrls = () =>
  PRECACHE_MANIFEST.map((assetPath) => new URL(assetPath, self.registration.scope).href);

const documentUrl = () => new URL('index.html', self.registration.scope).href;

self.addEventListener('install', (event) => {
  // Take over from a previous worker immediately. Without this a fixed
  // worker stays "waiting" until every tab of the origin closes — on
  // Safari that can be never, so clients would be stuck on a broken
  // build until they manually cleared site data.
  self.skipWaiting();
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE_NAME);
      // 'reload' bypasses any stale HTTP cache so a new build precaches
      // exactly what was just deployed. Responses are re-wrapped without
      // Content-Encoding/Content-Length: compression hosts (Cloudflare serves
      // brotli) store a decoded body in the Cache API while keeping the
      // header, and replaying that response for a navigation makes the
      // browser decompress plain bytes — net::ERR_FAILED, page never mounts.
      await Promise.all(
        precacheUrls().map(async (url) => {
          const response = await fetch(new Request(url, { cache: 'reload' }));
          if (!response.ok) throw new Error(`Precache ${url} failed: ${response.status}`);
          const headers = new Headers(response.headers);
          headers.delete('Content-Encoding');
          headers.delete('Content-Length');
          await cache.put(url, new Response(await response.arrayBuffer(), {
            status: response.status,
            headers,
          }));
        }),
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
  const response = await fetch(request);
  // Navigation requests run with redirect:"manual"; handing a redirect
  // back to the browser throws "Redirect not allowed". Serve the cached
  // shell's body (status 200) under the redirect's location instead.
  if (response.type === 'opaqueredirect' || (response.status >= 300 && response.status < 400)) {
    const shell = await cache.match(documentUrl(), MATCH_OPTIONS);
    if (shell) return new Response(shell.body, {
      status: 200,
      headers: { 'Content-Type': 'text/html;charset=utf-8' },
    });
  }
  return response;
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

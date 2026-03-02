/**
 * ═══════════════════════════════════════════════════════════════
 *  Fresh Market — Service Worker
 *  Version: 1.0.0
 *
 *  Strategy overview:
 *  ┌─────────────────────────────────────────────────────────┐
 *  │  App Shell (HTML/CSS/JS)  →  Cache-First                │
 *  │  Static Assets (fonts, icons) →  Cache-First            │
 *  │  Product Images (Unsplash) →  Network-First w/ fallback │
 *  │  API / Dynamic requests   →  Network-Only               │
 *  └─────────────────────────────────────────────────────────┘
 * ═══════════════════════════════════════════════════════════════
 */

'use strict';

// ── Cache versioning ────────────────────────────────────────────
// Bump CACHE_VERSION whenever you deploy updated assets.
// The activate handler will automatically purge old caches.
const CACHE_VERSION   = 'v1.0.0';
const SHELL_CACHE     = `fresh-shell-${CACHE_VERSION}`;
const IMAGES_CACHE    = `fresh-images-${CACHE_VERSION}`;
const FONTS_CACHE     = `fresh-fonts-${CACHE_VERSION}`;

// All known caches — used during cleanup in activate
const ALL_CACHES = [SHELL_CACHE, IMAGES_CACHE, FONTS_CACHE];

// ── App Shell: files to pre-cache on install ────────────────────
// These are the minimum files needed to render the app offline.
// Adjust this list to match your actual file structure.
const APP_SHELL_URLS = [
  '/kyalanav2/index.html',
  '/kyalanav2/manifest.json',
  '/kyalanav2/sw.js',
  '/kyalanav2/offline.html',
  '/kyalanav2/pwa-install.js',
  '/kyalanav2/api-client.js',
  '/kyalanav2/frontend-api.js',
  '/kyalanav2/icons/icon-192x192.png',
  '/kyalanav2/icons/icon-512x512.png',
];

// ── Image hosts that use the images cache ───────────────────────
const IMAGE_HOSTS = ['images.unsplash.com', 'cdn.example.com'];

// ── Font hosts that use the fonts cache ────────────────────────
const FONT_HOSTS = ['fonts.googleapis.com', 'fonts.gstatic.com'];


/* ═══════════════════════════════════════════════════════════════
   INSTALL EVENT
   Pre-cache the app shell so the app loads instantly on next visit
   and works fully offline.
═══════════════════════════════════════════════════════════════ */
self.addEventListener('install', (event) => {
  console.log('[SW] Installing service worker…');

  event.waitUntil(
    caches.open(SHELL_CACHE)
      .then((cache) => {
        console.log('[SW] Pre-caching app shell');
        // addAll() fetches every URL and stores the response.
        // If any single request fails, the entire install fails —
        // ensuring you never have a broken partial cache.
        return cache.addAll(APP_SHELL_URLS);
      })
      .then(() => {
        console.log('[SW] App shell cached successfully');
        // Force the new SW to become active immediately
        // instead of waiting for all tabs to close.
        return self.skipWaiting();
      })
      .catch((err) => {
        console.error('[SW] Pre-cache failed:', err);
      })
  );
});


/* ═══════════════════════════════════════════════════════════════
   ACTIVATE EVENT
   Clean up caches from previous SW versions.
   Claim all clients so the new SW controls open tabs immediately.
═══════════════════════════════════════════════════════════════ */
self.addEventListener('activate', (event) => {
  console.log('[SW] Activating new service worker…');

  event.waitUntil(
    Promise.all([
      // Delete any cache that is NOT in our current ALL_CACHES list
      caches.keys().then((cacheNames) => {
        return Promise.all(
          cacheNames
            .filter((name) => !ALL_CACHES.includes(name))
            .map((name) => {
              console.log('[SW] Deleting old cache:', name);
              return caches.delete(name);
            })
        );
      }),

      // Take control of all open tabs without requiring a reload
      self.clients.claim(),
    ])
  );

  console.log('[SW] Activation complete — controlling all clients');
});


/* ═══════════════════════════════════════════════════════════════
   FETCH EVENT
   Route every network request through the appropriate strategy.
═══════════════════════════════════════════════════════════════ */
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // ── Skip non-GET requests (POST, PUT, etc.) ──────────────────
  // We never cache mutations; let them go straight to the network.
  if (request.method !== 'GET') return;

  // ── Skip chrome-extension and other non-http(s) schemes ──────
  if (!request.url.startsWith('http')) return;

  // ── Route by destination ─────────────────────────────────────

  // 1. Google Fonts — Cache-First (fonts don't change)
  if (FONT_HOSTS.some((host) => url.hostname.includes(host))) {
    event.respondWith(cacheFirst(request, FONTS_CACHE));
    return;
  }

  // 2. Product / hero images — Network-First with image cache fallback
  if (IMAGE_HOSTS.some((host) => url.hostname.includes(host))) {
    event.respondWith(networkFirstWithFallback(request, IMAGES_CACHE));
    return;
  }

  // 3. Same-origin requests — Cache-First for app shell files
  if (url.origin === self.location.origin) {
    event.respondWith(cacheFirstWithNetworkFallback(request, SHELL_CACHE));
    return;
  }

  // 4. Everything else — Network-Only (analytics, APIs, etc.)
  // Just let them pass through unmodified.
});


/* ═══════════════════════════════════════════════════════════════
   STRATEGY: Cache-First
   Serve from cache. If not cached, fetch from network and cache it.
   Best for: fonts, icons, versioned static assets.
═══════════════════════════════════════════════════════════════ */
async function cacheFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);

  if (cached) {
    return cached; // Instant cache hit
  }

  // Not in cache — fetch, clone, store, and return
  try {
    const networkResponse = await fetch(request);
    if (networkResponse && networkResponse.status === 200) {
      cache.put(request, networkResponse.clone());
    }
    return networkResponse;
  } catch (err) {
    console.error('[SW] Cache-First network error:', err);
    return new Response('Resource unavailable offline', { status: 503 });
  }
}


/* ═══════════════════════════════════════════════════════════════
   STRATEGY: Cache-First with Network Fallback + Offline Page
   Serve from cache. On miss, try network and update cache.
   If network also fails (offline), show /offline.html for navigation.
   Best for: app shell HTML, JS, CSS files.
═══════════════════════════════════════════════════════════════ */
async function cacheFirstWithNetworkFallback(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);

  if (cached) {
    return cached;
  }

  try {
    const networkResponse = await fetch(request);
    if (networkResponse && networkResponse.status === 200) {
      cache.put(request, networkResponse.clone());
    }
    return networkResponse;
  } catch (err) {
    // Offline and not cached
    // For navigation requests (page loads), return the offline fallback
    if (request.destination === 'document') {
      const offlinePage = await cache.match('/offline.html');
      if (offlinePage) return offlinePage;
    }
    return new Response('Offline — resource not available', {
      status: 503,
      headers: { 'Content-Type': 'text/plain' },
    });
  }
}


/* ═══════════════════════════════════════════════════════════════
   STRATEGY: Network-First with Cache Fallback
   Try network first for freshness. On failure, serve from cache.
   Best for: product images (may update, but show stale if offline).
═══════════════════════════════════════════════════════════════ */
async function networkFirstWithFallback(request, cacheName) {
  const cache = await caches.open(cacheName);

  try {
    const networkResponse = await fetch(request);
    if (networkResponse && networkResponse.status === 200) {
      cache.put(request, networkResponse.clone());
    }
    return networkResponse;
  } catch (err) {
    // Network failed — try the cache
    const cached = await cache.match(request);
    if (cached) return cached;

    // Neither network nor cache — return a tiny transparent placeholder
    return new Response(PLACEHOLDER_SVG, {
      status: 200,
      headers: { 'Content-Type': 'image/svg+xml' },
    });
  }
}


// ── Inline SVG placeholder for failed image loads ──────────────
const PLACEHOLDER_SVG = `
<svg xmlns="http://www.w3.org/2000/svg" width="400" height="300" viewBox="0 0 400 300">
  <rect width="400" height="300" fill="#e8f5e9"/>
  <text x="50%" y="45%" text-anchor="middle" fill="#81c784" font-size="48">🌿</text>
  <text x="50%" y="65%" text-anchor="middle" fill="#a5d6a7" font-size="16" font-family="sans-serif">Image not available offline</text>
</svg>`.trim();


/* ═══════════════════════════════════════════════════════════════
   MESSAGE EVENT
   Allow the page to communicate with the service worker.
   Useful for manual cache clearing or update prompts.
═══════════════════════════════════════════════════════════════ */
self.addEventListener('message', (event) => {
  if (!event.data) return;

  switch (event.data.type) {

    // Page can send { type: 'SKIP_WAITING' } to force-activate a new SW
    case 'SKIP_WAITING':
      console.log('[SW] Received SKIP_WAITING — activating now');
      self.skipWaiting();
      break;

    // Page can send { type: 'GET_VERSION' } to read current cache version
    case 'GET_VERSION':
      event.ports[0].postMessage({ version: CACHE_VERSION });
      break;

    // Page can send { type: 'CLEAR_CACHES' } to nuke everything
    case 'CLEAR_CACHES':
      caches.keys()
        .then((keys) => Promise.all(keys.map((k) => caches.delete(k))))
        .then(() => {
          console.log('[SW] All caches cleared');
          event.ports[0] && event.ports[0].postMessage({ cleared: true });
        });
      break;

    default:
      console.log('[SW] Unknown message type:', event.data.type);
  }
});

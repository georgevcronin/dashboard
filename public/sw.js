// Only bump this if the caching *strategy* itself changes (asset list,
// strategy per type) — not on every deploy. The app shell is network-first
// (see the fetch handler), so a new deploy is live on the next load without
// needing a cache-name bump.
//
// v2: was stale-while-revalidate for the shell, which served the *previous*
// app.js on the first load after every deploy. Two problems with that. The
// mild one is that a fix appears to have not shipped until you reload twice.
// The serious one is that if a deploy ever goes out broken, the broken bundle
// stays cached and keeps white-screening you on first load even after the fix
// is live — which is exactly when you least want to have to know to reload.
const CACHE_VERSION = 'press-v2';

// Rarely change once shipped — safe to cache-first and hold onto for a
// year, since firebase.json marks these immutable. If one of these ever
// needs to change in place (not just get replaced by a new file), bump
// CACHE_VERSION so old copies don't linger.
const STATIC_ASSETS = [
  '/icon-192.png', '/icon-512.png', '/icon-512-maskable.png', '/apple-touch-icon.png',
  '/manifest.json', '/body-anterior.svg', '/body-lateral.svg', '/body-posterior.svg',
];
// Change on every deploy — served network-first, with the cache kept only as
// an offline fallback. This app opens straight into a /summary round trip
// anyway, so there's no meaningful speed win in painting a stale shell first,
// and a stale shell can be a *wrong* shell.
const APP_SHELL = ['/', '/index.html', '/app.js'];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE_VERSION).then(cache => cache.addAll([...STATIC_ASSETS, ...APP_SHELL]))
  );
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(names => Promise.all(names.filter(n => n !== CACHE_VERSION).map(n => caches.delete(n))))
  );
  self.clients.claim();
});

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  // Leave everything else alone — most importantly the cross-origin
  // Cloud Functions API (europe-west2-...cloudfunctions.net): this app's
  // whole point is live health/training data, never served from a cache.
  if (url.origin !== self.location.origin || e.request.method !== 'GET') return;

  if (STATIC_ASSETS.includes(url.pathname)) {
    e.respondWith(
      caches.match(e.request).then(cached => cached || fetch(e.request).then(res => {
        const copy = res.clone();
        caches.open(CACHE_VERSION).then(cache => cache.put(e.request, copy));
        return res;
      }))
    );
    return;
  }

  // Network-first. The cached copy is a fallback for being offline, never the
  // preferred answer — see CACHE_VERSION's note for why serving it first was
  // worse than the latency it saved. A failed fetch (offline, or the response
  // never arrives) falls back to cache; if there's no cache either, the
  // rejection propagates and the browser shows its own offline page, which is
  // the honest outcome.
  if (APP_SHELL.includes(url.pathname)) {
    e.respondWith(
      caches.open(CACHE_VERSION).then(cache =>
        fetch(e.request)
          .then(res => {
            // Only cache a real success. Caching a 5xx or an opaque error
            // would poison the offline fallback with a broken shell.
            if (res && res.ok) cache.put(e.request, res.clone());
            return res;
          })
          .catch(() => cache.match(e.request).then(cached => {
            if (cached) return cached;
            throw new Error('offline and no cached app shell');
          }))
      )
    );
  }
});

self.addEventListener('push', e => {
  const data = e.data?.json() || {};
  e.waitUntil(self.registration.showNotification(data.title || 'Press', {
    body: data.body || '',
    icon: '/icon-192.png',
    badge: '/icon-192.png',
    data: { url: data.url || '/' },
  }));
});

self.addEventListener('notificationclick', e => {
  e.notification.close();
  e.waitUntil(clients.openWindow(e.notification.data?.url || '/'));
});

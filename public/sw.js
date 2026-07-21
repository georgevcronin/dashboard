// Only bump this if the caching *strategy* itself changes (asset list,
// strategy per type) — not on every deploy. Stale-while-revalidate below
// already keeps app.js/index.html fresh on their own: each fetch overwrites
// the cached entry with whatever the server just returned, so a new deploy
// shows up after one extra reload without needing a cache-name bump.
const CACHE_VERSION = 'press-v1';

// Rarely change once shipped — safe to cache-first and hold onto for a
// year, since firebase.json marks these immutable. If one of these ever
// needs to change in place (not just get replaced by a new file), bump
// CACHE_VERSION so old copies don't linger.
const STATIC_ASSETS = [
  '/icon-192.png', '/icon-512.png', '/icon-512-maskable.png', '/apple-touch-icon.png',
  '/manifest.json', '/body-anterior.svg', '/body-lateral.svg', '/body-posterior.svg',
];
// Change on every deploy — served stale-while-revalidate so a reload is
// instant even on a slow connection, but never held onto for long.
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

  if (APP_SHELL.includes(url.pathname)) {
    e.respondWith(
      caches.open(CACHE_VERSION).then(cache =>
        cache.match(e.request).then(cached => {
          const fetchPromise = fetch(e.request).then(res => {
            cache.put(e.request, res.clone());
            return res;
          }).catch(() => cached);
          return cached || fetchPromise;
        })
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

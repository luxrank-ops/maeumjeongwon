/* 마음정원 PWA Service Worker — 오프라인 캐시 및 산사 통신 음영 지역 대응 */
const CACHE_NAME = 'maeumjeongwon-v1';
const PRECACHE_URLS = [
  '/',
  '/index.html',
  '/manifest.webmanifest',
  '/css/style.css',
  '/vendor/leaflet.css',
  '/vendor/leaflet.js',
  '/js/data-temples.js?v=20261009analytics',
  '/js/data-prayer.js?v=20261012prayer',
  '/js/data-stories.js?v=20261009analytics',
  '/js/data-traditional.js',
  '/js/planner-reco.js?v=20261012reco',
  '/js/data-fengshui.js?v=20261012fengshui',
  '/js/config.js?v=20261009analytics',
  '/js/analytics.js?v=20261009analytics',
  '/js/features.js',
  '/js/app.js?v=20261012no-videos',
  '/pwa-192x192.png',
  '/pwa-512x512.png',
  '/apple-touch-icon.png'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      return cache.addAll(PRECACHE_URLS).catch(err => {
        console.warn('[SW] Precache partial error:', err);
      });
    }).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys => {
      return Promise.all(
        keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))
      );
    }).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const req = event.request;
  const url = new URL(req.url);

  // API calls: Network-first
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(
      fetch(req).catch(() => caches.match(req))
    );
    return;
  }

  // HTML navigation: Stale-While-Revalidate with index.html fallback
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req).catch(() => caches.match('/index.html') || caches.match('/'))
    );
    return;
  }

  // Static assets: Cache-First or Stale-While-Revalidate
  event.respondWith(
    caches.match(req).then(cached => {
      if (cached) {
        // Fetch in background to revalidate
        fetch(req).then(res => {
          if (res && res.status === 200 && res.type === 'basic') {
            const clone = res.clone();
            caches.open(CACHE_NAME).then(cache => cache.put(req, clone));
          }
        }).catch(() => {});
        return cached;
      }
      return fetch(req).then(res => {
        if (!res || res.status !== 200 || res.type !== 'basic') return res;
        const clone = res.clone();
        caches.open(CACHE_NAME).then(cache => cache.put(req, clone));
        return res;
      });
    })
  );
});

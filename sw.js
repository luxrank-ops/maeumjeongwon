/* 마음정원 PWA Service Worker — 오프라인 캐시 및 산사 통신 음영 지역 대응 */
const CACHE_NAME = 'maeumjeongwon-v2';
// 첫 설치에서 받는 것 = 첫 화면을 그리는 데 실제로 필요한 것만.
const PRECACHE_URLS = [
  '/',
  '/index.html',
  '/manifest.webmanifest',
  '/css/style.css',
  '/js/lib/loader.js?v=20261016split',
  '/js/data-temples.js?v=20261009analytics',
  '/js/planner-reco.js?v=20261012reco',
  '/js/config.js?v=20261009analytics',
  '/js/analytics.js?v=20261009analytics',
  '/js/features.js',
  '/js/app.js?v=20261016split',
  '/pwa-192x192.png',
  '/pwa-512x512.png',
  '/apple-touch-icon.png'
];

// 화면별 지연 자산 — 설치 직후가 아니라 '쉬는 시간'에 조용히 채워 오프라인에서도 열리게 한다.
// (목록은 js/lib/loader.js의 ASSETS와 같은 URL을 유지해야 한다)
const LAZY_URLS = [
  '/vendor/leaflet.css',
  '/vendor/leaflet.js',
  '/js/data-prayer.js?v=20261016split',
  '/js/data-stories.js?v=20261016split',
  '/js/data-traditional.js?v=20261016split',
  '/js/data-fengshui.js?v=20261016split',
  '/js/app/planner.js?v=20261016split'
];

function prefetchLazy() {
  return caches.open(CACHE_NAME).then(cache => {
    return Promise.all(LAZY_URLS.map(url =>
      cache.match(url).then(hit => hit ? null : fetch(url).then(res => {
        if (res && res.status === 200 && res.type === 'basic') return cache.put(url, res.clone());
        return null;
      }).catch(() => null))
    ));
  });
}

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
      // 첫 화면을 막지 않도록, 설치가 끝난 뒤 지연 자산을 뒤에서 채운다 (실패해도 무해)
      .then(() => prefetchLazy())
      .catch(() => {})
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

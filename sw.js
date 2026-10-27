/* 절로가 PWA Service Worker — 오프라인 캐시 및 산사 통신 음영 지역 대응 */
const CACHE_NAME = 'maeumjeongwon-v10';
// 첫 설치에서 받는 것 = 첫 화면을 그리는 데 실제로 필요한 것만.
const PRECACHE_URLS = [
  '/',
  '/index.html',
  '/manifest.webmanifest',
  '/css/style.css?v=20261028signup',
  '/js/lib/loader.js?v=20261028signup',
  '/js/data-temples.js?v=20261028signup',
  '/js/planner-reco.js?v=20261012reco',
  '/js/config.js?v=20261009analytics',
  '/js/analytics.js?v=20261009analytics',
  '/js/app.js?v=20261028signup',
  '/pwa-192x192.png',
  '/pwa-512x512.png',
  '/apple-touch-icon.png'
];

// 화면별 지연 자산 — 설치 직후가 아니라 '쉬는 시간'에 조용히 채워 오프라인에서도 열리게 한다.
// (목록은 js/lib/loader.js의 ASSETS와 같은 URL을 유지해야 한다)
const LAZY_URLS = [
  '/vendor/leaflet.css',
  '/vendor/leaflet.js',
  '/js/features.js?v=20261028signup',
  '/js/data-prayer.js?v=20261028signup',
  '/js/data-stories.js?v=20261028signup',
  '/js/data-traditional.js?v=20261028signup',
  '/js/data-fengshui.js?v=20261028signup',
  '/js/app/planner.js?v=20261028signup',
  '/js/app/map.js?v=20261028signup',
  '/js/app/community.js?v=20261028signup'
];

/* 코드·스타일은 '지금 받아 본 응답'이 우선이다.
 * 예전에는 캐시를 먼저 돌려주고 뒤에서 갱신했는데, 한 번 잘못된 응답(오류 페이지·예전 배포본)이
 * 캐시에 들어가면 그 화면(회원가입·게시판)이 계속 열리지 않았다.
 * 지금은 네트워크 우선 + 오프라인일 때만 캐시로 되돌아간다. */
const CODE_RE = /\.(?:js|mjs|css|webmanifest)$/i;

// 응답의 '내용'이 요청한 종류와 맞을 때만 캐시한다 (HTML 오류 페이지가 .js 로 저장되는 것을 막는다).
function cacheable(request, response) {
  if (!response || response.status !== 200 || response.type !== 'basic') return false;
  const url = new URL(request.url);
  const type = String(response.headers.get('content-type') || '');
  if (/\.m?js$/i.test(url.pathname)) return /javascript|ecmascript/i.test(type);
  if (/\.css$/i.test(url.pathname)) return /text\/css/i.test(type);
  return true;
}

function putInCache(request, response) {
  if (!cacheable(request, response)) return Promise.resolve();
  return caches.open(CACHE_NAME).then(cache => cache.put(request, response.clone())).catch(() => {});
}

function prefetchLazy() {
  return caches.open(CACHE_NAME).then(cache => {
    return Promise.all(LAZY_URLS.map(url =>
      cache.match(url).then(hit => hit ? null : fetch(url).then(res => {
        if (cacheable({ url: new URL(url, self.location.origin) }, res)) {
          return cache.put(url, res.clone());
        }
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
  if (req.method !== 'GET') return;               // 쓰기 요청은 캐시·재시도 대상이 아니다
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  // API calls: Network-first
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(
      fetch(req).catch(() => caches.match(req).then(hit => hit || Response.error()))
    );
    return;
  }

  // HTML navigation: Network-first with index.html fallback
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req).catch(() => caches.match('/index.html').then(hit => hit || caches.match('/')).then(hit => hit || Response.error()))
    );
    return;
  }

  // 코드·스타일: Network-first (성공하면 캐시 갱신) → 오프라인일 때만 캐시
  if (CODE_RE.test(url.pathname)) {
    event.respondWith(
      fetch(req)
        .then(res => {
          if (cacheable(req, res)) putInCache(req, res);
          return res;
        })
        .catch(() => caches.match(req).then(hit => hit || Response.error()))
    );
    return;
  }

  // 이미지 등 나머지 정적 자산: Cache-first + 뒤에서 갱신
  event.respondWith(
    caches.match(req).then(cached => {
      if (cached) {
        fetch(req).then(res => { putInCache(req, res); }).catch(() => {});
        return cached;
      }
      return fetch(req).then(res => {
        putInCache(req, res);
        return res;
      });
    })
  );
});

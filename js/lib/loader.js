/* 절로가 자산 로더 — 화면에 필요한 데이터·지도·부가 기능을 '그때' 받아온다.
 *
 * 왜 필요한가: 예전에는 첫 화면에서도 지도(leaflet 162KB)·전통사찰 991곳(110KB)·스토리·기도·풍수
 * 데이터를 모두 내려받아야 첫 화면이 떴다. 실제로 홈에서 쓰는 건 스토리 카드 하나뿐이었다.
 * 여기서 라우트 → 필요한 자산 표(NEEDS)를 한곳에 모아 두고, 라우터와 서비스워커가 같은 표를 본다.
 */
(function (root) {
  'use strict';

  // 캐시 무효화용 버전. 파일 내용이 바뀌면 sw.js의 CACHE_NAME과 함께 올린다.
  var VERSION = '20261028static';

  var doc = root.document;

  function withVersion(src) {
    if (/^(https?:)?\/\//.test(src)) return src;
    return src + (src.indexOf('?') > -1 ? '&' : '?') + 'v=' + VERSION;
  }

  // 자산 정의: ready()는 "이미 받아져 있는가"를 묻는 술어 — 부트스트랩에서 중복 로드를 막는다.
  var ASSETS = {
    leaflet: {
      css: ['vendor/leaflet.css'],
      js: ['vendor/leaflet.js'],
      ready: function () { return !!(root.L && root.L.map); }
    },
    traditional: {
      js: ['js/data-traditional.js'],
      // 데이터 파일은 TRADITIONAL_TEMPLES 로, 앱 셸의 옛 코드는 TRADITIONAL_TEMPLATES 로 읽는다 — 둘 다 인정한다
      ready: function () { return Array.isArray(root.TRADITIONAL_TEMPLATES) || Array.isArray(root.TRADITIONAL_TEMPLES); }
    },
    prayer: {
      js: ['js/data-prayer.js'],
      ready: function () { return Array.isArray(root.PRAYER_CRITERIA) && !!root.PRAYER_ETIQUETTE; }
    },
    stories: {
      js: ['js/data-stories.js'],
      ready: function () { return Array.isArray(root.STORIES); }
    },
    fengshui: {
      js: ['js/data-fengshui.js'],
      ready: function () { return !!root.FENGSHUI_ATLAS; }
    },
    // 계획 화면 모듈(945줄) — 계획 라우트에 들어갈 때만 받는다
    planner: {
      js: ['js/app/planner.js'],
      ready: function () { return typeof root.MJ_PLANNER_FACTORY === 'function'; }
    },
    mapUi: {
      js: ['js/app/map.js'],
      ready: function () { return !!(root.MJ_MAP_UI && root.MJ_MAP_UI.init); }
    },
    // 회원 가입·로그인·게시판 화면 모듈 — #/account, #/board 에 들어갈 때만 받는다
    community: {
      js: ['js/app/community.js'],
      ready: function () { return typeof root.MJ_COMMUNITY_FACTORY === 'function'; }
    },
    // 비필수 UI 기능은 첫 페인트 뒤 한 번에 받는다 — 홈 렌더와 상호작용은 이 자산을 기다리지 않는다.
    features: {
      js: ['js/features.js'],
      ready: function () { return !!root.MJ_FEATURES; }
    }
  };

  // 라우트 → 자산. 해시 경로의 '가장 구체적인 접두사'가 이긴다 (explore/theme/fengshui > explore).
  var NEEDS = {
    home: ['stories'],
    story: ['stories'],
    temple: ['stories'],
    map: ['leaflet', 'mapUi', 'stories'],
    missions: ['leaflet', 'mapUi', 'stories'],
    planner: ['planner'],
    'planner/view': ['planner', 'leaflet'],
    'planner/new': ['planner'],
    'planner/theme': ['planner'],
    'journal/new': ['traditional'],
    'explore/all': ['traditional'],
    'explore/theme/prayer': ['prayer'],
    'explore/theme/wish': ['prayer'],
    'explore/theme/energy': ['prayer'],
    'explore/theme/fengshui': ['fengshui'],
    fengshui: ['fengshui'],
    guide: ['prayer'],
    board: ['community'],
    account: ['community']
  };

  // 첫 화면을 막지 않는 자산 — 없으면 먼저 그리고, 도착하면 이어서 다시 그린다.
  // 기능 묶음은 모든 라우트에서 부가 요소이므로 기본 지연, 홈의 심화 스토리는 홈에서만 덧붙인다.
  var SOFT = {
    '*': ['features'],
    home: ['stories']
  };

  function routeKeys(hash) {
    var parts = String(hash || '#/home').replace(/^#\/?/, '').split('/').filter(Boolean).map(decodeURIComponent);
    var keys = [];
    for (var i = parts.length; i > 0; i--) keys.push(parts.slice(0, i).join('/'));
    return keys;
  }

  function needsFor(hash) {
    var keys = routeKeys(hash);
    for (var i = 0; i < keys.length; i++) {
      if (NEEDS[keys[i]]) return NEEDS[keys[i]].slice();
    }
    return [];
  }

  function softFor(hash) {
    var keys = routeKeys(hash);
    var out = (SOFT['*'] || []).slice();
    for (var i = 0; i < keys.length; i++) {
      if (keys[i] !== '*' && SOFT[keys[i]]) {
        out = out.concat(SOFT[keys[i]]);
        break;
      }
    }
    return out.filter(function (key, i) { return out.indexOf(key) === i; });
  }

  function isReady(key) {
    var a = ASSETS[key];
    return !!(a && a.ready && a.ready());
  }

  // 아직 안 받은 것만 골라낸다 — 라우터가 동기 경로(이미 있음)와 비동기 경로를 가르는 데 쓴다.
  function missing(keys) {
    return (keys || []).filter(function (k) { return ASSETS[k] && !isReady(k); });
  }

  function loadScript(src) {
    return new Promise(function (resolve, reject) {
      var el = doc.createElement('script');
      // 재시도(bust)는 URL 자체를 바꾼다 — 브라우저 캐시와 Service Worker 캐시를 '모두' 건너뛴다.
      // 회원 화면이 예전 캐시 때문에 열리지 않던 문제의 재발을 막는 안전장치다.
      el.src = src;
      el.async = false;          // 순서 보장: 표에 적은 순서대로 실행된다
      el.onload = function () { resolve(src); };
      el.onerror = function () { reject(new Error('스크립트를 불러오지 못했어요: ' + src)); };
      (doc.head || doc.body || doc.documentElement).appendChild(el);
    });
  }

  function loadStyle(href) {
    return new Promise(function (resolve) {
      var el = doc.createElement('link');
      el.rel = 'stylesheet';
      el.href = href;
      el.onload = function () { resolve(href); };
      el.onerror = function () { resolve(href); };   // 스타일 실패가 화면 렌더를 막지는 않는다
      (doc.head || doc.documentElement).appendChild(el);
    });
  }

  var inflight = {};

  // 모듈이 '정말' 등록되었는지 확인한다.
  // 스크립트 요청이 200 으로 끝나도 내용이 잘못된 경우(오류 페이지·잘린 캐시·HTML 폴백)가 있다.
  // 그때 onload 만 믿으면 화면은 '불러오는 중'에서 영원히 멈춘다 — 회원가입 화면이 열리지 않던 증상.
  function loadedButMissing(key) {
    var err = new Error('스크립트는 왔지만 모듈이 등록되지 않았어요: ' + key);
    err.code = 'NOT_REGISTERED';
    return err;
  }

  // opts.retry: 캐시를 우회하는 URL(?bust=)로 한 번 더 받는다.
  function ensureOne(key, opts) {
    opts = opts || {};
    if (!ASSETS[key] || isReady(key)) return Promise.resolve(key);
    if (inflight[key]) return inflight[key];
    var asset = ASSETS[key];
    var suffix = opts.retry ? '&bust=' + Date.now() : '';
    inflight[key] = Promise.all((asset.css || []).map(function (h) { return loadStyle(withVersion(h) + suffix); }))
      .then(function () {
        return (asset.js || []).reduce(function (p, src) {
          return p.then(function () { return loadScript(withVersion(src) + suffix); });
        }, Promise.resolve());
      })
      .then(function () {
        if (!isReady(key)) throw loadedButMissing(key);
        return key;
      })
      .catch(function (err) {
        inflight[key] = null;       // 실패는 캐시하지 않는다 — 다음 이동에서 다시 시도
        // 첫 실패는 '캐시에 남은 잘못된 응답'일 수 있다. 한 번만, 캐시를 우회해 다시 받아 본다.
        if (!opts.retry) return ensureOne(key, { retry: true });
        throw err;
      });
    return inflight[key];
  }

  function ensure(keys) {
    return Promise.all((keys || []).map(ensureOne));
  }

  root.MJ_LOADER = {
    VERSION: VERSION,
    ASSETS: ASSETS,
    NEEDS: NEEDS,
    SOFT: SOFT,
    needsFor: needsFor,
    softFor: softFor,
    missing: missing,
    isReady: isReady,
    ensure: ensure,
    ensureOne: ensureOne
  };
})(window);

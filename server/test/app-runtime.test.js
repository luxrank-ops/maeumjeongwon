'use strict';

// 앱 셸(js/app.js)을 가상 DOM에서 실제로 그려 라우트 런타임 오류를 잡는다.
// 소스 grep만으로는 haversine 미정의·요금제 카드 맵 버그처럼 화면이 깨지는 문제를 놓친다.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.join(__dirname, '..', '..');

class El {
  constructor(tag, id) {
    this.tagName = String(tag || 'DIV').toUpperCase();
    this.id = id || '';
    this.className = '';
    this._classes = new Set();
    this.classList = {
      add: c => this._classes.add(c),
      remove: c => this._classes.delete(c),
      toggle: (c, force) => {
        if (force === true) this._classes.add(c);
        else if (force === false) this._classes.delete(c);
        else if (this._classes.has(c)) this._classes.delete(c);
        else this._classes.add(c);
      },
      contains: c => this._classes.has(c)
    };
    this.children = [];
    this.dataset = {};
    this.style = {};
    this.attributes = {};
    this._listeners = {};
    this.innerHTML = '';
    this.textContent = '';
    this.value = '';
    this.disabled = false;
    this.href = '';
  }
  setAttribute(k, v) { this.attributes[k] = String(v); }
  getAttribute(k) { return Object.prototype.hasOwnProperty.call(this.attributes, k) ? this.attributes[k] : null; }
  addEventListener(ev, fn) { (this._listeners[ev] = this._listeners[ev] || []).push(fn); }
  click() { for (const fn of (this._listeners.click || []).slice()) fn({}); }
  querySelectorAll() { return []; }
  querySelector() { return null; }
  closest() { return null; }
  appendChild(c) { this.children.push(c); return c; }
}

// opts.eagerData === false 이면 지연 자산(기도·스토리·전통사찰·풍수)을 미리 넣지 않는다 →
// 로더가 화면에 맞춰 그때 받아오는지(그리고 무엇을 받는지)를 실제로 검사할 수 있다.
function loadApp(opts = {}) {
  const loadedScripts = [];
  const loadedStyles = [];
  const byId = {};
  const make = (id, tag) => {
    const el = new El(tag || 'div', id);
    byId[id] = el;
    return el;
  };

  const view = make('view', 'main');
  make('toast', 'div');
  const modal = make('modal', 'div');
  modal.classList.add('hidden');
  make('plusChip', 'a');
  make('bigToggle', 'button');
  make('themeToggle', 'button');   // 낮 / 저조도 토글 (⑮-1d)
  make('langToggle', 'button');
  make('installBtn', 'button');
  const offlineBanner = make('offlineBanner', 'div');
  offlineBanner.classList.add('hidden');
  const audioBar = make('audioBar', 'div');
  audioBar.classList.add('hidden');

  const tabs = ['home', 'explore', 'map', 'missions', 'journal'].map(t => {
    const a = new El('a');
    a.dataset.tab = t;
    a.href = '#/' + t;
    return a;
  });

  // opts.store 로 저장소를 미리 채울 수 있다 — '처음 온 사용자'와 '기록이 쌓인 사용자'를 갈라 본다.
  const store = Object.assign({}, opts.store || {});
  const localStorage = {
    getItem: k => (Object.prototype.hasOwnProperty.call(store, k) ? store[k] : null),
    setItem: (k, v) => { store[k] = String(v); },
    removeItem: k => { delete store[k]; }
  };

  // 화면을 innerHTML 로 그리기 때문에 '그려진 요소'는 실제 노드가 없다.
  // 렌더 직후 app.js 가 getElementById 로 붙이는 입력(검색칸 등)을 검사할 수 있도록,
  // 알 수 없는 id 는 요청 시 한 번만 만들어 되돌려 준다 (같은 id → 같은 객체).
  const autoEls = {};

  const locationObj = { hash: '#/home', protocol: 'http:', href: 'http://127.0.0.1/#/home' };
  const windowListeners = {};
  const documentListeners = {};

  const document = {
    documentElement: new El('html'),
    body: new El('body'),
    head: new El('head'),
    getElementById: id => byId[id] || (autoEls[id] = autoEls[id] || new El('div', id)),
    querySelector: sel => (sel === '.tabbar a' ? tabs[0] : null),
    querySelectorAll: sel => (sel === '.tabbar a' ? tabs : []),
    createElement: tag => new El(tag),
    addEventListener: (ev, fn) => { (documentListeners[ev] = documentListeners[ev] || []).push(fn); }
  };

  // <script>/<link> 주입을 '디스크에서 읽어 실행'으로 흉내 낸다 → 로더의 지연 로딩을 실제로 돌려 본다.
  document.head.appendChild = el => {
    const tag = String(el.tagName || '').toUpperCase();
    if (tag === 'SCRIPT' && el.src) {
      const rel = String(el.src).replace(/^\/+/, '').split('?')[0];
      // opts.failScripts: 특정 자산을 '받지 못한' 상황을 흉내 낸다 (lazy 로딩 실패 화면 검사용)
      if ((opts.failScripts || []).some(re => re.test(String(el.src)))) {
        if (typeof el.onerror === 'function') el.onerror(new Error('simulated load failure: ' + el.src));
        return el;
      }
      try {
        if (/^vendor\//.test(rel)) {
          // 실제 leaflet은 진짜 DOM이 필요하므로 검사용 스텁을 꽂는다 (지도 화면이 쓰는 API만)
          sandbox.L = L; sandbox.window.L = L; loadedScripts.push(rel);
        } else {
          const full = path.join(ROOT, rel);
          vm.runInContext(fs.readFileSync(full, 'utf8'), sandbox, { filename: full });
          loadedScripts.push(rel);
        }
        if (typeof el.onload === 'function') el.onload();
      } catch (err) {
        if (typeof el.onerror === 'function') el.onerror(err); else throw err;
      }
    } else if (tag === 'LINK') {
      loadedStyles.push(String(el.href || '').replace(/^\/+/, '').split('?')[0]);
      if (typeof el.onload === 'function') el.onload();
    }
    return el;
  };

  const jsonRes = (body, status = 200) => ({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body
  });

  async function fakeFetch(url) {
    const u = String(url);
    if (u.includes('/api/session')) return jsonRes({ uid: 'mj_runtime_test', token: 'mj1.runtime.testtoken' });
    if (u.includes('/api/me')) {
      return jsonRes({
        uid: 'mj_runtime_test',
        mode: { devAdReward: true, devEntitlement: true },
        plus: { active: false, status: 'none', plan: null, expiresAt: 0, willRenew: false, trial: false },
        packs: [],
        adToday: { used: 0, limit: 2 },
        adUnlocks: {},
        ai: { ok: true, tier: 'Google AI Pro', model: 'gemini-4-argon' }
      });
    }
    if (u.includes('/api/stories')) return jsonRes({ stories: [], soon: [] });
    if (u.includes('/api/ai/')) return jsonRes({ ok: true });
    return jsonRes({});
  }

  const windowObj = {
    document,
    localStorage,
    location: locationObj,
    navigator: { onLine: true, userAgent: 'Mozilla/5.0', serviceWorker: undefined, standalone: false },
    matchMedia: () => ({ matches: false, addEventListener() {}, addListener() {} }),
    addEventListener: (ev, fn) => { (windowListeners[ev] = windowListeners[ev] || []).push(fn); },
    scrollTo() {},
    MJ_CONFIG: {
      apiBase: '',
      demoPaywall: true,
      gaId: '',
      aiTier: 'Google AI Pro',
      aiModel: 'gemini-4-argon',
      aiFallbackModel: 'gemini-3.8-flash',
      aiEndpoint: '/api/ai/counsel'
    },
    speechSynthesis: { cancel() {}, speaking: false },
    fetch: fakeFetch,
    setTimeout: fn => { try { fn(); } catch (e) {} return 1; },
    clearTimeout() {},
    setInterval: () => 1,
    clearInterval() {},
    innerWidth: 390,
    innerHeight: 844
  };

  const L = {
    map: () => ({
      setView() { return this; },
      getZoom() { return 7; },
      latLngToLayerPoint() { return { x: 0, y: 0 }; },
      on() { return this; },
      locate() { return this; },
      once() { return this; },
      invalidateSize() {},
      remove() {},
      _draw() {}
    }),
    tileLayer: () => ({ addTo() {} }),
    layerGroup: () => ({ addTo() { return this; }, clearLayers() {} }),
    circleMarker: () => ({ bindPopup() { return this; }, addTo() { return this; } }),
    marker: () => ({ bindPopup() { return this; }, addTo() { return this; } }),
    divIcon: opts => opts
  };

  const sandbox = {
    window: windowObj,
    document,
    localStorage,
    location: locationObj,
    navigator: windowObj.navigator,
    L,
    console,
    setTimeout: windowObj.setTimeout,
    clearTimeout: windowObj.clearTimeout,
    setInterval: windowObj.setInterval,
    clearInterval: windowObj.clearInterval,
    fetch: fakeFetch,
    speechSynthesis: windowObj.speechSynthesis
  };
  sandbox.globalThis = sandbox;
  windowObj.window = windowObj;
  // 지연 데이터를 미리 넣은 환경(기본값)은 leaflet까지 있는 상태로 본다 — 화면을 동기적으로 검사하기 위해.
  if (opts.eagerData !== false) windowObj.L = L;
  vm.createContext(sandbox);

  // index.html과 같은 순서: loader → 핵심 데이터 → config → analytics → app.
  // 기능 묶음과 화면별 데이터는 앱 셸이 그려진 뒤 로더가 받는다.
  const EAGER = [
    'js/lib/loader.js',
    'js/data-temples.js',
    'js/planner-reco.js',
    'js/config.js',
    'js/analytics.js',
    'js/app.js'
  ];
  const LAZY = [
    'js/data-prayer.js',
    'js/data-stories.js',
    'js/data-traditional.js',
    'js/data-fengshui.js',
    'js/app/planner.js',
    'js/app/map.js'
  ];
  const files = opts.eagerData === false ? EAGER.slice() : EAGER.slice(0, 2).concat(LAZY, EAGER.slice(2));
  for (const file of files) {
    const full = path.join(ROOT, file);
    vm.runInContext(fs.readFileSync(full, 'utf8'), sandbox, { filename: full });
  }

  function fireNav(hash) {
    locationObj.hash = hash;
    for (const fn of windowListeners.hashchange || []) fn();
  }

  function go(hash) {
    fireNav(hash);
    return view.innerHTML || '';
  }

  function clickLang() {
    const button = new El('button', 'langToggle');
    const target = { closest: selector => selector.split(',').map(s => s.trim()).includes('#langToggle') ? button : null };
    for (const fn of documentListeners.click || []) fn({ target });
  }

  // 지연 로딩이 있는 화면은 자산을 받은 뒤 다시 그려진다 → 준비 완료를 기다린 뒤 본문을 돌려준다.
  async function goAsync(hash) {
    fireNav(hash);
    if (typeof windowObj.MJ_NAV_READY === 'function') await windowObj.MJ_NAV_READY();
    return view.innerHTML || '';
  }

  function clickEl(el) {
    const target = {
      closest: selector => {
        const parts = selector.split(',').map(s => s.trim());
        for (const p of parts) {
          if (p === '#langToggle' && el.id === 'langToggle') return el;
          if (p === '[data-act]' && el.dataset.act) return el;
          if (p === '[data-mood]' && el.dataset.mood != null) return el;
          if (p === '[data-f]' && el.dataset.f != null) return el;
          if (p === '[data-go]' && el.dataset.go) return el;
          if (p === '[data-map-view]' && el.dataset.mapView != null) return el;
          if (p === 'a[href^="#/"]' && el.tagName === 'A' && String(el.getAttribute('href') || '').startsWith('#/')) return el;
        }
        return null;
      }
    };
    for (const fn of documentListeners.click || []) fn({ target, preventDefault() {} });
  }

  return {
    window: windowObj,
    view,
    modal,
    go,
    goAsync,
    clickLang,
    clickEl,
    loadedScripts: () => loadedScripts.slice(),
    loadedStyles: () => loadedStyles.slice()
  };
}

test('핵심 화면(홈·탐색 테마·플러스·리포트·플래너)이 런타임 오류 없이 그려진다', () => {
  const { go, window: win } = loadApp();
  assert.equal(win.TEMPLES.length, 65);
  assert.ok(typeof win.PLANNER_RECO.recommend === 'function');

  const routes = {
    '#/home': /마음 처방전|순례/,
    '#/explore': /사찰 탐색/,
    '#/explore/theme/wish': /관음|소원|코스/,
    '#/explore/theme/energy': /적멸|기운/,
    '#/fengshui': /풍수/,
    '#/temple/haeinsa': /해인사/,
    '#/map': /지도/,
    '#/missions': /염주|미션/,
    '#/journal': /수첩/,
    '#/plus': /월간|연간|플러스/,
    '#/store': /상점|코스팩/,
    '#/story/haeinsa-1': /해인사|스토리/,
    '#/report': /순례 리포트|발자취/,
    '#/mind': /마음 처방전/,
    '#/planner': /여행 계획|추천/,
    '#/planner/new': /새 사찰 여행|추천 계획/
  };

  for (const [hash, re] of Object.entries(routes)) {
    let html;
    assert.doesNotThrow(() => { html = go(hash); }, `${hash} 렌더가 예외를 던지지 않아야 함`);
    assert.ok(html.length > 80, `${hash} 본문이 비어 있지 않아야 함`);
    assert.match(html, re, `${hash} 에 기대 문구가 있어야 함`);
  }
});

test('요금제 카드는 월간·연간 키를 문자 한 글자로 잘리지 않고 그린다', () => {
  const { go } = loadApp();
  const html = go('#/plus');
  assert.match(html, /월 4,900원/);
  assert.match(html, /연 39,000원/);
  assert.match(html, /data-plan="monthly"/);
  assert.match(html, /data-plan="yearly"/);
  assert.equal(html.includes('data-plan="m"'), false);
});

test('첫 실행에서는 예시 방문·수첩 기록을 실제 기록처럼 자동 삽입하지 않는다', () => {
  const app = loadApp({ store: {} });
  const home = app.go('#/home');
  const state = JSON.parse(app.window.localStorage.getItem('maeumjeongwon.v1') || '{}');
  assert.deepEqual(state.visits || [], []);
  assert.deepEqual(state.journal || [], []);
  assert.match(home, /오늘의 마음 처방전/);
  assert.ok(home.indexOf('오늘의 마음 처방전') < home.indexOf('취향에 맞춰 추천받기'), '첫 추천을 본 뒤 선택 온보딩을 노출');

  const missions = app.go('#/missions');
  assert.match(missions, /아직 남긴 걸음이 없어요/);
  assert.doesNotMatch(missions, /예시 \d+건 포함/);
});

test('방문 상세는 실용정보와 도착 행동을 이야기보다 먼저 보여 준다', () => {
  const { go } = loadApp();
  const html = go('#/temple/haeinsa');
  assert.ok(html.indexOf('id="visit-info"') < html.indexOf('기원·역사'), '방문 요약이 이야기보다 먼저');
  assert.ok(html.indexOf('개방시간') < html.indexOf('기원·역사'), '운영 정보를 빠르게 찾을 수 있음');
  assert.ok(html.indexOf('class="actionbar') < html.indexOf('기원·역사'), '길찾기·현장 인증 행동이 상단에 있음');
  assert.match(html, /도착 후 방문 인증/);
  assert.match(html, /현장 GPS 반경/);
  assert.match(html, /정보 변경 가능/);
  assert.match(html, /방문 도구/);
});

test('지도에는 지도·목록 전환과 필터링된 목록을 함께 제공한다', () => {
  const { go } = loadApp();
  const html = go('#/map');
  assert.match(html, /data-map-view="map"/);
  assert.match(html, /data-map-view="list"/);
  assert.match(html, /id="mapListResults"/);
  assert.match(html, /aria-label="사찰 분류"/);
});

test('순례 화면에는 방문과 수첩 기록을 잇는 여정 타임라인과 빈 상태가 있다', () => {
  const fresh = loadApp({ store: { 'maeumjeongwon.v1': JSON.stringify({ visits: [], journal: [] }) } });
  assert.match(fresh.go('#/missions'), /걸어온 여정/);
  assert.match(fresh.view.innerHTML, /사찰을 둘러보고, 다녀온 날의 생각/);

  const demo = loadApp({ store: { 'maeumjeongwon.v1': JSON.stringify({
    visits: [{ tid: 'haeinsa', date: '2026-10-10', method: 'gps', sample: true }],
    journal: [{ id: 'sample-note', tid: 'haeinsa', date: '2026-10-10', note: '예시 기록', sample: true }]
  }) } });
  const timeline = demo.go('#/missions');
  assert.match(timeline, /class="journey-event sample"/);
  assert.match(timeline, /예시/);
  assert.match(timeline, /예시 기록/);
  assert.match(timeline, /도감 0곳 \/ 100곳/, '예시 방문은 실제 순례 진척도에 포함하지 않는다');
  assert.match(timeline, /0알 모았어요/, '예시 방문은 실제 염주 수에 포함하지 않는다');
});

test('지연 로딩: 홈은 스토리·기능을 소프트 로드하고, 지도·전통사찰·풍수·기도 화면은 들어갈 때 받는다', async () => {
  const app = loadApp({ eagerData: false });

  // ① 첫 화면(홈) — 스토리와 기능 묶음은 첫 렌더 뒤에 받는다
  const home = await app.goAsync('#/home');
  assert.match(home, /마음 처방전|순례/);
  let got = app.loadedScripts();
  assert.ok(got.includes('js/data-stories.js'), '홈 → 지연 스토리 데이터');
  assert.ok(got.includes('js/features.js'), '기능 묶음은 첫 화면을 그린 뒤 소프트 로드');
  assert.equal(got.some(f => /leaflet/.test(f)), false, '홈에서는 지도(leaflet)를 받지 않는다');
  assert.equal(got.includes('js/data-traditional.js'), false, '홈에서는 전통사찰 991곳을 받지 않는다');
  assert.equal(got.includes('js/data-prayer.js'), false, '홈에서는 기도 데이터를 받지 않는다');
  assert.equal(got.includes('js/data-fengshui.js'), false, '홈에서는 풍수 대백과를 받지 않는다');

  // ② 지도 화면 — leaflet(js+css)이 필요하다
  assert.match(await app.goAsync('#/map'), /사찰 지도/);
  assert.ok(app.loadedScripts().some(f => /leaflet\.js$/.test(f)), '지도 화면 → leaflet 스크립트');
  assert.ok(app.loadedStyles().some(f => /leaflet\.css$/.test(f)), '지도 화면 → leaflet 스타일');
  assert.ok(app.loadedScripts().includes('js/app/map.js'), '지도 화면 → 지도 UI 모듈');

  // ③ 전통사찰 991곳 화면
  assert.match(await app.goAsync('#/explore/all'), /전통사찰/);
  assert.ok(app.loadedScripts().includes('js/data-traditional.js'), '전통사찰 화면 → 991곳 데이터');

  // ④ 풍수 대백과 화면
  assert.match(await app.goAsync('#/fengshui'), /풍수/);
  assert.ok(app.loadedScripts().includes('js/data-fengshui.js'), '풍수 화면 → 대백과 데이터');

  // ⑤ 기도 가이드 화면
  assert.match(await app.goAsync('#/guide/prayer'), /기도/);
  assert.ok(app.loadedScripts().includes('js/data-prayer.js'), '기도 화면 → 기도 데이터');

  // ⑥ 계획 화면 — 계획 모듈(945줄)도 그때 받는다
  assert.equal(app.loadedScripts().includes('js/app/planner.js'), false, '홈·지도에서는 계획 모듈을 받지 않는다');
  const planner = await app.goAsync('#/planner');
  assert.equal(planner.includes('불러오는 중'), false, '계획 화면이 자리 표시 문구로 남으면 안 된다');
  assert.match(planner, /여행 계획|추천/);
  assert.ok(app.loadedScripts().includes('js/app/planner.js'), '계획 화면 → js/app/planner.js');
  assert.match(await app.goAsync('#/planner/new'), /새 사찰 여행|추천 계획/);

  // ⑦ 이미 받은 자산은 다시 받지 않는다 (중복 요청 0)
  const before = app.loadedScripts().length;
  await app.goAsync('#/home');
  await app.goAsync('#/map');
  await app.goAsync('#/fengshui');
  await app.goAsync('#/planner');
  assert.equal(app.loadedScripts().length, before, '같은 자산을 두 번 받지 않는다');
});

test('지연 자산 표(NEEDS)는 라우터의 화면과 짝을 이룬다 — 빠진 화면·죽은 키 방지', () => {
  const loader = loadApp({ eagerData: false }).window.MJ_LOADER;
  assert.ok(loader, 'index.html과 같은 순서로 loader.js가 먼저 실행된다');

  const used = new Set(Object.values(loader.NEEDS).concat(Object.values(loader.SOFT)).reduce((a, b) => a.concat(b), []));
  for (const key of Object.keys(loader.ASSETS)) {
    assert.ok(used.has(key), `${key} 자산을 필요로 하는 화면이 표에 없다 (죽은 자산)`);
  }

  const routes = ['home', 'explore', 'fengshui', 'temple', 'map', 'missions', 'dex', 'journal',
    'plus', 'store', 'story', 'report', 'guide', 'season-report', 'mind', 'planner', 'board', 'account'];
  for (const key of Object.keys(loader.NEEDS)) {
    assert.ok(routes.includes(key.split('/')[0]), `NEEDS 키 '${key}' 의 화면이 라우터에 없다`);
  }

  // 지연 로딩 대상은 첫 화면(index.html)에서 미리 받지 않는다 — 받으면 표가 무의미해진다
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  for (const asset of Object.values(loader.ASSETS)) {
    for (const src of (asset.js || []).concat(asset.css || [])) {
      assert.equal(html.includes('"' + src + '"'), false, `지연 자산이 index.html에 직접 들어 있다: ${src}`);
    }
  }
});

test('홈은 스토리 데이터를 기다리지 않고 먼저 그린다 — 도착하면 이어서 채운다', async () => {
  const app = loadApp({ eagerData: false });
  const first = app.go('#/home');                 // 동기 렌더: 지연 자산이 없어도 화면이 선다
  assert.match(first, /마음 처방전/);
  assert.equal(first.includes('이번 주 심화 스토리'), false, '아직 스토리는 없다');
  assert.equal(app.loadedScripts().includes('js/features.js'), false, '첫 화면이 그려질 때는 부가 기능 모듈을 받지 않는다');
  await app.goAsync('#/home');                    // 도착 후 다시 그린 화면
  assert.match(app.view.innerHTML, /이번 주 심화 스토리/);
  assert.ok(app.loadedScripts().includes('js/data-stories.js'));
});

test('부가 기능이 아직 로드되지 않았을 때 누른 언어 토글도 모듈 도착 뒤 실행한다', async () => {
  const app = loadApp({ eagerData: false });
  assert.equal(app.window.MJ_FEATURES, undefined);
  app.clickLang();
  await app.window.MJ_NAV_READY();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(app.window.MJ_FEATURES.I18N.getLang(), 'en');
});

/* ---------------------------------------------------------------------------
   2026-10 2차 리프레시 (docs/design-refresh.md 5절) — 정적 grep으로는 못 잡는 것들
   --------------------------------------------------------------------------- */

test('탐색 검색은 탭 위에 항상 있고, 검색어가 주소·결과에 함께 반영된다', () => {
  const { go } = loadApp();

  // 검색 칸은 탭(순위별·테마별·지역별·전통사찰) 어디를 열어도 같은 자리에 있다
  for (const hash of ['#/explore', '#/explore/theme/energy', '#/explore/region/경북', '#/explore/all']) {
    const html = go(hash);
    assert.match(html, /id="eq"/, `${hash} 에 상시 검색칸이 있어야 함`);
    assert.ok(html.indexOf('id="eq"') < html.indexOf('class="seg"'), `${hash} 검색칸이 탭보다 위여야 함`);
  }

  // 수록 사찰 검색: '해인사'는 걸리고 '없는절'은 안 걸린다
  const hit = go('#/explore/list/해인사');
  assert.match(hit, /해인사/);
  assert.equal(hit.includes('전체 수록 사찰'), false, '검색 중에는 전체 목록을 늘어놓지 않는다');
  const miss = go('#/explore/list/없는절이름');
  assert.match(miss, /못 찾았어요/);
  assert.match(miss, /#\/explore\/all\/.*%E.*|#\/explore\/all\//, '못 찾으면 991곳으로 넘어가는 길을 준다');

  // 테마·지역 탭은 '선택값 + 검색어' 두 칸을 함께 들고 다닌다
  const themed = go('#/explore/theme/energy/해인사');
  assert.ok(themed.includes('href="#/explore/theme/energy'), '테마 선택값이 주소에 남아야 함');
});

test('탐색 검색 입력이 결과만 다시 그리고, 주소는 replaceState 로 따라간다', () => {
  const { window: win, view, go } = loadApp();
  const replaced = [];
  win.history = { replaceState: (a, b, url) => replaced.push(url) };
  go('#/explore');

  const input = win.document.getElementById('eq');
  assert.ok(input, '검색칸이 DOM에 있어야 함');
  input.value = '통도사';
  for (const fn of (input._listeners.input || [])) fn({});   // 디바운스는 테스트에서 즉시 실행된다

  assert.ok(replaced.length >= 1, '주소를 replaceState 로 갱신해야 함');
  assert.match(replaced[replaced.length - 1], /#\/explore\/list\//);
  assert.match(view.innerHTML, /통도사/, '결과가 다시 그려져야 함');
});

test('홈 순서는 "내가 남긴 기록" 3건을 기준으로 바뀌고, 예시 기록은 세지 않는다', () => {
  // 첫 실행에는 기록을 자동으로 넣지 않는다 → 처음 온 사용자에게 처방전이 먼저
  const fresh = loadApp({ store: {} });
  const freshHtml = fresh.go('#/home');
  assert.ok(freshHtml.indexOf('오늘의 마음 처방전') < freshHtml.indexOf('내 순례'),
    '처음 온 사용자에게는 마음 처방전이 먼저여야 함');
  assert.match(freshHtml, /data-home-order="new"/);

  // 사용자가 직접 남긴 기록이 3건 쌓이면 '내 순례'가 처방전 위로 올라온다
  const own = {
    visits: [{ tid: 'tongdosa', date: '2026-10-09', method: 'gps' }],
    journal: [
      { id: 'a', tid: 'tongdosa', date: '2026-10-09', note: '첫 걸음' },
      { id: 'b', tid: 'haeinsa', date: '2026-10-10', note: '두 번째' }
    ]
  };
  const returning = loadApp({ store: { 'maeumjeongwon.v1': JSON.stringify(own) } });
  const html = returning.go('#/home');
  assert.ok(html.indexOf('내 순례') < html.indexOf('마음 처방전'),
    '기록이 쌓인 사용자에게는 내 순례가 먼저여야 함');
  assert.match(html, /data-home-order="returning"/);
});

test('낮 / 저조도 토글은 <html data-theme> 하나만 바꾼다', () => {
  const { window: win, view, go } = loadApp();
  go('#/home');
  const root = win.document.documentElement;
  // 시스템 설정이 '밝음'인 환경 → 처음은 낮
  assert.equal(root.getAttribute('data-theme'), 'light');

  const btn = win.document.getElementById('themeToggle');
  assert.ok(btn, '테마 토글 버튼이 있어야 함');
  btn.click();
  assert.equal(root.getAttribute('data-theme'), 'dark');
  assert.equal(btn.getAttribute('aria-pressed'), 'true');
  assert.equal(win.localStorage.getItem('maeumjeongwon.theme.v1'), 'dark');

  btn.click();
  assert.equal(root.getAttribute('data-theme'), 'light');
  assert.equal(win.localStorage.getItem('maeumjeongwon.theme.v1'), 'light');

  // 저장된 값이 있으면 시스템 설정보다 '사용자가 고른 것'이 이긴다
  const dark = loadApp({ store: { 'maeumjeongwon.theme.v1': 'dark' } });
  dark.go('#/home');
  assert.equal(dark.window.document.documentElement.getAttribute('data-theme'), 'dark');
  assert.ok(view.innerHTML.length > 0);
});

test('메인 타이틀은 "마음정원사 : 절로가"와 "춘학아~절에 가자~^^"로 그려진다', () => {
  const { go } = loadApp();
  const home = go('#/home');
  assert.match(home, /마음정원사 <span class="main-title__sep">:<\/span> 절로가/);
  assert.match(home, /춘학아~절에 가자~\^\^/);
  assert.doesNotMatch(home, /철로가/);
});

test('미끼 기능은 비회원에게 열려 있고 주요 기능을 쓰려 할 때는 회원가입·로그인 창이 열린다', () => {
  const { go, modal, clickEl } = loadApp({ store: {} });
  go('#/home');
  assert.equal(modal.classList.contains('hidden'), true, '홈 첫 진입 시에는 모달이 닫혀 있어야 함');

  // 미끼 기능 1: 오늘의 기분 고르기는 비회원도 바로 동작한다
  const moodBtn = new El('button');
  moodBtn.dataset.mood = '2';
  clickEl(moodBtn);
  assert.equal(modal.classList.contains('hidden'), true, '기분 체크인(미끼 기능)은 로그인 창을 띄우지 않는다');

  // 미끼 기능 2: 3분 호흡 명상은 비회원도 바로 열 수 있다
  const breathBtn = new El('button');
  breathBtn.dataset.act = 'daily-breathing';
  clickEl(breathBtn);
  assert.equal(modal.classList.contains('hidden'), false);
  assert.match(modal.innerHTML, /3분 호흡 명상/);
  assert.doesNotMatch(modal.innerHTML, /data-auth-form/);

  // 모달 닫기
  const closeBtn = new El('button');
  closeBtn.dataset.act = 'close';
  clickEl(closeBtn);
  assert.equal(modal.classList.contains('hidden'), true);

  // 주요 기능 1: GPS 방문 인증을 누르면 회원가입 / 로그인 창이 뜬다
  const gpsBtn = new El('button');
  gpsBtn.dataset.act = 'gps';
  gpsBtn.dataset.id = 'haeinsa';
  clickEl(gpsBtn);
  assert.equal(modal.classList.contains('hidden'), false, '비회원이 주요 기능을 누르면 로그인·회원가입 창이 열려야 함');
  assert.match(modal.innerHTML, /GPS 사찰 방문 인증/);
  assert.match(modal.innerHTML, /data-auth-form="login"/);

  // 모달 안에서 회원가입 탭으로 전환하면 가입 폼이 나타난다
  const signupTab = new El('button');
  signupTab.dataset.act = 'auth-tab';
  signupTab.dataset.tab = 'signup';
  clickEl(signupTab);
  assert.match(modal.innerHTML, /data-auth-form="signup"/);
  assert.match(modal.innerHTML, /회원가입하고 바로 이용하기/);

  // 주요 기능 2: 여행 계획 링크(#/planner/new)를 누르면 회원가입 / 로그인 창이 뜬다
  clickEl(closeBtn);
  const planLink = new El('a');
  planLink.setAttribute('href', '#/planner/new');
  clickEl(planLink);
  assert.equal(modal.classList.contains('hidden'), false);
  assert.match(modal.innerHTML, /사찰 여행 코스 플래너/);
});


test('회원 모듈을 받지 못해도 가입·로그인 화면은 열린다 (지연 자산 실패 안전판)', async () => {
  // js/app/community.js 를 못 받은 상황 — 예전에는 '화면을 불러오는 중이에요'에서 영원히 멈췄다.
  const app = loadApp({ failScripts: [/js\/app\/community\.js/] });

  const signup = await app.goAsync('#/account/signup');
  assert.match(signup, /data-auth-form="signup"/, '모듈 없이도 가입 폼을 그려야 함');
  assert.match(signup, /회원가입하고 바로 이용하기/);
  assert.match(signup, /이메일·닉네임·비밀번호만 있으면 돼요/);

  const login = await app.goAsync('#/account/login');
  assert.match(login, /data-auth-form="login"/, '모듈 없이도 로그인 폼을 그려야 함');

  // 게시판 목록은 모듈이 필요하다 — '불러오는 중' 대신 이유와 다음 행동(다시 불러오기)을 준다
  const board = await app.goAsync('#/board');
  assert.match(board, /게시판 화면을 불러오지 못했어요/);
  assert.match(board, /data-act="community-retry"/);
  assert.doesNotMatch(board, /불러오는 중이에요/);
});

test('로더: 스크립트는 왔지만 모듈이 없으면 실패로 보고, 캐시를 우회해 한 번 더 받는다', async () => {
  const requested = [];
  const vm2 = require('node:vm');
  const sandbox = { console, Promise, setTimeout, Date, URL };
  const el = () => ({ setAttribute() {}, set src(v) { this._src = v; }, get src() { return this._src; } });
  sandbox.document = {
    head: {
      appendChild(node) {
        requested.push(node.src);
        if (requested.length === 2) sandbox.MJ_COMMUNITY_FACTORY = function () {};   // 두 번째 시도에서야 등록된다
        if (node.onload) node.onload();
        return node;
      }
    },
    createElement: el,
    documentElement: { appendChild() {} }
  };
  sandbox.window = sandbox;
  vm2.createContext(sandbox);
  vm2.runInContext(fs.readFileSync(path.join(ROOT, 'js', 'lib', 'loader.js'), 'utf8'), sandbox, { filename: 'loader.js' });

  const key = await sandbox.MJ_LOADER.ensureOne('community');
  assert.equal(key, 'community');
  assert.equal(requested.length, 2, '첫 응답에서 모듈이 없으면 한 번 재시도해야 함');
  assert.match(requested[0], /community\.js\?v=/);
  assert.match(requested[1], /community\.js\?v=.*&bust=/, '재시도는 캐시를 우회하는 URL 이어야 함');

  // 끝내 등록되지 않으면 '불러오는 중'이 아니라 실패로 끝나야 한다 (화면이 복구 안내를 그릴 수 있게)
  const requested2 = [];
  const sandbox2 = { console, Promise, setTimeout, Date, URL };
  sandbox2.document = {
    head: { appendChild(node) { requested2.push(node.src); if (node.onload) node.onload(); return node; } },
    createElement: el,
    documentElement: { appendChild() {} }
  };
  sandbox2.window = sandbox2;
  vm2.createContext(sandbox2);
  vm2.runInContext(fs.readFileSync(path.join(ROOT, 'js', 'lib', 'loader.js'), 'utf8'), sandbox2, { filename: 'loader.js' });
  await assert.rejects(() => sandbox2.MJ_LOADER.ensureOne('community'), /모듈이 등록되지 않았어요/);
  assert.equal(requested2.length, 2, '재시도는 한 번만 (무한 반복 금지)');
});

test('서비스 워커: 코드·스타일은 네트워크 우선, 잘못된 형식은 캐시하지 않는다', () => {
  const sw = fs.readFileSync(path.join(ROOT, 'sw.js'), 'utf8');
  assert.match(sw, /maeumjeongwon-v11/, '캐시 이름을 올려 구 캐시를 지운다');
  assert.match(sw, /CODE_RE/, '코드·스타일 판별식이 있어야 함');
  assert.match(sw, /fetch\(req\)\s*\n?\s*\.then\(res => \{[\s\S]{0,200}?cacheable\(req, res\)/,
    '코드 요청은 네트워크 응답을 먼저 쓰고, 형식이 맞을 때만 캐시한다');
  assert.match(sw, /javascript|ecmascript/i, '스크립트 응답의 Content-Type 을 확인해야 함');
});

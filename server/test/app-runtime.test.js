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

  const store = {};
  const localStorage = {
    getItem: k => (Object.prototype.hasOwnProperty.call(store, k) ? store[k] : null),
    setItem: (k, v) => { store[k] = String(v); },
    removeItem: k => { delete store[k]; }
  };

  const locationObj = { hash: '#/home', protocol: 'http:', href: 'http://127.0.0.1/#/home' };
  const windowListeners = {};
  const documentListeners = {};

  const document = {
    documentElement: new El('html'),
    body: new El('body'),
    head: new El('head'),
    getElementById: id => byId[id] || null,
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
    setInterval: () => 1,
    clearInterval() {},
    innerWidth: 390,
    innerHeight: 844
  };

  const L = {
    map: () => ({
      setView() { return this; },
      locate() { return this; },
      once() { return this; },
      invalidateSize() {},
      remove() {},
      _draw() {}
    }),
    tileLayer: () => ({ addTo() {} }),
    layerGroup: () => ({ addTo() { return this; }, clearLayers() {} }),
    circleMarker: () => ({ bindPopup() { return this; }, addTo() { return this; } })
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

  // index.html과 같은 순서: loader → 핵심 데이터 → (지연 데이터) → config → analytics → features → app
  const EAGER = [
    'js/lib/loader.js',
    'js/data-temples.js',
    'js/planner-reco.js',
    'js/config.js',
    'js/analytics.js',
    'js/features.js',
    'js/app.js'
  ];
  const LAZY = [
    'js/data-prayer.js',
    'js/data-stories.js',
    'js/data-traditional.js',
    'js/data-fengshui.js',
    'js/app/planner.js'
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

  // 지연 로딩이 있는 화면은 자산을 받은 뒤 다시 그려진다 → 준비 완료를 기다린 뒤 본문을 돌려준다.
  async function goAsync(hash) {
    fireNav(hash);
    if (typeof windowObj.MJ_NAV_READY === 'function') await windowObj.MJ_NAV_READY();
    return view.innerHTML || '';
  }

  return {
    window: windowObj,
    view,
    go,
    goAsync,
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

test('샘플 방문 기록이 있어도 순례 리포트 거리가 계산된다', () => {
  const { go } = loadApp();
  const html = go('#/report');
  assert.match(html, /순례 리포트/);
  assert.match(html, /km|발자취|방문/);
});

test('지연 로딩: 홈은 스토리만 받고, 지도·전통사찰·풍수·기도 화면은 들어갈 때 받는다', async () => {
  const app = loadApp({ eagerData: false });

  // ① 첫 화면(홈) — 스토리 데이터만 필요하다
  const home = await app.goAsync('#/home');
  assert.match(home, /마음 처방전|순례/);
  let got = app.loadedScripts();
  assert.ok(got.includes('js/data-stories.js'), '홈 → 스토리 데이터');
  assert.equal(got.some(f => /leaflet/.test(f)), false, '홈에서는 지도(leaflet)를 받지 않는다');
  assert.equal(got.includes('js/data-traditional.js'), false, '홈에서는 전통사찰 991곳을 받지 않는다');
  assert.equal(got.includes('js/data-prayer.js'), false, '홈에서는 기도 데이터를 받지 않는다');
  assert.equal(got.includes('js/data-fengshui.js'), false, '홈에서는 풍수 대백과를 받지 않는다');

  // ② 지도 화면 — leaflet(js+css)이 필요하다
  assert.match(await app.goAsync('#/map'), /사찰 지도/);
  assert.ok(app.loadedScripts().some(f => /leaflet\.js$/.test(f)), '지도 화면 → leaflet 스크립트');
  assert.ok(app.loadedStyles().some(f => /leaflet\.css$/.test(f)), '지도 화면 → leaflet 스타일');

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

  const used = new Set(Object.values(loader.NEEDS).reduce((a, b) => a.concat(b), []));
  for (const key of Object.keys(loader.ASSETS)) {
    assert.ok(used.has(key), `${key} 자산을 필요로 하는 화면이 표에 없다 (죽은 자산)`);
  }

  const routes = ['home', 'explore', 'fengshui', 'temple', 'map', 'missions', 'dex', 'journal',
    'plus', 'store', 'story', 'report', 'guide', 'season-report', 'mind', 'planner'];
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
  const first = app.go('#/home');                 // 동기 렌더: 스토리 없이도 화면이 선다
  assert.match(first, /마음 처방전/);
  assert.equal(first.includes('이번 주 심화 스토리'), false, '아직 스토리는 없다');
  await app.goAsync('#/home');                    // 도착 후 다시 그린 화면
  assert.match(app.view.innerHTML, /이번 주 심화 스토리/);
  assert.ok(app.loadedScripts().includes('js/data-stories.js'));
});

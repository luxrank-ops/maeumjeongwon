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

function loadApp() {
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
  vm.createContext(sandbox);

  for (const file of [
    'js/data-temples.js',
    'js/data-prayer.js',
    'js/data-stories.js',
    'js/data-traditional.js',
    'js/planner-reco.js',
    'js/data-fengshui.js',
    'js/config.js',
    'js/analytics.js',
    'js/features.js',
    'js/app.js'
  ]) {
    const full = path.join(ROOT, file);
    vm.runInContext(fs.readFileSync(full, 'utf8'), sandbox, { filename: full });
  }

  function go(hash) {
    locationObj.hash = hash;
    for (const fn of windowListeners.hashchange || []) fn();
    return view.innerHTML || '';
  }

  return { window: windowObj, view, go };
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

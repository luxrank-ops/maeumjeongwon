'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const analyticsCode = fs.readFileSync(path.join(__dirname, '..', '..', 'js', 'analytics.js'), 'utf-8');

function createSandbox({ gaId = 'G-TEST1234', metaGaId = '', consent = null, native = false, bodyPage = '', bodyItem = '' } = {}) {
  const store = {};
  if (consent !== null) store['maeumjeongwon.analytics'] = String(consent);
  const scripts = [];
  const banners = [];
  const dataLayer = [];

  const bodyAttrs = {};
  if (bodyPage) bodyAttrs['data-mj-page'] = bodyPage;
  if (bodyItem) bodyAttrs['data-mj-item'] = bodyItem;

  const sandbox = {
    MJ_CONFIG: gaId !== null ? { gaId } : {},
    Capacitor: native ? { isNativePlatform: () => true } : undefined,
    location: { protocol: native ? 'capacitor:' : 'https:' },
    localStorage: {
      getItem: k => (k in store ? store[k] : null),
      setItem: (k, v) => { store[k] = String(v); }
    },
    dataLayer,
    document: {
      querySelector: sel => {
        if (sel === 'meta[name="mj-ga-id"]' && metaGaId) {
          return { getAttribute: name => (name === 'content' ? metaGaId : null) };
        }
        return null;
      },
      getElementById: id => {
        if (id === 'mj-ga-script') return scripts.find(s => s.id === id) || null;
        if (id === 'mj-consent-banner') return banners[0] || null;
        return null;
      },
      createElement: tag => ({
        tag,
        id: '',
        src: '',
        async: false,
        className: '',
        style: '',
        innerHTML: '',
        remove: () => { banners.length = 0; }
      }),
      head: { appendChild: el => scripts.push(el) },
      body: {
        getAttribute: k => bodyAttrs[k] || null,
        appendChild: el => banners.push(el),
        removeChild: () => { banners.length = 0; }
      },
      addEventListener: () => {}
    }
  };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(analyticsCode, sandbox);
  return { sandbox, AN: sandbox.MJAnalytics, store, scripts, banners, dataLayer };
}

test('1. gaId가 비어 있으면 동의 요청도 하지 않고 스크립트도 로드하지 않는다', () => {
  const { AN, scripts } = createSandbox({ gaId: '' });
  assert.equal(AN.shouldPrompt(), false);
  assert.equal(AN.track('page_view', { page: 'home' }), false);
  assert.equal(scripts.length, 0);
});

test('2. 잘못된 형식의 gaId(예: UA-1234)는 무시된다', () => {
  const { AN } = createSandbox({ gaId: 'UA-123456' });
  assert.equal(AN.gaId(), '');
  assert.equal(AN.shouldPrompt(), false);
});

test('3. 유효한 gaId가 있고 아직 동의 전이면 shouldPrompt가 true이고 track은 전송하지 않는다', () => {
  const { AN, scripts } = createSandbox({ gaId: 'G-ABCD1234', consent: null });
  assert.equal(AN.shouldPrompt(), true);
  assert.equal(AN.track('page_view', { page: 'home' }), false);
  assert.equal(scripts.length, 0);
});

test('4. 사용자가 거부(false)를 선택하면 외부 스크립트를 절대 로드하지 않는다', () => {
  const { AN, scripts } = createSandbox({ gaId: 'G-ABCD1234', consent: null });
  AN.setConsent(false);
  assert.equal(AN.shouldPrompt(), false);
  assert.equal(AN.readConsent(), false);
  assert.equal(AN.track('page_view', { page: 'home' }), false);
  assert.equal(scripts.length, 0);
});

test('5. 사용자가 허용(true)을 선택하면 gtag 스크립트를 로드하고 이벤트를 기록한다', () => {
  const { AN, scripts, dataLayer } = createSandbox({ gaId: 'G-ABCD1234', consent: null });
  AN.setConsent(true);
  assert.equal(AN.shouldPrompt(), false);
  assert.equal(AN.readConsent(), true);
  assert.equal(scripts.length, 1);
  assert.ok(scripts[0].src.includes('G-ABCD1234'));

  const ok = AN.track('page_view', { page: 'home' });
  assert.equal(ok, true);
  assert.ok(dataLayer.length > 0);
});

test('6. Capacitor(네이티브 앱) 환경에서는 동의 여부나 gaId와 무관하게 GA를 로드하지 않는다', () => {
  const { AN, scripts } = createSandbox({ gaId: 'G-ABCD1234', consent: true, native: true });
  assert.equal(AN.shouldPrompt(), false);
  assert.equal(AN.track('page_view', { page: 'home' }), false);
  assert.equal(scripts.length, 0);
});

test('7. sanitize는 허용된 키(page, item, feature, method)만 남기고 나머지(note, lat, lng)는 제거한다', () => {
  const { AN } = createSandbox();
  const clean = Object.assign({}, AN.sanitize({
    page: 'temple',
    item: 'bulguksa',
    method: 'gps',
    note: '수첩 비밀 메모',
    lat: '35.801'
  }));
  assert.deepEqual(clean, { page: 'temple', item: 'bulguksa', method: 'gps' });
});

test('8. 파라미터 값이 너무 길거나 한글·공백·특수문자가 포함되면 필터링된다', () => {
  const { AN } = createSandbox();
  const clean = Object.assign({}, AN.sanitize({
    page: 'temple',
    item: '불국사 공백 포함 민감 문구'
  }));
  assert.deepEqual(clean, { page: 'temple' });
});

test('9. 정적 페이지(<meta name="mj-ga-id">, body data-mj-page)에서 동의 시 즉시 해당 페이지 page_view를 전송한다', () => {
  const { AN, scripts, banners, dataLayer } = createSandbox({
    gaId: '',
    metaGaId: 'G-STATIC99',
    consent: null,
    bodyPage: 'temple',
    bodyItem: 'bulguksa'
  });
  assert.equal(banners.length, 1);
  assert.equal(scripts.length, 0);

  AN.setConsent(true);
  assert.equal(scripts.length, 1);
  const events = dataLayer.filter(args => args[0] === 'event');
  assert.ok(events.some(args => args[1] === 'page_view' && args[2].page === 'temple' && args[2].item === 'bulguksa'));
});

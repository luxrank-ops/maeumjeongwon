'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const analytics = require('../../js/analytics');

function mockEnv({ gaId = 'G-TEST1234', consent = null, native = false } = {}) {
  const store = {};
  if (consent) store[analytics.CONSENT_KEY] = consent;
  const scripts = [];
  const win = {
    MJ_CONFIG: { gaId },
    Capacitor: native ? { isNativePlatform: () => true } : undefined,
    location: { protocol: native ? 'capacitor:' : 'https:' },
    localStorage: {
      getItem: k => (k in store ? store[k] : null),
      setItem: (k, v) => { store[k] = String(v); }
    },
    document: {
      getElementById: id => scripts.find(s => s.id === id) || null,
      createElement: tag => ({ tag, id: '', src: '', async: false }),
      head: { appendChild: el => scripts.push(el) }
    }
  };
  return { win, store, scripts };
}

test('1. gaId가 비어 있으면 동의 카드도 뜨지 않고 스크립트도 로드하지 않는다', () => {
  const { win, scripts } = mockEnv({ gaId: '' });
  assert.equal(analytics.shouldPrompt(win), false);
  assert.equal(analytics.track('page_view', { page: 'home' }, win), false);
  assert.equal(scripts.length, 0);
});

test('2. 잘못된 형식의 gaId(예: UA-1234)는 무시된다', () => {
  const { win } = mockEnv({ gaId: 'UA-123456' });
  assert.equal(analytics.configuredGaId(win), '');
  assert.equal(analytics.shouldPrompt(win), false);
});

test('3. 유효한 gaId가 있고 아직 동의 전이면 shouldPrompt가 true이고 track은 전송하지 않는다', () => {
  const { win, scripts } = mockEnv({ gaId: 'G-ABCD1234', consent: null });
  assert.equal(analytics.shouldPrompt(win), true);
  assert.equal(analytics.track('page_view', { page: 'home' }, win), false);
  assert.equal(scripts.length, 0);
});

test('4. 사용자가 거부(deny)를 선택하면 동의 카드가 사라지고 외부 스크립트를 절대 로드하지 않는다', () => {
  const { win, scripts } = mockEnv({ gaId: 'G-ABCD1234', consent: null });
  analytics.setConsent('deny', win);
  assert.equal(analytics.shouldPrompt(win), false);
  assert.equal(analytics.isActive(win), false);
  assert.equal(analytics.track('page_view', { page: 'home' }, win), false);
  assert.equal(scripts.length, 0);
});

test('5. 사용자가 허용(allow)을 선택하면 gtag 스크립트를 1회 로드하고 이벤트를 기록한다', () => {
  const { win, scripts } = mockEnv({ gaId: 'G-ABCD1234', consent: null });
  analytics.setConsent('allow', win);
  assert.equal(analytics.shouldPrompt(win), false);
  assert.equal(analytics.isActive(win), true);
  assert.equal(scripts.length, 1);
  assert.ok(scripts[0].src.includes('G-ABCD1234'));

  const ok = analytics.track('page_view', { page: 'home' }, win);
  assert.equal(ok, true);
  assert.ok(Array.isArray(win.dataLayer));
});

test('6. Capacitor(네이티브 앱) 환경에서는 동의 여부나 gaId와 무관하게 GA를 로드하지 않는다', () => {
  const { win, scripts } = mockEnv({ gaId: 'G-ABCD1234', consent: 'allow', native: true });
  assert.equal(analytics.shouldPrompt(win), false);
  assert.equal(analytics.isActive(win), false);
  assert.equal(analytics.track('page_view', { page: 'home' }, win), false);
  assert.equal(scripts.length, 0);
});

test('7. 등록되지 않은 이벤트 이름(예: custom_secret)은 거부한다', () => {
  const { win } = mockEnv({ gaId: 'G-ABCD1234', consent: 'allow' });
  assert.equal(analytics.track('custom_secret', { page: 'home' }, win), false);
});

test('8. 허용된 이벤트라도 허용 목록 밖의 파라미터(note, lat, lng 등)는 제거한다', () => {
  const clean = analytics.sanitizeParams('checkin', {
    tid: 'haeinsa',
    method: 'gps',
    first: '1',
    note: '수첩 비밀 메모',
    lat: '35.801',
    lng: '128.098'
  });
  assert.deepEqual(clean, { tid: 'haeinsa', method: 'gps', first: '1' });
});

test('9. 파라미터 값이 너무 길거나 한글·공백·특수문자가 포함되면 필터링되어 전송되지 않는다', () => {
  const clean = analytics.sanitizeParams('temple_open', {
    tid: '해인사 공백 포함 민감 문구'
  });
  assert.deepEqual(clean, {});
});

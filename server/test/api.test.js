'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const { createApp, kstDay } = require('../app');
const { publicStory, fullStory, FREE_CHAPTERS, PREVIEW_PARAGRAPHS } = require('../content/project');
const { findStory, listStories } = require('../content/stories');

function startTestServer(opts = {}) {
  let currentNow = opts.initialNow || Date.UTC(2026, 9, 9, 0, 0, 0);
  const app = createApp(Object.assign({
    now: () => currentNow,
    webhookAuth: 'Bearer secret-token',
    devAdReward: true,
    devEntitlement: true
  }, opts));

  return new Promise((resolve) => {
    const server = http.createServer(app);
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      const base = `http://127.0.0.1:${port}`;
      async function req(method, path, { uid, headers = {}, body } = {}) {
        const h = Object.assign({}, headers);
        if (uid) h['X-MJ-UID'] = uid;
        if (body !== undefined) h['Content-Type'] = 'application/json';
        const r = await fetch(base + path, {
          method,
          headers: h,
          body: body !== undefined ? JSON.stringify(body) : undefined
        });
        const json = await r.json().catch(() => null);
        return { status: r.status, body: json };
      }
      resolve({
        server,
        req,
        advanceMs: (ms) => { currentNow += ms; },
        getNow: () => currentNow,
        close: () => new Promise(r => server.close(r))
      });
    });
  });
}

test('1. publicStory는 무료 장(1장)과 다음 장 첫 문단 미리보기만 포함하고 나머지 장 본문은 절대 포함하지 않는다', () => {
  const raw = findStory('haeinsa-1');
  const pub = publicStory(raw);
  assert.equal(pub.chapters.length, FREE_CHAPTERS);
  assert.ok(pub.preview);
  assert.equal(pub.preview.body.length, PREVIEW_PARAGRAPHS);
  const serialized = JSON.stringify(pub);
  assert.ok(!serialized.includes('폭탄을 떨어뜨리지 않은 비행기'));
});

test('2. fullStory는 모든 장 본문을 포함하고 preview는 null이다', () => {
  const raw = findStory('haeinsa-1');
  const full = fullStory(raw);
  assert.equal(full.chapters.length, raw.chapters.length);
  assert.equal(full.preview, null);
  assert.ok(JSON.stringify(full).includes('폭탄을 떨어뜨리지 않은 비행기'));
});

test('3. GET /api/stories 공개 목록에는 잠긴 장 문단이 절대 노출되지 않는다', async () => {
  const ctx = await startTestServer();
  try {
    const r = await ctx.req('GET', '/api/stories');
    assert.equal(r.status, 200);
    assert.ok(Array.isArray(r.body.stories));
    for (const s of r.body.stories) {
      assert.equal(s.chapters.length, 1);
      assert.equal(s.unlocked, false);
    }
    assert.ok(!JSON.stringify(r.body).includes('폭탄을 떨어뜨리지 않은 비행기'));
  } finally {
    await ctx.close();
  }
});

test('4. 비구독 사용자의 GET /api/stories/:id 요청은 잠긴 상태(1장만)를 반환한다', async () => {
  const ctx = await startTestServer();
  try {
    const r = await ctx.req('GET', '/api/stories/haeinsa-1', { uid: 'user_free_1' });
    assert.equal(r.status, 200);
    assert.equal(r.body.unlocked, false);
    assert.equal(r.body.unlockReason, 'none');
    assert.equal(r.body.chapters.length, 1);
    assert.ok(r.body.preview);
  } finally {
    await ctx.close();
  }
});

test('5. 존재하지 않는 스토리 조회 시 404를 반환한다', async () => {
  const ctx = await startTestServer();
  try {
    const r = await ctx.req('GET', '/api/stories/non-existent-story');
    assert.equal(r.status, 404);
    assert.equal(r.body.error, 'not_found');
  } finally {
    await ctx.close();
  }
});

test('6. GET /api/me 기본 상태 조회', async () => {
  const ctx = await startTestServer();
  try {
    const r = await ctx.req('GET', '/api/me', { uid: 'user_me_test' });
    assert.equal(r.status, 200);
    assert.equal(r.body.uid, 'user_me_test');
    assert.equal(r.body.plus.active, false);
    assert.equal(r.body.adToday.used, 0);
    assert.equal(r.body.adToday.limit, 2);
  } finally {
    await ctx.close();
  }
});

test('7. 광고 보상 요청 시 uid가 없으면 400을 반환한다', async () => {
  const ctx = await startTestServer();
  try {
    const r = await ctx.req('POST', '/api/ads/haeinsa-1/reward');
    assert.equal(r.status, 400);
    assert.equal(r.body.error, 'uid_required');
  } finally {
    await ctx.close();
  }
});

test('8. 광고 보상 요청 시 없는 스토리면 404를 반환한다', async () => {
  const ctx = await startTestServer();
  try {
    const r = await ctx.req('POST', '/api/ads/unknown-story/reward', { uid: 'user_ad_1' });
    assert.equal(r.status, 404);
    assert.equal(r.body.error, 'not_found');
  } finally {
    await ctx.close();
  }
});

test('9. 운영 모드(devAdReward=false)에서는 클라이언트 직접 광고 보상 요청을 403(ssv_required)으로 차단한다', async () => {
  const ctx = await startTestServer({ devAdReward: false });
  try {
    const r = await ctx.req('POST', '/api/ads/haeinsa-1/reward', { uid: 'user_prod_1' });
    assert.equal(r.status, 403);
    assert.equal(r.body.error, 'ssv_required');
  } finally {
    await ctx.close();
  }
});

test('10. 개발 모드에서 광고 보상 지급 시 24시간 동안 해당 스토리가 전체 공개된다', async () => {
  const ctx = await startTestServer();
  try {
    const rw = await ctx.req('POST', '/api/ads/haeinsa-1/reward', { uid: 'user_ad_unlock' });
    assert.equal(rw.status, 200);
    assert.equal(rw.body.reason, 'ad');
    assert.ok(rw.body.unlockedUntil > ctx.getNow());

    const st = await ctx.req('GET', '/api/stories/haeinsa-1', { uid: 'user_ad_unlock' });
    assert.equal(st.status, 200);
    assert.equal(st.body.unlocked, true);
    assert.equal(st.body.unlockReason, 'ad');
    assert.ok(st.body.chapters.length > 1);
  } finally {
    await ctx.close();
  }
});

test('11. 광고 보상은 24시간이 지나면 자동으로 다시 잠긴다', async () => {
  const ctx = await startTestServer();
  try {
    await ctx.req('POST', '/api/ads/haeinsa-1/reward', { uid: 'user_ad_exp' });
    ctx.advanceMs(24 * 3600000 + 1000);
    const st = await ctx.req('GET', '/api/stories/haeinsa-1', { uid: 'user_ad_exp' });
    assert.equal(st.body.unlocked, false);
    assert.equal(st.body.chapters.length, 1);
  } finally {
    await ctx.close();
  }
});

test('12. 광고 보상은 하루 최대 2회(AD_DAILY_LIMIT)를 초과하면 429(daily_limit)를 반환한다', async () => {
  const ctx = await startTestServer();
  try {
    const r1 = await ctx.req('POST', '/api/ads/haeinsa-1/reward', { uid: 'user_ad_cap' });
    const r2 = await ctx.req('POST', '/api/ads/bulguksa-1/reward', { uid: 'user_ad_cap' });
    const r3 = await ctx.req('POST', '/api/ads/tongdosa-1/reward', { uid: 'user_ad_cap' });
    assert.equal(r1.status, 200);
    assert.equal(r2.status, 200);
    assert.equal(r3.status, 429);
    assert.equal(r3.body.error, 'daily_limit');
  } finally {
    await ctx.close();
  }
});

test('13. 한국 시간(KST) 기준 자정이 지나면 일일 광고 보상 횟수가 초기화된다', async () => {
  const ctx = await startTestServer();
  try {
    await ctx.req('POST', '/api/ads/haeinsa-1/reward', { uid: 'user_kst' });
    await ctx.req('POST', '/api/ads/bulguksa-1/reward', { uid: 'user_kst' });
    ctx.advanceMs(24 * 3600000);
    const rNextDay = await ctx.req('POST', '/api/ads/tongdosa-1/reward', { uid: 'user_kst' });
    assert.equal(rNextDay.status, 200);
  } finally {
    await ctx.close();
  }
});

test('14. 이미 플러스 이용 중인 사용자가 광고 보상을 호출하면 횟수를 차감하지 않고 reason: plus를 반환한다', async () => {
  const ctx = await startTestServer();
  try {
    await ctx.req('POST', '/api/dev/entitlement', { uid: 'user_plus_ad', body: { action: 'plus' } });
    const rw = await ctx.req('POST', '/api/ads/haeinsa-1/reward', { uid: 'user_plus_ad' });
    assert.equal(rw.status, 200);
    assert.equal(rw.body.reason, 'plus');
    assert.equal(rw.body.unlockedUntil, null);
  } finally {
    await ctx.close();
  }
});

test('15. RevenueCat 웹훅 설정이 없을 때 503(webhook_not_configured)을 반환한다', async () => {
  const ctx = await startTestServer({ webhookAuth: '' });
  try {
    const r = await ctx.req('POST', '/api/webhooks/revenuecat', {
      headers: { Authorization: 'Bearer any' },
      body: { event: { id: 'ev_1', type: 'INITIAL_PURCHASE', app_user_id: 'u1' } }
    });
    assert.equal(r.status, 503);
    assert.equal(r.body.error, 'webhook_not_configured');
  } finally {
    await ctx.close();
  }
});

test('16. RevenueCat 웹훅 인증 헤더가 틀리면 401(unauthorized)을 반환한다', async () => {
  const ctx = await startTestServer();
  try {
    const r = await ctx.req('POST', '/api/webhooks/revenuecat', {
      headers: { Authorization: 'Bearer wrong-token' },
      body: { event: { id: 'ev_1', type: 'INITIAL_PURCHASE', app_user_id: 'u1' } }
    });
    assert.equal(r.status, 401);
    assert.equal(r.body.error, 'unauthorized');
  } finally {
    await ctx.close();
  }
});

test('17. RevenueCat INITIAL_PURCHASE 웹훅 수신 시 만료 시각까지 모든 스토리가 열린다', async () => {
  const ctx = await startTestServer();
  try {
    const exp = ctx.getNow() + 30 * 86400000;
    const w = await ctx.req('POST', '/api/webhooks/revenuecat', {
      headers: { Authorization: 'Bearer secret-token' },
      body: { event: { id: 'ev_init_1', type: 'INITIAL_PURCHASE', app_user_id: 'u_sub', product_id: 'plus_yearly', expiration_at_ms: exp } }
    });
    assert.equal(w.status, 200);
    assert.equal(w.body.ok, true);

    const st = await ctx.req('GET', '/api/stories/haeinsa-1', { uid: 'u_sub' });
    assert.equal(st.body.unlocked, true);
    assert.equal(st.body.unlockReason, 'plus');
    assert.ok(st.body.chapters.length > 1);
  } finally {
    await ctx.close();
  }
});

test('18. RevenueCat 해지(CANCELLATION) 후에도 만료 시각(기간 끝)까지는 플러스가 유지된다', async () => {
  const ctx = await startTestServer();
  try {
    const exp = ctx.getNow() + 10 * 86400000;
    await ctx.req('POST', '/api/webhooks/revenuecat', {
      headers: { Authorization: 'Bearer secret-token' },
      body: { event: { id: 'ev_buy_c', type: 'INITIAL_PURCHASE', app_user_id: 'u_cancel', product_id: 'plus_yearly', expiration_at_ms: exp } }
    });
    await ctx.req('POST', '/api/webhooks/revenuecat', {
      headers: { Authorization: 'Bearer secret-token' },
      body: { event: { id: 'ev_cancel_c', type: 'CANCELLATION', app_user_id: 'u_cancel', product_id: 'plus_yearly', expiration_at_ms: exp } }
    });

    // 기간이 남아 있는 동안은 열려 있어야 함
    const beforeExp = await ctx.req('GET', '/api/stories/haeinsa-1', { uid: 'u_cancel' });
    assert.equal(beforeExp.body.unlocked, true);

    // 만료 시각 경과 후에는 잠김
    ctx.advanceMs(10 * 86400000 + 1000);
    const afterExp = await ctx.req('GET', '/api/stories/haeinsa-1', { uid: 'u_cancel' });
    assert.equal(afterExp.body.unlocked, false);
  } finally {
    await ctx.close();
  }
});

test('19. RevenueCat 만료(EXPIRATION) 웹훅 수신 시 즉시 해제된다', async () => {
  const ctx = await startTestServer();
  try {
    const exp = ctx.getNow() + 10 * 86400000;
    await ctx.req('POST', '/api/webhooks/revenuecat', {
      headers: { Authorization: 'Bearer secret-token' },
      body: { event: { id: 'ev_buy_e', type: 'INITIAL_PURCHASE', app_user_id: 'u_exp_now', product_id: 'plus_yearly', expiration_at_ms: exp } }
    });
    await ctx.req('POST', '/api/webhooks/revenuecat', {
      headers: { Authorization: 'Bearer secret-token' },
      body: { event: { id: 'ev_exp_e', type: 'EXPIRATION', app_user_id: 'u_exp_now', product_id: 'plus_yearly', expiration_at_ms: ctx.getNow() } }
    });

    const st = await ctx.req('GET', '/api/stories/haeinsa-1', { uid: 'u_exp_now' });
    assert.equal(st.body.unlocked, false);
  } finally {
    await ctx.close();
  }
});

test('20. 같은 웹훅 ID를 다시 보내도(중복 전송) 멱등하게 처리되어 상태가 바뀌지 않는다', async () => {
  const ctx = await startTestServer();
  try {
    const exp = ctx.getNow() + 10 * 86400000;
    const first = await ctx.req('POST', '/api/webhooks/revenuecat', {
      headers: { Authorization: 'Bearer secret-token' },
      body: { event: { id: 'ev_dup_1', type: 'INITIAL_PURCHASE', app_user_id: 'u_dup', product_id: 'plus_yearly', expiration_at_ms: exp } }
    });
    assert.equal(first.body.ok, true);
    assert.equal(first.body.duplicate, undefined);

    // 이후 만료 처리
    await ctx.req('POST', '/api/webhooks/revenuecat', {
      headers: { Authorization: 'Bearer secret-token' },
      body: { event: { id: 'ev_dup_2', type: 'EXPIRATION', app_user_id: 'u_dup', product_id: 'plus_yearly', expiration_at_ms: ctx.getNow() } }
    });

    // 처음 구매 웹훅(ev_dup_1)이 재전송되더라도 다시 활성화되지 않아야 함
    const dup = await ctx.req('POST', '/api/webhooks/revenuecat', {
      headers: { Authorization: 'Bearer secret-token' },
      body: { event: { id: 'ev_dup_1', type: 'INITIAL_PURCHASE', app_user_id: 'u_dup', product_id: 'plus_yearly', expiration_at_ms: exp } }
    });
    assert.equal(dup.body.ok, true);
    assert.equal(dup.body.duplicate, true);

    const st = await ctx.req('GET', '/api/stories/haeinsa-1', { uid: 'u_dup' });
    assert.equal(st.body.unlocked, false);
  } finally {
    await ctx.close();
  }
});

test('21. 잘못된 형식의 웹훅 페이로드는 400(bad_event)을 반환한다', async () => {
  const ctx = await startTestServer();
  try {
    const r = await ctx.req('POST', '/api/webhooks/revenuecat', {
      headers: { Authorization: 'Bearer secret-token' },
      body: { event: { type: 'INITIAL_PURCHASE' } } // id 누락
    });
    assert.equal(r.status, 400);
    assert.equal(r.body.error, 'bad_event');
  } finally {
    await ctx.close();
  }
});

test('22. 운영 모드(devEntitlement=false)에서는 /api/dev/entitlement 호출을 403으로 차단한다', async () => {
  const ctx = await startTestServer({ devEntitlement: false });
  try {
    const r = await ctx.req('POST', '/api/dev/entitlement', {
      uid: 'u_dev_block',
      body: { action: 'plus' }
    });
    assert.equal(r.status, 403);
    assert.equal(r.body.error, 'dev_only');
  } finally {
    await ctx.close();
  }
});

'use strict';

const express = require('express');
const path = require('path');
const crypto = require('crypto');
const identity = require('./identity');
const ssv = require('./ssv');
const { listStories, findStory, listSoon } = require('./content/stories');
const { findTemple } = require('./content/temples');
const { publicStory, fullStory, templeExtras } = require('./content/project');
const { createStore } = require('./store');

const AD_DAILY_LIMIT = 2;
const AD_UNLOCK_HOURS = 24;

const STORE_PACK_IDS = new Set([
  'pack-south-coast',
  'pack-gangwon-jeokmyeol',
  'guide-prayer',
  'report-autumn2026',
  'pack-autumn2026',
  'reading-mind',
  'skin-maple'
]);

const PLUS_PRODUCTS = {
  plus_monthly: 'monthly',
  plus_yearly: 'yearly',
  mj_plus_monthly: 'monthly',
  mj_plus_yearly: 'yearly'
};

function kstDay(ms) {
  const d = new Date(ms + 9 * 3600000);
  return d.toISOString().slice(0, 10);
}

function safeEqual(a, b) {
  const ba = Buffer.from(String(a || ''));
  const bb = Buffer.from(String(b || ''));
  if (ba.length !== bb.length || ba.length === 0) return false;
  return crypto.timingSafeEqual(ba, bb);
}

function createApp(opts = {}) {
  const production = opts.production !== undefined ? !!opts.production : process.env.NODE_ENV === 'production';
  const devAdReward = opts.devAdReward !== undefined ? !!opts.devAdReward : (process.env.ALLOW_DEV_AD_REWARD === '1' || process.env.MJ_DEV_AD_REWARD === '1' || !production);
  const devEntitlement = opts.devEntitlement !== undefined ? !!opts.devEntitlement : (process.env.ALLOW_DEV_ENTITLEMENT === '1' || process.env.MJ_DEV_ENTITLEMENT === '1' || !production);

  if (production && (devEntitlement || devAdReward)) {
    throw new Error('운영(NODE_ENV=production)에서는 ALLOW_DEV_ENTITLEMENT / ALLOW_DEV_AD_REWARD를 켤 수 없어요');
  }

  const secret = opts.secret || process.env.SESSION_SECRET || 'dev-session-secret-32-chars-minimum-0000';
  const store = opts.store || createStore();
  const now = opts.now || (() => Date.now());
  const webhookAuth = opts.webhookAuth !== undefined ? opts.webhookAuth : (process.env.REVENUECAT_WEBHOOK_AUTH || '');
  const adUnitIds = opts.adUnitIds || (process.env.ADMOB_AD_UNIT_IDS ? process.env.ADMOB_AD_UNIT_IDS.split(',').map(s => s.trim()).filter(Boolean) : []);
  const adKeys = opts.adKeys || (async () => null);

  const app = express();
  app.use(express.json());

  // 세션 토큰 추출 미들웨어 (Bearer 토큰 검증 또는 테스트/하위호환 X-MJ-UID)
  app.use((req, res, next) => {
    const auth = req.get('Authorization') || '';
    if (auth.startsWith('Bearer ')) {
      const tok = auth.slice(7).trim();
      const uid = identity.verify(secret, tok);
      if (!uid && req.path.startsWith('/api/') && req.path !== '/api/session' && req.path !== '/api/webhooks/revenuecat' && req.path !== '/api/ads/ssv') {
        return res.status(401).json({ error: 'invalid_token' });
      }
      req.uid = uid || '';
    } else {
      const legacy = (req.get('X-MJ-UID') || '').trim();
      req.uid = legacy.length >= 3 && legacy.length <= 128 ? legacy : '';
    }
    next();
  });

  function entitled(uid) {
    if (!uid) return false;
    const p = store.getPlus(uid);
    if (!p || !p.expiresAt) return false;
    return p.expiresAt > now();
  }

  function storyAccess(uid, storyId) {
    if (!uid) return { unlocked: false, reason: 'none' };
    if (entitled(uid)) return { unlocked: true, reason: 'plus' };
    const u = store.user(uid);
    const until = u.adUnlocks[storyId];
    if (until && until > now()) return { unlocked: true, reason: 'ad', unlockedUntil: until };
    return { unlocked: false, reason: 'none' };
  }

  function applyRevenueCatEvent(ev, uid, t) {
    const prod = String(ev.product_id || '').trim();
    const prev = store.getPlus(uid);

    // 단품(콘텐츠 상점) 구매인 경우
    if (ev.type === 'NON_RENEWING_PURCHASE' && STORE_PACK_IDS.has(prod)) {
      store.addPack(uid, prod);
      return 'pack';
    }

    // 플러스 구독 카탈로그 확인 (해지/만료는 기존 구독이 있으면 허용)
    const plan = PLUS_PRODUCTS[prod] || (/month/i.test(prod) ? 'monthly' : (/year/i.test(prod) ? 'yearly' : null));
    if (!plan && !['CANCELLATION', 'EXPIRATION', 'BILLING_ISSUE'].includes(ev.type)) {
      return 'ignored_product';
    }

    const exp = Number(ev.expiration_at_ms) || (t + 30 * 86400000);
    const isTrial = ev.period_type === 'TRIAL';

    switch (ev.type) {
      case 'INITIAL_PURCHASE':
      case 'RENEWAL':
      case 'UNCANCELLATION':
      case 'PRODUCT_CHANGE':
        store.setPlus(uid, {
          plan: plan || prev.plan || 'yearly',
          expiresAt: exp,
          willRenew: true,
          trial: isTrial,
          updatedAt: t
        }, t);
        return 'plus';
      case 'CANCELLATION':   // 해지는 기간 끝까지 이용 가능. 즉시 끊지 않는다.
        store.setPlus(uid, Object.assign({}, prev, { willRenew: false, updatedAt: t }), t);
        return 'plus';
      case 'EXPIRATION':
      case 'BILLING_ISSUE':
        store.setPlus(uid, Object.assign({}, prev, { expiresAt: t, willRenew: false, trial: false, updatedAt: t }), t);
        return 'plus';
      default:
        return 'ignored_type';
    }
  }

  // 세션 발급
  app.post('/api/session', (req, res) => {
    const { uid, token } = identity.issue(secret);
    store.createUser(uid, now());
    res.json({ uid, token });
  });

  // 현재 사용자 상태 조회
  app.get('/api/me', (req, res) => {
    const uid = req.uid;
    const t = now(), day = kstDay(t);
    const u = uid ? store.user(uid) : null;
    const active = uid ? entitled(uid) : false;
    const adUnlocks = {};
    if (u) {
      for (const [sid, until] of Object.entries(u.adUnlocks)) {
        if (until > t) adUnlocks[sid] = until;
      }
    }
    const p = u ? u.plus : null;
    res.json({
      uid: uid || null,
      mode: { devAdReward, devEntitlement },
      plus: {
        active,
        status: active ? (p.trial ? 'trial' : (p.willRenew === false ? 'cancelled' : 'active')) : (p && p.expiresAt && p.expiresAt <= t ? 'expired' : 'none'),
        plan: p ? p.plan : null,
        expiresAt: p ? p.expiresAt : 0,
        willRenew: p ? !!p.willRenew : false,
        trial: p ? !!p.trial : false
      },
      packs: u ? store.getPacks(uid) : [],
      adToday: {
        used: u ? store.getAdLog(uid, day) : 0,
        limit: AD_DAILY_LIMIT
      },
      adUnlocks
    });
  });

  // 사찰 추가 본문 (무료는 제목만, 플러스만 전문)
  app.get('/api/temples/:id/extras', (req, res) => {
    const t = findTemple(req.params.id);
    if (!t) return res.status(404).json({ error: 'not_found' });
    const unlocked = entitled(req.uid);
    res.json(Object.assign({ unlocked }, templeExtras(t, unlocked)));
  });

  // 공개 스토리 목록
  app.get('/api/stories', (req, res) => {
    const uid = req.uid;
    const items = listStories().map(st => {
      const access = storyAccess(uid, st.id);
      return Object.assign(publicStory(st), { unlocked: access.unlocked, unlockReason: access.reason });
    });
    res.json({ stories: items, soon: listSoon() });
  });

  // 개별 스토리 조회: 서버가 잠금을 판정
  app.get('/api/stories/:id', (req, res) => {
    const st = findStory(req.params.id);
    if (!st) return res.status(404).json({ error: 'not_found' });
    const access = storyAccess(req.uid, st.id);
    const body = access.unlocked ? fullStory(st) : publicStory(st);
    res.json(Object.assign(body, { unlocked: access.unlocked, unlockReason: access.reason, unlockedUntil: access.unlockedUntil || null }));
  });

  // AdMob 보상 콜백 (SSV) — 서명 검증 후에만 지급
  app.get('/api/ads/ssv', async (req, res) => {
    if (!adUnitIds.length) return res.status(503).end();
    const parsed = ssv.parseCallback((req.originalUrl.split('?')[1]) || '');
    if (!parsed) return res.status(400).end();
    let pem = null;
    try { pem = await adKeys(parsed.keyId); } catch (e) { return res.status(503).end(); }
    if (!pem || !ssv.verifySignature(parsed.content, parsed.signature, pem)) return res.status(403).end();
    if (!adUnitIds.includes(parsed.params.get('ad_unit') || '')) return res.status(403).end();

    const txId = parsed.params.get('transaction_id') || '';
    const [uid, storyId] = (parsed.params.get('custom_data') || '').split('|');
    if (!txId || !identity.UID_RE.test(uid || '') || !findStory(storyId || '')) return res.status(400).end();

    const t = now(), day = kstDay(t);
    const result = store.tx(() => {
      if (!store.recordSsvTransaction(txId, uid, storyId, t)) return 'duplicate';
      if (entitled(uid)) return 'plus';
      if (store.getAdLog(uid, day) >= AD_DAILY_LIMIT) return 'limit';
      store.incAdLog(uid, day);
      store.setAdUnlock(uid, storyId, t + AD_UNLOCK_HOURS * 3600000);
      return 'granted';
    });
    res.json({ ok: true, result });
  });

  // 개발용 직접 광고 보상 엔드포인트
  app.post('/api/ads/:id/reward', (req, res) => {
    const uid = req.uid;
    if (!uid) return res.status(400).json({ error: 'uid_required' });
    const st = findStory(req.params.id);
    if (!st) return res.status(404).json({ error: 'not_found' });
    if (!devAdReward) return res.status(403).json({ error: 'ssv_required', message: '광고 보상은 광고 네트워크 검증 후에만 지급돼요.' });
    if (entitled(uid)) return res.json({ unlockedUntil: null, reason: 'plus' });
    const t = now(), day = kstDay(t);
    if (store.getAdLog(uid, day) >= AD_DAILY_LIMIT) return res.status(429).json({ error: 'daily_limit', limit: AD_DAILY_LIMIT });
    const until = t + AD_UNLOCK_HOURS * 3600000;
    store.incAdLog(uid, day);
    store.setAdUnlock(uid, st.id, until);
    res.json({ unlockedUntil: until, reason: 'ad' });
  });

  // 개발·데모 전용 권한 변경 (플러스 및 단품)
  app.post('/api/dev/entitlement', (req, res) => {
    if (!devEntitlement) return res.status(403).json({ error: 'dev_only' });
    const uid = req.uid;
    if (!uid) return res.status(400).json({ error: 'uid_required' });
    const action = req.body && req.body.action;
    const plan = (req.body && req.body.plan) || 'yearly';
    const t = now();
    if (action === 'trial') {
      store.setPlus(uid, { plan, expiresAt: t + 7 * 86400000, willRenew: false, trial: true }, t);
    } else if (action === 'plus' || action === 'on') {
      store.setPlus(uid, { plan, expiresAt: t + 365 * 86400000, willRenew: true, trial: false }, t);
    } else if (action === 'off' || action === 'expire') {
      store.setPlus(uid, { plan: null, expiresAt: 0, willRenew: false, trial: false }, t);
    } else if (action === 'pack' && req.body.packId && STORE_PACK_IDS.has(req.body.packId)) {
      store.addPack(uid, req.body.packId);
    } else {
      return res.status(400).json({ error: 'invalid_action' });
    }
    res.json({ ok: true, plus: store.getPlus(uid), packs: store.getPacks(uid) });
  });

  // RevenueCat 웹훅 — 권한의 유일한 출처 (카탈로그에 없는 상품은 무시)
  app.post('/api/webhooks/revenuecat', (req, res) => {
    if (!webhookAuth) return res.status(503).json({ error: 'webhook_not_configured' });
    if (!safeEqual(req.get('Authorization') || '', webhookAuth)) return res.status(401).json({ error: 'unauthorized' });
    const ev = (req.body && req.body.event) || null;
    if (!ev || !ev.id || !ev.type) return res.status(400).json({ error: 'bad_event' });

    const out = store.tx(() => {
      if (store.hasProcessed(ev.id)) return { duplicate: true };       // 중복 이벤트 무시
      const uid = ev.app_user_id;
      const applied = uid ? applyRevenueCatEvent(ev, uid, now()) : 'no_user';
      store.markProcessed(ev.id, now());
      return { duplicate: false, applied };
    });
    res.json(out.duplicate ? { ok: true, duplicate: true } : { ok: true, applied: out.applied });
  });

  const staticRoot = path.join(__dirname, '..');
  app.use(express.static(staticRoot));

  app.get('*', (req, res) => {
    if (req.path.startsWith('/api/')) return res.status(404).json({ error: 'not_found' });
    res.sendFile(path.join(staticRoot, 'index.html'));
  });

  return app;
}

module.exports = { createApp, kstDay };

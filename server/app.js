'use strict';

const express = require('express');
const path = require('path');
const crypto = require('crypto');
const { listStories, findStory, listSoon } = require('./content/stories');
const { publicStory, fullStory } = require('./content/project');
const { createStore } = require('./store');

const AD_DAILY_LIMIT = 2;
const AD_UNLOCK_HOURS = 24;

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

function uidOf(req) {
  const raw = req.get('X-MJ-UID') || req.query.uid || (req.body && req.body.uid) || '';
  const uid = String(raw).trim();
  return uid.length >= 3 && uid.length <= 128 ? uid : '';
}

function createApp(opts = {}) {
  const app = express();
  const store = opts.store || createStore();
  const now = opts.now || (() => Date.now());
  const webhookAuth = opts.webhookAuth !== undefined ? opts.webhookAuth : (process.env.REVENUECAT_WEBHOOK_AUTH || '');
  const devAdReward = opts.devAdReward !== undefined ? !!opts.devAdReward : (process.env.MJ_DEV_AD_REWARD === '1' || process.env.NODE_ENV !== 'production');
  const devEntitlement = opts.devEntitlement !== undefined ? !!opts.devEntitlement : (process.env.MJ_DEV_ENTITLEMENT === '1' || process.env.NODE_ENV !== 'production');

  app.use(express.json());

  function entitled(uid) {
    if (!uid) return false;
    const u = store.user(uid);
    const p = u.plus;
    if (!p || p.status === 'none' || p.status === 'expired') return false;
    if (p.expiresAt && p.expiresAt <= now()) return false;
    return true;
  }

  function storyAccess(uid, storyId) {
    if (!uid) return { unlocked: false, reason: 'none' };
    if (entitled(uid)) return { unlocked: true, reason: 'plus' };
    const u = store.user(uid);
    const until = u.adUnlocks[storyId];
    if (until && until > now()) return { unlocked: true, reason: 'ad', unlockedUntil: until };
    return { unlocked: false, reason: 'none' };
  }

  // 현재 사용자 상태 및 모드 조회
  app.get('/api/me', (req, res) => {
    const uid = uidOf(req);
    const t = now(), day = kstDay(t);
    const u = uid ? store.user(uid) : null;
    const active = uid ? entitled(uid) : false;
    const adUnlocks = {};
    if (u) {
      for (const [sid, until] of Object.entries(u.adUnlocks)) {
        if (until > t) adUnlocks[sid] = until;
      }
    }
    res.json({
      uid: uid || null,
      mode: { devAdReward, devEntitlement },
      plus: {
        active,
        status: u && active ? u.plus.status : (u && u.plus.expiresAt && u.plus.expiresAt <= t ? 'expired' : 'none'),
        plan: u ? u.plus.plan : null,
        expiresAt: u ? u.plus.expiresAt : 0
      },
      adToday: {
        used: u ? (u.adLog[day] || 0) : 0,
        limit: AD_DAILY_LIMIT
      },
      adUnlocks
    });
  });

  // 공개 스토리 목록 (항상 공개 데이터만 내려보냄)
  app.get('/api/stories', (req, res) => {
    const uid = uidOf(req);
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
    const access = storyAccess(uidOf(req), st.id);
    const body = access.unlocked ? fullStory(st) : publicStory(st);
    res.json(Object.assign(body, { unlocked: access.unlocked, unlockReason: access.reason, unlockedUntil: access.unlockedUntil || null }));
  });

  // 광고 보상 지급 (개발 플래그가 켜진 경우에만 허용, 운영에서는 SSV 웹훅 필요)
  app.post('/api/ads/:id/reward', (req, res) => {
    const uid = uidOf(req);
    if (!uid) return res.status(400).json({ error: 'uid_required' });
    const st = findStory(req.params.id);
    if (!st) return res.status(404).json({ error: 'not_found' });
    if (!devAdReward) return res.status(403).json({ error: 'ssv_required', message: '광고 보상은 광고 네트워크 검증 후에만 지급돼요.' });
    if (entitled(uid)) return res.json({ unlockedUntil: null, reason: 'plus' });
    const t = now(), day = kstDay(t);
    const u = store.user(uid);
    if ((u.adLog[day] || 0) >= AD_DAILY_LIMIT) return res.status(429).json({ error: 'daily_limit', limit: AD_DAILY_LIMIT });
    const until = t + AD_UNLOCK_HOURS * 3600000;
    store.incAdLog(uid, day);
    store.setAdUnlock(uid, st.id, until);
    res.json({ unlockedUntil: until, reason: 'ad' });
  });

  // 개발·데모 전용 플러스 상태 변경
  app.post('/api/dev/entitlement', (req, res) => {
    if (!devEntitlement) return res.status(403).json({ error: 'dev_only' });
    const uid = uidOf(req);
    if (!uid) return res.status(400).json({ error: 'uid_required' });
    const action = req.body && req.body.action;
    const plan = (req.body && req.body.plan) || 'yearly';
    const t = now();
    if (action === 'trial') {
      store.setPlus(uid, { status: 'trial', plan, expiresAt: t + 7 * 86400000 });
    } else if (action === 'plus' || action === 'on') {
      store.setPlus(uid, { status: 'active', plan, expiresAt: t + 365 * 86400000 });
    } else if (action === 'off' || action === 'expire') {
      store.setPlus(uid, { status: 'none', plan: null, expiresAt: 0 });
    } else {
      return res.status(400).json({ error: 'invalid_action' });
    }
    res.json({ ok: true, plus: store.user(uid).plus });
  });

  // RevenueCat 웹훅: 구독 상태의 출처
  app.post('/api/webhooks/revenuecat', (req, res) => {
    if (!webhookAuth) return res.status(503).json({ error: 'webhook_not_configured' });
    if (!safeEqual(req.get('Authorization') || '', webhookAuth)) return res.status(401).json({ error: 'unauthorized' });
    const ev = (req.body && req.body.event) || null;
    if (!ev || !ev.id || !ev.type) return res.status(400).json({ error: 'bad_event' });
    if (store.hasProcessed(ev.id)) return res.json({ ok: true, duplicate: true });   // 멱등
    const uid = String(ev.app_user_id || '').trim();
    if (!uid) return res.status(400).json({ error: 'missing_app_user_id' });

    const exp = Number(ev.expiration_at_ms) || (now() + 30 * 86400000);
    const plan = /month/i.test(ev.product_id || '') ? 'monthly' : 'yearly';
    const isTrial = ev.period_type === 'TRIAL';

    if (['INITIAL_PURCHASE', 'RENEWAL', 'UNCANCELLATION', 'NON_RENEWING_PURCHASE', 'PRODUCT_CHANGE'].includes(ev.type)) {
      store.setPlus(uid, {
        status: isTrial ? 'trial' : 'active',
        plan,
        expiresAt: exp
      });
    } else if (ev.type === 'CANCELLATION') {
      // 해지(CANCELLATION): 상태만 바꾸고 기간 끝까지 유지
      const cur = store.user(uid).plus;
      store.setPlus(uid, {
        status: 'cancelled',
        plan: cur.plan || plan,
        expiresAt: Number(ev.expiration_at_ms) || cur.expiresAt || exp
      });
    } else if (['EXPIRATION', 'BILLING_ISSUE'].includes(ev.type)) {
      // 만료(EXPIRATION): 즉시 해제
      store.setPlus(uid, {
        status: 'expired',
        expiresAt: Math.min(now(), Number(ev.expiration_at_ms) || now())
      });
    }

    store.markProcessed(ev.id);
    res.json({ ok: true });
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

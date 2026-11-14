'use strict';

// /api/* — Express 판(server/app.js)과 같은 경로·같은 응답을 Worker 에서 그대로 낸다.
//
// Express 는 Worker 에서 돌지 않으므로 라우팅만 여기서 손으로 한다. 회원·게시판 규칙은
// server/auth.js · server/board.js 를 그대로 쓰고(D1 어댑터를 통해), 콘텐츠는 빌드 시 뽑은 JSON 을 쓴다.

import identity from '../server/identity.js';
import { createAccounts } from '../server/auth.js';
import { createBoard, CATEGORIES } from '../server/board.js';
import { publicStory, fullStory, templeExtras } from '../server/content/project.js';
import { findTemple, listStories, findStory, listSoon, listTraditional, findTraditionalByNo } from './content.js';
import { generateCounsel, getAiConfig } from './ai.js';
import { createD1Adapter, ensureSchema } from './db.js';
import { Store } from './store.js';
import { parseCallback, verifySignature, fetchAdMobKey } from './ssv.js';

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

// 토큰 없이도 열려 있어야 하는 경로 (잘못된 옛 토큰이 있어도 로그인·가입은 되어야 한다)
const TOKEN_OPEN_PATHS = new Set(['/api/session', '/api/webhooks/revenuecat', '/api/ads/ssv', '/api/auth/login', '/api/auth/signup']);

function kstDay(ms) {
  const d = new Date(ms + 9 * 3600000);
  return d.toISOString().slice(0, 10);
}

function str(v) {
  return typeof v === 'string' ? v : '';
}

// 게시글·댓글 id 는 양의 정수만 받는다 (그 밖은 존재하지 않는 글로 취급)
function parseId(v) {
  return /^\d{1,12}$/.test(String(v)) ? Number(v) : 0;
}

function safeEqual(a, b) {
  const A = new TextEncoder().encode(String(a || ''));
  const B = new TextEncoder().encode(String(b || ''));
  if (A.length !== B.length || A.length === 0) return false;
  let diff = 0;
  for (let i = 0; i < A.length; i++) diff |= A[i] ^ B[i];
  return diff === 0;
}

function json(body, status = 200, headers = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: Object.assign({ 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }, headers)
  });
}

async function readJson(request) {
  try {
    const text = await request.text();
    if (!text) return {};
    return JSON.parse(text);
  } catch (e) {
    return {};
  }
}

// 안내: 한 아이솔레이트 안에서는 accounts·board 를 재사용한다.
// (createAccounts 는 첫 인증 요청에서 관리자 계정을 한 번 시딩하는데, 요청마다 새로 만들면 매번 scrypt 를 다시 돌린다)
let core = null;
function getCore(env) {
  if (!core) {
    const getDb = () => createD1Adapter(env);
    const now = () => Date.now();
    const accounts = createAccounts({
      getDb,
      now,
      adminEmails: env.ADMIN_EMAILS,
      adminPassword: env.ADMIN_PASSWORD
    });
    core = { getDb, now, accounts, board: createBoard({ getDb, now, isAdmin: uid => accounts.isAdmin(uid) }) };
  }
  return core;
}

export async function handleApi(request, env, ctx, url) {
  await ensureSchema(env);

  const path = url.pathname;
  const method = request.method.toUpperCase();
  const { getDb, now, accounts, board } = getCore(env);
  const store = new Store(env, ctx, now);
  const secret = env.SESSION_SECRET || '';
  const production = env.NODE_ENV === 'production';
  const devAdReward = env.ALLOW_DEV_AD_REWARD === '1' || env.MJ_DEV_AD_REWARD === '1' || !production;
  const devEntitlement = env.ALLOW_DEV_ENTITLEMENT === '1' || env.MJ_DEV_ENTITLEMENT === '1' || !production;

  // ── 세션 토큰 해석 (server/app.js 의 미들웨어와 같은 규칙) ──
  const auth = request.headers.get('Authorization') || '';
  let memberUid = '';
  let uid = '';
  if (auth.startsWith('Bearer ')) {
    const tok = auth.slice(7).trim();
    uid = identity.verify(secret, tok) || '';
    if (!uid && tok.startsWith('mm1.')) {
      memberUid = await accounts.uidForToken(tok);
      uid = memberUid;
    }
    if (!uid && path.startsWith('/api/') && !TOKEN_OPEN_PATHS.has(path) && !path.startsWith('/api/ai/')) {
      return json({ error: 'invalid_token' }, 401);
    }
  } else {
    const legacy = (request.headers.get('X-MJ-UID') || '').trim();
    uid = legacy.length >= 3 && legacy.length <= 128 ? legacy : '';
  }

  await store.hydrate(uid);

  const entitled = (id) => {
    if (!id) return false;
    const p = store.getPlus(id);
    if (!p || !p.expiresAt) return false;
    return p.expiresAt > now();
  };

  const storyAccess = (id, storyId) => {
    if (!id) return { unlocked: false, reason: 'none' };
    if (entitled(id)) return { unlocked: true, reason: 'plus' };
    const u = store.user(id);
    const until = u.adUnlocks[storyId];
    if (until && until > now()) return { unlocked: true, reason: 'ad', unlockedUntil: until };
    return { unlocked: false, reason: 'none' };
  };

  const send = (res) => json(res.body, res.status);

  // ── 세션 발급 ──
  if (path === '/api/session' && method === 'POST') {
    const issued = identity.issue(secret);
    store.createUser(issued.uid, now());
    return json({ uid: issued.uid, token: issued.token });
  }

  // ── 회원 가입·로그인·로그아웃 ──
  if (path === '/api/auth/signup' && method === 'POST') {
    const r = await accounts.signup(await readJson(request));
    return json(r.body, r.status);
  }

  if (path === '/api/auth/login' && method === 'POST') {
    const r = await accounts.login(await readJson(request));
    const headers = r.retryAfter ? { 'Retry-After': String(r.retryAfter) } : {};
    return json(r.body, r.status, headers);
  }

  if (path === '/api/auth/logout' && method === 'POST') {
    await accounts.logout(memberUid ? auth.slice(7).trim() : '');
    return json({ ok: true });
  }

  // ── 현재 사용자 상태 ──
  if (path === '/api/me' && method === 'GET') {
    const t = now();
    const day = kstDay(t);
    const u = uid ? store.user(uid) : null;
    const active = uid ? entitled(uid) : false;
    const adUnlocks = {};
    if (u) {
      for (const [sid, until] of Object.entries(u.adUnlocks)) {
        if (until > t) adUnlocks[sid] = until;
      }
    }
    const p = u ? u.plus : null;
    const profile = memberUid ? await accounts.profile(memberUid) : null;
    return json({
      uid: uid || null,
      member: profile ? Object.assign(profile, await board.counts(profile.uid)) : null,
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
      adUnlocks,
      ai: getAiConfig(env)
    });
  }

  // ── 회원 게시판 ──
  const needMember = () => (memberUid ? null : json({ error: 'login_required', message: '로그인하면 글을 쓸 수 있어요.' }, 401));

  if (path === '/api/board/posts' && method === 'GET') {
    const q = url.searchParams;
    const r = await board.list({
      category: str(q.get('category')),
      q: str(q.get('q')),
      page: str(q.get('page')),
      mine: str(q.get('mine')) === '1',
      viewer: memberUid
    });
    if (r.status === 200) r.body.categories = CATEGORIES;
    return send(r);
  }

  if (path === '/api/board/posts' && method === 'POST') {
    const denied = needMember();
    if (denied) return denied;
    return send(await board.create(memberUid, await readJson(request)));
  }

  const boardId = /^\/api\/board\/posts\/([^/]+)$/.exec(path);
  if (boardId) {
    const id = parseId(decodeURIComponent(boardId[1]));
    if (!id) return json({ error: 'not_found' }, 404);
    if (method === 'GET') return send(await board.get(id, memberUid));
    const denied = needMember();
    if (denied) return denied;
    if (method === 'PATCH') return send(await board.update(id, memberUid, await readJson(request)));
    if (method === 'DELETE') return send(await board.remove(id, memberUid));
  }

  const boardComments = /^\/api\/board\/posts\/([^/]+)\/comments$/.exec(path);
  if (boardComments) {
    const id = parseId(decodeURIComponent(boardComments[1]));
    if (!id) return json({ error: 'not_found' }, 404);
    if (method === 'GET') return send(await board.listComments(id, memberUid));
    if (method === 'POST') {
      const denied = needMember();
      if (denied) return denied;
      return send(await board.addComment(id, memberUid, await readJson(request)));
    }
  }

  const commentId = /^\/api\/board\/comments\/([^/]+)$/.exec(path);
  if (commentId && method === 'DELETE') {
    const denied = needMember();
    if (denied) return denied;
    const id = parseId(decodeURIComponent(commentId[1]));
    if (!id) return json({ error: 'not_found' }, 404);
    return send(await board.removeComment(id, memberUid));
  }

  // ── AI 상담 ──
  if (path === '/api/ai/config' && method === 'GET') return json(getAiConfig(env));

  if (path === '/api/ai/counsel' && method === 'POST') {
    try {
      const body = await readJson(request);
      const result = await generateCounsel(env, { prompt: body.prompt, mood: body.mood, templeId: body.templeId });
      return json(result);
    } catch (err) {
      return json({ ok: false, error: 'ai_error', message: err.message || 'AI 응답 생성 중 오류가 발생했습니다.' }, 500);
    }
  }

  // ── 사찰 추가 본문 ──
  const extras = /^\/api\/temples\/([^/]+)\/extras$/.exec(path);
  if (extras && method === 'GET') {
    const t = findTemple(decodeURIComponent(extras[1]));
    if (!t) return json({ error: 'not_found' }, 404);
    const unlocked = entitled(uid);
    return json(Object.assign({ unlocked }, templeExtras(t, unlocked)));
  }

  // ── 전통사찰 현황 991곳 ──
  if (path === '/api/traditional-temples' && method === 'GET') {
    const q = url.searchParams;
    const items = listTraditional({
      sido: str(q.get('sido')),
      sgg: str(q.get('sgg')),
      order: str(q.get('order')),
      q: str(q.get('q'))
    });
    return json({ total: items.length, items });
  }

  const traditionalNo = /^\/api\/traditional-temples\/([^/]+)$/.exec(path);
  if (traditionalNo && method === 'GET') {
    const item = findTraditionalByNo(decodeURIComponent(traditionalNo[1]));
    if (!item) return json({ error: 'not_found' }, 404);
    return json(item);
  }

  // ── 스토리 ──
  if (path === '/api/stories' && method === 'GET') {
    const items = listStories().map(st => {
      const access = storyAccess(uid, st.id);
      return Object.assign(publicStory(st), { unlocked: access.unlocked, unlockReason: access.reason });
    });
    return json({ stories: items, soon: listSoon() });
  }

  const storyOne = /^\/api\/stories\/([^/]+)$/.exec(path);
  if (storyOne && method === 'GET') {
    const st = findStory(decodeURIComponent(storyOne[1]));
    if (!st) return json({ error: 'not_found' }, 404);
    const access = storyAccess(uid, st.id);
    const body = access.unlocked ? fullStory(st) : publicStory(st);
    return json(Object.assign(body, { unlocked: access.unlocked, unlockReason: access.reason, unlockedUntil: access.unlockedUntil || null }));
  }

  // ── AdMob 보상 콜백 (SSV) ──
  if (path === '/api/ads/ssv' && method === 'GET') {
    const adUnitIds = (env.ADMOB_AD_UNIT_IDS || '').split(',').map(s => s.trim()).filter(Boolean);
    if (!adUnitIds.length) return new Response(null, { status: 503 });
    const parsed = parseCallback(url.search.slice(1));
    if (!parsed) return new Response(null, { status: 400 });
    let pem = null;
    try {
      pem = await fetchAdMobKey(parsed.keyId);
    } catch (e) {
      return new Response(null, { status: 503 });
    }
    const ok = pem ? await verifySignature(parsed.content, parsed.signature, pem) : false;
    if (!ok) return new Response(null, { status: 403 });
    if (!adUnitIds.includes(parsed.params.get('ad_unit') || '')) return new Response(null, { status: 403 });

    const txId = parsed.params.get('transaction_id') || '';
    const [rewardUid, storyId] = (parsed.params.get('custom_data') || '').split('|');
    if (!txId || !identity.UID_RE.test(rewardUid || '') || !findStory(storyId || '')) return new Response(null, { status: 400 });

    const t = now();
    const day = kstDay(t);
    if (!(await store.recordSsvTransaction(txId, rewardUid, storyId, t))) return json({ ok: true, result: 'duplicate' });
    await store.hydrate(rewardUid);
    if (entitled(rewardUid)) return json({ ok: true, result: 'plus' });
    if (store.getAdLog(rewardUid, day) >= AD_DAILY_LIMIT) return json({ ok: true, result: 'limit' });
    store.incAdLog(rewardUid, day);
    store.setAdUnlock(rewardUid, storyId, t + AD_UNLOCK_HOURS * 3600000);
    return json({ ok: true, result: 'granted' });
  }

  // ── 개발용 직접 광고 보상 (ALLOW_DEV_AD_REWARD=1 일 때만) ──
  const reward = /^\/api\/ads\/([^/]+)\/reward$/.exec(path);
  if (reward && method === 'POST') {
    if (!uid) return json({ error: 'uid_required' }, 400);
    const st = findStory(decodeURIComponent(reward[1]));
    if (!st) return json({ error: 'not_found' }, 404);
    if (env.ALLOW_DEV_AD_REWARD !== '1' && env.MJ_DEV_AD_REWARD !== '1' && production) {
      return json({ error: 'ssv_required', message: '광고 보상은 광고 네트워크 검증 후에만 지급돼요.' }, 403);
    }
    if (entitled(uid)) return json({ unlockedUntil: null, reason: 'plus' });
    const t = now();
    const day = kstDay(t);
    if (store.getAdLog(uid, day) >= AD_DAILY_LIMIT) return json({ error: 'daily_limit', limit: AD_DAILY_LIMIT }, 429);
    const until = t + AD_UNLOCK_HOURS * 3600000;
    store.incAdLog(uid, day);
    store.setAdUnlock(uid, st.id, until);
    return json({ unlockedUntil: until, reason: 'ad' });
  }

  // ── 개발·데모 전용 권한 변경 ──
  if (path === '/api/dev/entitlement' && method === 'POST') {
    if (env.ALLOW_DEV_ENTITLEMENT !== '1' && env.MJ_DEV_ENTITLEMENT !== '1' && production) return json({ error: 'dev_only' }, 403);
    if (!uid) return json({ error: 'uid_required' }, 400);
    const body = await readJson(request);
    const action = body.action;
    const plan = body.plan || 'yearly';
    const t = now();
    if (action === 'trial') {
      store.setPlus(uid, { plan, expiresAt: t + 7 * 86400000, willRenew: false, trial: true }, t);
    } else if (action === 'plus' || action === 'on') {
      store.setPlus(uid, { plan, expiresAt: t + 365 * 86400000, willRenew: true, trial: false }, t);
    } else if (action === 'off' || action === 'expire') {
      store.setPlus(uid, { plan: null, expiresAt: 0, willRenew: false, trial: false }, t);
    } else if (action === 'pack' && body.packId && STORE_PACK_IDS.has(body.packId)) {
      store.addPack(uid, body.packId);
    } else {
      return json({ error: 'invalid_action' }, 400);
    }
    return json({ ok: true, plus: store.getPlus(uid), packs: store.getPacks(uid) });
  }

  // ── RevenueCat 웹훅 ──
  if (path === '/api/webhooks/revenuecat' && method === 'POST') {
    const webhookAuth = env.REVENUECAT_WEBHOOK_AUTH || '';
    if (!webhookAuth) return json({ error: 'webhook_not_configured' }, 503);
    if (!safeEqual(request.headers.get('Authorization') || '', webhookAuth)) return json({ error: 'unauthorized' }, 401);
    const body = await readJson(request);
    const ev = body.event || null;
    if (!ev || !ev.id || !ev.type) return json({ error: 'bad_event' }, 400);

    if (await store.hasProcessed(ev.id)) return json({ ok: true, duplicate: true });
    const targetUid = ev.app_user_id;
    let applied = 'no_user';
    if (targetUid) {
      await store.hydrate(targetUid);
      applied = applyRevenueCatEvent(store, ev, targetUid, now());
    }
    await store.markProcessed(ev.id, now());
    return json({ ok: true, applied });
  }

  return json({ error: 'not_found' }, 404);
}

function applyRevenueCatEvent(store, ev, uid, t) {
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
    case 'CANCELLATION':
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

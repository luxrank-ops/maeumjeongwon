'use strict';

// 플러스 구독·단품·광고 보상 상태 — D1 에 JSON 한 줄로 보관한다.
//
// server/store.js 는 프로세스 메모리(Map)에만 두었다. Vercel 에서는 /tmp 가 휘발성이라
// 재배포·콜드스타트마다 사라졌지만, Worker 는 요청마다 다른 아이솔레이트로 갈 수 있어
// 메모리만으로는 '플러스인데 어떤 요청은 잠김' 이 된다. 그래서 D1 에 쓰고, 요청 시작에 읽어 둔다.
//   · 읽기(getPlus·getPacks·getAdLog)는 화면 코드와 같게 '동기' — hydrate(uid) 를 먼저 await 한다.
//   · 쓰기는 메모리에 반영한 뒤 D1 에 비동기로 흘려보낸다 (ctx.waitUntil).

const blank = (uid, t) => ({
  uid,
  createdAt: t,
  plus: { plan: null, expiresAt: 0, willRenew: false, trial: false, updatedAt: t },
  packs: [],
  adLog: {},
  adUnlocks: {}
});

export class Store {
  constructor(env, ctx, now = () => Date.now()) {
    this.env = env;
    this.ctx = ctx;
    this.now = now;
    this.users = new Map();
    this.inflight = new Map();
  }

  // 회원 상태를 D1 에서 읽어 메모리에 올린다. 요청당 한 번(같은 uid 는 첫 1회).
  async hydrate(uid) {
    if (!uid) return;
    if (this.users.has(uid)) return;
    if (this.inflight.has(uid)) return this.inflight.get(uid);
    const p = (async () => {
      try {
        const row = await this.env.DB.prepare('SELECT data FROM mj_state WHERE uid = ?').bind(uid).first();
        this.users.set(uid, row && row.data ? Object.assign(blank(uid, this.now()), JSON.parse(row.data)) : blank(uid, this.now()));
      } catch (e) {
        this.users.set(uid, blank(uid, this.now()));
      }
    })();
    this.inflight.set(uid, p);
    try { await p; } finally { this.inflight.delete(uid); }
  }

  flush(uid) {
    const u = this.users.get(uid);
    if (!u) return;
    const write = this.env.DB
      .prepare('INSERT INTO mj_state (uid, data, updated_at) VALUES (?, ?, ?) ON CONFLICT(uid) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at')
      .bind(uid, JSON.stringify(u), this.now())
      .run()
      .catch(() => {});
    if (this.ctx && typeof this.ctx.waitUntil === 'function') this.ctx.waitUntil(write);
    return write;
  }

  createUser(uid, nowMs = this.now()) {
    if (!this.users.has(uid)) this.users.set(uid, blank(uid, nowMs));
    return this.users.get(uid);
  }

  user(uid) {
    return this.createUser(uid);
  }

  getPlus(uid) {
    return this.user(uid).plus;
  }

  setPlus(uid, plusData, nowMs = this.now()) {
    const u = this.user(uid);
    u.plus = Object.assign({}, u.plus, plusData, { updatedAt: nowMs });
    this.flush(uid);
    return u.plus;
  }

  getPacks(uid) {
    return this.user(uid).packs.slice();
  }

  addPack(uid, packId) {
    const u = this.user(uid);
    if (!u.packs.includes(packId)) u.packs.push(packId);
    this.flush(uid);
    return u.packs.slice();
  }

  getAdLog(uid, day) {
    return this.user(uid).adLog[day] || 0;
  }

  incAdLog(uid, day) {
    const u = this.user(uid);
    u.adLog[day] = (u.adLog[day] || 0) + 1;
    this.flush(uid);
    return u.adLog[day];
  }

  setAdUnlock(uid, storyId, until) {
    const u = this.user(uid);
    u.adUnlocks[storyId] = until;
    this.flush(uid);
    return until;
  }

  // 광고 SSV 거래 1건 기록 — 이미 있으면 false (중복 지급 방지)
  async recordSsvTransaction(txId, uid, storyId, nowMs = this.now()) {
    const r = await this.env.DB
      .prepare('INSERT OR IGNORE INTO mj_ssv (tx_id, uid, story_id, at) VALUES (?, ?, ?, ?)')
      .bind(txId, uid, storyId, nowMs)
      .run();
    return ((r && r.meta && r.meta.changes) || 0) > 0;
  }

  async hasProcessed(eventId) {
    const row = await this.env.DB.prepare('SELECT 1 AS ok FROM mj_events WHERE id = ?').bind(eventId).first();
    return !!row;
  }

  async markProcessed(eventId, nowMs = this.now()) {
    await this.env.DB.prepare('INSERT OR IGNORE INTO mj_events (id, at) VALUES (?, ?)').bind(eventId, nowMs).run();
  }

  // 예전 코드(store.tx)와 같은 이름 — D1 에서는 문장 하나가 트랜잭션이라 그대로 실행한다.
  async tx(fn) {
    return fn(this);
  }
}

'use strict';

// 회원·게시판 저장소 — Cloudflare D1.
//
// server/auth.js · server/board.js 는 node:sqlite 의 '동기' prepare().get/all/run 모양으로 쓰여 있다.
// D1 은 비동기(그리고 bind() 로 값을 묶는다)라서, 그 사이를 이 어댑터가 메운다.
//   node:sqlite : db.prepare(sql).get(a, b)        → 값(동기)
//   이 어댑터   : await db.prepare(sql).get(a, b)  → 값(Promise)   ← 호출부는 양쪽 다 await 로 받는다
// 덕분에 같은 auth/board 코드가 Node(테스트)와 Worker(운영)에서 그대로 돈다.

const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS users (
    uid         TEXT PRIMARY KEY,
    email       TEXT NOT NULL UNIQUE,
    nickname    TEXT NOT NULL,
    nick_key    TEXT NOT NULL UNIQUE,
    password    TEXT NOT NULL,
    role        TEXT NOT NULL DEFAULT 'member',
    created_at  INTEGER NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS sessions (
    token_hash  TEXT PRIMARY KEY,
    uid         TEXT NOT NULL,
    created_at  INTEGER NOT NULL,
    expires_at  INTEGER NOT NULL
  )`,
  'CREATE INDEX IF NOT EXISTS sessions_uid ON sessions(uid)',
  `CREATE TABLE IF NOT EXISTS posts (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    author_uid  TEXT NOT NULL,
    category    TEXT NOT NULL,
    title       TEXT NOT NULL,
    body        TEXT NOT NULL,
    views       INTEGER NOT NULL DEFAULT 0,
    created_at  INTEGER NOT NULL,
    updated_at  INTEGER NOT NULL
  )`,
  'CREATE INDEX IF NOT EXISTS posts_recent ON posts(created_at DESC, id DESC)',
  'CREATE INDEX IF NOT EXISTS posts_author ON posts(author_uid)',
  `CREATE TABLE IF NOT EXISTS comments (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    post_id     INTEGER NOT NULL,
    author_uid  TEXT NOT NULL,
    body        TEXT NOT NULL,
    created_at  INTEGER NOT NULL
  )`,
  'CREATE INDEX IF NOT EXISTS comments_post ON comments(post_id, id)',
  'CREATE INDEX IF NOT EXISTS comments_author ON comments(author_uid)',
  // 플러스·단품·광고 보상 상태 (server/store.js 의 사용자 상태를 그대로 JSON 으로 보관)
  'CREATE TABLE IF NOT EXISTS mj_state (uid TEXT PRIMARY KEY, data TEXT NOT NULL, updated_at INTEGER NOT NULL)',
  // 처리한 RevenueCat 이벤트 / 광고 SSV 거래 (중복 지급 방지)
  'CREATE TABLE IF NOT EXISTS mj_events (id TEXT PRIMARY KEY, at INTEGER NOT NULL)',
  'CREATE TABLE IF NOT EXISTS mj_ssv (tx_id TEXT PRIMARY KEY, uid TEXT NOT NULL, story_id TEXT NOT NULL, at INTEGER NOT NULL)'
];

let schemaReady = null;

// 첫 DB 접근 때 한 번만 스키마를 맞춘다 (D1 은 CREATE TABLE IF NOT EXISTS 를 지원).
export function ensureSchema(env) {
  if (!schemaReady) {
    schemaReady = env.DB.batch(SCHEMA.map(sql => env.DB.prepare(sql))).catch(err => {
      schemaReady = null;            // 다음 요청에서 다시 시도
      throw err;
    });
  }
  return schemaReady;
}

function statement(db, sql) {
  return {
    async all(...args) {
      const r = args.length ? await db.prepare(sql).bind(...args).all() : await db.prepare(sql).all();
      return (r && r.results) || [];
    },
    async get(...args) {
      const r = args.length ? await db.prepare(sql).bind(...args).first() : await db.prepare(sql).first();
      return r || null;
    },
    async run(...args) {
      const r = args.length ? await db.prepare(sql).bind(...args).run() : await db.prepare(sql).run();
      const meta = (r && r.meta) || {};
      return { changes: meta.changes || 0, lastInsertRowid: meta.last_row_id || 0 };
    },
    async first(...args) {
      return this.get(...args);
    },
    bind(...args) {
      return statement2(db, sql, args);
    }
  };
}

function statement2(db, sql, bound) {
  const run = (extra) => {
    const args = bound.concat(extra);
    return args.length ? db.prepare(sql).bind(...args) : db.prepare(sql);
  };
  return {
    async all(...args) { const r = await run(args).all(); return (r && r.results) || []; },
    async get(...args) { const r = await run(args).first(); return r || null; },
    async first(...args) { return this.get(...args); },
    async run(...args) {
      const r = await run(args).run();
      const meta = (r && r.meta) || {};
      return { changes: meta.changes || 0, lastInsertRowid: meta.last_row_id || 0 };
    }
  };
}

// auth/board 가 기대하는 최소 인터페이스: prepare(sql).get/all/run(...) + exec(sql)
export function createD1Adapter(env) {
  const db = env.DB;
  return {
    prepare(sql) {
      return statement(db, sql);
    },
    // board.tx / store.tx 가 부르는 BEGIN·COMMIT·ROLLBACK 은 D1 이 받지 않는다.
    // D1 은 문장 하나가 곧 트랜잭션이고, 이 앱의 트랜잭션 본문은 '지우기 두 줄' 정도라 그대로 흘려보낸다.
    async exec(sql) {
      const head = String(sql || '').trim().toUpperCase();
      if (head.startsWith('BEGIN') || head.startsWith('COMMIT') || head.startsWith('ROLLBACK')) return;
      await db.exec(sql);
    }
  };
}

'use strict';

// 회원 가입·로그인·세션 (이메일 · 비밀번호 · 닉네임).
//
// 설계 요점
//  - 비밀번호: crypto.scrypt + 16바이트 무작위 소금. 원문·복호화 가능한 형태는 저장하지 않는다.
//  - 세션: 무작위 토큰(mm1.…)을 발급하고 DB에는 SHA-256 해시만 둔다. 로그아웃하면 즉시 무효.
//    (익명 세션 identity.js 의 서명 토큰과 접두사가 달라 서로 섞이지 않는다)
//  - 로그인 실패: 같은 이메일로 5번 틀리면 15분 잠금 (무차별 대입 방지). 존재하지 않는 이메일도 같은 시간만큼 해시를 계산해
//    응답 시간으로 가입 여부를 알아내지 못하게 한다.
//  - 에러 문구는 '이메일 또는 비밀번호가 올바르지 않아요' 하나로 통일한다.

const crypto = require('crypto');
const identity = require('./identity');

const EMAIL_MAX = 254;
const EMAIL_RE = /^[a-z0-9._%+-]+@[a-z0-9-]+(?:\.[a-z0-9-]+)*\.[a-z]{2,}$/;
const NICK_RE = /^[가-힣A-Za-z0-9_]{2,12}$/;
const NICK_RESERVED = ['관리자', '운영자', '절로가', 'admin', 'administrator', 'root', 'system'];
const PW_MIN = 8;
const PW_MAX = 100;

const SESSION_MS = 30 * 24 * 3600 * 1000;
const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const LOGIN_MAX_FAILS = 5;
const TOKEN_RE = /^mm1\.[A-Za-z0-9_-]{43}$/;
const TOKEN_PREFIX = 'mm1.';

// 관리자(운영자) 모드. ADMIN_EMAILS(쉼표 구분)에 적힌 이메일은 관리자로 대우한다.
// - 첫 로그인·가입 요청 때 계정을 자동으로 만들고(없으면) role='admin' 으로 올린다.
// - ADMIN_PASSWORD 가 잡혀 있으면 그 값으로 비밀번호를 맞춘다 → '관리자 모드 로그인'이 항상 된다.
// 운영에서는 반드시 환경변수로 덮어쓸 것 (기본값은 개발 편의용).
const DEFAULT_ADMIN_EMAILS = 'luxrank@gmail.com';
const DEFAULT_ADMIN_PASSWORD = 'H25rj0986@';
const ADMIN_NICK = '관리자';

function parseEmailList(v) {
  return String(v == null ? '' : v)
    .split(',')
    .map(s => normEmail(s))
    .filter(s => s && s.length <= EMAIL_MAX && EMAIL_RE.test(s));
}

const SCRYPT = { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };
const KEYLEN = 64;

function scryptAsync(password, salt, keylen, opts) {
  return new Promise((resolve, reject) => {
    crypto.scrypt(password, salt, keylen, opts, (err, key) => (err ? reject(err) : resolve(key)));
  });
}

// 저장 형식: scrypt$N$r$p$<saltHex>$<hashHex>  (나중에 파라미터를 올려도 예전 해시를 검증할 수 있게 자기 기술형으로 둔다)
async function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const key = await scryptAsync(password, salt, KEYLEN, SCRYPT);
  return `scrypt$${SCRYPT.N}$${SCRYPT.r}$${SCRYPT.p}$${salt.toString('hex')}$${key.toString('hex')}`;
}

async function verifyPassword(password, stored) {
  const parts = String(stored || '').split('$');
  if (parts.length !== 6 || parts[0] !== 'scrypt') return false;
  const opts = { N: Number(parts[1]), r: Number(parts[2]), p: Number(parts[3]), maxmem: SCRYPT.maxmem };
  const salt = Buffer.from(parts[4], 'hex');
  const expect = Buffer.from(parts[5], 'hex');
  if (!salt.length || !expect.length) return false;
  const got = await scryptAsync(password, salt, expect.length, opts);
  return got.length === expect.length && crypto.timingSafeEqual(got, expect);
}

function normEmail(v) {
  return String(v == null ? '' : v).trim().toLowerCase();
}

function normNick(v) {
  return String(v == null ? '' : v).normalize('NFC').trim();
}

function fail(field, message) {
  return { ok: false, field, message };
}

// 입력 검증 — 서버가 최종 판단한다. 화면의 검사는 입력 도중 빨리 알려 주기 위한 보조일 뿐이다.
function validateSignup(raw) {
  const email = normEmail(raw.email);
  if (!email || email.length > EMAIL_MAX || !EMAIL_RE.test(email)) {
    return fail('email', '이메일 형식을 확인해 주세요. 예: name@example.com');
  }
  const password = typeof raw.password === 'string' ? raw.password : '';
  if (password.length < PW_MIN || password.length > PW_MAX) {
    return fail('password', `비밀번호는 ${PW_MIN}~${PW_MAX}자로 적어 주세요.`);
  }
  if (!/[A-Za-z]/.test(password) || !/[0-9]/.test(password)) {
    return fail('password', '비밀번호에는 영문과 숫자를 함께 써 주세요.');
  }
  // 닉네임은 '선택'이다 — 이메일과 비밀번호 두 칸이면 가입이 끝난다(2026-11 사경첩 전환).
  // 비워 두면 이메일 앞부분으로 만들어 준다. 들어온 값이 있으면 그대로 검증한다.
  const nickname = normNick(raw.nickname);
  if (nickname) {
    if (!NICK_RE.test(nickname)) {
      return fail('nickname', '닉네임은 한글·영문·숫자·밑줄(_)로 2~12자 사이로 적어 주세요.');
    }
    if (NICK_RESERVED.includes(nickname.toLowerCase())) {
      return fail('nickname', '사용할 수 없는 닉네임이에요. 다른 이름을 골라 주세요.');
    }
  }
  return { ok: true, value: { email, password, nickname, derived: !nickname } };
}

// 이메일 앞부분 → 쓸 수 있는 닉네임 후보. 한글·영문·숫자·밑줄만 남기고 2~10자로 자른다.
function nicknameSeed(email) {
  const local = String(email || '').split('@')[0] || '';
  let seed = local.normalize('NFC').replace(/[^가-힣A-Za-z0-9_]/g, '').slice(0, 10);
  if (seed.length < 2) seed = '걸음';
  if (NICK_RESERVED.includes(seed.toLowerCase())) seed = seed + '_' + '님';
  if (!NICK_RE.test(seed)) seed = '걸음';
  return seed;
}

// 이미 쓰는 이름이면 뒤에 숫자를 붙여 빈자리를 찾는다. 다 차면 '' (화면에서 직접 고르게 안내).
function freeNickname(taken, seed) {
  if (!taken(seed)) return seed;
  for (let i = 0; i < 40; i++) {
    const n = String(2 + (i % 97));
    const cand = (seed.slice(0, 12 - n.length) + n);
    if (NICK_RE.test(cand) && !taken(cand)) return cand;
  }
  return '';
}

function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

function publicMember(row) {
  const role = row.role === 'admin' ? 'admin' : 'member';
  return { uid: row.uid, email: row.email, nickname: row.nickname, role, createdAt: row.created_at };
}

// getDb: 지연 열기 함수 (db.js 의 lazyDatabase). now: 시계 (테스트에서 주입).
// adminEmails/adminPassword: 관리자 계정 설정. 생략하면 환경변수 → 자체 기본값 순으로 잡는다.
function createAccounts({ getDb, now = () => Date.now(), adminEmails, adminPassword } = {}) {
  const failures = new Map();   // email -> { n, resetAt, lockedUntil }
  let dummy = null;             // 존재하지 않는 이메일의 응답 시간을 맞추기 위한 더미 해시 (한 번만 계산)
  const ADMIN_LIST = parseEmailList(adminEmails !== undefined ? adminEmails : (process.env.ADMIN_EMAILS || DEFAULT_ADMIN_EMAILS));
  const ADMIN_PW = String(adminPassword !== undefined ? adminPassword : (process.env.ADMIN_PASSWORD || DEFAULT_ADMIN_PASSWORD) || '');
  let seedPromise = null;       // 관리자 시딩은 프로세스당 한 번만 (실패하면 다음 요청에서 다시 시도)

  function recordFailure(email, t) {
    const f = failures.get(email);
    const n = (f && f.resetAt > t ? f.n : 0) + 1;
    failures.set(email, {
      n,
      resetAt: t + LOGIN_WINDOW_MS,
      lockedUntil: n >= LOGIN_MAX_FAILS ? t + LOGIN_WINDOW_MS : 0
    });
    if (failures.size > 5000) {                      // 오래된 항목 정리 (메모리 상한)
      for (const [k, v] of failures) if (v.resetAt <= t) failures.delete(k);
    }
  }

  function issueSession(uid, t) {
    const token = TOKEN_PREFIX + crypto.randomBytes(32).toString('base64url');
    getDb().prepare('INSERT INTO sessions (token_hash, uid, created_at, expires_at) VALUES (?, ?, ?, ?)')
      .run(hashToken(token), uid, t, t + SESSION_MS);
    return token;
  }

  // 토큰 → 회원 uid. 없거나 만료되었으면 ''. (DB는 mm1. 토큰이 올 때만 건드린다)
  function uidForToken(token) {
    if (typeof token !== 'string' || !TOKEN_RE.test(token)) return '';
    const row = getDb().prepare('SELECT uid, expires_at FROM sessions WHERE token_hash = ?').get(hashToken(token));
    if (!row || row.expires_at <= now()) return '';
    return row.uid;
  }

  function isMember(uid) {
    if (!identity.UID_RE.test(String(uid || ''))) return false;
    return !!getDb().prepare('SELECT 1 AS ok FROM users WHERE uid = ?').get(uid);
  }

  // 관리자 여부 — 게시판 운영 권한(어떤 글·댓글도 삭제)을 판단할 때 쓴다.
  function isAdmin(uid) {
    if (!uid || !identity.UID_RE.test(String(uid))) return false;
    const row = getDb().prepare('SELECT role FROM users WHERE uid = ?').get(uid);
    return !!row && row.role === 'admin';
  }

  // 관리자 계정을 맞춰 둔다: 목록의 이메일이 없으면 만들고, 있으면 role 을 올리고
  // ADMIN_PASSWORD 가 있으면 비밀번호도 그 값으로 맞춘다 (로그인이 항상 되게).
  async function seedAdmin() {
    if (!ADMIN_LIST.length) return;
    const db = getDb();
    const stored = ADMIN_PW ? await hashPassword(ADMIN_PW) : '';
    if (!stored) return;
    const taken = n => !!db.prepare('SELECT 1 AS ok FROM users WHERE nick_key = ?').get(String(n).toLowerCase());
    for (const email of ADMIN_LIST) {
      const row = db.prepare('SELECT uid, role FROM users WHERE email = ?').get(email);
      if (row) {
        if (row.role !== 'admin') db.prepare("UPDATE users SET role = 'admin' WHERE uid = ?").run(row.uid);
        db.prepare('UPDATE users SET password = ? WHERE uid = ?').run(stored, row.uid);
      } else {
        const uid = 'mj_' + crypto.randomBytes(16).toString('hex');
        const nick = freeNickname(taken, ADMIN_NICK) || (ADMIN_NICK + uid.slice(-4));
        db.prepare("INSERT INTO users (uid, email, nickname, nick_key, password, role, created_at) VALUES (?, ?, ?, ?, ?, 'admin', ?)")
          .run(uid, email, nick, nick.toLowerCase(), stored, now());
      }
    }
  }

  // 첫 로그인·가입 요청에서 한 번만 실행한다 (lazyDatabase 취지: 인증을 한 번도 안 쓰면 DB 를 열지 않는다).
  function ensureAdmin() {
    if (!seedPromise) {
      seedPromise = seedAdmin().catch(e => { seedPromise = null; throw e; });
    }
    return seedPromise;
  }

  function profile(uid) {
    const row = getDb().prepare('SELECT uid, email, nickname, role, created_at FROM users WHERE uid = ?').get(uid);
    return row ? publicMember(row) : null;
  }

  async function signup(raw) {
    await ensureAdmin();
    const v = validateSignup(raw || {});
    if (!v.ok) return { status: 400, body: { error: 'validation', field: v.field, message: v.message } };
    const db = getDb();
    const { email, password } = v.value;

    if (db.prepare('SELECT 1 AS ok FROM users WHERE email = ?').get(email)) {
      return { status: 409, body: { error: 'email_taken', field: 'email', message: '이미 가입된 이메일이에요. 로그인해 주세요.' } };
    }
    // 닉네임을 안 적었으면 서버가 만들어 준다. 화면이 '닉네임을 지어 주세요'로 가입을 막지 않게.
    const taken = n => !!db.prepare('SELECT 1 AS ok FROM users WHERE nick_key = ?').get(n.toLowerCase());
    let nickname = v.value.nickname;
    if (!nickname) {
      nickname = freeNickname(taken, nicknameSeed(email));
      if (!nickname) {
        return { status: 409, body: { error: 'nickname_taken', field: 'nickname', message: '닉네임을 자동으로 정하지 못했어요. 사용할 이름을 적어 주세요.' } };
      }
    } else if (taken(nickname)) {
      return { status: 409, body: { error: 'nickname_taken', field: 'nickname', message: '이미 쓰고 있는 닉네임이에요.' } };
    }

    const uid = 'mj_' + crypto.randomBytes(16).toString('hex');
    const stored = await hashPassword(password);
    const t = now();
    try {
      db.prepare('INSERT INTO users (uid, email, nickname, nick_key, password, created_at) VALUES (?, ?, ?, ?, ?, ?)')
        .run(uid, email, nickname, nickname.toLowerCase(), stored, t);
    } catch (e) {
      // 같은 순간 두 요청이 들어온 경우 — 유니크 제약이 최종 방어선
      if (/users\.email/.test(e.message)) return { status: 409, body: { error: 'email_taken', field: 'email', message: '이미 가입된 이메일이에요. 로그인해 주세요.' } };
      if (/nick_key/.test(e.message)) return { status: 409, body: { error: 'nickname_taken', field: 'nickname', message: '이미 쓰고 있는 닉네임이에요.' } };
      throw e;
    }
    const token = issueSession(uid, t);
    return { status: 201, body: { uid, token, member: publicMember({ uid, email, nickname, created_at: t }) } };
  }

  async function login(raw) {
    const body = raw || {};
    const email = normEmail(body.email);
    const password = typeof body.password === 'string' ? body.password : '';
    if (!email || !password) {
      return { status: 400, body: { error: 'validation', message: '이메일과 비밀번호를 입력해 주세요.' } };
    }
    const t = now();
    const f = failures.get(email);
    if (f && f.lockedUntil > t) {
      const retryAfter = Math.ceil((f.lockedUntil - t) / 1000);
      return { status: 429, retryAfter, body: { error: 'too_many_attempts', retryAfter, message: '로그인을 여러 번 틀렸어요. 15분 뒤에 다시 시도해 주세요.' } };
    }
    await ensureAdmin();

    const row = getDb().prepare('SELECT uid, email, nickname, role, created_at, password FROM users WHERE email = ?').get(email);
    let ok = false;
    if (row) {
      ok = await verifyPassword(password, row.password);
    } else {
      if (!dummy) dummy = await hashPassword('dummy-password-0');
      await verifyPassword(password, dummy);       // 응답 시간 평준화
    }
    if (!ok) {
      recordFailure(email, t);
      return { status: 401, body: { error: 'invalid_credentials', message: '이메일 또는 비밀번호가 올바르지 않아요.' } };
    }
    failures.delete(email);
    const token = issueSession(row.uid, t);
    return { status: 200, body: { uid: row.uid, token, member: publicMember(row) } };
  }

  function logout(token) {
    if (typeof token !== 'string' || !TOKEN_RE.test(token)) return false;
    getDb().prepare('DELETE FROM sessions WHERE token_hash = ?').run(hashToken(token));
    return true;
  }

  return { signup, login, logout, uidForToken, isMember, profile, isAdmin, ensureAdmin };
}

module.exports = {
  createAccounts,
  validateSignup,
  hashPassword,
  verifyPassword,
  TOKEN_RE,
  PW_MIN,
  PW_MAX,
  NICK_RE,
  EMAIL_RE,
  DEFAULT_ADMIN_EMAILS,
  DEFAULT_ADMIN_PASSWORD
};

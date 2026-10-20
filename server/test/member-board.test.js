'use strict';

// 회원 가입·로그인·세션, 회원 게시판(글·댓글) 권한과 저장을 실제 HTTP 요청으로 검사한다.

const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const os = require('node:os');
const fs = require('node:fs');
const path = require('node:path');
const { createApp } = require('../app');

const T0 = Date.UTC(2026, 9, 20, 0, 0, 0);
const DAY = 86400000;

function startServer(opts = {}) {
  let clock = opts.initialNow || T0;
  const app = createApp(Object.assign({
    now: () => clock,
    webhookAuth: 'Bearer secret-token',
    devAdReward: true,
    devEntitlement: true,
    dbPath: ':memory:'
  }, opts));
  return new Promise(resolve => {
    const server = http.createServer(app);
    server.listen(0, '127.0.0.1', () => {
      const base = `http://127.0.0.1:${server.address().port}`;
      async function call(method, p, { token, anon, body, headers = {} } = {}) {
        const h = Object.assign({}, headers);
        if (token) h.Authorization = 'Bearer ' + token;
        if (anon) h['X-MJ-UID'] = anon;
        if (body !== undefined) h['Content-Type'] = 'application/json';
        const r = await fetch(base + p, {
          method,
          headers: h,
          body: body !== undefined ? JSON.stringify(body) : undefined
        });
        const json = await r.json().catch(() => null);
        return { status: r.status, body: json, headers: r.headers };
      }
      resolve({
        call,
        advance: ms => { clock += ms; },
        close: () => new Promise(r => server.close(r))
      });
    });
  });
}

const OK_PW = 'abcd1234';
async function signup(s, email, nickname, password = OK_PW) {
  const r = await s.call('POST', '/api/auth/signup', { body: { email, password, nickname } });
  assert.equal(r.status, 201, JSON.stringify(r.body));
  return r.body;
}

// ---------- 가입 ----------

test('1. 가입하면 201과 로그인 토큰·회원 정보를 돌려주고, 비밀번호는 응답에 없다', async () => {
  const s = await startServer();
  try {
    const r = await s.call('POST', '/api/auth/signup', { body: { email: 'Lee@Example.com ', password: OK_PW, nickname: '  수련  ' } });
    assert.equal(r.status, 201);
    assert.match(r.body.token, /^mm1\./);
    assert.match(r.body.uid, /^mj_[0-9a-f]{32}$/);
    assert.equal(r.body.member.email, 'lee@example.com');       // 이메일은 소문자로 정리
    assert.equal(r.body.member.nickname, '수련');               // 닉네임 앞뒤 공백 제거
    assert.ok(!JSON.stringify(r.body).includes(OK_PW));
    assert.equal('password' in r.body.member, false);
  } finally {
    await s.close();
  }
});

test('2. 입력 검증: 이메일·비밀번호·닉네임 각각 어떤 칸이 틀렸는지 알려준다', async () => {
  const s = await startServer();
  try {
    const cases = [
      [{ email: 'not-an-email', password: OK_PW, nickname: '수련' }, 'email'],
      [{ email: 'a@b.co', password: 'short1', nickname: '수련' }, 'password'],
      [{ email: 'a@b.co', password: 'onlyletters', nickname: '수련' }, 'password'],
      [{ email: 'a@b.co', password: '12345678', nickname: '수련' }, 'password'],
      [{ email: 'a@b.co', password: OK_PW, nickname: '수' }, 'nickname'],
      [{ email: 'a@b.co', password: OK_PW, nickname: '아주긴닉네임입니다abcd' }, 'nickname'],   // 13자
      [{ email: 'a@b.co', password: OK_PW, nickname: '수련!' }, 'nickname'],
      [{ email: 'a@b.co', password: OK_PW, nickname: '관리자' }, 'nickname'],
      [{ email: 'a@b.co', password: OK_PW, nickname: 'Admin' }, 'nickname']
    ];
    for (const [body, field] of cases) {
      const r = await s.call('POST', '/api/auth/signup', { body });
      assert.equal(r.status, 400, JSON.stringify(body));
      assert.equal(r.body.error, 'validation');
      assert.equal(r.body.field, field, JSON.stringify(body));
      assert.ok(r.body.message);
    }
  } finally {
    await s.close();
  }
});

test('3. 같은 이메일(대소문자 무시)·같은 닉네임(대소문자 무시)은 다시 가입할 수 없다', async () => {
  const s = await startServer();
  try {
    await signup(s, 'dup@example.com', 'Haneul');
    const e = await s.call('POST', '/api/auth/signup', { body: { email: 'DUP@example.com', password: OK_PW, nickname: '다른이름' } });
    assert.equal(e.status, 409);
    assert.equal(e.body.error, 'email_taken');
    const n = await s.call('POST', '/api/auth/signup', { body: { email: 'other@example.com', password: OK_PW, nickname: 'haneul' } });
    assert.equal(n.status, 409);
    assert.equal(n.body.error, 'nickname_taken');
    assert.equal(n.body.field, 'nickname');
  } finally {
    await s.close();
  }
});

// ---------- 로그인 · 세션 ----------

test('4. 로그인: 이메일 대소문자는 무시하고, 틀리면 어느 칸이 틀렸는지 드러내지 않는다', async () => {
  const s = await startServer();
  try {
    await signup(s, 'user@example.com', '로그인테스트');
    const ok = await s.call('POST', '/api/auth/login', { body: { email: 'USER@example.com', password: OK_PW } });
    assert.equal(ok.status, 200);
    assert.match(ok.body.token, /^mm1\./);

    const wrongPw = await s.call('POST', '/api/auth/login', { body: { email: 'user@example.com', password: 'wrong1234' } });
    const noUser = await s.call('POST', '/api/auth/login', { body: { email: 'ghost@example.com', password: 'wrong1234' } });
    assert.equal(wrongPw.status, 401);
    assert.equal(noUser.status, 401);
    assert.equal(wrongPw.body.error, 'invalid_credentials');
    assert.deepEqual(wrongPw.body, noUser.body);             // 두 경우의 응답이 완전히 같다
  } finally {
    await s.close();
  }
});

test('5. 같은 이메일로 5번 틀리면 15분 잠기고, 시간이 지나면 다시 로그인된다', async () => {
  const s = await startServer();
  try {
    await signup(s, 'lock@example.com', '잠금테스트');
    for (let i = 0; i < 4; i++) {
      const r = await s.call('POST', '/api/auth/login', { body: { email: 'lock@example.com', password: 'nope1234' } });
      assert.equal(r.status, 401);
    }
    const fifth = await s.call('POST', '/api/auth/login', { body: { email: 'lock@example.com', password: 'nope1234' } });
    assert.equal(fifth.status, 401);
    const locked = await s.call('POST', '/api/auth/login', { body: { email: 'lock@example.com', password: OK_PW } });
    assert.equal(locked.status, 429);
    assert.equal(locked.body.error, 'too_many_attempts');
    assert.ok(Number(locked.headers.get('retry-after')) > 0);

    s.advance(15 * 60 * 1000 + 1);
    const again = await s.call('POST', '/api/auth/login', { body: { email: 'lock@example.com', password: OK_PW } });
    assert.equal(again.status, 200);
  } finally {
    await s.close();
  }
});

test('6. /api/me: 토큰이 있으면 회원 정보와 활동 수를, 없으면 member=null', async () => {
  const s = await startServer();
  try {
    const { token, member } = await signup(s, 'me@example.com', '내정보');
    const anon = await s.call('GET', '/api/me');
    assert.equal(anon.body.member, null);

    const mine = await s.call('GET', '/api/me', { token });
    assert.equal(mine.status, 200);
    assert.equal(mine.body.member.uid, member.uid);
    assert.equal(mine.body.member.nickname, '내정보');
    assert.deepEqual({ posts: mine.body.member.posts, comments: mine.body.member.comments }, { posts: 0, comments: 0 });
    assert.equal(mine.body.uid, member.uid);
  } finally {
    await s.close();
  }
});

test('7. 로그아웃하면 그 토큰은 즉시 쓸 수 없다 (401 invalid_token)', async () => {
  const s = await startServer();
  try {
    const { token } = await signup(s, 'out@example.com', '로그아웃');
    const out = await s.call('POST', '/api/auth/logout', { token });
    assert.equal(out.status, 200);
    const after = await s.call('GET', '/api/me', { token });
    assert.equal(after.status, 401);
    assert.equal(after.body.error, 'invalid_token');
  } finally {
    await s.close();
  }
});

test('8. 세션은 30일 뒤 만료된다', async () => {
  const s = await startServer();
  try {
    const { token } = await signup(s, 'exp@example.com', '만료테스트');
    s.advance(29 * DAY);
    assert.equal((await s.call('GET', '/api/me', { token })).status, 200);
    s.advance(2 * DAY);
    const r = await s.call('GET', '/api/me', { token });
    assert.equal(r.status, 401);
  } finally {
    await s.close();
  }
});

test('9. 옛(잘못된) 토큰이 남아 있어도 로그인 시도는 invalid_token 이 아니라 정상 처리된다', async () => {
  const s = await startServer();
  try {
    const stale = await s.call('POST', '/api/auth/login', { token: 'mm1.not-a-real-token', body: { email: 'x@y.co', password: 'abcd1234' } });
    assert.equal(stale.status, 401);                        // 옛 토큰이 있어도 로그인 시도 자체는 처리된다 (invalid_token 이 아님)
    assert.equal(stale.body.error, 'invalid_credentials');
  } finally {
    await s.close();
  }
});

// ---------- 게시판 ----------

test('10. 익명 사용자는 읽을 수 있지만 글·댓글을 쓸 수 없다 (login_required)', async () => {
  const s = await startServer();
  try {
    const author = await signup(s, 'author@example.com', '작성자');
    const created = await s.call('POST', '/api/board/posts', { token: author.token, body: { category: 'free', title: '첫 글', body: '안녕하세요' } });
    assert.equal(created.status, 201);
    const id = created.body.id;

    const list = await s.call('GET', '/api/board/posts', { anon: 'mj_00000000000000000000000000000001' });
    assert.equal(list.status, 200);
    assert.equal(list.body.total, 1);

    const writeAnon = await s.call('POST', '/api/board/posts', { anon: 'mj_00000000000000000000000000000001', body: { category: 'free', title: 'x', body: 'y' } });
    assert.equal(writeAnon.status, 401);
    assert.equal(writeAnon.body.error, 'login_required');

    const commentAnon = await s.call('POST', `/api/board/posts/${id}/comments`, { body: { body: '댓글' } });
    assert.equal(commentAnon.status, 401);
    assert.equal(commentAnon.body.error, 'login_required');
  } finally {
    await s.close();
  }
});

test('11. 글 작성 → 목록·상세 조회, 작성자가 아닌 사람이 보면 조회수가 오르고 작성자는 안 오른다', async () => {
  const s = await startServer();
  try {
    const a = await signup(s, 'writer@example.com', '글쓴이');
    const b = await signup(s, 'reader@example.com', '독자');
    const made = await s.call('POST', '/api/board/posts', { token: a.token, body: { category: 'visit', title: '  해인사 다녀왔어요  ', body: '장경판전 앞에서\r\n한참 서 있었어요.' } });
    assert.equal(made.status, 201);
    const id = made.body.id;

    const own = await s.call('GET', `/api/board/posts/${id}`, { token: a.token });
    assert.equal(own.body.views, 0);
    assert.equal(own.body.mine, true);
    assert.equal(own.body.body, '장경판전 앞에서\n한참 서 있었어요.');   // 줄바꿈 정리
    assert.equal(own.body.title, '해인사 다녀왔어요');

    const other = await s.call('GET', `/api/board/posts/${id}`, { token: b.token });
    assert.equal(other.body.views, 1);
    assert.equal(other.body.mine, false);
    assert.equal(other.body.nickname, '글쓴이');
    assert.equal(other.body.categoryLabel, '순례 후기');

    const list = await s.call('GET', '/api/board/posts');
    assert.equal(list.body.items[0].id, id);
    assert.equal(list.body.items[0].preview.startsWith('장경판전'), true);
    assert.equal(list.body.items[0].nickname, '글쓴이');
    assert.ok(Array.isArray(list.body.categories) && list.body.categories.length === 3);
    assert.ok(!('uid' in list.body.items[0]) && !('author_uid' in list.body.items[0]), '작성자 uid 는 노출하지 않는다');
  } finally {
    await s.close();
  }
});

test('12. 글 입력 검증: 종류·제목·내용 빈칸과 길이 초과', async () => {
  const s = await startServer();
  try {
    const { token } = await signup(s, 'val@example.com', '검증');
    const bad = [
      [{ category: 'nope', title: 't', body: 'b' }, 'category'],
      [{ category: 'free', title: '   ', body: 'b' }, 'title'],
      [{ category: 'free', title: 'a'.repeat(81), body: 'b' }, 'title'],
      [{ category: 'free', title: 't', body: '   ' }, 'body'],
      [{ category: 'free', title: 't', body: 'b'.repeat(2001) }, 'body']
    ];
    for (const [body, field] of bad) {
      const r = await s.call('POST', '/api/board/posts', { token, body });
      assert.equal(r.status, 400, JSON.stringify(body).slice(0, 80));
      assert.equal(r.body.field, field);
    }
    const ok = await s.call('POST', '/api/board/posts', { token, body: { category: 'question', title: 'a'.repeat(80), body: 'b'.repeat(2000) } });
    assert.equal(ok.status, 201);
  } finally {
    await s.close();
  }
});

test('13. 목록: 종류 필터·제목/본문 검색(% 와 _ 는 글자 그대로)·쪽 나누기·내 글만', async () => {
  const s = await startServer();
  try {
    const a = await signup(s, 'list@example.com', '목록');
    const b = await signup(s, 'other2@example.com', '다른사람');
    for (let i = 0; i < 24; i++) {
      s.advance(1000);
      await s.call('POST', '/api/board/posts', { token: a.token, body: { category: i % 2 ? 'free' : 'question', title: `글 ${i}`, body: '본문' } });
    }
    s.advance(1000);
    await s.call('POST', '/api/board/posts', { token: b.token, body: { category: 'free', title: '100% 완주', body: '언더_스코어 테스트' } });

    const all = await s.call('GET', '/api/board/posts');
    assert.equal(all.body.total, 25);
    assert.equal(all.body.pages, 2);
    assert.equal(all.body.items.length, 20);
    assert.equal(all.body.items[0].title, '100% 완주');       // 최신순

    const p2 = await s.call('GET', '/api/board/posts?page=2');
    assert.equal(p2.body.items.length, 5);
    assert.equal(p2.body.page, 2);

    const q = await s.call('GET', '/api/board/posts?q=' + encodeURIComponent('100%'));
    assert.equal(q.body.total, 1);
    const under = await s.call('GET', '/api/board/posts?q=' + encodeURIComponent('_'));
    assert.equal(under.body.total, 1, '_ 는 와일드카드가 아니라 글자로 찾는다');
    const none = await s.call('GET', '/api/board/posts?q=' + encodeURIComponent('%'));
    assert.equal(none.body.total, 1);

    const qs = await s.call('GET', '/api/board/posts?category=question');
    assert.equal(qs.body.total, 12);
    const bad = await s.call('GET', '/api/board/posts?category=zzz');
    assert.equal(bad.status, 400);

    const mine = await s.call('GET', '/api/board/posts?mine=1', { token: a.token });
    assert.equal(mine.body.total, 24);
    assert.ok(mine.body.items.every(x => x.mine));
    const mineAnon = await s.call('GET', '/api/board/posts?mine=1');
    assert.equal(mineAnon.status, 401);
  } finally {
    await s.close();
  }
});

test('14. 수정·삭제는 작성자만: 다른 회원은 403, 익명은 401, 없는 글은 404', async () => {
  const s = await startServer();
  try {
    const a = await signup(s, 'own@example.com', '주인');
    const b = await signup(s, 'nosy@example.com', '남의글');
    const { body: { id } } = await s.call('POST', '/api/board/posts', { token: a.token, body: { category: 'free', title: '원래 제목', body: '원래 내용' } });

    const denied = await s.call('PATCH', `/api/board/posts/${id}`, { token: b.token, body: { category: 'free', title: '해킹', body: '해킹' } });
    assert.equal(denied.status, 403);
    assert.equal((await s.call('PATCH', `/api/board/posts/${id}`, { body: { category: 'free', title: 'x', body: 'y' } })).status, 401);
    assert.equal((await s.call('DELETE', `/api/board/posts/${id}`, { token: b.token })).status, 403);

    s.advance(60 * 1000);
    const edited = await s.call('PATCH', `/api/board/posts/${id}`, { token: a.token, body: { category: 'question', title: '고친 제목', body: '고친 내용' } });
    assert.equal(edited.status, 200);
    const view = await s.call('GET', `/api/board/posts/${id}`, { token: a.token });
    assert.equal(view.body.title, '고친 제목');
    assert.equal(view.body.category, 'question');
    assert.equal(view.body.edited, true);

    assert.equal((await s.call('GET', '/api/board/posts/999999')).status, 404);
    assert.equal((await s.call('GET', '/api/board/posts/abc')).status, 404);
    assert.equal((await s.call('PATCH', '/api/board/posts/999999', { token: a.token, body: { category: 'free', title: 't', body: 'b' } })).status, 404);
  } finally {
    await s.close();
  }
});

test('15. 댓글: 회원이 달고, 누구나 읽고, 작성자만 지울 수 있다', async () => {
  const s = await startServer();
  try {
    const a = await signup(s, 'cm1@example.com', '첫째');
    const b = await signup(s, 'cm2@example.com', '둘째');
    const { body: { id } } = await s.call('POST', '/api/board/posts', { token: a.token, body: { category: 'question', title: '질문', body: '답을 알려 주세요' } });

    const c1 = await s.call('POST', `/api/board/posts/${id}/comments`, { token: b.token, body: { body: '  제가 알아요  ' } });
    assert.equal(c1.status, 201);
    const empty = await s.call('POST', `/api/board/posts/${id}/comments`, { token: b.token, body: { body: '   ' } });
    assert.equal(empty.status, 400);
    const long = await s.call('POST', `/api/board/posts/${id}/comments`, { token: b.token, body: { body: 'x'.repeat(301) } });
    assert.equal(long.status, 400);

    const list = await s.call('GET', `/api/board/posts/${id}/comments`, { token: a.token });
    assert.equal(list.body.items.length, 1);
    assert.equal(list.body.items[0].body, '제가 알아요');
    assert.equal(list.body.items[0].nickname, '둘째');
    assert.equal(list.body.items[0].mine, false);

    const post = await s.call('GET', `/api/board/posts/${id}`);
    assert.equal(post.body.commentCount, 1);

    assert.equal((await s.call('DELETE', `/api/board/comments/${c1.body.id}`, { token: a.token })).status, 403);
    assert.equal((await s.call('DELETE', `/api/board/comments/${c1.body.id}`, { token: b.token })).status, 200);
    assert.equal((await s.call('GET', `/api/board/posts/${id}/comments`)).body.items.length, 0);
    assert.equal((await s.call('POST', `/api/board/posts/999999/comments`, { token: b.token, body: { body: '없는 글' } })).status, 404);
  } finally {
    await s.close();
  }
});

test('16. 글을 지우면 댓글도 함께 지워지고, 내 활동 수에서도 빠진다', async () => {
  const s = await startServer();
  try {
    const a = await signup(s, 'del1@example.com', '지우는사람');
    const b = await signup(s, 'del2@example.com', '댓글러');
    const { body: { id } } = await s.call('POST', '/api/board/posts', { token: a.token, body: { category: 'free', title: '지울 글', body: '내용' } });
    await s.call('POST', `/api/board/posts/${id}/comments`, { token: b.token, body: { body: '댓글' } });

    let me = await s.call('GET', '/api/me', { token: b.token });
    assert.equal(me.body.member.comments, 1);

    assert.equal((await s.call('DELETE', `/api/board/posts/${id}`, { token: a.token })).status, 200);
    assert.equal((await s.call('GET', `/api/board/posts/${id}`)).status, 404);
    assert.equal((await s.call('GET', `/api/board/posts/${id}/comments`)).status, 404);
    me = await s.call('GET', '/api/me', { token: b.token });
    assert.equal(me.body.member.comments, 0);
  } finally {
    await s.close();
  }
});

test('17. 비밀번호는 평문이 아니라 scrypt 해시로 저장되고, 계정은 파일 DB에서 재시작 후에도 남는다', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mj-db-'));
  const file = path.join(dir, 'test.sqlite');
  try {
    let s = await startServer({ dbPath: file });
    await signup(s, 'persist@example.com', '영속성', 'persist123');
    const w = await s.call('POST', '/api/board/posts', { token: (await s.call('POST', '/api/auth/login', { body: { email: 'persist@example.com', password: 'persist123' } })).body.token, body: { category: 'free', title: '남을 글', body: '재시작 후에도' } });
    assert.equal(w.status, 201);
    await s.close();

    // 같은 파일로 다시 띄운다 = 서버 재시작
    s = await startServer({ dbPath: file });
    try {
      const login = await s.call('POST', '/api/auth/login', { body: { email: 'persist@example.com', password: 'persist123' } });
      assert.equal(login.status, 200, '재시작 후 로그인');
      const list = await s.call('GET', '/api/board/posts');
      assert.equal(list.body.items[0].title, '남을 글');
    } finally {
      await s.close();
    }

    const { DatabaseSync } = require('node:sqlite');
    const raw = new DatabaseSync(file);
    const row = raw.prepare('SELECT password FROM users WHERE email = ?').get('persist@example.com');
    raw.close();
    assert.match(row.password, /^scrypt\$16384\$8\$1\$[0-9a-f]{32}\$[0-9a-f]{128}$/);
    assert.ok(!row.password.includes('persist123'));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('18. 익명 세션(X-MJ-UID·/api/session)은 회원 권한을 얻지 못한다', async () => {
  const s = await startServer();
  try {
    const session = await s.call('POST', '/api/session');
    assert.equal(session.status, 200);
    const w = await s.call('POST', '/api/board/posts', { token: session.body.token, body: { category: 'free', title: 't', body: 'b' } });
    assert.equal(w.status, 401);
    const me = await s.call('GET', '/api/me', { token: session.body.token });
    assert.equal(me.body.member, null);
  } finally {
    await s.close();
  }
});

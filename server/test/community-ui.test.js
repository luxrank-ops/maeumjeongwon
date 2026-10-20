'use strict';

// 회원 게시판·가입 화면(js/app/community.js)을 브라우저 없이 vm 에서 실행해 검사한다.
// 확인하는 것: 사용자 입력이 HTML 로 해석되지 않는지, 익명 글쓰기가 막히는지,
// 로그인 뒤 원래 가려던 화면으로 돌아가는지, 폼 오류가 입력을 지우지 않는지.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const SRC = fs.readFileSync(path.join(__dirname, '..', '..', 'js', 'app', 'community.js'), 'utf-8');

const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const ic = n => `<svg data-icon="${n}"></svg>`;
// 데이터 요청은 마이크로태스크 여러 단계를 거친다 — 몇 번 양보해서 기다린다
const tick = async () => { for (let i = 0; i < 6; i++) await new Promise(r => setTimeout(r, 0)); };

const XSS_TITLE = '<img src=x onerror="window.__xss=1">제목';
const XSS_NICK = '<b>악성</b>';
const XSS_BODY = '<script>window.__xss=2</script>본문';

function makeHarness({ member = null, responder } = {}) {
  const handlers = {};
  const document = { addEventListener: (t, fn) => { (handlers[t] = handlers[t] || []).push(fn); } };
  class FormDataStub {
    constructor(form) { this.form = form; }
    get(k) { const f = this.form.fields[k]; return f ? f.value : null; }
  }
  const sandbox = { window: null, document, console, URLSearchParams, setTimeout, clearTimeout, FormData: FormDataStub, scrollTo() {}, location: { hash: '' }, history: { replaceState() {} } };
  sandbox.window = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(SRC, sandbox, { filename: 'community.js' });

  const state = { member, calls: [], repaints: 0, gotos: [], toasts: [] };
  const api = async (p, opts = {}) => {
    state.calls.push([p, (opts && opts.method) || 'GET']);
    return responder ? responder(p, opts, state) : { ok: true, status: 200, body: {} };
  };
  const ctx = {
    api, esc, ic,
    toast: m => state.toasts.push(m),
    repaint: () => { state.repaints++; },
    goto: h => { state.gotos.push(h); },
    getMember: () => state.member,
    applySession: async next => { state.member = next ? next.member : null; },
    refreshMember: async () => {}
  };
  const cm = sandbox.MJ_COMMUNITY_FACTORY(ctx);
  return { cm, state, handlers, loc: sandbox.location };
}

const LIST = {
  items: [{
    id: 7, category: 'free', categoryLabel: '자유 이야기', title: XSS_TITLE, nickname: XSS_NICK,
    views: 3, commentCount: 1, createdAt: 1, updatedAt: 1, edited: false, mine: false,
    preview: XSS_BODY
  }],
  total: 1, page: 1, pageSize: 20, pages: 1
};

const POST = {
  id: 7, category: 'free', categoryLabel: '자유 이야기', title: XSS_TITLE, nickname: XSS_NICK,
  views: 3, commentCount: 1, createdAt: 1, updatedAt: 1, edited: false, mine: false, body: XSS_BODY
};

function listResponder(p) {
  if (p.startsWith('/api/board/posts?') || p === '/api/board/posts') return { ok: true, status: 200, body: LIST };
  if (p === '/api/board/posts/7') return { ok: true, status: 200, body: POST };
  if (p === '/api/board/posts/7/comments') return { ok: true, status: 200, body: { items: [{ id: 1, body: XSS_BODY, nickname: XSS_NICK, createdAt: 1, mine: false }] } };
  return { ok: true, status: 200, body: {} };
}

test('목록: 제목·닉네임·미리보기는 이스케이프되고 익명은 로그인 안내를 본다', async () => {
  const { cm, state, loc } = makeHarness({ responder: listResponder });
  loc.hash = '#/board';
  cm.enter('board');
  await tick();
  const html = cm.view('board');
  assert.ok(!html.includes('<img src=x'), '제목의 태그가 그대로 들어가면 안 됨');
  assert.ok(!html.includes('<b>악성</b>'), '닉네임의 태그가 그대로 들어가면 안 됨');
  assert.ok(!html.includes('<script>window.__xss=2'), '미리보기의 스크립트가 그대로 들어가면 안 됨');
  assert.ok(html.includes('&lt;img src=x'), '제목은 글자로 보여야 함');
  assert.ok(html.includes('로그인하고 쓰기'), '익명에게는 로그인 후 쓰기 안내');
  assert.ok(html.includes('disabled'), '익명은 "내 글만 보기"를 쓸 수 없음');
  assert.ok(state.calls.some(([p]) => p.startsWith('/api/board/posts')), '목록을 서버에서 받아야 함');
});

test('목록: 회원에게는 글쓰기 버튼이 보인다', async () => {
  const { cm, loc } = makeHarness({ member: { uid: 'mj_x', nickname: '마음', email: 'a@b.co' }, responder: listResponder });
  loc.hash = '#/board';
  cm.enter('board');
  await tick();
  const html = cm.view('board');
  assert.ok(html.includes('href="#/board/write"'));
  assert.ok(!html.includes('로그인하고 쓰기'));
});

test('글쓰기: 익명은 회원 전용 화면을 보고 폼을 볼 수 없다', () => {
  const { cm } = makeHarness();
  const html = cm.view('board', 'write');
  assert.ok(html.includes('회원 전용'));
  assert.ok(!html.includes('data-cm-form="post"'));
  assert.ok(html.includes('data-next="#/board/write"'), '로그인 뒤 돌아갈 주소를 담아야 함');
});

test('상세: 본문·댓글은 이스케이프되고, 작성자가 아니면 고치기·지우기가 없다', async () => {
  const { cm, loc } = makeHarness({ member: { uid: 'mj_x', nickname: '마음' }, responder: listResponder });
  loc.hash = '#/board/7';
  cm.enter('board', '7');
  await tick();
  const html = cm.view('board', '7');
  assert.ok(!html.includes('<script>window.__xss=2'), '본문 스크립트가 그대로 들어가면 안 됨');
  assert.ok(!html.includes('<b>악성</b>'), '댓글·작성자 태그가 그대로 들어가면 안 됨');
  assert.ok(!html.includes('data-cm="post-del"'), '작성자가 아니면 지우기 없음');
  assert.ok(html.includes('data-cm-form="comment"'), '회원은 댓글을 쓸 수 있음');
});

test('수정 화면: 작성자가 아니면 안내만 보인다', async () => {
  const { cm, loc } = makeHarness({ member: { uid: 'mj_x', nickname: '마음' }, responder: listResponder });
  loc.hash = '#/board/7/edit';
  cm.enter('board', '7', 'edit');
  await tick();
  const html = cm.view('board', '7', 'edit');
  assert.ok(!html.includes('data-cm-form="post"'));
  assert.ok(html.includes('작성자만'));
});

test('가입 화면: 비밀번호 확인이 다르면 서버를 부르지 않고 오류를 보인다', async () => {
  const { cm, state, handlers } = makeHarness({ responder: listResponder });
  const html = cm.view('account', 'signup');
  assert.ok(html.includes('data-cm-form="signup"'));
  const form = fakeForm('signup', { email: 'a@b.co', nickname: '마음', password: 'abc12345', password2: 'abc12346', agree: 'on' });
  await runSubmit(handlers, form);
  assert.equal(state.calls.filter(([p]) => p === '/api/auth/signup').length, 0, '서버 호출이 없어야 함');
  assert.ok(form.errorEl.textContent.includes('확인이 달라요'));
  assert.equal(form.fields.password.value, 'abc12345', '불일치 때 비밀번호 칸은 그대로여야 함');
});

test('로그인 실패: 오류 문구를 보이고 비밀번호 칸만 비운다', async () => {
  const { cm, state, handlers } = makeHarness({
    responder: (p) => p === '/api/auth/login'
      ? { ok: false, status: 401, body: { error: 'invalid_credentials', message: '이메일 또는 비밀번호가 올바르지 않아요.' } }
      : listResponder(p)
  });
  cm.view('account', 'login');
  const form = fakeForm('login', { email: 'a@b.co', password: 'wrong99999' });
  await runSubmit(handlers, form);
  assert.ok(form.errorEl.textContent.includes('올바르지 않아요'));
  assert.equal(form.fields.password.value, '', '비밀번호 칸은 비워야 함');
  assert.equal(form.fields.email.value, 'a@b.co', '이메일은 유지해야 함');
  assert.equal(state.member, null);
});

test('로그인 성공: 가려던 글쓰기 화면으로 돌아간다', async () => {
  const { cm, state, handlers, loc } = makeHarness({
    responder: (p) => p === '/api/auth/login'
      ? { ok: true, status: 200, body: { uid: 'mj_x', token: 'mm1.t', member: { uid: 'mj_x', nickname: '마음', email: 'a@b.co' } } }
      : listResponder(p)
  });
  // 게이트의 '로그인' 링크: data-next 가 복귀 주소
  const gateLink = { dataset: { cm: 'login-next', next: '#/board/write' }, getAttribute: () => null };
  await runClick(handlers, gateLink);
  cm.view('account', 'login');
  const form = fakeForm('login', { email: 'a@b.co', password: 'abc12345' });
  await runSubmit(handlers, form);
  assert.equal(state.member && state.member.nickname, '마음');
  assert.ok(state.gotos.includes('#/board/write'), `복귀 주소로 가야 함: ${JSON.stringify(state.gotos)}`);
});

test('로그인 화면: 비밀번호 칸은 항상 비어 있다', () => {
  const { cm } = makeHarness();
  const html = cm.view('account', 'login');
  assert.ok(/id="cm-l-pw"[^>]*type="password"/.test(html) || /type="password"[^>]*id="cm-l-pw"/.test(html));
  assert.ok(!/id="cm-l-pw"[^>]*value=/.test(html));
});

// ---- 가짜 DOM 도우미 ----
// 모듈은 new FormData(form), form.querySelector('[name=..]'), form.querySelector('.cm-error') 만 쓴다.
function fakeForm(kind, values) {
  const fields = {};
  for (const k of Object.keys(values)) fields[k] = { name: k, value: values[k], focus() {}, removeAttribute() {}, setAttribute() {} };
  const errorEl = { textContent: '' };
  return {
    dataset: { cmForm: kind },
    fields, errorEl,
    get emailEl() { return fields.email; },
    get pwEl() { return fields.password; },
    querySelector(sel) {
      if (sel === '.cm-error') return errorEl;
      if (sel.startsWith('button')) return { disabled: false };
      const m = sel.match(/name="?([a-z0-9]+)"?/);
      return m && fields[m[1]] ? fields[m[1]] : null;
    },
    querySelectorAll() { return []; }
  };
}

async function runSubmit(handlers, form) {
  const e = { target: form, preventDefault() {} };
  for (const fn of handlers.submit || []) await fn(e);
  await tick();
}

async function runClick(handlers, el) {
  const e = { target: { closest: () => el }, preventDefault() {} };
  for (const fn of handlers.click || []) await fn(e);
  await tick();
}

'use strict';

/* 사경첩(寫經帖) 테마 가드 — 2026-11 '주사 한 색' 전환
 *
 * 이 파일이 지키는 약속은 네 가지다.
 *   ① 색은 하나 — 강조는 주사(#B71C1C) 하나뿐이고, 배경은 한지, 글은 먹이다
 *   ② 사경 — 격자 위에 앉은 글, 붓글씨 타이핑, 인장(seal) 보내기
 *   ③ 가입은 두 칸 — 이메일·비밀번호. 닉네임은 서버가 만든다
 *   ④ 리포트는 쌓인 만큼만 말한다 — 1~2장은 격려, 3장부터 결(꺾은선·낱말)
 *
 * '예쁜가'는 브라우저에서 보고 판단한다. 여기서는 리팩터링 한 번에 조용히
 * 사라지는 규칙만 잡는다. 근거: docs/design-sagyeong.md
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');

const ROOT = path.join(__dirname, '..', '..');
const read = rel => fs.readFileSync(path.join(ROOT, rel), 'utf-8');

const css = read('css/style.css');
const sagyeCss = read('css/sagye.css');
const shell = read('index.html');
const app = read('js/app.js');
const features = read('js/features.js');
const auth = read('server/auth.js');
const report = read('js/app/report.js');

function blockAfter(marker) {
  return blockIn(css, marker);
}
function blockIn(src, marker) {
  const i = src.indexOf(marker);
  assert.notEqual(i, -1, `CSS 에서 블록을 못 찾았다: ${marker}`);
  const rest = src.slice(i);
  const open = rest.indexOf('{');
  let depth = 0, end = open;
  for (let k = open; k < rest.length; k++) {
    if (rest[k] === '{') depth++;
    else if (rest[k] === '}') { depth--; if (depth === 0) { end = k; break; } }
  }
  return rest.slice(open + 1, end);
}
const LIGHT = blockAfter('/* ---------- ⑮-1 토큰');
const DARK = blockAfter(':root[data-theme=dark]{');
const token = (src, name) => {
  const m = new RegExp(name.replace(/[-]/g, '\\-') + '\\s*:\\s*([^;]+);').exec(src);
  return m ? m[1].trim().toLowerCase() : '';
};

// ---------- ① 색은 하나 ----------

test('① 주사 한 색 — 강조는 #B71C1C, 배경은 한지, 글은 먹', () => {
  assert.equal(token(LIGHT, '--pine'), '#b71c1c', '주 행동은 주사(朱砂) 하나');
  assert.equal(token(LIGHT, '--paper'), '#faf7f2', '배경은 한지색');
  assert.equal(token(LIGHT, '--ink'), '#1a1a1a', '본문 글자는 먹색');
  // 보조 두 색은 '다른 색'이 아니라 같은 붉은 계열의 어둡고 누런 쪽이다
  for (const name of ['--clay', '--gold']) {
    const hex = token(LIGHT, name);
    const [r, g, b] = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16));
    assert.ok(r > g && r > b, `${name} 은 붉은 계열이어야 함 (실제 ${hex})`);
    assert.ok(r - g < 0x90, `${name} 이 주사와 다른 색으로 튀면 안 됨 (실제 ${hex})`);
  }
  // 저조도에서도 같은 이름의 토큰이 살아 있어야 한다 (값은 밝아진다)
  assert.ok(token(DARK, '--pine').length === 7, '저조도 주사 토큰');
});

test('① 테마 표기(manifest·meta·PWA)가 한지색으로 함께 움직인다', () => {
  const manifest = JSON.parse(read('manifest.webmanifest'));
  assert.equal(manifest.theme_color.toUpperCase(), '#FAF7F2');
  assert.equal(manifest.background_color.toUpperCase(), '#FAF7F2');
  assert.match(shell, /<meta name="theme-color" content="#FAF7F2"/);
  assert.match(app, /const THEME_BAR = \{ light: '#FAF7F2', dark: '#14100F' \}/);
  // 옛 팔레트(한지 #f6f1e7 · 소나무 #33604a)가 화면 코드에 남아 있으면 안 된다
  assert.equal(/f6f1e7|33604a/i.test(css + shell + app + features), false, '옛 팔레트 잔재');
});

// ---------- ② 사경 ----------

test('② 사경 격자 — 32px 주사 모눈을 배경에만 깐다', () => {
  assert.match(sagyeCss, /⑰ 사경첩\(寫經帖\)/);
  const sagye = blockIn(sagyeCss, '.sagye{');
  assert.match(sagye, /--sagye-cell:32px/, '모눈 한 칸 32px');
  const paper = blockIn(sagyeCss, '.sagye-paper{');
  assert.match(paper, /linear-gradient\(90deg,rgba\(var\(--pine-rgb\)/, '세로 사경선');
  assert.match(paper, /linear-gradient\(0deg,rgba\(var\(--pine-rgb\)/, '가로 사경선');
  assert.match(paper, /calc\(var\(--sagye-cell\) \* 4\)/, '네 칸마다 조금 진한 선');
  // 격자는 배경에만 — 글자 앞에 얹는 의사요소로 쓰지 않는다
  assert.equal(/\.sagye-a\{\{?[^}]*background-image/.test(sagyeCss), false, '본문 위에 격자를 덮지 않는다');
  // 첫 화면 예산 때문에 이 조각은 지연 자산이다 — 로더 표에 있어야 실제로 도착한다
  assert.match(read('js/lib/loader.js'), /sagye: \{[\s\S]*?css: \['css\/sagye\.css'\][\s\S]*?js: \['js\/app\/report\.js'\]/);
  assert.match(read('js/lib/loader.js'), /report: \['sagye'\]/, '#/report 는 사경 자산을 먼저 받는다');
  assert.match(features, /MJ_LOADER\.ensure\(\['sagye'\]\)/, '상담 시트를 열 때 사경 조각을 요청');
});

test('② 붓글씨 타이핑 — 한 글자씩, 움직임을 줄인 사용자에게는 즉시', () => {
  assert.match(features, /function typeInto\(/, '타이핑은 한 곳에서');
  assert.match(features, /matchMedia\('\(prefers-reduced-motion: reduce\)'\)/);
  assert.match(features, /el\.textContent = full\.slice\(0, i\)/, '한 글자씩 앉는다');
  assert.match(sagyeCss, /\.sagye-typing::after\{[^}]*animation:sagye-caret/, '붓끝 커서');
  assert.match(sagyeCss, /@media \(prefers-reduced-motion:reduce\)\{[\s\S]*?\.sagye-typing::after\{animation:none/, '축소 설정에서 커서 정지');
});

test('② 인장(seal) 보내기 — 엄지 존에 붙은 48px 이상 버튼', () => {
  const seal = blockIn(sagyeCss, '.seal-send{');
  assert.match(seal, /width:72px/, '도장은 72px — 손끝보다 넉넉하게');
  assert.match(seal, /background:var\(--pine\)/, '주사로 찍는다');
  assert.match(seal, /color:var\(--on-pine\)/, '글자는 종이색(파낸 자국)');
  const foot = blockIn(sagyeCss, '.sagye-foot{');
  assert.match(foot, /position:sticky/, '시트 안에서 하단 고정');
  assert.match(foot, /bottom:0/);
  assert.match(foot, /var\(--safe-b\)/, '홈 인디케이터를 침범하지 않는다');
  assert.match(features, /aria-label="상담 보내기"/);
  // 입력은 내용만큼 자라고, Clear(×)가 붙는다
  assert.match(features, /function autoGrow\(/);
  assert.match(features, /class="sagye-clear"/);
  assert.match(features, /'입력한 내용 지우기'|"입력한 내용 지우기"/);
});

// ---------- ③ 가입은 두 칸 ----------

test('③ 가입 폼은 이메일·비밀번호 두 칸 — 확인 칸 대신 보기 토글', () => {
  for (const [file, src] of [['js/app.js', app], ['js/app/community.js', read('js/app/community.js')]]) {
    assert.equal(/name="password2"/.test(src), false, `${file}: 비밀번호 확인 칸은 없앴다`);
    assert.match(src, /class="pw-toggle"/, `${file}: 확인 대신 보기 토글`);
  }
  // 셸의 가입 폼(모듈 없이 열리는 안전판)도 닉네임을 묻지 않는다
  const fallbackForm = app.slice(app.indexOf('function authFallbackView'), app.indexOf('function communityRetryView'));
  assert.equal(/name="nickname"/.test(fallbackForm), false, '안전판 가입 폼은 두 칸');
  assert.match(fallbackForm, /이메일과 비밀번호만 있으면 돼요/);
});

test('③ 서버는 닉네임 없이도 가입을 받는다 — 이메일 앞부분으로 만든다', async () => {
  assert.match(auth, /function nicknameSeed\(/, '이메일 → 닉네임 씨앗');
  assert.match(auth, /function freeNickname\(/, '겹치면 숫자를 붙인다');
  assert.match(auth, /if \(!nickname\) \{/, '닉네임이 비면 서버가 채운다');

  const { createApp } = require('../app');
  const server = http.createServer(createApp({ now: () => Date.UTC(2026, 10, 5), dbPath: ':memory:' }));
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${server.address().port}`;
  const post = (p, body) => fetch(base + p, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body)
  }).then(async r => ({ status: r.status, body: await r.json().catch(() => null) }));

  try {
    const first = await post('/api/auth/signup', { email: 'sagye.writer@example.com', password: 'abcd1234' });
    assert.equal(first.status, 201, JSON.stringify(first.body));
    assert.equal(first.body.member.nickname, 'sagyewrite', '이메일 앞부분(10자까지)에서 만든다');
    assert.ok(first.body.token, '가입 즉시 로그인');

    // 같은 앞부분으로 또 가입해도 겹치지 않는다
    const second = await post('/api/auth/signup', { email: 'sagye.writer2@example.com', password: 'abcd1234' });
    assert.equal(second.status, 201, JSON.stringify(second.body));
    assert.match(second.body.member.nickname, /^sagyewrite\d+$/, '겹치면 숫자를 붙인다');

    // 직접 적은 닉네임은 그대로 존중하고, 검증도 그대로다
    const named = await post('/api/auth/signup', { email: 'named@example.com', password: 'abcd1234', nickname: '수련' });
    assert.equal(named.body.member.nickname, '수련');
    const bad = await post('/api/auth/signup', { email: 'bad@example.com', password: 'abcd1234', nickname: '수' });
    assert.equal(bad.status, 400);
    assert.equal(bad.body.field, 'nickname');
  } finally {
    await new Promise(r => server.close(r));
  }
});

test('③ 부트 카드 — 정상 부팅에는 보이지 않고, 실패했을 때만 길을 준다', () => {
  // 인라인 CSS 는 일부러 css/style.css 를 부르지 않는다 (깨진 배포에서도 자리를 지킨다)
  const head = shell.slice(0, shell.indexOf('</head>'));
  assert.match(head, /부트 셸 \(SCR-AUTH-001\)/);
  assert.match(head, /#boot\{position:fixed/, '스타일시트 장애와 무관한 인라인 규칙');

  // 2026-11: 전체 화면 로딩 스플래시는 없앴다 — 실기기에서 몇 초씩 붙잡고 있었다
  assert.match(shell, /<div id="boot"[^>]*hidden/, '카드는 hidden 으로 시작한다');
  assert.match(head, /#boot\[hidden\]\{display:none\}/, 'hidden 이면 한 프레임도 그리지 않는다');
  assert.equal(/정돈하고 있습니다/.test(shell), false, '기다리라는 스플래시 문구는 없다');
  assert.equal(/boot-skel/.test(shell), false, '스켈레톤으로 자리를 채우지 않는다');
  assert.equal(/is-slow/.test(shell), false, '"오래 걸린다"는 안내도 두지 않는다');
  assert.match(shell, /화면을 열지 못했어요/, '실패했을 때의 문구');

  // 실패 판정: 6초 안에 첫 화면이 안 그려졌을 때만 연다
  assert.match(shell, /setTimeout\(function \(\) \{ if \(!appReady\(\)\) show\(\); \}, 6000\)/);
  assert.match(shell, /function show\(\) \{\n    if \(done\) return;\n    boot\.hidden = false;/);
  assert.match(shell, /data-boot="reload"/);
  assert.match(shell, /data-boot="cache"/);
  assert.match(shell, /data-boot="guest"/);
  assert.match(shell, /navigator\.onLine === false/, '네트워크 점검 안내');
  assert.match(shell, /caches\.delete/, '캐시 초기화 — 순례 기록은 건드리지 않는다');
  assert.match(shell, /window\.MJ_BOOT = \{ hide: hide, show: show/, '앱이 그려지면 걷어 낸다');
  assert.match(app, /window\.MJ_BOOT\.hide\(\)/, '첫 화면을 그린 뒤 부트 카드 제거');
  // 그 사이 '준비 중'은 본문 안의 가벼운 스켈레톤이 맡는다 (전체 화면을 덮지 않는다)
  assert.match(shell, /class="boot-splash"/);
});

// ---------- ④ 리포트 ----------

test('④ 상담 기록은 이 기기에만 남고, 60장에서 멈춘다', () => {
  // 기록 저장소는 지연 모듈(report.js)이 들고, 앱 셸은 읽고 쓰는 문만 연다 (첫 화면 예산)
  assert.match(report, /root\.MJ_COUNSEL = \{ add: add, list: list, health: health, reset: reset \}/);
  assert.match(app, /window\.MJ_STORE = \{/, '앱 셸의 저장소 문');
  assert.match(app, /counsel: \[\]/, '기본 상태에 사경 기록');
  assert.match(report, /const COUNSEL_MAX = \d+/);
  assert.match(report, /\.slice\(-COUNSEL_MAX\)/);
  // 서버로 보내지 않는다 — add 주변에 api()/fetch() 가 있으면 안 된다
  const add = report.slice(report.indexOf('function add(rec)'), report.indexOf('function reset()'));
  assert.equal(/api\(|fetch\(/.test(add), false, '상담 기록은 기기 밖으로 나가지 않는다');
  assert.match(report, /서버로 보내지 않아요/);
  // 시트가 먼저 열려 모듈이 늦으면 큐에 넣었다가 모듈이 비운다
  assert.match(features, /MJ_COUNSEL_QUEUE/, '기록 유실 방지 큐');
  assert.match(report, /function drainQueue\(/, '도착하면 큐를 비운다');
});

test('④ 상태1(1~2장)은 격려 한 장, 상태2(3장~)부터 결을 보여 준다', () => {
  const block = report.slice(report.indexOf('function counsel('), report.length);
  assert.match(report, /function emptyCard\(/, '0장: 문을 여는 안내');
  assert.match(report, /function seedCard\(/, '1~2장: 마음 씨앗 (차트를 만들지 않는다)');
  assert.match(report, /function fullReport\(/, '3장부터 결');
  assert.match(block, /hasEnoughData/, '상태를 플래그로 가른다');
  assert.match(report, /sagyeGrad/, '주사 그라데이션');
  assert.match(report, /class="tag-cloud"/);
  assert.match(report, /회<\/span>/, '낱말마다 횟수 (#불안 3회)');
  assert.match(report, /data-act="print"/, 'PDF 내보내기');
  assert.match(app, /head \+ counselSection\(\)/, '리포트 화면에 사경 블록이 붙는다');
  assert.match(app, /window\.MJ_REPORT\.counsel/, '지연 모듈이 그린다');
  assert.match(app, /마음 사경 리포트를 불러오지 못했어요/, '모듈이 없으면 다음 행동을 준다');
  // 그래프 좌표는 화면 없이도 검산할 수 있게 순수 함수로 둔다
  assert.match(report, /function trendPoints\(/);
  assert.match(sagyeCss, /\.tag-cloud\{[^}]*repeat\(auto-fill,minmax/, '낱말은 유연한 격자');
});

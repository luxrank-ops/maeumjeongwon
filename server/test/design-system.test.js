'use strict';

/* 디자인 시스템 v3.1 — 시맨틱 토큰 · 저조도 모드 · 탐색 검색 · 홈 순서 개인화 가드.
 *
 * 이 파일이 지키는 것은 '예쁨'이 아니라 '약속'이다.
 *   · 컴포넌트는 색을 직접 고르지 않는다 (팔레트 이름을 부르지 않는다)
 *   · 테마는 한 곳(팔레트 ①)만 갈아 끼운다 — 두 팔레트가 어긋나면 그 자리에서 실패한다
 *   · 검색은 탭 하나에 숨지 않는다
 * 리팩터링하다 이 규칙이 조용히 무너지는 것을 막는다. ( docs/design-refresh.md 5절 ) */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..', '..');
const css = fs.readFileSync(path.join(ROOT, 'css', 'style.css'), 'utf-8');
const shellHtml = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf-8');
const { readAppSources } = require('./_sources');
const appSource = readAppSources();

// @media 안까지 보려면 '블록 전체'를 잘라야 한다 — 토큰 블록은 파일에서 직접 찾는다.
function blockAfter(marker, upto) {
  const i = css.indexOf(marker);
  assert.notEqual(i, -1, `CSS 에서 블록을 못 찾았다: ${marker}`);
  const rest = css.slice(i);
  const open = rest.indexOf('{');
  let depth = 0, end = open;
  for (let k = open; k < rest.length; k++) {
    if (rest[k] === '{') depth++;
    else if (rest[k] === '}') { depth--; if (depth === 0) { end = k; break; } }
  }
  return rest.slice(open + 1, end);
}
function tokensIn(src) {
  const out = [];
  for (const m of src.matchAll(/(--[a-z0-9-]+)\s*:/g)) out.push(m[1]);
  return [...new Set(out)];
}

const LIGHT_PALETTE = blockAfter('/* ---------- ⑮-1 토큰');
const SEMANTIC = blockAfter('/* ② 시맨틱');
const DARK = blockAfter(':root[data-theme=dark]{');

// 테마와 무관한 토큰 — 팔레트가 아니라 구조·움직임·글꼴이다. 두 팔레트가 같을 필요가 없다.
const STRUCTURAL = ['--r', '--r-sm', '--r-lg', '--s1', '--s2', '--s3', '--s4', '--s5', '--s6',
  '--topbar-h', '--ease', '--dur-1', '--dur-2', '--dur-3', '--font-ui', '--font-display', '--track'];

test('1. 시맨틱 토큰(면·글자·선)이 한 블록에 정의되어 있다', () => {
  for (const t of ['--surface-0', '--surface-1', '--surface-2', '--surface-3', '--surface-sunken',
    '--text-1', '--text-2', '--text-3', '--border-1', '--border-2']) {
    assert.ok(SEMANTIC.includes(`${t}:`), `시맨틱 토큰 정의: ${t}`);
  }
  // 시맨틱은 '팔레트를 가리키는' 겹이어야 한다 — 색값을 직접 들고 있으면 테마가 안 따라온다
  for (const line of SEMANTIC.split('\n')) {
    const m = /(--[a-z0-9-]+)\s*:\s*([^;]+);/.exec(line);
    if (!m) continue;
    assert.match(m[2].trim(), /^var\(--/, `시맨틱 토큰 ${m[1]} 은 팔레트를 가리켜야 함 (실제: ${m[2].trim()})`);
  }
});

test('2. 컴포넌트는 팔레트 이름을 직접 부르지 않는다 (시맨틱만 부른다)', () => {
  // 토큰 '정의' 블록은 제외하고, 컴포넌트 규칙만 훑는다
  const body = css.replace(LIGHT_PALETTE, '').replace(SEMANTIC, '').replace(DARK, '');
  for (const name of ['--paper', '--paper-2', '--card', '--ink', '--ink-2', '--sub', '--line', '--line-2', '--bg']) {
    assert.equal(body.includes(`var(${name})`), false,
      `컴포넌트가 팔레트를 직접 부른다: var(${name}) — 시맨틱 토큰(--surface-*/--text-*/--border-*)으로 바꾸세요`);
  }
});

test('3. 저조도(다크) 팔레트가 같은 토큰 목록을 채운다 — 하나라도 빠지면 그 자리에서 실패', () => {
  const light = tokensIn(LIGHT_PALETTE).filter(t => !STRUCTURAL.includes(t));
  const dark = tokensIn(DARK);
  const missing = light.filter(t => !dark.includes(t));
  assert.deepEqual(missing, [], `저조도 팔레트에 없는 토큰: ${missing.join(', ')}`);
  const extra = dark.filter(t => !light.includes(t) && !['--elev-1', '--elev-2', '--ring'].includes(t));
  assert.deepEqual(extra, [], `낮 팔레트에는 없는 토큰이 저조도에만 있다: ${extra.join(', ')}`);
  // 강조색 위 글자는 '흰색 고정'이 아니라 토큰이어야 한다 — 저조도에서는 뒤집혀야 하므로
  for (const t of ['--on-pine', '--on-clay', '--on-gold']) {
    assert.ok(dark.includes(t), `${t} 가 저조도에서 뒤집혀야 함`);
  }
  assert.match(DARK, /color-scheme:dark/, '저조도에서는 폼 컨트롤·스크롤바도 어두워져야 한다');
});

test('4. 테마는 <html data-theme> 하나로 정한다 (media query 중복 정의 없음)', () => {
  assert.match(css, /:root\[data-theme=dark\]\{/);
  // prefers-color-scheme 으로 팔레트를 또 정의하면 '사용자가 고른 것'과 '시스템'이 싸운다
  assert.equal(/@media \(prefers-color-scheme[^{]*\{\s*:root/.test(css), false,
    'prefers-color-scheme 으로 팔레트를 다시 정의하지 않는다 — JS 가 data-theme 하나로 확정한다');
});

test('5. 첫 페인트 전에 테마를 정한다 — 흰색 번쩍임(FOUC) 방지', () => {
  const head = shellHtml.slice(0, shellHtml.indexOf('</head>'));
  assert.match(head, /data-theme/, 'index.html 의 <head> 안에서 data-theme 를 정해야 함');
  assert.match(head, /maeumjeongwon\.theme\.v1/, '테마 값을 읽는 키가 <head> 스크립트와 같아야 함');
  assert.ok(shellHtml.indexOf('data-theme') < shellHtml.indexOf('<body'),
    '테마 확정 스크립트는 본문이 그려지기 전(<body> 앞)에 있어야 함');
  // 상단 토글 · 달 아이콘 · 어두운 상태바 색이 함께 있어야 한다
  assert.match(shellHtml, /id="themeToggle"/);
  assert.match(shellHtml, /id="i-moon"/);
  assert.match(shellHtml, /<meta name="theme-color" content="#[0-9a-f]{6}" media="\(prefers-color-scheme: dark\)"/);
  assert.match(shellHtml, /<meta name="color-scheme" content="light dark"/);
});

test('6. 남은 하드코딩 색은 인쇄용과 외부 브랜드 버튼뿐이다', () => {
  const body = css.replace(LIGHT_PALETTE, '').replace(DARK, '');
  // @media print 블록과 길찾기 브랜드 버튼(카카오·네이버·티맵·구글)은 색을 바꾸면 안 된다
  const allowed = [];
  const print = body.slice(body.indexOf('@media print{'));
  allowed.push(print.slice(0, print.indexOf('\n}') + 2));
  for (const m of body.matchAll(/\.nav-btn\.(kakao|naver|tmap|google)\{[^}]*\}/g)) allowed.push(m[0]);
  let scan = body;
  for (const a of allowed) scan = scan.replace(a, '');
  const left = [...scan.matchAll(/(background|color|border[a-z-]*|box-shadow)\s*:\s*[^;{}]*#[0-9a-fA-F]{3,8}[^;}]*/g)];
  assert.deepEqual(left.map(m => m[0].slice(0, 60)), [],
    '테마가 바뀌면 따라오지 못하는 색값이 남아 있다 — 토큰으로 옮기세요');
});

test('7. 탐색의 검색은 탭 위에 항상 있고, 검색어는 주소의 마지막 칸에 담긴다', () => {
  assert.match(appSource, /id="eq"/, '탐색 상시 검색칸');
  assert.match(appSource, /id="eres"/, '검색 결과만 다시 그리는 칸');
  assert.match(appSource, /function exploreBody/);
  assert.match(appSource, /viewExplore\(a, b, c\)/, '라우터가 검색어(세 번째 칸)까지 넘겨야 함');
  assert.match(appSource, /replaceState/, '입력마다 주소를 밀어넣지 않고 갈아치워야 함');
  assert.equal(/id="tq"/.test(appSource), false, '전통사찰 탭에만 있던 별도 검색칸(#tq)은 정리되어야 함');
  // 검색어를 주소에서 읽는 규칙이 한 곳에 있어야 한다 (탭마다 해석이 갈리면 주소가 깨진다)
  assert.match(appSource, /function exploreQueryOf/);
  // 못 찾았을 때 '끝'이라고 말하지 않고 991곳으로 넘어가는 길을 준다
  assert.match(appSource, /function tradHint/);
});

test('8. 홈 순서 개인화는 내가 남긴 기록만 센다 — 데모 표본은 제외', () => {
  // 표본 기록에 표지를 붙이지 않으면 '처음 열자마자 14건'이 되어 개인화가 의미를 잃는다
  assert.match(appSource, /sample: true/, '표본 기록에 sample 표지');
  assert.match(appSource, /filter\(x => !x\.sample\)/, '내가 남긴 것만 센다');
  assert.match(appSource, /ownRecords >= 3/, '기준은 3건');
  assert.match(appSource, /data-home-order=/, '순서를 화면(CSS·분석)에서도 읽을 수 있게 태깅');
  // 처음 온 사용자에게는 마음 추천을 먼저, 기록이 쌓인 사용자에게는 다음 순례를 먼저 보여 준다.
  assert.match(appSource, /returning \? pilgrimCard \+ moodCard : moodCard/);
  assert.match(appSource, /returning \? '' : pilgrimCard/);
  // 선택 온보딩과 분석 동의는 핵심 추천 이후에 나와 첫 행동을 막지 않는다.
  assert.match(appSource, /\$\{returning \? pilgrimCard \+ moodCard : moodCard\}\s*\$\{onboard\}\s*\$\{returning \? '' : pilgrimCard\}\s*\$\{consentCard\(\)\}/);
});

test('9. 저조도에서만 손대는 예외는 한 블록에 모아 둔다', () => {
  assert.match(css, /⑮-1e 저조도에서만 손대는 예외/);
  // 지도는 우리 CSS 가 아니다(leaflet) — 하얀 팝업·타일을 그대로 두면 어두운 화면에서 눈부시다
  assert.match(css, /:root\[data-theme=dark\] \.leaflet-popup-content-wrapper/);
  assert.match(css, /:root\[data-theme=dark\] \.leaflet-tile-pane/);
  // 도감의 '아직' 칸은 밝혀서 지우는 방식이라 어두운 화면에서 반대로 뒤집어야 한다
  assert.match(css, /:root\[data-theme=dark\] \.dex \.cell\.sil \.s/);
});

test('10. 앱 셸과 PWA 표기는 같은 절로가 브랜드를 쓴다', () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'manifest.webmanifest'), 'utf8'));
  const metadata = JSON.parse(fs.readFileSync(path.join(ROOT, 'metadata.json'), 'utf8'));
  const brand = '절로가 — 마음 따라 걷는 사찰 순례';
  assert.equal(manifest.name, brand);
  assert.equal(manifest.short_name, '절로가');
  assert.equal(metadata.name, brand);
  assert.match(shellHtml, new RegExp(`<title>${brand}</title>`));
  assert.match(shellHtml, /<meta name="apple-mobile-web-app-title" content="절로가"/);
  assert.doesNotMatch(`${shellHtml} ${manifest.name} ${metadata.name}`, /마음정사|마음정원사|절로가자~춘학아~/);
});

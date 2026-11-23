'use strict';

/* 2026-11-24 내비게이션 개편 가드.
 *
 * 사용자 지적: 좁은 화면에서 '계획·상점·게시판'이 숨고, '풍수·도감·리포트'는 깊은 곳에 묻혀
 * 찾기 어렵다. 그래서 ① 하단 다섯 칸 + 전체메뉴(≡) ② 비슷한 화면은 상단 전환 탭으로 묶기
 * ③ 홈 맨 위에 핵심 바로가기 네 칸 — 세 가지를 넣었다.
 *
 * 여기서 지키는 약속:
 *   · 하단 바의 모바일 노출은 정확히 다섯 칸(홈·사찰찾기·순례·수첩·전체메뉴)이다
 *   · 전체메뉴 시트는 열한 화면을 모두 1탭으로 연다 (주소는 기존 해시 그대로)
 *   · 데스크톱 레일은 rail-only 항목까지 계속 보인다 (좁은 화면에서 숨긴 것이 넓은 화면에서도 사라지면 회귀)
 *   · 수첩·계획·리포트, 탐색·지도·풍수에는 같은 전환 탭이 붙는다
 *   · 홈 첫 화면의 네 버튼은 explore·map·missions·journal 로만 간다
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..', '..');
const read = rel => fs.readFileSync(path.join(ROOT, rel), 'utf-8');

const shell = read('index.html');
const app = read('js/app.js');
const planner = read('js/app/planner.js');
const css = read('css/style.css');

const ROUTES = ['#/explore', '#/map', '#/fengshui', '#/missions', '#/dex', '#/journal',
  '#/planner', '#/report', '#/board', '#/store', '#/plus'];

function tabbarBlock() {
  const i = shell.indexOf('<nav class="tabbar"');
  assert.notEqual(i, -1, '하단 내비가 있어야 한다');
  return shell.slice(i, shell.indexOf('</nav>', i));
}

test('① 모바일 하단 바는 다섯 칸 — 홈·사찰찾기·순례·수첩·전체메뉴', () => {
  const nav = tabbarBlock();
  const anchors = [...nav.matchAll(/<a href="([^"]+)"([^>]*)>/g)]
    .filter(m => !/rail-only/.test(m[2]))
    .map(m => m[1]);
  assert.deepEqual(anchors, ['#/home', '#/explore', '#/missions', '#/journal'],
    '모바일에서 늘 보이는 링크는 네 개다');
  assert.match(nav, /<button type="button" class="tab-more" id="tabMore" data-act="open-menu"/,
    '다섯째 칸은 전체메뉴 버튼');
  assert.match(nav, /aria-controls="menuSheet"/, '버튼은 여는 시트를 가리킨다');
  assert.match(nav, /aria-expanded="false"/, '처음에는 닫힌 상태');
  // 좁은 화면에서 숨긴 화면은 레일에서는 계속 보인다
  for (const route of ['#/map', '#/planner', '#/store', '#/board', '#/plus']) {
    assert.match(nav, new RegExp(`<a href="${route}"[^>]*class="rail-only"`), `레일 항목 유지: ${route}`);
  }
});

test('② 전체메뉴 시트는 열한 화면을 1탭으로 연다 (주소는 그대로)', () => {
  const block = app.slice(app.indexOf('const MENU_ITEMS'), app.indexOf('function menuSheetHTML'));
  for (const route of ROUTES) {
    assert.ok(block.includes(`href: '${route}'`), `시트에 없음: ${route}`);
  }
  // 항목마다 한 줄 설명이 붙는다 — '무엇을 하는 화면인지' 모르는 이름만 늘어놓지 않는다
  const descCount = (block.match(/desc: '/g) || []).length;
  assert.equal(descCount, ROUTES.length, '항목 수와 설명 수가 같다');
  // 시트는 기존 모달(하단 시트)을 그대로 쓰고, 해시 이동이 시트를 닫는다
  assert.match(app, /function openMenuSheet\(\) \{\s*openModal\(menuSheetHTML\(\)\)/);
  assert.match(app, /window\.addEventListener\('hashchange', \(\) => \{ clearInterval\(openAd\._t\); closeModal\(\); navigate\(\); \}\)/,
    '해시가 바뀌면 시트가 닫힌다');
  assert.match(app, /act === 'open-menu'/, '버튼의 처리기');
});

test('③ 전환 탭 — 탐색·지도·풍수 / 수첩·계획·리포트가 같은 줄에 선다', () => {
  const hub = app.slice(app.indexOf('const HUB_GROUPS'), app.indexOf('function hubSwitch'));
  for (const route of ['#/explore', '#/map', '#/fengshui', '#/journal', '#/planner', '#/report']) {
    assert.ok(hub.includes(`href: '${route}'`), `전환 탭에 없음: ${route}`);
  }
  assert.match(app, /viewExplore[\s\S]{0,2000}hubSwitch\('find', '#\/explore'\)/, '탐색 화면');
  assert.match(app, /hubSwitch\('find', '#\/map'\)/, '지도 화면');
  assert.match(app, /hubSwitch\('find', '#\/fengshui'\)/, '풍수 화면');
  assert.match(app, /hubSwitch\('record', '#\/journal'\)/, '수첩 화면');
  assert.match(app, /hubSwitch\('record', '#\/report'\)/, '리포트 화면');
  assert.match(planner, /hubSwitch\('record', '#\/planner'\)/, '계획 화면');
  // 같은 화면이 두 칸에 걸치면 둘 다 켜 둔다 (지도 = 사찰찾기 흐름 + 지도)
  assert.match(app, /map: \['explore', 'map'\]/);
  // 리포트는 이제 '수첩' 묶음이다 (예전에는 순례 탭이 켜졌다)
  assert.match(app, /case 'report': html = viewReport\(\); tab = 'journal'/);
});

test('④ 홈 첫 화면의 바로가기 네 칸은 네 주소로만 간다', () => {
  const home = app.slice(app.indexOf('function viewHome()'), app.indexOf('function greetPart()'));
  const shortcuts = home.slice(home.indexOf('class="feat-grid home-shortcuts"'), home.indexOf('</nav>', home.indexOf('class="feat-grid home-shortcuts"')));
  const hrefs = [...shortcuts.matchAll(/<a class="feat" href="([^"]+)"/g)].map(m => m[1]);
  assert.deepEqual(hrefs, ['#/explore', '#/map', '#/missions', '#/journal']);
  // 히어로 바로 다음이 바로가기 — 접기 전(above the fold)에 보이는 자리
  assert.match(home, /\$\{ticker\}\s*\$\{mainTitleHero\}\s*\$\{featTiles\}/);
});

test('⑥ 언어 전환 — 탭 라벨을 순서가 아니라 주소로 갱신한다', () => {
  // features.js 의 I18N.apply 가 탭을 '몇 번째'로 찾으면, 하단 바 구성이 바뀔 때 라벨이 어긋난다
  // (2026-11-24 실제로 사찰찾기 자리에 '탐색', 순례 자리에 '지도'가 붙었다).
  const features = read('js/features.js');
  const apply = features.slice(features.indexOf('apply: function ()'), features.indexOf('// 8. 오디오 도즔트'));
  assert.match(apply, /TAB_KEYS/, '주소 → 사전 키 표로 고른다');
  assert.match(apply, /getAttribute\('href'\)/, '항목의 href 로 키를 찾는다');
  assert.doesNotMatch(apply, /labels\[idx\]/, '순서(index)로 라벨을 덮어쓰지 않는다');
  for (const key of ['nav_planner', 'nav_store', 'nav_board', 'nav_plus', 'nav_more']) {
    assert.ok(features.includes(`${key}: '`), `사전 키가 한국어·영어 두 벌 모두 필요: ${key}`);
  }
  // 전체메뉴는 링크가 아니라 버튼이라 별도로 라벨을 맞춘다
  assert.match(apply, /tab-more \.tab-label/);
});

test('⑤ CSS — 전체메뉴 버튼은 탭 링크와 같은 모양을 쓰고, 데스크톱 레일에서도 선다', () => {
  // 링크와 버튼이 같은 규칙을 공유한다(모양이 갈라지면 하단 바가 어긋나 보인다)
  assert.match(css, /\.tabbar a,\.tabbar \.tab-more\{position:relative;flex:1;/);
  assert.ok(css.includes('.tabbar a,.tabbar .tab-more{flex:0 0 auto;flex-direction:row;'),
    '데스크톱 레일에서는 한 줄 항목으로');
  // 첫 화면 CSS 예산 — 새 UI 는 이 안에서만 늘린다
  assert.ok(css.length < 112000, `style.css ${css.length}자`);
});

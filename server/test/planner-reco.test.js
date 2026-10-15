'use strict';

// '새 사찰 여행 계획 짜기'의 추천 계획(search → 추천 코스) 기능 검사.
// 엔진은 DOM을 쓰지 않으므로 vm으로 데이터 파일과 함께 그대로 실행해 검증한다.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.join(__dirname, '..', '..');
const { readAppSources } = require('./_sources');
const appSource = readAppSources();   // 추천 화면은 js/app/planner.js 로 분리 — 셸+모듈을 함께 본다
const indexHtml = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');

function loadReco() {
  const window = {};
  const context = { window };
  vm.createContext(context);
  for (const file of ['js/data-temples.js', 'js/data-prayer.js', 'js/planner-reco.js']) {
    const full = path.join(ROOT, file);
    vm.runInContext(fs.readFileSync(full, 'utf8'), context, { filename: full });
  }
  return window;
}

const DATA = loadReco();
const RECO = DATA.PLANNER_RECO;

function recommend(extra) {
  return RECO.recommend(Object.assign({ temples: DATA.TEMPLES, themes: DATA.THEMES }, extra || {}));
}

test('1. 추천 엔진은 기간에 맞는 사찰 수로 코스를 만든다', () => {
  const half = recommend({ days: '반나절·당일', transport: '자가용', companion: '혼자 조용히' });
  assert.equal(half.ok, true);
  assert.equal(half.stops.length, 2);

  const day = recommend({ days: '당일치기', transport: '자가용', companion: '혼자 조용히' });
  assert.equal(day.stops.length, RECO.COUNT_BY_DAYS['당일치기']);

  const long = recommend({ days: '3박 4일 이상', transport: '자가용', companion: '불자·순례 모임' });
  assert.ok(long.stops.length <= 5, '너무 많은 사찰을 한 번에 담지 않는다');
  assert.ok(long.stops.length >= 4);
});

test('2. 지역을 고르면 그 지역 사찰로만 코스를 만든다', () => {
  const r = recommend({ sido: '전남', days: '1박 2일', transport: '자가용', companion: '연인·친구와' });
  assert.ok(r.stops.length >= 2);
  for (const id of r.stops) {
    const t = DATA.TEMPLES.find(x => x.id === id);
    assert.ok(t, `존재하는 사찰: ${id}`);
    assert.equal(t.sido, '전남');
  }
  assert.equal(new Set(r.stops).size, r.stops.length, '같은 사찰이 두 번 들어가지 않는다');
});

test('3. 테마를 고르면 그 테마 사찰을 우선 담는다', () => {
  const pool = DATA.TEMPLES.filter(t => t.themes.includes('sea'));
  assert.ok(pool.length >= 3, '바다뷰 테마 사찰이 충분히 있음');
  const r = recommend({ theme: 'sea', days: '당일치기', transport: '자가용', companion: '연인·친구와' });
  assert.equal(r.stops.length, 3);
  for (const id of r.stops) {
    const t = DATA.TEMPLES.find(x => x.id === id);
    assert.ok(t.themes.includes('sea'), `바다뷰 테마 사찰: ${t.name}`);
  }
  assert.match(r.title, /바다뷰/);
});

test('4. 조건에 맞는 사찰이 적은 지역은 솔직하게 알리고 코스를 줄인다', () => {
  const r = recommend({ sido: '제주', days: '2박 3일', transport: '자가용', companion: '혼자 조용히' });
  const pool = DATA.TEMPLES.filter(t => t.sido === '제주');
  assert.equal(r.stops.length, pool.length);
  assert.ok(r.notices.length >= 1, '사찰이 적다는 안내를 함께 보여 준다');
  assert.match(r.notices.join(' '), /사찰이|주요 사찰/);
});

test('5. 같은 조건·같은 seed는 같은 코스, 다른 seed나 제외 목록은 다른 코스를 만든다', () => {
  const cond = { days: '당일치기', transport: '자가용', companion: '혼자 조용히' };
  const a = recommend(Object.assign({ seed: 0 }, cond));
  const b = recommend(Object.assign({ seed: 0 }, cond));
  assert.deepEqual(a.stops, b.stops, '같은 조건이면 결과가 흔들리지 않는다');

  // '다른 코스 추천'은 앞서 보여 준 사찰을 피해 새 코스를 만든다
  const c = recommend(Object.assign({ seed: 1, avoidIds: a.stops }, cond));
  assert.notDeepEqual(c.stops, a.stops);
  assert.equal(c.stops.some(id => a.stops.includes(id)), false);
});

test('6. 일정표(메모)는 사찰·이동·시간대를 담고, 기간이 나뉘면 일차도 표시한다', () => {
  const est = () => ({ straightKm: 10, roadKm: 13, driveMin: 42 });
  const r = recommend({ sido: '경북', days: '1박 2일', transport: '자가용', companion: '가족·부모님과', seed: 0, estimate: est });
  for (const id of r.stops) {
    const t = DATA.TEMPLES.find(x => x.id === id);
    assert.ok(r.memo.includes(t.name), `일정표에 사찰 이름 포함: ${t.name}`);
  }
  assert.match(r.memo, /1일차/);
  assert.match(r.memo, /2일차/);
  assert.match(r.memo, /\d{2}:\d{2} — /, '시간대별 표기');
  assert.match(r.memo, /약 42분/, '넘겨받은 이동 추정을 그대로 사용');
});

test('7. 추천 이유·주의 문구·미션 안내를 함께 돌려준다', () => {
  const r = recommend({ sido: '전남', theme: 'autumn', days: '1박 2일', transport: '자가용', companion: '연인·친구와', seed: 0 });
  for (const id of r.stops) {
    const tags = r.reasons[id];
    assert.ok(Array.isArray(tags) && tags.length >= 1, `추천 이유가 있다: ${id}`);
    assert.ok(tags.some(x => /아직 못 가본 곳/.test(x.text)));
  }
  assert.ok(r.cautions.some(c => /예상치|확인하세요/.test(c)));

  const prayer = recommend({ theme: 'prayer', days: '당일치기', transport: '자가용', companion: '기도처 중심 일정', seed: 0 });
  assert.ok(prayer.cautions.some(c => /효험을 약속하지 않아요/.test(c)), '기도 테마에는 한계 문구를 함께 안내');
});

test('8. 이미 가본 사찰은 추천 이유에서 아직 못 가본 곳으로 표시하지 않는다', () => {
  const seedRun = recommend({ days: '당일치기', transport: '자가용', companion: '혼자 조용히', seed: 0 });
  const visitedIds = seedRun.stops.slice(0, 1);
  const r = recommend({ days: '당일치기', transport: '자가용', companion: '혼자 조용히', seed: 0, visitedIds });
  for (const id of r.stops) {
    const newTag = (r.reasons[id] || []).some(x => /아직 못 가본 곳/.test(x.text));
    assert.equal(newTag, !visitedIds.includes(id), `방문 여부 반영: ${id}`);
  }
});

test('9. 사찰 데이터가 없으면 추천하지 않고 이유를 돌려준다', () => {
  const r = RECO.recommend({ temples: [], days: '당일치기' });
  assert.equal(r.ok, false);
  assert.match(r.message, /사찰/);
});

test('10. 앱 셸은 추천 엔진을 먼저 불러오고, 실행·적용 버튼과 연결돼 있다', () => {
  // <script> 태그 기준으로 순서를 본다 (head의 preload 힌트는 실행 순서와 무관)
  const recoIdx = indexHtml.indexOf('<script src="js/planner-reco.js');
  const appIdx = indexHtml.indexOf('<script src="js/app.js');
  assert.ok(recoIdx > -1, 'index.html에 추천 엔진 로드');
  assert.ok(appIdx > recoIdx, '추천 엔진을 app.js보다 먼저 로드');

  assert.ok(appSource.includes('window.PLANNER_RECO'), '앱이 추천 엔진을 읽는다');
  assert.ok(appSource.includes('PLAN_RECO.recommend('), '앱이 추천 계산을 호출한다');
  assert.ok(appSource.includes('data-act="reco-run"'), '실행(추천 계획 받기) 버튼');
  assert.ok(appSource.includes('✨ 추천 계획 받기'), '버튼 문구 노출');
  assert.ok(appSource.includes('data-act="reco-apply"'), '추천 코스를 계획표에 채우는 버튼');
  assert.ok(appSource.includes('data-act="reco-again"'), '다른 코스 추천 버튼');
  assert.ok(appSource.includes('data-act="draft-search"'), '사찰 검색 실행 버튼');
  assert.ok(appSource.includes("act === 'reco-run'") && appSource.includes('runRecommendation(false)'), '실행 버튼이 추천 계산으로 이어진다');
  assert.ok(appSource.includes('applyRecommendation()'), '추천 결과를 초안(사찰·제목·일정표)에 채운다');
});

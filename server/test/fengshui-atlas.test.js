'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.join(__dirname, '..', '..');
const appSource = fs.readFileSync(path.join(ROOT, 'js', 'app.js'), 'utf8');
const indexHtml = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');

function loadBrowserData() {
  const window = {};
  const context = { window };
  vm.createContext(context);
  for (const file of ['js/data-temples.js', 'js/data-prayer.js', 'js/data-fengshui.js']) {
    const full = path.join(ROOT, file);
    vm.runInContext(fs.readFileSync(full, 'utf8'), context, { filename: full });
  }
  return window;
}

const app = loadBrowserData();

test('전국 명당 사찰 풍수 대백과가 권역별 데이터로 정리되어 있다', () => {
  const A = app.FENGSHUI_ATLAS;
  assert.ok(A, 'FENGSHUI_ATLAS 데이터 제공');
  assert.ok(A.entries.length >= 18, `대백과 수록 ${A.entries.length}곳 (18곳 이상)`);
  assert.ok(A.regions.length >= 4, '권역 구분(수도권·강원 / 충청 / 영남 / 호남)');

  const regionKeys = new Set(A.regions.map(r => r.key));
  for (const e of A.entries) {
    assert.ok(regionKeys.has(e.region), `권역 연결: ${e.id}`);
    assert.ok(e.hyeong && e.hyeong.length > 5, `형국 설명: ${e.id}`);
    assert.ok(Array.isArray(e.power) && e.power.length >= 2, `핵심 기운 2개 이상: ${e.id}`);
    assert.ok(e.story && e.story.length > 10, `풍수 해설: ${e.id}`);
    assert.ok(Array.isArray(e.temples) && e.temples.length >= 1, `사찰 연결: ${e.id}`);
    for (const tid of e.temples) {
      const t = app.TEMPLES.find(x => x.id === tid);
      assert.ok(t, `사찰 데이터 존재: ${tid}`);
      assert.ok(t.fengshuiAtlas, `대백과 정보가 사찰에 연결됨: ${tid}`);
      assert.ok(t.themes.includes('fengshui'), `풍수 테마 반영: ${tid}`);
    }
    for (const bad of ['youtube.com', 'youtu.be']) {
      assert.equal(e.story.includes(bad), false, `영상 링크 없음: ${e.id}`);
    }
  }
});

test('목적별 맞춤 사찰 매트릭스와 방문법이 데이터로 제공된다', () => {
  assert.ok(app.FENGSHUI_MATRIX.length >= 6, '목적 6개 이상');
  for (const m of app.FENGSHUI_MATRIX) {
    assert.ok(m.purpose, '방문 목적');
    assert.ok(m.reason, '풍수적 핵심 이유');
    assert.ok(m.temples.length >= 1, `추천 사찰 연결: ${m.purpose}`);
    for (const tid of m.temples) {
      assert.ok(app.TEMPLES.find(t => t.id === tid), `매트릭스 사찰 존재: ${tid}`);
    }
  }
  assert.ok(app.FENGSHUI_VISIT_TIPS.length >= 3, '방문법 3개 이상');
  for (const tip of app.FENGSHUI_VISIT_TIPS) {
    assert.ok(tip.title && tip.text, '방문법 제목·본문');
  }
});

test('앱이 대백과·동행 스타일·추천 코스를 연결한다', () => {
  assert.equal(indexHtml.includes('js/data-fengshui.js'), true, 'index.html에 대백과 데이터 스크립트 연결');
  assert.ok(appSource.includes('window.FENGSHUI_ATLAS'), '앱이 대백과 데이터를 읽음');
  assert.ok(appSource.includes("case 'fengshui': html = viewFengshuiAtlas()"), '대백과 화면 라우트');
  assert.ok(appSource.includes('목적별 맞춤 사찰 매트릭스'), '매트릭스 화면 표시');
  assert.ok(appSource.includes("'기도효험 좋은 곳'"), '동행 스타일에 기도효험 좋은 곳 추가');
  assert.ok(appSource.includes("id: 'tpl-yeongnam-sowon-1n2d'"), '영남 영험 소원성지 1박 2일 템플릿');
  assert.ok(appSource.includes('companion: \'기도효험 좋은 곳\''), '템플릿 동행 스타일 연결');
});

test('풍수 대백과에도 외부 영상 링크·색인을 넣지 않았다', () => {
  const fengshuiSrc = fs.readFileSync(path.join(ROOT, 'js', 'data-fengshui.js'), 'utf8');
  for (const token of ['youtube.com', 'youtu.be', 'PRAYER_VIDEO_INDEX', 'videos:']) {
    assert.equal(fengshuiSrc.includes(token), false, `data-fengshui.js에 ${token} 없음`);
  }
  for (const temple of app.TEMPLES) {
    assert.equal(Object.hasOwn(temple, 'videos'), false, `영상 목록 없는 사찰 데이터: ${temple.id}`);
  }
});

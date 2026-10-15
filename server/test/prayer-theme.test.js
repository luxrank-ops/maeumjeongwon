'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.join(__dirname, '..', '..');
const { readAppSources } = require('./_sources');
const appSource = readAppSources();   // 셸(js/app.js) + 모듈(js/app/*.js)
const indexHtml = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));

function loadBrowserPrayerData() {
  const window = {};
  const context = { window };
  vm.createContext(context);
  for (const file of [
    'js/data-temples.js',
    'js/data-prayer.js'
  ]) {
    const full = path.join(ROOT, file);
    vm.runInContext(fs.readFileSync(full, 'utf8'), context, { filename: full });
  }
  return window;
}

test('기도 테마에는 출처를 갖춘 기도처와 추천 기준·한계가 연결된다', () => {
  const app = loadBrowserPrayerData();
  assert.equal(app.THEMES.prayer.name, '기도·기운 좋은 곳');
  assert.ok(app.PRAYER_ORDER.prayer.length >= 20);
  for (const id of app.PRAYER_ORDER.prayer) {
    const temple = app.TEMPLES.find(t => t.id === id);
    assert.ok(temple, `기도 테마 사찰 존재: ${id}`);
    assert.ok(temple.themes.includes('prayer'), `기도 테마가 사찰에 반영됨: ${id}`);
    assert.ok(temple.prayer, `기도 안내/출처 연결: ${id}`);
    for (const src of temple.prayer.src || []) {
      assert.match(src.u, /^https?:\/\//, `기도 안내 출처 링크: ${id}`);
    }
  }

  assert.ok(app.PRAYER_CRITERIA.length >= 3, '추천 기준이 데이터로 제공됨');
  assert.ok(app.PRAYER_CRITERIA.some(s => /출처|공식 자료/.test(s)));
  assert.ok(app.PRAYER_LIMITATIONS.length >= 2, '한계·주의 문구가 데이터로 제공됨');
  assert.ok(app.PRAYER_LIMITATIONS.some(s => /효험/.test(s)));

  assert.ok(appSource.includes('window.PRAYER_CRITERIA'), '앱이 추천 기준을 읽음');
  assert.ok(appSource.includes('window.PRAYER_LIMITATIONS'), '앱이 한계 문구를 읽음');
  assert.ok(appSource.includes('🧭 추천 기준'), '기도 테마 화면에 추천 기준 카드 표시');
});

test('유튜브 참고영상 기능은 앱·데이터·도구에서 제거되어 있다', () => {
  for (const file of [
    'js/data-prayer-videos.js',
    'js/data-prayer-video-crawl.js',
    'tools/collect-prayer-videos.js',
    'docs/prayer-video-method.md'
  ]) {
    assert.equal(fs.existsSync(path.join(ROOT, file)), false, `삭제된 파일: ${file}`);
  }
  assert.equal(/data-prayer-video/.test(indexHtml), false, 'index.html에 영상 색인 스크립트 없음');
  assert.equal(Object.hasOwn(pkg.scripts, 'crawl:prayer-videos'), false, '영상 수집 스크립트 없음');

  for (const token of ['PRAYER_VIDEO_INDEX', 'prayerVideoSection', 'prayerVideoEvidenceHtml', 'youtube.com/watch']) {
    assert.equal(appSource.includes(token), false, `app.js에 ${token} 없음`);
  }
  for (const token of ['참고 영상', '유튜브 참고 영상', 'YouTube 조사 자료']) {
    assert.equal(appSource.includes(token), false, `app.js에 '${token}' 문구 없음`);
  }

  const app = loadBrowserPrayerData();
  assert.equal(Object.hasOwn(app, 'YT_SOURCE'), false, '사찰 데이터에 영상 출처 상수 없음');
  for (const temple of app.TEMPLES) {
    assert.equal(Object.hasOwn(temple, 'videos'), false, `영상 목록 없는 사찰 데이터: ${temple.id}`);
  }
});

test('플래너에 기도 테마 추천 코스가 있고 탐색 테마에서 해당 필터로 연결된다', () => {
  for (const id of ['tpl-prayer-wish-1n2d', 'tpl-prayer-seoul-1d', 'tpl-prayer-namhae-1n2d']) {
    assert.ok(appSource.includes(`id: '${id}'`), `추천 계획 템플릿: ${id}`);
  }
  assert.ok(appSource.includes('href="#/planner/theme/prayer"'));
  assert.ok(appSource.includes('data-act="tpl-theme"'));
});

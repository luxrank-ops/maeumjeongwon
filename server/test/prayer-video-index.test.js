'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const collector = require('../../tools/collect-prayer-videos');

function loadBrowserPrayerData() {
  const window = {};
  const context = { window };
  vm.createContext(context);
  for (const file of [
    'js/data-temples.js',
    'js/data-prayer.js',
    'js/data-prayer-video-crawl.js',
    'js/data-prayer-videos.js'
  ]) {
    const full = path.join(__dirname, '..', '..', file);
    vm.runInContext(fs.readFileSync(full, 'utf8'), context, { filename: full });
  }
  return window;
}

test('기도 테마에는 출처를 갖춘 기도처와 YouTube 영상 색인이 연결된다', () => {
  const app = loadBrowserPrayerData();
  assert.equal(app.THEMES.prayer.name, '기도·기운 좋은 곳');
  assert.ok(app.PRAYER_ORDER.prayer.length >= 20);
  for (const id of app.PRAYER_ORDER.prayer) {
    const temple = app.TEMPLES.find(t => t.id === id);
    assert.ok(temple, `기도 테마 사찰 존재: ${id}`);
    assert.ok(temple.themes.includes('prayer'), `기도 테마가 사찰에 반영됨: ${id}`);
    assert.ok(temple.prayer, `기도 안내/출처 연결: ${id}`);
  }

  const index = app.PRAYER_VIDEO_INDEX;
  assert.ok(index.videos.length >= 80, '수기 조사·기존 참고 영상이 통합됨');
  assert.ok(index.byTemple.boriam.some(v => v.id === 'R3XipHnyYP0'));
  assert.ok(index.byTemple.dosunsa.some(v => v.id === 'GVUmv49Uii8'));
  assert.ok(index.byTemple.tongdosa.some(v => v.id === 'BdzE7hxPL9I'));
  assert.ok(index.criteria.some(s => /효험|영험함/.test(s)));
  assert.ok(index.limitations.some(s => /전수 수집/.test(s)));

  const ids = index.videos.map(v => v.id);
  assert.equal(new Set(ids).size, ids.length, 'video ID 기준 중복 제거');
  for (const video of index.videos) {
    assert.match(video.id, /^[A-Za-z0-9_-]{11}$/);
    for (const templeId of video.templeIds || []) {
      assert.ok(app.TEMPLES.some(t => t.id === templeId), `연결된 사찰 ID 존재: ${templeId}`);
    }
  }
});

test('플래너에 기도 테마 추천 코스가 있고 탐색 테마에서 해당 필터로 연결된다', () => {
  const appSource = fs.readFileSync(path.join(__dirname, '..', '..', 'js', 'app.js'), 'utf8');
  for (const id of ['tpl-prayer-wish-1n2d', 'tpl-prayer-seoul-1d', 'tpl-prayer-namhae-1n2d']) {
    assert.ok(appSource.includes(`id: '${id}'`), `추천 계획 템플릿: ${id}`);
  }
  assert.ok(appSource.includes('href="#/planner/theme/prayer"'));
  assert.ok(appSource.includes('data-act="tpl-theme"'));
});

test('YouTube collector는 공통 질의와 기도처별 질의를 모두 만든다', () => {
  assert.ok(collector.SEARCH_QUERIES.length >= 28);
  assert.ok(collector.SEARCH_QUERIES.includes('서울 삼각산 도선사 기도 사찰 순례'));
  assert.ok(collector.SEARCH_QUERIES.includes('설악산 봉정암 기도 사찰 순례'));
});

test('YouTube collector는 이름이 모호한 관음사를 잘못 연결하지 않는다', () => {
  const data = {
    prayerIds: ['naksansa', 'jeju_gwaneumsa', 'namhae_yongmunsa', 'gatbawi'],
    byId: {}
  };
  assert.deepEqual(
    collector.matchPrayerTempleIds('제주 관음사·남해 용문사·낙산사 홍련암·팔공산 갓바위', data),
    ['naksansa', 'jeju_gwaneumsa', 'namhae_yongmunsa', 'gatbawi']
  );
  assert.deepEqual(collector.matchPrayerTempleIds('관음사 기도 여행', data), []);
});

test('YouTube collector는 중복 검색 결과를 video ID 기준으로 병합한다', () => {
  const merged = collector.mergeVideos([
    { id: 'abcdefghijk', title: '영상', templeIds: ['boriam'], queryHits: ['기도 명당'] },
    { id: 'abcdefghijk', title: '영상', templeIds: ['naksansa'], queryHits: ['관음성지'] },
    { id: 'bad-id', title: '잘못된 ID', templeIds: [] }
  ]);
  assert.equal(merged.length, 1);
  assert.deepEqual(merged[0].templeIds, ['boriam', 'naksansa']);
  assert.deepEqual(merged[0].queryHits, ['기도 명당', '관음성지']);
});

test('collector는 API key를 저장하지 않고 공식 API 메타데이터만 출력한다', async () => {
  const fakeTempleData = {
    prayerIds: ['boriam'],
    byId: { boriam: { name: '보리암' } }
  };
  const urls = [];
  const fetchImpl = async url => {
    urls.push(new URL(url));
    return {
      ok: true,
      status: 200,
      json: async () => ({
        items: [{
          id: { videoId: 'abcdefghijk' },
          snippet: {
            title: '남해 보리암 기도처',
            description: '현장 산책 영상',
            channelTitle: '여행 기록',
            channelId: 'channel-id',
            publishedAt: '2026-10-01T00:00:00Z'
          }
        }]
      })
    };
  };
  const payload = await collector.collect({
    apiKey: 'test-key-not-to-save', pages: 1, fetchImpl, queries: ['보리암 기도'],
    templeData: fakeTempleData, pauseMs: 0
  });
  assert.equal(payload.videos.length, 1);
  assert.deepEqual(payload.videos[0].templeIds, ['boriam']);
  assert.deepEqual(payload.videos[0].queryHits, ['보리암 기도']);
  assert.equal(urls[0].searchParams.get('key'), 'test-key-not-to-save');
  assert.equal(collector.renderSource(payload).includes('test-key-not-to-save'), false);
  assert.equal(Object.hasOwn(payload.videos[0], 'description'), false, '설명 원문은 저장하지 않음');
  await assert.rejects(collector.collect({ apiKey: '', fetchImpl, queries: [], templeData: fakeTempleData }), /YOUTUBE_API_KEY/);
});

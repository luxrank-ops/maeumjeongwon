'use strict';

/*
 * Metadata-only YouTube catalog collector.
 * Uses the official YouTube Data API v3 search endpoint; does not scrape watch pages,
 * download subtitles, or score prayer efficacy. The API key is read only from env.
 */
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.join(__dirname, '..');
const OUTPUT = path.join(ROOT, 'js', 'data-prayer-video-crawl.js');
const API_URL = 'https://www.googleapis.com/youtube/v3/search';
const DEFAULT_PAGES = 1;
const PAGE_SIZE = 50;
const BROAD_SEARCH_QUERIES = [
  '기도 명당 사찰',
  '기도 잘되는 사찰 기도처',
  '소원성취 기도처 사찰',
  '기운 좋은 사찰 기운 명당',
  '3대 관음성지 기도 순례',
  '5대 적멸보궁 순례 사찰',
  '불교 기도도량 순례 사찰 여행'
];
const TEMPLE_QUERY_NAMES = {
  gatbawi: '팔공산 갓바위', boriam: '남해 금산 보리암', hyangiram: '여수 향일암',
  naksansa: '양양 낙산사 홍련암', bomunsa: '강화 석모도 보문사', sariam: '청도 운문사 사리암',
  dosunsa: '서울 삼각산 도선사', chiljangsa: '안성 칠장사', suguksa: '서울 은평 수국사',
  jeju_gwaneumsa: '제주 한라산 관음사', wangsansa: '포천 왕산사', maneosa: '밀양 만어사',
  yonggungsa: '부산 해동용궁사', tapsa: '진안 마이산 탑사', tongdosa: '양산 통도사',
  sangwonsa: '오대산 상원사 중대사자암', jeongamsa: '정선 정암사', bongjeongam: '설악산 봉정암',
  beopheungsa: '영월 법흥사', geumsansa: '김제 금산사', namhae_yongmunsa: '남해 호구산 용문사'
};

const ALIASES = {
  gatbawi: ['갓바위', '관봉석조여래좌상', '팔공산선본사'],
  boriam: ['보리암'],
  hyangiram: ['향일암'],
  naksansa: ['낙산사', '홍련암'],
  bomunsa: ['보문사'],
  sariam: ['사리암'],
  dosunsa: ['도선사'],
  chiljangsa: ['칠장사'],
  suguksa: ['수국사'],
  jeju_gwaneumsa: ['제주관음사', '한라산관음사'], // 동명 사찰이 있어 '관음사'만으로 연결하지 않음
  wangsansa: ['왕산사'],
  maneosa: ['만어사'],
  yonggungsa: ['해동용궁사'],
  tapsa: ['마이산탑사'],
  tongdosa: ['통도사'],
  sangwonsa: ['상원사', '중대사자암'],
  jeongamsa: ['정암사'],
  bongjeongam: ['봉정암'],
  beopheungsa: ['법흥사'],
  geumsansa: ['금산사'],
  namhae_yongmunsa: ['남해용문사', '호구산용문사']
};

function normalizeText(value) {
  return String(value || '').toLocaleLowerCase('ko-KR').replace(/[\s\p{P}\p{S}]+/gu, '');
}

function loadPrayerTempleData(root = ROOT) {
  const window = {};
  const context = { window };
  vm.createContext(context);
  for (const name of ['js/data-temples.js', 'js/data-prayer.js']) {
    const file = path.join(root, name);
    vm.runInContext(fs.readFileSync(file, 'utf8'), context, { filename: file });
  }
  const prayerIds = (window.PRAYER_ORDER && window.PRAYER_ORDER.prayer) || [];
  return {
    temples: window.TEMPLES || [],
    prayerIds,
    byId: Object.fromEntries((window.TEMPLES || []).map(t => [t.id, t]))
  };
}

function buildSearchQueries(templeData = loadPrayerTempleData()) {
  const siteQueries = templeData.prayerIds.map(id => `${TEMPLE_QUERY_NAMES[id] || (templeData.byId[id] && templeData.byId[id].name) || id} 기도 사찰 순례`);
  return Array.from(new Set([...BROAD_SEARCH_QUERIES, ...siteQueries]));
}

const SEARCH_QUERIES = buildSearchQueries();

function matchPrayerTempleIds(text, templeData = loadPrayerTempleData()) {
  const haystack = normalizeText(text);
  return templeData.prayerIds.filter(id => {
    const temple = templeData.byId[id];
    const candidates = ALIASES[id] || (temple ? [temple.name] : []);
    return candidates.some(alias => haystack.includes(normalizeText(alias)));
  });
}

function mergeVideos(items) {
  const merged = new Map();
  for (const item of items || []) {
    if (!item || !/^[A-Za-z0-9_-]{11}$/.test(String(item.id || ''))) continue;
    const previous = merged.get(item.id) || {};
    const mergeUnique = (a, b) => Array.from(new Set([...(a || []), ...(b || [])].filter(Boolean)));
    merged.set(item.id, Object.assign({}, previous, item, {
      templeIds: mergeUnique(previous.templeIds, item.templeIds),
      queryHits: mergeUnique(previous.queryHits, item.queryHits)
    }));
  }
  return Array.from(merged.values());
}

function parsePages(argv) {
  const i = argv.indexOf('--pages');
  if (i < 0) return DEFAULT_PAGES;
  const n = Number(argv[i + 1]);
  if (!Number.isInteger(n) || n < 1 || n > 5) throw new Error('--pages는 1~5 사이의 정수여야 합니다.');
  return n;
}

function inferKind(title, channel) {
  const text = `${title || ''} ${channel || ''}`;
  if (/(bbs|btn|불교방송|불교tv|뉴스|보도)/i.test(text)) return '방송·뉴스';
  if (/(풍수|명당|기운|영험|기도빨|소원성취|운세)/.test(text)) return '개인 해설 포함';
  if (/(공식|국가유산|문화재|역사|사료|다큐)/.test(text)) return '문화·역사 해설';
  return '여행·현장·순례';
}

async function collect({ apiKey, pages = DEFAULT_PAGES, fetchImpl = globalThis.fetch, queries = SEARCH_QUERIES, templeData = loadPrayerTempleData(), pauseMs = 150 }) {
  if (!apiKey) throw new Error('YOUTUBE_API_KEY가 필요합니다. API 키는 환경변수로만 전달하세요.');
  if (typeof fetchImpl !== 'function') throw new Error('Node.js 18 이상(내장 fetch)이 필요합니다.');
  if (!Number.isInteger(pages) || pages < 1 || pages > 5) throw new Error('pages는 1~5 사이의 정수여야 합니다.');

  const results = [];
  for (const query of queries) {
    let pageToken = '';
    for (let page = 0; page < pages; page++) {
      const url = new URL(API_URL);
      url.search = new URLSearchParams({
        part: 'snippet', type: 'video', maxResults: String(PAGE_SIZE), q: query,
        regionCode: 'KR', relevanceLanguage: 'ko', order: 'relevance', key: apiKey,
        ...(pageToken ? { pageToken } : {})
      }).toString();
      const response = await fetchImpl(url.toString());
      const body = await response.json();
      if (!response.ok) {
        const reason = body && body.error && body.error.message ? body.error.message : `HTTP ${response.status}`;
        throw new Error(`YouTube API 검색 실패 (${query}): ${reason}`);
      }
      for (const item of body.items || []) {
        const id = item && item.id && item.id.videoId;
        const snippet = (item && item.snippet) || {};
        if (!id || !snippet.title) continue;
        const templeIds = matchPrayerTempleIds(`${snippet.title}\n${snippet.description || ''}`, templeData);
        results.push({
          id,
          title: snippet.title,
          date: String(snippet.publishedAt || '').slice(0, 10),
          channel: snippet.channelTitle || '',
          channelId: snippet.channelId || '',
          templeIds,
          queryHits: [query],
          kind: inferKind(snippet.title, snippet.channelTitle),
          sourceType: 'youtube-data-api'
        });
      }
      pageToken = body.nextPageToken || '';
      if (!pageToken) break;
      if (pauseMs > 0) await new Promise(resolve => setTimeout(resolve, pauseMs));
    }
  }
  return {
    collectedAt: new Date().toISOString(),
    queries: queries.slice(),
    pagesPerQuery: pages,
    videos: mergeVideos(results)
  };
}

function renderSource(payload) {
  return `/* Generated by tools/collect-prayer-videos.js. Do not put API keys in this file. */\nwindow.YOUTUBE_PRAYER_CRAWL = ${JSON.stringify(payload, null, 2)};\n`;
}

async function main(argv = process.argv.slice(2)) {
  if (argv.includes('--help') || argv.includes('-h')) {
    console.log('사용법: YOUTUBE_API_KEY=... npm run crawl:prayer-videos [-- --pages 1..5]');
    console.log(`기본 검색: ${SEARCH_QUERIES.length}개 질의 × 최대 ${DEFAULT_PAGES}페이지 × ${PAGE_SIZE}개 영상. 공식 API 메타데이터만 수집합니다.`);
    return;
  }
  const pages = parsePages(argv);
  const payload = await collect({ apiKey: process.env.YOUTUBE_API_KEY, pages });
  fs.writeFileSync(OUTPUT, renderSource(payload), 'utf8');
  const linked = payload.videos.filter(v => v.templeIds.length).length;
  console.log(`YouTube 검색 결과 ${payload.videos.length}개 수집 (${linked}개가 기도·순례 사찰에 연결).`);
  console.log(`저장: ${path.relative(ROOT, OUTPUT)} — API key는 저장하지 않았습니다.`);
}

if (require.main === module) {
  main().catch(error => {
    console.error(error.message);
    process.exitCode = 1;
  });
}

module.exports = { BROAD_SEARCH_QUERIES, SEARCH_QUERIES, TEMPLE_QUERY_NAMES, ALIASES, normalizeText, loadPrayerTempleData, buildSearchQueries, matchPrayerTempleIds, mergeVideos, parsePages, inferKind, collect, renderSource };

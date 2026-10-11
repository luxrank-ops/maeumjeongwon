/* 마음정원 — 기도·기운 테마의 YouTube 영상 색인
 * 검색 스냅샷: 2026-10-11. 수기 조사한 공개 검색 결과 + 기존 사찰 영상 링크 + 선택적 공식 API 수집 결과.
 * 제목/설명은 영상 제작자의 관점일 수 있으며, 기도 효험이나 초자연적 기운의 증거로 사용하지 않습니다.
 */
(function (root) {
  'use strict';
  const T = root.TEMPLES || [];
  const YT = root.YT_SOURCE || {};

  // 공개 검색으로 확인한 영상 메타데이터. 영상/자막을 내려받지 않고 제목·공개 설명의 사찰명만 색인합니다.
  const SEARCH_SEEDS = [
    { id: 'R3XipHnyYP0', title: '[4k] 종합영상 ｜기도를 하면 더 잘 이루어지는, 3대 관음성지', date: '2023-03-30', channel: '가고파여행(주)', templeIds: ['naksansa', 'bomunsa', 'boriam'], kind: '여행·문화 소개', note: '낙산사·보문사·보리암을 한 영상에서 소개' },
    { id: 'Epn3WDA_bvk', title: '우리나라 3대 관음성지 — 남해 보리암, 양양 낙산사, 강화도 보문사 사찰여행', date: '2022-08-08', templeIds: ['boriam', 'naksansa', 'bomunsa'], kind: '여행·현장 소개', note: '3대 관음성지 순례 소개' },
    { id: '20-i7WCssEY', title: '바다가 코앞 해외까지 소문 났다 — 낙산사 템플스테이 (한국기행)', date: '2025-09-03', channel: 'EBS 한국기행', templeIds: ['naksansa'], kind: '방송·다큐', note: '낙산사 템플스테이와 해수관음성지 소개' },
    { id: '9NNgihL2BBE', title: '남해 금산 보리암 등산코스 3분요약 — 우리나라 3대 기도처', date: '2025-03-24', channel: '나교수의 등산여행스케치', templeIds: ['boriam'], kind: '산행·길 안내', note: '금산탐방지원센터~보리암~금산 코스 안내' },
    { id: 'yMGaGNHOV9U', title: '이성계도 기도하고 나라 세운 곳, 남해바다 품은 금산 보리암', date: '2025-09-12', templeIds: ['boriam'], kind: '사찰·문화 소개', note: '보리암의 전승과 수행·기도 문화를 다룬 영상' },
    { id: 'HL1fMCgtnpI', title: '남해 금산 산행, 보리암과 숨은 비경 부소암', date: '2026-01-21', templeIds: ['boriam'], kind: '산행·현장 소개', note: '보리암과 금산 산행 동선 소개' },
    { id: 'uzwFxL77f5w', title: '[갓바위 전설] 천년의 기도와 믿음, 팔공산에 숨겨진 이야기', date: '2025-08-15', templeIds: ['gatbawi'], kind: '전설·개인 해설', note: '갓바위 전승을 소개; 전승은 별도 사실 검증 대상' },
    { id: '6bpIhEUyd64', title: '팔공산 갓바위, 수능 기도 물결', date: '2024-11-04', channel: '대구BBS', templeIds: ['gatbawi'], kind: '뉴스·현장', note: '수능 전 갓바위 참배 현장 보도' },
    { id: 'cP-GLXEsnU8', title: '사찰여행 — 수능기도의 일번지 선본사 갓바위 부처', date: '2022-09-12', templeIds: ['gatbawi'], kind: '여행·현장 소개', note: '선본사와 갓바위 참배 현장' },
    { id: '7K1AUCe53fY', title: '세번가면 소원을 들어주는 청도 운문사 사리암, 나반존자 기도도량', date: '2021-12-16', templeIds: ['sariam'], kind: '여행·개인 해설', note: '사리암과 나반존자 신앙 소개; 효험 표현은 검증되지 않음' },
    { id: 'zjQSisdOd78', title: '간절한 소원이 있다면 운문사 사리암 — 경북 사찰', date: '2022-02-27', templeIds: ['sariam'], kind: '여행·개인 해설', note: '사리암 경내와 계단길 소개' },
    { id: '5XnussBevdw', title: '간절한 소원이 있다면 청도 운문사 사리암으로', date: '2023-05-16', templeIds: ['sariam'], kind: '여행·개인 해설', note: '사리암과 사리굴 전승 소개' },
    { id: 'BgLcw_uRPng', title: '기도도량 경북 청도 운문사 사리암, 1008계단', date: '2021-01-31', templeIds: ['sariam'], kind: '개인 해설', note: '영상 제작자의 기도 권유; 효험 증거가 아님' },
    { id: 'h5wi8CaYMXE', title: '[사리암] 세번 오르면 소원 들어 준다는 청도 운문사 사리암', date: '2020-09-29', templeIds: ['sariam'], kind: '여행·개인 해설', note: '사리암 현장 소개와 지역 전승' },
    { id: 'GVUmv49Uii8', title: '서울 도심 속 사찰 — 북한산 도선사 기도처', date: '2026-06-29', templeIds: ['dosunsa'], kind: '여행·개인 해설', note: '도선사 석불전·현장 풍경 소개' },
    { id: '6jIbQQdpVoc', title: '생활 불교의 도량, 도선사', date: '2024-11-12', channel: '서울역사편찬원', templeIds: ['dosunsa'], kind: '공공기관·문화 소개', note: '서울의 사찰과 도선사 소개' },
    { id: 'vIy-yk2t6Uc', title: '서울 강북 힐링사찰 우이동 도선사', date: '2021-07-03', channel: 'BTN조이', templeIds: ['dosunsa'], kind: '방송·현장', note: '도선사 경내 풍경' },
    { id: 'xtrRuuKQERI', title: '고운 불심이 가득한 청담스님의 사찰, 도선사 [좋은절 #31]', date: '2022-06-14', templeIds: ['dosunsa'], kind: '사찰·문화 소개', note: '도선사의 역사와 신행 문화 소개' },
    { id: 'ZofAQT3AKBg', title: '선묵혜자스님 108산사 영상순례 — 삼각산 도선사', date: '2021-11-04', channel: '불교방송', templeIds: ['dosunsa'], kind: '불교방송·순례', note: '108산사 영상 순례' },
    { id: 'wNAd3w81dz0', title: '전원주, 아들과 함께 소개하는 서울 도선사 기도터', date: '2026-06-09', templeIds: ['dosunsa'], kind: '개인 체험·인터뷰', note: '출연자 개인 경험으로, 효험을 검증하는 자료가 아님' },
    { id: 'nPSnwhz5vEM', title: '[사찰 기행] 수국사 황금법당에서 템플라이프', date: '2022-11-26', templeIds: ['suguksa'], kind: '사찰·현장 소개', note: '수국사 황금법당과 템플라이프 소개' },
    { id: 'qC-t10W4kUI', title: '서울에 위치한 황금법당 — 수국사·봉산봉수대', date: '2025-03-21', templeIds: ['suguksa'], kind: '역사·여행 소개', note: '수국사와 주변 역사 소개' },
    { id: 'vm1AZCQLG9U', title: '황금 법당이 있는 서울 은평구 수국사 둘러보기', date: '2022-06-29', templeIds: ['suguksa'], kind: '사찰·현장 소개', note: '수국사 건축과 연혁 소개' },
    { id: 'yWMTJcKplfg', title: '한국의 3대 관음성지 완벽 정리 — 관세음보살과 기도처', date: '2026-02-04', templeIds: ['naksansa', 'boriam', 'bomunsa'], kind: '불교 강의·해설', note: '설명과 해시태그에 일부 다른 장소가 함께 언급됨; 세 사찰만 확정 연결' },
    { id: '6hqpvqXFt8Q', title: '강화 보문사 수륙용왕대재 — 코로나 극복 기도 정진', date: '2020-06-02', channel: 'BBS뉴스', templeIds: ['bomunsa'], kind: '뉴스·불교 의례', note: '보문사 수륙용왕대재 봉행 보도' },
    { id: 'VUEWw3fpKPY', title: '강화도 보문사, 알고 나면 반드시 가야 하는 이유', date: '2026-07-09', templeIds: ['bomunsa'], kind: '여행·문화 소개', note: '보문사 석굴과 마애불 현장 소개' },
    { id: 'drxb16gl7-8', title: '[강화도-보문사] 3대 관음성지와 마애불', date: '2023-09-03', templeIds: ['bomunsa'], kind: '여행·개인 해설', note: '보문사 참배·현장 소개' },
    { id: 'Lq3a96mIHaY', title: '강화 석모도 해명산·우리나라 3대 기도처 보문사', date: '2025-03-09', templeIds: ['bomunsa'], kind: '산행·길 안내', note: '해명산~보문사 트레킹 동선과 조망 소개' },
    { id: '_kMTjDPTN3g', title: '해명산에서 낙가산까지 — 보문사 산·바다 트레킹', date: '2025-01-07', templeIds: ['bomunsa'], kind: '산행·길 안내', note: '산행을 겸한 보문사 참배 동선' },
    { id: 'nSzGwdccIe4', title: '여수 향일암 — 해를 향한 암자, 관음기도처', date: '2025-05-25', templeIds: ['hyangiram'], kind: '여행·현장 소개', note: '향일암 주요 전각과 바닷가 풍경' },
    { id: 'm9LBEeQqTfM', title: '금오산 향일암 — 관음기도도량 수행처이자 관광명소', date: '2021-12-30', templeIds: ['hyangiram'], kind: '여행·현장 소개', note: '향일암 기도도량과 해안 풍경 소개' },
    { id: '8D0fJQYhGxk', title: '평생 한번의 소원을 들어 준다고 알려진 기도처 6곳', date: '2024-03-07', templeIds: ['saseongam', 'gatbawi', 'sariam', 'maneosa', 'yonggungsa'], kind: '지역 모음·개인 해설', note: '영상 설명의 해시태그에 사성암·갓바위·사리암·만어사·해동용궁사 언급; 효험 주장은 검증되지 않음' },
    { id: 'PrPdx6PqYxU', title: '5대 적멸보궁, 도대체 어디가 본찰입니까?', date: '2026-05-12', templeIds: ['tongdosa', 'bongjeongam', 'jeongamsa', 'beopheungsa', 'sangwonsa'], kind: '불교 역사·해설', note: '5대 적멸보궁 비교. 영상 설명의 정정에서 오대산 보궁은 상원사 아래 중대 사자암으로 구분' },
    { id: 'h_hPl5XuA_8', title: '中대사자암 적멸보궁·오대산 상원사 사찰 여행', date: '2021-10-31', templeIds: ['sangwonsa'], kind: '순례·현장 소개', note: '상원사와 중대 사자암 적멸보궁을 구분해 소개' },
    { id: 'l993XtYNYY4', title: '영월 법흥사 적멸보궁 치유 여행', date: '2026-06-26', templeIds: ['beopheungsa'], kind: '여행·현장 소개', note: '법흥사 적멸보궁·숲길 소개' },
    { id: 'vBLrnKorMMY', title: '불교타임머신 — 적멸보궁 봉정암', date: '2021-03-18', channel: '불교방송', templeIds: ['bongjeongam'], kind: '불교방송·순례', note: '봉정암의 순례길과 적멸보궁 소개' },
    { id: '6L2YS-dlRyM', title: '부처님 진신사리를 친견하러 가는 적멸보궁 순례길, 오대산', date: '2023-09-14', templeIds: ['sangwonsa'], kind: '순례·현장 소개', note: '상원사~중대 사자암~적멸보궁 순례길 소개' },
    { id: 'V_w2VowmpCs', title: '설악산 봉정암 1박 2일 순례길', date: '2025-05-21', templeIds: ['bongjeongam'], kind: '산행·순례 기록', note: '백담사~봉정암 장거리 산행 정보; 입산·기상 공지 확인 필요' },
    { id: 'WAJrOpWpZdI', title: 'BTN스팟 — 부처님 진신사리가 모셔진 통도사 금강계단', templeIds: ['tongdosa'], kind: '불교방송·문화재', note: '금강계단과 사리 봉안 전통 소개' },
    { id: 'BdzE7hxPL9I', title: '석가모니가 남긴 보물, 통도사 금강계단', date: '2017-01-17', channel: '국가유산채널', templeIds: ['tongdosa'], kind: '문화유산·해설', note: '통도사 금강계단과 불보사찰의 특징' },
    { id: 'axDkgoZ9eaA', title: '기도 잘되는 사찰 5군데 — 전국 기도처 추천', date: '2025-07-10', templeIds: ['tongdosa', 'woljeongsa', 'beopjusa'], kind: '개인 해설·지역 모음', note: '설명에 통도사·월정사·법주사 언급; 그 밖의 지명은 동명이 사찰 여부 미확인' },
    { id: 'AiKI5XuLDts', title: '연말·새해 꼭 가봐야 할 영험한 기도 명당 TOP5', date: '2024-12-20', kind: '개인 해설·지역 모음', note: '기도처 모음 영상; 개별 사찰명은 자동 연결하지 않음' },
    { id: '8s_J6j-zWYU', title: '유명한 소원성취 기도 명당 사찰 10곳 — 경상도편 1부', date: '2025-07-05', kind: '개인 해설·지역 모음', note: '경상도 지역 사찰 모음; 개별 사찰명 매칭 전까지 특정 사찰로 연결하지 않음' },
    { id: 'YqjOAIzXocQ', title: '천년의 기운 소원성취 명당 사찰 — 경상도편 3부', date: '2025-02-05', kind: '개인 해설·지역 모음', note: '경북·경남 지역 사찰 모음; 개별 사찰명 매칭 전까지 특정 사찰로 연결하지 않음' },
    { id: 'BJgkL8_tR2w', title: '천년의 기운 기도 명당 사찰 — 전라도편 2부', date: '2025-01-27', kind: '개인 해설·지역 모음', note: '전남 지역 사찰 모음; 개별 사찰명 매칭 전까지 특정 사찰로 연결하지 않음' },
    { id: 'dFH64DudVLk', title: '유명한 소원성취 기도 명당 천년고찰 — 경상도편 2부', date: '2025-06-08', kind: '개인 해설·지역 모음', note: '경상도 지역 사찰 모음; 개별 사찰명 매칭 전까지 특정 사찰로 연결하지 않음' },
    { id: '-PTh-GPKCRU', title: '천년의 기도 소원성취 명당 사찰 — 충청도편', date: '2025-01-20', kind: '개인 해설·지역 모음', note: '충남 지역 사찰 모음; 개별 사찰명 매칭 전까지 특정 사찰로 연결하지 않음' },
    { id: '_lU2nNf5Q5w', title: '천년의 기운 소원성취 기도 명당 사찰 — 경기도편', date: '2025-01-14', templeIds: ['bomunsa', 'yongjusa'], kind: '개인 해설·지역 모음', note: '영상 설명에 보문사·용주사 언급; 지역·동명이 사찰은 구분 필요' },
    { id: 'itqLtc-JmxI', title: '기도발이 쎈 소원성취 명당 사찰 8곳 — 시험 합격 기도편', date: '2025-03-12', kind: '개인 해설·지역 모음', note: '여러 지역 사찰 모음; 제목·설명만으로 개별 사찰을 특정하지 않음' },
    { id: 'wVjjAKh2tGk', title: '소원성취 재물운 기도 명당 사찰 10곳 — 경상도편', date: '2025-01-09', kind: '개인 해설·지역 모음', note: '경상도 사찰 모음; 개별 사찰명 매칭 전까지 특정 사찰로 연결하지 않음' }
  ];

  function unique(xs) { return Array.from(new Set((xs || []).filter(Boolean))); }
  const rows = new Map();
  function addVideo(v, source) {
    if (!v || !/^[A-Za-z0-9_-]{11}$/.test(String(v.id || ''))) return;
    const old = rows.get(v.id) || {};
    const ids = unique([...(old.templeIds || []), ...(v.templeIds || [])]);
    rows.set(v.id, Object.assign({}, old, v, {
      templeIds: ids,
      sources: unique([...(old.sources || []), source].filter(Boolean)),
      queryHits: unique([...(old.queryHits || []), ...(v.queryHits || [])])
    }));
  }

  // 사찰 상세에 이미 검토·등록되어 있는 풍수/현장 영상도 공통 색인으로 합칩니다.
  T.forEach(t => (t.videos || []).forEach(v => addVideo({
    id: v.id, title: v.title, date: v.date || '', note: v.note || '', channel: YT.name || '풍생풍사TV',
    templeIds: [t.id], kind: '풍수 개인 해설', sourceType: 'existing-temple-reference'
  }, '사찰 상세 데이터')));
  SEARCH_SEEDS.forEach(v => addVideo(Object.assign({ sourceType: 'public-search-seed' }, v), '공개 검색 색인'));

  const crawl = root.YOUTUBE_PRAYER_CRAWL || {};
  (Array.isArray(crawl.videos) ? crawl.videos : []).forEach(v => addVideo(Object.assign({ kind: 'YouTube 검색 결과', sourceType: 'youtube-data-api' }, v), 'YouTube Data API v3'));

  const videos = Array.from(rows.values()).sort((a, b) => (b.date || b.publishedAt || '').localeCompare(a.date || a.publishedAt || '') || a.title.localeCompare(b.title, 'ko'));
  const byTemple = {};
  videos.forEach(v => (v.templeIds || []).forEach(id => { (byTemple[id] = byTemple[id] || []).push(v); }));

  root.PRAYER_VIDEO_INDEX = {
    collectedAt: crawl.collectedAt || '2026-10-11',
    method: '공개 YouTube 검색 결과의 제목·설명 메타데이터와 기존 사찰 참고 영상을 ID 기준으로 중복 제거해 합친 편집 색인',
    queries: [
      '기도 명당 사찰', '기도 잘되는 사찰', '소원성취 기도처 사찰', '기운 좋은 사찰',
      '3대 관음성지 기도', '팔공산 갓바위 기도', '운문사 사리암 기도', '남해 보리암 기도',
      '낙산사 홍련암 기도', '강화 보문사 기도', '서울 도선사 기도처', '5대 적멸보궁 순례',
      '사찰명 + 기도·기도처·관음·적멸보궁·풍수 조합'
    ],
    criteria: [
      '사찰·유물·의례의 기도 전통은 사찰 공식 자료, 문화유산·백과사전, 언론 등으로 따로 확인합니다.',
      '영상은 사찰명·기도처·순례 경로가 제목이나 공개 설명에 직접 드러나는 경우만 해당 사찰과 연결합니다.',
      '방송·공공기관·불교계 보도, 여행·현장 기록, 개인 풍수·효험 주장을 구분하며 영상의 개인 견해는 사실 근거로 취급하지 않습니다.',
      '영상 수·조회수는 영험함 점수가 아닙니다. 코스는 지역 동선·접근·산행 안전을 함께 고려해 추천합니다.'
    ],
    limitations: [
      'YouTube 전체 영상이나 비공개 자막을 전수 수집한 자료가 아닙니다. 2026-10-11 공개 검색에서 확인한 초기 표본이며, 최신 자동 수집은 공식 API 도구로 갱신할 수 있습니다.',
      '소원 성취·기운·풍수 효험을 실증하거나 보장하지 않습니다. 제목·설명은 제작자 표현일 수 있으니 시청 전 맥락을 확인하세요.'
    ],
    crawler: { source: 'YouTube Data API v3 (선택 실행)', collectedAt: crawl.collectedAt || null, videoCount: videos.length },
    videos,
    byTemple
  };
})(typeof window !== 'undefined' ? window : globalThis);

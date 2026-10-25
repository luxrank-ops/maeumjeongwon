/* 절로가 MVP — vanilla JS SPA (hash router + localStorage) */
(function () {
  'use strict';
  // 설치 프롬프트는 기능 묶음이 지연 로드되기 전에 올 수 있으므로 우선 저장해 둔다.
  window.addEventListener('beforeinstallprompt', e => {
    e.preventDefault();
    window.MJ_INSTALL_PROMPT = e;
  });
  const TEMPLES = window.TEMPLES, THEMES = window.THEMES, LL = window.LIST_LABELS;
  const FENGSHUI_ATLAS = { regions: [], entries: [] };
  const FENGSHUI_MATRIX = [], FENGSHUI_VISIT_TIPS = [];
  const TRAD = [], RAW_STORIES = [], STORY_SOON = [], STORIES = [];
  let tradByNo = {};
  let PRAYER_CRITERIA = [];
  let PRAYER_LIMITATIONS = [];
  let PLAN_RECO = null;                            // 사찰 여행 추천 계획 엔진 (js/planner-reco.js)
  let lazyDataStamp = '';
  const SIDO_CENTERS = {
    '서울': [37.5665, 126.9780], '부산': [35.1796, 129.0756], '대구': [35.8714, 128.6014],
    '인천': [37.4563, 126.7052], '광주': [35.1595, 126.8526], '대전': [36.3504, 127.3845],
    '울산': [35.5384, 129.3114], '세종': [36.4800, 127.2890], '경기': [37.4138, 127.5183],
    '강원': [37.8228, 128.1555], '충북': [36.6357, 127.4917], '충남': [36.6588, 126.6728],
    '전북': [35.8203, 127.1088], '전남': [34.8161, 126.4629], '경북': [36.5760, 128.5056],
    '경남': [35.2383, 128.6922], '제주': [33.3846, 126.5535]
  };
  const byId = Object.fromEntries(TEMPLES.map(t => [t.id, t]));
  const addrToFeaturedId = Object.fromEntries(TEMPLES.map(t => [t.addr, t.id]));

  /* ---------- 지연 로딩 데이터 채우기 ----------
   * 무거운 데이터(지도 162KB · 전통사찰 991곳 110KB · 스토리/기도/풍수)는 첫 화면에서 받지 않는다.
   * js/lib/loader.js가 화면에 맞춰 내려 주면 여기서 아래 그릇을 '비우고 다시 채운다'.
   * 배열·객체는 참조를 유지한 채 채우므로 화면 코드는 이름을 그대로 쓰면 된다.
   */
  function previewStory(st) {
    if (st.preview !== undefined) return st;
    const free = (st.chapters || []).slice(0, 1);
    const next = (st.chapters || [])[1];
    return Object.assign({}, st, {
      totalChapters: (st.chapters || []).length,
      chapters: free,
      preview: next ? { h: next.h, legend: !!next.legend, body: (next.body || []).slice(0, 1) } : null
    });
  }
  function replaceAll(target, rows) {
    target.length = 0;
    for (const row of rows) target.push(row);
  }
  function hydrateLazyData() {
    const stamp = [!!window.TRADITIONAL_TEMPLATES, !!window.STORIES, !!window.PRAYER_CRITERIA, !!window.FENGSHUI_ATLAS].join('');
    if (stamp === lazyDataStamp) return;               // 같은 조합이면 다시 만들지 않는다
    lazyDataStamp = stamp;

    if (Array.isArray(window.TRADITIONAL_TEMPLATES)) {
      replaceAll(TRAD, window.TRADITIONAL_TEMPLATES.map(r => ({ no: r[0], sido: r[1], sgg: r[2], addr: r[3], name: r[4], order: r[5], id: 'trad-' + r[0] })));
      tradByNo = Object.fromEntries(TRAD.map(x => [x.no, x]));
    }
    if (Array.isArray(window.PRAYER_CRITERIA)) PRAYER_CRITERIA = window.PRAYER_CRITERIA;
    if (Array.isArray(window.PRAYER_LIMITATIONS)) PRAYER_LIMITATIONS = window.PRAYER_LIMITATIONS;
    if (window.PLANNER_RECO) PLAN_RECO = window.PLANNER_RECO;
    if (window.FENGSHUI_ATLAS) Object.assign(FENGSHUI_ATLAS, window.FENGSHUI_ATLAS);
    if (Array.isArray(window.FENGSHUI_MATRIX)) replaceAll(FENGSHUI_MATRIX, window.FENGSHUI_MATRIX);
    if (Array.isArray(window.FENGSHUI_VISIT_TIPS)) replaceAll(FENGSHUI_VISIT_TIPS, window.FENGSHUI_VISIT_TIPS);
    if (Array.isArray(window.STORIES)) {
      replaceAll(RAW_STORIES, window.STORIES);
      replaceAll(STORY_SOON, window.STORY_SOON || []);
      replaceAll(STORIES, window.STORIES.map(previewStory));
    }
  }
  function resolveTemple(id) {
    if (!id) return null;
    if (byId[id]) return byId[id];
    const m = /^trad-(\d+)$/.exec(String(id));
    if (!m) return null;
    const tr = tradByNo[+m[1]];
    if (!tr) return null;
    if (addrToFeaturedId[tr.addr] && byId[addrToFeaturedId[tr.addr]]) return byId[addrToFeaturedId[tr.addr]];
    const c = SIDO_CENTERS[tr.sido] || [36.3, 127.9];
    return {
      id: tr.id,
      tradNo: tr.no,
      isTradOnly: true,
      name: tr.name,
      hanja: `전통사찰 제${tr.no}호`,
      sido: tr.sido,
      sgg: tr.sgg,
      addr: tr.addr,
      order: tr.order,
      lat: c[0],
      lng: c[1],
      founded: '전통사찰 현황 (2026.6.1. 현재) 등록 사찰',
      mountain: `${tr.sido} ${tr.sgg}`,
      treasures: ['문화체육관광부 지정 전통사찰'],
      lists: [],
      themes: [],
      timeline: [['2026.6.1.', `문화체육관광부 「전통사찰 현황」 연번 ${tr.no}번 (${tr.order}) 등재`]],
      duration: '약 1시간',
      tip: '방문 전 상세주소로 길찾기 및 개방 여부를 확인하세요.',
      practical: {
        parking: '사찰 경내 또는 입구 공영주차장 이용 (길찾기 안내 참고)',
        fee: '무료 (2023년 5월 국가지정문화유산 관람료 폐지, 일부 사찰 주차료 별도)',
        hours: '일출~일몰 (통상 06:00~18:00 개방)',
        transit: `${tr.sido} ${tr.sgg} 시내·농어촌버스 또는 내비게이션 '${tr.addr}' 검색`,
        templestay: '한국불교문화사업단 템플스테이 통합예약(templestay.com)에서 운영 여부 조회'
      },
      radius: 700,
      verify: []
    };
  }
  const KEY = 'maeumjeongwon.v1';
  const $view = document.getElementById('view');

  // SVG <text> 는 CSS 변수를 못 읽는다 — 세리프(문서 체)가 없는 기기용 폴백까지 문자열로 들고 간다.
  const DISPLAY_FONT = 'NanumMyeongjo,Nanum Myeongjo,"Noto Serif KR","Noto Serif CJK KR",AppleMyungjo,Batang,serif';
  /* ---------- 아이콘 ----------
   * 화면의 '구조'(탭·버튼·상태)를 나타내는 그림은 이모지를 쓰지 않는다 — OS마다 크기가 다르고
   * 스크린리더는 글자로 읽는다. index.html 의 <symbol id="i-…"> 스프라이트를 참조한다.
   * 콘텐츠(기분·날씨·계절)의 이모지는 그대로 둔다 — 그곳에서는 이모지가 '내용'이다. */
  function ic(name, cls) {
    return `<svg class="ic${cls ? ' ' + cls : ''}" aria-hidden="true" focusable="false"><use href="#i-${name}"/></svg>`;
  }

  // ---------- 상태 ----------
  const SESS_KEY = 'maeumjeongwon.sess.v1';
  const ENT_KEY = 'maeumjeongwon.ent.v1';
  const defaults = { visits: [], journal: [], big: false, moodIdx: 0, plus: null, plan: 'yearly', packs: [], offline: [], adLog: {}, adUnlocks: {}, skin: null, moodLog: [], trips: [], tripChecks: {}, streak: 0, streakDate: null, streakFreezes: 1, onboarded: false, onboardPrefs: {} };
  let S;
  try { S = Object.assign({}, defaults, JSON.parse(localStorage.getItem(KEY) || '{}')); } catch (e) { S = Object.assign({}, defaults); }

  const SAMPLE_DATA = {
    visits: [
      { tid: 'tongdosa', date: '2026-10-09', method: 'gps' },
      { tid: 'haeinsa', date: '2026-10-10', method: 'gps' },
      { tid: 'songgwangsa', date: '2026-10-11', method: 'gps' },
      { tid: 'bulguksa', date: '2026-10-08', method: 'gps' },
      { tid: 'naksansa', date: '2026-10-12', method: 'gps' },
      { tid: 'woljeongsa', date: '2026-10-13', method: 'gps' },
      { tid: 'buseoksa', date: '2026-10-14', method: 'gps' }
    ],
    journal: [
      {
        id: 'j-buseoksa',
        tid: 'buseoksa',
        date: '2026-10-14',
        weather: '☀️ 맑음',
        note: '무량수전 배흘림기둥에 서서 소백산 능선 너머로 번지는 황금빛 노을을 마주했습니다. 가을바람에 풍경 소리가 맑게 울려 퍼질 때, 마음속 모든 번뇌가 씻겨 내려가는 듯한 고요함을 느꼈습니다.',
        photo: null
      },
      {
        id: 'j-woljeongsa',
        tid: 'woljeongsa',
        date: '2026-10-13',
        weather: '⛅ 구름',
        note: '오대산 천년 전나무숲길을 맨발로 걸었습니다. 피톤치드 향기와 계곡 물소리 속에서 오롯이 나의 숨과 걸음에 집중하며 내면의 평화를 되찾았습니다.',
        photo: null
      },
      {
        id: 'j-naksansa',
        tid: 'naksansa',
        date: '2026-10-12',
        weather: '☀️ 맑음',
        note: '새벽 동해 바다의 붉은 해돋이를 홍련암 법당 마루 틈으로 바라보았습니다. 해수관음보살상 앞에서 합장하며 한 가지 간절한 소원을 마음속 깊이 담았습니다.',
        photo: null
      },
      {
        id: 'j-songgwangsa',
        tid: 'songgwangsa',
        date: '2026-10-11',
        weather: '⛅ 구름',
        note: '보조국사 지눌 스님의 정혜결사 정신이 깃든 승보사찰 송광사. 우화각 다리 아래 맑은 물에 비친 누각을 바라보며 나를 돌아보는 침묵의 시간을 가졌습니다. 이로써 삼보사찰 순례를 원만하게 회향했습니다!',
        photo: null
      },
      {
        id: 'j-haeinsa',
        tid: 'haeinsa',
        date: '2026-10-10',
        weather: '☀️ 맑음',
        note: '가야산 소리길의 맑은 물소리를 따라 걸어 장경판전에 다다랐습니다. 팔만대장경판의 경이로운 보존과 선조들의 숭고한 정성에 가슴 뭉클한 감동을 받았습니다.',
        photo: null
      },
      {
        id: 'j-tongdosa',
        tid: 'tongdosa',
        date: '2026-10-09',
        weather: '☀️ 맑음',
        note: '영축산 무풍한송로의 굽은 소나무 숲길을 걸었습니다. 금강계단 앞 고요한 침묵 속에서 나 자신과 마주하는 참된 휴식을 얻었습니다.',
        photo: null
      },
      {
        id: 'j-bulguksa',
        tid: 'bulguksa',
        date: '2026-10-08',
        weather: '☀️ 맑음',
        note: '토함산 자락의 다보탑과 석가탑, 청운교·백운교를 천천히 음미했습니다. 신라 천년의 미소와 기도가 오늘날까지 고스란히 전해져 오는 듯합니다.',
        photo: null
      }
    ],
    trips: [
      {
        id: 'trip_templestay_sample',
        title: '산사 1박 2일 템플스테이 & 참선 힐링 코스',
        date: '2026-10-14',
        days: '1박 2일',
        transport: '대중교통·도보',
        companion: '혼자 조용히',
        stops: ['woljeongsa', 'sangwonsa'],
        memo: '1. 1일차 14:00 — 사찰 도착 및 방사 배정 · 수련복 착용 및 사찰 안내\n2. 1일차 16:00 — 사물 타종 관람 및 타종 체험\n3. 1일차 17:30 — 저녁 공양 (사찰음식 발우공양)\n4. 1일차 18:30 — 저녁 예불 및 108배 염주 꿰기 체험\n5. 2일차 04:30 — 새벽 예불 및 전나무숲길 포행 명상\n6. 2일차 09:30 — 오대산 상원사·중대 적멸보궁 참배\n\n💡 팁: 산중 사찰은 일교차가 크므로 따뜻한 겉옷을 준비하세요.',
        createdAt: '2026-10-14T00:00:00.000Z'
      },
      {
        id: 'trip_yeongnam_sample',
        title: '팔공산·영남 기운 충전 순례 코스',
        date: '2026-10-14',
        days: '당일치기',
        transport: '자가용',
        companion: '가족·부모님과',
        stops: ['gatbawi', 'donghwasa'],
        memo: '1. 오전 08:30 — 관봉 석조여래좌상(갓바위) 돌계단 산행 및 한 가지 소원 발원\n2. 오전 11:30 — 팔공산 동화사 이동 및 통일대불 참배\n3. 오후 13:00 — 산채비빔밥 점심 공양 및 계곡 산책\n\n💡 팁: 갓바위 돌계단은 편한 등산화가 필수입니다.',
        createdAt: '2026-10-13T00:00:00.000Z'
      }
    ],
    tripChecks: {
      shoes: true,
      clothes: true,
      water: true,
      hours: true,
      etiquette: true
    },
    moodLog: [
      { ts: Date.now() - 86400000 * 3, mood: 1, note: '산사 숲길 걷기로 복잡한 마음 비우기' },
      { ts: Date.now() - 86400000 * 2, mood: 3, note: '낙산사 홍련암에서 간절한 발원' },
      { ts: Date.now() - 86400000 * 1, mood: 2, note: '부석사 석양 바라보며 평온과 설렘' }
    ]
  };

  function populateSampleValues() {
    /* 사용자가 요청한 예시 기록에는 sample 표지를 붙인다.
     * 여정에서는 '예시'로 보이고, 실제 방문·등급·염주·리포트 집계에서는 제외한다. */
    S.visits = SAMPLE_DATA.visits.map(x => Object.assign({ sample: true }, x));
    S.journal = SAMPLE_DATA.journal.map(x => Object.assign({ sample: true }, x));
    S.trips = SAMPLE_DATA.trips.map(x => Object.assign({}, x, { stops: x.stops.slice() }));
    S.tripChecks = Object.assign({}, SAMPLE_DATA.tripChecks);
    S.moodLog = SAMPLE_DATA.moodLog.map(x => Object.assign({}, x));
    save();
  }
  window.MJ_POPULATE_SAMPLE = populateSampleValues;

  // 실제 방문·수첩 기록은 첫 실행 때 자동으로 채우지 않는다.
  // 예시 데이터는 사용자가 '샘플 값 채우기'를 눌렀을 때만 넣어, 데모 기록을 실제 기록으로 오인하지 않게 한다.
  const CFG = window.MJ_CONFIG || { apiBase: '', demoPaywall: false };
  const API = CFG.apiBase || '';
  const MODE = { devEntitlement: true, devAdReward: true };
  let SESS = null;
  try { SESS = JSON.parse(localStorage.getItem(SESS_KEY) || 'null'); } catch (e) { SESS = null; }
  const ME = { plus: { active: false }, packs: [], adUnlocks: {}, adToday: { used: 0, limit: 2 } };
  try {
    const cachedEnt = JSON.parse(localStorage.getItem(ENT_KEY) || 'null');
    if (cachedEnt && typeof cachedEnt === 'object') Object.assign(ME, cachedEnt);
  } catch (e) {}
  if (Array.isArray(S.packs) && S.packs.length) {
    S.packs.forEach(p => { if (!ME.packs.includes(p)) ME.packs.push(p); });
  }
  const DEMO_OK = () => !!CFG.demoPaywall && MODE.devEntitlement;
  const MJAnalytics = window.MJAnalytics || window.MJ_ANALYTICS || { shouldPrompt: () => false, setConsent: () => {}, track: () => {} };

  // ---------- 매일 리추얼·스트릭 ----------
  const DAILY_VERSES = [
    { text: '스스로를 등불로 삼고, 스스로에게 의지하라.', src: '열반경' },
    { text: '천 개의 촛불을 밝히는 것보다 하나의 촛불을 켜는 것이 어둠을 없애기에 더 낫다.', src: '법구경' },
    { text: '마음이 청정하면 세계도 청정하다.', src: '유마경' },
    { text: '어리석은 자가 현명한 이를 만나면 항상 그를 섬기되, 달이 별을 따르듯 하라.', src: '법구경' },
    { text: '한 번 일어난 생각이 온 세상을 뒤흔든다.', src: '화엄경' },
    { text: '모든 것은 변한다. 완전한 것은 아무것도 없다. 그것이 해탈의 길이다.', src: '법구경' },
    { text: '중생이 고통받을 때 부처도 고통받느니라.', src: '법화경' },
    { text: '한 손뼉 소리가 무엇인가?', src: '선어록' },
    { text: '꽃이 피는 것은 자연의 이치요, 꽃이 지는 것도 자연의 이치이다.', src: '법구경' },
    { text: '지금 이 한 생각이 곧 부처의 마음이다.', src: '육조단경' },
    { text: '사방으로 둘러보아도 이보다 더할 수 없이 훌륭한 곳, 이곳에 앉으리라.', src: '좌선의(儀)' },
    { text: '모든 중생에게 불성이 있다.', src: '열반경' },
    { text: '부지런히 정진하라. 게으르지 마라.', src: '법구경' },
    { text: '물이 소리에 구애되지 않고 흐르듯, 마음도 집착에 구애되지 않아야 한다.', src: '반야심경 강설' },
    { text: '작은 일도 소중히 여기는 것이 큰 길을 여는 첫걸음이다.', src: '화엄경' }
  ];
  function getDailyVerse() {
    const seed = Number(today().replace(/-/g, ''));
    return DAILY_VERSES[seed % DAILY_VERSES.length];
  }
  function updateStreak() {
    const td = today();
    if (!S.streakDate) { S.streak = 0; return; }
    const diff = Math.floor((new Date(td) - new Date(S.streakDate)) / 86400000);
    if (diff > 1) {
      if (S.streakFreezes > 0 && diff === 2) {
        S.streakFreezes--;
        S.streakDate = td;
        save();
        return;
      }
      S.streak = 0;
    }
  }
  function recordRitual() {
    const td = today();
    if (S.streakDate === td) return;
    const diff = S.streakDate ? Math.floor((new Date(td) - new Date(S.streakDate)) / 86400000) : 1;
    S.streak = diff <= 1 ? (S.streak || 0) + 1 : 1;
    S.streakDate = td;
    save();
    MJAnalytics.track('ritual_complete', { feature: 'daily' });
  }
  function ritualDoneToday() { return S.streakDate === today(); }
  function streakMilestoneHTML(n) {
    if (n >= 100) return '🏆';
    if (n >= 30) return '🔥';
    if (n >= 7) return '✨';
    return '📿';
  }

  // ---------- 온보딩 ----------
  const ONBOARD_STEPS = [
    { q: '어떤 것이 궁금하세요?', opts: [{ k: 'healing', label: '🧘 힐링·쉼' }, { k: 'history', label: '📜 역사·이야기' }, { k: 'prayer', label: '🙏 기도·기원' }, { k: 'photo', label: '📷 사진 명소' }, { k: 'course', label: '🗺️ 코스·여행' }] },
    { q: '어디에 계세요?', opts: [{ k: 'seoul', label: '서울·경기' }, { k: 'busan', label: '부산·경남' }, { k: 'daegu', label: '대구·경북' }, { k: 'gangwon', label: '강원' }, { k: 'jeonnam', label: '전남·광주' }, { k: 'other', label: '기타 지역' }] },
    { q: '어떤 분과 함께하세요?', opts: [{ k: 'solo', label: '혼자 조용히' }, { k: 'family', label: '가족·부모님' }, { k: 'couple', label: '연인·친구' }, { k: 'group', label: '모임·단체' }] }
  ];
  let onboardingStep = 0;
  let onboardingChoices = {};
  function onboardingInterestToThemes(interest) {
    const map = { healing: ['quiet', 'autumn'], history: ['history', 'legend'], prayer: ['prayer', 'wish', 'energy'], photo: ['photo', 'sea'], course: ['hike', 'sea', 'fengshui'] };
    return map[interest] || ['quiet'];
  }
  function onboardingRegionToSido(region) {
    const map = { seoul: ['서울', '경기', '인천'], busan: ['부산', '경남', '울산'], daegu: ['대구', '경북'], gangwon: ['강원'], jeonnam: ['전남', '광주', '전북'], other: null };
    return map[region] || null;
  }
  function onboardingRecommend() {
    const themes = onboardingInterestToThemes(onboardingChoices[0]);
    const sidos = onboardingRegionToSido(onboardingChoices[1]);
    let pool = TEMPLES.filter(t => t.themes.some(th => themes.includes(th)));
    if (sidos) {
      const near = pool.filter(t => sidos.includes(t.sido));
      if (near.length >= 2) pool = near;
    }
    const seed = Number(today().replace(/-/g, ''));
    return pool.slice(0, 10).sort((a, b) => ((seed + a.name.length) % 7) - ((seed + b.name.length) % 7)).slice(0, 3);
  }
  function viewOnboarding() {
    const step = ONBOARD_STEPS[onboardingStep];
    if (!step) return '';
    const chosen = onboardingChoices[onboardingStep];
    const isLast = onboardingStep === ONBOARD_STEPS.length - 1;
    return `<div class="onboard-card">
      <div class="onboard-progress">${ONBOARD_STEPS.map((_, i) => `<span class="${i <= onboardingStep ? 'on' : ''}"></span>`).join('')}</div>
      <h2>${esc(step.q)}</h2>
      <div class="onboard-opts">${step.opts.map(o => `<button class="onboard-opt ${chosen === o.k ? 'on' : ''}" data-act="onboard-pick" data-key="${o.k}" data-step="${onboardingStep}">${esc(o.label)}</button>`).join('')}</div>
      <div class="onboard-nav">
        ${onboardingStep > 0 ? '<button class="btn ghost" data-act="onboard-back">이전</button>' : ''}
        ${isLast ? '<button class="btn" data-act="onboard-done" disabled>절로가 시작하기</button>' : '<button class="btn" data-act="onboard-next" disabled>다음</button>'}
      </div>
    </div>`;
  }
  function viewOnboardingResult() {
    const picks = onboardingRecommend();
    const interest = ONBOARD_STEPS[0].opts.find(o => o.k === onboardingChoices[0]);
    return `<div class="onboard-card onboard-result">
      <div class="onboard-progress">${ONBOARD_STEPS.map(() => '<span class="on"></span>').join('')}</div>
      <h2>${interest ? interest.label.split(' ').slice(1).join(' ') : ''}에 어울리는 사찰 3곳</h2>
      <p class="sub">오늘 가기 좋은 곳을 골라 봤어요. 이야기를 읽고 직접 순례해 보세요.</p>
      <div class="tlist">${picks.map(t => templeItem(t)).join('')}</div>
      <button class="btn block" data-act="onboard-enter" style="margin-top:12px">절로가 시작하기</button>
      <p class="sub" style="text-align:center;margin-top:8px;font-size:.82em">나중에 언제든 설정을 바꿀 수 있어요</p>
    </div>`;
  }
  const STORY_CACHE = {}, STORY_PENDING = {};
  const TEMPLE_EXTRAS_CACHE = {}, TEMPLE_EXTRAS_PENDING = {};

  let sessPromise = null;
  async function ensureSession() {
    if (SESS && SESS.token) return SESS;
    if (sessPromise) return sessPromise;
    sessPromise = fetch(API + '/api/session', { method: 'POST' })
      .then(r => r.json())
      .then(d => {
        sessPromise = null;
        if (d && d.token) {
          SESS = { uid: d.uid, token: d.token };
          try { localStorage.setItem(SESS_KEY, JSON.stringify(SESS)); } catch (e) {}
        }
        return SESS;
      })
      .catch(() => { sessPromise = null; return null; });
    return sessPromise;
  }

  async function api(path, opts = {}) {
    await ensureSession();
    if (opts.body && typeof opts.body === 'object') opts = Object.assign({}, opts, { body: JSON.stringify(opts.body) });
    const send = () => fetch(API + path, Object.assign({}, opts, {
      headers: Object.assign(SESS && SESS.token ? { Authorization: 'Bearer ' + SESS.token } : {}, opts.body ? { 'Content-Type': 'application/json' } : {})
    }));
    let res = await send();
    if (res.status === 401 && SESS) {          // 토큰 무효 → 새 세션으로 한 번 재시도
      SESS = null; ME.member = null;
      localStorage.removeItem(SESS_KEY); localStorage.removeItem(ENT_KEY);
      await ensureSession();
      res = await send();
    }
    let body = {}; try { body = await res.json(); } catch (e) {}
    return { ok: res.ok, status: res.status, body };
  }

  // 상단 '로그인' 칩: 회원이면 닉네임, 아니면 로그인 화면으로 보낸다
  function updateMemberChip() {
    const c = document.getElementById('memberChip');
    if (!c) return;
    const m = ME.member;
    c.innerHTML = ic('user') + `<span>${m ? esc(m.nickname) : '로그인'}</span>`;
    c.setAttribute('href', m ? '#/account' : '#/account/login');
    c.setAttribute('aria-label', m ? `${m.nickname} 님 · 내 정보` : '로그인하거나 회원가입');
    c.classList.toggle('on', !!m);
  }
  // 로그인·가입·로그아웃 결과를 세션에 반영한다. next 가 null 이면 익명 세션으로 돌아간다.
  async function applySession(next) {
    if (next) { SESS = { uid: next.uid, token: next.token }; ME.member = next.member || null; }
    else { SESS = null; ME.member = null; localStorage.removeItem(SESS_KEY); }
    try { if (SESS) localStorage.setItem(SESS_KEY, JSON.stringify(SESS)); } catch (e) {}
    if (!next) await ensureSession();
    updateMemberChip();
    await syncMe();
  }
  // 같은 화면을 다시 그린다 — 스크롤을 건드리지 않아 댓글을 달아도 화면이 튀지 않는다
  function refreshView() {
    const parts = (location.hash || '#/home').slice(2).split('/').map(decodeURIComponent);
    if (parts[0] !== 'board' && parts[0] !== 'account') return;
    const m = communityMod();
    if (m) $view.innerHTML = m.view(parts[0], parts[1], parts[2]);
  }
  // 해시를 바꾸고, 해시가 이미 같으면 직접 다시 그린다 (hashchange 는 같은 값이면 울리지 않는다)
  function goHash(h) {
    if (location.hash === h) navigate(); else location.hash = h;
  }

  function syncMe() {
    return api('/api/me').then(r => {
      if (!r.ok || !r.body) return;
      if (r.body.mode) Object.assign(MODE, r.body.mode);
      if (r.body.plus) ME.plus = r.body.plus;
      if (r.body.member !== undefined) ME.member = r.body.member;
      updateMemberChip();
      if (Array.isArray(r.body.packs)) {
        ME.packs = r.body.packs.slice();
        (S.packs || []).forEach(p => { if (!ME.packs.includes(p)) ME.packs.push(p); });
      }
      if (r.body.adUnlocks) ME.adUnlocks = r.body.adUnlocks;
      if (r.body.adToday) ME.adToday = r.body.adToday;
      try { localStorage.setItem(ENT_KEY, JSON.stringify({ plus: ME.plus, packs: ME.packs, adUnlocks: ME.adUnlocks, adToday: ME.adToday, member: ME.member })); } catch (e) {}
    });
  }
  syncMe();
  function save() {
    try { localStorage.setItem(KEY, JSON.stringify(S)); }
    catch (e) { toast('저장 공간이 부족해요. 사진 크기를 줄이거나 오래된 기록을 지워 주세요.'); }
  }

  // ---------- 유틸 ----------
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const today = () => { const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };
  const fmtDate = iso => { const d = new Date(iso); return isNaN(d) ? esc(iso) : `${d.getFullYear()}.${d.getMonth() + 1}.${d.getDate()}`; };
  const sealChar = t => t.name.replace(/\(.*\)/, '').trim().charAt(0);
  function toast(msg) { const el = document.getElementById('toast'); if (!el) return; el.textContent = msg; el.classList.add('show'); clearTimeout(toast._t); toast._t = setTimeout(() => el.classList.remove('show'), 2600); }
  window.MJ_TOAST = toast;
  const fmtDist = m => m >= 1000 ? (m / 1000).toFixed(1) + 'km' : Math.round(m) + 'm';
  // GPS 반경·구간 거리용 지구 표면 거리 (미터). 호출부에서 /1000 하면 km.
  function haversine(lat1, lng1, lat2, lng2) {
    const R = 6371000;
    const rad = x => x * Math.PI / 180;
    const dLat = rad(lat2 - lat1), dLng = rad(lng2 - lng1);
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(dLng / 2) ** 2;
    return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
  }
  const val = v => (!v || /확인 필요/.test(v)) ? `<span class="needs">${esc(v || '확인 필요')}</span>` : esc(v);

  // ---------- 진행도 ----------
  const GRADES = [{ n: 1, name: '입문' }, { n: 10, name: '발심' }, { n: 30, name: '정진' }, { n: 60, name: '원만' }, { n: 100, name: '회향' }];
  const visited = () => new Set(S.visits.filter(v => !v.sample).map(v => v.tid));
  function gradeInfo(cnt) {
    let cur = null, next = GRADES[0];
    for (const g of GRADES) { if (cnt >= g.n) { cur = g; next = null; } else { next = g; break; } }
    return { cur, next, left: next ? next.n - cnt : 0 };
  }
  const beads = () => Math.min(108, S.visits.filter(v => !v.sample).length);
  const MISSIONS = [
    { id: 'chongnim', icon: '🏯', name: '7대 총림 완주', ids: ['haeinsa', 'tongdosa', 'songgwangsa', 'sudeoksa', 'baegyangsa', 'donghwasa', 'ssanggyesa'], reward: '총림 배지', note: '총림 지정 현황은 최신 조계종 자료로 확인 필요' },
    { id: 'sambo', icon: '💎', name: '삼보사찰 순례', ids: ['tongdosa', 'haeinsa', 'songgwangsa'], reward: '삼보 배지' },
    { id: 'unesco', icon: '🌏', name: '유네스코 산사 7곳', ids: ['tongdosa', 'buseoksa', 'bongjeongsa', 'beopjusa', 'magoksa', 'seonamsa', 'daeheungsa'], reward: '세계유산 배지' },
    { id: 'gwaneum', icon: '🌊', name: '3대 관음성지', ids: ['naksansa', 'bomunsa', 'boriam'], reward: '관음 배지' },
    { id: 'jeokmyeol', icon: '✨', name: '5대 적멸보궁', ids: ['tongdosa', 'sangwonsa', 'jeongamsa', 'bongjeongam', 'beopheungsa'], reward: '보궁 배지' },
    { id: 'hundred', icon: '📿', name: '100대 사찰 순례', target: 100, reward: '최종 인증서', note: '현재 MVP 수록 ' + TEMPLES.length + '곳 · 100대 목록은 선정 기준 확정 후 추가' },
    { id: 'month', icon: '🗓️', name: '이번 달 챌린지', monthly: 2, reward: '포인트 2배(예정)' }
  ];
  function missionProgress(m) {
    const v = visited();
    if (m.ids) { const done = m.ids.filter(i => v.has(i)).length; return { done, total: m.ids.length, left: m.ids.filter(i => !v.has(i)) }; }
    if (m.target) return { done: v.size, total: m.target, left: [] };
    if (m.monthly) { const ym = today().slice(0, 7); const set = new Set(S.visits.filter(x => !x.sample && x.date.slice(0, 7) === ym).map(x => x.tid)); return { done: Math.min(set.size, m.monthly), total: m.monthly, left: [] }; }
  }

  // ---------- 마음 처방전 ----------
  const MOODS = [
    { icon: '😮‍💨', label: '지쳤어요', themes: ['quiet', 'autumn'], line: '오늘은 아무것도 하지 않아도 괜찮아요. 숲길을 천천히 걸어 보세요.' },
    { icon: '🌀', label: '마음이 복잡해요', themes: ['quiet', 'hike'], line: '걸음에 숨을 맞추다 보면 생각이 조금씩 가라앉아요.' },
    { icon: '✨', label: '설레요', themes: ['photo', 'sea'], line: '설레는 마음 그대로, 예쁜 풍경을 담으러 떠나 볼까요?' },
    { icon: '🙏', label: '바라는 게 있어요', themes: ['wish', 'energy'], line: '바람을 마음속으로 또박또박 정리해 보는 시간을 가져 보세요.' },
    { icon: '🍂', label: '쓸쓸해요', themes: ['legend', 'city'], line: '오래된 이야기가 깃든 곳에서 잠시 이야기 친구를 만나 보세요.' },
    { icon: '🌼', label: '감사해요', themes: ['family', 'history'], line: '고마운 사람과 함께 걷기 좋은 곳을 골랐어요.' }
  ];
  function prescribe(mi, shift) {
    const m = MOODS[mi]; const pool = TEMPLES.filter(t => t.themes.some(th => m.themes.includes(th)));
    const seed = Number(today().replace(/-/g, '')) + mi * 7 + (shift || 0);
    return pool[seed % pool.length];
  }


  // ---------- 절로가 플러스 (유료화 프런트엔드 데모 · 실제 결제 없음) ----------
  const PLANS = {
    monthly: { name: '월간', price: '월 4,900원', sub: '언제든 해지 가능' },
    yearly: { name: '연간', price: '연 39,000원', sub: '월 3,250원꼴 · 월간 대비 34% 절약', best: '추천' },
    webYearly: { name: '웹 전용 연간', price: '연 29,000원', sub: '월 2,417원꼴 · 웹 결제 46%↓ · 카드·간편결제', best: '최저가', badge: 'web' },
    lifetime: { name: '평생 이용권', price: '89,000원', sub: '한 번만 · 영구 이용 · 한정 판매', badge: 'lifetime' }
  };
  // 콘텐츠 상점: 앱 안의 원작 정보·콘텐츠만 판매 (사찰 제휴·수수료·실물 굿즈 없음)
  const STORE = [
    { id: 'pack-south-coast', kind: '코스팩', icon: '🌊', name: '남해안 관음·기운 순례 코스팩', price: '3,900원', plus: true, courses: ['gwaneum4', 'namhae'], desc: '보리암·향일암·낙산사·보문사·남해 용문사 — 일정표·구간 거리·연계 미션', go: '#/explore/theme/wish' },
    { id: 'pack-gangwon-jeokmyeol', kind: '코스팩', icon: '✨', name: '5대 적멸보궁 순례 코스팩', price: '3,900원', plus: true, courses: ['jeokmyeol'], desc: '강원 2박 3일 + 봉정암 별도 일정 + 통도사 — 산행 안전 안내 포함', go: '#/explore/theme/energy' },
    { id: 'guide-prayer', kind: 'PDF 가이드북', icon: '📕', name: '전국 기도처 가이드북 (PDF로 저장)', price: '5,900원', plus: false, desc: '기도처로 이름난 사찰의 기도 대상·알려진 이유·찾아가는 법·예절을 한 권으로. 인쇄·PDF 저장 가능', go: '#/guide/prayer' },
    { id: 'report-autumn2026', kind: '시즌 리포트', icon: '🍁', name: '2026 가을 단풍 사찰 리포트', price: '2,900원', plus: true, desc: '단풍 사찰 동선·관람 팁·혼잡 피하는 요령 모음', go: '#/season-report' },
    { id: 'pack-autumn2026', kind: '한정 스탬프', icon: '🍂', name: '2026 가을 단풍 한정 스탬프팩', price: '2,900원', plus: true, desc: '10~11월 단풍 사찰 방문 시 한정 디지털 스탬프', go: '#/missions' },
    { id: 'reading-mind', kind: '개인화 리포트', icon: '🔮', name: '마음 처방전 심화 리포트 (재미로 보기)', price: '2,900원', plus: true, desc: '최근 고른 기분을 바탕으로 이번 주 걷기 루틴·사찰 3곳·한 문장. 예측·효험 아님', go: '#/mind' },
    { id: 'skin-maple', kind: '꾸미기', icon: '📿', name: '염주 스킨 「단풍 염주」', price: '1,900원', plus: false, desc: '나의 순례 화면의 108 염주 색을 단풍빛으로 바꿔요 (디지털 꾸미기)', go: '#/missions' }
  ];
  const storeById = Object.fromEntries(STORE.map(x => [x.id, x]));
  // 단품 보유 판정은 서버 목록(ME.packs)만 본다
  const owns = id => (ME.packs || []).includes(id) || (isPlus() && storeById[id] && storeById[id].plus);
  const PLUS_BENEFITS = [
    ['사찰 탐색·지도·전통사찰 991곳 검색', true, true],
    ['GPS 방문 인증·기본 스탬프·108 염주·등급·도감·미션', true, true],
    ['사찰별 기본 전설 1편 · 기도 안내·예절 · 출처', true, true],
    ['사찰 수첩 · 오늘의 마음 처방전', true, true],
    ['📖 원작 심화 스토리 시리즈 (편마다 첫 장은 무료)', '첫 장 + 광고 보고 24시간', true],
    ['전설·풍수 심화 해설 전체', '1편', true],
    ['🎧 오디오 순례 가이드', false, true],
    ['테마·지역 순례 코스 플래너 (코스팩 전부)', '단품 구매', true],
    ['⬇ 오프라인 저장 (산중 통신 불안 대비)', false, true],
    ['📊 나의 순례 리포트 전체 · 연말 결산', '요약만', true],
    ['계절 리포트·한정 디지털 스탬프', '단품 구매', true],
    ['🔮 마음 처방전 심화 리포트 (재미로 보기)', '단품 구매', true],
    ['광고', '선택형 보상 광고만', '없음']
  ];
  const FEAT = {
    legend: { t: '전설 심화 이야기', d: '사찰마다 전해지는 이야기를 모두 읽을 수 있어요.' },
    fengshui: { t: '풍수 심화 해설', d: '풍수 해설 전체를 볼 수 있어요. (전해지는 이야기·개인 견해를 직접 정리)' },
    story: { t: '원작 심화 스토리', d: '이 앱이 공개 자료를 바탕으로 직접 쓴 사찰 이야기 시리즈를 끝까지 읽어요.' },
    audio: { t: '오디오 순례 가이드', d: '걸으면서 이야기와 관람 동선을 귀로 들어요.' },
    offline: { t: '오프라인 저장', d: '산속처럼 통신이 약한 곳에서도 사찰 정보를 볼 수 있어요.' },
    course: { t: '순례 코스 플래너', d: '동선 순서·구간별 직선거리·함께 채워지는 미션을 한눈에 봐요. 코스팩 단품으로도 열 수 있어요.' },
    season: { t: '계절 한정 스탬프', d: '계절마다 그때만 받을 수 있는 디지털 스탬프를 모아요.' },
    report: { t: '나의 순례 리포트', d: '내 방문·수첩 기록으로 만든 순례 통계와 연말 결산을 봐요. (이 기기 데이터로만 계산)' },
    general: { t: '절로가 플러스', d: '심화 스토리·오디오·코스 플래너·오프라인·순례 리포트를 모두 이용해요.' }
  };
  function plusState() {
    const p = S.plus; if (!p) return { on: false };
    const trialDays = 14;
    if (p.status === 'trial') {
      const used = Math.floor((Date.now() - new Date(p.start).getTime()) / 86400000);
      const left = trialDays - used;
      if (left <= 0) return { on: false, expired: true };
      return { on: true, trial: true, left, plan: p.plan };
    }
    return { on: true, plan: p.plan };
  }
  const isPlus = () => plusState().on;
  function lockBlock(feat, previewHtml) {
    const f = FEAT[feat] || FEAT.general;
    return `<div class="locked"><div class="preview">${previewHtml || ''}</div>
      <div class="lockbar"><span>${ic('lock')} <b>${f.t}</b>는 플러스에서 이어서 볼 수 있어요</span><button class="btn small ghost" data-act="paywall" data-feat="${feat}">자세히 보기</button></div></div>`;
  }
  const LEGAL = `<ul class="legal" style="padding-left:22px">
      <li>🧪 <b>데모 화면</b>이에요. 지금은 실제 결제가 일어나지 않아요.</li>
      <li>출시 후 구독은 해지하기 전까지 선택한 주기(월/연)마다 <b>자동 갱신</b>되며, 갱신일 24시간 전까지 앱 마켓 구독 관리에서 해지할 수 있어요.</li>
      <li>7일 무료 체험이 끝나도 <b>별도 동의 없이 유료로 넘어가지 않아요.</b> 체험→유료 전환이나 가격 인상 때는 전환 30일 이내에 일시·변동 전후 가격·결제 방법을 알리고 다시 동의를 받아요.</li>
      <li>해지는 가입만큼 쉽게 — 설정 &gt; 구독 관리에서 한 번에 할 수 있게 만들 예정이에요.</li>
      <li>청약철회·환불은 전자상거래법과 앱 마켓 정책을 따르며, 출시 전 법률 검토를 거쳐 확정해요.</li>
    </ul>`;
  function planCards() {
    const main = ['monthly', 'yearly'].map(k => [k, PLANS[k]]);
    const extra = ['webYearly', 'lifetime'].map(k => [k, PLANS[k]]);
    return `<div class="plans">${main.map(([k, p]) => `<button class="plan ${S.plan === k ? 'on' : ''}" data-act="plan" data-plan="${k}">${p.best ? `<span class="best">${p.best}</span>` : ''}<div class="sub">${p.name}</div><div class="price">${p.price}</div><div class="sub plan-sub">${p.sub}</div></button>`).join('')}</div>
      <div class="plans plans-extra">${extra.map(([k, p]) => `<button class="plan ${S.plan === k ? 'on' : ''}" data-act="plan" data-plan="${k}">${p.best ? `<span class="best">${p.best}</span>` : ''}${p.badge === 'web' ? '<span class="tag">웹 결제</span> ' : p.badge === 'lifetime' ? '<span class="tag">평생</span> ' : ''}<div class="sub">${p.name}</div><div class="price">${p.price}</div><div class="sub plan-sub">${p.sub}</div></button>`).join('')}</div>`;
  }
  function openPaywall(feat) {
    MJAnalytics.track('paywall_view', { feature: feat || 'general' });
    const f = FEAT[feat] || FEAT.general, ps = plusState();
    const webNote = S.plan === 'webYearly' || S.plan === 'lifetime' ? `<p class="notice" style="margin:6px 0 0">💳 <b>웹 결제</b>: 앱스토어 수수료(15~30%) 없이 카드·간편결제로 직접 결제해요. 같은 상품, 더 저렴한 가격.</p>` : '';
    const trialLabel = ps.expired ? '플러스 시작 (데모)' : '14일 무료 체험 (데모)';
    openModal(`<div class="sheet"><div class="row between"><h2 style="margin:0">✨ ${f.t}</h2><span class="demo-ribbon">데모</span></div>
      <p>${f.d}</p>
      <ul style="padding-left:18px;margin:6px 0">${PLUS_BENEFITS.filter(b => b[1] !== true && b[2] === true).map(b => `<li>${b[0]}</li>`).join('')}</ul>
      ${planCards()}
      ${webNote}
      ${ps.expired ? '<p class="notice">체험 기간이 끝났어요. 계속 이용하려면 아래에서 직접 선택해 주세요. (자동으로 결제되지 않았어요)</p>' : ''}
      <div class="grid2" style="margin-top:6px"><button class="btn ghost" data-act="close">무료로 계속하기</button><button class="btn" data-act="trial-start">${trialLabel}</button></div>
      <div class="row" style="margin-top:8px;justify-content:center"><button class="btn ghost small" data-act="gift-open">🎁 선물하기 (부모님·친구)</button></div>
      ${LEGAL}
      <p class="sub" style="text-align:center;margin:8px 0 0"><a href="#/plus" data-act="close">요금제·혜택 자세히 보기</a> · <a href="#/store" data-act="close">구독 없이 단품 보기</a></p></div>`);
  }
  function viewPlus() {
    const ps = plusState();
    const status = ps.on ? (ps.trial ? `<div class="statusbar trial">🧪 데모 무료 체험 중 · <b>${ps.left}일</b> 남음 (${PLANS[ps.plan || 'yearly'].price} 선택). 체험이 끝나도 자동 결제되지 않아요.</div>` : `<div class="statusbar">🧪 데모 플러스 이용 중 (${PLANS[ps.plan || 'yearly'].price})</div>`)
      : (ps.expired ? '<div class="statusbar trial">체험이 끝났어요. 동의 없이 결제되지 않았어요.</div>' : '');
    const cell = v => v === true ? `<span class="yes">${ic('check')}<span class="sr">포함</span></span>` : v === false ? `<span class="no">—</span>` : `<span class="sub">${esc(v)}</span>`;
    return `<div class="screen-head"><h1>절로가 플러스 <span class="demo-ribbon">데모 · 실제 결제 없음</span></h1><p class="sub">순례·지도·스탬프·기도 안내는 언제나 무료예요. 플러스는 이 앱이 직접 만드는 이야기와 여행 도구에 씁니다.</p></div>
    ${status}
    <section class="card hero" style="border-left:4px solid var(--gold)">
      <div class="row between">
        <div>
          <span class="tag ok">✨ Google AI Pro 적용됨</span>
          <h2 style="margin:4px 0 2px">Google AI Pro 도슨트 · 마음 상담 엔진</h2>
          <div class="sub">모델: <b>${esc((CFG && CFG.aiModel) || 'gemini-4-argon')}</b> · 폴백: ${esc((CFG && CFG.aiFallbackModel) || 'gemini-3.8-flash')}</div>
        </div>
        <button class="btn small" data-act="ai-counsel">AI 상담 열기</button>
      </div>
    </section>
    <section class="card hero"><p style="margin:0 0 6px"><b>순례·지도·스탬프·기도 안내는 계속 무료</b>예요. 플러스는 이 앱이 직접 만드는 <b>깊은 이야기와 여행 도구</b>를 위한 선택이에요.</p>
      ${planCards()}
      <div class="grid2">${ps.on ? `<button class="btn ghost" data-act="plus-off">구독 해지 (데모)</button><a class="btn ghost" style="text-align:center;text-decoration:none" href="#/story/haeinsa-1">심화 스토리 읽기</a>` : `<button class="btn ghost" data-act="plus-on">🧪 바로 플러스 켜기</button><button class="btn" data-act="trial-start">7일 무료 체험 (데모)</button>`}</div>
      ${LEGAL}</section>
    <section class="card"><h2>플러스에 담긴 원작 콘텐츠</h2>
      <div class="tlist">
        <a class="titem" href="#/story/haeinsa-1"><div class="seal" style="background:var(--gold)">📖</div><div class="meta"><b>심화 스토리 시리즈</b><div class="sub">1편 공개: 해인사 「나무 8만 장이 바다를 건너 산에 오르기까지」 · 다음 편 ${STORY_SOON.length}편 제작 예정</div></div></a>
        <a class="titem" href="#/report"><div class="seal" style="background:var(--gold)">📊</div><div class="meta"><b>나의 순례 리포트 · 연말 결산</b><div class="sub">내 기록으로 계산 (이 기기 안에서만)</div></div></a>
        <a class="titem" href="#/explore/theme/wish"><div class="seal" style="background:var(--gold)">🧭</div><div class="meta"><b>순례 코스 플래너</b><div class="sub">코스팩 전부 포함 · 동선·구간 거리·미션 연계</div></div></a>
        <a class="titem" href="#/store"><div class="seal" style="background:var(--gold)">🛍</div><div class="meta"><b>시즌 리포트·한정 스탬프·마음 처방전 심화</b><div class="sub">콘텐츠 상점의 '플러스 포함' 상품</div></div></a>
      </div></section>
    <section class="card"><h2>무료 vs 플러스</h2><table class="cmp"><tr><th>기능</th><th>무료</th><th>플러스</th></tr>
      ${PLUS_BENEFITS.map(b => `<tr><td>${b[0]}</td><td>${cell(b[1])}</td><td>${cell(b[2])}</td></tr>`).join('')}</table></section>
    <section class="card"><h2>구독이 부담스럽다면</h2><p>필요한 콘텐츠만 1회 결제로 살 수 있어요. 자동 갱신은 없어요.</p><a class="btn ghost block" style="text-align:center;text-decoration:none" href="#/store">🛍 콘텐츠 상점 보기</a></section>
    <p class="notice">🙏 절로가 앱은 신앙을 판매하지 않아요. 기도 안내·예절·출처는 언제나 무료이고, 소원 성취나 효험을 약속하는 상품(부적·기도 대행·소원권 등)은 만들지 않아요. 판매하는 것은 이 앱이 직접 만든 정보·이야기·도구뿐이에요.</p>`;
  }

  // ---------- 콘텐츠 상점 (데모 · 실제 결제 없음) ----------
  function viewStore() {
    const kinds = [...new Set(STORE.map(x => x.kind))];
    return `<div class="screen-head"><h1>콘텐츠 상점 <span class="demo-ribbon">데모 · 실제 결제 없음</span></h1>
      <p class="sub">이 앱이 직접 만든 디지털 콘텐츠만 팔아요. 1회 결제이고 자동 갱신이 없어요.</p></div>
      ${kinds.map(k => `<section class="card"><h2>${esc(k)}</h2><div class="tlist">${STORE.filter(x => x.kind === k).map(storeRow).join('')}</div></section>`).join('')}
      <section class="card"><h2>구매 전 꼭 읽어 주세요</h2><ul class="legal" style="padding-left:20px">
        <li>🧪 데모라서 누르면 바로 '보유'로 표시돼요. 실제 결제는 일어나지 않아요.</li>
        <li>'플러스 포함' 상품은 플러스(체험 포함) 이용 중에는 따로 사지 않아도 돼요. 이미 플러스라면 중복 결제하지 마세요.</li>
        <li>디지털 콘텐츠는 열람·내려받기를 시작하면 청약철회가 제한될 수 있어요. 출시 때 상품마다 미리보기를 주고, 제한 사실을 결제 전에 알려 드려요.</li>
        <li>만 19세 미만은 법정대리인 동의 없이 결제한 경우 취소할 수 있어요. 출시 때 결제 비밀번호·연령 확인을 앱 마켓 설정과 함께 안내해요.</li>
        <li>운세처럼 보이는 콘텐츠(🔮)는 재미로 보는 읽을거리예요. 미래 예측·효험·의학적 조언이 아니에요.</li>
      </ul></section>`;
  }
  function storeRow(o) {
    const have = owns(o.id), bought = (ME.packs || []).includes(o.id) || S.packs.includes(o.id);
    const right = have ? `<a class="btn small ghost" style="text-decoration:none" href="${o.go}">${o.id === 'skin-maple' ? '보기' : '열기'}</a>` : `<button class="btn small" data-act="buy" data-id="${o.id}">${o.price}</button>`;
    return `<div class="titem"><div class="seal" style="background:var(--gold)">${o.icon}</div><div class="meta" style="flex:1"><b>${esc(o.name)}</b><div class="sub">${esc(o.desc)}</div>
      <div>${o.plus ? '<span class="tag">플러스 포함</span>' : '<span class="tag">단품 전용</span>'}${have ? `<span class="tag ok">${bought ? '보유' : '플러스로 이용 중'}</span>` : `<span class="tag">${o.price} · 1회</span>`}${o.id === 'skin-maple' && bought ? `<button class="btn ghost small" data-act="skin" style="margin-left:4px">${S.skin === 'maple' ? '기본으로' : '적용하기'}</button>` : ''}</div></div>${right}</div>`;
  }

  // ---------- 심화 스토리 (원작 프리미엄 콘텐츠) ----------
  const DAY = 86400000, AD_DAILY = 2;
  const adLeft = () => AD_DAILY - Math.max(((S.adLog || {})[today()] || 0), (ME.adToday && ME.adToday.used) || 0);
  const adUnlocked = id => {
    const t = Math.max(((S.adUnlocks || {})[id] || 0), ((ME.adUnlocks || {})[id] || 0));
    return t > Date.now() ? t : 0;
  };
  const storyOpen = st => isPlus() || !!adUnlocked(st.id) || !!(STORY_CACHE[st.id] && STORY_CACHE[st.id].unlocked);
  function chapterHtml(c) {
    return `<section class="card chapter ${c.legend ? 'legend' : ''}">${c.legend ? `<span class="lbl">${ic('quote')} 전해지는 이야기</span>` : ''}<h2>${esc(c.h)}</h2>${c.body.map(x => `<p>${esc(x)}</p>`).join('')}</section>`;
  }
  // 잠긴 장이 포함된 전체 본문은 서버가 허용할 때만 내려온다. 여기서는 요청만 한다.
  function ensureStory(id) {
    if (STORY_CACHE[id] || STORY_PENDING[id]) return;
    STORY_PENDING[id] = true;
    api('/api/stories/' + encodeURIComponent(id)).then(r => {
      delete STORY_PENDING[id];
      if (!r.ok) return;
      STORY_CACHE[id] = r.body;
      const cur = (location.hash || '').slice(2).split('/');
      if (cur[0] === 'story' && decodeURIComponent(cur[1] || '') === id) render();
    }).catch(() => { delete STORY_PENDING[id]; });
  }
  function viewStory(id) {
    const st = STORIES.find(x => x.id === id); if (!st) return '<p>이야기를 찾을 수 없어요.</p>';
    const rawFull = RAW_STORIES.find(x => x.id === id);
    const full = STORY_CACHE[id] || (storyOpen(st) && rawFull ? Object.assign({}, rawFull, { unlocked: true }) : null);
    const open = !!(full && full.unlocked) || storyOpen(st);
    if (!STORY_CACHE[id] || (!STORY_CACHE[id].unlocked && open)) ensureStory(id);
    const chapters = (open && full && full.chapters) ? full.chapters : (open && rawFull ? rawFull.chapters : st.chapters);
    const t = byId[st.tid], adUntil = adUnlocked(st.id), adOn = !isPlus() && !!adUntil;
    const left = adOn ? Math.max(1, Math.round((adUntil - Date.now()) / 3600000)) : 0;
    return `<a href="javascript:history.back()" class="backlink">${ic('back')} 뒤로</a>
      <section class="card hero story-head">
        <h1>${esc(st.title)}</h1>
        <p class="lead">${esc(st.hook)}</p>
        <div class="tagrow"><span class="tag">${ic('book')} 심화 스토리 · ${esc(st.series)} ${st.ep}편</span><span class="tag">${ic('clock')} 약 ${st.minutes}분</span>${t ? `<span class="tag">${esc(t.name)}</span>` : ''}${isPlus() ? `<span class="tag ok">${ic('check')} 전체 열람 중</span>` : `<span class="tag lock">${ic('lock')} 첫 장 무료</span>`}</div>
        <div class="btn-group">
          <button class="btn ghost small" data-act="docent-story" data-id="${st.id}">${ic('headphones')} 이야기 듣기</button>
          ${t ? `<a class="btn ghost small" style="text-decoration:none" href="#/temple/${t.id}">${esc(t.name)} 상세${ic('chevron')}</a>` : ''}
        </div>
        ${adOn ? `<p class="statusbar trial">${ic('info')} 광고 보상으로 열림 · 약 ${left}시간 남음</p>` : ''}
      </section>
      ${open ? chapters.map(chapterHtml).join('') : chapterHtml(st.chapters[0]) + storyLock(st)}
      <section class="card"><h2>이 글은 이렇게 만들었어요</h2><p class="sub">공개된 역사 기록·백과사전의 <b>사실</b>을 바탕으로 이 앱이 직접 쓴 글이에요. 다른 글·영상의 문장을 옮기지 않았고, '전해지는 이야기' 표시가 있는 부분은 역사적 사실과 다를 수 있어요. 출시 전 전문가 감수를 받을 예정이에요.</p>
        <div class="src">참고: ${st.sources.map(x => `<a href="${x.u}" target="_blank" rel="noopener">${esc(x.t)}</a>`).join(' · ')}</div></section>
      <section class="card"><h2>다음 이야기 <span class="sub">제작 예정</span></h2><div class="tlist">${STORY_SOON.map(x => `<div class="titem"><div class="seal off">${esc((byId[x.tid] || { name: '?' }).name.charAt(0))}</div><div class="meta"><b>${esc(x.title)}</b><div class="sub">${esc((byId[x.tid] || {}).name || '')} ${x.ep}편</div></div></div>`).join('')}</div></section>`;
  }
  function storyLock(st) {
    const nxt = st.preview || (st.chapters && st.chapters[1]) || { h: '', body: [''] };
    const total = st.totalChapters || (RAW_STORIES.find(x => x.id === st.id) || { chapters: [] }).chapters.length || 2;
    const rest = Math.max(1, total - 1), n = adLeft();
    return `<div class="locked"><div class="preview"><b>${esc(nxt.h)}</b><br>${esc((nxt.body && nxt.body[0]) || '')}</div>
      <div style="margin-top:8px"><p class="lock-note">${ic('lock')} 나머지 <b>${rest}개 장</b>은 플러스에서 이어서 읽을 수 있어요.</p>
      <div class="btn-group lock-opts">
        <button class="btn ghost" data-act="ad" data-id="${st.id}" ${n > 0 ? '' : 'disabled'}>${ic('play')} 광고 보고 24시간<span class="sub">${n > 0 ? `오늘 ${n}회 남음 · 데모` : '오늘은 모두 사용했어요'}</span></button>
        <button class="btn" data-act="paywall" data-feat="story">플러스 알아보기<span class="sub">7일 무료 체험</span></button>
      </div></div></div>`;
  }
  function openAd(id) {
    if (adLeft() <= 0) { toast('오늘 볼 수 있는 보상 광고를 모두 봤어요. 내일 다시 열려요.'); return; }
    openModal(`<div class="sheet" style="text-align:center"><div class="row between"><b>보상형 광고</b><span class="demo-ribbon">데모 · 실제 광고 없음</span></div>
      <div class="adbox" id="adbox">광고 자리<span class="sub">출시 때 이 자리에 짧은 영상 광고(약 15~30초)가 나와요.<br>사찰·기도 화면 안에는 광고를 넣지 않아요.</span><div class="adcount" id="adcount">5</div></div>
      <div class="grid2" style="margin-top:10px"><button class="btn ghost" data-act="close">닫기 (보상 없음)</button><button class="btn" id="adreward" data-act="ad-reward" data-id="${esc(id)}" disabled>보상 받기</button></div>
      <p class="sub" style="font-size:.8em;margin:8px 0 0">하루 최대 ${AD_DAILY}회 · 광고는 원할 때만 봐요 · 자동 재생·전면 광고 없음</p></div>`);
    let n = 5; clearInterval(openAd._t);
    openAd._t = setInterval(() => { n--; const c = document.getElementById('adcount'), b = document.getElementById('adreward'); if (!c || !b) { clearInterval(openAd._t); return; } c.textContent = n > 0 ? n : '✓'; if (n <= 0) { b.disabled = false; clearInterval(openAd._t); } }, 1000);
  }

  // ---------- 나의 순례 리포트 (이 기기 데이터로 생성) ----------
  const SEASONS = m => m >= 3 && m <= 5 ? '봄' : m >= 6 && m <= 8 ? '여름' : m >= 9 && m <= 11 ? '가을' : '겨울';
  function reportData() {
    const vs = S.visits.filter(v => !v.sample).slice().sort((a, b) => a.date.localeCompare(b.date)).filter(v => byId[v.tid]);
    const journals = S.journal.filter(j => !j.sample);
    const uniq = [...new Set(vs.map(v => v.tid))].map(id => byId[id]);
    const cnt = (arr, f) => { const m = {}; arr.forEach(x => { const k = f(x); if (k) m[k] = (m[k] || 0) + 1; }); return Object.entries(m).sort((a, b) => b[1] - a[1]); };
    let km = 0; for (let i = 1; i < vs.length; i++) { const a = byId[vs[i - 1].tid], b = byId[vs[i].tid]; km += haversine(a.lat, a.lng, b.lat, b.lng) / 1000; }
    const yr = String(new Date().getFullYear());
    const yv = vs.filter(v => v.date.slice(0, 4) === yr);
    const months = new Set(vs.map(v => v.date.slice(0, 7)));
    return {
      vs, uniq, km: Math.round(km), sido: cnt(uniq, t => t.sido), themes: cnt(uniq.flatMap(t => t.themes.map(th => ({ th }))), x => x.th),
      seasons: cnt(vs, v => SEASONS(+v.date.slice(5, 7))), months: months.size, first: vs[0], last: vs[vs.length - 1],
      gps: vs.filter(v => v.method === 'gps').length, demo: vs.filter(v => v.method === 'demo').length,
      journal: journals.length, weather: cnt(journals, j => j.weather), yr, yv, yuniq: new Set(yv.map(v => v.tid)).size,
      missions: MISSIONS.filter(m => m.ids).filter(m => { const p = missionProgress(m); return p.done >= p.total; })
    };
  }
  function viewReport() {
    const d = reportData(), open = isPlus();
    const g = gradeInfo(d.uniq.length);
    const head = `<h1>나의 순례 리포트 ${open ? '' : '<span class="tag">플러스 미리보기</span>'}</h1><p class="sub">이 기기에 저장된 방문·수첩 기록만으로 계산해요. 서버로 보내지 않아요.</p>`;
    if (!d.vs.length) return head + `<section class="card"><p>아직 방문 기록이 없어요. 사찰 상세에서 GPS 인증(또는 🧪 데모 체크인)을 하면 리포트가 만들어져요.</p><a class="btn" style="text-decoration:none" href="#/explore">사찰 둘러보기</a></section>`;
    const summary = `<section class="card hero"><div class="sub">지금까지</div><div class="grade">${d.uniq.length}곳 · ${d.vs.length}번의 걸음</div>
      <p style="margin:6px 0 0">${d.sido.length}개 시·도를 다녔어요 · 현재 등급 <b>${g.cur ? g.cur.name : '첫걸음 전'}</b>${d.demo ? ` <span class="sub">(🧪 데모 ${d.demo}회 포함)</span>` : ''}</p>
      ${open ? '' : `<p class="sub" style="margin:6px 0 0">무료 미리보기 · 가장 많이 간 지역은 <b>${esc(d.sido[0][0])}</b>예요. 아래에서 발자취·취향·계절·연말 결산을 볼 수 있어요.</p>`}</section>`;
    const bar = (rows, label) => rows.slice(0, 4).map(([k, n]) => `<div class="row between"><span>${label(k)}</span><span class="sub">${n}</span></div><div class="progress" style="margin:2px 0 6px"><i style="width:${Math.round(n / rows[0][1] * 100)}%"></i></div>`).join('');
    const full = `
      <section class="card"><h2>🧭 순례 발자취</h2><dl class="kv">
        <dt>첫 순례</dt><dd>${fmtDate(d.first.date)} · ${esc(byId[d.first.tid].name)}</dd>
        <dt>최근 순례</dt><dd>${fmtDate(d.last.date)} · ${esc(byId[d.last.tid].name)}</dd>
        <dt>이동 거리</dt><dd>방문 순서대로 직선거리 합 약 ${d.km.toLocaleString()}km</dd>
        <dt>순례한 달</dt><dd>${d.months}개월</dd><dt>GPS 인증</dt><dd>${d.gps}회</dd>
        <dt>완주 미션</dt><dd>${d.missions.length ? d.missions.map(m => m.icon + ' ' + m.name).join(', ') : '아직 없어요'}</dd></dl></section>
      <section class="card"><h2>📍 많이 간 지역</h2>${bar(d.sido, k => esc(k))}</section>
      <section class="card"><h2>🏷 나의 순례 취향</h2>${bar(d.themes, k => THEMES[k] ? THEMES[k].icon + ' ' + THEMES[k].name : k)}
        <p class="sub" style="margin:4px 0 0">${d.themes[0] && THEMES[d.themes[0][0]] ? `'${THEMES[d.themes[0][0]].name}' 사찰을 가장 많이 찾았어요.` : ''}</p></section>
      <section class="card"><h2>🍂 계절별 걸음</h2>${bar(d.seasons, k => k)}</section>
      <section class="card"><h2>📔 수첩</h2><p style="margin:0">기록 ${d.journal}편${d.weather[0] ? ` · 가장 많았던 날씨 ${esc(d.weather[0][0])}` : ''}</p></section>
      <section class="card legend"><span class="lbl">${d.yr} 연말 결산 미리보기</span><h2 style="margin-top:8px">올해 ${d.yuniq}곳, ${d.yv.length}번 걸었어요</h2>
        <p class="sub" style="margin:0">12월에는 한 해 순례를 카드 한 장으로 정리해 저장·공유할 수 있게 만들 예정이에요.</p></section>`;
    return head + summary + (open ? full : lockBlock('report', full.replace(/<section/g, '<div').replace(/<\/section>/g, '</div>')));
  }

  // ---------- 단품 콘텐츠 화면 ----------
  function viewGuide() {
    const list = TEMPLES.filter(t => t.prayer); const own = owns('guide-prayer'); const E = window.PRAYER_ETIQUETTE;
    const entry = t => `<article class="card guide-entry"><h2 style="margin:0">${esc(t.name)} <span class="sub">${esc(t.sido)} ${esc(t.sgg)}</span></h2>
      <p style="margin:6px 0"><b>기도 대상</b> · ${esc(t.prayer.target)}</p><p class="sub" style="margin:0 0 4px">왜 알려졌을까 (전해지는 이야기)</p><ul>${t.prayer.why.map(x => `<li>${esc(x)}</li>`).join('')}</ul>
      ${t.prayer.how && t.prayer.how.length ? `<p class="sub" style="margin:0 0 4px">찾아가는 법</p><ul>${t.prayer.how.map(x => `<li>${esc(x)}</li>`).join('')}</ul>` : ''}
      <div class="src">출처: ${t.prayer.src.map(x => esc(x.t)).join(' · ')}</div></article>`;
    return `<div class="noprint"><a href="#/store" class="sub" style="text-decoration:none">← 상점</a></div>
      <h1>전국 기도처 가이드북 <span class="demo-ribbon">데모</span></h1><p class="sub">절로가 편집 · ${list.length}곳 · ${today().replace(/-/g, '.')} 판</p>
      <section class="card prayer"><h2 style="margin-top:0">기도처 예절</h2><ul>${E.items.map(x => `<li>${esc(x)}</li>`).join('')}</ul><p class="notice">${esc(E.note)}</p></section>
      ${own ? `<div class="noprint" style="margin:8px 0"><button class="btn block" data-act="print">🖨 PDF로 저장 / 인쇄</button></div>${list.map(entry).join('')}` : list.slice(0, 2).map(entry).join('') + `<div class="locked"><div class="preview">${list.slice(2, 5).map(t => esc(t.name)).join(' · ')} 외 ${list.length - 2}곳</div><div class="lockbar"><span>🔒 나머지 ${list.length - 2}곳은 가이드북 구매 후 볼 수 있어요</span><button class="btn small" data-act="buy" data-id="guide-prayer">5,900원 (데모)</button></div></div>`}
      <p class="notice">기도처에 전해지는 이야기를 정리한 안내서예요. 소원 성취나 효험을 보장하지 않아요. 기도 안내 기본 정보는 각 사찰 상세에서 언제나 무료로 볼 수 있어요.</p>`;
  }
  function viewSeasonReport() {
    const own = owns('report-autumn2026'); const pool = TEMPLES.filter(t => t.themes.includes('autumn'));
    const body = `<section class="card"><h2>이렇게 다녀오세요</h2><ul style="padding-left:18px;margin:0">
        <li>주말·연휴에는 사찰 진입로가 낮 시간에 붐비는 경향이 있어요. 이른 아침이나 늦은 오후 출발을 권해요.</li>
        <li>산중 사찰은 해가 빨리 져요. 하산 시간을 먼저 정하고 올라가세요.</li>
        <li>단풍 절정 시기는 해마다 달라요. 출발 전 산림청·기상청 단풍 정보를 확인하세요. (출시판은 시즌마다 갱신)</li></ul></section>
      <section class="card"><h2>단풍 사찰 ${pool.length}곳</h2><div class="tlist">${pool.map(t => `<a class="titem" href="#/temple/${t.id}"><div class="seal">${sealChar(t)}</div><div class="meta"><b>${esc(t.name)}</b><div class="sub">${esc(t.sido)} ${esc(t.sgg)} · ${esc(t.mountain)}</div><div class="sub">💡 ${esc(t.tip)}</div></div></a>`).join('')}</div></section>`;
    return `<a href="#/store" class="sub" style="text-decoration:none">← 상점</a><h1>🍁 2026 가을 단풍 사찰 리포트 <span class="demo-ribbon">데모</span></h1>
      ${own ? body : lockBlock('general', body.replace(/<section/g, '<div').replace(/<\/section>/g, '</div>')) + `<div class="row" style="margin-top:8px"><button class="btn small" data-act="buy" data-id="report-autumn2026">단품 2,900원 (데모)</button></div>`}`;
  }
  const MIND_LINES = ['걸음을 세지 말고 숨을 세어 보세요. 열까지 세면 다시 하나부터.', '오늘 마음에 걸린 일 하나를 수첩에 적고, 산문을 나설 때 내려놓는다고 생각해 보세요.', '서두르지 않아도 절은 그 자리에 있어요. 일주문에서 대웅전까지 평소의 절반 속도로 걸어 보세요.', '고마운 사람 한 명을 떠올리며 계단을 오르세요. 한 계단에 한 가지씩.', '풍경 소리가 들리면 잠시 멈춰서 소리가 사라질 때까지 들어 보세요.'];
  function viewMind() {
    const own = owns('reading-mind');
    const log = (S.moodLog || []).filter(x => x.date >= new Date(Date.now() - 7 * DAY).toISOString().slice(0, 10));
    const cntm = {}; log.forEach(x => cntm[x.mood] = (cntm[x.mood] || 0) + 1);
    const top = Object.entries(cntm).sort((a, b) => b[1] - a[1])[0]; const mi = top ? +top[0] : (S.moodIdx || 0); const m = MOODS[mi];
    const picks = [0, 1, 2].map(k => prescribe(mi, (S.shift || 0) + k * 3)).filter((t, i, a) => a.findIndex(x => x.id === t.id) === i);
    const seed = Number(today().replace(/-/g, '')) + mi;
    const body = `<section class="card hero"><div class="sub">최근 7일 마음 날씨</div><div class="grade">${m.icon} ${m.label}</div>
        <p class="sub" style="margin:4px 0 0">${log.length ? `${log.length}번 기분을 골랐어요: ${Object.entries(cntm).map(([k, n]) => MOODS[k].icon + n).join(' ')}` : '아직 기록이 적어서 오늘 고른 기분으로 만들었어요.'}</p></section>
      <section class="card"><h2>이번 주 걷기 루틴</h2><ol style="padding-left:20px;margin:0"><li>${esc(m.line)}</li><li>${esc(MIND_LINES[seed % MIND_LINES.length])}</li><li>${esc(MIND_LINES[(seed + 2) % MIND_LINES.length])}</li></ol></section>
      <section class="card"><h2>지금 마음에 어울리는 사찰 3곳</h2><div class="tlist">${picks.map(t => templeItem(t)).join('')}</div></section>
      <section class="card legend"><span class="lbl">${ic('quote')} 오늘의 한 문장</span><p style="margin:8px 0 0">${esc(MIND_LINES[(seed + 4) % MIND_LINES.length])}</p></section>`;
    return `<a href="#/home" class="backlink">${ic('back')} 홈</a><div class="screen-head"><h1>마음 처방전 심화 리포트</h1></div>
      <p class="notice">재미로 보는 읽을거리예요. 미래를 예측하거나 효험을 약속하지 않으며, 의학적·심리 상담을 대신하지 않아요. 마음이 많이 힘들면 전문가와 이야기해 보세요.</p>
      ${own ? body : lockBlock('general', body.replace(/<section/g, '<div').replace(/<\/section>/g, '</div>')) + `<div class="row" style="margin-top:8px"><button class="btn small" data-act="buy" data-id="reading-mind">단품 2,900원 (데모)</button></div>`}`;
  }

  // ---------- 테마 코스 (플러스) ----------
  const COURSES = [
    { id: 'gwaneum4', theme: 'wish', name: '4대 관음기도 도량 순례', stops: ['boriam', 'hyangiram', 'naksansa', 'bomunsa'], plan: ['남해안 1박 2일: 남해 보리암(일출) → 여수 향일암', '동해 당일: 양양 낙산사·홍련암', '서해 당일: 강화 보문사'], note: '4대 관음기도 도량 구성: 여수시·여행픽 소개 기준' },
    { id: 'exam', theme: 'wish', name: '수험생 가족 기도 코스', stops: ['dosunsa', 'chiljangsa', 'gatbawi'], plan: ['수도권 당일: 서울 도선사 석불전 → 안성 칠장사 합격 다리', '대구·경북 당일: 팔공산 갓바위 (왕복 약 3시간 산행)'], note: '수능 100일기도 등 일정은 사찰 공지에서 확인하세요' },
    { id: 'stone', theme: 'wish', name: '소원돌 이야기 사찰', stops: ['maneosa', 'wangsansa', 'jeju_gwaneumsa'], plan: ['밀양 만어사: 만어석·미륵전 바위', '포천 왕산사: 미륵불 곁 소원돌', '제주 관음사: 설문대할망 소원돌'], note: '재미로 즐기는 전해지는 이야기예요' },
    { id: 'jeokmyeol', theme: 'energy', name: '5대 적멸보궁 순례', stops: ['sangwonsa', 'jeongamsa', 'beopheungsa', 'bongjeongam', 'tongdosa'], plan: ['강원 2박 3일: 오대산 중대 → 정선 정암사 → 영월 법흥사', '설악산 봉정암: 장거리 산행, 별도 일정 (입산 통제·기상 확인)', '영남권 당일: 양산 통도사 금강계단'], note: '5대 적멸보궁: 한국민족문화대백과사전 기준' },
    { id: 'namhae', theme: 'energy', name: '남해 금산 기운 코스', stops: ['boriam', 'namhae_yongmunsa'], plan: ['새벽 보리암 일출·탑대 → 이성계 기도처(조선 태조 기단)', '오후 호구산 남해 용문사 (3대 용문사 중 "용의 꼬리")'], note: '헤럴드경제 사찰 기행 기준' }
  ];
  function courseCard(c) {
    const stops = c.stops.map(id => byId[id]).filter(Boolean);
    const legs = stops.slice(1).map((t, i) => Math.round(haversine(stops[i].lat, stops[i].lng, t.lat, t.lng) / 1000));
    const ms = MISSIONS.filter(m => m.ids && m.ids.some(id => c.stops.includes(id)));
    const head = `<div class="row between"><b>${esc(c.name)}</b><span class="tag">${stops.length}곳</span></div>
      <div class="sub">${stops.map(t => esc(t.name)).join(' · ')}</div>`;
    const packOwned = isPlus() || STORE.some(x => x.courses && x.courses.includes(c.id) && owns(x.id));
    if (!packOwned) return `<div class="course">${head}${lockBlock('course', `<ol>${c.plan.map(x => `<li>${esc(x)}</li>`).join('')}</ol>`)}</div>`;
    return `<div class="course">${head}<ol>${c.plan.map(x => `<li>${esc(x)}</li>`).join('')}</ol>
      <div class="sub">순서대로 구간 직선거리: ${legs.map((d, i) => `${esc(stops[i].name)}→${esc(stops[i + 1].name)} 약 ${d}km`).join(' · ')} <br>(실제 이동 시간은 길찾기로 확인하세요)</div>
      ${ms.length ? `<div class="sub" style="margin-top:4px">🏅 함께 채워지는 미션: ${ms.map(m => m.icon + ' ' + m.name).join(', ')}</div>` : ''}
      <div class="sub" style="margin-top:4px">${esc(c.note)}</div>
      <div class="row wrap" style="margin-top:6px">${stops.map(t => `<a class="chip" style="text-decoration:none" href="#/temple/${t.id}">${esc(t.name)}</a>`).join('')}</div>
      <div class="row" style="margin-top:8px"><button class="btn small ghost" data-act="course-to-plan" data-course="${esc(c.id)}">🗓️ 내 여행 계획으로 담기</button></div></div>`;
  }

  // ---------- 계절 한정 스탬프 ----------
  const SEASON = { id: 'pack-autumn2026', name: '2026 가을 단풍 한정 스탬프', from: '2026-10-01', to: '2026-11-30', theme: 'autumn' };
  function seasonCard() {
    const pool = TEMPLES.filter(t => t.themes.includes(SEASON.theme));
    const got = new Set(S.visits.filter(v => !v.sample && v.date.slice(0, 10) >= SEASON.from && v.date.slice(0, 10) <= SEASON.to && pool.some(t => t.id === v.tid)).map(v => v.tid));
    const owned = owns(SEASON.id);
    const inner = `<p class="sub" style="margin:0 0 6px">${SEASON.from.replace(/-/g, '.')} ~ ${SEASON.to.replace(/-/g, '.')} · 단풍 사찰 ${pool.length}곳 중 방문하면 한정 스탬프</p>
      <div class="row wrap">${pool.slice(0, 12).map(t => `<span class="tag ${got.has(t.id) ? 'ok' : ''}">🍁 ${esc(t.name)}</span>`).join('')}</div>`;
    return `<section class="card"><div class="row between"><h2 style="margin:0">🍁 계절 한정 스탬프</h2>${owned ? `<span class="tag ok">${got.size}개 획득</span>` : '<span class="tag">플러스·단품</span>'}</div>
      ${owned ? inner : lockBlock('season', inner)}
      ${owned ? '' : `<div class="row" style="margin-top:8px"><button class="btn ghost small" data-act="buy" data-id="${SEASON.id}">단품 2,900원 (데모)</button></div>`}</section>`;
  }

  // ---------- 오디오 (Web Speech API 데모) ----------
  function playAudio(id) {
    const t = byId[id]; if (!t) return;
    if (!isPlus()) { openPaywall('audio'); return; }
    if (!('speechSynthesis' in window)) { toast('이 브라우저는 음성 읽기를 지원하지 않아요.'); return; }
    const parts = [t.name + '. 전해지는 이야기입니다.'].concat([t.legend].concat(t.legends || []).filter(Boolean).map(l => l.title + '. ' + l.text));
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(parts.join(' ')); u.lang = 'ko-KR'; u.rate = 0.95;
    speechSynthesis.speak(u); toast('🎧 이야기를 읽어 드려요 (데모: 기기 음성 사용)');
  }

  // ---------- 공통 렌더 조각 ----------
  function templeItem(t, extra) {
    const v = visited().has(t.id);
    const tags = t.lists.map(l => `<span class="tag">${LL[l]}</span>`).join('') + t.themes.slice(0, 2).map(th => `<span class="tag v">${esc(THEMES[th].name)}</span>`).join('');
    return `<a class="titem ${v ? 'is-visited' : ''}" href="#/temple/${t.id}"><div class="seal ${v ? '' : 'off'}" aria-hidden="true">${sealChar(t)}</div>
      <div class="meta"><b>${esc(t.name)}${v ? ` <span class="tag ok">${ic('check')} 방문</span>` : ''}</b>
      <div class="sub">${esc(t.sido)} ${esc(t.sgg)} · ${esc(t.order)}${extra ? ' · ' + extra : ''}</div>
      ${tags ? `<div class="tags simple-hide">${tags}</div>` : ''}</div></a>`;
  }
  function beadSVG(n, size) {
    size = size || 220; const c = size / 2, R = size / 2 - 10, out = [];
    for (let i = 0; i < 108; i++) { const a = (i / 108) * Math.PI * 2 - Math.PI / 2; const x = c + R * Math.cos(a), y = c + R * Math.sin(a); out.push(`<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${(size / 70).toFixed(1)}" fill="${i < n ? (S.skin === 'maple' ? ['#c2410c', '#d97706', '#b91c1c'][i % 3] : '#8a5a2b') : '#e3d8c4'}" stroke="${i < n ? (S.skin === 'maple' ? '#7c2d12' : '#5e3b19') : '#d4c7ae'}" stroke-width="0.8"/>`); }
    return `<svg class="beads" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" role="img" aria-label="디지털 염주 ${n}/108">${out.join('')}
      <text x="${c}" y="${c - 4}" text-anchor="middle" font-size="${size / 7}" font-family="${DISPLAY_FONT}" fill="#221e19">${n}</text>
      <text x="${c}" y="${c + size / 9}" text-anchor="middle" font-size="${size / 16}" fill="#5c6a63">/ 108 알</text></svg>`;
  }

  // ---------- 화면: 홈 ----------
  function consentCard() {
    if (!MJAnalytics.shouldPrompt()) return '';
    return `<section class="card consent" id="consentCard">
      <div class="consent-row">
        <span class="tool-ic">${ic('info')}</span>
        <p><b>어떤 사찰을 많이 보는지, 익명으로만</b> 알려면 허용해 주세요. 기도 내용·수첩 글·정밀 위치는 모으지 않고, 거부해도 모든 기능을 그대로 씁니다.</p>
      </div>
      <div class="consent-actions">
        <button class="btn text small" data-act="consent-deny">거부</button>
        <button class="btn small" data-act="consent-allow">허용</button>
      </div>
    </section>`;
  }
  function viewHome() {
    const v = visited(), g = gradeInfo(v.size);
    const mi = S.moodIdx || 0; const t = prescribe(mi, S.shift || 0);
    const matchedTheme = t.themes.find(th => MOODS[mi].themes.includes(th) && THEMES[th]);
    const near = MISSIONS.filter(m => m.ids).map(m => ({ m, p: missionProgress(m) })).filter(x => x.p.done < x.p.total).sort((a, b) => (a.p.total - a.p.done) - (b.p.total - b.p.done))[0];
    const popular = ['bulguksa', 'naksansa', 'tongdosa', 'haeinsa', 'songgwangsa'].map(id => byId[id]).filter(Boolean);
    const season = (window.MJ_FEATURES && window.MJ_FEATURES.Weather) ? window.MJ_FEATURES.Weather.getCurrentSeason() : { name: '가을', advice: '단풍이 물든 고즈넉한 산사를 걸어보세요.', templeIds: ['bulguksa', 'baegyangsa', 'naesosa'] };
    const seasonTemples = (season.templeIds || []).map(id => byId[id]).filter(Boolean);
    const picks = seasonTemples.concat(popular.filter(x => !seasonTemples.some(s => s.id === x.id))).slice(0, 6);
    const tripN = (S.trips || []).length;

    /* 배치 원칙 (2026-10 디자인 리뷰)
     * 이 앱이 첫 화면에서 시켜야 할 일은 하나다 — '마음을 고르고, 그 사찰로 향한다'.
     * 그래서 ① 오늘 ② 마음 처방전(주 행동) ③ 매일의 리추얼 ④ 내 순례(결과) ⑤ 지금 가기 좋은 곳
     * ⑥ 여행 계획 ⑦ 쉬는 도구 ⑧ 읽을거리·상점 순. 등급·염주·상점·플러스는 1등석이 아니라
     * 결과와 부수 요소 자리에 둔다. 상업 요소는 맨 아래 한 장으로 모아 순례 흐름을 끊지 않는다. */
    updateStreak();
    const done = ritualDoneToday(), verse = getDailyVerse(), streak = S.streak || 0;

    /* 홈 순서 개인화 (docs/design-refresh.md 5절)
     * 기록이 3건 이상 쌓인 사람에게는 '내 순례'를 마음 처방전보다 위에 둔다.
     *   · 처음 온 사람에게 이 앱이 시키는 일은 하나 — 마음을 고르는 것. 그래서 처방전이 1등이다.
     *   · 이미 걷기 시작한 사람은 다르다. "어디까지 왔고, 다음이 무엇인지"가 먼저 읽혀야
     *     오늘의 한 걸음이 정해진다. 처방전은 그다음에 내려와도 늦지 않다.
     * 카드의 내용·생김새는 그대로 두고 **순서만** 바꾼다 — 순서가 효력이 있는지, 내용이
     * 효력이 있는지 갈라 보려면 한 번에 하나만 움직여야 한다. (A/B 분배는 아직 붙이지 않았다) */
    const ownRecords = (S.visits || []).filter(x => !x.sample).length + (S.journal || []).filter(x => !x.sample).length;
    const returning = ownRecords >= 3;

    const mainTitleHero = `<section class="card main-title-hero" aria-labelledby="mainTitle">
      <h1 id="mainTitle" class="main-title"><span class="main-title__brand">마음정원사 <span class="main-title__sep">:</span> 절로가</span><br><span class="main-title__call">춘학아~절에 가자~^^</span></h1>
      <p class="main-title__desc">기분을 고르고 사찰 이야기를 읽으며 <b>나만의 순례 기록</b>을 이어가는 마음정원입니다.</p>
      ${!isMember() ? `<div class="main-title-auth-bar">
        <span class="sub">${ic('sparkle')} <b>맛보기 체험 중</b> · 기분 체크인·3분 호흡·마음 쉼터·사찰 기본 탐색은 바로 체험하고, <b>방문 인증·108 염주·수첩·여행 계획·AI 상담·도슨트</b> 등 주요 기능은 회원가입·로그인 후 이용하세요.</span>
        <div class="btn-group">
          <button type="button" class="btn small" data-act="open-auth" data-tab="login">로그인</button>
          <button type="button" class="btn ghost small" data-act="open-auth" data-tab="signup">회원가입</button>
        </div>
      </div>` : ''}
    </section>`;

    const todayHead = `<header class="today" data-home-order="${returning ? 'returning' : 'new'}">
      <div class="today-date"><span>${today().replace(/-/g, '.')} · ${greetPart()}</span><span class="state ${done ? 'ok' : ''}"><i class="dot"></i>${done ? '오늘 리추얼 완료' : '오늘 남긴 한 가지'}</span></div>
      <h1>오늘, 마음은<br class="mobile-only"> 어디에 놓을까요</h1>
      <p>${returning ? '어디까지 왔는지 먼저 보고, 오늘의 마음을 골라 보세요.' : '기분을 고르면 어울리는 사찰 이야기와 걷는 순례길을 골라 드려요.'}</p>
    </header>`;

    const moodCard = `<section class="card mood-card">
      <div class="section-heading">
        <div><h2>오늘의 마음 처방전</h2></div>
        <a class="text-link" href="#/mind">마음 리포트${ic('chevron')}</a>
      </div>
      <div class="moods" role="group" aria-label="오늘의 마음 고르기">
        ${MOODS.map((m, i) => `<button class="mood ${i === mi ? 'on' : ''}" data-mood="${i}" aria-pressed="${i === mi ? 'true' : 'false'}"><span aria-hidden="true">${m.icon}</span><b>${esc(m.label)}</b></button>`).join('')}
      </div>
      <div class="prescription">
        <div class="rx-head"><span class="tag v">처방</span><button class="btn text small" data-act="reshuffle">${ic('refresh')} 다른 사찰</button></div>
        <p class="rx-copy">${esc(MOODS[mi].line)}</p>
        <a class="rx-place" href="#/temple/${t.id}">
          <span class="seal" aria-hidden="true">${sealChar(t)}</span>
          <span class="meta"><b>${esc(t.name)}</b><span class="sub">${esc(t.sido)} ${esc(t.sgg)} · ${esc(t.mountain || t.order)}</span></span>
          ${ic('chevron')}
        </a>
        ${t.legend ? `<p class="sub rx-note">${ic('book')} <b>전해지는 이야기</b> 「${esc(t.legend.title)}」</p>` : ''}
        <p class="rx-reason">${ic('info')} 추천 기준 · '${esc(MOODS[mi].label)}'과 ${matchedTheme ? `<b>${esc(THEMES[matchedTheme].name)}</b> 테마` : '사찰 이야기'}를 참고했어요.</p>
        <div class="rx-actions">
          <a class="btn" href="#/temple/${t.id}">${ic('book')} 이야기 읽기</a>
          <button class="btn ghost" data-act="plan-pick" data-id="${t.id}">${ic('calendar')} 순례 계획에 담기</button>
        </div>
      </div>
    </section>`;

    const onboard = !S.onboarded ? `<section class="card onboard-hint">
      <div class="section-heading"><div><h2>취향에 맞춰 추천받기</h2><span class="tag">선택 사항</span></div></div>
      <p class="sub">관심 분야·지역·동행을 알려 주면 사찰을 더 잘 골라 드려요. 지금 추천은 마음 체크인만으로도 이용할 수 있어요.</p>
      <div class="btn-group"><button class="btn ghost" data-act="start-onboarding">3문항으로 맞춤 추천</button><a class="btn text" style="text-decoration:none" href="#/explore">전체 사찰 둘러보기</a></div>
    </section>` : '';

    const ritualCard = `<section class="card ritual-card">
      <div class="section-heading">
        <div><h2>오늘의 한 구절</h2></div>
        ${streak > 0 ? `<span class="tag ok">${ic('check')} ${streak}일째</span>` : '<span class="tag">이어도 되고, 멈춰도 돼요</span>'}
      </div>
      <blockquote class="verse">"${esc(verse.text)}"<span class="verse-src">— ${esc(verse.src)}</span></blockquote>
      <div class="btn-group">
        <button class="btn ${done ? 'ghost' : ''}" data-act="daily-ritual" ${done ? 'disabled' : ''}>${done ? ic('check') + ' 오늘 했어요' : ic('lotus') + ' 108 염주·기도'}</button>
        <button class="btn ghost" data-act="daily-breathing">${ic('circle')} 3분 호흡</button>
      </div>
      ${S.streakFreezes > 0 ? `<p class="sub ritual-foot">하루쯤 쉬어도 스트릭은 프리즈 ${S.streakFreezes}개가 지켜 드려요.</p>` : ''}
    </section>`;

    const pilgrimCard = `<section class="card pilgrim-card">
      <div class="section-heading">
        <div><h2>${g.cur ? esc(g.cur.name) : '첫 도장을 기다리는 중'}</h2></div>
        <a class="text-link" href="#/missions">순례 현황${ic('chevron')}</a>
      </div>
      <div class="sg-grid ${v.size >= 100 ? 'complete' : ''}" role="img" aria-label="도감 ${v.size}곳 / 100곳 — 방문할 때마다 반격 한 칸에 도장이 찍힙니다">${Array.from({ length: 100 }, (_, i) => `<i class="sg-cell${i < v.size ? ' full' : ''}${i === v.size ? ' next' : ''}"></i>`).join('')}</div>
      <dl class="meters">
        <div class="meter"><dt>도감</dt><dd class="num">${v.size}<small>/100곳</small></dd></div>
        <div class="meter"><dt>염주</dt><dd class="num">${beads()}<small>/108알</small></dd></div>
        <div class="meter"><dt>${g.next ? `다음 · ${esc(g.next.name)}` : '회향'}</dt><dd class="num">${g.next ? g.left + '<small>곳</small>' : ic('check')}</dd></div>
      </dl>
      ${near ? `<p class="next-mission">${ic('target')} <span><b>${esc(near.m.name.replace(/ 완주| 순례/, ''))}</b>까지 ${near.p.total - near.p.done}곳 남았어요</span></p>` : ''}
      <div class="btn-group"><button class="btn ghost" data-act="cert-open">${ic('file')} 디지털 완주증</button><a class="btn ghost" href="#/journal" style="text-decoration:none">${ic('pencil')} 발자국 남기기</a></div>
    </section>`;

    const railCard = `<section class="card rail-card">
      <div class="section-heading">
        <div><h2>${esc(String(season.name).replace(/\s*\(.*\)$/, ''))}</h2></div>
        <a class="text-link" href="#/explore">사찰 탐색${ic('chevron')}</a>
      </div>
      <p class="sub">${esc(season.advice)}</p>
      <div class="rail">
        ${picks.map(x => {
          const got = v.has(x.id);
          return `<a class="rail-item" href="#/temple/${x.id}">
            <span class="seal ${got ? '' : 'off'}" aria-hidden="true">${sealChar(x)}</span>
            <b>${esc(x.name)}</b>
            <p class="sub">${esc(x.sido)} ${esc(x.sgg)}${x.mountain ? ' · ' + esc(x.mountain) : ''}</p>
            <span class="rail-foot">${got ? `<span class="tag ok">${ic('check')} 방문</span>` : (x.themes[0] ? `<span class="tag">${esc(THEMES[x.themes[0]].name)}</span>` : '<span class="tag">이야기 있음</span>')}<span class="rail-go">${ic('chevron')}</span></span>
          </a>`;
        }).join('')}
      </div>
      <div class="theme-row">
        <span class="theme-row-label">마음으로 고르기</span>
        <div class="row wrap">${Object.entries(THEMES).slice(0, 5).map(([k, th]) => `<a class="chip" href="#/explore/theme/${k}">${esc(th.name)}</a>`).join('')}</div>
      </div>
    </section>`;

    const plannerCard = `<section class="card planner-card">
      <div class="section-heading">
        <div><h2>${tripN ? `내 계획 ${tripN}건` : '사찰 순례 코스 짜기'}</h2></div>
        <a class="text-link" href="#/planner">전체 보기${ic('chevron')}</a>
      </div>
      <p class="sub">당일치기부터 1박 2일까지 — 경유 사찰·동선·직선거리·준비물을 한 장으로 정리해요.</p>
      <div class="btn-group">
        <a class="btn" href="#/planner/new" style="text-decoration:none">${ic('plus')} 새 계획 짜기</a>
        <a class="btn ghost" href="#/planner" style="text-decoration:none">${ic('sparkle')} 추천 코스 받기</a>
      </div>
    </section>`;

    const toolsCard = `<section class="card tools-card">
      <div class="tools">
        <div class="tool">
          <div class="tool-head"><span class="tool-ic">${ic('wind')}</span><h3>마음 쉼터</h3></div>
          <p>범종·풍경·목탁·계곡물 소리와 함께 잠깐 멈추기.</p>
          <button class="btn ghost small" data-act="meditation-open">${ic('play')} 들어보기</button>
        </div>
        <div class="tool">
          <div class="tool-head"><span class="tool-ic">${ic('sparkle')}</span><h3>AI 참배 안내</h3></div>
          <p>예절·동선·사찰 이야기를 물으면 이 앱의 자료로 답해요.</p>
          <button class="btn ghost small" data-act="ai-counsel">물어보기${ic('chevron')}</button>
        </div>
      </div>
    </section>`;

    const story = STORIES[0];
    const readCard = `<section class="card read-card">
      <div class="section-heading"><div><h2>${story ? '이번 주 심화 스토리' : '이번 주 발자취'}</h2></div><a class="text-link" href="#/store">상점${ic('chevron')}</a></div>
      <ul class="tool-list">
        ${story ? `<li><a href="#/story/${story.id}">${ic('book')}<span><b>${esc(story.title)}</b><span class="sub">${esc(byId[story.tid] ? byId[story.tid].name : '')} · 약 ${story.minutes}분</span></span><span class="tail">${isPlus() ? '읽기' : '첫 장 무료'}${ic('chevron')}</span></a></li>` : ''}
        <li><a href="#/board">${ic('chat')}<span><b>회원 게시판</b><span class="sub">순례 후기·질문을 나눠요 · 가입 후 쓰기</span></span><span class="tail">${ic('chevron')}</span></a></li>
        <li><a href="#/store">${ic('bag')}<span><b>콘텐츠 상점</b><span class="sub">구독 없이 필요한 것만 · 1회 결제 (데모)</span></span><span class="tail">${ic('chevron')}</span></a></li>
        ${isPlus() ? `<li><a href="#/report">${ic('stamp')}<span><b>나의 순례 리포트</b><span class="sub">이 기기 기록으로만 계산해요</span></span><span class="tail">${ic('chevron')}</span></a></li>`
          : `<li><a href="#/plus">${ic('sparkle')}<span><b>플러스 · 심화 스토리·오디오·코스</b><span class="sub">7일 무료 체험 (데모 · 자동 결제 없음)</span></span><span class="tail">${ic('chevron')}</span></a></li>`}
      </ul>
    </section>`;

    return `
    ${mainTitleHero}
    ${todayHead}
    ${returning ? pilgrimCard + moodCard : moodCard}
    ${onboard}
    ${returning ? '' : pilgrimCard}
    ${consentCard()}
    ${ritualCard}
    ${railCard}
    ${plannerCard}
    ${toolsCard}
    ${readCard}
    <p class="notice">🙏 전설·기도 이야기는 '전해지는 이야기'로 소개하며, 효험을 보장하지 않습니다. 무리한 산행·야간 방문은 삼가고 사찰 예절을 지켜 주세요.</p>`;
  }

  // 인사말은 시계(時計)만 본다 — 개인 정보를 읽지 않고도 '지금'을 말해 주는 가장 값싼 단서
  function greetPart() {
    const h = new Date().getHours();
    return h < 5 ? '새벽예불의 시간' : h < 11 ? '아침' : h < 14 ? '낮' : h < 18 ? '오후' : h < 22 ? '저녁' : '밤';
  }

  // ---------- 화면: 탐색 ----------
  const SIDO_ORDER = ['서울', '인천', '경기', '강원', '충북', '충남', '대전', '세종', '전북', '전남', '광주', '경북', '대구', '경남', '울산', '부산', '제주'];
  /* 탐색의 검색 상시화 (docs/design-refresh.md 5절)
   * 원래 검색은 '전통사찰 991' 탭 안에만 있었다. 그런데 찾아보지 않으면 991곳이 있다는 사실 자체를
   * 모른다 — 탭 하나 뒤에 숨겨 둔 검색은 '없는 기능'과 같다. 그래서 검색을 탭 위, 항상 보이는
   * 자리로 올리고 각 탭이 그 검색어로 걸러지게 했다.
   * 주소 규칙: #/explore/<탭>[/<탭의 선택값>]/<검색어>
   *   · list · all : 선택값이 없으므로 두 번째 칸이 곧 검색어
   *   · theme·region: 두 번째 칸은 테마·시도, 검색어는 마지막 칸
   *   · 입력마다 replaceState 로 주소만 갱신한다 — 뒤로가기 기록을 더럽히지 않으면서
   *     '지금 보고 있는 목록'을 그대로 공유·북마크할 수 있게. */
  function exploreQueryOf(tab, arg, q) {
    // 탭이 무엇이든 '검색어' 하나로 돌려준다 (주소에서 읽은 두 칸을 탭에 맞게 해석)
    return (tab === 'theme' || tab === 'region') ? String(q || '') : String(arg || '');
  }
  function templeHay(t) {
    return [t.name, t.hanja, t.sido, t.sgg, t.mountain, t.addr, t.order,
      (t.lists || []).map(l => LL[l] || '').join(' '),
      (t.themes || []).map(k => (THEMES[k] && THEMES[k].name) || '').join(' ')]
      .filter(Boolean).join(' ').toLowerCase();
  }
  function matchTemple(t, q) {
    const k = String(q || '').trim().toLowerCase();
    return !k || templeHay(t).indexOf(k) > -1;
  }
  function matchTrad(r, q) {
    const k = String(q || '').trim().toLowerCase();
    if (!k) return true;
    return [r.name, r.sido, r.sgg, r.addr, r.order, String(r.no)].join(' ').toLowerCase().indexOf(k) > -1;
  }
  // 수록 사찰에서 못 찾았을 때 '끝'이라고 말하지 않는다 — 991곳 전체로 넘어가는 길을 알려 준다
  function tradHint(query, n) {
    if (!query) return '';
    const href = `#/explore/all/${encodeURIComponent(query)}`;
    if (n) return `<p class="notice" style="margin:10px 0 0">수록 사찰에서 ${n}곳을 찾았어요. <a href="${href}">전통사찰 991곳에서 '${esc(query)}' 더 찾기 →</a></p>`;
    return `<div class="empty">${ic('search')}<b>수록 사찰에서 '${esc(query)}'을 못 찾았어요</b><p>문화체육관광부 「전통사찰 현황」 991곳 전체에서는 찾을 수 있어요.</p><a class="btn" style="text-decoration:none" href="${href}">전통사찰 991곳에서 찾기</a></div>`;
  }
  function exploreBody(tab, facet, query) {
    if (tab === 'all') {
      const orders = [...new Set(TRAD.map(r => r.order))].sort();
      return `<section class="card hero data-note">
        <div class="row between"><b>공식 데이터</b><span class="tag ok">${TRAD.length}곳 수록</span></div>
        <p class="sub" style="margin:6px 0 0">「전통사찰 현황」(2026.6.1. 현재) 991곳 전체 목록이에요. 사찰을 누르면 상세 주소·종단을 보고, <b>여행 계획·수첩·방문 인증</b>에 바로 쓸 수 있어요.</p>
      </section>
      <div class="searchbar">
        <select id="ts" class="filter-sel" aria-label="시·도 필터"><option value="">전체 시·도</option>${SIDO_ORDER.map(s => `<option value="${esc(s)}">${esc(s)} (${TRAD.filter(r => r.sido === s).length})</option>`).join('')}</select>
        <select id="to" class="filter-sel" aria-label="종단 필터"><option value="">전체 종단</option>${orders.map(o => `<option value="${esc(o)}">${esc(o)} (${TRAD.filter(r => r.order === o).length})</option>`).join('')}</select>
      </div>
      <div id="tres"></div>`;
    }
    const q = String(query || '').trim();
    if (tab === 'list') {
      if (q) {
        const hits = TEMPLES.filter(t => matchTemple(t, q));
        return `<div class="tlist">${hits.map(t => templeItem(t)).join('')}</div>${tradHint(q, hits.length)}`;
      }
      return Object.entries(LL).map(([k, name]) => {
        const items = TEMPLES.filter(t => t.lists.includes(k));
        const m = MISSIONS.find(x => x.id === k);
        return `<section class="card"><h2>${name} <span class="sub">${items.length}곳</span></h2>${m && m.note ? `<p class="notice">${m.note}</p>` : ''}<div class="tlist">${items.map(t => templeItem(t)).join('')}</div></section>`;
      }).join('') + `<section class="card"><h2>전체 수록 사찰 <span class="sub">${TEMPLES.length}곳</span></h2><div class="tlist">${TEMPLES.map(t => templeItem(t)).join('')}</div></section>`;
    }
    if (tab === 'theme') {
      const cur = facet || 'energy';
      const chips = `<div class="tabs">${Object.entries(THEMES).map(([k, th]) => `<a class="chip ${k === cur ? 'on' : ''}" style="text-decoration:none" href="#/explore/theme/${k}${q ? '/' + encodeURIComponent(q) : ''}">${th.icon} ${th.name}</a>`).join('')}</div>`;
      if (q) {
        const hits = TEMPLES.filter(t => t.themes.includes(cur) && matchTemple(t, q));
        return chips + `<div class="tlist">${hits.map(t => templeItem(t)).join('')}</div>${tradHint(q, hits.length)}`;
      }
      return chips + `<p class="sub">${THEMES[cur].desc}</p>${cur === 'wish' || cur === 'energy' || cur === 'fengshui' || cur === 'prayer' ? '<p class="notice">기도·풍수 관련 소개는 종교적 전승이나 전해지는 이야기이며, 효험·기운을 보장하지 않아요.</p>' : ''}
      ${themeBody(cur)}`;
    }
    const sidos = SIDO_ORDER.filter(s => TEMPLES.some(t => t.sido === s));
    const cur = facet || sidos[0];
    const chips = `<div class="tabs">${sidos.map(s => `<a class="chip ${s === cur ? 'on' : ''}" style="text-decoration:none" href="#/explore/region/${encodeURIComponent(s)}${q ? '/' + encodeURIComponent(q) : ''}">${s} ${TEMPLES.filter(t => t.sido === s).length}</a>`).join('')}</div>`;
    if (q) {
      const hits = TEMPLES.filter(t => t.sido === cur && matchTemple(t, q));
      return chips + `<div class="tlist">${hits.map(t => templeItem(t, esc(t.mountain))).join('')}</div>${tradHint(q, hits.length)}`;
    }
    return chips + `<div class="tlist">${TEMPLES.filter(t => t.sido === cur).map(t => templeItem(t, esc(t.mountain))).join('')}</div>`;
  }

  function viewExplore(tab, arg, q) {
    tab = tab || 'list';
    const tabs = [['list', '순위별'], ['theme', '테마별'], ['region', '지역별'], ['all', '전통사찰 991']];
    const query = exploreQueryOf(tab, arg, q).trim();
    const facet = (tab === 'theme' || tab === 'region') ? (arg || '') : '';
    const qs = query ? '/' + encodeURIComponent(query) : '';
    const search = `<div class="searchbar explore-search">
        <span class="search-wrap">${ic('search')}<input id="eq" type="search" placeholder="사찰명 · 지역 · 테마 (예: 해인사, 경주, 단풍)" value="${esc(query)}" aria-label="사찰 검색" autocomplete="off" enterkeyhint="search" /></span>
        <button type="button" class="chip${query ? '' : ' hidden'}" id="eclear">지우기</button>
      </div>`;
    return `<div class="screen-head"><h1>사찰 탐색</h1><p class="sub"> 수록 ${TEMPLES.length}곳 · 전통사찰 ${TRAD.length}곳 · 이야기 ${STORIES.length}편</p></div>
      ${search}
      <nav class="seg" aria-label="탐색 방식">${tabs.map(([k, n]) => `<a class="${k === tab ? 'on' : ''}" style="text-decoration:none" href="#/explore/${k}${qs}"${k === tab ? ' aria-current="page"' : ''}>${n}</a>`).join('')}</nav>
      <div id="eres">${exploreBody(tab, facet, query)}</div>`;
  }

  function themeBody(cur) {
    const list = TEMPLES.filter(t => t.themes.includes(cur));
    const courses = COURSES.filter(c => c.theme === cur);
    if (cur === 'prayer') {
      const order = (window.PRAYER_ORDER || {}).prayer || [];
      const sourced = order.map(id => byId[id]).filter(t => t && t.themes.includes('prayer'));
      const E = window.PRAYER_ETIQUETTE;
      const criteria = PRAYER_CRITERIA;
      const limitations = PRAYER_LIMITATIONS;
      return `<section class="card"><h2 style="margin-top:0">추천 기준</h2>
          <p class="sub">'기도 기운 좋은 곳'을 효험 점수로 매기지 않고, 확인 가능한 기도 전통과 여행 안전·실용정보를 나눠서 안내합니다.</p>
          <ol style="padding-left:20px;margin:6px 0">${criteria.map(x => `<li>${esc(x)}</li>`).join('')}</ol>
          <p class="notice" style="margin:6px 0 0">${limitations.map(esc).join('<br>')}</p>
        </section>
        <section class="card prayer"><h2 style="margin-top:0">사찰 참배 예절</h2>
          <ul>${E.items.map(x => `<li>${esc(x)}</li>`).join('')}</ul>
          <p class="notice" style="margin:6px 0 0">${esc(E.note)}</p>
          <div class="src">출처: <a href="${E.src.u}" target="_blank" rel="noopener">${esc(E.src.t)}</a></div>
        </section>
        <h2>기도처·순례 사찰 <span class="sub">출처 확인 ${sourced.length}곳</span></h2>
        <div class="tlist">${sourced.map(t => {
          const target = t.prayer ? t.prayer.target.split(' (')[0].split(' —')[0] : '기도·순례 이야기';
          return templeItem(t, `🙏 ${target}`);
        }).join('')}</div>
        <p class="sub" style="font-size:.85em">각 사찰 상세에서 기도 안내·출처와 여행 실용정보를 확인할 수 있어요.</p>
        <a class="btn small" style="display:inline-block;text-decoration:none" href="#/planner/theme/prayer">🗓️ 기도·기운 추천 여행 계획 보기 →</a>
        ${courses.length ? `<h2>테마 순례 코스</h2>${courses.map(courseCard).join('')}` : ''}`;
    }
    if (cur === 'fengshui') {
      return `<section class="card hero"><div class="sub">🧭 풍수 대백과</div>
          <b>전국 명당 사찰 풍수 대백과</b>
          <p class="sub" style="margin:4px 0 8px">용맥·지기·장풍득수·형국론 관점에서 정리한 명당 사찰을 권역별·목적별로 한눈에 살펴보세요. (전해지는 이야기·개인 견해, 효험 보장 아님)</p>
          <div class="row wrap">${FENGSHUI_MATRIX.slice(0, 3).map(m => `<span class="tag">${m.icon} ${esc(m.purpose)}</span>`).join('')}<span class="tag">…</span></div>
          <a class="btn small" style="display:inline-block;text-decoration:none;margin-top:8px" href="#/fengshui">대백과 열기 →</a>
        </section>
        <h2>풍수 답사 사찰 <span class="sub">${list.length}곳</span></h2>
        <div class="tlist">${list.map(t => templeItem(t)).join('')}</div>${courses.length ? `<h2>테마 순례 코스</h2>${courses.map(courseCard).join('')}` : ''}`;
    }
    if (cur !== 'wish' && cur !== 'energy') return `<div class="tlist">${list.map(t => templeItem(t)).join('')}</div>${courses.length ? `<h2>테마 순례 코스</h2>${courses.map(courseCard).join('')}` : ''}`;
    const order = (window.PRAYER_ORDER || {})[cur] || [];
    const sourced = order.map(id => byId[id]).filter(t => t && t.themes.includes(cur));
    const rest = list.filter(t => !order.includes(t.id));
    const E = window.PRAYER_ETIQUETTE;
    return `<section class="card prayer"><div class="section-heading"><div><h2>이 사찰에서 기도해 온 것</h2></div></div>
        <p class="sub" style="margin:0 0 6px">어느 기도처든 이것만 지키면 돼요.</p>
        <ul>${E.items.map(x => `<li>${esc(x)}</li>`).join('')}</ul>
        <p class="notice" style="margin:6px 0 0">${esc(E.note)}</p>
        <div class="src">출처: <a href="${E.src.u}" target="_blank" rel="noopener">${esc(E.src.t)}</a></div></section>
      <h2>${cur === 'wish' ? '이름난 기도처' : '기운 좋은 곳으로 전해지는 사찰'} <span class="sub">출처 확인 ${sourced.length}곳</span></h2>
      <div class="tlist">${sourced.map(t => templeItem(t, t.prayer ? '🙏 ' + esc(t.prayer.target.split(' (')[0].split(' —')[0]) : '')).join('')}</div>
      ${sourced.length ? `<p class="sub" style="font-size:.85em">각 사찰 상세의 "기도 안내"에서 왜 알려졌는지와 출처를 볼 수 있어요.</p>` : ''}
      ${courses.length ? `<h2>테마 순례 코스 <span class="tag">플러스</span></h2>${courses.map(courseCard).join('')}` : ''}
      ${rest.length ? `<h2>함께 보기 <span class="sub">${rest.length}곳</span></h2><p class="sub" style="font-size:.85em">풍수 이야기 등으로 분류된 곳이에요.</p><div class="tlist">${rest.map(t => templeItem(t)).join('')}</div>` : ''}`;
  }
  /* 탐색 화면의 입력 묶음 — 검색어(상시) · 시·도 · 종단(전통사찰 탭).
   * 입력을 칠 때마다 화면 전체를 다시 그리지 않는다. 결과 칸(#eres)만 갈아 끼워서
   * 커서가 튀지 않게 하고, 주소는 replaceState 로만 따라간다. */
  function bindExplore() {
    const q = document.getElementById('eq'); if (!q) return;
    const clear = document.getElementById('eclear');
    const box = document.getElementById('eres');
    let limit = 100;
    let t = null;

    function ctx() {
      const parts = (location.hash || '#/explore').slice(2).split('/');
      const tab = parts[1] || 'list';
      return { tab, facet: (tab === 'theme' || tab === 'region') ? decodeURIComponent(parts[2] || '') : '' };
    }
    function syncUrl(qs) {
      const { tab, facet } = ctx();
      const url = (tab === 'theme' || tab === 'region')
        ? `#/explore/${tab}/${encodeURIComponent(facet || (tab === 'theme' ? 'energy' : ''))}${qs ? '/' + encodeURIComponent(qs) : ''}`
        : `#/explore/${tab}${qs ? '/' + encodeURIComponent(qs) : ''}`;
      if (url === location.hash) return;
      // replaceState — 입력마다 pushState 하면 '뒤로' 한 번에 검색어 한 글자씩 되돌아간다
      if (window.history && window.history.replaceState) window.history.replaceState(null, '', url);
    }
    function drawTradList(sd, od, k) {
      const out = document.getElementById('tres'); if (!out) return;
      const rows = TRAD.filter(r => (!sd || r.sido === sd) && (!od || r.order === od) && matchTrad(r, k));
      const shown = rows.slice(0, limit);
      const v = visited();
      out.innerHTML = `<div class="row between" style="margin-bottom:6px"><span class="sub">검색 결과 <b>${rows.length}</b>곳 (전체 ${TRAD.length}곳)</span>${rows.length > limit ? `<span class="sub">앞 ${limit}곳 표시 중</span>` : ''}</div>
      <div class="tlist">` + shown.map(r => {
        const featId = addrToFeaturedId[r.addr];
        const targetId = featId || r.id;
        const isVis = v.has(targetId) || v.has(r.id);
        return `<a href="#/temple/${targetId}" class="titem">
          <div class="seal ${featId || isVis ? '' : 'off'}">${esc(r.name.charAt(0))}</div>
          <div class="meta">
            <b>${esc(r.name)} <span class="tag">No.${r.no}</span> ${featId ? '<span class="tag ok">심화 안내</span>' : ''}${isVis ? '<span class="tag ok">방문</span>' : ''}</b>
            <div class="sub">${esc(r.addr)}</div>
            <div class="sub">${esc(r.sido)} ${esc(r.sgg)} · ${esc(r.order)}</div>
          </div>
        </a>`;
      }).join('') + `</div>` + (rows.length > limit ? `<button type="button" class="btn ghost block" id="tradMoreBtn" style="margin-top:10px">더 보기 (${rows.length - limit}곳 남음)</button>` : '');
      const moreBtn = document.getElementById('tradMoreBtn');
      if (moreBtn) moreBtn.addEventListener('click', () => { limit += 150; run(false); });
    }
    function run(resetLimit, sync) {
      if (resetLimit !== false) limit = 100;
      const k = q.value.trim();
      const { tab, facet } = ctx();
      if (clear) clear.classList.toggle('hidden', !k);
      if (sync !== false) syncUrl(k);        // 최초 바인딩 때는 주소가 이미 답을 들고 있다
      if (tab === 'all') {
        const sd = (document.getElementById('ts') || {}).value || '';
        const od = (document.getElementById('to') || {}).value || '';
        drawTradList(sd, od, k);
        return;
      }
      if (!box) return;
      box.innerHTML = exploreBody(tab, facet, k);
    }
    // 칠 때마다 다시 그리면 한 글자에 한 번씩 화면이 튄다 — 손가락이 멈춘 뒤에 한 번만
    function onInput() {
      if (t) clearTimeout(t);
      t = setTimeout(() => { t = null; run(true); }, 180);
    }
    q.addEventListener('input', onInput);
    q.addEventListener('keydown', e => { if (e.key === 'Enter') { if (t) clearTimeout(t); run(true); q.blur(); } });
    if (clear) clear.addEventListener('click', () => { q.value = ''; run(true); q.focus(); });
    ['ts', 'to'].forEach(id => { const el = document.getElementById(id); if (el) el.addEventListener('change', () => run(true)); });
    run(false, false);
  }

  // ---------- 화면: 전국 명당 사찰 풍수 대백과 ----------
  const NUMPAD = ['①', '②', '③', '④', '⑤', '⑥', '⑦', '⑧', '⑨', '⑩', '⑪', '⑫', '⑬', '⑭', '⑮', '⑯', '⑰', '⑱', '⑲', '⑳'];
  function viewFengshuiAtlas() {
    const A = FENGSHUI_ATLAS;
    if (!A || !A.entries || !A.entries.length) return `<p>풍수 대백과 데이터를 불러오지 못했어요.</p>`;
    const regionName = k => { const r = (A.regions || []).find(x => x.key === k); return r ? r.name : ''; };
    const templeChips = ids => `<div class="row wrap" style="margin-top:6px">${(ids || []).map(id => {
      const t = resolveTemple(id);
      return t ? `<a class="chip" style="text-decoration:none" href="#/temple/${t.id}">📍 ${esc(t.name)}</a>` : '';
    }).join('')}</div>`;

    const matrixHtml = FENGSHUI_MATRIX.length ? `<section class="card">
      <h2 style="margin-top:0">🎯 목적별 맞춤 사찰 매트릭스</h2>
      <p class="sub" style="margin:0 0 8px">방문 목적에 맞춰 풍수 해설에서 꼽은 최우선 추천 사찰이에요. (전해지는 이야기, 효험 보장 아님)</p>
      ${FENGSHUI_MATRIX.map(m => `<div class="course" style="margin-bottom:8px">
        <div class="row between"><b>${m.icon} ${esc(m.purpose)}</b></div>
        <div class="sub" style="margin-top:2px">${esc(m.reason)}</div>
        ${templeChips(m.temples)}
      </div>`).join('')}
    </section>` : '';

    const regionHtml = (A.regions || []).map(r => {
      const items = A.entries.filter(e => e.region === r.key);
      if (!items.length) return '';
      return `<h2>${esc(r.name)} <span class="sub">${items.length}곳</span></h2>` + items.map((e, i) => {
        const no = NUMPAD[A.entries.indexOf(e)] || (A.entries.indexOf(e) + 1) + '.';
        return `<section class="card">
          <div class="row between"><b>${no} ${esc(e.name)}</b><span class="tag">${esc(r.name)}</span></div>
          ${e.sub ? `<div class="sub" style="margin:2px 0 0">${esc(e.sub)}</div>` : ''}
          <p style="margin:8px 0 2px"><b>형국</b> · ${esc(e.hyeong)}</p>
          <div class="row wrap" style="margin:4px 0">${e.power.map(p => `<span class="tag">💡 ${esc(p)}</span>`).join('')}</div>
          <p class="sub" style="margin:4px 0 0">${esc(e.story)}</p>
          ${templeChips(e.temples)}
        </section>`;
      }).join('');
    }).join('');

    const tipsHtml = FENGSHUI_VISIT_TIPS.length ? `<section class="card">
      <h2 style="margin-top:0">🌿 사찰에서 마음을 여는 방문법</h2>
      <p class="sub" style="margin:0 0 8px">풍생풍사TV가 소개한 사찰 방문법을 정리했어요. 개인의 견해·전해지는 이야기이며 효험을 보장하지 않아요.</p>
      <ul style="padding-left:18px;margin:0">${FENGSHUI_VISIT_TIPS.map(tp => `<li style="margin-bottom:8px"><b>${esc(tp.title)}</b><br><span class="sub">${esc(tp.text)}</span></li>`).join('')}</ul>
    </section>` : '';

    return `<a href="#/explore/theme/fengshui" class="sub" style="text-decoration:none">← 풍수 답사 사찰</a>
      <div class="screen-head"><h1>${esc(A.title)}</h1></div>
      <p class="sub" style="margin:4px 0 8px">${esc(A.subtitle)} — ${esc(A.intro)}</p>
      <p class="notice">${(A.disclaimer || []).map(esc).join('<br>')}</p>
      ${matrixHtml}
      ${regionHtml}
      ${tipsHtml}
      <section class="card"><h2 style="margin-top:0">🗓️ 함께 떠나는 기도·풍수 여행</h2>
        <p class="sub" style="margin:0 0 8px">명당 사찰·소원성지 추천 코스를 여행 계획에 한 번에 담을 수 있어요.</p>
        <div class="row wrap">
          <a class="btn small" style="text-decoration:none" href="#/planner/theme/prayer">🙏 기도·기운 추천 코스</a>
          <a class="btn ghost small" style="text-decoration:none" href="#/planner/new">+ 새 여행 계획 만들기</a>
        </div>
      </section>
      <p class="notice">${esc(A.sourceNote || '')}<br>전설·풍수 이야기는 '전해지는 이야기'로 소개하며, 효험을 보장하지 않습니다.</p>`;
  }

  // ---------- 화면: 사찰 상세 ----------
  const ETIQUETTE = ['법당 정면 가운데 문(어간문)은 피하고 옆문으로 드나들어요.', '예불·기도 중에는 촬영과 큰 소리를 삼가요.', '"촬영 금지" 표시가 있는 곳은 반드시 지켜 주세요.', '노출이 심한 옷은 피하고, 법당에서는 모자를 벗어요.', '스님·수행 공간(선원 등) 출입 제한 구역에 들어가지 않아요.', '개방 시간 외 야간 방문과 무리한 산행은 삼가요.'];
  function ensureTempleExtras(id) {
    if (TEMPLE_EXTRAS_CACHE[id] || TEMPLE_EXTRAS_PENDING[id]) return;
    TEMPLE_EXTRAS_PENDING[id] = true;
    api('/api/temples/' + encodeURIComponent(id) + '/extras').then(r => {
      delete TEMPLE_EXTRAS_PENDING[id];
      if (!r.ok) return;
      TEMPLE_EXTRAS_CACHE[id] = r.body;
      const cur = (location.hash || '').slice(2).split('/');
      if (cur[0] === 'temple' && decodeURIComponent(cur[1] || '') === id) render();
    }).catch(() => { delete TEMPLE_EXTRAS_PENDING[id]; });
  }
  function fengshuiHtml(t) {
    if (!t.fengshui || !t.fengshui.length) return '';
    const open = isPlus();
    const ext = TEMPLE_EXTRAS_CACHE[t.id];
    const shown = open ? ((ext && ext.unlocked && ext.fengshui) || t.fengshui) : t.fengshui.slice(0, 1);
    const extraCnt = t.fengshui.length - 1;
    const atlas = t.fengshuiAtlas;
    const atlasHead = atlas ? `<p style="margin:8px 0 2px"><b>형국</b> · ${esc(atlas.hyeong)}</p>
      <div class="row wrap" style="margin:4px 0 2px">${atlas.power.map(p => `<span class="tag">💡 ${esc(p)}</span>`).join('')}</div>` : '';
    return `<section class="card legend"><span class="lbl">${ic('leaf')} 풍수 이야기 · 전해지는 이야기</span>${atlasHead}<ul style="padding-left:18px;margin:8px 0 0">${shown.map(v => `<li style="margin-bottom:4px">${esc(v)}</li>`).join('')}</ul>${!open && extraCnt > 0 ? lockBlock('fengshui', `<p style="margin:0">추가 풍수 해설 ${extraCnt}편이 더 있어요.</p>`) : ''}
      ${atlas ? `<p style="margin:8px 0 0"><a class="sub" href="#/fengshui">🧭 전국 명당 사찰 풍수 대백과에서 권역별 전체 보기 →</a></p>` : ''}
      <p class="sub" style="font-size:.8em">풍수 해석은 개인의 견해이자 전해지는 이야기예요. 효험이나 결과를 보장하지 않아요.</p></section>`;
  }
  function viewTemple(id) {
    const t = resolveTemple(id); if (!t) return `<p>사찰을 찾을 수 없어요.</p>`;
    if (!t.isTradOnly && isPlus() && (!TEMPLE_EXTRAS_CACHE[id] || !TEMPLE_EXTRAS_CACHE[id].unlocked)) ensureTempleExtras(id);
    const vs = S.visits.filter(v => v.tid === t.id);
    const gpsVisits = vs.filter(v => !v.sample && v.method !== 'demo');
    const demoVisits = vs.filter(v => !v.sample && v.method === 'demo').length;
    const sampleVisits = vs.filter(v => v.sample).length;
    const lastGps = gpsVisits[gpsVisits.length - 1];
    const practical = t.practical || {};
    const verify = Array.isArray(t.verify) ? t.verify : [];
    const visitedToday = vs.some(v => String(v.date || '').slice(0, 10) === today() && !v.sample && v.method !== 'demo');
    return `
    <a href="javascript:history.back()" class="backlink">${ic('back')} 뒤로</a>
    <section class="card hero temple-head">
      <div class="temple-head-row">
        <div class="temple-id">
          <h1>${esc(t.name)}</h1>
          <p class="sub">${esc(t.hanja)} · ${esc(t.mountain)}</p>
        </div>
        <div class="seal lg ${gpsVisits.length ? '' : 'off'}" aria-hidden="true">${sealChar(t)}</div>
      </div>
      <div class="tagrow"><span class="tag">${ic('stamp')}${esc(t.order)}</span>${t.tradNo ? `<span class="tag">전통사찰 No.${t.tradNo}</span>` : ''}${t.lists.slice(0, 2).map(l => `<span class="tag">${LL[l]}</span>`).join('')}${t.themes.slice(0, 2).map(th => `<span class="tag v">${esc(THEMES[th].name)}</span>`).join('')}</div>
      <div id="templeWeatherBox" class="row wrap temple-weather"><span class="weather-chip" id="twChip"><span class="wicon">⛅</span> 날씨 보는 중…</span></div>
      ${gpsVisits.length ? `<p class="visited-line">${ic('check')} <b>${gpsVisits.length}회 방문</b> · 최근 ${fmtDate(lastGps.date)}${demoVisits ? ` · 데모 ${demoVisits}회` : ''}${sampleVisits ? ` · 예시 ${sampleVisits}건` : ''}</p>` : demoVisits || sampleVisits ? `<p class="sub visited-line">실제 GPS 방문 기록은 아직 없어요.${demoVisits ? ` 데모 ${demoVisits}회` : ''}${sampleVisits ? ` · 예시 ${sampleVisits}건` : ''}</p>` : `<p class="sub visited-line">방문하면 도장·염주 한 알·수첩 자리가 함께 생깁니다. (하루 1회)</p>`}
    </section>
    <section class="card visit-card" id="visit-info" aria-labelledby="visitInfoTitle">
      <div class="section-heading">
        <div><h2 id="visitInfoTitle">가기 전에 확인해요</h2></div>
        <span class="tag">정보 변경 가능</span>
      </div>
      <dl class="visit-facts">
        <div><dt>주소</dt><dd>${val(t.addr)}</dd></div>
        <div><dt>개방시간</dt><dd>${val(practical.hours)}</dd></div>
        <div><dt>입장료</dt><dd>${val(practical.fee)}</dd></div>
        <div><dt>주차</dt><dd>${val(practical.parking)}</dd></div>
        <div><dt>대중교통</dt><dd>${val(practical.transit)}</dd></div>
        <div><dt>관람 소요</dt><dd>${val(t.duration)}</dd></div>
      </dl>
      <p class="visit-note">${ic('info')} 운영 시간과 통행 여건은 바뀔 수 있어요. <b>확인 필요</b> 항목은 방문 전 사찰·국립공원 공식 안내를 확인해 주세요.</p>
      ${verify.length ? `<div class="visit-alert"><b>${ic('alert')} 방문 전 확인할 항목</b><ul class="verify-list">${verify.map(v => `<li class="needs">${esc(v)}</li>`).join('')}</ul></div>` : ''}
    </section>
    <div class="actionbar noprint" aria-label="사찰 방문 행동">
      <button class="btn primary" data-act="gps" data-id="${t.id}" ${visitedToday ? 'disabled' : ''}>${ic(visitedToday ? 'check' : 'target')}<span>${visitedToday ? '오늘 인증 완료' : '도착 후 방문 인증'}<small>현장 GPS 반경 ${t.radius}m · 하루 1회</small></span></button>
      <button class="btn ghost" data-act="nav-hub" data-id="${t.id}">${ic('nav')} 길찾기</button>
    </div>
    <section class="card"><h2>한눈에 보기</h2><dl class="kv">
      <dt>종단</dt><dd>${esc(t.order)}</dd><dt>소재지</dt><dd>${esc(t.addr)}</dd><dt>창건</dt><dd>${esc(t.founded)}</dd>
      <dt>대표 문화재</dt><dd>${t.treasures.map(esc).join('<br>')}</dd><dt>관람 소요</dt><dd>${val(t.duration)}</dd></dl></section>
    <section class="card"><h2>기원·역사</h2><ul class="timeline">${t.timeline.map(([y, d]) => `<li><b>${esc(y)}</b>${esc(d)}</li>`).join('')}</ul></section>
    ${(t.legend || (t.legends && t.legends.length)) ? `<section class="card legend"><div class="row between"><span class="lbl">${ic('quote')} 전해지는 이야기</span><button class="btn ghost small" data-act="docent-temple" data-id="${id}">${ic('headphones')} 듣기</button></div>
      ${legendsHtml(t)}
      <p class="sub" style="font-size:.8em">설화·전승은 역사적 사실과 다를 수 있으며 효험을 보장하지 않습니다. (전문가 감수 예정)</p></section>` : ''}
    ${storyCards(id)}
    ${prayerHtml(t)}
    ${t.viewpoints && t.viewpoints.length ? `<section class="card"><h2>관람 포인트</h2><ul style="padding-left:18px;margin:0">${t.viewpoints.map(v => `<li style="margin-bottom:4px">${esc(v)}</li>`).join('')}</ul></section>` : ''}
    ${fengshuiHtml(t)}
    <section class="card"><h2>관람 가이드 · 예절</h2><p>💡 ${esc(t.tip)}</p><ul style="padding-left:18px;margin:6px 0">${ETIQUETTE.map(e => `<li>${e}</li>`).join('')}</ul></section>
    <section class="card temple-tool-card"><div class="section-heading"><div><h2>방문 도구</h2></div></div>
      <ul class="tool-list temple-tools">
        <li><button data-act="docent-temple" data-id="${t.id}">${ic('headphones')}<span><b>오디오 도슨트</b><span class="sub">걸으면서 이야기를 귀로</span></span><span class="tail">듣기${ic('chevron')}</span></button></li>
        <li><button data-act="ai-counsel" data-id="${t.id}">${ic('sparkle')}<span><b>AI 맞춤 참배 안내</b><span class="sub">예절·동선·궁금한 것을 물으면 자료로 답해요</span></span><span class="tail">${ic('chevron')}</span></button></li>
        <li><a href="#/journal/new/${t.id}">${ic('pencil')}<span><b>수첩에 남기기</b><span class="sub">날씨·다짐·사진 (이 기기에만)</span></span><span class="tail">${ic('chevron')}</span></a></li>
        <li><button data-act="plan-pick" data-id="${t.id}">${ic('calendar')}<span><b>여행 계획에 담기</b><span class="sub">경유 사찰·동선·거리</span></span><span class="tail">${ic('chevron')}</span></button></li>
        <li><a href="#/map/${t.id}">${ic('map')}<span><b>지도에서 보기</b><span class="sub">경내 범위·인근 사찰</span></span><span class="tail">${ic('chevron')}</span></a></li>
        ${STORIES.some(x => x.tid === t.id) ? `<li><a href="#/story/${STORIES.find(x => x.tid === t.id).id}">${ic('book')}<span><b>심화 스토리</b><span class="sub">이 사찰을 길게 읽는 편</span></span><span class="tail">${isPlus() ? '읽기' : '첫 장 무료'}${ic('chevron')}</span></a></li>` : `<li><a href="#/explore/all">${ic('list')}<span><b>전통사찰 991 전체 목록</b><span class="sub">이 사찰의 등재 정보 확인</span></span><span class="tail">${ic('chevron')}</span></a></li>`}
        <li><button data-act="demo" data-id="${t.id}">${ic('stamp')}<span><b>데모로 인증</b><span class="sub">현장에 없어도 기능을 시험하는 기록 · '데모'로 표시돼요</span></span><span class="tail">${ic('chevron')}</span></button></li>
        <li><button data-act="offline" data-id="${t.id}">${ic('download')}<span><b>오프라인 저장</b><span class="sub">산중 통신 음영 대비${isPlus() ? '' : ' · 플러스'}</span></span><span class="tail">${S.offline.includes(t.id) && isPlus() ? '저장됨' : ic('chevron')}</span></button></li>
      </ul>
    </section>
    <section class="card templestay-hero">
      <div class="row between">
        <span class="templestay-tag">🎋 템플스테이</span>
        <span class="sub">한국불교문화사업단 연동</span>
      </div>
      <h2 style="margin:6px 0 2px">${esc(t.name)} 템플스테이 안내</h2>
      <p class="sub" style="margin:0">${esc(practical.templestay || '운영 여부 조회')}</p>
      <div class="grid2" style="margin-top:10px">
        <button class="btn small" data-act="templestay-hub" data-id="${t.id}">프로그램 & 예절 안내</button>
        <a class="btn ghost small" style="text-align:center;text-decoration:none" href="https://www.templestay.com/select-temple?search=${encodeURIComponent(t.name)}" target="_blank" rel="noopener">공식 예약 바로가기 ↗</a>
      </div>
    </section>
    <p class="notice">자료: 주소·종단 = 「전통사찰 현황」(2026.6.1.) · 좌표 = OpenStreetMap · 연혁 = 공개 자료 요약(감수 전)${t.prayer ? ' · 기도 안내 = 언론·백과사전·지자체·사찰 공식 자료(위 출처)' : ''}</p>`;
  }

  function storyCards(id) {
    const st = STORIES.filter(x => x.tid === id), soon = STORY_SOON.filter(x => x.tid === id); if (!st.length && !soon.length) return '';
    return `<section class="card legend"><span class="lbl">${ic('book')} 절로가 심화 스토리</span>${st.map(x => `<h3 style="margin:8px 0 4px">${esc(x.series)} ${x.ep}편 · ${esc(x.title)}</h3><p class="sub" style="margin:0">${esc(x.hook)}</p><a class="btn small" href="#/story/${x.id}" style="display:inline-block;text-decoration:none;margin-top:6px">${storyOpen(x) ? '읽기' : '첫 장 무료로 읽기'} →</a>`).join('')}${soon.map(x => `<p class="sub" style="margin:8px 0 0">${x.ep}편 「${esc(x.title)}」 제작 예정</p>`).join('')}</section>`;
  }
  function legendsHtml(t) {
    const all = [t.legend].concat(t.legends || []).filter(Boolean);
    const one = l => `<h2 style="margin-top:8px">${esc(l.title)}</h2><p>${esc(l.text)}</p>`;
    if (isPlus() || all.length <= 1) return all.map(one).join('');
    return one(all[0]) + lockBlock('legend', all.slice(1).map(l => `<b>${esc(l.title)}</b>`).join(' · ')) + `<p class="sub" style="font-size:.8em;margin:6px 0 0">이 사찰에는 이야기가 ${all.length}편 있어요. 첫 편은 누구나 무료예요.</p>`;
  }
  function prayerHtml(t) {
    const p = t.prayer; if (!p) return '';
    return `<section class="card prayer"><div class="section-heading"><div><h2 style="margin-top:0">기도 안내</h2></div></div>
      <p style="margin:0"><b>기도 대상</b> · ${esc(p.target)}</p>
      <h3>왜 기도처로 알려졌을까 <span class="sub">(전해지는 이야기)</span></h3><ul>${p.why.map(x => `<li>${esc(x)}</li>`).join('')}</ul>
      ${p.how && p.how.length ? `<h3>찾아가는 법·기도 방법</h3><ul>${p.how.map(x => `<li>${esc(x)}</li>`).join('')}</ul>` : ''}
      <p class="notice" style="margin:8px 0 0">기도처에 전해지는 이야기를 소개할 뿐, 소원 성취나 효험을 보장하지 않아요. 기도하는 분들을 위해 조용히 머물러 주세요.</p>
      <div class="src">출처: ${p.src.map(s => `<a href="${s.u}" target="_blank" rel="noopener">${esc(s.t)}</a>`).join(' · ')}</div></section>`;
  }

  // ---------- 체크인 ----------
  function addVisit(tid, method, dist) {
    const before = visited().size, g0 = gradeInfo(before).cur;
    if (S.visits.some(v => !v.sample && v.tid === tid && v.date.slice(0, 10) === today())) { toast('오늘은 이미 인증했어요. 내일 다시 만나요 🙏'); return; }
    const now = new Date(); const local = new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 19);
    S.visits.push({ tid, date: local, method, dist: dist == null ? null : Math.round(dist) }); save();
    MJAnalytics.track('checkin', { method: method === 'demo' ? 'demo' : 'gps' });
    const after = visited().size, g1 = gradeInfo(after).cur;
    const t = resolveTemple(tid); if (!t) return; const completed = MISSIONS.filter(m => m.ids && m.ids.includes(tid)).filter(m => { const p = missionProgress(m); return p.done === p.total; });
    openModal(`<div class="sheet stamp-sheet">
      <div class="stamp-kicker">${method === 'demo' ? '데모 체크인 · 테스트용 (실제 방문 인증 아님)' : 'GPS 방문 인증 · 거리 ' + fmtDist(dist)}</div>
      <div class="stampbig">${esc(t.name.replace(/\(.*\)/, ''))}</div>
      <h2>${esc(t.name)} 도장을 받았어요</h2>
      <ul class="stamp-list">
        <li>${ic('lotus')} <span>염주 <b>${beads()}/108</b> 알</span></li>
        <li>${ic('book')} <span>도감 <b>${after}/100</b>곳</span></li>
        ${g1 && (!g0 || g1.name !== g0.name) ? `<li class="up">${ic('stamp')} <span><b>${esc(g1.name)}</b> 등급이 되었어요</span></li>` : ''}
        ${completed.map(m => `<li class="up">${ic('check')} <span>${esc(m.reward)} 획득 — ${esc(m.name)}</span></li>`).join('')}
      </ul>
      <div class="btn-group">
        <a class="btn ghost" style="text-decoration:none" href="#/journal/new/${tid}" data-act="close">${ic('pencil')} 수첩에 한 줄</a>
        <button class="btn" data-act="close">닫기</button>
      </div></div>`);
  }
  function gpsCheckin(tid) {
    const t = resolveTemple(tid); if (!t) return;
    if (!('geolocation' in navigator)) { toast('이 기기에서는 위치 확인을 할 수 없어요.'); return; }
    toast('현재 위치를 확인하고 있어요…');
    navigator.geolocation.getCurrentPosition(pos => {
      const { latitude, longitude, accuracy } = pos.coords;
      const d = haversine(latitude, longitude, t.lat, t.lng);
      if (d <= t.radius + Math.min(accuracy || 0, 150)) addVisit(tid, 'gps', d);
      else toast(`${t.name}까지 ${fmtDist(d)} 남았어요. 반경 ${t.radius}m 안에서 인증할 수 있어요.`);
    }, err => {
      toast(err.code === 1 ? '위치 권한이 거부되었어요. 설정에서 허용해 주세요.' : '위치를 가져오지 못했어요. 잠시 후 다시 시도해 주세요.');
    }, { enableHighAccuracy: true, timeout: 12000, maximumAge: 30000 });
  }
  function demoCheckin(tid) {
    openModal(`<div class="sheet"><h2>🧪 데모 체크인</h2><p>현장에 가지 않고 기능을 시험해 보는 <b>테스트용 체크인</b>이에요. 기록에 '데모'로 표시되며, 실제 서비스에서는 제거되거나 관리자 전용이 됩니다.</p>
      <div class="grid2"><button class="btn ghost" data-act="close">취소</button><button class="btn warn" data-act="demo-ok" data-id="${tid}">데모로 인증</button></div></div>`);
  }

  // ---------- 지도 ----------
  let mapObj = null;
  // 화면 회전 · 창 리사이즈 · 모바일 브라우저 툴바 접힘 → 지도가 잘리지 않게 다시 맞춤
  let mapFitT = null;
  function fitMap() {
    clearTimeout(mapFitT);
    mapFitT = setTimeout(() => { if (mapObj && mapObj.invalidateSize) mapObj.invalidateSize({ animate: false }); }, 140);
  }
  window.addEventListener('resize', fitMap);
  window.addEventListener('orientationchange', fitMap);
  if (window.visualViewport) window.visualViewport.addEventListener('resize', fitMap);
  let mapMode = 'map';
  let mapActiveFilter = '';
  function mapListHTML(filter) {
    const ui = window.MJ_MAP_UI;
    return ui ? ui.listHTML(filter, { temples: TEMPLES, visited: visited(), templeItem, ic, esc }) : '';
  }
  function viewMap() {
    mapMode = 'map'; mapActiveFilter = '';
    return `<div class="screen-head map-head"><div><h1>사찰 지도</h1><p class="sub">수록 ${TEMPLES.length}곳 · 지도를 움직여 주변 사찰을 살펴보세요.</p></div><button class="btn soft small" data-act="locate">${ic('target')} 내 주변</button></div>
      <div class="map-controls">
        <div class="tabs" id="mapf" role="group" aria-label="사찰 분류"><button class="chip on" data-f="" aria-pressed="true">전체</button>${Object.entries(LL).map(([k, n]) => `<button class="chip" data-f="${k}" aria-pressed="false">${n}</button>`).join('')}<button class="chip" data-f="visited" aria-pressed="false">방문한 곳</button></div>
        <div class="map-view-switch" role="group" aria-label="결과 보기 방식"><button class="chip" data-map-view="map" aria-pressed="true">${ic('map')} 지도</button><button class="chip" data-map-view="list" aria-pressed="false">${ic('list')} 목록</button></div>
      </div>
      <div id="mapPane" role="tabpanel" aria-label="사찰 지도"><div id="map"></div></div>
      <div id="mapListPane" class="map-list-panel hidden" role="tabpanel" aria-label="사찰 목록"><div id="mapListResults">${mapListHTML('')}</div></div>
      <p class="map-legend"><span class="state ok"><i class="dot"></i>방문한 곳</span><span class="state"><i class="dot"></i>아직인 곳</span><span class="sub">© OpenStreetMap 기여자 · 좌표는 조회값이라 현장 확인이 필요해요.</span></p>`;
  }
  function initMap(focusId, elId, onlyVisited) {
    const ui = window.MJ_MAP_UI;
    if (!ui) {
      const el = document.getElementById(elId || 'map');
      if (el) el.innerHTML = '<p class="notice">지도를 불러오지 못했어요.</p>';
      return null;
    }
    return ui.init({ L: window.L, temples: TEMPLES, byId, focusId, elId, onlyVisited, visited, esc, isCurrent: m => mapObj === m });
  }

  // ---------- 순례(미션·등급·염주·도감·순례지도) ----------
  const TILE = [['', '', '서울', '강원', ''], ['', '인천', '경기', '충북', '경북'], ['', '충남', '세종', '대전', '대구'], ['', '전북', '광주', '경남', '울산'], ['제주', '전남', '', '부산', '']];
  function journeyTimelineHTML(limit) {
    const events = [];
    (Array.isArray(S.visits) ? S.visits : []).forEach((v, i) => events.push({
      id: `visit-${i}`, kind: 'visit', tid: v.tid, date: String(v.date || '').slice(0, 10),
      method: v.method, sample: !!v.sample
    }));
    (Array.isArray(S.journal) ? S.journal : []).forEach((j, i) => events.push({
      id: `journal-${j.id || i}`, kind: 'journal', tid: j.tid, date: String(j.date || '').slice(0, 10),
      note: String(j.note || '').trim(), sample: !!j.sample
    }));
    events.sort((a, b) => b.date.localeCompare(a.date) || (a.kind === 'visit' ? -1 : 1));
    if (!events.length) return `<div class="empty journey-empty">${ic('map')}<b>아직 남긴 걸음이 없어요</b><p>사찰을 둘러보고, 다녀온 날의 생각을 한 줄 남겨 보세요. 기록은 이 기기에만 저장됩니다.</p><a class="btn" style="text-decoration:none" href="#/explore">사찰 둘러보기</a></div>`;
    const shown = events.slice(0, limit || 8);
    return `<ol class="journey-timeline">${shown.map(ev => {
      const temple = resolveTemple(ev.tid);
      const sampleTag = ev.sample ? '<span class="tag">예시</span>' : '';
      const typeTag = ev.kind === 'visit'
        ? `<span class="tag ${ev.method === 'demo' ? '' : 'ok'}">${ev.method === 'demo' ? '데모 인증' : '방문'}</span>`
        : '<span class="tag v">수첩 기록</span>';
      const title = temple ? `<a href="#/temple/${encodeURIComponent(temple.id)}">${esc(temple.name)}</a>` : '사찰 기록';
      const note = ev.kind === 'journal' && ev.note
        ? `<p class="journey-event-note">${esc(ev.note.length > 150 ? ev.note.slice(0, 150) + '…' : ev.note)}</p>` : '';
      return `<li class="journey-event ${ev.sample ? 'sample' : ''}"><div class="journey-event-head"><time datetime="${esc(ev.date)}">${fmtDate(ev.date)}</time>${typeTag}${sampleTag}</div><div class="journey-event-title">${title}</div>${note}</li>`;
    }).join('')}</ol>${events.length > shown.length ? `<p class="journey-more"><a class="text-link" href="#/journal">수첩에서 기록 더 보기${ic('chevron')}</a></p>` : ''}`;
  }
  function viewMissions() {
    const v = visited(), g = gradeInfo(v.size);
    const demoN = S.visits.filter(x => !x.sample && x.method === 'demo').length;
    const sampleN = S.visits.filter(x => x.sample).length;
    const sidoCount = s => TEMPLES.filter(t => t.sido === s && v.has(t.id)).length;
    return `<div class="screen-head"><h1>나의 순례</h1><p class="sub">방문 한 번에 도장 하나 · 염주 한 알${demoN ? ` · 데모 ${demoN}회 포함` : ''}${sampleN ? ` · 예시 ${sampleN}건 포함` : ''}. 이 기기에만 저장돼요.</p></div>
    <section class="card hero pilgrim-hero">
      <div class="section-heading">
        <div><h2>${g.cur ? esc(g.cur.name) : '첫 도장을 기다리는 중'}</h2></div>
        <span class="tag ${v.size ? 'ok' : ''}">도감 ${v.size}/100</span>
      </div>
      <div class="progress ${v.size >= 100 ? 'done' : ''}" role="img" aria-label="도감 ${v.size}곳 / 100곳"><i style="width:${Math.min(100, v.size)}%"></i></div>
      ${g.next ? `<p class="next-mission">${ic('target')} <span>다음은 <b>${esc(g.next.name)}</b> — ${g.left}곳만 더 걸으면 돼요</span></p>` : `<p class="next-mission">${ic('check')} <span>100곳을 모두 걸었어요 · 회향</span></p>`}
      <ol class="grade-rail">${GRADES.map(x => `<li class="${v.size >= x.n ? 'on' : ''}${g.next && g.next.n === x.n ? ' next' : ''}"><span class="grade-dot" aria-hidden="true"></span><b>${esc(x.name)}</b><span class="sub">${x.n}곳</span></li>`).join('')}</ol>
      <div class="btn-group">
        <button class="btn" data-act="cert-open">${ic('file')} 디지털 완주증</button>
        <a class="btn ghost" style="text-decoration:none" href="#/report">${ic('list')} 나의 리포트${isPlus() ? '' : ` ${ic('lock')}`}</a>
      </div>
    </section>
    <section class="card journey-card">
      <div class="section-heading"><div><h2>걸어온 여정</h2></div><a class="text-link" href="#/journal">수첩 보기${ic('chevron')}</a></div>
      ${journeyTimelineHTML(8)}
    </section>
    <section class="card bead-card">
      <div class="section-heading"><div><h2>${beads()}알 모았어요</h2></div><span class="tag">${108 - beads()}알 남음</span></div>
      ${beadSVG(beads(), 210)}
      <p class="sub bead-note">사찰을 방문하거나 오늘의 리추얼을 마치면 한 알씩 쌓여요. 쉬고 싶은 날은 쉬어도 됩니다.</p>
    </section>
    <section class="card"><div class="section-heading"><div><h2>순례 미션 · 배지</h2></div></div><div class="badges">${MISSIONS.map(m => { const p = missionProgress(m); const done = p.done >= p.total; return `<div class="badge ${done ? 'done' : ''}" title="${esc(m.note || '')}"><span class="badge-ic">${m.icon}</span><b>${m.name}</b><div class="sub">${p.done}/${p.total}</div><div class="progress"><i style="width:${p.done / p.total * 100}%"></i></div><div class="sub simple-hide" style="font-size:.85em">${m.reward}</div></div>`; }).join('')}</div>
      <p class="notice" style="margin-top:10px">7대 총림 지정 현황과 100대 사찰 선정 기준은 확정 후 반영 예정이에요.</p></section>
    ${seasonCard()}
    <section class="card"><div class="row between"><h2>도감 ${v.size}/100</h2><a class="sub" href="#/dex">전체 보기 →</a></div>
      <div class="dex">${dexCells(10)}</div></section>
    <section class="card"><h2>순례 지도</h2><p class="sub">방문한 지역이 색칠돼요.</p>
      <div class="tilemap">${TILE.flat().map(s => { if (!s) return '<div class="empty"></div>'; const n = sidoCount(s), tot = TEMPLES.filter(t => t.sido === s).length; const lv = n === 0 ? '' : n >= 3 ? 'l3' : 'l' + n; return `<div class="${lv}">${s}<br>${n}/${tot}</div>`; }).join('')}</div>
      <div id="pmap" style="margin-top:10px"></div></section>
    <section class="card simple-hide"><h2>방문 기록</h2>${S.visits.length ? `<div class="tlist">${S.visits.slice().reverse().slice(0, 20).map(x => { const rt = resolveTemple(x.tid); const kind = x.sample ? ' · 예시' : (x.method === 'demo' ? ' · 🧪데모' : ' · 📍GPS'); return rt ? templeItem(rt, fmtDate(x.date) + kind) : ''; }).join('')}</div>` : '<p class="sub">아직 방문 기록이 없어요.</p>'}
      <div class="screen-actions" style="margin-top:10px">
        <button class="chip" data-act="sample-populate">✨ 샘플 값 채우기</button>
        <button class="chip" data-act="reset">모든 기록 초기화</button>
      </div></section>`;
  }
  function dexCells(limit) {
    const v = visited(); const cells = [];
    const sorted = TEMPLES.slice().sort((a, b) => (v.has(b.id) - v.has(a.id)));
    for (let i = 0; i < (limit || 100); i++) {
      const t = sorted[i];
      if (t) { const got = v.has(t.id); cells.push(`<a class="cell ${got ? 'got' : 'sil'}" href="#/temple/${t.id}"><div><div class="s">${sealChar(t)}</div>${got ? esc(t.name.replace(/\(.*\)/, '')) : '아직'}</div></a>`); }
      else cells.push(`<div class="cell sil"><div><div class="s">·</div>선정 예정</div></div>`);
    }
    return cells.join('');
  }
  function viewDex() {
    return `<a href="#/missions" class="backlink">${ic('back')} 순례</a><div class="screen-head"><h1>사찰 도감 ${visited().size}/100</h1><p class="sub">방문한 사찰만 도장이 찍히고, 나머지는 윤곽으로 보여요. ${TEMPLES.length}곳 수록 · 나머지는 100대 사찰 선정 후 공개.</p></div><div class="dex">${dexCells(100)}</div>`;
  }

  // ---------- 사찰 수첩 ----------
  function viewJournal() {
    const list = S.journal.slice().sort((a, b) => b.date.localeCompare(a.date));
    const trips = (S.trips || []).slice();
    return `<div class="screen-head">
        <div class="row between"><h1>사찰 수첩</h1><a class="btn small" style="text-decoration:none" href="#/journal/new/">${ic('plus')} 첫 기록</a></div>
        <p class="sub">사진·날씨·다짐을 남겨 두면 나중에 '1년 전 오늘'로 다시 만나요. (이 기기에만 저장)</p>
      </div>
      <div class="screen-actions">
        <a class="chip" style="text-decoration:none" href="#/planner">${ic('calendar')} 여행 계획 ${trips.length}</a>
        <button class="chip" data-act="cert-open">${ic('file')} 완주증</button>
        <button class="chip" data-act="sample-populate">${ic('sparkle')} 샘플 값 채우기</button>
      </div>
      ${list.length ? list.map(j => { const t = resolveTemple(j.tid); return `<article class="card jentry"><div class="jentry-head"><b>${t ? esc(t.name) : '기타'}</b><span class="sub">${fmtDate(j.date)}${j.weather ? ' · ' + esc(j.weather) : ''}</span></div><p class="jentry-body">${esc(j.note)}</p>${j.photo ? `<img src="${j.photo}" alt="${t ? esc(t.name) : ''} 사진">` : ''}<div class="jentry-foot"><button class="btn text small" data-act="jdel" data-id="${j.id}">삭제</button></div></article>`; }).join('') : `<div class="empty">${ic('pencil')}<b>아직 남긴 걸음이 없어요</b><p>사찰에서 떠올린 한 줄을 적어 두면, 그날의 공기가 함께 남습니다.</p><a class="btn" style="text-decoration:none" href="#/journal/new/">수첩 쓰기</a></div>`}`;
  }
  function viewJournalNew(tid) {
    const preT = resolveTemple(tid);
    const extraOpt = (preT && preT.isTradOnly) ? `<option value="${esc(preT.id)}" selected>[${esc(preT.sido)} ${esc(preT.sgg)}] ${esc(preT.name)} (전통사찰 No.${preT.tradNo})</option>` : '';
    return `<a href="#/journal" class="sub" style="text-decoration:none">← 수첩</a><h1>수첩 쓰기</h1>
    <form id="jform" class="card">
      <label>사찰 (주요 사찰 및 전통사찰 991곳)</label><select name="tid">${extraOpt}${TEMPLES.map(t => `<option value="${t.id}" ${t.id === tid ? 'selected' : ''}>[${esc(t.sido)}] ${esc(t.name)}</option>`).join('')}${TRAD.map(r => `<option value="${r.id}" ${r.id === tid ? 'selected' : ''}>[${esc(r.sido)} ${esc(r.sgg)}] ${esc(r.name)} (No.${r.no})</option>`).join('')}</select>
      <label>날짜</label><input type="date" name="date" value="${today()}" required>
      <label>날씨</label><select name="weather"><option>☀️ 맑음</option><option>⛅ 구름</option><option>🌧 비</option><option>❄️ 눈</option><option>🌫 안개</option></select>
      <label>오늘의 다짐·메모</label><textarea name="note" placeholder="걸으며 떠오른 생각, 오늘의 다짐을 적어 보세요" maxlength="1000"></textarea>
      <label>사진 (선택)</label><input type="file" name="photo" accept="image/*">
      <p class="sub" style="font-size:.8em">사진은 기기 저장 공간 절약을 위해 작게 줄여 저장해요.</p>
      <button class="btn block" type="submit" style="margin-top:10px">저장</button></form>`;
  }
  function resizeImage(file) {
    return new Promise((res, rej) => {
      const fr = new FileReader(); fr.onerror = rej;
      fr.onload = () => { const img = new Image(); img.onerror = rej; img.onload = () => { const max = 800, sc = Math.min(1, max / Math.max(img.width, img.height)); const c = document.createElement('canvas'); c.width = img.width * sc; c.height = img.height * sc; c.getContext('2d').drawImage(img, 0, 0, c.width, c.height); res(c.toDataURL('image/jpeg', .7)); }; img.src = fr.result; };
      fr.readAsDataURL(file);
    });
  }
  function bindJournalForm() {
    const f = document.getElementById('jform'); if (!f) return;
    f.addEventListener('submit', async e => {
      e.preventDefault(); const fd = new FormData(f); const file = fd.get('photo');
      let photo = null; if (file && file.size) { try { photo = await resizeImage(file); } catch (er) { toast('사진을 읽지 못했어요.'); } }
      S.journal.push({ id: Date.now().toString(36), tid: fd.get('tid'), date: fd.get('date'), weather: fd.get('weather'), note: (fd.get('note') || '').trim(), photo });
      save(); toast('수첩에 저장했어요 📔'); location.hash = '#/journal';
    });
  }

  // ---------- 사찰 여행 계획 (Trip Planner) ----------
  /* 계획·추천 코스 화면(945줄)은 js/app/planner.js 로 옮겼다. 무거운 화면이라 계획 라우트에 들어갈 때만
   * 로더가 내려준다. 여기서는 셸의 상태·유틸을 넘겨 모듈을 만들고, 라우터가 쓰던 이름만 이어 준다. */
  let planner = null;
  let community = null;                            // 회원·게시판 화면 모듈 (js/app/community.js)
  function plannerMod() {
    if (!planner && window.MJ_PLANNER_FACTORY) {
      planner = window.MJ_PLANNER_FACTORY({
        S, save, render, toast, esc, today, haversine, resolveTemple, visited, openModal,
        TEMPLES, THEMES, MISSIONS, TRAD, SIDO_ORDER, MJAnalytics, PLAN_RECO
      });
    }
    return planner;
  }
  // 계획 화면에서 쓰는 초안 상태 (라우터가 자산을 확보한 뒤이므로 보통은 바로 있다)
  function plannerS() { const m = plannerMod(); return m ? m.state : null; }
  // 사찰 상세·테마 코스처럼 "계획 화면 밖"에서 초안을 만질 때 — 모듈을 확보한 뒤 실행한다
  function withPlanner(fn) {
    const m = plannerMod();
    if (m) return fn(m);
    if (window.MJ_LOADER) {
      window.MJ_LOADER.ensure(['planner'])
        .then(() => { const mm = plannerMod(); if (mm) fn(mm); })
        .catch(() => toast('여행 계획을 불러오지 못했어요. 잠시 후 다시 시도해 주세요.'));
    }
  }
  function viewPlanner(a, b) {
    const m = plannerMod();
    if (!m) return '<h1>사찰 여행 계획</h1><p class="notice">계획 화면을 불러오는 중이에요. 잠시만 기다려 주세요.</p>';
    return m.viewPlanner(a, b);
  }

  function communityMod() {
    if (!community && window.MJ_COMMUNITY_FACTORY) {
      community = window.MJ_COMMUNITY_FACTORY({
        api, esc, toast, repaint: refreshView, goto: goHash, ic,
        getMember: () => ME.member || null,
        applySession, refreshMember: syncMe
      });
    }
    return community;
  }
  function viewCommunity(r, a, b) {
    const m = communityMod();
    if (!m) return '<h1>회원 게시판</h1><p class="notice">화면을 불러오는 중이에요. 잠시만 기다려 주세요.</p>';
    return m.view(r, a, b);
  }

  // ---------- 모달 (화면 크기별: 모바일 하단 시트 · 데스크톱 중앙 대화상자) ----------
  function openModal(html) {
    const m = document.getElementById('modal');
    m.innerHTML = html; m.classList.remove('hidden');
    document.body.classList.add('modal-open');   // 배경 스크롤 잠금 — 시트가 화면 높이만큼만 스크롤되게
    const sheet = m.querySelector('.sheet');
    if (sheet) {
      sheet.setAttribute('tabindex', '-1');
      // 시트에는 항상 '닫기' 손잡이를 하나 더 둔다 — Esc 를 모르는 모바일 사용자를 위해
      if (typeof sheet.insertAdjacentHTML === 'function' && !sheet.querySelector('.sheet-close')) {
        sheet.classList.add('has-close');
        sheet.insertAdjacentHTML('afterbegin', `<button class="sheet-close" data-act="close" aria-label="닫기">${ic('x')}</button>`);
      }
      sheet.focus({ preventScroll: true });
    }
  }
  function closeModal() {
    const m = document.getElementById('modal');
    m.classList.add('hidden'); m.innerHTML = '';
    document.body.classList.remove('modal-open');
  }

  // ---------- 회원 전용 게이트 & 회원가입·로그인 모달 ----------
  // 미끼(맛보기) 기능(홈 기분 체크인 1곳 맛보기 · 오늘의 한 구절 · 3분 호흡 · 마음 쉼터 명상음 · 기본 사찰 탐색/상세)은
  // 비회원에게도 열어 두고, 주요 기능들은 회원가입 후 로그인해야 이용할 수 있게 안내 창을 띄운다.
  const isMember = () => !!(ME && ME.member);
  const AUTH_GATED_ACTIONS = {
    'reshuffle': '다른 사찰 처방 받기',
    'start-onboarding': '3문항 맞춤 사찰 추천',
    'onboard-pick': '3문항 맞춤 사찰 추천',
    'onboard-back': '3문항 맞춤 사찰 추천',
    'onboard-next': '3문항 맞춤 사찰 추천',
    'onboard-done': '3문항 맞춤 사찰 추천',
    'onboard-enter': '3문항 맞춤 사찰 추천',
    'daily-ritual': '108 염주·기도 리추얼 기록',
    'gps': 'GPS 사찰 방문 인증',
    'demo': '사찰 방문 인증',
    'demo-ok': '사찰 방문 인증',
    'nav-hub': '사찰 길찾기 내비게이션',
    'templestay-hub': '템플스테이 프로그램 상세 안내',
    'docent-temple': '오디오 도슨트 음성 안내',
    'docent-story': '심화 스토리 오디오 듣기',
    'ai-counsel': 'AI 맞춤 참배·마음 상담',
    'cert-open': '디지털 순례 완주증 발급',
    'plan-pick': '사찰 여행 계획 담기',
    'plan-new-with': '새 사찰 여행 계획 만들기',
    'plan-append': '여행 계획에 사찰 추가',
    'tpl-adopt': '추천 순례 코스 담기',
    'course-to-plan': '테마 순례 코스 담기',
    'tpl-theme': '테마별 추천 코스',
    'reco-run': '맞춤 사찰 코스 추천',
    'reco-again': '다른 사찰 코스 추천',
    'reco-apply': '추천 코스 일정 적용',
    'reco-dismiss': '맞춤 사찰 코스 추천',
    'draft-search': '사찰 여행 코스 플래너',
    'draft-add': '사찰 여행 코스 플래너',
    'draft-rm': '사찰 여행 코스 플래너',
    'draft-up': '사찰 여행 코스 플래너',
    'draft-down': '사찰 여행 코스 플래너',
    'draft-optimize': '동선 최단거리 자동 정렬',
    'draft-reset': '사찰 여행 코스 플래너',
    'trip-del': '여행 계획 관리',
    'trip-chk': '순례 준비물 체크리스트',
    'jdel': '사찰 수첩 기록 관리',
    'locate': '내 주변 사찰 찾기',
    'offline': '산중 오프라인 사찰 저장',
    'sample-populate': '순례 샘플 기록 체험',
    'reset': '순례 기록 초기화',
    'skin': '108 염주 스킨 꾸미기',
    'paywall': '절로가 플러스 멤버십',
    'trial-start': '절로가 플러스 무료 체험',
    'plus-on': '절로가 플러스 시작',
    'plus-off': '절로가 플러스 관리',
    'buy': '콘텐츠 상점 구매',
    'buy-ok': '콘텐츠 상점 구매',
    'ad': '보상형 광고로 스토리 열기',
    'ad-reward': '보상형 광고로 스토리 열기',
    'gift-open': '절로가 플러스 선물하기',
    'gift-send': '절로가 플러스 선물하기',
    'print': '가이드북 PDF 저장·인쇄'
  };

  function routeGateLabel(r, a, b) {
    if (r === 'missions') return '나의 순례 · 108 염주 · 미션';
    if (r === 'dex') return '100대 사찰 도감';
    if (r === 'journal') return a === 'new' ? '사찰 수첩 쓰기' : '사찰 수첩 기록';
    if (r === 'planner') return '사찰 여행 코스 플래너';
    if (r === 'mind') return '심화 마음 리포트';
    if (r === 'report') return '나의 순례 리포트';
    if (r === 'fengshui') return '전국 명당 사찰 풍수 대백과';
    if (r === 'guide') return '전국 기도처 가이드북';
    if (r === 'season-report') return '계절 단풍 사찰 리포트';
    if (r === 'plus') return '절로가 플러스';
    if (r === 'store') return '콘텐츠 상점';
    if (r === 'explore' && a === 'all') return '전통사찰 991곳 전체 검색';
    if (r === 'board' && (a === 'write' || b === 'edit')) return '회원 게시판 글쓰기';
    return '';
  }

  function hashGateLabel(hash) {
    const clean = String(hash || '').replace(/^#\/?/, '');
    if (!clean) return '';
    const [r, a, b] = clean.split('/').map(s => { try { return decodeURIComponent(s); } catch (e) { return s; } });
    return routeGateLabel(r, a, b);
  }

  const authModalState = { mode: 'login', feature: '', nextHash: '', onSuccess: null };

  function authGateBanner(label) {
    return `<section class="card auth-gate-banner" aria-label="회원 전용 기능 안내">
      <div class="row between wrap">
        <div>
          <span class="tag v">${ic('lock')} 회원 전용</span>
          <p class="sub" style="margin:4px 0 0"><b>${esc(label)}</b> 기능은 회원가입 후 로그인하면 바로 이용할 수 있어요.</p>
        </div>
        <div class="btn-group" style="margin-top:0">
          <button type="button" class="btn small" data-act="open-auth" data-tab="login" data-feature="${esc(label)}">로그인</button>
          <button type="button" class="btn ghost small" data-act="open-auth" data-tab="signup" data-feature="${esc(label)}">회원가입</button>
        </div>
      </div>
    </section>`;
  }

  function authModalHTML() {
    const mode = authModalState.mode === 'signup' ? 'signup' : 'login';
    const feat = authModalState.feature;
    const title = feat ? `「${esc(feat)}」 기능은 로그인 후 이용할 수 있어요` : '회원가입 · 로그인 후 이용해 주세요';
    const tabs = `<div class="seg auth-modal-tabs" role="tablist" aria-label="로그인 또는 회원가입">
      <button type="button" class="${mode === 'login' ? 'on' : ''}" data-act="auth-tab" data-tab="login" aria-pressed="${mode === 'login' ? 'true' : 'false'}">로그인</button>
      <button type="button" class="${mode === 'signup' ? 'on' : ''}" data-act="auth-tab" data-tab="signup" aria-pressed="${mode === 'signup' ? 'true' : 'false'}">회원가입</button>
    </div>`;
    const form = mode === 'signup'
      ? `<form class="cm-form auth-modal-form" data-auth-form="signup" novalidate>
          <label for="am-s-email">이메일</label>
          <input id="am-s-email" name="email" type="email" inputmode="email" autocomplete="email" autocapitalize="off" spellcheck="false" maxlength="254" placeholder="example@email.com" required>
          <label for="am-s-nick">닉네임</label>
          <input id="am-s-nick" name="nickname" autocomplete="nickname" maxlength="12" placeholder="한글·영문·숫자 2~12자" required>
          <p class="sub cm-hint">한글·영문·숫자·밑줄(_)로 2~12자. 다른 회원과 겹칠 수 없어요.</p>
          <label for="am-s-pw">비밀번호</label>
          <input id="am-s-pw" name="password" type="password" autocomplete="new-password" maxlength="100" placeholder="8자 이상, 영문+숫자 조합" required>
          <label for="am-s-pw2">비밀번호 확인</label>
          <input id="am-s-pw2" name="password2" type="password" autocomplete="new-password" maxlength="100" placeholder="비밀번호 다시 입력" required>
          <label class="cm-agree"><input type="checkbox" name="agree" checked> <span>회원 이용 규칙(서로 존중하기 · 개인정보 올리지 않기)에 동의해요</span></label>
          <p class="cm-error" role="alert"></p>
          <button class="btn block" type="submit">회원가입하고 바로 이용하기</button>
        </form>
        <p class="sub cm-center">이미 회원이신가요? <button type="button" class="btn text small" data-act="auth-tab" data-tab="login">로그인 하기 →</button></p>`
      : `<form class="cm-form auth-modal-form" data-auth-form="login" novalidate>
          <label for="am-l-email">이메일</label>
          <input id="am-l-email" name="email" type="email" inputmode="email" autocomplete="email" autocapitalize="off" spellcheck="false" maxlength="254" placeholder="가입한 이메일 주소" required>
          <label for="am-l-pw">비밀번호</label>
          <input id="am-l-pw" name="password" type="password" autocomplete="current-password" maxlength="100" placeholder="비밀번호 입력" required>
          <p class="cm-error" role="alert"></p>
          <button class="btn block" type="submit">로그인하고 바로 이용하기</button>
        </form>
        <p class="sub cm-center">아직 회원이 아니신가요? <button type="button" class="btn text small" data-act="auth-tab" data-tab="signup">회원가입 하기 →</button></p>`;

    return `<div class="sheet auth-sheet">
      <div class="auth-sheet-head">
        <span class="tag v">${ic('lock')} 회원 전용</span>
        <h2>${title}</h2>
        <p class="sub">맛보기 기능(기분 체크인·3분 호흡·마음 쉼터·사찰 기본 탐색) 외의 주요 기능은 회원가입 후 로그인하면 모두 열려요.</p>
        <div class="auth-feat-badges">
          <span class="tag">${ic('target')} GPS 방문 인증·108 염주</span>
          <span class="tag">${ic('calendar')} 여행 계획·추천 코스</span>
          <span class="tag">${ic('pencil')} 사찰 수첩·완주증</span>
          <span class="tag">${ic('sparkle')} AI 상담·오디오 도슨트</span>
        </div>
      </div>
      ${tabs}
      ${form}
    </div>`;
  }

  function openAuthModal(opts = {}) {
    const m = document.getElementById('modal');
    if (opts.preserveIfOpen && m && !m.classList.contains('hidden') && String(m.innerHTML || '').includes('data-auth-form')) {
      return;
    }
    if (opts.mode) authModalState.mode = opts.mode === 'signup' ? 'signup' : 'login';
    if (opts.feature !== undefined) authModalState.feature = opts.feature || '';
    if (opts.nextHash !== undefined) authModalState.nextHash = opts.nextHash || '';
    if (opts.onSuccess !== undefined) authModalState.onSuccess = opts.onSuccess || null;
    openModal(authModalHTML());
  }
  window.MJ_OPEN_AUTH = openAuthModal;

  // ---------- 라우터 ----------
  let prevRoute = null, enterT = null;
  function render() {
    const parts = (location.hash || '#/home').slice(2).split('/').map(decodeURIComponent);
    const [r, a, b, c] = parts;
    if (mapObj) { mapObj.remove(); mapObj = null; }
    let html, tab = r;
    // 화면(라우트)별 배치 규칙이 CSS에서 고를 수 있도록 태깅 — 넓은 화면에서 카드를 몇 열로 둘지 결정
    const route = String(r || 'home').toLowerCase().replace(/[^a-z-]/g, '');
    const WIDE_FLOW = ['home', 'missions', 'store', 'planner', 'journal', 'fengshui', 'explore', 'map', 'report', 'mind'];
    $view.dataset.route = route;
    $view.dataset.flow = WIDE_FLOW.includes(route) && a !== 'new' ? 'cards' : '';
    switch (r) {
      case 'explore': html = viewExplore(a, b, c); break;
      case 'fengshui': html = viewFengshuiAtlas(); tab = 'explore'; break;
      case 'temple': html = viewTemple(a); tab = 'explore'; break;
      case 'map': html = viewMap(); break;
      case 'missions': html = viewMissions(); break;
      case 'dex': html = viewDex(); tab = 'missions'; break;
      case 'journal': html = a === 'new' ? viewJournalNew(b) : viewJournal(); break;
      case 'plus': html = viewPlus(); tab = 'plus'; break;
      case 'store': html = viewStore(); tab = 'plus'; break;
      case 'story': html = viewStory(a); tab = 'explore'; break;
      case 'report': html = viewReport(); tab = 'missions'; break;
      case 'guide': html = viewGuide(); tab = 'plus'; break;
      case 'season-report': html = viewSeasonReport(); tab = 'plus'; break;
      case 'mind': html = viewMind(); tab = 'home'; break;
      case 'planner': html = viewPlanner(a, b); tab = 'journal'; break;
      case 'board':
      case 'account':
        // 데이터는 화면에 들어온 순간 받는다 (같은 화면을 다시 그릴 때는 재요청하지 않는다)
        if (communityMod()) communityMod().enter(r, a, b);
        html = viewCommunity(r, a, b); tab = 'board'; break;
      default: html = viewHome(); tab = 'home';
    }
    const gateLabel = !isMember() ? routeGateLabel(r, a, b) : '';
    if (gateLabel) html = html + authGateBanner(gateLabel);
    $view.innerHTML = html;
    if (gateLabel) openAuthModal({ mode: 'login', feature: gateLabel, preserveIfOpen: true });
    // 진입 애니메이션은 '화면이 바뀌었을 때'만 켠다 — 같은 화면을 다시 그려도 카드가 다시 튀면 읽다가 피로해진다
    if ($view.dataset.route !== prevRoute) {
      prevRoute = $view.dataset.route;
      if ($view.classList && typeof window.setTimeout === 'function') {
        $view.classList.add('entering');
        if (enterT && typeof window.clearTimeout === 'function') window.clearTimeout(enterT);
        enterT = window.setTimeout(() => $view.classList.remove('entering'), 520);
      }
    }
    document.querySelectorAll('.tabbar a').forEach(x => {
      const on = x.dataset.tab === tab;
      x.classList.toggle('on', on);
      // aria-current 는 'false' 도 유효 — removeAttribute 보다 안전하고(가상 DOM 호환) SR 도 상태를 안다
      x.setAttribute('aria-current', on ? 'page' : 'false');
    });
    updatePlusChip();
    updateMemberChip();
    if (window.MJ_FEATURES && window.MJ_FEATURES.I18N) window.MJ_FEATURES.I18N.apply();
    MJAnalytics.track('page_view', { page: r || 'home' });
    if (r === 'story') MJAnalytics.track('story_open', { page: 'story', item: a });
    if (r === 'temple') {
      MJAnalytics.track('temple_open', { page: 'temple', item: a });
      const curT = resolveTemple(a);
      if (curT && window.MJ_FEATURES && window.MJ_FEATURES.Weather) {
        window.MJ_FEATURES.Weather.fetchWeather(curT.lat, curT.lng).then(w => {
          const box = document.getElementById('templeWeatherBox');
          if (box && w) {
            box.innerHTML = `<span class="weather-chip"><span class="wicon">${w.icon}</span> <b>${w.temp}°C</b> ${w.desc} (바람 ${w.wind}m/s)</span>
            <span class="sub" style="font-size:.8em;margin-left:4px">💡 ${w.advice}</span>`;
          }
        });
      }
    }
    if (r === 'plus') MJAnalytics.track('paywall_view', { feature: 'plus_page' });
    if ('speechSynthesis' in window && !window.MJ_AUDIO_ACTIVE) speechSynthesis.cancel();
    if (r === 'map') { mapObj = initMap(a); }
    if (r === 'missions') { mapObj = initMap(null, 'pmap', true); }
    if (r === 'planner' && a === 'view') { const tr = (S.trips || []).find(x => x.id === b); if (tr) withPlanner(m => { mapObj = m.initPlanMap(tr.stops); }); }
    if (r === 'explore') bindExplore();
    if (r === 'journal' && a === 'new') bindJournalForm();
    if (r === 'planner' && a === 'new') { const m = plannerMod(); if (m) m.bindPlannerForm(); }
    else { const m = plannerMod(); if (m) m.state.refreshTempleOptions = null; }
    window.scrollTo(0, 0);
  }

  // 부가 기능은 첫 페인트 뒤에 받는다. 사용자가 그 전에 눌러도 로딩을 기다렸다가 행동을 이어 간다.
  function withFeatures(run) {
    if (window.MJ_FEATURES) { run(window.MJ_FEATURES); return; }
    const loader = window.MJ_LOADER;
    if (!loader || typeof loader.ensureOne !== 'function') {
      toast('이 기능을 불러올 수 없어요. 잠시 후 다시 시도해 주세요.');
      return;
    }
    loader.ensureOne('features').then(() => {
      if (window.MJ_FEATURES) run(window.MJ_FEATURES);
      else toast('이 기능을 불러올 수 없어요. 잠시 후 다시 시도해 주세요.');
    }).catch(() => toast('연결을 확인한 뒤 다시 시도해 주세요.'));
  }

  /* 화면 이동 한 곳 — 화면에 필요한 데이터·지도를 먼저 확보한 뒤 그린다.
   * 이미 받아 둔 자산뿐이면 동기 경로로 바로 그려서 첫 화면이 늦어지지 않게 한다.
   */
  let pendingNav = null, navSeq = 0;
  function navigate() {
    const loader = window.MJ_LOADER;
    if (!loader) { hydrateLazyData(); render(); return Promise.resolve(); }   // 로더 없는 환경(정적 SEO·테스트)
    const hash = location.hash || '#/home';
    const soft = loader.softFor(hash);
    const requested = [...new Set(loader.needsFor(hash).concat(soft))];
    const missing = loader.missing(requested);
    const blocking = missing.filter(k => soft.indexOf(k) === -1);
    const seq = navSeq + 1; navSeq = seq;

    if (!blocking.length) {
      // 기다리지 않고 먼저 그린다 — 첫 화면 체감 속도가 가장 중요하다
      hydrateLazyData(); render();
      if (!missing.length) { pendingNav = null; return Promise.resolve(); }
      pendingNav = loader.ensure(missing)
        .catch(err => { console.warn('[MJ] 자산을 불러오지 못했어요:', err && err.message); })
        .then(() => {
          hydrateLazyData();
          if (seq === navSeq) { render(); pendingNav = null; }
        });
      return pendingNav;
    }

    // 화면을 그리는 자산만 기다린다. SOFT 자산은 별도로 받아 도착이 늦어도 화면 전환을 막지 않는다.
    let rendered = false;
    pendingNav = loader.ensure(blocking)
      .catch(err => { console.warn('[MJ] 자산을 불러오지 못했어요:', err && err.message); })
      .then(() => {
        hydrateLazyData();
        if (seq === navSeq) { rendered = true; render(); pendingNav = null; }
      });
    const softMissing = missing.filter(k => soft.indexOf(k) !== -1);
    if (softMissing.length) {
      loader.ensure(softMissing)
        .then(() => {
          hydrateLazyData();
          if (seq === navSeq && rendered) render();
        })
        .catch(err => { console.warn('[MJ] 부가 자산을 불러오지 못했어요:', err && err.message); });
    }
    return pendingNav;
  }

  document.addEventListener('submit', async e => {
    const form = e.target;
    const authKind = form && form.dataset ? form.dataset.authForm : '';
    if (authKind) {
      e.preventDefault();
      const errBox = form.querySelector('.cm-error');
      const setErr = msg => { if (errBox) errBox.textContent = msg || ''; };
      const btns = form.querySelectorAll('button[type="submit"]');
      const setBusy = on => btns.forEach(b => { b.disabled = on; });

      if (authKind === 'login') {
        const fd = new FormData(form);
        const email = String(fd.get('email') || '').trim();
        const password = String(fd.get('password') || '');
        if (!email || !password) return setErr('이메일과 비밀번호를 입력해 주세요.');
        setBusy(true);
        const r = await api('/api/auth/login', { method: 'POST', body: { email, password } });
        setBusy(false);
        if (!r.ok) {
          setErr((r.body && r.body.message) || '로그인하지 못했어요. 이메일과 비밀번호를 확인해 주세요.');
          const pw = form.querySelector('[name="password"]');
          if (pw && r.status === 401) pw.value = '';
          return;
        }
        const nextHash = authModalState.nextHash;
        const cb = authModalState.onSuccess;
        authModalState.nextHash = '';
        authModalState.onSuccess = null;
        await applySession({ uid: r.body.uid, token: r.body.token, member: r.body.member });
        closeModal();
        toast(`${r.body.member.nickname}님, 어서 오세요 🙏 모든 주요 기능이 열렸어요!`);
        if (nextHash && location.hash !== nextHash) location.hash = nextHash;
        else render();
        if (typeof cb === 'function') cb();
      } else if (authKind === 'signup') {
        const fd = new FormData(form);
        const email = String(fd.get('email') || '').trim();
        const nickname = String(fd.get('nickname') || '').trim();
        const password = String(fd.get('password') || '');
        const password2 = String(fd.get('password2') || '');
        if (!fd.get('agree')) return setErr('회원 이용 규칙에 동의해 주세요.');
        if (!email || !nickname || !password) return setErr('이메일·닉네임·비밀번호를 모두 입력해 주세요.');
        if (password !== password2) return setErr('비밀번호 확인이 달라요. 다시 입력해 주세요.');
        setBusy(true);
        const r = await api('/api/auth/signup', { method: 'POST', body: { email, nickname, password } });
        setBusy(false);
        if (!r.ok) return setErr((r.body && r.body.message) || '가입하지 못했어요. 입력 내용을 확인해 주세요.');
        const nextHash = authModalState.nextHash;
        const cb = authModalState.onSuccess;
        authModalState.nextHash = '';
        authModalState.onSuccess = null;
        await applySession({ uid: r.body.uid, token: r.body.token, member: r.body.member });
        closeModal();
        toast(`가입을 환영해요, ${r.body.member.nickname}님 🪷 모든 주요 기능이 열렸어요!`);
        if (nextHash && location.hash !== nextHash) location.hash = nextHash;
        else render();
        if (typeof cb === 'function') cb();
      }
      return;
    }
    if (!isMember() && form && (form.id === 'jform' || form.id === 'planForm')) {
      e.preventDefault();
      if (typeof e.stopImmediatePropagation === 'function') e.stopImmediatePropagation();
      openAuthModal({ mode: 'login', feature: form.id === 'planForm' ? '사찰 여행 계획 저장' : '사찰 수첩 기록 저장' });
    }
  }, true);

  document.addEventListener('click', e => {
    // 비회원일 때 회원 전용 링크(#/missions · #/journal · #/planner 등)나 상단 로그인 칩을 누르면 즉시 회원가입/로그인 창을 띄운다
    if (!isMember() && e.target && typeof e.target.closest === 'function') {
      const link = e.target.closest('a[href^="#/"]');
      if (link && !link.dataset.act) {
        const href = link.getAttribute('href') || '';
        if (link.id === 'memberChip') {
          if (typeof e.preventDefault === 'function') e.preventDefault();
          openAuthModal({ mode: 'login', feature: '' });
          return;
        }
        const gate = hashGateLabel(href);
        if (gate) {
          if (typeof e.preventDefault === 'function') e.preventDefault();
          openAuthModal({ mode: 'login', feature: gate, nextHash: href });
          return;
        }
      }
    }
    const el = e.target.closest('#langToggle,[data-act],[data-mood],[data-f],[data-go],[data-map-view]'); if (!el) return;
    if (el.id === 'langToggle') {
      withFeatures(features => {
        features.I18N.toggleLang();
        toast(features.I18N.getLang() === 'en' ? 'Switched to English' : '한국어로 전환되었습니다');
      });
      return;
    }
    if (el.dataset.go) {
      const goGate = !isMember() ? hashGateLabel(el.dataset.go) : '';
      if (goGate) { openAuthModal({ mode: 'login', feature: goGate, nextHash: el.dataset.go }); return; }
      location.hash = el.dataset.go;
      return;
    }
    if (el.dataset.mood != null) { S.moodIdx = +el.dataset.mood; S.shift = 0; S.moodLog = (S.moodLog || []).filter(x => x.date !== today()).concat([{ date: today(), mood: S.moodIdx }]).slice(-60); save(); render(); return; }
    if (el.dataset.mapView != null) {
      mapMode = el.dataset.mapView === 'list' ? 'list' : 'map';
      const mapPane = document.getElementById('mapPane');
      const listPane = document.getElementById('mapListPane');
      if (mapPane) mapPane.classList.toggle('hidden', mapMode !== 'map');
      if (listPane) listPane.classList.toggle('hidden', mapMode !== 'list');
      document.querySelectorAll('.map-view-switch [data-map-view]').forEach(b => b.setAttribute('aria-pressed', b === el ? 'true' : 'false'));
      if (mapMode === 'map') fitMap();
      return;
    }
    if (el.dataset.f != null) {
      if (!isMember() && el.dataset.f === 'visited') {
        openAuthModal({ mode: 'login', feature: '방문한 사찰 지도 필터' });
        return;
      }
      mapActiveFilter = el.dataset.f || '';
      document.querySelectorAll('#mapf .chip').forEach(c => { c.classList.toggle('on', c === el); c.setAttribute('aria-pressed', c === el ? 'true' : 'false'); });
      if (mapObj && mapObj._draw) mapObj._draw(mapActiveFilter);
      const results = document.getElementById('mapListResults');
      if (results) results.innerHTML = mapListHTML(mapActiveFilter);
      return;
    }
    const act = el.dataset.act;
    if (act === 'auth-tab') {
      authModalState.mode = el.dataset.tab === 'signup' ? 'signup' : 'login';
      openModal(authModalHTML());
      return;
    }
    if (act === 'open-auth') {
      openAuthModal({
        mode: el.dataset.tab === 'signup' ? 'signup' : 'login',
        feature: el.dataset.feature || ''
      });
      return;
    }
    if (!isMember() && act && AUTH_GATED_ACTIONS[act]) {
      if (typeof e.preventDefault === 'function') e.preventDefault();
      openAuthModal({ mode: 'login', feature: AUTH_GATED_ACTIONS[act] });
      return;
    }
    if (act === 'reshuffle') { S.shift = (S.shift || 0) + 1; save(); render(); }
    else if (act === 'gps') gpsCheckin(el.dataset.id);
    else if (act === 'demo') demoCheckin(el.dataset.id);
    else if (act === 'demo-ok') { closeModal(); addVisit(el.dataset.id, 'demo', null); }
    else if (act === 'close') { clearInterval(openAd._t); closeModal(); if (el.tagName !== 'A') render(); }
    else if (act === 'locate' && mapObj) { mapObj.locate({ setView: true, maxZoom: 11 }); mapObj.once('locationfound', ev => L.circleMarker(ev.latlng, { radius: 8, color: '#2b6cb0' }).addTo(mapObj).bindPopup('내 위치').openPopup()); mapObj.once('locationerror', () => toast('위치를 가져오지 못했어요.')); }
    else if (act === 'jdel') { if (confirm('이 기록을 삭제할까요?')) { S.journal = S.journal.filter(j => j.id !== el.dataset.id); save(); render(); } }
    else if (act === 'consent-allow') { MJAnalytics.setConsent(true); render(); toast('익명 통계 수집을 허용했어요.'); }
    else if (act === 'consent-deny') { MJAnalytics.setConsent(false); render(); toast('익명 통계 수집을 거부했어요.'); }
    else if (act === 'daily-ritual') { recordRitual(); render(); toast('오늘의 리추얼을 완료했어요 📿'); }
    else if (act === 'daily-breathing') {
      openModal(`<div class="sheet" style="text-align:center"><h2>🧘 3분 호흡 명상</h2><p>천천히 숨을 들이쉬고, 내쉬세요.</p><div id="breathCircle" style="width:120px;height:120px;border-radius:50%;background:var(--accent);opacity:.3;margin:20px auto;display:flex;align-items:center;justify-content:center;font-size:2em;color:white;transition:transform 1.5s ease-in-out">🪷</div><p id="breathText" class="sub">들이쉬세요…</p><button class="btn ghost" data-act="close" style="margin-top:12px">닫기</button></div>`);
      let phase = 0; const c = document.getElementById('breathCircle'), t = document.getElementById('breathText');
      if (c && t) { const iv = setInterval(() => { phase++; if (!c.parentElement) { clearInterval(iv); return; } if (phase % 2 === 0) { c.style.transform = 'scale(1.3)'; t.textContent = '들이쉬세요…'; } else { c.style.transform = 'scale(0.8)'; t.textContent = '내쉬세요…'; } }, 3000); }
    }
    else if (act === 'start-onboarding') {
      onboardingStep = 0; onboardingChoices = {};
      openModal(`<div class="sheet onboard-sheet">${viewOnboarding()}</div>`);
    }
    else if (act === 'onboard-pick') {
      const step = +el.dataset.step; const key = el.dataset.key;
      onboardingChoices[step] = key;
      document.querySelectorAll('.onboard-opt').forEach(o => o.classList.toggle('on', o.dataset.key === key && +o.dataset.step === step));
      const nextBtn = document.querySelector('[data-act="onboard-next"],[data-act="onboard-done"]');
      if (nextBtn) nextBtn.disabled = false;
    }
    else if (act === 'onboard-back') {
      onboardingStep = Math.max(0, onboardingStep - 1);
      const sheet = document.querySelector('.onboard-sheet');
      if (sheet) sheet.innerHTML = viewOnboarding();
    }
    else if (act === 'onboard-next') {
      if (onboardingChoices[onboardingStep] == null) { toast('항목을 골라 주세요.'); return; }
      onboardingStep++;
      const sheet = document.querySelector('.onboard-sheet');
      if (sheet) sheet.innerHTML = viewOnboarding();
    }
    else if (act === 'onboard-done') {
      if (onboardingChoices[onboardingStep] == null) { toast('항목을 골라 주세요.'); return; }
      const sheet = document.querySelector('.onboard-sheet');
      if (sheet) sheet.innerHTML = viewOnboardingResult();
    }
    else if (act === 'onboard-enter') {
      S.onboarded = true; S.onboardPrefs = { interest: onboardingChoices[0], region: onboardingChoices[1], companion: onboardingChoices[2] }; save();
      closeModal(); render(); toast('절로가에 오신 것을 환영해요 🪷');
    }
    else if (act === 'paywall') openPaywall(el.dataset.feat);
    else if (act === 'gift-open') {
      openModal(`<div class="sheet"><h2>🎁 선물하기</h2><p>절로가 플러스를 소중한 분에게 선물해 보세요.</p>
        <div class="grid2" style="margin:12px 0">
          <button class="plan on" data-act="gift-pick" data-plan="yearly"><div class="sub">연간 구독</div><div class="price">연 39,000원</div><div class="sub" style="font-size:.78em">14일 무료 체험 포함</div></button>
          <button class="plan" data-act="gift-pick" data-plan="lifetime"><div class="sub">평생 이용권</div><div class="price">89,000원</div><div class="sub" style="font-size:.78em">한 번만 · 영구</div></button>
        </div>
        <label>받는 분 연락처 (카카오톡·문자 전송)</label><input placeholder="010-XXXX-XXXX 또는 카카오톡 ID" />
        <label>선물 메시지</label><textarea placeholder="부모님의 마음을 담은 사찰 순례를 선물해요 🪷" maxlength="200"></textarea>
        <div class="grid2" style="margin-top:10px"><button class="btn ghost" data-act="close">닫기</button><button class="btn" data-act="gift-send">선물 보내기 (데모)</button></div>
        <p class="notice" style="margin-top:8px">🧪 데모 화면이에요. 출시 후 카카오톡 선물하기·직접 전송으로 실제 선물을 보낼 수 있어요.</p></div>`);
    }
    else if (act === 'gift-send') { closeModal(); toast('🧪 데모: 선물을 보냈어요 (실제 전송 아님)'); }
    else if (act === 'plan') { S.plan = el.dataset.plan; save(); document.querySelectorAll('.plan').forEach(x => x.classList.toggle('on', x.dataset.plan === S.plan)); }
    else if (act === 'trial-start') {
      const ex = plusState().expired;
      S.plus = ex ? { status: 'plus', start: new Date().toISOString(), plan: S.plan } : { status: 'trial', start: new Date().toISOString(), plan: S.plan };
      save();
      if (DEMO_OK()) api('/api/dev/entitlement', { method: 'POST', body: { action: ex ? 'plus' : 'trial', plan: S.plan } }).then(() => { Object.keys(STORY_CACHE).forEach(k => delete STORY_CACHE[k]); syncMe(); });
      closeModal(); render();
      toast(ex ? '🧪 데모: 플러스를 시작했어요 (실제 결제 없음)' : '🧪 데모: 14일 무료 체험을 시작했어요. 자동 결제되지 않아요.');
    }
    else if (act === 'plus-on') {
      S.plus = { status: 'plus', start: new Date().toISOString(), plan: S.plan }; save();
      if (DEMO_OK()) api('/api/dev/entitlement', { method: 'POST', body: { action: 'plus', plan: S.plan } }).then(() => { Object.keys(STORY_CACHE).forEach(k => delete STORY_CACHE[k]); syncMe(); });
      render(); toast('🧪 데모: 플러스를 켰어요 (실제 결제 없음)');
    }
    else if (act === 'plus-off') {
      if (confirm('구독을 해지할까요? (데모 — 무료 기능과 기록은 그대로 남아요)')) {
        S.plus = null; save();
        if (DEMO_OK()) api('/api/dev/entitlement', { method: 'POST', body: { action: 'off' } }).then(() => { Object.keys(STORY_CACHE).forEach(k => delete STORY_CACHE[k]); syncMe(); });
        render(); toast('해지했어요. 순례 기록은 그대로예요.');
      }
    }
    else if (act === 'buy') { const it = storeById[el.dataset.id]; if (!it) return; openModal(`<div class="sheet"><div class="row between"><h2 style="margin:0">${it.icon} ${esc(it.name)}</h2><span class="demo-ribbon">데모</span></div><p>${esc(it.desc)}</p><p><b>${it.price}</b> · 1회 결제 · 자동 갱신 없음${it.plus ? ' · 플러스 이용 중이면 포함돼 있어요' : ''}</p><p class="sub" style="font-size:.85em">디지털 콘텐츠는 열람을 시작하면 청약철회가 제한될 수 있어요. 데모에서는 실제 결제가 일어나지 않아요.</p><div class="grid2"><button class="btn ghost" data-act="close">취소</button><button class="btn" data-act="buy-ok" data-id="${it.id}">구매 (데모)</button></div></div>`); }
    else if (act === 'buy-ok') {
      const pid = el.dataset.id;
      if (!S.packs.includes(pid)) S.packs.push(pid);
      if (!ME.packs.includes(pid)) ME.packs.push(pid);
      save();
      if (DEMO_OK()) api('/api/dev/entitlement', { method: 'POST', body: { action: 'pack', packId: pid } }).then(() => syncMe());
      closeModal(); render();
      toast('🧪 데모: 보유 목록에 넣었어요 (실제 결제 없음)');
    }
    else if (act === 'ad') openAd(el.dataset.id);
    else if (act === 'ad-reward') {
      const sid = el.dataset.id;
      S.adLog = S.adLog || {}; S.adLog[today()] = (S.adLog[today()] || 0) + 1;
      S.adUnlocks = S.adUnlocks || {}; S.adUnlocks[sid] = Date.now() + DAY;
      save();
      api('/api/ads/' + encodeURIComponent(sid) + '/reward', { method: 'POST' }).then(r => {
        if (r.ok && r.body && r.body.unlockedUntil) ME.adUnlocks[sid] = r.body.unlockedUntil;
        delete STORY_CACHE[sid];
        ensureStory(sid);
      });
      closeModal(); render();
      toast('📺 데모: 24시간 동안 이 이야기를 끝까지 읽을 수 있어요');
    }
    else if (act === 'skin') { S.skin = S.skin === 'maple' ? null : 'maple'; save(); render(); toast(S.skin ? '단풍 염주를 적용했어요' : '기본 염주로 돌아왔어요'); }
    else if (act === 'print') window.print();
    else if (act === 'offline') { if (!isPlus()) openPaywall('offline'); else { if (!S.offline.includes(el.dataset.id)) S.offline.push(el.dataset.id); save(); render(); toast('이 기기에 저장해 두었어요 (데모: 앱 출시 때 실제 오프라인 캐시로 구현)'); } }
    else if (act === 'reset') { if (confirm('방문·수첩 기록을 모두 지울까요? (이 기기에서만)')) { S.visits = []; S.journal = []; S.trips = []; S.tripChecks = {}; S.moodLog = []; save(); render(); } }
    else if (act === 'sample-populate') {
      populateSampleValues();
      toast('✨ 실감나는 순례·수첩·플래너 샘플 데이터를 채웠어요');
      render();
    }
    else if (act === 'trip-chk') {
      withPlanner(m => m.ensureDefaultTrips());
      const cid = el.dataset.id;
      S.tripChecks[cid] = !S.tripChecks[cid];
      save(); render();
    }
    else if (act === 'tpl-adopt') {
      const tpl = plannerMod() && plannerMod().TRIP_TEMPLATES.find(x => x.id === el.dataset.id);
      if (!tpl) return;
      withPlanner(m => m.ensureDefaultTrips());
      const id = 'trip_' + Date.now().toString(36);
      S.trips.push({
        id,
        title: tpl.title,
        date: today(),
        days: tpl.days,
        transport: tpl.transport,
        companion: tpl.companion,
        stops: tpl.stops.slice(),
        memo: tpl.schedule.map((s, i) => `${i + 1}. ${s}`).join('\n') + `\n\n💡 팁: ${tpl.tip}`,
        createdAt: new Date().toISOString()
      });
      save();
      toast('추천 코스를 내 여행 계획에 담았어요 🗓️');
      location.hash = '#/planner/view/' + encodeURIComponent(id);
    }
    else if (act === 'course-to-plan') {
      const c = COURSES.find(x => x.id === el.dataset.course);
      if (!c) return;
      withPlanner(m => {
        m.state.draftStops = c.stops.slice();
        m.state.draftForm = {};
        m.state.draftCleared = false;
      });
      toast(`「${c.name}」 사찰들을 여행 계획에 불러왔어요`);
      location.hash = '#/planner/new';
    }
    else if (act === 'reco-run') withPlanner(m => m.runRecommendation(false));
    else if (act === 'reco-again') withPlanner(m => m.runRecommendation(true));
    else if (act === 'reco-apply') withPlanner(m => m.applyRecommendation());
    else if (act === 'reco-dismiss') withPlanner(m => m.dismissRecommendation());
    else if (act === 'draft-search') {
      const search = plannerS() && plannerS().refreshTempleOptions;
      if (!search) { toast('검색 상자를 찾지 못했어요. 화면을 새로고침해 주세요.'); return; }
      const found = search();
      const sel = document.getElementById('addTempleSelect');
      if (found && sel && sel.options.length) { sel.focus(); toast(`${found}곳을 찾았어요. 목록에서 고르고 '+ 추가'를 누르세요.`); }
      else toast('조건에 맞는 사찰이 없어요. 지역이나 검색어를 바꿔 보세요.');
    }
    else if (act === 'draft-add') {
      const PS = plannerS(); if (!PS) return;
      const sel = document.getElementById('addTempleSelect');
      if (!sel || !sel.value) return;
      if (PS.draftStops.includes(sel.value)) { toast('이미 코스에 포함된 사찰이에요.'); return; }
      PS.draftStops.push(sel.value);
      render();
    }
    else if (act === 'draft-rm') {
      const PS = plannerS(); if (!PS) return;
      const idx = +el.dataset.idx;
      PS.draftStops.splice(idx, 1);
      if (!PS.draftStops.length) PS.draftCleared = true; // 직접 모두 비운 경우 예시 사찰을 다시 채우지 않음
      render();
    }
    else if (act === 'draft-up') {
      const PS = plannerS(); if (!PS) return;
      const idx = +el.dataset.idx;
      if (idx > 0) { const tmp = PS.draftStops[idx - 1]; PS.draftStops[idx - 1] = PS.draftStops[idx]; PS.draftStops[idx] = tmp; render(); }
    }
    else if (act === 'draft-down') {
      const PS = plannerS(); if (!PS) return;
      const idx = +el.dataset.idx;
      if (idx < PS.draftStops.length - 1) { const tmp = PS.draftStops[idx + 1]; PS.draftStops[idx + 1] = PS.draftStops[idx]; PS.draftStops[idx] = tmp; render(); }
    }
    else if (act === 'draft-optimize') {
      withPlanner(m => m.optimizeDraftOrder());
    }
    else if (act === 'tpl-theme') {
      const theme = el.dataset.theme || 'all';
      location.hash = '#/planner/theme/' + encodeURIComponent(theme);
    }
    else if (act === 'draft-reset') {
      withPlanner(m => m.resetPlannerDraft());
    }
    else if (act === 'trip-del') {
      withPlanner(m => m.ensureDefaultTrips());
      S.trips = S.trips.filter(x => x.id !== el.dataset.id);
      save();
      toast('여행 계획을 삭제했어요.');
      location.hash = '#/planner';
    }
    else if (act === 'plan-pick') {
      withPlanner(m => m.openPlanPickModal(el.dataset.id));
    }
    else if (act === 'plan-new-with') {
      const tid = el.dataset.tid;
      withPlanner(m => {
        m.state.draftStops = [tid];
        m.state.draftForm = {};
        m.state.draftCleared = false;
      });
      closeModal();
      location.hash = '#/planner/new/' + encodeURIComponent(tid);
    }
    else if (act === 'plan-append') {
      withPlanner(m => m.ensureDefaultTrips());
      const tr = S.trips.find(x => x.id === el.dataset.trip);
      const tid = el.dataset.tid;
      const rt = resolveTemple(tid);
      if (tr && tid && rt) {
        if (!tr.stops.includes(tid)) tr.stops.push(tid);
        save();
        closeModal();
        toast(`「${rt.name}」을(를) 여행 계획에 추가했어요 🗓️`);
        location.hash = '#/planner/view/' + encodeURIComponent(tr.id);
      }
    }
    else if (act === 'nav-hub') {
      const t = resolveTemple(el.dataset.id);
      if (t) withFeatures(features => features.Nav.openModal(t));
    }
    else if (act === 'copy-addr') {
      const addr = el.dataset.addr;
      if (addr && navigator.clipboard) {
        navigator.clipboard.writeText(addr).then(() => toast('소재지 주소를 복사했어요 📋'));
      }
    }
    else if (act === 'templestay-hub') {
      const t = resolveTemple(el.dataset.id);
      if (t) withFeatures(features => features.Templestay.openModal(t));
    }
    else if (act === 'meditation-open') {
      withFeatures(features => features.Meditation.openModal());
    }
    else if (act === 'cert-open') {
      const v = visited();
      const mTitles = MISSIONS.filter(m => m.ids && missionProgress(m).done >= missionProgress(m).total).map(m => m.name);
      withFeatures(features => features.Certificate.openModal('마음여행자', v.size, beads(), mTitles));
    }
    else if (act === 'docent-temple') {
      const t = resolveTemple(el.dataset.id);
      if (t) {
        const text = [
          `안녕하세요. 절로가 오디오 도슨트입니다. 지금부터 ${t.name}을 안내해 드리겠습니다.`,
          `${t.name}은 ${t.sido} ${t.sgg} ${t.mountain}에 자리 잡고 있으며, ${t.founded}로 전해집니다.`,
          t.treasures && t.treasures.length ? `대표적인 문화재로는 ${t.treasures.join(', ')} 등이 있습니다.` : '',
          t.legend ? `이곳에 전해지는 옛 이야기로는 '${t.legend.title}'이 있습니다. ${t.legend.text}` : '',
          t.tip ? `관람 시 참고하실 점입니다. ${t.tip}` : '',
          '사찰 경내에서는 합장으로 인사하며 고요히 마음을 맑혀보세요.'
        ].filter(Boolean).join(' ');
        withFeatures(features => features.Docent.play(t.name, text));
      }
    }
    else if (act === 'docent-story') {
      const st = RAW_STORIES.find(x => x.id === el.dataset.id);
      if (st) {
        const text = [
          `${st.series} ${st.ep}편, ${st.title}.`,
          st.hook,
          ...(st.chapters || []).map(c => `${c.h}. ${(c.body || []).join(' ')}`)
        ].join(' ');
        withFeatures(features => features.Docent.play(st.title, text));
      }
    }
    else if (act === 'ai-counsel') {
      const t = el.dataset.id ? resolveTemple(el.dataset.id) : null;
      const m = MOODS[S.moodIdx || 0];
      withFeatures(features => features.AICounsel.openModal({ temple: t, mood: m ? m.label : '' }));
    }
  });
  document.getElementById('modal').addEventListener('click', e => { if (e.target.id === 'modal') closeModal(); });
  // 웹(키보드)에서는 Esc로도 닫는다 — 하단 시트를 쓰는 모바일과 동일하게 종료 경로 보장
  document.addEventListener('keydown', e => {
    if (e.key !== 'Escape') return;
    const m = document.getElementById('modal');
    if (m.classList.contains('hidden')) return;
    clearInterval(openAd._t); closeModal();
  });

  function updatePlusChip() {
    const c = document.getElementById('plusChip'); if (!c) return;
    const ps = plusState();
    c.innerHTML = ic('sparkle') + `<span>${ps.on ? (ps.trial ? `체험 ${ps.left}일` : '플러스 이용 중') : '플러스'}</span>`;
    c.classList.toggle('on', !!ps.on);
    c.setAttribute('aria-label', ps.on ? (ps.trial ? `플러스 체험 ${ps.left}일 남음` : '플러스 이용 중') : '플러스 알아보기');
  }
  const bt = document.getElementById('bigToggle');
  function applyBig() {
    document.body.classList.toggle('big', !!S.big);
    bt.setAttribute('aria-pressed', !!S.big ? 'true' : 'false');
    bt.setAttribute('aria-label', '큰 글씨·간편 모드');
    bt.innerHTML = ic('textsize') + `<span>큰 글씨</span>`;   // 상태는 aria-pressed 로만 알린다 (문구가 길면 상단이 흔들린다)
  }
  bt.addEventListener('click', () => { S.big = !S.big; save(); applyBig(); render(); toast(S.big ? '큰 글씨·간편 모드를 켰어요' : '기본 모드로 돌아왔어요'); });
  applyBig();

  /* ---------- 테마: 낮 / 저조도 ----------
   * CSS 는 <html data-theme> 하나만 본다. 정하는 순서는 '사용자가 고른 것 > 시스템 설정'이고,
   * 고른 적이 없으면 OS 의 low-light 설정이 바뀔 때 따라간다.
   * 값은 앱 상태(S)와 섞지 않고 별도 키에 둔다 — 첫 페인트 전(<head> 의 인라인 스크립트)에도
   * 읽어야 하므로, 앱 상태 JSON 전체를 기다릴 수 없다. */
  const THEME_KEY = 'maeumjeongwon.theme.v1';
  const THEME_BAR = { light: '#f3f1ea', dark: '#161310' };
  let themePref = '';
  try { themePref = localStorage.getItem(THEME_KEY) || ''; } catch (e) { themePref = ''; }
  const systemDark = () => !!(window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches);
  const isDark = () => themePref ? themePref === 'dark' : systemDark();
  function applyTheme() {
    const dark = isDark();
    const root = document.documentElement;
    root.setAttribute('data-theme', dark ? 'dark' : 'light');
    const btn = document.getElementById('themeToggle');
    if (btn) {
      btn.setAttribute('aria-pressed', dark ? 'true' : 'false');
      btn.setAttribute('title', dark ? '낮 모드로 보기' : '저조도(어두운 화면)로 보기');
      btn.innerHTML = ic(dark ? 'sun' : 'moon') + `<span class="sr">${dark ? '낮 모드로 보기' : '저조도 모드로 보기'}</span>`;
    }
    // 상태바 색도 같이 갈아준다 — OS 테마와 어긋나면 앱이 열리는 순간 색이 한 번 튄다
    document.querySelectorAll('meta[name="theme-color"]').forEach(m => {
      if (!m.hasAttribute('media')) m.setAttribute('content', dark ? THEME_BAR.dark : THEME_BAR.light);
    });
  }
  document.getElementById('themeToggle').addEventListener('click', () => {
    themePref = isDark() ? 'light' : 'dark';
    try { localStorage.setItem(THEME_KEY, themePref); } catch (e) {}
    applyTheme();
    toast(isDark() ? '저조도 모드 — 새벽예불·야간 산행에서 눈이 편해요' : '낮 모드로 돌아왔어요');
  });
  applyTheme();
  if (window.matchMedia) {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const onSysTheme = () => { if (!themePref) applyTheme(); };   // 직접 고른 적이 없을 때만 따라간다
    if (mq.addEventListener) mq.addEventListener('change', onSysTheme);
    else if (mq.addListener) mq.addListener(onSysTheme);
  }
  window.addEventListener('hashchange', () => { clearInterval(openAd._t); closeModal(); navigate(); });
  // 스크롤 위치로만 상단 바의 경계를 그린다 — 늘 그림자를 달면 화면이 '무게'를 잃는다
  let scrolledT = null;
  window.addEventListener('scroll', () => {
    if (scrolledT) return;
    scrolledT = setTimeout(() => {
      scrolledT = null;
      const on = (window.scrollY || 0) > 6;
      if (on !== (document.body._scrolled || false)) { document.body._scrolled = on; document.body.classList.toggle('scrolled', on); }
    }, 80);
  }, { passive: true });
  navigate();
  // 테스트·부트스트랩이 "화면 준비 완료"를 기다릴 수 있게 노출 (지연 로딩이 없으면 즉시 이행)
  window.MJ_NAV_READY = () => pendingNav || Promise.resolve();
  window.MJ_NAVIGATE = navigate;
})();

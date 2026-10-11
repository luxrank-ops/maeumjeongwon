/* 마음정원 MVP — vanilla JS SPA (hash router + localStorage) */
(function () {
  'use strict';
  const TEMPLES = window.TEMPLES, THEMES = window.THEMES, LL = window.LIST_LABELS;
  const PRAYER_CRITERIA = window.PRAYER_CRITERIA || [];
  const PRAYER_LIMITATIONS = window.PRAYER_LIMITATIONS || [];
  const FENGSHUI_ATLAS = window.FENGSHUI_ATLAS || { regions: [], entries: [] };
  const FENGSHUI_MATRIX = window.FENGSHUI_MATRIX || [];
  const FENGSHUI_VISIT_TIPS = window.FENGSHUI_VISIT_TIPS || [];
  const TRAD = (window.TRADITIONAL_TEMPLES || []).map(r => ({
    no: r[0], sido: r[1], sgg: r[2], addr: r[3], name: r[4], order: r[5], id: 'trad-' + r[0]
  }));
  const tradByNo = Object.fromEntries(TRAD.map(x => [x.no, x]));
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

  // ---------- 상태 ----------
  const SESS_KEY = 'maeumjeongwon.sess.v1';
  const ENT_KEY = 'maeumjeongwon.ent.v1';
  const defaults = { visits: [], journal: [], big: false, moodIdx: 0, plus: null, plan: 'yearly', packs: [], offline: [], adLog: {}, adUnlocks: {}, skin: null, moodLog: [], trips: [], tripChecks: {}, streak: 0, streakDate: null, streakFreezes: 1, onboarded: false, onboardPrefs: {} };
  const RAW_STORIES = window.STORIES || [], STORY_SOON = window.STORY_SOON || [];
  const STORIES = RAW_STORIES.map(st => {
    if (st.preview !== undefined) return st;
    const free = (st.chapters || []).slice(0, 1);
    const next = (st.chapters || [])[1];
    return Object.assign({}, st, {
      totalChapters: (st.chapters || []).length,
      chapters: free,
      preview: next ? { h: next.h, legend: !!next.legend, body: (next.body || []).slice(0, 1) } : null
    });
  });
  let S;
  try { S = Object.assign({}, defaults, JSON.parse(localStorage.getItem(KEY) || '{}')); } catch (e) { S = Object.assign({}, defaults); }
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
        ${isLast ? '<button class="btn" data-act="onboard-done" disabled>마음정원 시작 🪷</button>' : '<button class="btn" data-act="onboard-next" disabled>다음</button>'}
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
      <button class="btn block" data-act="onboard-enter" style="margin-top:12px">마음정원 시작 🪷</button>
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
      SESS = null;
      localStorage.removeItem(SESS_KEY); localStorage.removeItem(ENT_KEY);
      await ensureSession();
      res = await send();
    }
    let body = {}; try { body = await res.json(); } catch (e) {}
    return { ok: res.ok, status: res.status, body };
  }

  function syncMe() {
    return api('/api/me').then(r => {
      if (!r.ok || !r.body) return;
      if (r.body.mode) Object.assign(MODE, r.body.mode);
      if (r.body.plus) ME.plus = r.body.plus;
      if (Array.isArray(r.body.packs)) {
        ME.packs = r.body.packs.slice();
        (S.packs || []).forEach(p => { if (!ME.packs.includes(p)) ME.packs.push(p); });
      }
      if (r.body.adUnlocks) ME.adUnlocks = r.body.adUnlocks;
      if (r.body.adToday) ME.adToday = r.body.adToday;
      try { localStorage.setItem(ENT_KEY, JSON.stringify({ plus: ME.plus, packs: ME.packs, adUnlocks: ME.adUnlocks, adToday: ME.adToday })); } catch (e) {}
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
  function haversine(a, b, c, d) { const R = 6371000, r = x => x * Math.PI / 180; const dLat = r(c - a), dLng = r(d - b); const h = Math.sin(dLat / 2) ** 2 + Math.cos(r(a)) * Math.cos(r(c)) * Math.sin(dLng / 2) ** 2; return 2 * R * Math.asin(Math.sqrt(h)); }
  function toast(msg) { const el = document.getElementById('toast'); el.textContent = msg; el.classList.add('show'); clearTimeout(toast._t); toast._t = setTimeout(() => el.classList.remove('show'), 2600); }
  const fmtDist = m => m >= 1000 ? (m / 1000).toFixed(1) + 'km' : Math.round(m) + 'm';
  const val = v => (!v || /확인 필요/.test(v)) ? `<span class="needs">${esc(v || '확인 필요')}</span>` : esc(v);

  // ---------- 진행도 ----------
  const GRADES = [{ n: 1, name: '입문' }, { n: 10, name: '발심' }, { n: 30, name: '정진' }, { n: 60, name: '원만' }, { n: 100, name: '회향' }];
  const visited = () => new Set(S.visits.map(v => v.tid));
  function gradeInfo(cnt) {
    let cur = null, next = GRADES[0];
    for (const g of GRADES) { if (cnt >= g.n) { cur = g; next = null; } else { next = g; break; } }
    return { cur, next, left: next ? next.n - cnt : 0 };
  }
  const beads = () => Math.min(108, S.visits.length);
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
    if (m.monthly) { const ym = today().slice(0, 7); const set = new Set(S.visits.filter(x => x.date.slice(0, 7) === ym).map(x => x.tid)); return { done: Math.min(set.size, m.monthly), total: m.monthly, left: [] }; }
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


  // ---------- 마음정원 플러스 (유료화 프런트엔드 데모 · 실제 결제 없음) ----------
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
    general: { t: '마음정원사 : 절로가 플러스', d: '심화 스토리·오디오·코스 플래너·오프라인·순례 리포트를 모두 이용해요.' }
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
      <div class="lockbar"><span>🔒 <b>${f.t}</b>는 플러스에서 이어서 볼 수 있어요</span><button class="btn small" data-act="paywall" data-feat="${feat}">자세히 보기</button></div></div>`;
  }
  const LEGAL = `<ul class="legal" style="padding-left:22px">
      <li>🧪 <b>데모 화면</b>이에요. 지금은 실제 결제가 일어나지 않아요.</li>
      <li>출시 후 구독은 해지하기 전까지 선택한 주기(월/연)마다 <b>자동 갱신</b>되며, 갱신일 24시간 전까지 앱 마켓 구독 관리에서 해지할 수 있어요.</li>
      <li>7일 무료 체험이 끝나도 <b>별도 동의 없이 유료로 넘어가지 않아요.</b> 체험→유료 전환이나 가격 인상 때는 전환 30일 이내에 일시·변동 전후 가격·결제 방법을 알리고 다시 동의를 받아요.</li>
      <li>해지는 가입만큼 쉽게 — 설정 &gt; 구독 관리에서 한 번에 할 수 있게 만들 예정이에요.</li>
      <li>청약철회·환불은 전자상거래법과 앱 마켓 정책을 따르며, 출시 전 법률 검토를 거쳐 확정해요.</li>
    </ul>`;
  function planCards() {
    const main = ['monthly', 'yearly'].map(([k]) => [k, PLANS[k]]);
    const extra = ['webYearly', 'lifetime'].map(k => [k, PLANS[k]]);
    return `<div class="plans">${main.map(([k, p]) => `<button class="plan ${S.plan === k ? 'on' : ''}" data-act="plan" data-plan="${k}">${p.best ? `<span class="best">${p.best}</span>` : ''}<div class="sub">${p.name}</div><div class="price">${p.price}</div><div class="sub" style="font-size:.78em">${p.sub}</div></button>`).join('')}</div>
      <div class="plans" style="margin-top:8px">${extra.map(([k, p]) => `<button class="plan ${S.plan === k ? 'on' : ''}" data-act="plan" data-plan="${k}">${p.best ? `<span class="best">${p.best}</span>` : ''}${p.badge === 'web' ? '<span class="tag">💳 웹 결제</span> ' : p.badge === 'lifetime' ? '<span class="tag">🎁 영구</span> ' : ''}<div class="sub">${p.name}</div><div class="price">${p.price}</div><div class="sub" style="font-size:.78em">${p.sub}</div></button>`).join('')}</div>`;
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
    const cell = v => v === true ? '✅' : v === false ? '—' : `<span class="sub">${esc(v)}</span>`;
    return `<h1>마음정원사 : 절로가 플러스 <span class="demo-ribbon">데모 · 실제 결제 없음</span></h1>
    ${status}
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
    <p class="notice">🙏 마음정원사 : 절로가는 신앙을 판매하지 않아요. 기도 안내·예절·출처는 언제나 무료이고, 소원 성취나 효험을 약속하는 상품(부적·기도 대행·소원권 등)은 만들지 않아요. 판매하는 것은 이 앱이 직접 만든 정보·이야기·도구뿐이에요.</p>`;
  }

  // ---------- 콘텐츠 상점 (데모 · 실제 결제 없음) ----------
  function viewStore() {
    const kinds = [...new Set(STORE.map(x => x.kind))];
    return `<h1>콘텐츠 상점 <span class="demo-ribbon">데모 · 실제 결제 없음</span></h1>
      <p class="sub">이 앱이 직접 만든 디지털 콘텐츠만 팔아요. 1회 결제이고 자동 갱신이 없어요.</p>
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
    return `<section class="card ${c.legend ? 'legend' : ''}">${c.legend ? '<span class="lbl">전해지는 이야기</span>' : ''}<h2 style="margin-top:${c.legend ? '8px' : '0'}">${esc(c.h)}</h2>${c.body.map(x => `<p>${esc(x)}</p>`).join('')}</section>`;
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
    return `<a href="javascript:history.back()" class="sub" style="text-decoration:none">← 뒤로</a>
      <section class="card hero" style="margin-top:8px"><div class="sub">📖 마음정원사 : 절로가 심화 스토리 · ${esc(st.series)} ${st.ep}편 · 약 ${st.minutes}분</div>
        <h1 style="margin:6px 0">${esc(st.title)}</h1><p style="margin:0">${esc(st.hook)}</p>
        ${t ? `<p class="sub" style="margin:8px 0 0"><a href="#/temple/${t.id}">${esc(t.name)} 상세 보기 →</a></p>` : ''}
        ${adOn ? `<p class="statusbar trial" style="margin:8px 0 0">📺 광고 보상으로 열림 · 약 ${left}시간 남음</p>` : ''}</section>
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
      <div style="margin-top:8px"><p style="margin:0 0 8px">🔒 나머지 <b>${rest}개 장</b>은 플러스에서 이어서 읽을 수 있어요.</p>
      <div class="grid2"><button class="btn ghost" data-act="ad" data-id="${st.id}" ${n > 0 ? '' : 'disabled'}>📺 광고 보고 24시간 열기<br><span class="sub" style="font-size:.8em">${n > 0 ? `오늘 ${n}회 남음 · 데모` : '오늘은 모두 사용했어요'}</span></button>
      <button class="btn" data-act="paywall" data-feat="story">플러스 알아보기<br><span style="font-size:.8em;opacity:.85">7일 무료 체험</span></button></div></div></div>`;
  }
  function openAd(id) {
    if (adLeft() <= 0) { toast('오늘 볼 수 있는 보상 광고를 모두 봤어요. 내일 다시 열려요.'); return; }
    openModal(`<div class="sheet" style="text-align:center"><div class="row between"><b>보상형 광고</b><span class="demo-ribbon">데모 · 실제 광고 없음</span></div>
      <div class="adbox" id="adbox">광고 자리<br><span class="sub">출시 때 이 자리에 짧은 영상 광고(약 15~30초)가 나와요.<br>사찰·기도 화면 안에는 광고를 넣지 않아요.</span><div class="adcount" id="adcount">5</div></div>
      <div class="grid2" style="margin-top:10px"><button class="btn ghost" data-act="close">닫기 (보상 없음)</button><button class="btn" id="adreward" data-act="ad-reward" data-id="${esc(id)}" disabled>보상 받기</button></div>
      <p class="sub" style="font-size:.8em;margin:8px 0 0">하루 최대 ${AD_DAILY}회 · 광고는 원할 때만 봐요 · 자동 재생·전면 광고 없음</p></div>`);
    let n = 5; clearInterval(openAd._t);
    openAd._t = setInterval(() => { n--; const c = document.getElementById('adcount'), b = document.getElementById('adreward'); if (!c || !b) { clearInterval(openAd._t); return; } c.textContent = n > 0 ? n : '✓'; if (n <= 0) { b.disabled = false; clearInterval(openAd._t); } }, 1000);
  }

  // ---------- 나의 순례 리포트 (이 기기 데이터로 생성) ----------
  const SEASONS = m => m >= 3 && m <= 5 ? '봄' : m >= 6 && m <= 8 ? '여름' : m >= 9 && m <= 11 ? '가을' : '겨울';
  function reportData() {
    const vs = S.visits.slice().sort((a, b) => a.date.localeCompare(b.date)).filter(v => byId[v.tid]);
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
      journal: S.journal.length, weather: cnt(S.journal, j => j.weather), yr, yv, yuniq: new Set(yv.map(v => v.tid)).size,
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
      <h1>전국 기도처 가이드북 <span class="demo-ribbon">데모</span></h1><p class="sub">마음정원사 : 절로가 편집 · ${list.length}곳 · ${today().replace(/-/g, '.')} 판</p>
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
      <section class="card legend"><span class="lbl">오늘의 한 문장</span><p style="margin:8px 0 0">${esc(MIND_LINES[(seed + 4) % MIND_LINES.length])}</p></section>`;
    return `<a href="#/home" class="sub" style="text-decoration:none">← 홈</a><h1>🔮 마음 처방전 심화 리포트</h1>
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
    const got = new Set(S.visits.filter(v => v.date.slice(0, 10) >= SEASON.from && v.date.slice(0, 10) <= SEASON.to && pool.some(t => t.id === v.tid)).map(v => v.tid));
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
    return `<a class="titem" href="#/temple/${t.id}"><div class="seal ${v ? '' : 'off'}">${sealChar(t)}</div>
      <div class="meta"><b>${esc(t.name)} ${v ? '<span class="tag ok">방문</span>' : ''}</b>
      <div class="sub">${esc(t.sido)} ${esc(t.sgg)} · ${esc(t.order)}${extra ? ' · ' + extra : ''}</div>
      <div class="simple-hide">${t.lists.map(l => `<span class="tag">${LL[l]}</span>`).join('')}${t.themes.slice(0, 2).map(th => `<span class="tag">${THEMES[th].icon} ${THEMES[th].name}</span>`).join('')}</div></div></a>`;
  }
  function beadSVG(n, size) {
    size = size || 220; const c = size / 2, R = size / 2 - 10, out = [];
    for (let i = 0; i < 108; i++) { const a = (i / 108) * Math.PI * 2 - Math.PI / 2; const x = c + R * Math.cos(a), y = c + R * Math.sin(a); out.push(`<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${(size / 70).toFixed(1)}" fill="${i < n ? (S.skin === 'maple' ? ['#c2410c', '#d97706', '#b91c1c'][i % 3] : '#8a5a2b') : '#e3d8c4'}" stroke="${i < n ? (S.skin === 'maple' ? '#7c2d12' : '#5e3b19') : '#d4c7ae'}" stroke-width="0.8"/>`); }
    return `<svg class="beads" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" role="img" aria-label="디지털 염주 ${n}/108">${out.join('')}
      <text x="${c}" y="${c - 4}" text-anchor="middle" font-size="${size / 7}" font-family="Noto Serif CJK KR,serif" fill="#2f2a24">${n}</text>
      <text x="${c}" y="${c + size / 9}" text-anchor="middle" font-size="${size / 16}" fill="#7a6f62">/ 108 알</text></svg>`;
  }

  // ---------- 화면: 홈 ----------
  function consentCard() {
    if (!MJAnalytics.shouldPrompt()) return '';
    return `<section class="card simple-hide" id="consentCard">
      <div class="row between"><b>📊 서비스 개선을 위한 익명 통계</b><span class="tag">선택</span></div>
      <p class="sub" style="margin:6px 0">어떤 사찰과 이야기를 많이 보는지 익명으로 집계해요. 기도 내용·수첩 글·정밀 위치 좌표는 절대 수집하지 않아요.</p>
      <div class="grid2"><button class="btn ghost small" data-act="consent-deny">거부</button><button class="btn small" data-act="consent-allow">허용</button></div>
    </section>`;
  }
  function viewHome() {
    const v = visited(), g = gradeInfo(v.size);
    const mi = S.moodIdx || 0; const t = prescribe(mi, S.shift || 0);
    const near = MISSIONS.filter(m => m.ids).map(m => ({ m, p: missionProgress(m) })).filter(x => x.p.done < x.p.total).sort((a, b) => (a.p.total - a.p.done) - (b.p.total - b.p.done))[0];
    const top = ['bulguksa', 'naksansa', 'tongdosa'].map(id => byId[id]);
    return `
    ${consentCard()}
    <section class="card hero">
      <div class="sub">${g.cur ? `현재 등급` : '순례를 시작해 보세요'}</div>
      <div class="row between"><div class="grade">${g.cur ? g.cur.name : '첫걸음 전'}</div><div class="sub">염주 ${beads()}/108</div></div>
      <div class="row between" style="margin-top:8px"><b>도감 ${v.size}/100</b><span class="sub">${g.next ? `다음 ${g.left}곳이면 '${g.next.name}' 등급!` : '회향 완성 🙏'}</span></div>
      <div class="progress" style="margin-top:6px"><i style="width:${Math.min(100, v.size)}%"></i></div>
      ${near ? `<p class="sub" style="margin:10px 0 0">${near.m.icon} ${near.m.name.replace(/ 완주| 순례/, '')} 완주까지 <b>${near.p.total - near.p.done}곳</b> 남았어요</p>` : ''}
    </section>
    ${!S.onboarded ? `<section class="card onboard-hint"><div class="row between"><h2 style="margin:0">🪷 마음정원에 오신 것을 환영해요</h2></div><p class="sub" style="margin:6px 0">관심 분야를 알려주시면 오늘 가기 좋은 사찰을 추천해 드려요.</p><button class="btn" data-act="start-onboarding">추천 받기 (3문항)</button></section>` : ''}
    ${(() => { updateStreak(); const done = ritualDoneToday(); const verse = getDailyVerse(); const n = S.streak || 0; return `<section class="card">
      <div class="row between"><h2 style="margin:0">${streakMilestoneHTML(n)} 매일 리추얼</h2>${n > 0 ? `<span class="tag ok">🔥 ${n}일 연속</span>` : '<span class="tag">시작해 보세요</span>'}</div>
      <div class="card legend" style="margin:8px 0;background:var(--bg)">
        <span class="lbl">📖 오늘의 한 구절 · ${esc(verse.src)}</span>
        <p style="margin:8px 0 4px;font-size:1.05em;line-height:1.7">"${esc(verse.text)}"</p>
      </div>
      <div class="grid2" style="margin-top:6px">
        <button class="btn ${done ? 'ghost' : ''}" data-act="daily-ritual" ${done ? 'disabled' : ''}>${done ? '✅ 오늘 완료' : '📿 108 염주·기도'} </button>
        <button class="btn ghost" data-act="daily-breathing">🧘 3분 호흡</button>
      </div>
      ${S.streakFreezes > 0 ? `<p class="sub" style="margin:6px 0 0;font-size:.82em">프리즈 ${S.streakFreezes}개 보유 (하루 안 켜도 스트릭 유지)</p>` : ''}
    </section>`; })()}
    <section class="card">
      <h2>오늘의 마음 처방전</h2>
      <p class="sub">지금 기분을 골라 보세요. 어울리는 사찰과 이야기를 골라 드려요.</p>
      <div class="moods">${MOODS.map((m, i) => `<button class="mood ${i === mi ? 'on' : ''}" data-mood="${i}"><span>${m.icon}</span>${m.label}</button>`).join('')}</div>
      <div class="card legend" style="margin:12px 0 0">
        <div class="row between"><span class="lbl">처방</span><button class="btn ghost small" data-act="reshuffle">다른 곳 추천</button></div>
        <p style="margin:8px 0">${esc(MOODS[mi].line)}</p>
        <h3 style="margin:4px 0">${esc(t.name)} <span class="sub">${esc(t.sido)} ${esc(t.sgg)}</span></h3>
        ${t.legend ? `<p class="sub" style="margin:4px 0">📖 전해지는 이야기 — 「${esc(t.legend.title)}」</p>` : ''}
        <a class="btn small" href="#/temple/${t.id}" style="display:inline-block;text-decoration:none;margin-top:6px">이야기 열기 →</a> <a class="btn ghost small" href="#/mind" style="display:inline-block;text-decoration:none;margin-top:6px">🔮 심화 리포트</a>
      </div>
    </section>
    ${isPlus() ? '' : `<a class="card plusbanner simple-hide" href="#/plus"><span style="font-size:1.6em">✨</span><span><b>마음정원사 : 절로가 플러스</b> <span class="demo-ribbon">데모</span><br><span class="sub">원작 심화 스토리·오디오·코스 플래너·순례 리포트 · 7일 무료 체험</span></span></a>`}
    <section class="card">
      <div class="row between"><h2 style="margin:0">🗓️ 사찰 여행 계획 짜기</h2><a class="sub" href="#/planner">전체 보기 →</a></div>
      <p class="sub" style="margin:4px 0 8px">당일치기부터 2박 3일까지 — 사찰 동선·거리·소요시간·준비물을 한눈에 계획해요.</p>
      <div class="row wrap">
        <a class="btn small" style="text-decoration:none" href="#/planner/new">+ 새 여행 계획 만들기</a>
        <a class="btn ghost small" style="text-decoration:none" href="#/planner">추천 코스·내 일정 (${(S.trips || []).length})</a>
      </div>
    </section>
    ${STORIES[0] ? `<section class="card legend simple-hide"><div class="row between"><span class="lbl">이번 주 심화 스토리</span>${isPlus() ? '' : '<span class="tag">첫 장 무료</span>'}</div><h3 style="margin:8px 0 4px">${esc(STORIES[0].title)}</h3><p class="sub" style="margin:0">${esc(byId[STORIES[0].tid].name)} · ${esc(STORIES[0].series)} ${STORIES[0].ep}편 · 약 ${STORIES[0].minutes}분</p><a class="btn small" href="#/story/${STORIES[0].id}" style="display:inline-block;text-decoration:none;margin-top:8px">읽기 →</a></section>` : ''}
    <section class="card simple-hide"><div class="row between"><h2 style="margin:0">🛍 콘텐츠 상점</h2><a class="sub" href="#/store">전체 보기 →</a></div><p class="sub" style="margin:4px 0 8px">구독 없이 필요한 것만 · 1회 결제 · 데모</p><div class="row wrap">${STORE.slice(0, 4).map(o => `<a class="chip" style="text-decoration:none" href="${owns(o.id) ? o.go : '#/store'}">${o.icon} ${esc(o.name.split(' (')[0])}</a>`).join('')}</div></section>
    <section class="card simple-hide">
      <h2>테마로 떠나기</h2>
      <div class="row wrap">${Object.entries(THEMES).map(([k, th]) => `<a class="chip" style="text-decoration:none" href="#/explore/theme/${k}">${th.icon} ${th.name}</a>`).join('')}</div>
    </section>
    <section class="card simple-hide">
      <h2>많이 찾는 사찰</h2><p class="sub">예시 데이터 (실시간 집계 아님)</p>
      <div class="tlist">${top.map(x => templeItem(x)).join('')}</div>
    </section>
    <p class="notice">🙏 전설·기도 이야기는 \'전해지는 이야기\'로 소개하며, 효험을 보장하지 않습니다. 무리한 산행·야간 방문은 삼가고 사찰 예절을 지켜 주세요.</p>`;
  }

  // ---------- 화면: 탐색 ----------
  const SIDO_ORDER = ['서울', '인천', '경기', '강원', '충북', '충남', '대전', '세종', '전북', '전남', '광주', '경북', '대구', '경남', '울산', '부산', '제주'];
  function viewExplore(tab, arg) {
    tab = tab || 'list';
    const tabs = [['list', '순위별'], ['theme', '테마별'], ['region', '지역별'], ['all', '전통사찰 991']];
    let body = '';
    if (tab === 'list') {
      body = Object.entries(LL).map(([k, name]) => {
        const items = TEMPLES.filter(t => t.lists.includes(k));
        const m = MISSIONS.find(x => x.id === k);
        return `<section class="card"><h2>${name} <span class="sub">${items.length}곳</span></h2>${m && m.note ? `<p class="notice">${m.note}</p>` : ''}<div class="tlist">${items.map(t => templeItem(t)).join('')}</div></section>`;
      }).join('') + `<section class="card"><h2>전체 수록 사찰 <span class="sub">${TEMPLES.length}곳</span></h2><div class="tlist">${TEMPLES.map(t => templeItem(t)).join('')}</div></section>`;
    } else if (tab === 'theme') {
      const cur = arg || 'energy';
      body = `<div class="tabs">${Object.entries(THEMES).map(([k, th]) => `<a class="chip ${k === cur ? 'on' : ''}" style="text-decoration:none" href="#/explore/theme/${k}">${th.icon} ${th.name}</a>`).join('')}</div>
      <p class="sub">${THEMES[cur].desc}</p>${cur === 'wish' || cur === 'energy' || cur === 'fengshui' || cur === 'prayer' ? '<p class="notice">기도·풍수 관련 소개는 종교적 전승이나 전해지는 이야기이며, 효험·기운을 보장하지 않아요.</p>' : ''}
      ${themeBody(cur)}`;
    } else if (tab === 'region') {
      const sidos = SIDO_ORDER.filter(s => TEMPLES.some(t => t.sido === s));
      const cur = arg || sidos[0];
      body = `<div class="tabs">${sidos.map(s => `<a class="chip ${s === cur ? 'on' : ''}" style="text-decoration:none" href="#/explore/region/${encodeURIComponent(s)}">${s} ${TEMPLES.filter(t => t.sido === s).length}</a>`).join('')}</div>
      <div class="tlist">${TEMPLES.filter(t => t.sido === cur).map(t => templeItem(t, esc(t.mountain))).join('')}</div>`;
    } else {
      const orders = [...new Set(TRAD.map(r => r.order))].sort();
      body = `<section class="card hero" style="margin-bottom:10px">
        <div class="row between"><b>📋 전통사찰 현황 공식 데이터</b><span class="tag ok">총 ${TRAD.length}곳</span></div>
        <p class="sub" style="margin:4px 0 0">첨부 파일 「전통사찰 현황」(2026.6.1. 현재) 전체 991곳 데이터예요. 사찰을 눌러 상세 주소·종단을 보거나 <b>여행 계획·수첩·방문 인증</b>에 바로 사용할 수 있어요.</p>
      </section>
      <div class="row wrap" style="margin-bottom:6px">
        <input id="tq" placeholder="사찰명·시군구·주소·종단 검색 (예: 보광사, 강남구, 천태종)" value="${esc(arg || '')}" style="flex:1;min-width:180px" />
      </div>
      <div class="grid2" style="margin-bottom:8px">
        <select id="ts"><option value="">전체 시·도 (${SIDO_ORDER.length})</option>${SIDO_ORDER.map(s => `<option value="${esc(s)}">${esc(s)} (${TRAD.filter(r => r.sido === s).length})</option>`).join('')}</select>
        <select id="to"><option value="">전체 종단 (${orders.length})</option>${orders.map(o => `<option value="${esc(o)}">${esc(o)} (${TRAD.filter(r => r.order === o).length})</option>`).join('')}</select>
      </div>
      <div id="tres" style="margin-top:10px"></div>`;
    }
    return `<h1>사찰 탐색</h1><div class="tabs">${tabs.map(([k, n]) => `<a class="chip ${k === tab ? 'on' : ''}" style="text-decoration:none" href="#/explore/${k}">${n}</a>`).join('')}</div>${body}`;
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
      return `<section class="card"><h2 style="margin-top:0">🧭 추천 기준</h2>
          <p class="sub">'기도 기운 좋은 곳'을 효험 점수로 매기지 않고, 확인 가능한 기도 전통과 여행 안전·실용정보를 나눠서 안내합니다.</p>
          <ol style="padding-left:20px;margin:6px 0">${criteria.map(x => `<li>${esc(x)}</li>`).join('')}</ol>
          <p class="notice" style="margin:6px 0 0">${limitations.map(esc).join('<br>')}</p>
        </section>
        <section class="card prayer"><h2 style="margin-top:0">🙏 사찰 참배 예절</h2>
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
    return `<section class="card prayer"><h2 style="margin-top:0">🙏 기도 안내</h2>
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
  function bindTrad() {
    const q = document.getElementById('tq'); if (!q) return;
    const s = document.getElementById('ts');
    const o = document.getElementById('to');
    const out = document.getElementById('tres');
    let limit = 100;
    function run(resetLimit) {
      if (resetLimit !== false) limit = 100;
      const k = q.value.trim(), sd = s.value, od = o ? o.value : '';
      const rows = TRAD.filter(r => (!sd || r.sido === sd) && (!od || r.order === od) && (!k || r.name.includes(k) || r.addr.includes(k) || r.sgg.includes(k) || r.order.includes(k) || String(r.no) === k));
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
      if (moreBtn) {
        moreBtn.addEventListener('click', () => { limit += 150; run(false); });
      }
    }
    q.addEventListener('input', () => run(true));
    s.addEventListener('change', () => run(true));
    if (o) o.addEventListener('change', () => run(true));
    run(true);
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
      <h1>🧭 ${esc(A.title)}</h1>
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
    return `<section class="card legend"><span class="lbl">풍수 이야기 · 전해지는 이야기</span>${atlasHead}<ul style="padding-left:18px;margin:8px 0 0">${shown.map(v => `<li style="margin-bottom:4px">${esc(v)}</li>`).join('')}</ul>${!open && extraCnt > 0 ? lockBlock('fengshui', `<p style="margin:0">추가 풍수 해설 ${extraCnt}편이 더 있어요.</p>`) : ''}
      ${atlas ? `<p style="margin:8px 0 0"><a class="sub" href="#/fengshui">🧭 전국 명당 사찰 풍수 대백과에서 권역별 전체 보기 →</a></p>` : ''}
      <p class="sub" style="font-size:.8em">풍수 해석은 개인의 견해이자 전해지는 이야기예요. 효험이나 결과를 보장하지 않아요.</p></section>`;
  }
  function viewTemple(id) {
    const t = resolveTemple(id); if (!t) return `<p>사찰을 찾을 수 없어요.</p>`;
    if (!t.isTradOnly && isPlus() && (!TEMPLE_EXTRAS_CACHE[id] || !TEMPLE_EXTRAS_CACHE[id].unlocked)) ensureTempleExtras(id);
    const vs = S.visits.filter(v => v.tid === t.id);
    const mapQuery = encodeURIComponent(`${t.addr} ${t.name}`);
    return `
    <a href="javascript:history.back()" class="sub" style="text-decoration:none">← 뒤로</a>
    <section class="card hero" style="margin-top:8px">
      <div class="row between"><div><h1 style="margin:0">${esc(t.name)}</h1><div class="sub">${esc(t.hanja)} · ${esc(t.mountain)}</div></div>
      <div class="seal ${vs.length ? '' : 'off'}" style="flex-basis:56px;height:56px">${sealChar(t)}</div></div>
      <div style="margin-top:6px"><span class="tag">${esc(t.order)}</span>${t.tradNo ? `<span class="tag">전통사찰 No.${t.tradNo}</span>` : ''}${t.lists.map(l => `<span class="tag">${LL[l]}</span>`).join('')}${t.themes.map(th => `<span class="tag">${THEMES[th].icon} ${THEMES[th].name}</span>`).join('')}</div>
      ${vs.length ? `<p class="sub" style="margin:8px 0 0">✅ ${vs.length}회 방문 · 최근 ${fmtDate(vs[vs.length - 1].date)}${vs.some(x => x.method === 'demo') ? ' (데모 포함)' : ''}</p>` : ''}
      <div class="grid2" style="margin-top:12px">
        <button class="btn" data-act="gps" data-id="${t.id}">📍 GPS 방문 인증</button>
        <button class="btn ghost" data-act="demo" data-id="${t.id}">🧪 데모 체크인(테스트)</button>
        <a class="btn ghost" style="text-align:center;text-decoration:none" href="#/journal/new/${t.id}">📔 수첩 쓰기</a>
        <button class="btn ghost" data-act="plan-pick" data-id="${t.id}">🗓️ 여행 계획에 담기</button>
      </div>
      <div class="grid2" style="margin-top:8px"><button class="btn ghost" data-act="offline" data-id="${t.id}">${S.offline.includes(t.id) && isPlus() ? '✅ 오프라인 저장됨' : '⬇ 오프라인 저장' + (isPlus() ? '' : ' 🔒')}</button>
        ${t.isTradOnly ? `<a class="btn ghost" style="text-align:center;text-decoration:none" href="https://map.kakao.com/?q=${mapQuery}" target="_blank" rel="noopener">🧭 길찾기·외부지도</a>` : `<a class="btn ghost" style="text-align:center;text-decoration:none" href="#/map/${t.id}">🗺️ 앱 지도</a>`}</div>
      <div class="row" style="margin-top:8px">${STORIES.some(x => x.tid === t.id) ? `<a class="btn ghost block" style="text-align:center;text-decoration:none" href="#/story/${STORIES.find(x => x.tid === t.id).id}">📖 심화 스토리 읽기</a>` : `<a class="btn ghost block" style="text-align:center;text-decoration:none" href="#/explore/all">📋 전통사찰 991 전체 목록</a>`}</div>
      <p class="sub" style="margin:8px 0 0;font-size:.8em">GPS 인증 반경 ${t.radius}m · 하루 1회</p>
    </section>
    <section class="card"><h2>한눈에 보기</h2><dl class="kv">
      <dt>종단</dt><dd>${esc(t.order)}</dd><dt>소재지</dt><dd>${esc(t.addr)}</dd><dt>창건</dt><dd>${esc(t.founded)}</dd>
      <dt>대표 문화재</dt><dd>${t.treasures.map(esc).join('<br>')}</dd><dt>관람 소요</dt><dd>${val(t.duration)}</dd></dl></section>
    <section class="card"><h2>기원·역사</h2><ul class="timeline">${t.timeline.map(([y, d]) => `<li><b>${esc(y)}</b>${esc(d)}</li>`).join('')}</ul></section>
    ${(t.legend || (t.legends && t.legends.length)) ? `<section class="card legend"><div class="row between"><span class="lbl">전해지는 이야기</span><button class="btn ghost small" data-act="audio" data-id="${id}">🎧 듣기${isPlus() ? '' : ' 🔒'}</button></div>
      ${legendsHtml(t)}
      <p class="sub" style="font-size:.8em">설화·전승은 역사적 사실과 다를 수 있으며 효험을 보장하지 않습니다. (전문가 감수 예정)</p></section>` : ''}
    ${storyCards(id)}
    ${prayerHtml(t)}
    ${t.viewpoints && t.viewpoints.length ? `<section class="card"><h2>관람 포인트</h2><ul style="padding-left:18px;margin:0">${t.viewpoints.map(v => `<li style="margin-bottom:4px">${esc(v)}</li>`).join('')}</ul></section>` : ''}
    ${fengshuiHtml(t)}
    <section class="card"><h2>관람 가이드 · 예절</h2><p>💡 ${esc(t.tip)}</p><ul style="padding-left:18px;margin:6px 0">${ETIQUETTE.map(e => `<li>${e}</li>`).join('')}</ul></section>
    <section class="card"><h2>방문 실용정보</h2><dl class="kv">
      <dt>주차</dt><dd>${val(t.practical.parking)}</dd><dt>입장료</dt><dd>${val(t.practical.fee)}</dd><dt>개방시간</dt><dd>${val(t.practical.hours)}</dd>
      <dt>대중교통</dt><dd>${val(t.practical.transit)}</dd><dt>템플스테이</dt><dd>${val(t.practical.templestay)}</dd><dt>좌표</dt><dd>${t.lat.toFixed(5)}, ${t.lng.toFixed(5)}</dd></dl>
      <p class="notice" style="margin-top:8px">방문 전 사찰·국립공원 공지에서 개방시간·통제 여부를 꼭 확인하세요.</p></section>
    ${t.verify.length ? `<section class="card"><h2>확인 필요 항목</h2><ul style="padding-left:18px;margin:0">${t.verify.map(v => `<li class="needs">${esc(v)}</li>`).join('')}</ul></section>` : ''}
    <p class="notice">자료: 주소·종단 = 「전통사찰 현황」(2026.6.1.) · 좌표 = OpenStreetMap · 연혁 = 공개 자료 요약(감수 전)${t.prayer ? ' · 기도 안내 = 언론·백과사전·지자체·사찰 공식 자료(위 출처)' : ''}</p>`;
  }


  function storyCards(id) {
    const st = STORIES.filter(x => x.tid === id), soon = STORY_SOON.filter(x => x.tid === id); if (!st.length && !soon.length) return '';
    return `<section class="card legend"><span class="lbl">📖 마음정원사 : 절로가 심화 스토리</span>${st.map(x => `<h3 style="margin:8px 0 4px">${esc(x.series)} ${x.ep}편 · ${esc(x.title)}</h3><p class="sub" style="margin:0">${esc(x.hook)}</p><a class="btn small" href="#/story/${x.id}" style="display:inline-block;text-decoration:none;margin-top:6px">${storyOpen(x) ? '읽기' : '첫 장 무료로 읽기'} →</a>`).join('')}${soon.map(x => `<p class="sub" style="margin:8px 0 0">${x.ep}편 「${esc(x.title)}」 제작 예정</p>`).join('')}</section>`;
  }
  function legendsHtml(t) {
    const all = [t.legend].concat(t.legends || []).filter(Boolean);
    const one = l => `<h2 style="margin-top:8px">${esc(l.title)}</h2><p>${esc(l.text)}</p>`;
    if (isPlus() || all.length <= 1) return all.map(one).join('');
    return one(all[0]) + lockBlock('legend', all.slice(1).map(l => `<b>${esc(l.title)}</b>`).join(' · ')) + `<p class="sub" style="font-size:.8em;margin:6px 0 0">이 사찰에는 이야기가 ${all.length}편 있어요. 첫 편은 누구나 무료예요.</p>`;
  }
  function prayerHtml(t) {
    const p = t.prayer; if (!p) return '';
    return `<section class="card prayer"><h2 style="margin-top:0">🙏 기도 안내</h2>
      <p style="margin:0"><b>기도 대상</b> · ${esc(p.target)}</p>
      <h3>왜 기도처로 알려졌을까 <span class="sub">(전해지는 이야기)</span></h3><ul>${p.why.map(x => `<li>${esc(x)}</li>`).join('')}</ul>
      ${p.how && p.how.length ? `<h3>찾아가는 법·기도 방법</h3><ul>${p.how.map(x => `<li>${esc(x)}</li>`).join('')}</ul>` : ''}
      <p class="notice" style="margin:8px 0 0">기도처에 전해지는 이야기를 소개할 뿐, 소원 성취나 효험을 보장하지 않아요. 기도하는 분들을 위해 조용히 머물러 주세요.</p>
      <div class="src">출처: ${p.src.map(s => `<a href="${s.u}" target="_blank" rel="noopener">${esc(s.t)}</a>`).join(' · ')}</div></section>`;
  }

  // ---------- 체크인 ----------
  function addVisit(tid, method, dist) {
    const before = visited().size, g0 = gradeInfo(before).cur;
    if (S.visits.some(v => v.tid === tid && v.date.slice(0, 10) === today())) { toast('오늘은 이미 인증했어요. 내일 다시 만나요 🙏'); return; }
    const now = new Date(); const local = new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 19);
    S.visits.push({ tid, date: local, method, dist: dist == null ? null : Math.round(dist) }); save();
    MJAnalytics.track('checkin', { method: method === 'demo' ? 'demo' : 'gps' });
    const after = visited().size, g1 = gradeInfo(after).cur;
    const t = resolveTemple(tid); if (!t) return; const completed = MISSIONS.filter(m => m.ids && m.ids.includes(tid)).filter(m => { const p = missionProgress(m); return p.done === p.total; });
    openModal(`<div class="sheet" style="text-align:center">
      <div class="sub">${method === 'demo' ? '🧪 데모 체크인 (테스트용 · 실제 방문 인증 아님)' : '📍 GPS 방문 인증 완료 · 거리 ' + fmtDist(dist)}</div>
      <div class="stampbig">${esc(t.name.replace(/\(.*\)/, ''))}</div>
      <h2>${esc(t.name)} 스탬프를 받았어요</h2>
      <p>📿 염주 한 알이 더해졌어요 · <b>${beads()}/108</b></p>
      <p>도감 <b>${after}/100</b>${g1 && (!g0 || g1.name !== g0.name) ? ` · 🎉 <b>'${g1.name}'</b> 등급이 되었어요!` : ''}</p>
      ${completed.map(m => `<p>🏅 <b>${m.reward}</b> 획득 — ${m.name}</p>`).join('')}
      <div class="grid2" style="margin-top:12px"><a class="btn ghost" style="text-decoration:none" href="#/journal/new/${tid}" data-act="close">수첩에 기록</a><button class="btn" data-act="close">확인</button></div></div>`);
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
  function viewMap() {
    return `<h1>사찰 지도</h1><div class="tabs" id="mapf"><button class="chip on" data-f="">전체</button>${Object.entries(LL).map(([k, n]) => `<button class="chip" data-f="${k}">${n}</button>`).join('')}<button class="chip" data-f="visited">방문한 곳</button></div>
      <div id="map"></div><div class="row" style="margin-top:10px"><button class="btn small" data-act="locate">📍 내 위치</button><span class="sub"><b style="color:#7a8f5c">●</b> 방문 <b style="color:#e0a77e">●</b> 미방문</span></div>
      <p class="notice" style="margin-top:8px">지도 © OpenStreetMap 기여자. 좌표는 OSM 조회값으로 현장 확인이 필요해요.</p>`;
  }
  function initMap(focusId, elId, onlyVisited) {
    elId = elId || 'map';
    if (typeof L === 'undefined') { document.getElementById(elId).innerHTML = '<p class="notice">지도를 불러오지 못했어요.</p>'; return; }
    const m = L.map(elId, { zoomControl: true }).setView([36.3, 127.9], 7);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 18, attribution: '&copy; OpenStreetMap contributors' }).addTo(m);
    const v = visited(); const layer = L.layerGroup().addTo(m);
    function draw(f) {
      layer.clearLayers();
      TEMPLES.filter(t => !f || (f === 'visited' ? v.has(t.id) : t.lists.includes(f))).filter(t => !onlyVisited || true).forEach(t => {
        const got = v.has(t.id);
        L.circleMarker([t.lat, t.lng], { radius: got ? 9 : 7, color: got ? '#4f6a33' : '#8a6b3a', fillColor: got ? '#7a8f5c' : (onlyVisited ? '#d9d0bf' : '#e0a77e'), fillOpacity: .9, weight: 2 })
          .bindPopup(`<b>${esc(t.name)}</b><br>${esc(t.sido)} ${esc(t.sgg)}<br><a href="#/temple/${t.id}">상세 보기 →</a>`).addTo(layer);
      });
    }
    draw(''); m._draw = draw;
    if (focusId && byId[focusId]) { const t = byId[focusId]; m.setView([t.lat, t.lng], 13); }
    setTimeout(() => m.invalidateSize(), 50);
    setTimeout(() => { if (mapObj === m) m.invalidateSize({ animate: false }); }, 380);  // 폰트·레이아웃이 자리 잡은 뒤 한 번 더
    return m;
  }

  // ---------- 순례(미션·등급·염주·도감·순례지도) ----------
  const TILE = [['', '', '서울', '강원', ''], ['', '인천', '경기', '충북', '경북'], ['', '충남', '세종', '대전', '대구'], ['', '전북', '광주', '경남', '울산'], ['제주', '전남', '', '부산', '']];
  function viewMissions() {
    const v = visited(), g = gradeInfo(v.size);
    const demoN = S.visits.filter(x => x.method === 'demo').length;
    const sidoCount = s => TEMPLES.filter(t => t.sido === s && v.has(t.id)).length;
    return `<h1>나의 순례</h1>
    <section class="card hero" style="text-align:center">
      <div class="sub">현재 등급</div><div class="grade">${g.cur ? g.cur.name : '첫걸음 전'}</div>
      ${beadSVG(beads(), 210)}
      <p class="sub" style="margin:4px 0">방문할 때마다 염주 한 알 · 108알을 모으면 '108 염주' 완성${demoN ? ` · 데모 ${demoN}회 포함` : ''}</p>
      <div class="row wrap" style="justify-content:center;gap:4px">${GRADES.map(x => `<span class="tag ${g.cur && v.size >= x.n ? 'ok' : ''}">${x.name} ${x.n}</span>`).join('→')}</div>
      ${g.next ? `<p style="margin:8px 0 0">다음 <b>${g.left}곳</b>이면 '<b>${g.next.name}</b>' 등급!</p>` : ''}
    </section>
    <section class="card"><h2>순례 미션 · 배지</h2><div class="badges">${MISSIONS.map(m => { const p = missionProgress(m); const done = p.done >= p.total; return `<div class="badge ${done ? 'done' : ''}" title="${esc(m.note || '')}"><span class="ic">${m.icon}</span><b>${m.name}</b><div class="sub">${p.done}/${p.total}</div><div class="progress"><i style="width:${p.done / p.total * 100}%"></i></div><div class="sub simple-hide" style="font-size:.85em">${m.reward}</div></div>`; }).join('')}</div>
      <p class="notice" style="margin-top:10px">7대 총림 지정 현황과 100대 사찰 선정 기준은 확정 후 반영 예정이에요.</p></section>
    <a class="card plusbanner simple-hide" href="#/report"><span style="font-size:1.6em">📊</span><span><b>나의 순례 리포트</b> ${isPlus() ? '' : '<span class="tag">플러스</span>'}<br><span class="sub">발자취·지역·취향·계절·연말 결산 — 내 기록으로 만들어요</span></span></a>
    ${seasonCard()}
    <section class="card"><div class="row between"><h2>도감 ${v.size}/100</h2><a class="sub" href="#/dex">전체 보기 →</a></div>
      <div class="dex">${dexCells(10)}</div></section>
    <section class="card"><h2>순례 지도</h2><p class="sub">방문한 지역이 색칠돼요.</p>
      <div class="tilemap">${TILE.flat().map(s => { if (!s) return '<div class="empty"></div>'; const n = sidoCount(s), tot = TEMPLES.filter(t => t.sido === s).length; const lv = n === 0 ? '' : n >= 3 ? 'l3' : 'l' + n; return `<div class="${lv}">${s}<br>${n}/${tot}</div>`; }).join('')}</div>
      <div id="pmap" style="margin-top:10px"></div></section>
    <section class="card simple-hide"><h2>방문 기록</h2>${S.visits.length ? `<div class="tlist">${S.visits.slice().reverse().slice(0, 20).map(x => { const rt = resolveTemple(x.tid); return rt ? templeItem(rt, fmtDate(x.date) + (x.method === 'demo' ? ' · 🧪데모' : ' · 📍GPS')) : ''; }).join('')}</div>` : '<p class="sub">아직 방문 기록이 없어요.</p>'}
      <button class="btn ghost small" data-act="reset" style="margin-top:10px">모든 기록 초기화</button></section>`;
  }
  function dexCells(limit) {
    const v = visited(); const cells = [];
    const sorted = TEMPLES.slice().sort((a, b) => (v.has(b.id) - v.has(a.id)));
    for (let i = 0; i < (limit || 100); i++) {
      const t = sorted[i];
      if (t) { const got = v.has(t.id); cells.push(`<a class="cell ${got ? 'got' : 'sil'}" href="#/temple/${t.id}"><div><div class="s">${got ? '🏯' : '🏯'}</div>${got ? esc(t.name.replace(/\(.*\)/, '')) : '???'}</div></a>`); }
      else cells.push(`<div class="cell sil"><div><div class="s">🏯</div>선정 예정</div></div>`);
    }
    return cells.join('');
  }
  function viewDex() {
    return `<a href="#/missions" class="sub" style="text-decoration:none">← 순례</a><h1>사찰 도감 ${visited().size}/100</h1><p class="sub">방문하지 않은 칸은 실루엣으로 보여요. ${TEMPLES.length}곳 수록 · 나머지는 100대 사찰 선정 후 공개.</p><div class="dex">${dexCells(100)}</div>`;
  }

  // ---------- 사찰 수첩 ----------
  function viewJournal() {
    const list = S.journal.slice().sort((a, b) => b.date.localeCompare(a.date));
    const trips = (S.trips || []).slice();
    return `<div class="row between"><h1>사찰 수첩</h1><div class="row"><a class="btn ghost small" style="text-decoration:none" href="#/planner">🗓️ 여행 계획 (${trips.length})</a><a class="btn small" style="text-decoration:none" href="#/journal/new/">+ 기록</a></div></div>
      <p class="sub">사진·날씨·다짐을 남겨 두면 나중에 \'1년 전 오늘\'로 다시 만나요. (이 기기에만 저장)</p>
      ${list.length ? list.map(j => { const t = resolveTemple(j.tid); return `<article class="card jentry"><div class="row between"><b>${t ? esc(t.name) : '기타'}</b><span class="sub">${fmtDate(j.date)} ${esc(j.weather || '')}</span></div><p style="white-space:pre-wrap;margin:6px 0">${esc(j.note)}</p>${j.photo ? `<img src="${j.photo}" alt="${t ? esc(t.name) : ''} 사진">` : ''}<div class="row" style="margin-top:8px"><button class="btn ghost small" data-act="jdel" data-id="${j.id}">삭제</button></div></article>`; }).join('') : '<div class="card"><p>아직 기록이 없어요. 첫 사찰 수첩을 남겨 보세요 📔</p></div>'}`;
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
  const TRIP_TEMPLATES = [
    {
      id: 'tpl-gyeongju-day',
      theme: 'history',
      title: '경주·양산 천년고찰 당일 순례',
      days: '당일치기',
      transport: '자가용',
      companion: '가족·부모님과',
      stops: ['bulguksa', 'seokguram', 'tongdosa'],
      schedule: [
        '오전 09:00 — 경주 불국사 도착 · 청운교·백운교, 다보탑·석가탑 참배 (약 1시간 30분)',
        '오전 11:00 — 토함산 석굴암 이동 · 본존불 참배 및 동해 조망 (약 1시간)',
        '오후 12:30 — 경주 보문단지 또는 양산 이동 후 점심 공양·식사',
        '오후 14:30 — 양산 통도사 무풍한송로 산책 · 대웅전 및 금강계단 참배 (약 2시간)'
      ],
      tip: '석굴암과 불국사는 아침 일찍 방문하면 한결 고즈넉해요. 통도사 무풍한송로는 평탄해 부모님과 걷기 좋습니다.'
    },
    {
      id: 'tpl-jogyesan-1n2d',
      theme: 'quiet',
      title: '순천 조계산 삼보·산사 1박 2일 힐링 여행',
      days: '1박 2일',
      transport: '대중교통·도보',
      companion: '혼자 조용히',
      stops: ['songgwangsa', 'seonamsa', 'hwaeomsa'],
      schedule: [
        '1일차 오전 — 순천 송광사 도착 · 침계루·대웅보전·국사전 참배 및 무소유길 산책',
        '1일차 오후 — 조계산 굴목재 숲길 트레킹(약 2~3시간) 또는 차량 이동 → 선암사 승선교·대웅전 관람',
        '2일차 오전 — 구례 화엄사 이동 · 각황전·사사자 삼층석탑 참배 및 지리산 자락 산책'
      ],
      tip: '송광사~선암사 굴목재 코스를 걸으실 때는 편한 등산화와 생수를 꼭 챙기세요.'
    },
    {
      id: 'tpl-eastsea-1n2d',
      theme: 'sea',
      title: '강원 동해·오대산 관음·적멸보궁 1박 2일',
      days: '1박 2일',
      transport: '자가용',
      companion: '연인·친구와',
      stops: ['naksansa', 'woljeongsa', 'sangwonsa'],
      schedule: [
        '1일차 오후 — 양양 낙산사 도착 · 의상대·홍련암 바다 조망 및 해수관음상 참배',
        '2일차 오전 — 평창 오대산 월정사 전나무 숲길 맨발·산책 (약 1시간) 및 팔각구층석탑 관람',
        '2일차 오후 — 오대산 상원사·중대 적멸보궁 참배 (동양 최고 상원사 동종 관람)'
      ],
      tip: '낙산사 홍련암은 일출 시간대 풍경이 특히 아름답습니다. 오대산은 기온이 낮으니 겉옷을 준비하세요.'
    },
    {
      id: 'tpl-seoul-half',
      theme: 'city',
      title: '도심 속 반나절 마음 비우기 사찰 산책',
      days: '반나절·당일',
      transport: '대중교통',
      companion: '혼자 조용히',
      stops: ['jogyesa', 'bongeunsa', 'jingwansa'],
      schedule: [
        '오전 10:00 — 종로 조계사 대웅전·백송 참배 및 인사동 산책',
        '오후 13:30 — 은평 한옥마을 & 북한산 진관사 계곡길 산책 · 차담 휴식',
        '오후 16:30 — 강남 봉은사 미륵대불 및 명상길 저녁 산책'
      ],
      tip: '전철과 버스만으로 편리하게 다닐 수 있는 서울 대표 힐링 코스예요.'
    },
    {
      id: 'tpl-unesco-2n3d',
      theme: 'history',
      title: '경북·충청 유네스코 산사 2박 3일 기행',
      days: '2박 3일',
      transport: '자가용',
      companion: '가족·부모님과',
      stops: ['buseoksa', 'bongjeongsa', 'beopjusa', 'magoksa'],
      schedule: [
        '1일차 — 영주 부석사 무량수전 배흘림기둥 및 석양 감상 → 안동 숙박',
        '2일차 — 안동 봉정사 극락전·영산암 참배 → 보은 속리산 법주사 팔상전·정이품송 관람',
        '3일차 — 공주 마곡사 백범 명상길 산책 및 대웅보전·대광보전 참배'
      ],
      tip: '유네스코 세계유산으로 등재된 한국 전통 산사의 건축미를 깊이 있게 비교하며 둘러보는 일정입니다.'
    },
    {
      id: 'tpl-prayer-wish-1n2d',
      theme: 'prayer',
      title: '팔공산·사리암 기도처 순례 1박 2일',
      days: '1박 2일',
      transport: '자가용',
      companion: '불자·순례 모임',
      stops: ['gatbawi', 'bulgulsa', 'sariam'],
      schedule: [
        '1일차 오전 — 팔공산 선본사 갓바위(관봉 석조여래좌상) 참배 · 현장 안내와 사찰 공지에 맞춰 조용히 머물기 (약 2시간 30분)',
        '1일차 오후 — 경산 불굴사 적멸보궁 참배 · 홍주암은 날씨와 길 상태를 확인한 뒤 무리 없이 방문 (약 1시간 30분)',
        '2일차 오전 — 청도 운문사 사리암 나반존자 기도처 순례 · 계단길과 체력에 맞춰 일정 조정 (약 2시간)'
      ],
      tip: '기도 전통을 다룬 공개 자료를 참고한 코스예요. 갓바위·홍주암·사리암은 계단과 비탈 구간이 있으니 기상·개방·안전 공지를 확인하세요. 소원 성취나 기운의 효험을 약속하지 않습니다.'
    },
    {
      id: 'tpl-prayer-seoul-1d',
      theme: 'prayer',
      title: '서울 도심 기도처·사찰문화 당일 순례',
      days: '당일치기',
      transport: '대중교통·도보',
      companion: '혼자 조용히',
      stops: ['dosunsa', 'suguksa', 'jingwansa'],
      schedule: [
        '오전 — 삼각산 도선사 석불전·마애불 참배와 경내 산책 (셔틀·도보 이용은 사찰 공지 확인)',
        '오후 — 은평 수국사 황금법당과 경내 참배 · 대중교통 이동에 여유 두기',
        '늦은 오후 — 진관사 경내와 계곡길 산책 · 수륙재 등 의례 일정은 사찰 공지에서 확인'
      ],
      tip: '서울의 기도 도량·사찰 문화를 다룬 공공기관·불교방송 자료를 참고했어요. 도심 횡단 이동이 있으니 실제 대중교통 시간과 개방 구역을 출발 전에 확인하세요.'
    },
    {
      id: 'tpl-prayer-namhae-1n2d',
      theme: 'prayer',
      title: '남해 보리암·호구산 용문사 1박 2일',
      days: '1박 2일',
      transport: '자가용',
      companion: '가족·부모님과',
      stops: ['boriam', 'namhae_yongmunsa'],
      schedule: [
        '1일차 — 금산 보리암 참배 · 탑대와 바다 조망, 산길·계단은 천천히 이동 (약 2시간)',
        '2일차 — 호구산 남해 용문사 경내 참배와 숲길 산책 · 사찰 행사와 개방 구역 확인 (약 1시간 30분)'
      ],
      tip: '보리암의 기도 전승과 남해 지역 사찰 자료를 참고한 코스예요. 금산 진입·주차·탐방로 통제와 계절별 혼잡을 확인하세요.'
    },
    {
      id: 'tpl-yeongnam-sowon-1n2d',
      theme: 'prayer',
      title: '영남 영험 소원성지 1박 2일 기도 순례',
      days: '1박 2일',
      transport: '자가용',
      companion: '기도효험 좋은 곳',
      stops: ['gatbawi', 'bulgulsa', 'sariam'],
      schedule: [
        '1일차 오전 — 팔공산 선본사 갓바위(관봉 석조여래좌상) 참배 · 한 가지 소원을 비는 대표 기도처 (선본사 쪽 왕복 산행 약 3시간, 계단 구간 주의)',
        '1일차 오후 — 경산 불굴사 적멸보궁 참배 · 절벽 위 홍주암 독성각 소원성지는 날씨·길 상태를 확인한 뒤 무리 없이 방문 (약 2시간)',
        '2일차 오전 — 청도 운문사 사리암 나반존자 기도처 · 1,008 돌계단을 올라 소원 기도 (편도 약 30~40분, 체력에 맞춰 조정)'
      ],
      tip: '풍생풍사TV 등에서 꼽는 영남 대표 소원성지 세 곳을 잇는 코스예요. 갓바위·홍주암·사리암 모두 계단과 비탈 산행이 필요하니 기상·개방·안전 공지를 확인하세요. 소원 성취나 효험을 약속하지 않아요.'
    },

    {
      id: 'tpl-autumn-naejang-1d',
      theme: 'autumn',
      title: '단풍 절정 내장산·백양사 당일 순례',
      days: '당일치기',
      transport: '자가용',
      companion: '연인·친구와',
      stops: ['naejangsa', 'baegyangsa'],
      schedule: [
        '오전 07:30 — 정읍 내장사 도착 · 단풍터널 산책 및 우화정 감상 (약 1시간 30분~2시간, 단풍철 주말은 이른 아침이 한산해요)',
        '오전 10:30 — 장성 백양사로 이동 (차량 이동)',
        '오후 12:00 — 백양사 점심 식사 후 쌍계루·백학봉 경관 감상 · 천연기념물 고불매 관람 (약 1시간 30분)'
      ],
      tip: '두 사찰 모두 가을 단풍이 유명해요. 백양사 주차장은 무료이고, 주말에는 주변 도로 정체가 있으니 평일이나 이른 아침 출발을 권해요.'
    },
    {
      id: 'tpl-jirisan-saseongam-1n2d',
      theme: 'hike',
      title: '지리산 자락 사성암 산행 · 쌍계사 1박 2일',
      days: '1박 2일',
      transport: '자가용',
      companion: '혼자 조용히',
      stops: ['saseongam', 'ssanggyesa'],
      schedule: [
        '1일차 오전 — 구례 사성암 하단 주차 후 순환 마을버스 이용 · 오산 산길을 올라 유리광전 마애여래입상과 도선굴 참배 (약 1시간 30분, 등산화 필수)',
        '1일차 오후 — 하동 화개로 이동 · 쌍계사 진감선사탑비(최치원 글) 관람 및 경내 산책 (약 1시간 30분)',
        '2일차 오전 — 쌍계사 주변 차 시배지 일대 산책 후 귀가 (봄에는 화개 십리벚꽃길과 함께 둘러보기 좋아요)'
      ],
      tip: '사성암 순환 마을버스 막차는 오후 5시 30분경이라 하산 시간을 미리 계산하세요. 산길이 있으니 편한 등산화와 생수를 준비하세요.'
    },
    {
      id: 'tpl-south-sea-1n2d',
      theme: 'sea',
      title: '여수 향일암 일출 · 해남 대흥사·미황사 남도 바다 1박 2일',
      days: '1박 2일',
      transport: '자가용',
      companion: '연인·친구와',
      stops: ['hyangiram', 'daeheungsa', 'mihwangsa'],
      schedule: [
        '1일차 새벽 — 여수 향일암 일출 참배 (매일 04:00 개방, 일출 시각 확인) · 바위 석문 통과와 바다 조망 (약 1시간 30분)',
        '1일차 오후 — 해남 두륜산 대흥사 이동 · 장춘숲길 산책 및 경내 참배 (약 2시간)',
        '2일차 오전 — 해남 송지 미황사 참배 · 달마고도 일부 구간 산책 (약 1시간 30분~2시간)'
      ],
      tip: '향일암은 계단과 석문이 좁아 일출 시간에 붐벼요. 일찍 도착해 여유 있게 오르세요. 미황사는 달마산 바위 능선과 다도해 노을이 아름다워 일정을 여유 있게 잡으면 좋아요.'
    },
    {
      id: 'tpl-chungnam-quiet-1n2d',
      theme: 'quiet',
      title: '예산 수덕사·공주 마곡사 침묵 명상 1박 2일',
      days: '1박 2일',
      transport: '자가용',
      companion: '혼자 조용히',
      stops: ['sudeoksa', 'magoksa'],
      schedule: [
        '1일차 오전 — 예산 수덕사 도착 · 고려 시대 목조건축인 대웅전 참배 및 경내 고요한 산책 (약 1시간 30분)',
        '1일차 오후 — 숙소에서 휴식 · 차 한 잔과 함께 조용히 쉬기',
        '2일차 오전 — 공주 마곡사로 이동 · 백범 명상길 걷기 (약 1시간 30분~2시간)',
        '2일차 오후 — 대웅보전·대광보전 참배 후 귀가'
      ],
      tip: '수덕사 대웅전은 건립 연대가 확인되는 오래된 목조 건물이에요. 마곡사는 봄 풍경이 특히 유명해 계절을 바꿔 다시 찾아도 좋아요. 법당에서는 정숙을 지켜 주세요.'
    },
    {
      id: 'tpl-haeinsa-donghwasa-1n2d',
      theme: 'history',
      title: '합천 해인사·대구 동화사 국보·역사 기행 1박 2일',
      days: '1박 2일',
      transport: '자가용',
      companion: '불자·순례 모임',
      stops: ['haeinsa', 'donghwasa'],
      schedule: [
        '1일차 오전 — 합천 해인사 도착 · 경내 참배 및 장경판전 관람 (장경판전은 보존을 위해 출입이 제한될 수 있어 사전 확인, 약 2시간)',
        '1일차 오후 — 시간이 되면 가야산 소리길 산책 후 대구 팔공산으로 이동',
        '2일차 오전 — 대구 팔공산 동화사 · 보물 동화사 마애여래좌상과 통일약사여래대불 참배 (약 1시간 30분~2시간)',
        '2일차 오후 — 팔공산 가을 단풍 산책 후 귀가'
      ],
      tip: '해인사는 팔만대장경과 장경판전으로 기록유산의 가치를 느낄 수 있는 법보사찰이에요. 동화사는 「겨울에 핀 오동꽃」 이야기를 떠올리며 걷기 좋아요.'
    },
    {
      id: 'tpl-ganghwa-legend-day',
      theme: 'legend',
      title: '강화도 설화 순례 — 전등사·보문사 당일',
      days: '당일치기',
      transport: '자가용',
      companion: '가족·부모님과',
      stops: ['jeondeungsa', 'bomunsa'],
      schedule: [
        '오전 09:30 — 강화 전등사 도착 · 대웅전 처마 밑 나부상 이야기 살펴보기, 정족산성 삼랑성 둘레길 산책 (약 1시간 30분)',
        '오후 12:30 — 점심 식사 후 석모도 보문사로 이동 (석모대교 경유)',
        '오후 15:00 — 보문사 눈썹바위 마애석불좌상 참배 (계단이 가파르니 천천히) · 석실 나한전 관람',
        '해질녘 — 서해 낙조 감상 후 귀가 (계절별 일몰 시각 확인)'
      ],
      tip: '전등사 처마 설화와 보문사 그물에 걸린 돌 이야기는 모두 「전해지는 이야기」예요. 보문사 눈썹바위까지는 계단이 가팔라 편한 신발이 필요해요.'
    },
    {
      id: 'tpl-busan-transit-day',
      theme: 'city',
      title: '부산 도심 범어사·바닷가 해동용궁사 뚜벅이 당일',
      days: '당일치기',
      transport: '대중교통',
      companion: '연인·친구와',
      stops: ['beomeosa', 'yonggungsa'],
      schedule: [
        '오전 10:00 — 부산 도시철도 1호선 범어사역에서 순환버스 이용 후 범어사 참배 · 대웅전·삼층석탑·조계문 관람 (약 1시간 30분)',
        '오후 12:30 — 점심 식사 후 기장 해동용궁사로 이동 (버스·지하철 환승, 이동에 1시간 이상 여유)',
        '오후 15:00 — 해동용궁사 바닷가 바위 위 전각 관람 · 해수관음대불 참배 및 파도 소리 산책 (약 1시간 30분)',
        '해질녘 — 동해선 오시리아역 또는 해운대 방면으로 귀가'
      ],
      tip: '해동용궁사는 주말 혼잡이 심하니 평일이나 이른 아침을 추천해요. 두 사찰 모두 대중교통으로 갈 수 있어 차 없이도 편하게 다닐 수 있어요.'
    },
    {
      id: 'tpl-hwaseong-family-day',
      theme: 'family',
      title: '화성 용주사·서울 봉은사 아이와 함께하는 반나절 나들이',
      days: '반나절·당일',
      transport: '자가용',
      companion: '아이와 함께',
      stops: ['yongjusa', 'bongeunsa'],
      schedule: [
        '오전 10:00 — 화성 용주사 도착 · 넓은 무료 주차장에서 가볍게 시작, 경내 산책 · 국보 용주사 동종 및 부모은중경판 관람 (약 1시간 30분)',
        '오후 12:30 — 점심 식사 후 서울 강남 봉은사로 이동',
        '오후 14:30 — 봉은사 판전 현판·미륵대불 관람 · 명상길 산책 (약 1시간 30분)',
        '오후 16:30 — 코엑스 쪽 간식·나들이로 마무리'
      ],
      tip: '용주사는 융릉·건릉과 함께 둘러보기 좋아요. 봉은사는 코엑스 바로 옆이라 나들이 마무리에 좋고, 경내에서는 아이와 함께 조용히 걷도록 이야기해 주세요.'
    }
  ];

  const TRIP_CHECKLIST = [
    { id: 'shoes', cat: '복장·신발', text: '벗고 신기 편한 신발·양말 (법당 참배 시 필수)' },
    { id: 'clothes', cat: '복장·신발', text: '단정하고 편안한 복장 & 산중 체온 유지용 겉옷' },
    { id: 'water', cat: '산행·이동', text: '개인 물병(텀블러) 및 가벼운 간식' },
    { id: 'cash', cat: '참배·실용', text: '소액 현금 (시주·불전함·산중 자판기 등)' },
    { id: 'hours', cat: '사전 확인', text: '사찰 개방시간·주차장 위치 및 산불방지 입산통제 확인' },
    { id: 'etiquette', cat: '사찰 예절', text: '법당 어간문(가운데 문) 피하기 · 묵언 및 촬영 매너 숙지' }
  ];

  // 새 여행 계획 작성 중인 임시 초안 (저장 전까지만 유지, 초기화 버튼으로 비울 수 있음)
  const DRAFT_SAMPLE_STOPS = ['bulguksa', 'tongdosa'];
  const DRAFT_FIELDS = ['title', 'date', 'days', 'transport', 'companion', 'memo'];
  const DRAFT_DEFAULTS = { days: '당일치기', transport: '자가용', companion: '혼자 조용히' };
  const DAYS_OPTS = ['반나절·당일', '당일치기', '1박 2일', '2박 3일', '3박 4일 이상'];
  const TRANSPORT_OPTS = ['자가용', '대중교통', '대중교통·도보', '산행·트레킹'];
  const COMPANION_OPTS = ['혼자 조용히', '가족·부모님과', '연인·친구와', '아이와 함께', '불자·순례 모임', '기도처 중심 일정', '기도효험 좋은 곳'];
  let draftStops = [];
  let draftForm = {};       // 사용자가 직접 고친 입력값만 보관 (없으면 사찰 구성에 따른 자동값 사용)
  let draftCleared = false; // 초기화한 뒤에는 예시 사찰을 다시 채우지 않음

  function parseDurationMin(str) {
    if (!str) return 60;
    const m = String(str).match(/(\d+)\s*시간/);
    const m2 = String(str).match(/(\d+)\s*분/);
    if (m) return parseInt(m[1], 10) * 60 + (m2 ? parseInt(m2[1], 10) : 0);
    if (m2) return parseInt(m2[1], 10);
    return 60;
  }

  function calcRouteSummary(stopIds, transport) {
    const stops = (stopIds || []).map(id => resolveTemple(id)).filter(Boolean);
    let totalStraightKm = 0;
    const legs = [];
    const factor = transport === '대중교통' || transport === '대중교통·도보' ? 1.45 : 1.3;
    const speedKmh = transport === '대중교통' || transport === '대중교통·도보' ? 42 : 55;
    for (let i = 0; i < stops.length - 1; i++) {
      const a = stops[i], b = stops[i + 1];
      const dKm = haversine(a.lat, a.lng, b.lat, b.lng) / 1000;
      totalStraightKm += dKm;
      const roadKm = Math.max(1, Math.round(dKm * factor));
      const driveMin = Math.max(10, Math.round((roadKm / speedKmh) * 60));
      legs.push({ from: a, to: b, straightKm: Math.round(dKm), roadKm, driveMin });
    }
    const stayMin = stops.reduce((acc, t) => acc + parseDurationMin(t.duration), 0);
    const moveMin = legs.reduce((acc, l) => acc + l.driveMin, 0);
    const relatedMissions = MISSIONS.filter(m => m.ids && m.ids.some(id => stopIds.includes(id)));
    return { stops, legs, totalStraightKm: Math.round(totalStraightKm), stayMin, moveMin, totalMin: stayMin + moveMin, relatedMissions };
  }

  function fmtMin(m) {
    if (m < 60) return `${m}분`;
    const h = Math.floor(m / 60), r = m % 60;
    return r ? `${h}시간 ${r}분` : `${h}시간`;
  }

  function ensureDefaultTrips() {
    if (!Array.isArray(S.trips)) S.trips = [];
    if (!S.tripChecks || typeof S.tripChecks !== 'object') S.tripChecks = {};
  }

  // ---- 새 계획 초안(draft) 상태 ----
  const draftNames = () => draftStops.map(id => { const t = resolveTemple(id); return t ? t.name : null; }).filter(Boolean);

  function autoDraftTitle() {
    const names = draftNames();
    if (!names.length) return '';
    return names.slice(0, 2).join('·') + (names.length > 2 ? ` 외 ${names.length - 2}곳` : '') + ' 사찰 여행';
  }

  function autoDraftMemo() {
    return draftStops.map((id, i) => {
      const t = resolveTemple(id);
      return t ? `${i + 1}. ${t.name} (${t.addr}) — 관람 및 산책 (${t.duration || '약 1시간'})` : '';
    }).filter(Boolean).join('\n');
  }

  // 사용자가 입력한 값이 있으면 그 값을, 없으면 자동값(사찰 구성 기반 기본값)을 쓴다
  function draftValue(field) {
    if (draftForm[field] != null) return draftForm[field];
    if (field === 'title') return autoDraftTitle();
    if (field === 'memo') return autoDraftMemo();
    if (field === 'date') return today();
    return DRAFT_DEFAULTS[field] || '';
  }

  function selOpts(list, cur) {
    return list.map(o => `<option${o === cur ? ' selected' : ''}>${esc(o)}</option>`).join('');
  }

  // 사찰을 추가/삭제하면 화면을 다시 그리므로, 입력 중인 값은 그때그때 초안에 담아 둔다
  function captureDraftField(e) {
    const el = e.target;
    if (!el || !el.name || DRAFT_FIELDS.indexOf(el.name) < 0) return;
    draftForm[el.name] = el.value;
  }

  // 초기화할 내용이 있는지 (경유 사찰 또는 기본값과 다른 입력값)
  function plannerDraftFilled() {
    if (draftStops.length) return true;
    return DRAFT_FIELDS.some(k => {
      const v = draftForm[k];
      if (v == null) return false;
      if (k === 'date') return v !== today();
      if (DRAFT_DEFAULTS[k]) return v !== DRAFT_DEFAULTS[k];
      return String(v).trim() !== '';
    });
  }

  function clearPlannerDraft() {
    draftStops = [];
    draftForm = {};
    draftCleared = true;
  }

  // 지울 내용이 없으면 초기화 버튼을 비활성 상태로 둔다
  function syncDraftResetButtons() {
    const on = plannerDraftFilled();
    document.querySelectorAll('[data-act="draft-reset"]').forEach(b => {
      b.disabled = !on;
      b.setAttribute('aria-disabled', String(!on));
    });
  }

  // 🧹 초기화 버튼 — 작성 중인 새 여행 계획만 비움 (저장된 계획·수첩 기록은 그대로)
  function resetPlannerDraft() {
    if (!plannerDraftFilled()) { toast('이미 비어 있는 새 계획이에요.'); return; }
    if (!confirm('작성 중인 내용을 모두 지우고 처음부터 다시 짤까요?\n(이미 저장한 여행 계획은 그대로 남아요)')) return;
    clearPlannerDraft();
    // #/planner/new/<사찰id> 로 들어온 경우 다시 그리면 그 사찰이 되살아나므로 주소를 비운다
    if (location.hash !== '#/planner/new') location.hash = '#/planner/new';
    else render();
    toast('작성 중이던 여행 계획을 초기화했어요 🧹');
  }

  // 추천 템플릿을 사찰 특징(테마)별로 골라 보는 필터 (화면 상태, 저장하지 않음)
  let tplTheme = 'all';
  const tplMatch = tpl => tplTheme === 'all' || tpl.theme === tplTheme;
  function tplFilterHtml() {
    const keys = [...new Set(TRIP_TEMPLATES.map(t => t.theme).filter(k => k && THEMES[k]))];
    const chip = (k, label) => `<button type="button" class="chip ${tplTheme === k ? 'on' : ''}" data-act="tpl-theme" data-theme="${k}" aria-pressed="${tplTheme === k}">${label}</button>`;
    return `<div class="row wrap" style="margin:4px 0 10px">${chip('all', '전체')}${keys.map(k => chip(k, THEMES[k].icon + ' ' + THEMES[k].name)).join('')}</div>`;
  }

  function viewPlanner(sub, arg) {
    ensureDefaultTrips();
    if (sub === 'theme') tplTheme = arg === 'all' || THEMES[arg] ? arg : 'all';
    else if (!sub) tplTheme = 'all';
    if (sub === 'new') return viewPlannerNew(arg);
    if (sub === 'view') return viewPlannerDetail(arg);

    const trips = S.trips.slice().sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
    const checks = S.tripChecks || {};
    const doneCnt = TRIP_CHECKLIST.filter(c => checks[c.id]).length;

    return `<div class="row between"><h1>🗓️ 사찰 여행 계획</h1><a class="btn small" style="text-decoration:none" href="#/planner/new">+ 새 계획 짜기</a></div>
      <p class="sub">가고 싶은 사찰을 골라 동선·소요시간·연계 순례 미션·준비물을 한눈에 계획해 보세요.</p>

      <section class="card hero">
        <div class="row between"><b>나의 사찰 여행 일정</b><span class="tag">${trips.length}개</span></div>
        ${trips.length ? `<div class="tlist" style="margin-top:8px">${trips.map(tr => {
          const sum = calcRouteSummary(tr.stops, tr.transport);
          return `<a class="titem" href="#/planner/view/${encodeURIComponent(tr.id)}">
            <div class="seal" style="background:var(--accent)">🗓️</div>
            <div class="meta">
              <b>${esc(tr.title)}</b>
              <div class="sub">${esc(tr.date || '날짜 미정')} · ${esc(tr.days || '당일치기')} · ${esc(tr.transport || '자가용')} · ${esc(tr.companion || '혼자 조용히')}</div>
              <div><span class="tag ok">${sum.stops.length}곳</span><span class="tag">약 ${fmtMin(sum.totalMin)}</span>${sum.stops.slice(0, 3).map(t => `<span class="tag">${esc(t.name)}</span>`).join('')}</div>
            </div>
          </a>`;
        }).join('')}</div>` : `<p class="sub" style="margin:8px 0">아직 저장된 여행 계획이 없어요. 아래 추천 일정을 담거나 직접 사찰을 골라 나만의 순례 코스를 만들어 보세요!</p>
        <a class="btn small" style="text-decoration:none;display:inline-block" href="#/planner/new">첫 사찰 여행 계획 만들기 →</a>`}
      </section>

      <section class="card">
        <div class="row between"><h2 style="margin:0">✨ 추천 사찰 여행 템플릿</h2><span class="sub">클릭해 내 일정으로 담기</span></div>
        <p class="sub" style="margin:4px 0 10px">사찰마다 가진 테마(단풍·산행·바다·명상·설화 등)에 맞춰 짠 추천 코스예요. 내 일정으로 담은 뒤 자유롭게 수정할 수 있어요.</p>
        ${tplFilterHtml()}
        ${TRIP_TEMPLATES.filter(tplMatch).map(tpl => {
          const sum = calcRouteSummary(tpl.stops, tpl.transport);
          const th = THEMES[tpl.theme];
          return `<div class="course">
            <div class="row between"><b>${esc(tpl.title)}</b><span class="tag">${esc(tpl.days)} · ${esc(tpl.transport)}</span></div>
            ${th ? `<div style="margin:2px 0 4px"><span class="tag ok">${th.icon} ${esc(th.name)}</span> <span class="sub">${esc(th.desc)}</span></div>` : ''}
            <div class="sub" style="margin:4px 0">📍 코스: ${sum.stops.map(t => esc(t.name)).join(' → ')} (총 직선 ${sum.totalStraightKm}km · 예상 ${fmtMin(sum.totalMin)})</div>
            <ol style="padding-left:18px;margin:6px 0;font-size:.92em">${tpl.schedule.map(s => `<li>${esc(s)}</li>`).join('')}</ol>
            <div class="sub">💡 ${esc(tpl.tip)}</div>
            ${sum.relatedMissions.length ? `<div class="sub" style="margin-top:4px">🏅 연계 미션: ${sum.relatedMissions.map(m => m.icon + ' ' + m.name).join(', ')}</div>` : ''}
            <div class="row wrap" style="margin-top:8px">
              <button class="btn small" data-act="tpl-adopt" data-id="${esc(tpl.id)}">📥 내 여행 계획으로 담기</button>
              ${sum.stops.map(t => `<a class="chip" style="text-decoration:none" href="#/temple/${t.id}">${esc(t.name)}</a>`).join('')}
            </div>
          </div>`;
        }).join('')}
      </section>

      <section class="card">
        <div class="row between"><h2 style="margin:0">🎒 사찰 여행 준비물 · 예절 체크리스트</h2><span class="tag ${doneCnt === TRIP_CHECKLIST.length ? 'ok' : ''}">${doneCnt}/${TRIP_CHECKLIST.length} 완료</span></div>
        <p class="sub" style="margin:4px 0 8px">출발 전 하나씩 점검해 보세요. 체크 상태는 자동 저장됩니다.</p>
        <ul class="chklist">
          ${TRIP_CHECKLIST.map(c => {
            const on = !!checks[c.id];
            return `<li class="${on ? 'done' : ''}">
              <input type="checkbox" id="chk_${c.id}" data-act="trip-chk" data-id="${c.id}" ${on ? 'checked' : ''}>
              <label for="chk_${c.id}"><span class="tag">${esc(c.cat)}</span> ${esc(c.text)}</label>
            </li>`;
          }).join('')}
        </ul>
      </section>`;
  }

  function draftStopsHtml(sum) {
    if (!draftStops.length) return '<p class="notice">아래에서 방문할 사찰을 1곳 이상 추가해 주세요.</p>';
    return `<ul class="route-line">${draftStops.map((id, idx) => {
      const t = resolveTemple(id); if (!t) return '';
      const leg = idx < sum.legs.length ? sum.legs[idx] : null;
      return `<li data-step="${idx + 1}">
        <div class="row between">
          <div><b>${esc(t.name)}</b> <span class="sub">${esc(t.sido)} ${esc(t.sgg)} · ${esc(t.mountain)}</span></div>
          <div class="row">
            ${idx > 0 ? `<button type="button" class="btn ghost small" data-act="draft-up" data-idx="${idx}" title="위로">↑</button>` : ''}
            ${idx < draftStops.length - 1 ? `<button type="button" class="btn ghost small" data-act="draft-down" data-idx="${idx}" title="아래로">↓</button>` : ''}
            <button type="button" class="btn ghost small" data-act="draft-rm" data-idx="${idx}">제외</button>
          </div>
        </div>
        <div class="sub">주소: ${esc(t.addr)} · 권장 관람: ${esc(t.duration || '약 1시간')}</div>
        ${leg ? `<div class="route-leg">🚗 다음 사찰(${esc(leg.to.name)})까지 직선 약 ${leg.straightKm}km · 예상 도로 약 ${leg.roadKm}km (약 ${leg.driveMin}분)</div>` : ''}
      </li>`;
    }).join('')}</ul>`;
  }

  function draftSummaryHtml(sum) {
    return `🏅 현재 코스로 채워지는 미션: ${sum.relatedMissions.length ? sum.relatedMissions.map(m => `${m.icon} ${m.name}`).join(', ') : '해당 없음'} · 총 예상 소요: <b>약 ${fmtMin(sum.totalMin)}</b> (관람 ${fmtMin(sum.stayMin)} + 이동 ${fmtMin(sum.moveMin)})`;
  }

  // 이동 수단을 바꾸면 화면 전체를 다시 그리지 않고 거리·소요시간만 갱신 (입력값·스크롤 유지)
  function refreshDraftEstimates() {
    const list = document.getElementById('draftStopList');
    const box = document.getElementById('draftSummary');
    if (!list && !box) return;
    const sum = calcRouteSummary(draftStops, draftValue('transport'));
    if (list) list.innerHTML = draftStopsHtml(sum);
    if (box) box.innerHTML = draftSummaryHtml(sum);
  }

  function viewPlannerNew(preselectTid) {
    if (preselectTid && resolveTemple(preselectTid) && !draftStops.includes(preselectTid)) {
      draftStops.push(preselectTid);
      draftCleared = false;
    }
    if (!draftStops.length && !draftCleared) {
      draftStops = DRAFT_SAMPLE_STOPS.slice();
    }
    const sum = calcRouteSummary(draftStops, draftValue('transport'));
    const sidos = SIDO_ORDER;
    const filled = plannerDraftFilled();

    return `<div class="row between">
        <a href="#/planner" class="sub" style="text-decoration:none">← 여행 계획 목록</a>
        <button type="button" class="btn ghost small" data-act="draft-reset" ${filled ? '' : 'disabled aria-disabled="true"'} title="작성 중인 내용 모두 지우기">🧹 초기화</button>
      </div>
      <h1>새 사찰 여행 계획 짜기</h1>
      <form id="planForm" class="card">
        <label>여행 제목</label>
        <input name="title" placeholder="예: 가을 산사 힐링 1박 2일 순례" value="${esc(draftValue('title'))}" required maxlength="60">
        <div class="grid2">
          <div><label>출발 예정일</label><input type="date" name="date" value="${esc(draftValue('date'))}" required></div>
          <div><label>여행 기간</label><select name="days">${selOpts(DAYS_OPTS, draftValue('days'))}</select></div>
        </div>
        <div class="grid2">
          <div><label>이동 수단</label><select name="transport" id="planTransport">${selOpts(TRANSPORT_OPTS, draftValue('transport'))}</select></div>
          <div><label>동행 스타일</label><select name="companion">${selOpts(COMPANION_OPTS, draftValue('companion'))}</select></div>
        </div>

        <label style="margin-top:12px">📍 경유 사찰 구성 (${draftStops.length}곳 선택됨)</label>
        <div id="draftStopList">${draftStopsHtml(sum)}</div>

        <div class="card" style="background:#f9f5ec;margin-top:8px">
          <div class="row between"><b>사찰 추가하기 (전통사찰 991곳 전체 지원)</b><button type="button" class="btn ghost small" data-act="draft-optimize">✨ 동선 순서 자동 정렬</button></div>
          <div class="row" style="margin-top:6px">
            <select id="addTempleFilter" style="max-width:105px">
              <option value="">전체 지역</option>
              ${sidos.map(s => `<option value="${esc(s)}">${esc(s)}</option>`).join('')}
            </select>
            <input id="addTempleSearch" placeholder="사찰명 검색 (예: 보문사, 청량사)" style="flex:1" />
          </div>
          <div class="row" style="margin-top:6px">
            <select id="addTempleSelect" style="flex:1">
              ${TEMPLES.map(t => `<option value="${t.id}">[주요·${esc(t.sido)}] ${esc(t.name)} (${esc(t.sgg)})</option>`).join('')}
              ${TRAD.map(r => `<option value="${r.id}">[전통No.${r.no}·${esc(r.sido)}] ${esc(r.name)} (${esc(r.sgg)} · ${esc(r.order)})</option>`).join('')}
            </select>
            <button type="button" class="btn small" data-act="draft-add">+ 추가</button>
          </div>
          <div class="sub" id="draftSummary" style="margin-top:6px">${draftSummaryHtml(sum)}</div>
        </div>

        <label>여행 메모 · 일정표 (시간대별 계획, 맛집·숙소·다짐 등)</label>
        <textarea name="memo" placeholder="예:&#10;- 오전 9시 출발, 경주 톨게이트 통과&#10;- 점심은 사찰 입구 산채비빔밥&#10;- 대웅전에서 가족 건강 발원하기" maxlength="1500">${esc(draftValue('memo'))}</textarea>

        <div class="grid2" style="margin-top:12px">
          <button class="btn ghost" type="button" data-act="draft-reset" ${filled ? '' : 'disabled aria-disabled="true"'}>🧹 초기화</button>
          <button class="btn" type="submit">🗓️ 계획 저장하기</button>
        </div>
        <p class="notice" style="margin-top:8px">🧹 초기화를 누르면 선택한 사찰과 입력한 내용이 모두 지워지고 빈 계획표로 돌아가요. 이미 저장한 여행 계획은 지워지지 않아요.</p>
      </form>`;
  }

  function viewPlannerDetail(id) {
    ensureDefaultTrips();
    const tr = S.trips.find(x => x.id === id);
    if (!tr) return `<a href="#/planner" class="sub" style="text-decoration:none">← 여행 계획 목록</a><p>여행 계획을 찾을 수 없어요.</p>`;
    const sum = calcRouteSummary(tr.stops, tr.transport);
    const v = visited();

    return `<div class="row between noprint">
        <a href="#/planner" class="sub" style="text-decoration:none">← 여행 계획 목록</a>
        <div class="row">
          <button class="btn ghost small" data-act="print">🖨 인쇄 / PDF</button>
          <button class="btn ghost small" data-act="trip-del" data-id="${esc(tr.id)}">삭제</button>
        </div>
      </div>
      <section class="card hero" style="margin-top:8px">
        <div class="sub">🗓️ ${esc(tr.date || '날짜 미정')} · ${esc(tr.days)} · ${esc(tr.transport)} · ${esc(tr.companion)}</div>
        <h1 style="margin:6px 0">${esc(tr.title)}</h1>
        <div class="row wrap">
          <span class="tag ok">경유 사찰 ${sum.stops.length}곳</span>
          <span class="tag">총 예상 ${fmtMin(sum.totalMin)} (관람 ${fmtMin(sum.stayMin)} + 이동 ${fmtMin(sum.moveMin)})</span>
          <span class="tag">구간 직선거리 합 ${sum.totalStraightKm}km</span>
        </div>
        ${sum.relatedMissions.length ? `<p class="sub" style="margin:8px 0 0">🏅 <b>연계 순례 미션</b>: ${sum.relatedMissions.map(m => `${m.icon} ${m.name}`).join(' · ')}</p>` : ''}
      </section>

      <section class="card">
        <h2>📍 순례 동선 및 사찰별 안내</h2>
        <ul class="route-line">
          ${sum.stops.map((t, idx) => {
            const leg = idx < sum.legs.length ? sum.legs[idx] : null;
            const isVis = v.has(t.id);
            return `<li data-step="${idx + 1}">
              <div class="row between">
                <div><a href="#/temple/${t.id}" style="font-weight:700;text-decoration:none">${esc(t.name)}</a> <span class="sub">${esc(t.sido)} ${esc(t.sgg)} · ${esc(t.mountain)}</span> ${isVis ? '<span class="tag ok">방문 완료</span>' : ''}</div>
                <a class="btn ghost small noprint" style="text-decoration:none" href="#/temple/${t.id}">상세 →</a>
              </div>
              <div class="sub" style="margin-top:2px">소재지: ${esc(t.addr)}</div>
              <div class="sub">권장 관람: ${esc(t.duration || '약 1시간')} · 주차: ${esc(t.practical.parking)}</div>
              <div class="sub">💡 팁: ${esc(t.tip)}</div>
              ${t.prayer ? `<div class="sub">🙏 기도처 안내: ${esc(t.prayer.target)}</div>` : ''}
              ${leg ? `<div class="route-leg">🚗 <b>${esc(leg.from.name)} → ${esc(leg.to.name)}</b>: 직선 약 ${leg.straightKm}km · 도로 예상 약 ${leg.roadKm}km (약 ${leg.driveMin}분 소요)</div>` : ''}
            </li>`;
          }).join('')}
        </ul>
      </section>

      ${tr.memo ? `<section class="card"><h2>📝 일정표 · 여행 메모</h2><p style="white-space:pre-wrap;margin:0">${esc(tr.memo)}</p></section>` : ''}

      <section class="card noprint">
        <h2>🗺️ 코스 지도</h2>
        <div id="planMap" style="height:300px;border-radius:14px;border:1px solid var(--line)"></div>
      </section>`;
  }

  function initPlanMap(stopIds) {
    const el = document.getElementById('planMap');
    if (!el || typeof L === 'undefined') return null;
    const stops = (stopIds || []).map(id => resolveTemple(id)).filter(Boolean);
    if (!stops.length) return null;
    const m = L.map('planMap', { zoomControl: true }).setView([stops[0].lat, stops[0].lng], 8);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 18, attribution: '&copy; OpenStreetMap' }).addTo(m);
    const latlngs = stops.map(t => [t.lat, t.lng]);
    if (latlngs.length > 1) {
      L.polyline(latlngs, { color: '#7a8f5c', weight: 3, dashArray: '6, 6' }).addTo(m);
    }
    stops.forEach((t, idx) => {
      L.circleMarker([t.lat, t.lng], { radius: 9, color: '#b5643c', fillColor: '#c9a24a', fillOpacity: 0.95, weight: 2 })
        .bindPopup(`<b>${idx + 1}. ${esc(t.name)}</b><br>${esc(t.sido)} ${esc(t.sgg)}<br><a href="#/temple/${t.id}">상세 보기 →</a>`)
        .addTo(m);
    });
    if (latlngs.length > 1) {
      m.fitBounds(latlngs, { padding: [30, 30] });
    }
    setTimeout(() => m.invalidateSize(), 60);
    return m;
  }

  function bindPlannerForm() {
    const f = document.getElementById('planForm');
    const filterSel = document.getElementById('addTempleFilter');
    const searchInp = document.getElementById('addTempleSearch');
    const templeSel = document.getElementById('addTempleSelect');
    if (filterSel && templeSel) {
      const updateOptions = () => {
        const sd = filterSel.value;
        const kw = (searchInp && searchInp.value || '').trim();
        const featList = TEMPLES.filter(t => (!sd || t.sido === sd) && (!kw || t.name.includes(kw) || t.sgg.includes(kw) || t.addr.includes(kw)));
        const tradList = TRAD.filter(r => (!sd || r.sido === sd) && (!kw || r.name.includes(kw) || r.sgg.includes(kw) || r.addr.includes(kw)));
        templeSel.innerHTML =
          featList.map(t => `<option value="${t.id}">[주요·${esc(t.sido)}] ${esc(t.name)} (${esc(t.sgg)})</option>`).join('') +
          tradList.map(r => `<option value="${r.id}">[전통No.${r.no}·${esc(r.sido)}] ${esc(r.name)} (${esc(r.sgg)} · ${esc(r.order)})</option>`).join('');
      };
      filterSel.addEventListener('change', updateOptions);
      if (searchInp) searchInp.addEventListener('input', updateOptions);
    }
    if (!f) return;
    // 사찰 추가·삭제로 화면을 다시 그려도 입력하던 값이 날아가지 않도록 초안에 보관
    f.addEventListener('input', e => { captureDraftField(e); syncDraftResetButtons(); });
    f.addEventListener('change', e => {
      captureDraftField(e);
      if (e.target && e.target.name === 'transport') refreshDraftEstimates();
      syncDraftResetButtons();
    });
    f.addEventListener('submit', e => {
      e.preventDefault();
      if (!draftStops.length) { toast('방문할 사찰을 최소 1곳 이상 추가해 주세요.'); return; }
      const fd = new FormData(f);
      ensureDefaultTrips();
      const id = 'trip_' + Date.now().toString(36);
      const item = {
        id,
        title: (fd.get('title') || '사찰 순례 여행').trim(),
        date: fd.get('date') || today(),
        days: fd.get('days') || '당일치기',
        transport: fd.get('transport') || '자가용',
        companion: fd.get('companion') || '혼자 조용히',
        stops: draftStops.slice(),
        memo: (fd.get('memo') || '').trim(),
        createdAt: new Date().toISOString()
      };
      S.trips.push(item);
      save();
      clearPlannerDraft(); // 저장했으니 다음 '새 계획 짜기'는 빈 계획표로 시작
      toast('여행 계획을 저장했어요 🗓️');
      location.hash = '#/planner/view/' + encodeURIComponent(id);
    });
  }

  function optimizeDraftOrder() {
    if (draftStops.length <= 2) { toast('사찰이 3곳 이상일 때 동선을 자동 정렬해요.'); return; }
    const remaining = draftStops.slice(1);
    const ordered = [draftStops[0]];
    while (remaining.length) {
      const cur = resolveTemple(ordered[ordered.length - 1]);
      let bestIdx = 0, bestDist = Infinity;
      remaining.forEach((id, idx) => {
        const t = resolveTemple(id);
        const d = (cur && t) ? haversine(cur.lat, cur.lng, t.lat, t.lng) : Infinity;
        if (d < bestDist) { bestDist = d; bestIdx = idx; }
      });
      ordered.push(remaining.splice(bestIdx, 1)[0]);
    }
    draftStops = ordered;
    toast('가장 가까운 동선 순서로 정렬했어요 ✨');
    render();
  }

  function openPlanPickModal(tid) {
    const t = resolveTemple(tid); if (!t) return;
    ensureDefaultTrips();
    const trips = S.trips || [];
    openModal(`<div class="sheet">
      <h2>🗓️ 「${esc(t.name)}」 여행 계획에 담기</h2>
      <p class="sub">새 사찰 여행 코스를 만들거나 기존 계획에 경유지로 추가할 수 있어요.</p>
      ${trips.length ? `<div class="tlist" style="margin:10px 0">${trips.map(tr => `<div class="titem">
        <div class="meta"><b>${esc(tr.title)}</b><div class="sub">${esc(tr.date)} · ${tr.stops.length}곳</div></div>
        <button class="btn small" data-act="plan-append" data-trip="${esc(tr.id)}" data-tid="${esc(tid)}">여기에 추가</button>
      </div>`).join('')}</div>` : ''}
      <div class="grid2" style="margin-top:10px">
        <button class="btn ghost" data-act="close">닫기</button>
        <button class="btn" data-act="plan-new-with" data-tid="${esc(tid)}">+ 새 여행 계획 만들기</button>
      </div>
    </div>`);
  }

  // ---------- 모달 (화면 크기별: 모바일 하단 시트 · 데스크톱 중앙 대화상자) ----------
  function openModal(html) {
    const m = document.getElementById('modal');
    m.innerHTML = html; m.classList.remove('hidden');
    document.body.classList.add('modal-open');   // 배경 스크롤 잠금 — 시트가 화면 높이만큼만 스크롤되게
    const sheet = m.querySelector('.sheet');
    if (sheet) { sheet.setAttribute('tabindex', '-1'); sheet.focus({ preventScroll: true }); }
  }
  function closeModal() {
    const m = document.getElementById('modal');
    m.classList.add('hidden'); m.innerHTML = '';
    document.body.classList.remove('modal-open');
  }

  // ---------- 라우터 ----------
  function render() {
    const parts = (location.hash || '#/home').slice(2).split('/').map(decodeURIComponent);
    const [r, a, b] = parts;
    if (mapObj) { mapObj.remove(); mapObj = null; }
    let html, tab = r;
    // 화면(라우트)별 배치 규칙이 CSS에서 고를 수 있도록 태깅 — 넓은 화면에서 카드를 몇 열로 둘지 결정
    const route = String(r || 'home').toLowerCase().replace(/[^a-z-]/g, '');
    const WIDE_FLOW = ['home', 'missions', 'store', 'planner', 'journal', 'fengshui', 'explore', 'map', 'report', 'mind'];
    $view.dataset.route = route;
    $view.dataset.flow = WIDE_FLOW.includes(route) && a !== 'new' ? 'cards' : '';
    switch (r) {
      case 'explore': html = viewExplore(a, b); break;
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
      default: html = viewHome(); tab = 'home';
    }
    $view.innerHTML = html;
    document.querySelectorAll('.tabbar a').forEach(x => x.classList.toggle('on', x.dataset.tab === tab));
    updatePlusChip();
    MJAnalytics.track('page_view', { page: r || 'home' });
    if (r === 'story') MJAnalytics.track('story_open', { page: 'story', item: a });
    if (r === 'temple') MJAnalytics.track('temple_open', { page: 'temple', item: a });
    if (r === 'plus') MJAnalytics.track('paywall_view', { feature: 'plus_page' });
    if ('speechSynthesis' in window) speechSynthesis.cancel();
    if (r === 'map') { mapObj = initMap(a); }
    if (r === 'missions') { mapObj = initMap(null, 'pmap', true); }
    if (r === 'planner' && a === 'view') { const tr = (S.trips || []).find(x => x.id === b); if (tr) mapObj = initPlanMap(tr.stops); }
    if (r === 'explore' && a === 'all') bindTrad();
    if (r === 'journal' && a === 'new') bindJournalForm();
    if (r === 'planner' && a === 'new') bindPlannerForm();
    window.scrollTo(0, 0);
  }

  document.addEventListener('click', e => {
    const el = e.target.closest('[data-act],[data-mood],[data-f],[data-go]'); if (!el) return;
    if (el.dataset.go) { location.hash = el.dataset.go; return; }
    if (el.dataset.mood != null) { S.moodIdx = +el.dataset.mood; S.shift = 0; S.moodLog = (S.moodLog || []).filter(x => x.date !== today()).concat([{ date: today(), mood: S.moodIdx }]).slice(-60); save(); render(); return; }
    if (el.dataset.f != null) { document.querySelectorAll('#mapf .chip').forEach(c => c.classList.toggle('on', c === el)); if (mapObj && mapObj._draw) mapObj._draw(el.dataset.f); return; }
    const act = el.dataset.act;
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
      closeModal(); render(); toast('마음정원에 오신 것을 환영해요 🪷');
    }
    else if (act === 'paywall') openPaywall(el.dataset.feat);
    else if (act === 'gift-open') {
      openModal(`<div class="sheet"><h2>🎁 선물하기</h2><p>마음정원 플러스를 소중한 분에게 선물해 보세요.</p>
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
    else if (act === 'audio') playAudio(el.dataset.id);
    else if (act === 'reset') { if (confirm('방문·수첩 기록을 모두 지울까요? (이 기기에서만)')) { S.visits = []; S.journal = []; save(); render(); } }
    else if (act === 'trip-chk') {
      ensureDefaultTrips();
      const cid = el.dataset.id;
      S.tripChecks[cid] = !S.tripChecks[cid];
      save(); render();
    }
    else if (act === 'tpl-adopt') {
      const tpl = TRIP_TEMPLATES.find(x => x.id === el.dataset.id);
      if (!tpl) return;
      ensureDefaultTrips();
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
      draftStops = c.stops.slice();
      draftForm = {};
      draftCleared = false;
      toast(`「${c.name}」 사찰들을 여행 계획에 불러왔어요`);
      location.hash = '#/planner/new';
    }
    else if (act === 'draft-add') {
      const sel = document.getElementById('addTempleSelect');
      if (!sel || !sel.value) return;
      if (draftStops.includes(sel.value)) { toast('이미 코스에 포함된 사찰이에요.'); return; }
      draftStops.push(sel.value);
      render();
    }
    else if (act === 'draft-rm') {
      const idx = +el.dataset.idx;
      draftStops.splice(idx, 1);
      if (!draftStops.length) draftCleared = true; // 직접 모두 비운 경우 예시 사찰을 다시 채우지 않음
      render();
    }
    else if (act === 'draft-up') {
      const idx = +el.dataset.idx;
      if (idx > 0) { const tmp = draftStops[idx - 1]; draftStops[idx - 1] = draftStops[idx]; draftStops[idx] = tmp; render(); }
    }
    else if (act === 'draft-down') {
      const idx = +el.dataset.idx;
      if (idx < draftStops.length - 1) { const tmp = draftStops[idx + 1]; draftStops[idx + 1] = draftStops[idx]; draftStops[idx] = tmp; render(); }
    }
    else if (act === 'draft-optimize') {
      optimizeDraftOrder();
    }
    else if (act === 'tpl-theme') {
      const theme = el.dataset.theme || 'all';
      location.hash = '#/planner/theme/' + encodeURIComponent(theme);
    }
    else if (act === 'draft-reset') {
      resetPlannerDraft();
    }
    else if (act === 'trip-del') {
      ensureDefaultTrips();
      S.trips = S.trips.filter(x => x.id !== el.dataset.id);
      save();
      toast('여행 계획을 삭제했어요.');
      location.hash = '#/planner';
    }
    else if (act === 'plan-pick') {
      openPlanPickModal(el.dataset.id);
    }
    else if (act === 'plan-new-with') {
      const tid = el.dataset.tid;
      draftStops = [tid];
      draftForm = {};
      draftCleared = false;
      closeModal();
      location.hash = '#/planner/new/' + encodeURIComponent(tid);
    }
    else if (act === 'plan-append') {
      ensureDefaultTrips();
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
  });
  document.getElementById('modal').addEventListener('click', e => { if (e.target.id === 'modal') closeModal(); });
  // 웹(키보드)에서는 Esc로도 닫는다 — 하단 시트를 쓰는 모바일과 동일하게 종료 경로 보장
  document.addEventListener('keydown', e => {
    if (e.key !== 'Escape') return;
    const m = document.getElementById('modal');
    if (m.classList.contains('hidden')) return;
    clearInterval(openAd._t); closeModal();
  });

  function updatePlusChip() { const c = document.getElementById('plusChip'); if (!c) return; const ps = plusState(); c.textContent = ps.on ? (ps.trial ? `✨ 체험 ${ps.left}일` : '✨ 플러스 이용 중') : '✨ 플러스'; }
  const bt = document.getElementById('bigToggle');
  function applyBig() { document.body.classList.toggle('big', !!S.big); bt.setAttribute('aria-pressed', !!S.big); bt.textContent = S.big ? '가 큰글씨 켜짐' : '가 큰글씨'; }
  bt.addEventListener('click', () => { S.big = !S.big; save(); applyBig(); render(); toast(S.big ? '큰 글씨·간편 모드를 켰어요' : '기본 모드로 돌아왔어요'); });
  applyBig();
  window.addEventListener('hashchange', () => { clearInterval(openAd._t); closeModal(); render(); });
  render();
})();

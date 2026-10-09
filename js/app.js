/* 마음정원 MVP — vanilla JS SPA (hash router + localStorage) */
(function () {
  'use strict';
  const TEMPLES = window.TEMPLES, THEMES = window.THEMES, LL = window.LIST_LABELS;
  const YT_SRC = window.YT_SOURCE || { name: '', url: '#', host: '' };
  const byId = Object.fromEntries(TEMPLES.map(t => [t.id, t]));
  const KEY = 'maeumjeongwon.v1';
  const $view = document.getElementById('view');

  // ---------- 상태 ----------
  const defaults = { visits: [], journal: [], big: false, moodIdx: 0, plus: null, plan: 'yearly', packs: [], offline: [] };
  let S;
  try { S = Object.assign({}, defaults, JSON.parse(localStorage.getItem(KEY) || '{}')); } catch (e) { S = Object.assign({}, defaults); }
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
    yearly: { name: '연간', price: '연 39,000원', sub: '월 3,250원꼴 · 월간 대비 34% 절약', best: '추천' }
  };
  const ONE_TIME = [
    { id: 'pack-autumn2026', icon: '🍁', name: '2026 가을 단풍 한정 스탬프팩', price: '2,900원', desc: '10~11월 단풍 사찰 방문 시 한정 스탬프·배지' },
    { id: 'audio-gwaneum', icon: '🎧', name: '4대 관음기도 도량 오디오 코스', price: '4,900원', desc: '전해지는 이야기·관람 동선 오디오 (전문가 감수 후 제작 예정)' }
  ];
  const PLUS_BENEFITS = [
    ['사찰 탐색·지도·전통사찰 991곳 검색', true, true],
    ['GPS 방문 인증·기본 스탬프·108 염주·등급·도감', true, true],
    ['기본 전설 1편 · 기도 안내·예절 · 출처', true, true],
    ['사찰 수첩 (이 기기 저장)', true, true],
    ['전설·풍수 심화 이야기 전체', false, true],
    ['🎧 이야기 오디오 듣기', false, true],
    ['테마 순례 코스 일정표 (동선·직선거리·미션 연계)', false, true],
    ['⬇ 오프라인 저장 (산중 통신 불안 대비)', false, true],
    ['계절 한정 스탬프 (가을 단풍 등)', false, true],
    ['광고 없음 (무료판에도 광고는 넣지 않을 예정)', true, true]
  ];
  const FEAT = {
    legend: { t: '전설 심화 이야기', d: '사찰마다 전해지는 이야기를 모두 읽을 수 있어요.' },
    fengshui: { t: '풍수 심화 이야기', d: '영상·자료에서 정리한 풍수 해설 전체를 볼 수 있어요.' },
    audio: { t: '이야기 오디오', d: '걸으면서 전해지는 이야기를 귀로 들어요.' },
    offline: { t: '오프라인 저장', d: '산속처럼 통신이 약한 곳에서도 사찰 정보를 볼 수 있어요.' },
    course: { t: '테마 순례 코스', d: '동선 순서·구간별 직선거리·함께 채워지는 미션을 한눈에 봐요.' },
    season: { t: '계절 한정 스탬프', d: '계절마다 그때만 받을 수 있는 스탬프를 모아요.' },
    general: { t: '마음정원 플러스', d: '심화 이야기·오디오·코스·오프라인 저장을 모두 이용해요.' }
  };
  function plusState() {
    const p = S.plus; if (!p) return { on: false };
    if (p.status === 'trial') {
      const used = Math.floor((Date.now() - new Date(p.start).getTime()) / 86400000);
      const left = 7 - used;
      if (left <= 0) return { on: false, expired: true };
      return { on: true, trial: true, left, plan: p.plan };
    }
    return { on: true, plan: p.plan };
  }
  const isPlus = () => plusState().on;
  function lockBlock(feat, previewHtml) {
    const f = FEAT[feat] || FEAT.general;
    return `<div class="locked"><div class="preview">${previewHtml || ''}</div>
      <div class="lockbar"><span>🔒 <b>${f.t}</b>는 플러스에서 이어서 볼 수 있어요</span><button class="btn small" data-act="paywall" data-feat="${feat}">7일 무료 체험</button></div></div>`;
  }
  const LEGAL = `<ul class="legal" style="padding-left:22px">
      <li>🧪 <b>데모 화면</b>이에요. 지금은 실제 결제가 일어나지 않아요.</li>
      <li>출시 후 구독은 해지하기 전까지 선택한 주기(월/연)마다 <b>자동 갱신</b>되며, 갱신일 24시간 전까지 앱 마켓 구독 관리에서 해지할 수 있어요.</li>
      <li>7일 무료 체험이 끝나도 <b>별도 동의 없이 유료로 넘어가지 않아요.</b> 체험→유료 전환이나 가격 인상 때는 전환 30일 이내에 일시·변동 전후 가격·결제 방법을 알리고 다시 동의를 받아요.</li>
      <li>해지는 가입만큼 쉽게 — 설정 &gt; 구독 관리에서 한 번에 할 수 있게 만들 예정이에요.</li>
      <li>청약철회·환불은 전자상거래법과 앱 마켓 정책을 따르며, 출시 전 법률 검토를 거쳐 확정해요.</li>
    </ul>`;
  function planCards() {
    return `<div class="plans">${Object.entries(PLANS).map(([k, p]) => `<button class="plan ${S.plan === k ? 'on' : ''}" data-act="plan" data-plan="${k}">${p.best ? `<span class="best">${p.best}</span>` : ''}<div class="sub">${p.name}</div><div class="price">${p.price}</div><div class="sub" style="font-size:.78em">${p.sub}</div></button>`).join('')}</div>`;
  }
  function openPaywall(feat) {
    const f = FEAT[feat] || FEAT.general, ps = plusState();
    openModal(`<div class="sheet"><div class="row between"><h2 style="margin:0">✨ ${f.t}</h2><span class="demo-ribbon">데모</span></div>
      <p>${f.d}</p>
      <ul style="padding-left:18px;margin:6px 0">${PLUS_BENEFITS.filter(b => !b[1]).map(b => `<li>${b[0]}</li>`).join('')}</ul>
      ${planCards()}
      ${ps.expired ? '<p class="notice">체험 기간이 끝났어요. 계속 이용하려면 아래에서 직접 선택해 주세요. (자동으로 결제되지 않았어요)</p>' : ''}
      <div class="grid2" style="margin-top:6px"><button class="btn ghost" data-act="close">무료로 계속하기</button><button class="btn" data-act="trial-start">${ps.expired ? '플러스 시작 (데모)' : '7일 무료 체험 (데모)'}</button></div>
      ${LEGAL}
      <p class="sub" style="text-align:center;margin:8px 0 0"><a href="#/plus" data-act="close">요금제·혜택 자세히 보기</a></p></div>`);
  }
  function viewPlus() {
    const ps = plusState();
    const status = ps.on ? (ps.trial ? `<div class="statusbar trial">🧪 데모 무료 체험 중 · <b>${ps.left}일</b> 남음 (${PLANS[ps.plan || 'yearly'].price} 선택). 체험이 끝나도 자동 결제되지 않아요.</div>` : `<div class="statusbar">🧪 데모 플러스 이용 중 (${PLANS[ps.plan || 'yearly'].price})</div>`)
      : (ps.expired ? '<div class="statusbar trial">체험이 끝났어요. 동의 없이 결제되지 않았어요.</div>' : '');
    return `<h1>마음정원 플러스 <span class="demo-ribbon">데모 · 실제 결제 없음</span></h1>
    ${status}
    <section class="card hero"><p style="margin:0 0 6px"><b>순례·지도·스탬프는 계속 무료</b>예요. 플러스는 더 깊은 이야기와 여행 도구를 원하는 분을 위한 선택이에요.</p>
      ${planCards()}
      <div class="grid2">${ps.on ? `<button class="btn ghost" data-act="plus-off">구독 해지 (데모)</button><a class="btn ghost" style="text-align:center;text-decoration:none" href="#/explore/theme/wish">기도처 둘러보기</a>` : `<button class="btn ghost" data-act="plus-on">🧪 바로 플러스 켜기</button><button class="btn" data-act="trial-start">7일 무료 체험 (데모)</button>`}</div>
      ${LEGAL}</section>
    <section class="card"><h2>무료 vs 플러스</h2><table class="cmp"><tr><th>기능</th><th>무료</th><th>플러스</th></tr>
      ${PLUS_BENEFITS.map(b => `<tr><td>${b[0]}</td><td>${b[1] ? '✅' : '—'}</td><td>${b[2] ? '✅' : '—'}</td></tr>`).join('')}</table></section>
    <section class="card"><h2>단품 구매 (데모)</h2><p class="sub">구독 없이 필요한 것만 살 수 있어요.</p>
      <div class="tlist">${ONE_TIME.map(o => `<div class="titem"><div class="seal" style="background:var(--gold)">${o.icon}</div><div class="meta" style="flex:1"><b>${o.name}</b><div class="sub">${o.desc}</div></div>${S.packs.includes(o.id) || isPlus() ? '<span class="tag ok">이용 가능</span>' : `<button class="btn small" data-act="buy" data-id="${o.id}">${o.price}</button>`}</div>`).join('')}</div>
      <p class="notice" style="margin-top:8px">단품은 1회 결제(자동 갱신 없음)예요. 데모에서는 누르면 바로 '보유'로 표시돼요.</p></section>
    <section class="card"><h2>템플스테이·숙소 예약</h2><p>템플스테이는 <a href="https://www.templestay.com" target="_blank" rel="noopener">공식 통합 예약 사이트</a>로 연결해요. 제휴가 맺어지면 예약 수수료로 운영비를 마련할 계획이고, 이용자 가격은 같아요.</p>
      <p class="sub">굿즈: 108 염주 완성 시 실물 염주·사찰 수첩 등 (사찰·작가 협업, 출시 전 검토)</p></section>
    <p class="notice">🙏 마음정원은 신앙을 판매하지 않아요. 기도 안내·예절·출처는 언제나 무료이고, 소원 성취나 효험을 약속하는 상품은 만들지 않아요.</p>`;
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
    if (!isPlus()) return `<div class="course">${head}${lockBlock('course', `<ol>${c.plan.map(x => `<li>${esc(x)}</li>`).join('')}</ol>`)}</div>`;
    return `<div class="course">${head}<ol>${c.plan.map(x => `<li>${esc(x)}</li>`).join('')}</ol>
      <div class="sub">순서대로 구간 직선거리: ${legs.map((d, i) => `${esc(stops[i].name)}→${esc(stops[i + 1].name)} 약 ${d}km`).join(' · ')} <br>(실제 이동 시간은 길찾기로 확인하세요)</div>
      ${ms.length ? `<div class="sub" style="margin-top:4px">🏅 함께 채워지는 미션: ${ms.map(m => m.icon + ' ' + m.name).join(', ')}</div>` : ''}
      <div class="sub" style="margin-top:4px">${esc(c.note)}</div>
      <div class="row wrap" style="margin-top:6px">${stops.map(t => `<a class="chip" style="text-decoration:none" href="#/temple/${t.id}">${esc(t.name)}</a>`).join('')}</div></div>`;
  }

  // ---------- 계절 한정 스탬프 ----------
  const SEASON = { id: 'pack-autumn2026', name: '2026 가을 단풍 한정 스탬프', from: '2026-10-01', to: '2026-11-30', theme: 'autumn' };
  function seasonCard() {
    const pool = TEMPLES.filter(t => t.themes.includes(SEASON.theme));
    const got = new Set(S.visits.filter(v => v.date.slice(0, 10) >= SEASON.from && v.date.slice(0, 10) <= SEASON.to && pool.some(t => t.id === v.tid)).map(v => v.tid));
    const owned = isPlus() || S.packs.includes(SEASON.id);
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
    for (let i = 0; i < 108; i++) { const a = (i / 108) * Math.PI * 2 - Math.PI / 2; const x = c + R * Math.cos(a), y = c + R * Math.sin(a); out.push(`<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${(size / 70).toFixed(1)}" fill="${i < n ? '#8a5a2b' : '#e3d8c4'}" stroke="${i < n ? '#5e3b19' : '#d4c7ae'}" stroke-width="0.8"/>`); }
    return `<svg class="beads" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" role="img" aria-label="디지털 염주 ${n}/108">${out.join('')}
      <text x="${c}" y="${c - 4}" text-anchor="middle" font-size="${size / 7}" font-family="Noto Serif CJK KR,serif" fill="#2f2a24">${n}</text>
      <text x="${c}" y="${c + size / 9}" text-anchor="middle" font-size="${size / 16}" fill="#7a6f62">/ 108 알</text></svg>`;
  }

  // ---------- 화면: 홈 ----------
  function viewHome() {
    const v = visited(), g = gradeInfo(v.size);
    const mi = S.moodIdx || 0; const t = prescribe(mi, S.shift || 0);
    const near = MISSIONS.filter(m => m.ids).map(m => ({ m, p: missionProgress(m) })).filter(x => x.p.done < x.p.total).sort((a, b) => (a.p.total - a.p.done) - (b.p.total - b.p.done))[0];
    const top = ['bulguksa', 'naksansa', 'tongdosa'].map(id => byId[id]);
    return `
    <section class="card hero">
      <div class="sub">${g.cur ? `현재 등급` : '순례를 시작해 보세요'}</div>
      <div class="row between"><div class="grade">${g.cur ? g.cur.name : '첫걸음 전'}</div><div class="sub">염주 ${beads()}/108</div></div>
      <div class="row between" style="margin-top:8px"><b>도감 ${v.size}/100</b><span class="sub">${g.next ? `다음 ${g.left}곳이면 '${g.next.name}' 등급!` : '회향 완성 🙏'}</span></div>
      <div class="progress" style="margin-top:6px"><i style="width:${Math.min(100, v.size)}%"></i></div>
      ${near ? `<p class="sub" style="margin:10px 0 0">${near.m.icon} ${near.m.name.replace(/ 완주| 순례/, '')} 완주까지 <b>${near.p.total - near.p.done}곳</b> 남았어요</p>` : ''}
    </section>
    <section class="card">
      <h2>오늘의 마음 처방전</h2>
      <p class="sub">지금 기분을 골라 보세요. 어울리는 사찰과 이야기를 골라 드려요.</p>
      <div class="moods">${MOODS.map((m, i) => `<button class="mood ${i === mi ? 'on' : ''}" data-mood="${i}"><span>${m.icon}</span>${m.label}</button>`).join('')}</div>
      <div class="card legend" style="margin:12px 0 0">
        <div class="row between"><span class="lbl">처방</span><button class="btn ghost small" data-act="reshuffle">다른 곳 추천</button></div>
        <p style="margin:8px 0">${esc(MOODS[mi].line)}</p>
        <h3 style="margin:4px 0">${esc(t.name)} <span class="sub">${esc(t.sido)} ${esc(t.sgg)}</span></h3>
        ${t.legend ? `<p class="sub" style="margin:4px 0">📖 전해지는 이야기 — 「${esc(t.legend.title)}」</p>` : ''}
        <a class="btn small" href="#/temple/${t.id}" style="display:inline-block;text-decoration:none;margin-top:6px">이야기 열기 →</a>
      </div>
    </section>
    ${isPlus() ? '' : `<a class="card plusbanner simple-hide" href="#/plus"><span style="font-size:1.6em">✨</span><span><b>마음정원 플러스</b> <span class="demo-ribbon">데모</span><br><span class="sub">심화 이야기·오디오·순례 코스·오프라인 저장 · 7일 무료 체험</span></span></a>`}
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
      <p class="sub">${THEMES[cur].desc}</p>${cur === 'wish' || cur === 'energy' || cur === 'fengshui' ? '<p class="notice">이야기로 전해 내려오는 내용이며 효험을 보장하지 않아요.</p>' : ''}
      ${themeBody(cur)}`;
    } else if (tab === 'region') {
      const sidos = SIDO_ORDER.filter(s => TEMPLES.some(t => t.sido === s));
      const cur = arg || sidos[0];
      body = `<div class="tabs">${sidos.map(s => `<a class="chip ${s === cur ? 'on' : ''}" style="text-decoration:none" href="#/explore/region/${encodeURIComponent(s)}">${s} ${TEMPLES.filter(t => t.sido === s).length}</a>`).join('')}</div>
      <div class="tlist">${TEMPLES.filter(t => t.sido === cur).map(t => templeItem(t, esc(t.mountain))).join('')}</div>`;
    } else {
      body = `<p class="sub">첨부 자료 「전통사찰 현황」(2026.6.1. 현재) 991곳 전체 목록이에요. 상세 이야기는 순차 추가 예정이에요.</p>
      <div class="row"><input id="tq" placeholder="사찰명·주소 검색 (예: 보광사, 경주)" value="${esc(arg || '')}" /><select id="ts" style="max-width:110px"><option value="">전체</option>${SIDO_ORDER.map(s => `<option>${s}</option>`).join('')}</select></div>
      <div id="tres" style="margin-top:10px"></div>`;
    }
    return `<h1>사찰 탐색</h1><div class="tabs">${tabs.map(([k, n]) => `<a class="chip ${k === tab ? 'on' : ''}" style="text-decoration:none" href="#/explore/${k}">${n}</a>`).join('')}</div>${body}`;
  }

  function themeBody(cur) {
    const list = TEMPLES.filter(t => t.themes.includes(cur));
    const courses = COURSES.filter(c => c.theme === cur);
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
      ${rest.length ? `<h2>함께 보기 <span class="sub">${rest.length}곳</span></h2><p class="sub" style="font-size:.85em">풍수 유튜브 영상 속 견해 등으로 분류된 곳이에요.</p><div class="tlist">${rest.map(t => templeItem(t)).join('')}</div>` : ''}`;
  }
  function bindTrad() {
    const q = document.getElementById('tq'); if (!q) return; const s = document.getElementById('ts'); const out = document.getElementById('tres');
    const names = Object.fromEntries(TEMPLES.map(t => [t.addr, t.id]));
    function run() {
      const k = q.value.trim(), sd = s.value;
      const rows = window.TRADITIONAL_TEMPLES.filter(r => (!sd || r[1] === sd) && (!k || r[4].includes(k) || r[3].includes(k)));
      out.innerHTML = `<p class="sub">${rows.length}곳${rows.length > 80 ? ' (앞 80곳 표시)' : ''}</p><div class="tlist">` + rows.slice(0, 80).map(r => {
        const id = names[r[3]];
        return `<${id ? `a href="#/temple/${id}"` : 'div'} class="titem"><div class="seal ${id ? '' : 'off'}">${esc(r[4].charAt(0))}</div><div class="meta"><b>${esc(r[4])} ${id ? '<span class="tag ok">상세 있음</span>' : ''}</b><div class="sub">${esc(r[3])}</div><div class="sub">${esc(r[5])} · No.${r[0]}</div></div></${id ? 'a' : 'div'}>`;
      }).join('') + '</div>';
    }
    q.addEventListener('input', run); s.addEventListener('change', run); run();
  }

  // ---------- 화면: 사찰 상세 ----------
  const ETIQUETTE = ['법당 정면 가운데 문(어간문)은 피하고 옆문으로 드나들어요.', '예불·기도 중에는 촬영과 큰 소리를 삼가요.', '"촬영 금지" 표시가 있는 곳은 반드시 지켜 주세요.', '노출이 심한 옷은 피하고, 법당에서는 모자를 벗어요.', '스님·수행 공간(선원 등) 출입 제한 구역에 들어가지 않아요.', '개방 시간 외 야간 방문과 무리한 산행은 삼가요.'];
  function viewTemple(id) {
    const t = byId[id]; if (!t) return `<p>사찰을 찾을 수 없어요.</p>`;
    const vs = S.visits.filter(v => v.tid === id);
    return `
    <a href="javascript:history.back()" class="sub" style="text-decoration:none">← 뒤로</a>
    <section class="card hero" style="margin-top:8px">
      <div class="row between"><div><h1 style="margin:0">${esc(t.name)}</h1><div class="sub">${esc(t.hanja)} · ${esc(t.mountain)}</div></div>
      <div class="seal ${vs.length ? '' : 'off'}" style="flex-basis:56px;height:56px">${sealChar(t)}</div></div>
      <div style="margin-top:6px">${t.lists.map(l => `<span class="tag">${LL[l]}</span>`).join('')}${t.themes.map(th => `<span class="tag">${THEMES[th].icon} ${THEMES[th].name}</span>`).join('')}</div>
      ${vs.length ? `<p class="sub" style="margin:8px 0 0">✅ ${vs.length}회 방문 · 최근 ${fmtDate(vs[vs.length - 1].date)}${vs.some(x => x.method === 'demo') ? ' (데모 포함)' : ''}</p>` : ''}
      <div class="grid2" style="margin-top:12px">
        <button class="btn" data-act="gps" data-id="${id}">📍 GPS 방문 인증</button>
        <button class="btn ghost" data-act="demo" data-id="${id}">🧪 데모 체크인(테스트)</button>
        <a class="btn ghost" style="text-align:center;text-decoration:none" href="#/journal/new/${id}">📔 수첩 쓰기</a>
        <a class="btn ghost" style="text-align:center;text-decoration:none" href="#/map/${id}">🗺️ 지도</a>
      </div>
      <div class="grid2" style="margin-top:8px"><button class="btn ghost" data-act="offline" data-id="${id}">${S.offline.includes(id) && isPlus() ? '✅ 오프라인 저장됨' : '⬇ 오프라인 저장' + (isPlus() ? '' : ' 🔒')}</button>
        <a class="btn ghost" style="text-align:center;text-decoration:none" href="https://www.templestay.com" target="_blank" rel="noopener">🛏 템플스테이 찾기</a></div>
      <p class="sub" style="margin:8px 0 0;font-size:.8em">GPS 인증 반경 ${t.radius}m · 하루 1회</p>
    </section>
    <section class="card"><h2>한눈에 보기</h2><dl class="kv">
      <dt>종단</dt><dd>${esc(t.order)}</dd><dt>소재지</dt><dd>${esc(t.addr)}</dd><dt>창건</dt><dd>${esc(t.founded)}</dd>
      <dt>대표 문화재</dt><dd>${t.treasures.map(esc).join('<br>')}</dd><dt>관람 소요</dt><dd>${val(t.duration)}</dd></dl></section>
    <section class="card"><h2>기원·역사</h2><ul class="timeline">${t.timeline.map(([y, d]) => `<li><b>${esc(y)}</b>${esc(d)}</li>`).join('')}</ul></section>
    ${(t.legend || (t.legends && t.legends.length)) ? `<section class="card legend"><div class="row between"><span class="lbl">전해지는 이야기</span><button class="btn ghost small" data-act="audio" data-id="${id}">🎧 듣기${isPlus() ? '' : ' 🔒'}</button></div>
      ${legendsHtml(t)}
      <p class="sub" style="font-size:.8em">설화·전승은 역사적 사실과 다를 수 있으며 효험을 보장하지 않습니다. (전문가 감수 예정)</p></section>` : ''}
    ${prayerHtml(t)}
    ${t.viewpoints && t.viewpoints.length ? `<section class="card"><h2>관람 포인트</h2><ul style="padding-left:18px;margin:0">${t.viewpoints.map(v => `<li style="margin-bottom:4px">${esc(v)}</li>`).join('')}</ul></section>` : ''}
    ${t.fengshui && t.fengshui.length ? `<section class="card legend"><span class="lbl">풍수 이야기 · 전해지는 이야기</span><ul style="padding-left:18px;margin:8px 0 0">${(isPlus() ? t.fengshui : t.fengshui.slice(0, 1)).map(v => `<li style="margin-bottom:4px">${esc(v)}</li>`).join('')}</ul>${!isPlus() && t.fengshui.length > 1 ? lockBlock('fengshui', `<ul style="padding-left:18px;margin:0">${t.fengshui.slice(1).map(v => `<li>${esc(v)}</li>`).join('')}</ul>`) : ''}
      <p class="sub" style="font-size:.8em">풍수 해석은 영상 제작자의 개인 견해이자 전해지는 이야기예요. 효험이나 결과를 보장하지 않아요.</p></section>` : ''}
    <section class="card"><h2>관람 가이드 · 예절</h2><p>💡 ${esc(t.tip)}</p><ul style="padding-left:18px;margin:6px 0">${ETIQUETTE.map(e => `<li>${e}</li>`).join('')}</ul></section>
    <section class="card"><h2>방문 실용정보</h2><dl class="kv">
      <dt>주차</dt><dd>${val(t.practical.parking)}</dd><dt>입장료</dt><dd>${val(t.practical.fee)}</dd><dt>개방시간</dt><dd>${val(t.practical.hours)}</dd>
      <dt>대중교통</dt><dd>${val(t.practical.transit)}</dd><dt>템플스테이</dt><dd>${val(t.practical.templestay)}</dd><dt>좌표</dt><dd>${t.lat.toFixed(5)}, ${t.lng.toFixed(5)}</dd></dl>
      <p class="notice" style="margin-top:8px">방문 전 사찰·국립공원 공지에서 개방시간·통제 여부를 꼭 확인하세요.</p></section>
    ${t.videos && t.videos.length ? `<section class="card" id="ref-videos"><h2>▶ 참고 영상</h2><ul class="vlist" style="padding-left:0;margin:0;list-style:none">${t.videos.map(v => `<li style="margin:0 0 10px"><a href="https://www.youtube.com/watch?v=${encodeURIComponent(v.id)}" target="_blank" rel="noopener">${esc(v.title)}</a><div class="sub" style="font-size:.85em">${esc((v.date || '').replace(/-/g, '.'))}${v.note ? ' · ' + esc(v.note) : ''}</div></li>`).join('')}</ul>
      <p class="sub" style="font-size:.8em;margin:4px 0 0">출처: YouTube <a href="${YT_SRC.url}" target="_blank" rel="noopener">${esc(YT_SRC.name)}</a> (${esc(YT_SRC.host)}). 영상 내용을 요약했으며, 사찰의 공식 입장이 아니에요.</p></section>` : ''}
    ${t.verify.length ? `<section class="card"><h2>확인 필요 항목</h2><ul style="padding-left:18px;margin:0">${t.verify.map(v => `<li class="needs">${esc(v)}</li>`).join('')}</ul></section>` : ''}
    <p class="notice">자료: 주소·종단 = 「전통사찰 현황」(2026.6.1.) · 좌표 = OpenStreetMap · 연혁 = 공개 자료 요약(감수 전)${t.videos && t.videos.length ? ' · 영상 보강 = 유튜브 풍생풍사TV' : ''}${t.prayer ? ' · 기도 안내 = 언론·백과사전·지자체·사찰 공식 자료(위 출처)' : ''}</p>`;
  }


  function legendsHtml(t) {
    const all = [t.legend].concat(t.legends || []).filter(Boolean);
    const one = l => `<h2 style="margin-top:8px">${esc(l.title)}</h2><p>${esc(l.text)}</p>`;
    if (isPlus() || all.length <= 1) return all.map(one).join('');
    return one(all[0]) + lockBlock('legend', all.slice(1).map(l => `<b>${esc(l.title)}</b> ${esc(l.text)}`).join('<br>')) + `<p class="sub" style="font-size:.8em;margin:6px 0 0">이 사찰에는 이야기가 ${all.length}편 있어요. 첫 편은 누구나 무료예요.</p>`;
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
    const after = visited().size, g1 = gradeInfo(after).cur;
    const t = byId[tid]; const completed = MISSIONS.filter(m => m.ids && m.ids.includes(tid)).filter(m => { const p = missionProgress(m); return p.done === p.total; });
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
    const t = byId[tid];
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
    ${seasonCard()}
    <section class="card"><div class="row between"><h2>도감 ${v.size}/100</h2><a class="sub" href="#/dex">전체 보기 →</a></div>
      <div class="dex">${dexCells(10)}</div></section>
    <section class="card"><h2>순례 지도</h2><p class="sub">방문한 지역이 색칠돼요.</p>
      <div class="tilemap">${TILE.flat().map(s => { if (!s) return '<div class="empty"></div>'; const n = sidoCount(s), tot = TEMPLES.filter(t => t.sido === s).length; const lv = n === 0 ? '' : n >= 3 ? 'l3' : 'l' + n; return `<div class="${lv}">${s}<br>${n}/${tot}</div>`; }).join('')}</div>
      <div id="pmap" style="margin-top:10px"></div></section>
    <section class="card simple-hide"><h2>방문 기록</h2>${S.visits.length ? `<div class="tlist">${S.visits.slice().reverse().slice(0, 20).map(x => templeItem(byId[x.tid], fmtDate(x.date) + (x.method === 'demo' ? ' · 🧪데모' : ' · 📍GPS'))).join('')}</div>` : '<p class="sub">아직 방문 기록이 없어요.</p>'}
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
    return `<div class="row between"><h1>사찰 수첩</h1><a class="btn small" style="text-decoration:none" href="#/journal/new/">+ 기록</a></div>
      <p class="sub">사진·날씨·다짐을 남겨 두면 나중에 \'1년 전 오늘\'로 다시 만나요. (이 기기에만 저장)</p>
      ${list.length ? list.map(j => { const t = byId[j.tid]; return `<article class="card jentry"><div class="row between"><b>${t ? esc(t.name) : '기타'}</b><span class="sub">${fmtDate(j.date)} ${esc(j.weather || '')}</span></div><p style="white-space:pre-wrap;margin:6px 0">${esc(j.note)}</p>${j.photo ? `<img src="${j.photo}" alt="${t ? esc(t.name) : ''} 사진">` : ''}<div class="row" style="margin-top:8px"><button class="btn ghost small" data-act="jdel" data-id="${j.id}">삭제</button></div></article>`; }).join('') : '<div class="card"><p>아직 기록이 없어요. 첫 사찰 수첩을 남겨 보세요 📔</p></div>'}`;
  }
  function viewJournalNew(tid) {
    return `<a href="#/journal" class="sub" style="text-decoration:none">← 수첩</a><h1>수첩 쓰기</h1>
    <form id="jform" class="card">
      <label>사찰</label><select name="tid">${TEMPLES.map(t => `<option value="${t.id}" ${t.id === tid ? 'selected' : ''}>${esc(t.name)}</option>`).join('')}</select>
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

  // ---------- 모달 ----------
  function openModal(html) { const m = document.getElementById('modal'); m.innerHTML = html; m.classList.remove('hidden'); }
  function closeModal() { const m = document.getElementById('modal'); m.classList.add('hidden'); m.innerHTML = ''; }

  // ---------- 라우터 ----------
  function render() {
    const parts = (location.hash || '#/home').slice(2).split('/').map(decodeURIComponent);
    const [r, a, b] = parts;
    if (mapObj) { mapObj.remove(); mapObj = null; }
    let html, tab = r;
    switch (r) {
      case 'explore': html = viewExplore(a, b); break;
      case 'temple': html = viewTemple(a); tab = 'explore'; break;
      case 'map': html = viewMap(); break;
      case 'missions': html = viewMissions(); break;
      case 'dex': html = viewDex(); tab = 'missions'; break;
      case 'journal': html = a === 'new' ? viewJournalNew(b) : viewJournal(); break;
      case 'plus': html = viewPlus(); tab = 'plus'; break;
      default: html = viewHome(); tab = 'home';
    }
    $view.innerHTML = html;
    document.querySelectorAll('.tabbar a').forEach(x => x.classList.toggle('on', x.dataset.tab === tab));
    updatePlusChip();
    if ('speechSynthesis' in window) speechSynthesis.cancel();
    if (r === 'map') { mapObj = initMap(a); }
    if (r === 'missions') { mapObj = initMap(null, 'pmap', true); }
    if (r === 'explore' && a === 'all') bindTrad();
    if (r === 'journal' && a === 'new') bindJournalForm();
    window.scrollTo(0, 0);
  }

  document.addEventListener('click', e => {
    const el = e.target.closest('[data-act],[data-mood],[data-f],[data-go]'); if (!el) return;
    if (el.dataset.go) { location.hash = el.dataset.go; return; }
    if (el.dataset.mood != null) { S.moodIdx = +el.dataset.mood; S.shift = 0; save(); render(); return; }
    if (el.dataset.f != null) { document.querySelectorAll('#mapf .chip').forEach(c => c.classList.toggle('on', c === el)); if (mapObj && mapObj._draw) mapObj._draw(el.dataset.f); return; }
    const act = el.dataset.act;
    if (act === 'reshuffle') { S.shift = (S.shift || 0) + 1; save(); render(); }
    else if (act === 'gps') gpsCheckin(el.dataset.id);
    else if (act === 'demo') demoCheckin(el.dataset.id);
    else if (act === 'demo-ok') { closeModal(); addVisit(el.dataset.id, 'demo', null); }
    else if (act === 'close') { closeModal(); if (el.tagName !== 'A') render(); }
    else if (act === 'locate' && mapObj) { mapObj.locate({ setView: true, maxZoom: 11 }); mapObj.once('locationfound', ev => L.circleMarker(ev.latlng, { radius: 8, color: '#2b6cb0' }).addTo(mapObj).bindPopup('내 위치').openPopup()); mapObj.once('locationerror', () => toast('위치를 가져오지 못했어요.')); }
    else if (act === 'jdel') { if (confirm('이 기록을 삭제할까요?')) { S.journal = S.journal.filter(j => j.id !== el.dataset.id); save(); render(); } }
    else if (act === 'paywall') openPaywall(el.dataset.feat);
    else if (act === 'plan') { S.plan = el.dataset.plan; save(); document.querySelectorAll('.plan').forEach(x => x.classList.toggle('on', x.dataset.plan === S.plan)); }
    else if (act === 'trial-start') { const ex = plusState().expired; S.plus = ex ? { status: 'plus', start: new Date().toISOString(), plan: S.plan } : { status: 'trial', start: new Date().toISOString(), plan: S.plan }; save(); closeModal(); render(); toast(ex ? '🧪 데모: 플러스를 시작했어요 (실제 결제 없음)' : '🧪 데모: 7일 무료 체험을 시작했어요. 자동 결제되지 않아요.'); }
    else if (act === 'plus-on') { S.plus = { status: 'plus', start: new Date().toISOString(), plan: S.plan }; save(); render(); toast('🧪 데모: 플러스를 켰어요 (실제 결제 없음)'); }
    else if (act === 'plus-off') { if (confirm('구독을 해지할까요? (데모 — 무료 기능과 기록은 그대로 남아요)')) { S.plus = null; save(); render(); toast('해지했어요. 순례 기록은 그대로예요.'); } }
    else if (act === 'buy') { if (!S.packs.includes(el.dataset.id)) S.packs.push(el.dataset.id); save(); render(); toast('🧪 데모: 단품을 보유 목록에 넣었어요 (실제 결제 없음)'); }
    else if (act === 'offline') { if (!isPlus()) openPaywall('offline'); else { if (!S.offline.includes(el.dataset.id)) S.offline.push(el.dataset.id); save(); render(); toast('이 기기에 저장해 두었어요 (데모: 앱 출시 때 실제 오프라인 캐시로 구현)'); } }
    else if (act === 'audio') playAudio(el.dataset.id);
    else if (act === 'reset') { if (confirm('방문·수첩 기록을 모두 지울까요? (이 기기에서만)')) { S.visits = []; S.journal = []; save(); render(); } }
  });
  document.getElementById('modal').addEventListener('click', e => { if (e.target.id === 'modal') closeModal(); });

  function updatePlusChip() { const c = document.getElementById('plusChip'); if (!c) return; const ps = plusState(); c.textContent = ps.on ? (ps.trial ? `✨ 체험 ${ps.left}일` : '✨ 플러스 이용 중') : '✨ 플러스'; }
  const bt = document.getElementById('bigToggle');
  function applyBig() { document.body.classList.toggle('big', !!S.big); bt.setAttribute('aria-pressed', !!S.big); bt.textContent = S.big ? '가 큰글씨 켜짐' : '가 큰글씨'; }
  bt.addEventListener('click', () => { S.big = !S.big; save(); applyBig(); render(); toast(S.big ? '큰 글씨·간편 모드를 켰어요' : '기본 모드로 돌아왔어요'); });
  applyBig();
  window.addEventListener('hashchange', render);
  render();
})();

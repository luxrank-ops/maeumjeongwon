/* 마음정원사 : 절로가 — 사찰 여행 '추천 계획' 엔진
 * 조건(지역·테마·기간·이동수단·동행)을 넣으면 추천 순례 코스를 계산해 돌려줍니다.
 * - DOM·localStorage·네트워크를 쓰지 않는 순수 계산 모듈이라 node 테스트(vm)에서 그대로 검증할 수 있어요.
 * - 사찰 데이터(좌표가 있는 주요 사찰)만 사용하고, 이동·관람 시간은 '예상치'로만 안내합니다.
 */
(function () {
  'use strict';

  // 기간별로 무리 없이 담을 수 있는 사찰 수
  const COUNT_BY_DAYS = { '반나절·당일': 2, '당일치기': 3, '1박 2일': 3, '2박 3일': 4, '3박 4일 이상': 5 };
  const DAYS_BY_LABEL = { '반나절·당일': 1, '당일치기': 1, '1박 2일': 2, '2박 3일': 3, '3박 4일 이상': 4 };
  const START_CLOCK = { '반나절·당일': 9 * 60 + 30, '당일치기': 9 * 60, '1박 2일': 9 * 60, '2박 3일': 9 * 60, '3박 4일 이상': 9 * 60 };
  const DEFAULT_DAYS = '당일치기';
  const DEFAULT_TRANSPORT = '자가용';
  const MAX_STOPS = 6;
  const MAX_STAY_MIN = 300;

  // 동행 스타일별로 잘 어울리는 테마 가중치
  const COMPANION_THEMES = {
    '혼자 조용히': { quiet: 3, hike: 2, legend: 1, energy: 1 },
    '가족·부모님과': { family: 3, history: 2, autumn: 2, quiet: 1 },
    '연인·친구와': { photo: 3, sea: 2, autumn: 2, legend: 1 },
    '아이와 함께': { family: 3, city: 2, photo: 2, autumn: 1 },
    '불자·순례 모임': { history: 3, wish: 2, energy: 2, quiet: 1 },
    '기도처 중심 일정': { wish: 3, energy: 2, quiet: 1, hike: 1 },
    '기도효험 좋은 곳': { wish: 3, energy: 3, quiet: 1 }
  };

  // 이동 수단별 '한 구간으로 무리하지 않은 거리(km)'
  const TRANSPORT_LEG = { '자가용': 200, '대중교통': 80, '대중교통·도보': 60, '산행·트레킹': 45 };

  // 기도·기운 이야기를 다루는 테마는 '전해지는 이야기'라는 안내를 함께 붙인다
  const CAUTION_THEMES = ['wish', 'energy', 'prayer', 'fengshui'];

  function km(a, b) {
    const R = 6371, rad = x => x * Math.PI / 180;
    const dLat = rad(b.lat - a.lat), dLng = rad(b.lng - a.lng);
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(h));
  }

  // 같은 조건·같은 seed면 항상 같은 코스가 나오도록 하는 결정적 난수 (0~1)
  function hash01(str) {
    let h = 2166136261;
    const s = String(str);
    for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
    return (h >>> 0) / 4294967296;
  }

  function stayMinutes(duration) {
    if (!duration) return 60;
    const h = /(\d+)\s*시간/.exec(String(duration));
    const m = /(\d+)\s*분/.exec(String(duration));
    let min = h ? (+h[1] * 60 + (m ? +m[1] : 0)) : (m ? +m[1] : 60);
    if (!min || min < 20) min = 60;
    return Math.min(MAX_STAY_MIN, min);
  }

  function clockText(total) {
    const t = ((Math.round(total) % 1440) + 1440) % 1440;
    return String(Math.floor(t / 60)).padStart(2, '0') + ':' + String(t % 60).padStart(2, '0');
  }

  // 앱에서 넘겨주지 않았을 때 쓰는 기본 이동 추정 (직선거리 × 1.3, 시속 50km)
  function defaultEstimate(a, b) {
    const straightKm = Math.round(km(a, b));
    const roadKm = Math.max(1, Math.round(straightKm * 1.3));
    return { straightKm, roadKm, driveMin: Math.max(10, Math.round((roadKm / 50) * 60)) };
  }

  function themeName(themes, key) {
    const th = themes && themes[key];
    return th ? th.name : key;
  }

  function themeIcon(themes, key) {
    const th = themes && themes[key];
    return th ? th.icon : '🪷';
  }

  // 후보 사찰 기본 점수 — 테마 적합도 + 동행 스타일 + 아직 못 가본 곳 가점
  function baseScore(t, ctx) {
    let s = 1;
    const list = t.themes || [];
    if (ctx.theme) s += list.includes(ctx.theme) ? 6 : -1.2;
    const pref = COMPANION_THEMES[ctx.companion] || {};
    Object.keys(pref).forEach(k => { if (list.includes(k)) s += pref[k]; });
    if (!ctx.visited.has(t.id)) s += 1.5;
    if (t.legend) s += 0.4;
    if ((t.treasures || []).length) s += 0.3;
    return s;
  }

  // 고른 사찰들을 '가까운 순서'로 이어 붙이고, 2-opt로 조금 더 다듬는다
  function orderRoute(stops, startIdx) {
    const rest = stops.filter((_, i) => i !== startIdx);
    const route = [stops[startIdx]];
    while (rest.length) {
      const last = route[route.length - 1];
      let bi = 0, bd = Infinity;
      rest.forEach((t, i) => { const d = km(last, t); if (d < bd) { bd = d; bi = i; } });
      route.push(rest.splice(bi, 1)[0]);
    }
    return twoOpt(route);
  }

  function routeKm(route) {
    let sum = 0;
    for (let i = 0; i < route.length - 1; i++) sum += km(route[i], route[i + 1]);
    return sum;
  }

  function twoOpt(route) {
    if (route.length < 4) return route;
    let best = route, improved = true, guard = 0;
    while (improved && guard++ < 40) {
      improved = false;
      for (let i = 0; i < best.length - 2; i++) {
        for (let j = i + 2; j < best.length; j++) {
          const cand = best.slice(0, i + 1).concat(best.slice(i + 1, j + 1).reverse(), best.slice(j + 1));
          if (routeKm(cand) + 0.01 < routeKm(best)) { best = cand; improved = true; }
        }
      }
    }
    return best;
  }

  function buildTitle(route, o) {
    const th = o.theme && o.themes ? o.themes[o.theme] : null;
    if (th) return `${th.icon} ${o.sido ? o.sido + ' ' : ''}${th.name} ${o.days} 코스`;
    const names = route.map(t => t.name);
    const head = names.slice(0, 2).join('·');
    return `${head}${names.length > 2 ? ` 외 ${names.length - 2}곳` : ''} 사찰 여행`;
  }

  // 시간대별 일정표(메모) — 저장하면 '일정표 · 여행 메모' 칸에 그대로 들어간다
  function buildSchedule(route, o, estimate) {
    const dayCount = Math.max(1, Math.min(DAYS_BY_LABEL[o.days] || 1, route.length));
    const perDay = Math.ceil(route.length / dayCount);
    const lines = [];
    let clock = START_CLOCK[o.days] || START_CLOCK[DEFAULT_DAYS];
    let prev = null;
    for (let d = 1; d <= dayCount; d++) {
      const group = route.slice((d - 1) * perDay, d * perDay);
      if (!group.length) continue;
      if (dayCount > 1) lines.push(`${d}일차`);
      clock = START_CLOCK[o.days] || START_CLOCK[DEFAULT_DAYS];
      group.forEach(t => {
        if (prev) {
          const leg = estimate(prev, t, o.transport);
          lines.push(`${clockText(clock)} — 이동: ${prev.name} → ${t.name} (예상 약 ${leg.driveMin}분 · 도로 약 ${leg.roadKm}km)`);
          clock += leg.driveMin;
        }
        lines.push(`${clockText(clock)} — ${t.name} 도착 · 참배와 경내 산책 (권장 ${t.duration || '약 1시간'})`);
        clock += stayMinutes(t.duration);
        if (clock >= 12 * 60 && clock < 14 * 60) { lines.push(`${clockText(clock)} — 점심 공양·식사 (약 1시간)`); clock += 60; }
        prev = t;
      });
      if (d < dayCount) lines.push(`${clockText(clock)} — 숙소로 이동해 휴식 (숙소는 동선에 맞춰 예약하세요)`);
    }
    return lines.join('\n');
  }

  function reasonTags(t, o, ctx) {
    const tags = [];
    const list = t.themes || [];
    if (o.theme && list.includes(o.theme)) tags.push({ icon: themeIcon(o.themes, o.theme), text: `${themeName(o.themes, o.theme)} 테마` });
    const pref = COMPANION_THEMES[o.companion] || {};
    const hit = Object.keys(pref).filter(k => list.includes(k)).sort((a, b) => pref[b] - pref[a])[0];
    if (hit) tags.push({ icon: themeIcon(o.themes, hit), text: `${o.companion}에 맞는 ${themeName(o.themes, hit)}` });
    if (o.sido && t.sido === o.sido) tags.push({ icon: '📍', text: `${o.sido} 안에서 이동` });
    if (!ctx.visited.has(t.id)) tags.push({ icon: '🆕', text: '아직 못 가본 곳' });
    if (t.mountain) tags.push({ icon: '⛰️', text: t.mountain });
    if ((t.treasures || []).length) tags.push({ icon: '🏛️', text: t.treasures[0] });
    if (t.legend && t.legend.title) tags.push({ icon: '🐯', text: `전설: ${t.legend.title}` });
    return tags.slice(0, 4);
  }

  function recommend(options) {
    const o = options || {};
    const themes = o.themes || {};
    const all = (o.temples || []).filter(t => t && t.id && typeof t.lat === 'number' && typeof t.lng === 'number');
    if (!all.length) return { ok: false, message: '추천에 쓸 사찰 정보를 찾지 못했어요.' };

    const days = DAYS_BY_LABEL[o.days] ? o.days : DEFAULT_DAYS;
    const transport = TRANSPORT_LEG[o.transport] ? o.transport : DEFAULT_TRANSPORT;
    const sido = o.sido || '';
    const theme = o.theme && themes[o.theme] ? o.theme : '';
    const seed = Number(o.seed) || 0;
    const visited = new Set(o.visitedIds || []);
    const estimate = typeof o.estimate === 'function' ? (a, b) => o.estimate(a, b, transport) : defaultEstimate;
    const notices = [];
    const cautions = [];

    let pool = sido ? all.filter(t => t.sido === sido) : all.slice();
    if (sido && !pool.length) {
      notices.push(`「${sido}」에서 추천에 쓸 수 있는 주요 사찰 정보가 아직 없어 전국 사찰에서 골랐어요. '사찰 추가하기'로 전통사찰 991곳 중 원하는 곳을 직접 넣을 수도 있어요.`);
      pool = all.slice();
    }

    const wantByDays = COUNT_BY_DAYS[days] || 3;
    const regionPool = pool.slice();
    // 테마를 고르면, 그 테마 사찰이 모자라지 않을 때는 테마 안에서만 고른다
    if (theme) {
      const themed = pool.filter(t => (t.themes || []).includes(theme));
      if (themed.length >= Math.min(wantByDays, MAX_STOPS)) pool = themed;
      else if (themed.length) notices.push(`「${sido || '전국'}」에서 '${themeName(themes, theme)}' 테마로 묶인 사찰이 ${themed.length}곳이라, 나머지는 동선이 가까운 곳으로 채웠어요.`);
      else notices.push(`「${sido || '전국'}」에는 '${themeName(themes, theme)}' 테마로 묶인 사찰이 아직 없어, 조건과 가까운 곳 위주로 담았어요.`);
    }

    const want = Math.max(1, Math.min(wantByDays, MAX_STOPS, pool.length));
    if (regionPool.length < wantByDays && pool.length === regionPool.length) {
      notices.push(`「${sido || '전체 지역'}」의 주요 사찰이 ${regionPool.length}곳이라 ${regionPool.length}곳 코스로 추천했어요. '사찰 추가하기'에서 직접 더 채울 수 있어요.`);
    }

    const ctx = { theme, companion: o.companion || '', visited };
    const legLimit = TRANSPORT_LEG[transport];
    const softKm = Math.max(8, legLimit / 3);
    // '다른 코스 추천'을 눌렀을 때 바로 앞 코스와 겹치지 않게 하기 위한 제외 목록
    const avoid = new Set(o.avoidIds || []);
    const canAvoid = pool.filter(t => !avoid.has(t.id)).length >= want;

    // 1) 점수 높은 곳에서 시작해, 가까운 곳을 이어 붙이며 코스를 구성
    const remaining = pool.map(t => ({ t, base: baseScore(t, ctx) }));
    const chosen = [];
    let startTemple = null;
    while (chosen.length < want && remaining.length) {
      let best = 0, bestVal = -Infinity;
      remaining.forEach((c, i) => {
        const near = chosen.length ? Math.min.apply(null, chosen.map(x => km(x, c.t))) : 0;
        let v = c.base + hash01(c.t.id + '#' + seed) * 2.2;
        if (canAvoid && avoid.has(c.t.id)) v -= 7;   // 방금 보여 준 코스는 후순위로
        if (chosen.length) {
          v -= near / softKm;
          if (near > legLimit) v -= 6;   // 한 구간으로 무리한 거리는 크게 감점
        }
        if (v > bestVal) { bestVal = v; best = i; }
      });
      const picked = remaining.splice(best, 1)[0].t;
      if (!chosen.length) startTemple = picked;
      chosen.push(picked);
    }

    const startIdx = startTemple ? chosen.indexOf(startTemple) : 0;
    const route = orderRoute(chosen, startIdx < 0 ? 0 : startIdx);

    // 2) 추천 이유 · 일정표 · 안내 문구
    const reasons = {};
    route.forEach(t => { reasons[t.id] = reasonTags(t, o, ctx); });

    cautions.push('이동·관람 시간은 직선거리로 계산한 예상치예요. 실제 길찾기·개방시간·주차·산행 통제를 출발 전에 확인하세요.');
    if (CAUTION_THEMES.includes(theme) || /기도|기운/.test(o.companion || '')) {
      cautions.push('기도·기운 관련 내용은 공개된 자료를 참고한 안내이며, 소원 성취나 효험을 약속하지 않아요.');
    }

    return {
      ok: true,
      stops: route.map(t => t.id),
      reasons,
      days,
      transport,
      sido,
      theme,
      companion: o.companion || '',
      seed,
      title: buildTitle(route, { theme, themes, sido, days }),
      memo: buildSchedule(route, { days, transport }, estimate),
      notices,
      cautions,
      totalStraightKm: Math.round(routeKm(route))
    };
  }

  window.PLANNER_RECO = {
    recommend,
    COUNT_BY_DAYS,
    DAYS_BY_LABEL,
    COMPANION_THEMES,
    TRANSPORT_LEG,
    stayMinutes,
    clockText
  };
})();

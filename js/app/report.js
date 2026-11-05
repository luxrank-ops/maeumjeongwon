/* 사경 리포트 — '마음의 결'과 '마음 씨앗' (지연 모듈)
 *
 * 왜 따로 두었나: 이 화면은 #/report 로 들어갈 때만 필요하다. 첫 화면 예산(140KB)을 지키려고
 * 격자·꺾은선·낱말 구름을 여기로 옮겼다. js/lib/loader.js 의 ASSETS.sagye 가 함께 받는다.
 *
 * 이 파일이 아는 것은 '기록'(window.MJ_COUNSEL)뿐이다. 서버·네트워크를 부르지 않는다.
 *
 * ── 적응형 규칙 (SCR-REP-003) ─────────────────────────────────────────────
 *   N = 상담(사경) 장 수
 *   N = 0      : 문을 여는 안내 (차트 없음)
 *   N = 1~2    : 🌱 마음 씨앗 카드 — 숫자를 말하지 않는다. **차트 컴포넌트를 아예 만들지 않는다**
 *   N >= 3     : 주간 감정선(불안·안정 두 줄) + 되풀이되는 낱말 + PDF 내보내기
 *   기록이 깨졌으면: 대시보드 대신 [기록 새로고침] 카드 (파싱 예외가 화면을 죽이지 않는다)
 * 표본 데이터: docs/mind-report-cases.json, 브라우저에서는 #/report?demo=A · ?demo=B
 */
(function (root) {
  'use strict';

  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const fmtDate = iso => {
    const d = new Date(iso);
    return isNaN(d) ? String(iso || '') : `${d.getFullYear()}.${d.getMonth() + 1}.${d.getDate()}`;
  };
  const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));
  // SVG 안에서는 CSS 변수를 못 읽는다 — 그릴 때 계산된 값을 읽어 온다
  const themeColor = (name, fallback) => {
    try {
      const v = window.getComputedStyle(document.documentElement).getPropertyValue(name);
      const t = (v || '').trim();
      return t || fallback;
    } catch (e) { return fallback; }
  };
  const DAYS = ['일', '월', '화', '수', '목', '금', '토'];


  // ---------- 사경 기록 저장소 (기기 밖으로 나가지 않는다) ----------
  // 3장이 기준: 한 장은 우연, 세 장이 쌓이면 결이 보인다.
  const COUNSEL_MAX = 60;
  const KW = [
    { k: '불안', re: /불안|걱정|초조|두렵|무섭|긴장|떨려/ },
    { k: '지침', re: /지치|지쳐|피곤|힘들|번아웃|무기력|쉬고\s*싶|녹초/ },
    { k: '관계', re: /관계|친구|동료|사람\s*때문|가족|부모|자녀|아이|연인|부부/ },
    { k: '건강', re: /건강|아프|병원|수술|치료|회복|몸이/ },
    { k: '일·진로', re: /회사|직장|진로|이직|취업|업무|일이\s*안|프로젝트/ },
    { k: '시험·승진', re: /시험|수능|합격|승진|면접|자격증|논문/ },
    { k: '돈', re: /돈|빚|생계|월급|재정|가계/ },
    { k: '외로움', re: /외롭|혼자|고독|쓸쓸|적적/ },
    { k: '이별·상실', re: /이별|헤어|떠나|장례|상실|죽음/ },
    { k: '화·억울', re: /화가|분노|억울|짜증|미움|서운/ },
    { k: '감사', re: /감사|고맙|기쁨|행복|설레|좋은\s*일/ },
    { k: '기도·발원', re: /기도|발원|소원|바라|기원|빌고/ },
    { k: '쉼', re: /쉬고|휴식|명상|숲|걷|조용/ }
  ];
  // 기분 라벨 → 마음 온도(1~5). 리포트의 y축이자 불안 점수의 재료.
  const TEMP = { '지쳤어요': 2, '마음이 복잡해요': 2.6, '설레요': 3.8, '바라는 게 있어요': 3.2, '쓸쓸해요': 2.4, '감사해요': 4.4 };
  const store = () => root.MJ_STORE;
  function keywordsOf(text) {
    const t = String(text || '');
    return KW.filter(x => x.re.test(t)).map(x => x.k);
  }
  function scoreOf(mood, kws) {
    let v = TEMP[mood] || 3;
    const has = (...names) => names.some(n => kws.includes(n));
    if (has('불안', '지침', '외로움', '화·억울')) v -= 0.3;
    if (has('감사', '기도·발원', '쉼')) v += 0.3;
    return Math.max(1, Math.min(5, Math.round(v * 10) / 10));
  }
  function list() {
    const s = store();
    return s ? s.counsel().filter(x => x && x.at) : [];
  }
  function health() {
    const s = store();
    const raw = s ? s.counsel() : [];
    const bad = raw.filter(x => !x || typeof x !== 'object' || isNaN(Date.parse(String(x.at || '')))).length;
    return { ok: !!s && !s.broken() && !bad, total: raw.length, bad, storageBroken: s ? s.broken() : true };
  }
  function add(rec) {
    const s = store();
    if (!s) { (root.MJ_COUNSEL_QUEUE = root.MJ_COUNSEL_QUEUE || []).push(rec); return; }
    const prompt = String((rec && rec.prompt) || '').slice(0, 300);
    if (!prompt) return;
    const kws = keywordsOf(prompt);
    const mood = String((rec && rec.mood) || '');
    s.setCounsel(list().concat({
      at: new Date().toISOString(), prompt, mood, kw: kws, score: scoreOf(mood, kws),
      templeId: (rec && rec.templeId) || '', verse: (rec && rec.verse) || ''
    }).slice(-COUNSEL_MAX));
    s.save();
  }
  // [기록 새로고침] — 깨진 항목만 걷어 내고 다시 저장한다. 순례·수첩 기록은 건드리지 않는다.
  function reset() {
    const s = store();
    if (!s) return 0;
    const raw = s.counsel();
    s.setCounsel(raw.filter(x => x && typeof x === 'object' && !isNaN(Date.parse(String(x.at || '')))));
    s.heal();
    s.save();
    return s.counsel().length;
  }
  function drainQueue() {
    const q = root.MJ_COUNSEL_QUEUE || [];
    root.MJ_COUNSEL_QUEUE = [];
    q.forEach(rec => { try { add(rec); } catch (e) {} });
  }

  // ---------- 기록 읽기 (깨진 기록이 화면을 죽이지 않게) ----------
  // MJ_COUNSEL 은 앱 셸(app.js)이 들고 있다. 여기서는 '믿지 않고' 한 번 더 검사한다.
  function readLog() {
    let raw;
    try { raw = list(); } catch (e) { return { log: [], broken: true }; }
    if (!Array.isArray(raw)) return { log: [], broken: true };
    const clean = raw.filter(x => x && typeof x === 'object' && !isNaN(Date.parse(String(x.at || ''))));
    return { log: clean, broken: clean.length !== raw.length || !health().ok };
  }

  // ---------- 적응형 매핑 ----------
  // 불안 0~100: 마음 온도(1~5, 높을수록 평온)를 뒤집고, 낱말로 조금 보정한다.
  function anxietyOf(entry) {
    const score = clamp(Number(entry && entry.score) || 3, 1, 5);
    let a = ((5 - score) / 4) * 100;
    const kw = Array.isArray(entry && entry.kw) ? entry.kw : [];
    if (kw.includes('불안')) a += 8;
    if (kw.includes('화·억울')) a += 6;
    if (kw.includes('지침')) a += 4;
    if (kw.includes('감사') || kw.includes('쉼')) a -= 6;
    return Math.round(clamp(a, 0, 100));
  }
  function dayKey(iso) { return String(iso).slice(0, 10); }
  function weeklyTrend(log) {
    const byDay = new Map();
    log.forEach(x => {
      const k = dayKey(x.at);
      if (!k) return;
      const cur = byDay.get(k) || { sum: 0, n: 0, kw: {}, mood: {} };
      cur.sum += anxietyOf(x); cur.n += 1;
      (Array.isArray(x.kw) ? x.kw : []).forEach(t => { cur.kw[t] = (cur.kw[t] || 0) + 1; });
      if (x.mood) cur.mood[x.mood] = (cur.mood[x.mood] || 0) + 1;
      byDay.set(k, cur);
    });
    const keys = [...byDay.keys()].sort().slice(-7);
    return keys.map(k => {
      const d = byDay.get(k);
      const anxiety = Math.round(d.sum / d.n);
      const top = Object.entries(d.kw).sort((a, b) => b[1] - a[1])[0];
      const mood = Object.entries(d.mood).sort((a, b) => b[1] - a[1])[0];
      const date = new Date(k + 'T00:00:00');
      return {
        dayOfWeek: isNaN(date) ? '' : DAYS[date.getDay()],
        date: k,
        anxietyScore: anxiety,
        stabilityScore: 100 - anxiety,
        primaryEmotion: (top && top[0]) || (mood && mood[0]) || '기록'
      };
    });
  }
  function topKeywords(log, limit) {
    const counts = {};
    log.forEach(x => (Array.isArray(x.kw) ? x.kw : []).forEach(k => { counts[k] = (counts[k] || 0) + 1; }));
    return Object.entries(counts)
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .slice(0, limit || 8)
      // 채도는 빈도가 아니라 '결'의 농도다 — 자주 나온 낱말일수록 주사가 진하다
      .map(([keyword, frequency]) => ({ keyword, frequency, intensity: frequency >= 4 ? 'High' : frequency >= 3 ? 'Medium' : 'Low' }));
  }
  const SEED = [
    { stage: 1, label: '씨앗', message: '아직 심어진 이야기가 적어 그래프를 그릴 수 없어요. 마음의 지기와 2번 더 이야기하면 주간 감정선이 피어납니다.' },
    { stage: 2, label: '새싹', message: '세 장이 모여 새싹이 올라왔어요. 이제 마음의 흐름을 선으로 그려 볼 수 있습니다.' },
    { stage: 3, label: '줄기', message: '마음의 줄기가 단단해지고 있어요. 주간 흐름을 천천히 살펴보세요.' },
    { stage: 4, label: '꽃', message: '열두 장을 넘기며 마음에 꽃이 폈어요. 오래 머문 자리와 지나간 자리가 함께 보입니다.' }
  ];
  function buildReport(log) {
    const list = Array.isArray(log) ? log : [];
    const n = list.length;
    const enough = n >= 3;
    const stage = n >= 12 ? 4 : n >= 6 ? 3 : n >= 3 ? 2 : 1;
    const seed = SEED[stage - 1];
    const state = {
      totalConsultationCount: n,
      hasEnoughData: enough,
      lastUpdated: n ? String(list[n - 1].at) : '',
      mindGrowthSeed: { seedStage: seed.stage, label: seed.label, message: seed.message }
    };
    if (enough) state.analyticsData = { weeklyTrend: weeklyTrend(list), topKeywords: topKeywords(list, 8) };
    return state;
  }

  // ---------- 그림 ----------
  function trendPoints(values, w, h, pad) {
    const n = values.length;
    const stepX = n > 1 ? (w - pad * 2) / (n - 1) : 0;
    return values.map((v, i) => {
      const x = pad + stepX * i;
      const y = pad + (1 - clamp(v, 0, 100) / 100) * (h - pad * 2);
      return [Math.round(x * 10) / 10, Math.round(y * 10) / 10];
    });
  }
  function polyline(values, w, h, pad) {
    return trendPoints(values, w, h, pad).map(p => p.join(',')).join(' ');
  }
  function dots(pts, cls) {
    return pts.map((p, i) => `<circle class="${cls}${i === pts.length - 1 ? ' dot-last' : ''}" cx="${p[0]}" cy="${p[1]}" r="${i === pts.length - 1 ? 5 : 3.4}"/>`).join('');
  }

  function chart(state) {
    const trend = state.analyticsData.weeklyTrend;
    const W = 320, H = 150, PAD = 24;
    const anxiety = trend.map(t => t.anxietyScore);
    const stability = trend.map(t => t.stabilityScore);
    const aPts = trendPoints(anxiety, W, H, PAD);
    const labels = trend.map((t, i) => `<text x="${aPts[i][0]}" y="${H - 4}" text-anchor="middle">${esc(t.dayOfWeek || t.date)}</text>`).join('');
    const last = trend[trend.length - 1];
    return `<svg class="counsel-trend" viewBox="0 0 ${W} ${H}" role="img"
        aria-label="주간 감정선 — 마지막 기록의 불안 ${last.anxietyScore}, 안정 ${last.stabilityScore}">
        <defs>
          <linearGradient id="sagyeGrad" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0" stop-color="${themeColor('--pine-3', '#c33a3a')}"/>
            <stop offset="1" stop-color="${themeColor('--pine', '#b71c1c')}"/>
          </linearGradient>
        </defs>
        <line class="grid" x1="${PAD}" y1="${PAD}" x2="${W - PAD}" y2="${PAD}"/>
        <line class="grid" x1="${PAD}" y1="${H - PAD}" x2="${W - PAD}" y2="${H - PAD}"/>
        <line class="axis" x1="${PAD}" y1="${PAD}" x2="${PAD}" y2="${H - PAD}"/>
        <polyline class="line stable" points="${polyline(stability, W, H, PAD)}"/>
        <polyline class="line" points="${polyline(anxiety, W, H, PAD)}"/>
        ${dots(aPts, 'dot')}
        ${labels}
      </svg>
      <div class="trend-legend">
        <span><i class="lg anxiety"></i>불안 ${last.anxietyScore}</span>
        <span><i class="lg stable"></i>안정 ${last.stabilityScore}</span>
        <span class="sub">${esc(fmtDate(trend[0].date))} ~ ${esc(fmtDate(last.date))}</span>
      </div>`;
  }

  function keywordCloud(list) {
    if (!list.length) return `<p class="sub" style="margin:0">아직 되풀이되는 낱말이 없어요. 한 장만 더 쓰면 결이 드러나요.</p>`;
    return `<div class="tag-cloud">${list.map(t => {
      const cls = t.intensity === 'High' ? ' hi' : t.intensity === 'Medium' ? ' mid' : ' lo';
      return `<div class="kw${cls}"><b>#${esc(t.keyword)}</b><span class="n">${t.frequency}회</span></div>`;
    }).join('')}</div>`;
  }

  const goWrite = `<div class="report-cta"><button class="btn" data-act="ai-counsel">마음 사경 펼치기</button>
    <p class="report-foot-note">질문과 답은 이 기기에만 남아요 · 서버로 보내지 않아요</p></div>`;

  // ---------- 상태별 화면 ----------
  function emptyCard() {
    return `<section class="card report-encourage">
      <div class="seal-mark">問</div>
      <h2>아직 사경을 펼치지 않았어요</h2>
      <p>마음을 한 줄 적으면 그 문장이 첫 장이 됩니다. 세 장이 모이면 결이 꺾은선으로 보여요.</p>
      ${goWrite}
    </section>`;
  }

  function seedCard(state) {
    const stage = state.mindGrowthSeed.seedStage;
    const dotsHtml = [1, 2, 3, 4].map(i => `<i class="${i <= stage ? 'on' : ''}"></i>`).join('');
    return `<section class="card report-encourage seed-card">
      <div class="seal-mark">🌱</div>
      <h2>마음 씨앗 · ${esc(state.mindGrowthSeed.label || '')}</h2>
      <p>${esc(state.mindGrowthSeed.message)}</p>
      <div class="seed-dots" role="img" aria-label="씨앗에서 꽃까지 4단계 중 ${stage}단계">${dotsHtml}</div>
      <p class="sub" style="margin:10px 0 0">지금 ${state.totalConsultationCount}장 · 3장이 되면 주간 감정선이 열려요</p>
      ${goWrite}
    </section>`;
  }

  function resetCard() {
    return `<section class="card" role="alert">
      <h2 style="margin-top:0">기록을 읽지 못했어요</h2>
      <p class="sub" style="margin:0">이미 저장된 사경 기록의 형식이 어긋났어요. 지우기 전에 한 번 더 읽어 보고, 그래도 안 되면 깨진 항목만 정리합니다. 순례·수첩 기록은 건드리지 않아요.</p>
      <div class="report-cta">
        <button type="button" class="btn" data-act="counsel-reset">기록 새로고침</button>
        <button type="button" class="btn ghost" data-act="ai-counsel">새 장으로 다시 시작</button>
      </div>
    </section>`;
  }

  // 데이터가 쌓일수록 카드가 넓어진다 (프로그래시브 → 벤토). 6장(줄기)부터 숫자 타일이 붙는다.
  function statTiles(state, trend) {
    const avg = Math.round(trend.reduce((a, p) => a + p.anxietyScore, 0) / trend.length);
    const calm = trend.filter(p => p.stabilityScore >= 60).length;
    return `<div class="bento-stats">
        <div class="tile"><b>${state.totalConsultationCount}</b><span>쌓인 장</span></div>
        <div class="tile"><b>${avg}</b><span>평균 불안</span></div>
        <div class="tile"><b>${calm}일</b><span>고요했던 날</span></div>
      </div>`;
  }

  function fullReport(state) {
    const { weeklyTrend: trend, topKeywords: keywords } = state.analyticsData;
    const best = trend.reduce((a, b) => (b.stabilityScore >= a.stabilityScore ? b : a), trend[0]);
    const grown = state.mindGrowthSeed && state.mindGrowthSeed.seedStage >= 3;
    return `<div class="report-bento" data-stage="${grown ? 'grown' : 'basic'}"><section class="card" data-span="wide">
        <div class="row between"><h2 style="margin:0">주간 감정선</h2><span class="tag">${state.totalConsultationCount}장</span></div>
        <p class="sub" style="margin:4px 0 0">붉은 선은 불안, 점선은 안정이에요. 두 선이 벌어질수록 마음이 흔들린 한 주였습니다.</p>
        ${chart(state)}
        <p class="sub" style="margin:10px 0 0">가장 안정적이었던 날은 <b>${esc(best.dayOfWeek || best.date)}</b> — 안정 ${best.stabilityScore}. 그날의 마음('${esc(best.primaryEmotion)}')을 한 번 더 떠올려 보세요.</p>
        ${grown ? statTiles(state, trend) : ''}
      </section>
      <section class="card">
        <h2 style="margin-top:0">되풀이되는 마음</h2>
        <p class="sub" style="margin:0 0 6px">질문에 자주 나온 낱말 — 진한 주사일수록 오래 머문 자리예요.</p>
        ${keywordCloud(keywords)}
      </section>
      <section class="card">
        <h2 style="margin-top:0">이 리포트를 남기기</h2>
        <p class="sub" style="margin:0">상담 기록은 이 기기 브라우저에만 있어요. 기기를 바꾸면 따라가지 않아요.</p>
        <div class="report-cta">
          <button class="btn" data-act="print">PDF로 저장 · 인쇄</button>
          <button class="btn ghost" data-act="ai-counsel">마음 사경 이어 쓰기</button>
          <p class="report-foot-note">인쇄 대화상자에서 'PDF로 저장'을 고르세요 · 인쇄물에는 광고·탭이 빠집니다</p>
        </div>
      </section></div>`;
  }

  // 화면에 그리는 유일한 문 — state 를 직접 넘기면 그 상태로 그린다(테스트·데모).
  function counsel(stateOverride) {
    let state = stateOverride;
    if (!state) {
      const { log, broken } = readLog();
      if (broken) return resetCard();
      if (!log.length) return emptyCard();
      state = buildReport(log);
    }
    if (!state || typeof state.totalConsultationCount !== 'number') return resetCard();
    if (!state.hasEnoughData || !state.analyticsData) {
      return state.totalConsultationCount === 0 ? emptyCard() : seedCard(state);
    }
    return fullReport(state);
  }

  // ---------- 데모: ?demo=A | ?demo=B ----------
  // 표본은 docs/mind-report-cases.json 과 같은 값이되, 여기서는 '기록 → 상태' 계산을 건너뛴다.
  function demoState() {
    // 이 앱은 해시 라우팅이라 demo 는 '#/report?demo=A' 의 물음표 뒤에 온다 (주소창 ?demo=A 도 같이 본다)
    let demo = '';
    try {
      const hashQuery = String(location.hash || '').split('?')[1] || '';
      demo = (new URLSearchParams(hashQuery).get('demo') || new URLSearchParams(location.search || '').get('demo') || '').toUpperCase();
    } catch (e) { demo = ''; }
    if (demo !== 'A' && demo !== 'B') return null;
    if (demo === 'A') {
      return {
        totalConsultationCount: 1, hasEnoughData: false, lastUpdated: '2026-11-05T23:50:00Z',
        mindGrowthSeed: SEED[0]
      };
    }
    return buildReport([
      { at: '2026-11-02T10:00:00Z', score: 2, kw: ['불안'], mood: '마음이 복잡해요' },
      { at: '2026-11-02T19:00:00Z', score: 2.2, kw: ['불안', '일·진로'], mood: '마음이 복잡해요' },
      { at: '2026-11-03T09:00:00Z', score: 2.6, kw: ['지침'], mood: '지쳤어요' },
      { at: '2026-11-04T09:00:00Z', score: 3.4, kw: ['쉼'], mood: '바라는 게 있어요' },
      { at: '2026-11-05T09:00:00Z', score: 4.2, kw: ['감사', '쉼'], mood: '감사해요' },
      { at: '2026-11-05T20:00:00Z', score: 4.4, kw: ['감사'], mood: '감사해요' }
    ]);
  }

  // 저장소를 이 모듈이 들고 있다 — 상담 시트(js/features.js)는 이 문으로만 기록을 남긴다
  root.MJ_COUNSEL = { add: add, list: list, health: health, reset: reset };
  drainQueue();

  root.MJ_REPORT = {
    counsel: function (state) { return counsel(state || demoState() || undefined); },
    keywordsOf: keywordsOf,
    scoreOf: scoreOf,
    buildReport: buildReport,
    weeklyTrend: weeklyTrend,
    topKeywords: topKeywords,
    anxietyOf: anxietyOf,
    trendPoints: trendPoints
  };
})(window);

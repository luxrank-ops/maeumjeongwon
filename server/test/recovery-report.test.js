'use strict';

/* 회복 탄력성 · 적응형 리포트 가드 (2026-11 후속)
 *
 * 이 파일은 '문서로 약속한 예외 처리'가 코드에 실제로 있는지, 그리고 **실제로 그렇게 동작하는지**를
 * 함께 검사한다. 앞쪽은 소스 계약, 뒤쪽은 vm 에서 js/app/report.js 를 진짜로 돌려 본 결과다.
 *
 *   ① 화면 ID 와 화면별 전환 효과 (SCR-MAIN-001 / SCR-AUTH-002 / SCR-REP-003)
 *   ② SCR-MAIN-001 — 스트리밍 유실 3회 재시도·유실 지점 표시·인라인 재시도 / 빈 입력 점멸
 *   ③ SCR-AUTH-002 — 로컬 복구 번들(인라인 테마) / 인증 서버 불통 시 게스트 입장 훅
 *   ④ SCR-REP-003 — N<3 이면 차트를 '만들지 않는다' / 깨진 기록은 복구 카드
 *   ⑤ 적응형 데이터 매핑 — 주간 감정선·낱말 농도·씨앗 단계, 목업 두 케이스
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.join(__dirname, '..', '..');
const read = rel => fs.readFileSync(path.join(ROOT, rel), 'utf-8');

const css = read('css/style.css');
const sagyeCss = read('css/sagye.css');
const app = read('js/app.js');
const features = read('js/features.js');
const report = read('js/app/report.js');
const shell = read('index.html');

// ---------- report.js 를 가짜 창에서 실제로 돌린다 ----------
function loadReport(opts = {}) {
  const store = {
    _c: Array.isArray(opts.counsel) ? opts.counsel.slice() : [],
    counsel() { return this._c; },
    setCounsel(v) { this._c = v; },
    save() { this.saved = (this.saved || 0) + 1; },
    broken() { return !!opts.broken; },
    heal() { this.healed = true; }
  };
  const sandbox = {
    console,
    location: { search: opts.search || '', hash: opts.hash || '' },
    URLSearchParams,
    document: { documentElement: {}, querySelector: () => null }
  };
  sandbox.window = sandbox;
  sandbox.MJ_STORE = store;
  sandbox.getComputedStyle = () => ({ getPropertyValue: name => (name === '--pine' ? '#b71c1c' : name === '--text-3' ? '#5e5952' : '') });
  vm.createContext(sandbox);
  vm.runInContext(read('js/app/report.js'), sandbox, { filename: 'js/app/report.js' });
  return { sandbox, store, MJ_REPORT: sandbox.MJ_REPORT, MJ_COUNSEL: sandbox.MJ_COUNSEL };
}

const log = (at, score, kw, mood) => ({ at, score, kw, mood, prompt: 'x', verse: '유마경' });
const FEW = [log('2026-11-02T10:00:00Z', 2.2, ['불안'], '마음이 복잡해요')];
const MANY = [
  log('2026-11-02T10:00:00Z', 2.0, ['불안'], '마음이 복잡해요'),
  log('2026-11-02T19:00:00Z', 2.2, ['불안', '일·진로'], '마음이 복잡해요'),
  log('2026-11-03T09:00:00Z', 2.6, ['지침'], '지쳤어요'),
  log('2026-11-04T09:00:00Z', 3.4, ['쉼'], '바라는 게 있어요'),
  log('2026-11-05T09:00:00Z', 4.2, ['감사', '쉼'], '감사해요'),
  log('2026-11-05T20:00:00Z', 4.4, ['감사'], '감사해요')
];

// ---------- ① 화면 ID · 전환 효과 ----------

test('① 화면 ID 와 전환 효과 — 기획서의 이름을 DOM 에 그대로 남긴다', () => {
  assert.match(app, /SCR-MAIN-001/);
  assert.match(app, /SCR-AUTH-002/);
  assert.match(app, /SCR-REP-003/);
  assert.match(app, /\$view\.dataset\.screen = SCREEN_ID\[route\]/);
  assert.match(app, /\$view\.dataset\.motion = SCREEN_MOTION/);
  for (const k of ['mj-fade', 'mj-slide-left', 'mj-lift']) {
    assert.match(css, new RegExp('@keyframes ' + k), `${k} 키프레임`);
  }
  assert.match(css, /400ms/, 'Fade-in 400ms');
  assert.match(css, /300ms/, 'Slide Left 300ms');
  assert.match(css, /250ms/, 'Staggered Lift 250ms');
  assert.match(css, /prefers-reduced-motion:reduce\)\{\s*main\.entering\[data-motion\]\{animation:none\}/, '축소 설정에서는 끈다');
});

// ---------- ② SCR-MAIN-001 ----------

test('② 스트리밍 유실 — 3회 재시도, 유실 지점을 숨기지 않고 같은 장에서 잇는다', () => {
  assert.match(features, /const RETRY_MAX = 3/);
  assert.match(features, /for \(let i = 1; i <= RETRY_MAX; i\+\+\)/);
  assert.match(features, /300 \* i/, '재시도 간격을 늘린다');
  assert.match(features, /정원의 연결이 흐려져 잠시 후 이어집니다/, '유실 안내 문장');
  assert.match(features, /'다시 이어 쓰기'/, '인라인 재시도 버튼');
  assert.match(features, /runQuery\(\{ turn: el \}\)/, '같은 장에 이어 쓴다 (새 장을 만들지 않는다)');
  assert.match(features, /aria-busy/);
});

test('② 빈 입력 — 조용히 실패하지 않고 두 번 점멸하고 포커스를 지킨다', () => {
  assert.match(features, /function alertInput\(/);
  assert.match(features, /if \(input && !input\.value\.trim\(\)\) \{ alertInput\(\); return; \}/);
  assert.match(features, /input\.setAttribute\('aria-invalid', 'true'\)/);
  assert.match(features, /input\.focus\(\)/);
  assert.match(sagyeCss, /@keyframes sagye-alert/, '점멸 키프레임');
  assert.match(sagyeCss, /animation:sagye-alert [^;]*2/, '정확히 두 번');
  assert.match(sagyeCss, /\.sagye-inputwrap\.is-alert textarea\{[^}]*border-color:var\(--pine\)/, '테두리는 주사색');
});

// ---------- ③ SCR-AUTH-002 ----------

test('③ 외부 CSS 유실 — 사경 시트도 인라인 테마로 버틴다 (로컬 복구 번들)', () => {
  assert.match(features, /function applyFallbackTheme\(/);
  assert.match(features, /data-fallback-theme/, '복구 번들이 적용됐다는 표시');
  assert.match(features, /loading\.catch\(applyFallbackTheme\)/, '지연 CSS 실패를 잡는다');
  assert.match(features, /link\[href\*="css\/sagye\.css"\]/, '1.5초 뒤에도 없으면 복구');
  // 부트 카드는 첫 화면 단계의 같은 정책이다 (인라인 CSS) — 다만 정상 부팅에는 열리지 않는다
  assert.match(shell, /#boot\{position:fixed/);
  assert.match(shell, /<div id="boot"[^>]*hidden/, '로딩 화면이 아니라 실패 화면');
  assert.match(shell, /if \(!appReady\(\)\) show\(\)/, '실패했을 때만 연다');
});

test('③ 인증 서버 불통 — 타임아웃 뒤 게스트로 임시 입장', () => {
  assert.match(app, /function withTimeout\(promise, ms\)/);
  assert.match(app, /8000/, '8초에서 끊는다');
  assert.match(app, /withTimeout\(api\('\/api\/auth\/signup'/);
  assert.match(app, /withTimeout\(api\('\/api\/auth\/login'/);
  assert.match(app, /function showGuestEntry\(/);
  assert.match(app, /r\.status >= 500\) showGuestEntry/, '500 도 같은 길로');
  assert.match(app, /id="authGuest"/);
  assert.match(app, /인터넷 없이 게스트로 임시 입장/);
  assert.match(app, /data-act="guest-start"/);
  assert.match(app, /function startGuest\(/);
  assert.match(app, /maeumjeongwon\.guest\.v1/, '부트 셸과 같은 깃발');
  assert.match(app, /if \(act === 'guest-start'\) \{\s*startGuest\(\);/);
});

// ---------- ④ SCR-REP-003 ----------

test('④ 기록이 깨졌으면 대시보드 대신 복구 카드 — 화면이 죽지 않는다', () => {
  const { MJ_REPORT } = loadReport({ counsel: FEW, broken: true });
  const html = MJ_REPORT.counsel();
  assert.match(html, /기록을 읽지 못했어요/);
  assert.match(html, /data-act="counsel-reset"/);
  assert.doesNotMatch(html, /counsel-trend/, '깨진 기록으로 차트를 그리지 않는다');
  // 액션은 깨진 항목만 걷어 내고 순례 기록은 건드리지 않는다
  assert.match(app, /if \(act === 'counsel-reset'\)/);
  const action = app.slice(app.indexOf("if (act === 'counsel-reset')"), app.indexOf("if (act === 'guest-start')"));
  assert.equal(/visits|journal/.test(action), false, '순례·수첩 기록은 건드리지 않는다');
});

test('④ N<3 이면 차트 컴포넌트를 만들지 않는다 (씨앗 카드로 대체)', () => {
  const few = loadReport({ counsel: FEW });
  const stateA = few.MJ_REPORT.buildReport(FEW);
  assert.equal(stateA.hasEnoughData, false);
  assert.equal(stateA.mindGrowthSeed.seedStage, 1);
  assert.equal(stateA.analyticsData, undefined, '데이터가 없으면 분석 객체를 만들지 않는다');
  const htmlA = few.MJ_REPORT.counsel();
  assert.match(htmlA, /seed-card/);
  assert.match(htmlA, /마음 씨앗/);
  assert.doesNotMatch(htmlA, /counsel-trend/, '차트 마크업 자체가 없다');
  assert.doesNotMatch(htmlA, /tag-cloud/, '낱말 구름도 아직 없다');

  const many = loadReport({ counsel: MANY });
  const stateB = many.MJ_REPORT.buildReport(MANY);
  assert.equal(stateB.hasEnoughData, true);
  assert.ok(stateB.analyticsData.weeklyTrend.length >= 1);
  const htmlB = many.MJ_REPORT.counsel();
  assert.match(htmlB, /counsel-trend/);
  assert.match(htmlB, /line stable/, '안정 점선');
  assert.match(htmlB, /data-act="print"/, 'PDF 내보내기');
  assert.match(htmlB, /#불안/);
});

// ---------- ⑤ 적응형 데이터 매핑 ----------

test('⑤ 주간 감정선 — 불안·안정은 0~100 이고 서로를 보완한다', () => {
  const { MJ_REPORT } = loadReport({ counsel: MANY });
  const trend = MJ_REPORT.weeklyTrend(MANY);
  assert.ok(trend.length >= 2, '요일별로 묶인다');
  for (const p of trend) {
    assert.ok(p.anxietyScore >= 0 && p.anxietyScore <= 100, `불안 ${p.anxietyScore}`);
    assert.ok(p.stabilityScore >= 0 && p.stabilityScore <= 100, `안정 ${p.stabilityScore}`);
    assert.equal(p.anxietyScore + p.stabilityScore, 100);
    assert.ok('월화수목금토일'.split('').includes(p.dayOfWeek), `요일 ${p.dayOfWeek}`);
    assert.match(p.date, /^\d{4}-\d{2}-\d{2}$/, `날짜 ${p.date}`);
    assert.ok(typeof p.primaryEmotion === 'string' && p.primaryEmotion.length > 0);
  }
  // 마음 온도가 높은(평온한) 기록일수록 불안이 낮다
  assert.ok(MJ_REPORT.anxietyOf(MANY[4]) < MJ_REPORT.anxietyOf(MANY[0]));
});

test('⑤ 낱말 농도 — 빈도가 높을수록 High, 좌표는 화면 없이도 검산된다', () => {
  const { MJ_REPORT } = loadReport({ counsel: MANY });
  const tags = MJ_REPORT.topKeywords(MANY.concat(MANY, MANY, MANY));   // 감사 8회 · 불안 8회
  assert.ok(tags.length >= 2);
  assert.equal(tags[0].intensity, 'High');
  assert.ok(tags.every(t => ['High', 'Medium', 'Low'].includes(t.intensity)));
  assert.ok(tags.every((t, i, a) => i === 0 || a[i - 1].frequency >= t.frequency), '빈도 내림차순');
  const pts = MJ_REPORT.trendPoints([0, 50, 100], 100, 100, 10);
  assert.deepEqual(pts.map(p => p[1]), [90, 50, 10], '100 은 위, 0 은 아래');
  assert.equal(pts[0][0], 10);
  assert.equal(pts[2][0], 90);
});

test('⑤ 목업 두 케이스가 실제 상태 스키마와 맞는다', () => {
  const cases = JSON.parse(read('docs/mind-report-cases.json'));
  const A = cases.CASE_A_DATA_INSUFFICIENT;
  const B = cases.CASE_B_DATA_SUFFICIENT;
  assert.equal(A.hasEnoughData, false);
  assert.equal(A.analyticsData, undefined);
  assert.equal(A.mindGrowthSeed.seedStage, 1);
  assert.equal(B.hasEnoughData, true);
  assert.ok(B.analyticsData.weeklyTrend.length >= 3);
  assert.ok(B.analyticsData.topKeywords.length >= 3);
  assert.ok(B.analyticsData.topKeywords.every(k => ['High', 'Medium', 'Low'].includes(k.intensity)));
  assert.ok(B.analyticsData.weeklyTrend.every(p => /^\d{4}-\d{2}-\d{2}$/.test(p.date)));
  assert.ok(B.analyticsData.weeklyTrend.every(p => p.anxietyScore + p.stabilityScore === 100), '목업도 같은 불변식');

  // 목업 B 를 그대로 넣어도 화면이 그려진다 (스키마가 어긋나면 여기서 멈춘다)
  const { MJ_REPORT } = loadReport({ counsel: MANY });
  const html = MJ_REPORT.counsel(B);
  assert.match(html, /counsel-trend/);
  assert.match(html, /#새로운 도전/);
  // 목업 A 는 씨앗 카드
  assert.match(MJ_REPORT.counsel(A), /seed-card/);
  // 우리 계산 결과도 같은 모양이어야 한다
  const built = MJ_REPORT.buildReport(MANY);
  assert.deepEqual(Object.keys(built).sort(), ['hasEnoughData', 'lastUpdated', 'mindGrowthSeed', 'totalConsultationCount', 'analyticsData'].filter(k => k in built).sort());
});

test('⑤ ?demo=A · ?demo=B 로 두 상태를 브라우저에서 바로 볼 수 있다', () => {
  const a = loadReport({ search: '?demo=A' });
  assert.match(a.MJ_REPORT.counsel(), /seed-card/);
  const b = loadReport({ search: '?demo=B' });
  const htmlB = b.MJ_REPORT.counsel();
  assert.match(htmlB, /counsel-trend/);
  // 데모는 저장소를 건드리지 않는다
  assert.equal(b.store.saved, undefined);
});

// ---------- ⑥ 주소 규칙 (이 라운드에서 스모크가 잡아낸 실제 버그들) ----------

test('⑥ 해시 뒤 물음표는 경로가 아니다 — 데모 주소에서도 지연 자산을 받는다', () => {
  // 로더: '#/report?demo=B' 의 키는 'report' (예전에는 'report?demo=B' 라 자산이 통째로 빠졌다)
  const sandbox = { document: { createElement: () => ({ setAttribute() {}, appendChild() {} }), head: { appendChild() {} }, querySelector: () => null }, console };
  sandbox.window = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(read('js/lib/loader.js'), sandbox, { filename: 'js/lib/loader.js' });
  assert.equal(Array.from(sandbox.MJ_LOADER.needsFor('#/report?demo=A')).join(','), 'sagye');
  assert.equal(Array.from(sandbox.MJ_LOADER.needsFor('#/report')).join(','), 'sagye');
  assert.equal(sandbox.MJ_LOADER.needsFor('#/home?demo=A').indexOf('report'), -1);

  // 라우터: route 는 'report' — 화면 ID 와 전환 효과가 붙는다
  assert.match(app, /slice\(2\)\.split\('\?'\)\[0\]\.split\('\/'\)/);

  // 리포트 모듈: demo 는 해시의 물음표 뒤에서도 읽는다
  const A = loadReport({ search: '', hash: '#/report?demo=A' });
  assert.match(A.MJ_REPORT.counsel(), /seed-card/);
});

test('⑥ 계정 화면 인라인 폼도 같은 회복 정책을 따른다 (게스트 훅 · 8초 상한)', () => {
  const community = read('js/app/community.js');
  assert.match(community, /const API_TIMEOUT = 8000/, '무한 스피너 금지');
  assert.match(community, /Promise\.race\(\[/, '상한을 건다');
  assert.match(community, /function guestBlock\(\)/, '모달과 같은 블록');
  assert.match(community, /data-cm="guest"/);
  assert.match(community, /인터넷 없이 게스트로 임시 입장/);
  assert.match(community, /const netDown = r => !r \|\| r\.status === 0 \|\| r\.status >= 500/, '끊김과 5xx 를 같은 길로');
  assert.equal((community.match(/\$\{guestBlock\(\)\}/g) || []).length, 2, '로그인·가입 두 화면');
  assert.match(community, /if \(act === 'guest'\) \{ if \(window\.MJ_START_GUEST\)/);
});

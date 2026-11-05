'use strict';

/* 2026~2027 모바일 디자인 — 모션 · 질감 · 가변 컴포넌트 가드
 *
 * 붙여준 다섯 갈래(① 스크롤 주도형 ② 가변 컴포넌트·스켈레톤 ③ 마이크로 인터랙션
 * ④ 엄지 존 ⑤ 안티 퍼펙트 질감)가 화면에 실제로 걸려 있는지, 그리고 **축소 설정에서
 * 전부 꺼지는지**를 검사한다. 리포트/사경은 지연 자산이라 첫 화면 예산을 먹지 않는다.
 *
 * 가드 원칙: '멋'은 재지 않는다. 대신 (a) 움직임이 어디서 시작되는지, (b) 키보드·축소
 * 설정에서도 내용이 그대로 남는지, (c) 데이터가 늘면 정말 카드가 넓어지는지를 본다.
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

// report.js 를 가짜 창에서 실제로 돌린다 (상태별 마크업을 눈이 아니라 코드로 확인)
function reportHtml(counsel) {
  const store = {
    _c: counsel,
    counsel() { return this._c; },
    setCounsel(v) { this._c = v; },
    save() {}, broken() { return false; }, heal() {}
  };
  const sandbox = {
    console, location: { search: '', hash: '' }, URLSearchParams,
    document: { documentElement: {}, querySelector: () => null }, MJ_STORE: store
  };
  sandbox.window = sandbox;
  sandbox.getComputedStyle = () => ({ getPropertyValue: () => '' });
  vm.createContext(sandbox);
  vm.runInContext(read('js/app/report.js'), sandbox, { filename: 'js/app/report.js' });
  return { MJ_REPORT: sandbox.MJ_REPORT, html: sandbox.MJ_REPORT.counsel() };
}

const rec = (day, score) => ({ at: `2026-11-0${day}T09:00:00Z`, score, kw: ['불안'], mood: '지쳤어요', prompt: 'x' });
const THREE = [rec(1, 2), rec(2, 3), rec(3, 3.6)];
const SIX = [rec(1, 2), rec(2, 2.6), rec(3, 3), rec(4, 3.4), rec(5, 3.8), rec(5, 4.2)];

// ---------- ① 스크롤 주도형 ----------

test('① 헤더 축소 — 스크롤을 내리면 머리가 줄고 보더가 유리 한 줄로 바뀐다', () => {
  const topbar = css.slice(css.indexOf('body.scrolled .topbar{'), css.indexOf('body.scrolled .topbar{') + 700);
  assert.match(topbar, /padding-top:calc\(4px \+ var\(--safe-t\)\)/, '머리가 줄어든다');
  assert.match(topbar, /padding-bottom:4px/);
  assert.match(topbar, /backdrop-filter:saturate\(1\.6\) blur\(20px\)/, '리퀴드 글래스');
  assert.match(topbar, /color-mix\(in srgb,var\(--surface-1\) 74%,transparent\)/, '배경이 비친다');
  assert.match(css, /body\.scrolled \.brand-copy small\{opacity:0/, '부제는 접힌다');
  assert.match(css, /\.brand-mark,\.brand-copy small\{transition:transform var\(--dur-2\)/, '줄어드는 동안 튀지 않는다');
  // 좁은 화면·구형 브라우저에서도 읽힌다 (color-mix 폴백 · 축소 설정이면 전환 없음)
  assert.match(css, /@supports not \(background:color-mix\(in srgb,red 50%,transparent\)\)\{body\.scrolled \.topbar\{background:rgba\(var\(--paper-rgb\),\.86\)\}\}/);
  assert.match(css, /@media \(prefers-reduced-motion:reduce\)\{\.brand-mark,\.brand-copy small,\.topbar\{transition:none!important\}\}/);
  // 스크롤 감시는 한 번만 (스크롤 이벤트마다 DOM 을 만지지 않는다)
  assert.match(app, /classList\.toggle\('scrolled', on\)/);
});

test('① 차트 선 — 화면에 들어올 때 붓이 지나가듯 그려진다 (뷰 타임라인)', () => {
  const block = sagyeCss.slice(sagyeCss.indexOf('@supports (animation-timeline:view())'));
  assert.match(block, /\.counsel-trend \.line:not\(\.stable\)\{/, '점선(안정)은 그리지 않는다 — 이미 점선이다');
  assert.match(block, /stroke-dasharray:1200;stroke-dashoffset:1200/);
  assert.match(block, /animation-timeline:view\(\)/);
  assert.match(block, /animation-range:entry 8% cover 42%/, '화면에 들어온 뒤에 그린다');
  assert.match(block, /@keyframes trend-draw\{to\{stroke-dashoffset:0\}\}/);
  // 지원하지 않는 브라우저는 '완성된 화면' — @supports 밖에서는 dash 를 건드리지 않는다
  assert.equal(/^\s*\.counsel-trend \.line\{stroke-dasharray/m.test(sagyeCss), false);
  assert.match(sagyeCss, /@media \(prefers-reduced-motion:reduce\)\{[\s\S]*?\.counsel-trend \.line:not\(\.stable\)\{animation:none;stroke-dashoffset:0\}/);
});

// ---------- ② 가변 컴포넌트 · 스켈레톤 ----------

test('② 프로그레시브 → 벤토 — 3장은 두 칸, 6장부터 숫자 타일이 붙는다', () => {
  const three = reportHtml(THREE);
  assert.match(three.html, /class="report-bento" data-stage="basic"/);
  assert.match(three.html, /data-span="wide"/, '감정선 카드는 넓게');
  assert.equal(/bento-stats/.test(three.html), false, '3장에는 숫자를 늘어놓지 않는다');

  const six = reportHtml(SIX);
  assert.match(six.html, /class="report-bento" data-stage="grown"/);
  assert.match(six.html, /class="bento-stats"/, '쌓이면 타일이 생긴다');
  assert.equal((six.html.match(/class="tile"/g) || []).length, 3);
  assert.match(six.html, /<b>6<\/b><span>쌓인 장<\/span>/);

  // 1~2장은 여전히 씨앗 카드 — 벤토를 만들지 않는다
  const one = reportHtml([rec(1, 2)]);
  assert.match(one.html, /seed-card/);
  assert.equal(/report-bento/.test(one.html), false);

  // 좁은 화면 1열, 560px 부터 2열 + 넓은 카드는 두 칸
  assert.match(sagyeCss, /@media \(min-width:560px\)\{\s*\.report-bento\{grid-template-columns:repeat\(2,minmax\(0,1fr\)\)\}/);
  assert.match(sagyeCss, /\.report-bento>\[data-span=wide\]\{grid-column:1\/-1\}/);
  assert.match(sagyeCss, /\.bento-stats\{display:grid;grid-template-columns:repeat\(3,minmax\(0,1fr\)\)/);
});

test('② 영리한 스켈레톤 — 회색 상자가 아니라 답이 앉을 자리를 파형으로', () => {
  assert.match(features, /skel\.className = 'sagye-skel'/);
  assert.match(features, /skel\.setAttribute\('aria-hidden', 'true'\)/, '읽어 주지 않는다');
  assert.match(features, /<i><\/i><i><\/i><i><\/i>/, '세 줄 = 구절 · 실천 · 사찰');
  assert.match(sagyeCss, /\.sagye-skel i\{[^}]*animation:sagye-wave 1\.6s linear infinite/);
  assert.match(sagyeCss, /\.sagye-skel i:nth-child\(2\)\{width:88%;animation-delay:\.12s\}/, '줄마다 어긋나게');
  assert.match(sagyeCss, /@keyframes sagye-wave\{from\{background-position:120% 0\}to\{background-position:-60% 0\}\}/);
  assert.match(sagyeCss, /@media \(prefers-reduced-motion:reduce\)\{[\s\S]*?\.sagye-skel i\{animation:none;background:var\(--border-2\)\}/);
});

// ---------- ③ 마이크로 인터랙션 ----------

test('③ 인장을 찍는 손맛 — 눌림·반동·진동이 한 번에', () => {
  assert.match(sagyeCss, /\.seal-send:active\{transform:scale\(\.9\)\}/, '깊게 누른다');
  assert.match(sagyeCss, /\.seal-send\.is-stamped\{animation:seal-stamp 280ms cubic-bezier\(\.34,1\.56,\.64,1\)\}/, '튀어 오른다');
  assert.match(sagyeCss, /@keyframes seal-stamp\{0%\{transform:scale\(1\)\}30%\{transform:scale\(\.88\)\}72%\{transform:scale\(1\.05\)\}/);
  assert.match(features, /navigator\.vibrate\(8\)/, '짧은 촉각 피드백');
  assert.match(features, /classList\.add\('is-stamped'\)/);
  assert.match(features, /addEventListener\('animationend', function \(\) \{ submitBtn\.classList\.remove\('is-stamped'\); \}, \{ once: true \}\)/);
  // 모든 버튼의 눌림은 한 단계 더 (translateY 만 있던 것을 scale 로)
  assert.match(css, /\.btn:active\{transform:translateY\(1px\) scale\(\.97\)\}/);
  assert.match(sagyeCss, /@media \(prefers-reduced-motion:reduce\)\{[\s\S]*?\.seal-send\.is-stamped\{animation:none\}/);
});

// ---------- ④ 엄지 존 ----------

test('④ 하단 시트 · 입력 Clear — 손가락이 닿는 자리에 48dp', () => {
  assert.match(css, /--tap:48px/, '1차 행동 48dp');
  assert.match(css, /--tap-sm:44px/);
  // 시트는 아래에서 올라오고, 홈 인디케이터를 피한다
  const sheet = css.slice(css.indexOf('.sheet{background:var(--surface-1);border-radius:24px 24px 0 0'));
  assert.match(sheet, /border-radius:24px 24px 0 0/);
  assert.match(sheet, /padding:10px var\(--pad-x\) calc\(20px \+ var\(--safe-b\)\)/);
  assert.match(sheet, /\.sheet:before\{content:"";display:block;width:38px;height:4px/, '그랩 핸들');
  assert.match(css, /max-height:min\(90svh,900px\);overflow:auto;overscroll-behavior:contain/);
  // 텍스트필드 Clear(×) 는 44px — 최소 24dp 를 넘는다
  assert.match(sagyeCss, /\.sagye-clear\{position:absolute;right:2px;bottom:6px;[\s\S]*?width:var\(--tap-sm\);height:var\(--tap-sm\)/);
  // 가로로 흐르는 칩 줄은 마스크로 '더 있다'를 알린다
  assert.match(sagyeCss, /\.sagye-quick\{[\s\S]*?mask-image:linear-gradient\(90deg,#000 0 92%,transparent\)/);
});

// ---------- ⑤ 안티 퍼펙트 질감 · 타이포 분리 ----------

test('⑤ 한지 바탕에 32px 눈금 — 흰 화면(#FFFFFF) 대신 종이', () => {
  assert.match(css, /--grid-line:rgba\(26,20,18,\.032\);--grid-step:32px/, '낮');
  assert.match(css, /--grid-line:rgba\(242,237,231,\.04\);--grid-step:32px/, '저조도');
  const appRule = css.slice(css.indexOf('#app{'), css.indexOf('#app{') + 800);
  assert.match(appRule, /background-image:/);
  assert.match(appRule, /repeating-linear-gradient\(0deg,var\(--grid-line\) 0 1px,transparent 1px var\(--grid-step\)\)/);
  assert.match(appRule, /repeating-linear-gradient\(90deg,var\(--grid-line\) 0 1px,transparent 1px var\(--grid-step\)\)/);
  // 눈금은 배경에만 — 글자 위에 겹치는 의사요소를 두지 않는다
  assert.equal(/content:""[^}]*grid-line/.test(css), false);
  assert.equal(/#FFFFFF/i.test(appRule), false, '완전한 흰색을 쓰지 않는다');
});

test('⑤ 시스템 라벨은 고딕, 콘텐츠의 목소리는 명조 — 두 목소리를 섞는다', () => {
  assert.match(css, /--font-ui:"Apple SD Gothic Neo","Pretendard"/);
  assert.match(css, /--font-display:"NanumMyeongjo"/);
  assert.match(css, /h1,h2,h3\{font-family:var\(--font-display\)/, '콘텐츠 제목은 명조');
  assert.match(css, /h3\{font-size:1em;font-weight:700;font-family:var\(--font-ui\)\}/, '시스템 소제목은 고딕');
  assert.match(css, /\.brand-copy>b\{font-family:var\(--font-display\)/, '브랜드 워드마크는 캘리그래피 계열');
  assert.match(sagyeCss, /\.sagye-paper \.sagye-verse p\{font-family:var\(--font-display\);letter-spacing:\.01em\}/, '경전 구절은 명조');
});

// ---------- 지연 자산 · 예산 ----------

test('모험은 첫 화면을 무겁게 하지 않는다 — 리포트·사경에만 걸린다', () => {
  // 벤토·스크롤 드로잉·인장 반동은 모두 지연 자산(css/sagye.css)에 있다
  assert.equal(/report-bento/.test(css), false, '첫 화면 CSS 에 벤토 규칙 없음');
  assert.equal(/seal-stamp/.test(css), false);
  assert.equal(/animation-timeline/.test(css), false, '스크롤 타임라인은 사경 CSS 에서만');
  // 첫 화면에서 늘어난 것은 헤더 축소·눌림·눈금뿐 — 그 대신 사문(주석)을 문서로 옮겼다
  assert.ok(css.length < 112000, `style.css ${css.length}B`);
});

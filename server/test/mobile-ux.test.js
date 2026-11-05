'use strict';

/* 모바일 실무 가이드 적용 가드 (2026-11)
 *
 * 지키려는 것은 다섯 묶음이다.
 *   ① 손끝 — 48dp 터치 타깃 · 엄지 존(하단)의 주 행동
 *   ② 흐름 — 세로 우선 · 화면당 주 행동 하나
 *   ③ 읽기 — 본문 16px·행간 150% · WCAG 4.5:1(낮/저조도) · 저조도 모드
 *   ④ 조작 — 뒤로가기 1개 · 텍스트필드 Clear · 5개 이하면 펼침 · 수량은 스텝퍼 · 시트
 *   ⑤ 반응 — 누름·진행 상태가 눈에 보인다
 *
 * 브라우저에서만 확인되는 것(엄지가 실제로 닿는지, 대비의 '느낌')은 여기서 잡지 않는다.
 * 대신 리팩터링 한 번에 조용히 사라지는 '규칙'을 잡는다. 근거: docs/mobile-ux-guidelines.md
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..', '..');
const read = rel => fs.readFileSync(path.join(ROOT, rel), 'utf-8');

const css = read('css/style.css');
const shell = read('index.html');
const app = read('js/app.js');
const planner = read('js/app/planner.js');
const community = read('js/app/community.js');
const features = read('js/features.js');
const SOURCES = { 'js/app.js': app, 'js/app/planner.js': planner, 'js/app/community.js': community, 'js/features.js': features };

// 선택자 하나에 선언된 모든 속성(기본 규칙 + ⑯ 덮어쓰기 + @media 안의 변형)을 합쳐서 본다.
// '이 속성이 어딘가에서 지켜지고 있는가'를 묻는 검사라 마지막 값 하나만 보면 놓친다.
function declOf(selector) {
  const pat = selector.split(',').map(part => part.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('\\s*,\\s*');
  const re = new RegExp(pat + '\\{([^}]*)\\}', 'gm');
  let out = '', m;
  while ((m = re.exec(css))) out += m[1] + ';';
  return out;
}
// 선택자에 선언된 min-height 중 가장 큰 값(px). var(--tap)·var(--tap-sm) 도 해석한다.
function minHeightPx(selector) {
  const d = declOf(selector);
  let max = 0;
  for (const m of d.matchAll(/min-height:\s*(\d+)px/g)) max = Math.max(max, +m[1]);
  if (/min-height:var\(--tap\)/.test(d)) max = Math.max(max, 48);
  if (/min-height:var\(--tap-sm\)/.test(d)) max = Math.max(max, 44);
  return max;
}
function blockAfter(marker) {
  const i = css.indexOf(marker);
  assert.notEqual(i, -1, `CSS 에서 블록을 못 찾았다: ${marker}`);
  const rest = css.slice(i);
  const open = rest.indexOf('{');
  let depth = 0, end = open;
  for (let k = open; k < rest.length; k++) {
    if (rest[k] === '{') depth++;
    else if (rest[k] === '}') { depth--; if (depth === 0) { end = k; break; } }
  }
  return rest.slice(open + 1, end);
}
function tokensOf(src) {
  const out = {};
  for (const m of src.matchAll(/(--[a-z0-9-]+)\s*:\s*([^;]+);/g)) out[m[1]] = m[2].trim();
  return out;
}

test('① 1차 행동의 터치 타깃은 48dp — 칩은 44px + 히트 슬롭으로 48px', () => {
  assert.match(css, /--tap:48px/, '1차 행동(버튼·목록 행·입력)의 기준은 48px');
  assert.match(css, /--tap-sm:44px/, '상단 칩은 보이는 높이 44px');
  // 보이는 크기와 닿는 크기를 분리한다: 칩은 ::after 로 위아래 2px 씩 넓혀 48px 을 만든다
  assert.match(declOf('.chip'), /min-height:var\(--tap-sm\)/);
  assert.match(declOf('.chip'), /position:relative/);
  assert.match(declOf('.chip::after'), /position:absolute/);
  assert.match(declOf('.chip::after'), /inset:-2px -3px/);
  // 주요 컨트롤은 전부 48px 이상 (하드코딩된 작은 높이가 남아 있으면 손끝이 미끄러진다)
  for (const sel of ['.btn', '.tool-list a, .tool-list button', '.nav-btn, .onboard-opt, .sound-btn, .cm-check',
    '.backlink', '.step-btn', '.choice', '.titem', '.cm-row', '.sheet-close']) {
    assert.ok(minHeightPx(sel) >= 48, `${sel} 의 최소 높이가 ${minHeightPx(sel)}px — 48px 이상이어야 함`);
  }
  assert.match(declOf('.step-btn'), /width:var\(--tap\)/);
  assert.match(declOf('.sheet-close'), /width:var\(--tap\)/);
  assert.match(declOf('.field-clear'), /width:var\(--tap-sm\)/);
  // 좁은 폰이라고 손끝을 줄이지 않는다 (예전엔 34px 로 낮췄다)
  assert.equal(/\.chip\{[^}]*min-height:34px/.test(css), false, '320px 구간에서도 칩 높이는 유지한다');
});

test('① 주 행동은 엄지 존(화면 아래)에 있다 — 하단 탭 · 하단 고정 행동판', () => {
  assert.match(declOf('.tabbar'), /position:sticky/);
  assert.match(declOf('.tabbar'), /bottom:0/, '탭은 아래에 붙어 있어야 한 손으로 닿는다');
  assert.match(declOf('.actionbar'), /position:sticky/);
  assert.match(declOf('.actionbar'), /bottom:0/, '사찰 상세의 방문 인증·길찾기도 아래에 붙는다');
  assert.match(app, /class="actionbar[^"]*" aria-label="사찰 방문 행동"/);
  // 행동판은 모바일에서만 하단 고정, 넓은 화면에서는 일반 버튼 줄로 풀린다
  const wide = css.slice(css.indexOf('@media (min-width:1120px)'));
  assert.match(wide, /\.actionbar\{position:static/);
  assert.match(declOf('.actionbar'), /var\(--safe-b\)/, '홈 인디케이터 영역을 침범하지 않는다');
});

test('③ 본문은 16px 이상 · 행간 150% 이상 · 큰 글씨 모드는 더 크다', () => {
  assert.match(css, /--fs-base:clamp\(16px/, '본문 기준 16px (가이드: 16pt)');
  assert.match(declOf('body'), /font-size:var\(--fs\)/);
  assert.match(declOf('body'), /line-height:1\.6/, '본문 행간 1.6 = 160% (가이드: 150% 이상)');
  assert.match(declOf('body.big'), /--fs-base:clamp\(19px/);
  assert.match(declOf('body.big'), /--tap:56px/, '큰 글씨 모드에서는 손끝도 함께 커진다');
  // 긴 글(스토리)은 더 넉넉하게
  assert.match(declOf('.card.chapter p'), /line-height:1\.85/);
});

test('③ 글자·배경 대비는 낮과 저조도 모두 WCAG AA(4.5:1) 이상', () => {
  const light = { ...tokensOf(blockAfter('/* ---------- ⑮-1 토큰')), ...tokensOf(blockAfter('/* ② 시맨틱')) };
  const dark = { ...light, ...tokensOf(blockAfter(':root[data-theme=dark]{')) };

  const rgb = hex => {
    const s = String(hex).trim();
    const m6 = /^#([0-9a-f]{6})$/i.exec(s), m3 = /^#([0-9a-f]{3})$/i.exec(s);
    if (m6) { const n = parseInt(m6[1], 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
    if (m3) return [0, 1, 2].map(i => parseInt(m3[1][i] + m3[1][i], 16));
    return null;
  };
  const resolve = (name, set, depth = 0) => {
    if (depth > 12) return null;
    const v = set[name];
    if (!v) return null;
    const m = /^var\((--[a-z0-9-]+)\)$/.exec(v);
    return m ? resolve(m[1], set, depth + 1) : v;
  };
  const lum = c => {
    const f = x => { x /= 255; return x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4); };
    const [r, g, b] = c.map(f);
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const ratio = (a, b) => {
    const A = lum(a), B = lum(b);
    return (Math.max(A, B) + 0.05) / (Math.min(A, B) + 0.05);
  };

  // 실제로 겹쳐 쓰는 조합만 검사한다 (본문·보조·약한 보조·링크·강조색 위 글자·placeholder)
  const pairs = [
    ['--text-1', '--surface-2'], ['--text-2', '--surface-2'], ['--text-3', '--surface-2'],
    ['--text-3', '--surface-1'], ['--text-3', '--surface-sunken'],
    ['--text-1', '--tint-warm-2'], ['--text-2', '--tint-warm-2'],
    ['--pine', '--surface-2'], ['--pine-ink', '--pine-soft'], ['--clay', '--clay-soft'],
    ['--gold', '--surface-2'], ['--gold-ink', '--gold-soft'], ['--danger', '--surface-2'],
    ['--on-pine', '--pine'], ['--on-clay', '--clay'], ['--on-gold', '--gold'], ['--on-deep', '--pine-2'],
    ['--text-placeholder', '--surface-2']
  ];
  for (const [theme, set] of [['낮', light], ['저조도', dark]]) {
    for (const [fg, bg] of pairs) {
      const a = rgb(resolve(fg, set)), b = rgb(resolve(bg, set));
      assert.ok(a && b, `${theme}: ${fg} / ${bg} 를 해석하지 못했다`);
      const r = ratio(a, b);
      assert.ok(r >= 4.5, `${theme}: ${fg} on ${bg} = ${r.toFixed(2)}:1 — 4.5:1 미만`);
    }
  }
  // placeholder 는 '흐리게'가 목적이지만 글자다 — 4.5:1 을 지키는 선에서만 흐리게 둔다
  assert.notEqual(resolve('--text-placeholder', light), '#8e9a94', '예전 placeholder 색(2.89:1)으로 되돌리지 않는다');
});

test('③ 저조도 모드에서 깨지는 색값이 화면 템플릿에 남아 있지 않다', () => {
  // 인라인 background/fill 로 색을 직접 칠하면 테마가 바뀔 때 그 자리만 밝게 남는다
  for (const [file, src] of Object.entries(SOURCES)) {
    const hits = [...src.matchAll(/style="[^"]*(?:background|color)\s*:\s*#[0-9a-fA-F]{3,8}/g)].map(m => m[0]);
    assert.deepEqual(hits, [], `${file}: 테마를 따라오지 못하는 인라인 색 — 시맨틱 토큰/클래스로 옮기세요`);
    // SVG 안에서는 var() 를 못 읽으므로 themeColor() 로 계산된 값을 넣는다
    if (file === 'js/app.js') assert.equal(/fill="#[0-9a-fA-F]{6}"/.test(src), false, 'SVG 글자는 themeColor() 를 쓴다');
  }
  assert.match(css, /\.panel-soft\{background:var\(--surface-3\)/);
  assert.match(css, /\.panel-plain\{background:var\(--surface-2\)/);
  assert.match(app, /function themeColor\(/, 'SVG 안의 색은 계산된 토큰값으로');
});

test('④ 화면당 뒤로가기는 하나 — 상단 좌우에 중복 배치하지 않는다', () => {
  const views = app.split(/\n  function (view[A-Za-z0-9_]*)/).slice(1);
  for (let i = 0; i < views.length; i += 2) {
    const name = views[i], body = views[i + 1];
    const n = (body.match(/class="backlink"/g) || []).length;
    assert.ok(n <= 1, `${name} 에 뒤로가기가 ${n}개 — 화면당 1개만 둔다`);
  }
  // 시스템 뒤로가기(모바일 제스처)를 가로채지 않는다
  assert.equal(/popstate/.test(app) && /history\.pushState\([^)]*function/.test(app), false);
});

test('④ 텍스트필드에는 Clear(×) 버튼이 붙는다 — 검색칸도 예외가 아니다', () => {
  assert.match(app, /function enhanceFields\(/, '필드 강화는 한 곳에서 (템플릿 60여 곳에 손으로 넣지 않는다)');
  assert.match(app, /const CLEARABLE = '[^']*input\[type=search\]/);
  assert.equal(/CLEARABLE = '[^']*password/.test(app), false, '비밀번호는 지우기 버튼을 두지 않는다(노출 방지)');
  assert.match(app, /'입력한 내용 지우기'/, '스크린리더용 이름');
  // 지우면 'input' 이벤트까지 되돌려 검색 결과가 즉시 따라온다
  assert.match(app, /inp\.dispatchEvent\(new Event\('input', \{ bubbles: true \}\)\)/);
  assert.match(declOf('.field-clear'), /position:absolute/);
  assert.match(declOf('.field-clear\[hidden\]'), /display:none/);
  assert.match(app, /enhanceFields\(\$view\)/, '화면을 그린 뒤 매번 적용');
  assert.match(app, /enhanceFields\(m\)/, '모달 시트 안의 입력에도 적용');
  // 탐색의 별도 '지우기' 칩은 인풋 안의 ×로 흡수했다 (같은 일을 하는 버튼 두 개를 두지 않는다)
  assert.equal(/id="eclear"/.test(app), false);
});

test('④ 옵션이 5개 이하면 펼치고, 7개 이상만 드롭다운을 쓴다', () => {
  assert.match(declOf('.choices'), /display:grid/);
  assert.match(declOf('.choice'), /min-height:var\(--tap\)/);
  // 선택 상태를 색 하나로 알리지 않는다 — 체크 표시 + 테두리 + 굵기
  assert.match(declOf('.choice\[aria-pressed=true\]'), /border-color:var\(--pine\)/);
  assert.match(declOf('.choice .ic'), /opacity:0/);
  assert.match(declOf('.choice\[aria-pressed=true\] .ic'), /opacity:1/);
  assert.match(app, /data-choice="\$\{esc\(o\)\}" aria-pressed=/, '값과 상태를 함께 그린다');
  assert.match(app, /if \(el\.dataset\.choice != null\)/, '클릭 한 곳에서 처리(모듈 화면도 같은 규칙)');

  // 실제 적용: 수첩 날씨 5개 · 여행 기간 5개 · 이동 수단 4개 · 게시판 글 종류 3개
  assert.match(app, /choiceGroup\('weather'/);
  assert.match(planner, /choiceGroup\('days'/);
  assert.match(planner, /choiceGroup\('transport'/);
  assert.match(community, /Object\.entries\(CATS\)\.map/);
  // 반대쪽 경계: 동행 스타일 7개는 드롭다운으로 남긴다
  assert.match(planner, /<select name="companion">\$\{selOpts\(COMPANION_OPTS/);

  // 정적으로 셀 수 있는 <select> 중 5개 이하 옵션은 없어야 한다
  for (const [file, src] of Object.entries(SOURCES)) {
    for (const m of src.matchAll(/<select\b[^>]*>([\s\S]*?)<\/select>/g)) {
      const body = m[1];
      if (body.includes('${')) continue;             // 데이터로 채우는 목록은 이 검사로 셀 수 없다
      const n = (body.match(/<option/g) || []).length;
      assert.ok(n === 0 || n >= 6, `${file}: 옵션 ${n}개짜리 드롭다운 — 5개 이하면 .choices 로 펼치세요`);
    }
  }
});

test('④ 수량은 드롭다운이 아니라 스텝퍼로 고른다', () => {
  assert.match(declOf('.stepper'), /display:inline-flex/);
  assert.match(declOf('.step-value'), /tabular-nums/);
  assert.match(app, /function stepperGroup\(/);
  assert.match(app, /if \(el\.dataset\.step != null\)/, '한 걸음 = 한 번의 탭');
  assert.match(app, /aria-live="polite"/, '값이 바뀌면 스크린리더가 읽는다');
  assert.match(app, /disabled = next <= min/, '경계에서 버튼이 잠긴다');
  assert.match(planner, /stepperGroup\('people'/, '여행 계획의 인원이 스텝퍼로 들어간다');
  assert.match(planner, /people: Math\.max\(1, parseInt\(fd\.get\('people'\), 10\) \|\| 1\)/);
  // 인원을 select 로 고르게 하지 않는다
  assert.equal(/<select[^>]*name="people"/.test(planner), false);
});

test('④ 무거운 대화상자 대신 하단 시트 — 닫기 경로가 항상 보인다', () => {
  assert.match(declOf('.sheet'), /border-radius:24px 24px 0 0/);
  assert.match(declOf('.sheet'), /max-height:min\(90svh,900px\)/);
  assert.match(declOf('.sheet'), /overscroll-behavior:contain/);
  assert.match(declOf('.sheet-close'), /width:var\(--tap\)/, '닫기 버튼도 손끝 크기');
  assert.match(app, /sheet-close/, '시트에는 항상 닫기 버튼을 주입한다');
  assert.match(css, /body\.modal-open\{overflow:hidden\}/);
});

test('⑤ 조작에는 즉각적인 피드백이 있다 — 누름 · 진행(aria-busy) · 대기(스켈레톤)', () => {
  // 누름: 행·카드가 배경과 테두리로 먼저 반응한다 (움직임을 줄인 사용자에게도 보인다)
  assert.match(css, /\.titem:active,\.rail-item:active[^{]*\{[^}]*background:var\(--pine-soft\)/);
  assert.match(css, /@keyframes mj-spin/);
  assert.match(css, /\.btn\[aria-busy=true\]::before\{[^}]*animation:mj-spin/);
  assert.match(css, /@media \(prefers-reduced-motion:reduce\)\{\.btn\[aria-busy=true\]::before\{animation-duration:/);
  assert.match(app, /function markBusy\(/, '오래 걸리는 제출은 잠그고 스피너를 보여 준다');
  assert.match(app, /btn\.setAttribute\('aria-busy', String\(!!on\)\)/);
  assert.match(app, /markBusy\(btn, true\)/, '수첩 저장(사진 축소)에도 적용');
  assert.match(app, /const setBusy = on => btns\.forEach\(b => markBusy\(b, on\)\)/, '로그인·가입도 같은 상태를 쓴다');
  // 대기: 빈 화면 대신 스켈레톤, 결과 0건에는 다음 행동
  assert.match(declOf('.skel'), /display:flex/);
  assert.match(declOf('.empty'), /display:flex/);
  assert.match(shell, /class="boot-splash"/);
});

test('⑤ 첫 화면은 가볍게 — 지연 로딩 표가 그대로 유지된다', () => {
  // 이 라운드에서 CSS/JS 가 늘었으므로, 첫 화면이 무거워지지 않았는지 예산 도구와 함께 본다
  assert.match(shell, /js\/lib\/loader\.js/, '지연 로더를 첫 화면에서 먼저 받는다');
  assert.equal(/<script[^>]+src="js\/app\/planner\.js/.test(shell), false, '계획 모듈은 계획 화면에서만 받는다');
  assert.equal(/<script[^>]+src="js\/features\.js/.test(shell), false, '부가 기능은 첫 렌더 뒤 SOFT 자산');
});

'use strict';

// 화면(모바일 ↔ 태블릿 ↔ 웹 데스크톱) 최적화가 무너지지 않는지 guarding 하는 정적 검사.
// 실제 브라우저 레이아웃 검사 대신 '규칙이 사라지지 않았는지'를 확인한다 — 리팩터링 시 깨지기 쉬운 항목만 골랐다.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { buildSeo } = require('../../tools/build-seo');

const root = path.join(__dirname, '..', '..');
const css = fs.readFileSync(path.join(root, 'css', 'style.css'), 'utf-8');
const shellHtml = fs.readFileSync(path.join(root, 'index.html'), 'utf-8');
const appJs = fs.readFileSync(path.join(root, 'js', 'app.js'), 'utf-8');

// @media 블록 안까지 보려면 '규칙이 속한 블록 전체'를 봐야 하므로, 선언부는 파일 전체에서 찾는다.
function declOf(selector) {
  const re = new RegExp(selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\{([^}]*)\\}', 'm');
  const m = re.exec(css);
  return m ? m[1] : '';
}

test('1. 앱 셸은 노치·홈인디케이터를 포함해 뷰포트를 따른다', () => {
  assert.match(shellHtml, /<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover"/);
  assert.match(css, /@supports \(padding-bottom:env\(safe-area-inset-bottom\)\)/);
  assert.match(css, /--safe-t:env\(safe-area-inset-top,0px\)/);
  assert.match(css, /--safe-b:env\(safe-area-inset-bottom,0px\)/);
  // 하단 탭·토스트·하단 시트가 안전 영역을 침범하지 않는다
  assert.match(declOf('.tabbar'), /var\(--safe-b\)/);
  assert.match(declOf('#toast'), /var\(--safe-b\)/);
  assert.match(declOf('.sheet'), /var\(--safe-b\)/);
});

test('2. 브레이크포인트 5단계(큰 폰·태블릿·노트북·와이드·울트라와이드)와 가로모드 규칙이 있다', () => {
  for (const w of [560, 760, 1120, 1440, 1760]) {
    assert.ok(css.includes(`@media (min-width:${w}px)`), `브레이크포인트 누락: ${w}px`);
  }
  assert.match(css, /@media \(max-height:\d+px\) and \(orientation:landscape\)/);
  assert.match(css, /@media \(max-width:\d+px\)/);   // 320~380px 초소형 폰 완충
});

test('3. 데스크톱에서는 모바일 프레임 고정(480px)이 아니라 캐버스를 다 쓴다', () => {
  assert.equal(css.includes('max-width:480px'), false, '480px 하드 캡은 데스크톱에서 화면을 버린다');
  assert.match(declOf('#app'), /max-width:var\(--shell\)/);
  // 하단 고정 탭바가 아니라 그리드 행에 붙은 스티키 내비 → 창 크기·주소창 접힘에 흔들리지 않음
  assert.match(declOf('.tabbar'), /position:sticky/);
  assert.equal(/\.tabbar\{[^}]*position:fixed/.test(css), false);
  // 1120px 이상에서는 좌측 사이드 내비로 재배치
  const desktop = css.slice(css.indexOf('@media (min-width:1120px)'));
  assert.match(desktop.slice(0, desktop.indexOf('@media', 30)), /grid-template-areas:"rail top"/);
  assert.match(desktop, /\.tabbar::before\{[^}]*content:"메뉴"/);
  assert.match(desktop, /main\{width:min\(100%,var\(--read\)\)/);
});

test('4. 열 개수는 고정이지 않고 남는 폭에서 계산된다 (auto-fill · minmax)', () => {
  for (const sel of ['.moods', '.badges', '.dex']) {
    assert.match(declOf(sel), /repeat\(auto-fill,minmax\(/, `${sel} 은 auto-fill 로 열을 늘려야 함`);
  }
  // narrow→wide 확장 규칙도 유지 (목록·요금제·배지)
  assert.match(css, /\.tlist\{grid-template-columns:repeat\(auto-fill,minmax\(/);
  assert.match(css, /\.plans\{grid-template-columns:repeat\(auto-fit,minmax\(/);
});

test('5. 모바일 브라우저 UI(주소창)가 접혀도 본문·지도가 잘리지 않는다', () => {
  assert.match(declOf('#app'), /min-height:100vh;min-height:100svh/);
  assert.match(css, /#map,#pmap\{[^}]*height:58vh/);                     // svh 미지원 브라우저 폴백
  assert.match(css, /#map,#pmap\{height:clamp\(320px,58svh,660px\)\}/);  // 우선 적용
  assert.match(declOf('.sheet'), /max-height:88vh/);
  assert.match(declOf('.sheet'), /min\(90svh,900px\)/);
});

test('6. 터치 타깃 44px · iOS 입력 확대(16px) 방지 · 큰 글씨 모드도 유동 스케일', () => {
  assert.match(css, /--tap:44px/);
  assert.match(declOf('.btn'), /min-height:var\(--tap\)/);
  assert.match(declOf('.tabbar a'), /min-height:var\(--tabbar-h\)/);
  assert.match(declOf('input,textarea,select'), /font-size:max\(16px,1em\)/);
  assert.match(declOf('input:not\(\[type=checkbox\]\):not\(\[type=radio\]\),select'), /min-height:var\(--tap\)/);
  // 큰 글씨 모드는 px 하드코딩이 아니라 '기저 크기'를 교체해서 어떤 화면에서도 같이 커진다
  assert.match(css, /--fs-base:clamp\(15px, \.55vw \+ 13px, 17\.5px\)/);
  assert.match(css, /body\{--fs:var\(--fs-base\);[^}]*font-size:var\(--fs\)/);
  assert.match(declOf('body.big'), /--fs-base:clamp\(18px/);
});

test('7. 지도는 화면 회전·창 리사이즈에 다시 맞고, 모달은 배경 스크롤을 잠근다', () => {
  assert.match(appJs, /window\.addEventListener\('resize', fitMap\)/);
  assert.match(appJs, /window\.addEventListener\('orientationchange', fitMap\)/);
  assert.match(appJs, /mapObj\.invalidateSize\(/);
  assert.match(appJs, /document\.body\.classList\.add\('modal-open'\)/);
  assert.match(appJs, /document\.body\.classList\.remove\('modal-open'\)/);
  assert.match(css, /body\.modal-open\{overflow:hidden\}/);
  assert.match(appJs, /e\.key !== 'Escape'/);   // 웹(키보드) 종료 경로
});

test('8. 넓은 화면 카드 재배치 훅(data-flow)이 CSS와 짝을 이룬다', () => {
  assert.match(appJs, /WIDE_FLOW\.includes\(route\) && a !== 'new' \? 'cards' : ''/);
  assert.match(appJs, /\$view\.dataset\.flow = /);
  assert.match(appJs, /\$view\.dataset\.route = /);
  const wide = css.slice(css.indexOf('@media (min-width:1440px)'));
  assert.ok(wide.includes('main[data-flow=cards]{display:grid'), 'flow=cards 일 때만 카드 재배치');
  assert.ok(wide.includes('>*{grid-column:1/-1}'), '기본은 가로 전체로 두고 카드만 예외');
  assert.ok(wide.includes('>.card:not(.hero)'), '히어로·배너는 계속 가로 전체');
  // 계획·수첩 '새로 쓰기' 폼은 2열로 갈라지면 안 되므로 flow 대상에서 제외
  assert.equal(/data-flow=cards\][^{]*form/.test(css), false);
});

test('9. 정적 SEO 페이지도 유동 폭·노치 대응으로 빌드된다', () => {
  const out = fs.mkdtempSync(path.join(os.tmpdir(), 'mj-resp-'));
  try {
    buildSeo(out, { siteUrl: 'https://example.test', env: {} });
    const files = [];
    (function walk(dir) {
      for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, ent.name);
        if (ent.isDirectory()) walk(full);
        else if (ent.name.endsWith('.html')) files.push(full);
      }
    })(out);
    assert.ok(files.length > 0);
    for (const f of files) {
      const html = fs.readFileSync(f, 'utf-8');
      assert.match(html, /<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover"/, f);
      assert.match(html, /<meta name="theme-color" content="#f6f1e7"/, f);
      assert.match(html, /width:min\(100% - 32px, 780px\)/, `본문 열이 유동이어야 함: ${f}`);
      assert.equal(html.includes('max-width:680px'), false, `고정 폭으로 되돌리면 안 됨: ${f}`);
    }
  } finally {
    fs.rmSync(out, { recursive: true, force: true });
  }
});

test('10. 앱 셸에는 여전히 웹 광고 코드가 없다 (반응형 작업으로 유입 금지)', () => {
  for (const [name, src] of [['index.html', shellHtml], ['js/app.js', appJs], ['css/style.css', css]]) {
    assert.equal(/adsbygoogle|googlesyndication/.test(src), false, name);
  }
});

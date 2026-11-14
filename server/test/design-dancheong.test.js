'use strict';

/* 단청 대시보드 (2026-11) 가드 — 홈의 새 조각과 그 약속.
 *
 *   ① 공지 띠는 흐르지만, 움직임을 줄인 사용자에게는 멈추고 손으로 민다
 *   ② 빠른 실행 바·기능 타일·도구함·권역 띠·도감·상담 버튼이 기존 행동(data-act·라우트)만 부른다
 *   ③ 단청 빛깔은 토큰으로만 — 낮·저조도 모두 4.5:1 (타일 글자·띠 글자)
 *   ④ 떠 있는 버튼은 fixed 가 아니라 sticky — 데스크톱 레일·하단 탭 레이아웃을 깨지 않는다
 *
 * 근거: docs/design-dancheong.md
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..', '..');
const read = rel => fs.readFileSync(path.join(ROOT, rel), 'utf-8');
const css = read('css/style.css');
const app = read('js/app.js');
const shell = read('index.html');

function blockIn(src, marker) {
  const i = src.indexOf(marker);
  assert.notEqual(i, -1, `블록을 못 찾았다: ${marker}`);
  const rest = src.slice(i);
  const open = rest.indexOf('{');
  let depth = 0, end = open;
  for (let k = open; k < rest.length; k++) {
    if (rest[k] === '{') depth++;
    else if (rest[k] === '}') { depth--; if (depth === 0) { end = k; break; } }
  }
  return rest.slice(open + 1, end);
}
const tokens = src => Object.fromEntries([...src.matchAll(/(--[a-z0-9-]+)\s*:\s*([^;]+);/g)].map(m => [m[1], m[2].trim()]));
const LIGHT = tokens(blockIn(css, '/* ---------- ⑮-1 토큰'));
const DARK = tokens(blockIn(css, ':root[data-theme=dark]{'));

test('① 공지 띠 — 흐르되, 움직임을 줄이면 멈추고 가로로 민다', () => {
  assert.match(app, /class="ticker" role="region" aria-label="오늘의 안내"/);
  assert.match(app, /<span aria-hidden="true">\$\{tickerItems\}<\/span>/, '이어 붙인 두 번째 줄은 리더기가 두 번 읽지 않는다');
  assert.match(css, /@keyframes mj-tick\{to\{transform:translateX\(-50%\)\}\}/);
  assert.ok(css.includes('@media (prefers-reduced-motion:reduce){.ticker-move{animation:none}.ticker-move span+span{display:none}.ticker-track{overflow-x:auto}}'));
});

test('② 홈의 새 조각은 이미 있는 행동만 부른다 (새 기능·새 데이터 없음)', () => {
  const home = app.slice(app.indexOf('function viewHome()'), app.indexOf('function greetPart()'));
  for (const piece of ['ticker', 'quickBar', 'featTiles', 'toolsDrop', 'portBars', 'dexCard', 'fab']) {
    assert.match(home, new RegExp(`\\$\\{${piece}\\}`), `홈에 ${piece} 가 그려진다`);
  }
  const acts = [...home.matchAll(/data-act="([a-z-]+)"/g)].map(m => m[1]);
  const handled = new Set([...app.matchAll(/act === '([a-z-]+)'/g)].map(m => m[1]));
  for (const a of acts) assert.ok(handled.has(a), `처리기가 없는 data-act: ${a}`);
  // 단골 사찰은 내가 남긴 방문(표본 제외)이 있으면 그것, 없으면 오늘의 처방
  assert.match(home, /S\.visits\.filter\(x => !x\.sample\)\.slice\(-1\)\[0\]/);
  // 권역 띠는 사찰 표(TEMPLES)에서 바로 거른다 — 펼치기는 <details> 라 JS 없이도 열린다
  assert.match(home, /<details class="pbar b\$\{i \+ 1\}">/);
  assert.match(shell, /<symbol id="i-star"/, '빠른 실행 바의 별 아이콘');
});

test('③ 단청 빛깔은 토큰 — 낮·저조도 모두 채워져 있고 글자 대비 4.5:1', () => {
  const rgb = h => { const n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
  const lum = c => { const f = x => { x /= 255; return x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4); }; const [r, g, b] = c.map(f); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
  const ratio = (a, b) => { const A = lum(rgb(a)), B = lum(rgb(b)); return (Math.max(A, B) + 0.05) / (Math.min(A, B) + 0.05); };
  const pairs = [['--hl-ink', '--hl'], ['--ink', '--hl'], ['--on-band', '--band-2'], ['--on-band', '--band-4'],
    ['--on-band', '--band-6'], ['--on-band', '--band-8'], ['--on-band', '--fab-1'], ['--on-band', '--fab-2']];
  for (const c of ['blue', 'green', 'orange', 'yellow', 'pink', 'purple']) pairs.push([`--tile-${c}-ink`, `--tile-${c}`]);
  for (const [name, set] of [['낮', LIGHT], ['저조도', DARK]]) {
    for (const [fg, bg] of pairs) {
      assert.ok(set[fg] && set[bg], `${name}: ${fg}/${bg} 토큰이 있어야 함`);
      const r = ratio(set[fg], set[bg]);
      assert.ok(r >= 4.5, `${name}: ${fg} on ${bg} = ${r.toFixed(2)}:1`);
    }
  }
  // 두툼한 남색 테두리는 시맨틱 한 이름으로만 부른다
  assert.match(blockIn(css, '/* ② 시맨틱'), /--border-strong:var\(--ink\)/);
  assert.match(css, /\.feat\{[^}]*border:2\.5px solid var\(--border-strong\)/);
  assert.match(css, /\.qchip\{[^}]*min-height:var\(--tap\)/, '빠른 실행 칩도 48dp');
});

test('④ 떠 있는 상담 버튼은 sticky — 하단 탭 위에 뜨고 레이아웃을 깨지 않는다', () => {
  const rule = /\.fab-wrap\{([^}]*)\}/.exec(css);
  assert.ok(rule, '.fab-wrap 규칙');
  assert.match(rule[1], /position:sticky/);
  assert.match(rule[1], /bottom:calc\(var\(--tabbar-h\) \+ var\(--safe-b\)/);
  assert.equal(/\.fab(?:-wrap)?\{[^}]*position:fixed/.test(css), false);
});

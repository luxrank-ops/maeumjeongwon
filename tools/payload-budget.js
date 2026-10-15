'use strict';

/* 첫 화면 전송량 예산 — "처음 열었을 때 실제로 받는 파일"과 "화면에 들어갈 때 받는 파일"을 나눠서 잰다.
 *
 * 사용법: npm run budget          (표만 출력)
 *        npm run budget -- --check (예산을 넘으면 종료 코드 1 — CI/verify 에 붙일 때)
 *
 * 파일 목록을 손으로 적지 않는다. 첫 화면은 index.html 을 파싱해서, 지연 자산은 js/lib/loader.js 의
 * ASSETS 표를 그대로 읽어서 얻는다(표가 바뀌면 예산도 따라 바뀐다).
 */

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const zlib = require('zlib');

const ROOT = path.join(__dirname, '..');

// 예산: 첫 화면 gzip 합계(KB). 넘으면 --check 가 실패한다.
const BUDGET = { firstScreenGzipKB: 140 };

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel));
}

function gzipLen(buf) {
  return zlib.gzipSync(buf, { level: 6 }).length;
}

function fileRow(rel) {
  const buf = read(rel);
  return { file: rel, raw: buf.length, gzip: gzipLen(buf) };
}

// index.html 이 부르는 것 = 첫 화면이 받는 것
function firstScreenFiles() {
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf-8');
  const out = [];
  for (const m of html.matchAll(/<script[^>]+src="([^"]+)"/g)) out.push(m[1]);
  for (const m of html.matchAll(/<link[^>]+href="([^"]+)"/g)) {
    const url = m[1];
    if (/^(?:data:|https?:)/.test(url)) continue;   // 인라인 아이콘·외부 CDN 은 제외
    out.push(url);
  }
  return [...new Set(out.map(u => u.split('?')[0].replace(/^\//, '')))];
}

// js/lib/loader.js 의 ASSETS 표를 그대로 실행해서 읽는다 (표를 복사하지 않는다)
function lazyAssets() {
  const src = fs.readFileSync(path.join(ROOT, 'js', 'lib', 'loader.js'), 'utf-8');
  const sandbox = { console };
  sandbox.window = sandbox;
  sandbox.document = { createElement: () => ({}), head: { appendChild() {} } };
  vm.runInNewContext(src, sandbox, { filename: 'js/lib/loader.js' });
  const loader = sandbox.MJ_LOADER;
  const assets = [];
  for (const [key, def] of Object.entries(loader.ASSETS)) {
    const files = [...(def.css || []), ...(def.js || [])];
    const rows = files.map(fileRow);
    assets.push({
      key,
      files: rows,
      raw: rows.reduce((n, r) => n + r.raw, 0),
      gzip: rows.reduce((n, r) => n + r.gzip, 0)
    });
  }
  // 어떤 라우트가 어떤 자산을 받는가 (필요한 것만 받는지 눈으로 확인)
  const routes = Object.entries(loader.NEEDS).map(([route, keys]) => ({
    route: '#' + '/' + route,
    keys,
    gzip: keys.reduce((n, k) => n + (assets.find(a => a.key === k)?.gzip || 0), 0)
  }));
  return { assets, routes, version: loader.VERSION };
}

function kb(n) {
  return (n / 1024).toFixed(1);
}

function table(title, rows) {
  console.log(`\n${title}`);
  console.log('  ' + '파일'.padEnd(28) + '원본'.padStart(10) + 'gzip'.padStart(10));
  for (const r of rows) {
    console.log('  ' + r.file.padEnd(28) + (kb(r.raw) + 'KB').padStart(10) + (kb(r.gzip) + 'KB').padStart(10));
  }
  const raw = rows.reduce((n, r) => n + r.raw, 0);
  const gzip = rows.reduce((n, r) => n + r.gzip, 0);
  console.log('  ' + '합계'.padEnd(28) + (kb(raw) + 'KB').padStart(10) + (kb(gzip) + 'KB').padStart(10));
  return { raw, gzip };
}

function main() {
  const first = firstScreenFiles().map(f => {
    if (!fs.existsSync(path.join(ROOT, f))) {
      console.error(`index.html 이 없는 파일을 가리킨다: ${f}`);
      process.exit(2);
    }
    return fileRow(f);
  });
  const firstTotal = table('첫 화면 (index.html 이 직접 받는 것)', first);

  const { assets, routes, version } = lazyAssets();
  console.log(`\n지연 자산 (loader.js VERSION=${version}) — 그 화면에 들어갈 때 받는다`);
  console.log('  ' + '자산'.padEnd(28) + '파일'.padStart(6) + '원본'.padStart(10) + 'gzip'.padStart(10));
  for (const a of assets) {
    console.log('  ' + a.key.padEnd(28) + String(a.files.length).padStart(6) + (kb(a.raw) + 'KB').padStart(10) + (kb(a.gzip) + 'KB').padStart(10));
  }

  console.log('\n라우트별 추가 전송량 (첫 화면 + 아래 값)');
  for (const r of routes) {
    console.log('  ' + r.route.padEnd(28) + (r.keys.join(', ') || '—').padEnd(26) + (kb(r.gzip) + 'KB').padStart(8));
  }

  const budgetKb = BUDGET.firstScreenGzipKB;
  const ok = firstTotal.gzip <= budgetKb * 1024;
  console.log(`\n예산: 첫 화면 gzip ${kb(firstTotal.gzip)}KB / ${budgetKb}KB — ${ok ? '통과' : '초과'}`);
  if (!ok) {
    console.log('  넘었다면: index.html 에 스크립트를 더 넣지 말고 js/lib/loader.js 의 NEEDS 로 옮기세요.');
  }
  process.exit(process.argv.includes('--check') && !ok ? 1 : 0);
}

main();

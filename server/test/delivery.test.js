'use strict';

// 전송 효율 가드 — 압축(gzip) · 캐시 정책 · 서버 헤더.
// 앱 셸은 JS 700KB를 내려받는 구조라, 여기가 무너지면 첫 화면이 통째로 느려진다.

const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const zlib = require('node:zlib');
const fs = require('node:fs');
const path = require('node:path');
const { createApp } = require('../app');

const ROOT = path.join(__dirname, '..', '..');

function startServer() {
  const app = createApp({ now: () => Date.UTC(2026, 9, 9), devAdReward: true, devEntitlement: true });
  return new Promise(resolve => {
    const server = http.createServer(app);
    server.listen(0, '127.0.0.1', () => {
      const base = `http://127.0.0.1:${server.address().port}`;
      async function get(pathname, headers = {}) {
        const res = await fetch(base + pathname, { headers });
        const buf = Buffer.from(await res.arrayBuffer());
        return { status: res.status, headers: res.headers, buf, text: buf.toString('utf8') };
      }
      // fetch 는 gzip 을 자동 해제해 버려서 '실제 전송 바이트'를 볼 수 없다 → 날 것의 http 로도 받아 둔다
      function rawGet(pathname, headers = {}) {
        return new Promise((resolve, reject) => {
          const req = http.get(base + pathname, { headers }, res => {
            const chunks = [];
            res.on('data', c => chunks.push(c));
            res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, buf: Buffer.concat(chunks) }));
          });
          req.on('error', reject);
        });
      }
      resolve({ get, rawGet, base, close: () => new Promise(r => server.close(r)) });
    });
  });
}

test('1. 텍스트 자산은 gzip으로 내려보낸다 (앱 셸 JS 약 1/3 크기)', async () => {
  const s = await startServer();
  try {
    for (const target of ['/js/app.js', '/js/data-temples.js', '/css/style.css', '/index.html']) {
      const gz = await s.rawGet(target, { 'Accept-Encoding': 'gzip' });
      const raw = await s.rawGet(target, { 'Accept-Encoding': 'identity' });
      assert.equal(gz.headers['content-encoding'], 'gzip', `${target} gzip 인코딩`);
      assert.match(String(gz.headers.vary || ''), /accept-encoding/i, `${target} Vary`);
      assert.ok(gz.buf.length < raw.buf.length * 0.6, `${target} 압축 효과 (${raw.buf.length} → ${gz.buf.length})`);
    }
    // 실제로 풀어 보면 원본과 같아야 한다
    const gz = await s.rawGet('/js/app.js', { 'Accept-Encoding': 'gzip' });
    const unpacked = zlib.gunzipSync(gz.buf).toString('utf8');
    assert.equal(unpacked, fs.readFileSync(path.join(ROOT, 'js', 'app.js'), 'utf8'));
  } finally {
    await s.close();
  }
});

test('2. 캐시 정책 — 버전 붙은 자산은 1년 immutable, 화면·서비스워커는 항상 재검증', async () => {
  const s = await startServer();
  try {
    // 버전 값은 loader.js 의 VERSION 을 따른다 (손으로 적어 두면 자산 버전을 올릴 때 같이 틀어진다)
    const loaderSrc = fs.readFileSync(path.join(ROOT, 'js', 'lib', 'loader.js'), 'utf8');
    const { VERSION } = { VERSION: (/var VERSION = '([^']+)'/.exec(loaderSrc) || [])[1] };
    assert.ok(VERSION, 'loader.js 에 VERSION 이 있어야 함');
    const versioned = await s.get(`/js/app.js?v=${VERSION}`);
    assert.match(versioned.headers.get('cache-control'), /max-age=31536000/, '?v= 자산은 1년');
    assert.match(versioned.headers.get('cache-control'), /immutable/);

    const plain = await s.get('/js/data-temples.js');
    assert.match(plain.headers.get('cache-control'), /max-age=604800/, '버전 없는 자산은 7일');

    for (const p of ['/index.html', '/sw.js', '/manifest.webmanifest']) {
      const res = await s.get(p);
      assert.equal(res.headers.get('cache-control'), 'no-cache', `${p} 는 항상 재검증`);
    }
  } finally {
    await s.close();
  }
});

test('3. API 응답에는 정적 캐시 헤더를 붙이지 않는다', async () => {
  const s = await startServer();
  try {
    const res = await s.get('/api/ai/config');
    assert.equal(res.headers.get('cache-control'), null, 'API는 캐시 헤더 없음');
  } finally {
    await s.close();
  }
});

test('4. 서버 정보 노출·MIME 스니핑 방어', async () => {
  const s = await startServer();
  try {
    const res = await s.get('/index.html');
    assert.equal(res.headers.get('x-powered-by'), null, 'X-Powered-By 를 숨긴다');
    assert.equal(res.headers.get('x-content-type-options'), 'nosniff');
  } finally {
    await s.close();
  }
});

test('5. 첫 화면이 받는 스크립트는 지연 자산(leaflet·전통사찰·풍수)을 포함하지 않는다', async () => {
  const s = await startServer();
  try {
    const res = await s.get('/index.html');
    const tags = [...res.text.matchAll(/<script src="([^"]+)"/g)].map(m => m[1].split('?')[0]);
    for (const lazy of ['vendor/leaflet.js', 'js/data-traditional.js', 'js/data-fengshui.js', 'js/data-prayer.js', 'js/app/planner.js', 'js/features.js']) {
      assert.equal(tags.includes(lazy), false, `첫 화면 스크립트에 ${lazy} 가 있으면 안 됨`);
    }
    const lazyBytes = ['vendor/leaflet.js', 'js/data-traditional.js', 'js/data-fengshui.js', 'js/data-prayer.js', 'js/app/planner.js']
      .reduce((sum, f) => sum + fs.statSync(path.join(ROOT, f)).size, 0);
    assert.ok(lazyBytes > 300000, `지연 자산이 유의미하게 크다 (${lazyBytes} bytes)`);
    // 로더 자체는 첫 화면에 있어야 한다 (화면 이동 때 지연 자산을 받아 주는 주체)
    assert.ok(tags.includes('js/lib/loader.js'), 'loader.js 는 첫 화면에 포함');

    // index.html 이 가리키는 파일이 실제로 있는가 (경로 오타는 화면이 통째로 죽는다)
    for (const src of tags) {
      assert.ok(fs.existsSync(path.join(ROOT, src)), `index.html 이 없는 파일을 가리킨다: ${src}`);
    }
    for (const m of res.text.matchAll(/<link rel="(?:preload|stylesheet)"[^>]*href="([^"]+)"/g)) {
      const href = m[1].split('?')[0].replace(/^\//, '');
      assert.ok(fs.existsSync(path.join(ROOT, href)), `index.html 이 없는 파일을 가리킨다: ${href}`);
    }
  } finally {
    await s.close();
  }
});

test('6. 첫 화면·정적 페이지가 부르는 자산에는 캐시 버전이 붙는다 (버전 없는 자산은 7일 캐시 → 배포가 안 먹는다)', async () => {
  const s = await startServer();
  try {
    const res = await s.get('/');
    const refs = [...res.text.matchAll(/<(?:script|link)[^>]*(?:src|href)="([^"]+)"/g)]
      .map(m => m[1])
      .filter(u => /\.(?:js|css)$/.test(u.split('?')[0]));
    assert.ok(refs.length >= 5, `첫 화면 JS/CSS 참조 ${refs.length}개`);
    for (const u of refs) {
      assert.match(u, /[?&]v=/, `버전 태그가 없다: ${u}`);
    }
  } finally {
    await s.close();
  }

  // 정적 SEO 페이지도 같은 규칙 (버전은 tools/build-seo.js 의 ASSET_V)
  const os = require('node:os');
  const { buildSeo, ASSET_V } = require('../../tools/build-seo');
  const out = fs.mkdtempSync(path.join(os.tmpdir(), 'mj-delivery-seo-'));
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
    assert.ok(files.length > 0, 'SEO 페이지가 만들어졌다');
    for (const f of files.slice(0, 3)) {
      const html = fs.readFileSync(f, 'utf-8');
      const cssRef = html.match(/<link rel="stylesheet" href="([^"]+)"/)[1];
      assert.match(cssRef, /[?&]v=/, `SEO 페이지 스타일시트에 버전 태그가 없다: ${cssRef}`);
      assert.ok(cssRef.includes(ASSET_V), `SEO 페이지 버전은 ASSET_V(${ASSET_V}) 를 쓴다`);
    }
  } finally {
    fs.rmSync(out, { recursive: true, force: true });
  }
});

test('7. 없는 자산은 index.html 이 아니라 404 로 돌려준다 (HTML 을 CSS/JS 로 받으면 화면이 깨진다)', async () => {
  const s = await startServer();
  try {
    for (const p of ['/css/nope.css', '/js/nope.js?v=20261028static', '/vendor/nope.js']) {
      const res = await s.get(p);
      assert.equal(res.status, 404, `${p} 는 404`);
      assert.doesNotMatch(String(res.headers.get('content-type')), /text\/html/, `${p} 응답은 HTML 이 아니다`);
      assert.equal(res.headers.get('cache-control'), 'no-cache', `${p} 실패 응답은 캐시하지 않는다`);
    }
    // 화면 경로는 그대로 SPA 되돌림 — 다만 HTML 이 1년 immutable 로 캐시되면 안 된다
    const page = await s.get('/account/signup');
    assert.equal(page.status, 200);
    assert.match(String(page.headers.get('content-type')), /text\/html/);
    assert.equal(page.headers.get('cache-control'), 'no-cache', '되돌림 HTML 은 항상 재검증');
  } finally {
    await s.close();
  }
});

test('8. Vercel 함수 번들에 정적 자산이 들어간다 (includeFiles 없으면 CSS·SW·매니페스트가 404)', () => {
  const file = path.join(ROOT, 'vercel.json');
  assert.ok(fs.existsSync(file), 'vercel.json 이 있어야 한다');
  const cfg = JSON.parse(fs.readFileSync(file, 'utf8'));
  assert.equal(cfg.builds, undefined, 'builds 를 쓰면 zero-config Express 빌드가 꺼진다');
  const fn = cfg.functions && cfg.functions['server.js'];
  assert.ok(fn && typeof fn.includeFiles === 'string', 'functions["server.js"].includeFiles 는 문자열 글롭');
  const src = fn.includeFiles;
  assert.equal(/node_modules/.test(src), false, 'node_modules 를 끌어들이면 안 된다');
  assert.equal(Array.isArray(src), false, 'Vercel API 는 배열을 거부한다 (문자열 하나)');

  const expand = glob => {
    const m = /\{([^{}]+)\}/.exec(glob);
    if (!m) return [glob];
    return m[1].split(',').flatMap(alt => expand(glob.slice(0, m.index) + alt + glob.slice(m.index + m[0].length)));
  };
  const toRe = glob => {
    let out = '';
    for (let i = 0; i < glob.length; i++) {
      const c = glob[i];
      if (c === '*') {
        if (glob[i + 1] === '*') { out += '[\\s\\S]*'; i++; } else out += '[^/]*';
      } else if ('\\^$.|?+()[]{}'.includes(c)) out += '\\' + c;
      else out += c;
    }
    return new RegExp('^' + out + '$');
  };
  const matchers = expand(src).map(toRe);
  const needed = [
    'index.html', 'css/style.css', 'sw.js', 'manifest.webmanifest',
    'apple-touch-icon.png', 'pwa-192x192.png', 'pwa-512x512.png',
    'vendor/leaflet.js', 'vendor/leaflet.css', 'vendor/images/marker-icon.png',
    'js/app.js', 'js/lib/loader.js', 'js/app/community.js'
  ];
  for (const f of needed) {
    assert.ok(fs.existsSync(path.join(ROOT, f)), `${f} 파일이 실제로 있어야 한다`);
    assert.ok(matchers.some(re => re.test(f)), `includeFiles 패턴이 ${f} 를 포함하지 않는다: ${src}`);
  }
});

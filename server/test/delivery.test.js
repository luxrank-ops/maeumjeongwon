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
    const versioned = await s.get('/js/app.js?v=20261016split');
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
    for (const lazy of ['vendor/leaflet.js', 'js/data-traditional.js', 'js/data-fengshui.js', 'js/data-prayer.js', 'js/app/planner.js']) {
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

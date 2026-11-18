'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { buildSeo, gaConfig } = require('../../tools/build-seo');

const GA = 'G-ABCDEF1234';

function tmpOut() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'mj-seo-ga-'));
}

function walkHtml(dir) {
  const out = [];
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, ent.name);
    if (ent.isDirectory()) out.push(...walkHtml(full));
    else if (ent.name.endsWith('.html')) out.push(full);
  }
  return out;
}

test('1. 분석을 끄면(ga:false) 정적 페이지에 분석 meta·body 속성·스크립트·설정 링크가 전혀 생기지 않는다', () => {
  const out = tmpOut();
  try {
    buildSeo(out, { siteUrl: 'https://example.test', env: {}, ga: false });
    for (const f of walkHtml(out)) {
      const html = fs.readFileSync(f, 'utf-8');
      assert.equal(/mj-ga-id|data-mj-page|analytics\.js|data-mj-consent-open/.test(html), false, `분석 코드가 없어야 함: ${f}`);
    }
  } finally {
    fs.rmSync(out, { recursive: true, force: true });
  }
});

test('2. GA_MEASUREMENT_ID가 있으면 모든 사찰·스토리 정적 페이지에 meta·body 속성·analytics.js·분석 설정 링크가 주입된다', () => {
  const out = tmpOut();
  try {
    const res = buildSeo(out, { siteUrl: 'https://example.test', env: { GA_MEASUREMENT_ID: GA } });
    assert.equal(res.ga, true);

    const templeHtml = fs.readFileSync(path.join(out, 'temple', 'bulguksa', 'index.html'), 'utf-8');
    assert.ok(templeHtml.includes(`<meta name="mj-ga-id" content="${GA}">`));
    assert.ok(templeHtml.includes('data-mj-page="temple" data-mj-item="bulguksa"'));
    assert.ok(templeHtml.includes('<script src="/js/analytics.js" defer></script>'));
    assert.ok(templeHtml.includes('data-mj-consent-open>분석 설정</a>'));

    const storyHtml = fs.readFileSync(path.join(out, 'story', 'haeinsa-1', 'index.html'), 'utf-8');
    assert.ok(storyHtml.includes(`<meta name="mj-ga-id" content="${GA}">`));
    assert.ok(storyHtml.includes('data-mj-page="story" data-mj-item="haeinsa-1"'));
    assert.ok(storyHtml.includes('<script src="/js/analytics.js" defer></script>'));
  } finally {
    fs.rmSync(out, { recursive: true, force: true });
  }
});

test('3. GA_MEASUREMENT_ID가 있어도 정적 HTML 안에 googletagmanager.com/gtag 스니펫이 직접 들어가지 않는다 (동의 후에만 analytics.js가 로드)', () => {
  const out = tmpOut();
  try {
    buildSeo(out, { siteUrl: 'https://example.test', env: { GA_MEASUREMENT_ID: GA } });
    for (const f of walkHtml(out)) {
      const html = fs.readFileSync(f, 'utf-8');
      assert.equal(/googletagmanager\.com|gtag\(/.test(html), false, `직접 gtag 스니펫이 있으면 안 됨: ${f}`);
    }
  } finally {
    fs.rmSync(out, { recursive: true, force: true });
  }
});

test('4. 잘못된 형식의 GA_MEASUREMENT_ID는 빌드를 즉시 중단시킨다', () => {
  assert.throws(() => gaConfig({ GA_MEASUREMENT_ID: 'UA-123456-1' }), /GA_MEASUREMENT_ID/);
  assert.throws(() => gaConfig({ GA_MEASUREMENT_ID: 'g-lowercase123' }), /GA_MEASUREMENT_ID/);
  assert.throws(() => gaConfig({ GA_MEASUREMENT_ID: 'G-12' }), /GA_MEASUREMENT_ID/);
});

test('5. 정적 사찰·스토리 페이지 개수만큼 빠짐없이 data-mj-page가 들어간다', () => {
  const out = tmpOut();
  try {
    const res = buildSeo(out, { siteUrl: 'https://example.test', env: { GA_MEASUREMENT_ID: GA } });
    const all = walkHtml(out).filter(f => !/\/(?:google|naver)[0-9a-z]+\.html$/i.test(f));
    assert.equal(all.length, res.temples + res.stories + 2, '사찰·스토리 페이지 + 목록 허브 2장');
    for (const f of all) {
      const html = fs.readFileSync(f, 'utf-8');
      assert.ok(/data-mj-page="(temple|story|temples|stories)"/.test(html), `data-mj-page 없음: ${f}`);
    }
  } finally {
    fs.rmSync(out, { recursive: true, force: true });
  }
});

test('6. 정적 SEO 페이지에는 사용자 자유 입력란(input, textarea)이 없어 개인정보가 입력될 수 없다', () => {
  const out = tmpOut();
  try {
    buildSeo(out, { siteUrl: 'https://example.test', env: { GA_MEASUREMENT_ID: GA } });
    for (const f of walkHtml(out)) {
      const html = fs.readFileSync(f, 'utf-8');
      assert.equal(/<(input|textarea)\b/i.test(html), false, `정적 페이지에 입력란이 없어야 함: ${f}`);
    }
  } finally {
    fs.rmSync(out, { recursive: true, force: true });
  }
});

test('7. 측정 ID를 넘기지 않아도 config/site.js 의 이 사이트 GA4 속성 ID가 기본으로 들어간다', () => {
  const out = tmpOut();
  try {
    const res = buildSeo(out, { siteUrl: 'https://example.test', env: {} });
    assert.equal(res.ga, true);
    const html = fs.readFileSync(path.join(out, 'temple', 'bulguksa', 'index.html'), 'utf-8');
    assert.ok(html.includes('<meta name="mj-ga-id" content="G-GK4GX2C0BW">'));
  } finally {
    fs.rmSync(out, { recursive: true, force: true });
  }
});

test('8. 구글·네이버 소유확인 파일이 루트에 생성되고 robots.txt가 정식 도메인을 가리킨다', () => {
  const out = tmpOut();
  try {
    buildSeo(out, { env: { SITE_URL: 'https://ais-pre-example-123.asia-east1.run.app' } });
    assert.equal(
      fs.readFileSync(path.join(out, 'google968bd4b8f647180b.html'), 'utf-8').trim(),
      'google-site-verification: google968bd4b8f647180b.html'
    );
    assert.equal(
      fs.readFileSync(path.join(out, 'naver08c0f6832a6e38593b56274b38caf6c9.html'), 'utf-8').trim(),
      'naver-site-verification: naver08c0f6832a6e38593b56274b38caf6c9.html'
    );
    const robots = fs.readFileSync(path.join(out, 'robots.txt'), 'utf-8');
    assert.ok(robots.includes('Sitemap: https://maeumjeongwon.luxrank.workers.dev/sitemap.xml'), robots);
    const sitemap = fs.readFileSync(path.join(out, 'sitemap.xml'), 'utf-8');
    assert.equal(sitemap.includes('run.app'), false, 'Cloud Run 미리보기 주소가 사이트맵에 들어가면 안 됨');
    assert.ok(sitemap.includes('<loc>https://maeumjeongwon.luxrank.workers.dev/</loc>'));
  } finally {
    fs.rmSync(out, { recursive: true, force: true });
  }
});

test('9. 색인 기본값: 사이트맵과 canonical 이 같은 주소를 가리키고, 목록 허브·robots meta 가 있다', () => {
  const out = tmpOut();
  try {
    const res = buildSeo(out, { siteUrl: 'https://example.test', env: {} });
    const sitemap = fs.readFileSync(path.join(out, 'sitemap.xml'), 'utf-8');
    const locs = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map(m => m[1]);

    // 사찰·스토리·허브 페이지는 끝 슬래시 주소로 내려준다 — 사이트맵과 canonical 이 어긋나면
    // 서치콘솔이 '표준 URL 불일치'로 보고 색인이 느려진다(2026-11 실제 상태였음).
    assert.ok(locs.includes('https://example.test/temple/haeinsa/'), '사찰 페이지가 사이트맵에 있다');
    assert.ok(locs.includes('https://example.test/temples/'), '전체 사찰 목록 허브가 사이트맵에 있다');
    assert.ok(locs.includes('https://example.test/stories/'), '이야기 모음 허브가 사이트맵에 있다');
    assert.equal(new Set(locs).size, locs.length, '사이트맵에 중복 URL 이 없어야 한다');
    assert.equal(locs.length, res.urls, '사이트맵 URL 수와 빌드 결과가 같다');

    for (const rel of ['temple/haeinsa/index.html', 'story/haeinsa-1/index.html', 'temples/index.html', 'stories/index.html']) {
      const html = fs.readFileSync(path.join(out, rel), 'utf-8');
      const canonical = /<link rel="canonical" href="([^"]+)"/.exec(html);
      assert.ok(canonical, `${rel} 에 canonical 이 있다`);
      assert.ok(locs.includes(canonical[1]), `${rel} 의 canonical 이 사이트맵 주소와 같다: ${canonical[1]}`);
      assert.match(html, /<meta name="robots" content="index,follow/, `${rel} 에 색인 허용 meta`);
      assert.equal((html.match(/<h1>/g) || []).length, 1, `${rel} 의 h1 은 하나`);
      assert.ok(html.includes('href="/temples/"'), `${rel} 하단에서 목록 허브로 링크한다`);
    }

    // 허브는 모든 사찰·스토리로 가는 링크를 갖는다 — 크롤러가 사이트맵 없이도 걸어갈 수 있게.
    const hub = fs.readFileSync(path.join(out, 'temples', 'index.html'), 'utf-8');
    assert.ok((hub.match(/href="\/temple\//g) || []).length >= 60, '전체 사찰 링크');
    const storiesHub = fs.readFileSync(path.join(out, 'stories', 'index.html'), 'utf-8');
    assert.ok((storiesHub.match(/href="\/story\//g) || []).length >= 9, '전체 스토리 링크');
  } finally {
    fs.rmSync(out, { recursive: true, force: true });
  }
});

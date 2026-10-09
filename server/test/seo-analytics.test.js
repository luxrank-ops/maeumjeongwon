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

test('1. GA_MEASUREMENT_ID가 없으면 정적 페이지에 분석 meta·body 속성·스크립트·설정 링크가 전혀 생기지 않는다', () => {
  const out = tmpOut();
  try {
    buildSeo(out, { siteUrl: 'https://example.test', env: {} });
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
    const all = walkHtml(out);
    assert.equal(all.length, res.temples + res.stories);
    for (const f of all) {
      const html = fs.readFileSync(f, 'utf-8');
      assert.ok(/data-mj-page="(temple|story)"/.test(html));
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

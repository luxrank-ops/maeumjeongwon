'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { buildSeo, adsConfig, ADS_CERT_ID } = require('../../tools/build-seo');

const PUB = 'pub-1234567890123456';
const SLOT = '9876543210';

function tmpOut() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'mj-seo-test-'));
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

test('1. 광고 설정이 없으면 ads.txt도, 광고 코드도 만들지 않는다', () => {
  const out = tmpOut();
  try {
    buildSeo(out, { siteUrl: 'https://example.test', env: {} });
    assert.equal(fs.existsSync(path.join(out, 'ads.txt')), false);
    const htmlFiles = walkHtml(out);
    assert.ok(htmlFiles.length > 0);
    for (const f of htmlFiles) {
      const html = fs.readFileSync(f, 'utf-8');
      assert.equal(/adsbygoogle|googlesyndication/.test(html), false, `광고 코드가 없어야 함: ${f}`);
    }
  } finally {
    fs.rmSync(out, { recursive: true, force: true });
  }
});

test('2. ADSENSE_PUB_ID만 있고 슬롯이 없으면 ads.txt만 만들고 페이지에는 광고 스크립트를 넣지 않는다', () => {
  const out = tmpOut();
  try {
    buildSeo(out, { siteUrl: 'https://example.test', env: { ADSENSE_PUB_ID: PUB } });
    const adsTxtPath = path.join(out, 'ads.txt');
    assert.equal(fs.existsSync(adsTxtPath), true);
    assert.equal(fs.readFileSync(adsTxtPath, 'utf-8'), `google.com, ${PUB}, DIRECT, ${ADS_CERT_ID}\n`);
    for (const f of walkHtml(out)) {
      const html = fs.readFileSync(f, 'utf-8');
      assert.equal(/adsbygoogle|googlesyndication/.test(html), false);
    }
  } finally {
    fs.rmSync(out, { recursive: true, force: true });
  }
});

test('3. 사찰 페이지에만 광고 1칸과 로더가 들어가고, 스토리 페이지에는 없다', () => {
  const out = tmpOut();
  try {
    buildSeo(out, { siteUrl: 'https://example.test', env: { ADSENSE_PUB_ID: PUB, ADSENSE_TEMPLE_SLOT: SLOT } });
    const templeHtml = fs.readFileSync(path.join(out, 'temple', 'haeinsa', 'index.html'), 'utf-8');
    const insMatches = templeHtml.match(/class="adsbygoogle"/g) || [];
    assert.equal(insMatches.length, 1);
    assert.ok(templeHtml.includes(`pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-${PUB}`));
    assert.ok(templeHtml.includes(`data-ad-slot="${SLOT}"`));

    const storyDir = path.join(out, 'story');
    for (const f of walkHtml(storyDir)) {
      const sHtml = fs.readFileSync(f, 'utf-8');
      assert.equal(/adsbygoogle|googlesyndication/.test(sHtml), false, `스토리 페이지에는 광고가 없어야 함: ${f}`);
    }
  } finally {
    fs.rmSync(out, { recursive: true, force: true });
  }
});

test('4. 잘못된 형식의 ADSENSE_PUB_ID나 ADSENSE_TEMPLE_SLOT은 빌드를 즉시 실패시킨다', () => {
  assert.throws(() => adsConfig({ ADSENSE_PUB_ID: 'ca-pub-1234567890123456' }), /ADSENSE_PUB_ID/);
  assert.throws(() => adsConfig({ ADSENSE_PUB_ID: 'pub-123' }), /ADSENSE_PUB_ID/);
  assert.throws(() => adsConfig({ ADSENSE_PUB_ID: PUB, ADSENSE_TEMPLE_SLOT: 'abc' }), /ADSENSE_TEMPLE_SLOT/);
});

test('5. 앱 셸(index.html, js, css)에는 웹 광고 코드가 없다 — 앱 광고는 AdMob SDK로만', () => {
  const root = path.join(__dirname, '..', '..');
  const targets = [
    path.join(root, 'index.html'),
    ...fs.readdirSync(path.join(root, 'js')).map(n => path.join(root, 'js', n)),
    ...fs.readdirSync(path.join(root, 'css')).map(n => path.join(root, 'css', n))
  ];
  for (const f of targets) {
    if (!fs.statSync(f).isFile()) continue;
    const content = fs.readFileSync(f, 'utf-8');
    assert.equal(/adsbygoogle|googlesyndication/.test(content), false, `앱 셸에 애드센스 코드가 있으면 안 됨: ${f}`);
  }
});

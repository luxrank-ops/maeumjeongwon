'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const { readAppSources } = require('./_sources');

const ROOT = path.join(__dirname, '..', '..');

test('1. PWA 표준 준수 — manifest.webmanifest 필수 항목 및 아이콘 규격 검증', () => {
  const manifestPath = path.join(ROOT, 'manifest.webmanifest');
  assert.ok(fs.existsSync(manifestPath), 'manifest.webmanifest 파일이 존재해야 함');

  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
  assert.equal(manifest.id, '/', 'id는 / 여야 함');
  assert.equal(manifest.start_url, '/', 'start_url은 / 여야 함');
  assert.equal(manifest.display, 'standalone', 'display는 standalone 이어야 함');
  assert.ok(manifest.short_name, 'short_name이 있어야 함');
  assert.ok(manifest.short_name.length <= 12, 'short_name은 12자 이하여야 함 (PWA 가이드라인)');
  assert.ok(manifest.name, 'name이 정의되어 있어야 함');
  assert.equal(manifest.theme_color, '#f6f1e7', '사찰 한지 테마 색상이어야 함');

  const icons = manifest.icons || [];
  assert.ok(icons.length >= 3, '최소 192, 512, maskable 아이콘이 정의되어 있어야 함');
  assert.ok(icons.some(ic => ic.sizes === '192x192' && ic.purpose === 'any'), '192x192 any 아이콘');
  assert.ok(icons.some(ic => ic.sizes === '512x512' && ic.purpose === 'any'), '512x512 any 아이콘');
  assert.ok(icons.some(ic => ic.sizes === '512x512' && ic.purpose === 'maskable'), '512x512 maskable 아이콘');
});

test('2. PWA 아이콘 바이너리 무결성 — 유효한 PNG 시그니처 확인', () => {
  const pngFiles = [
    'pwa-192x192.png',
    'pwa-512x512.png',
    'pwa-maskable-512x512.png',
    'apple-touch-icon.png'
  ];

  const PNG_MAGIC = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  for (const file of pngFiles) {
    const fullPath = path.join(ROOT, file);
    assert.ok(fs.existsSync(fullPath), `${file} 아이콘 파일이 존재해야 함`);
    const buf = fs.readFileSync(fullPath);
    assert.ok(buf.length > 500, `${file} 크기가 정상적이어야 함`);
    assert.deepEqual(buf.subarray(0, 8), PNG_MAGIC, `${file} 유효한 PNG 시그니처 확인`);
  }
});

test('3. Service Worker sw.js 오프라인 캐시 및 인덱스 HTML 연동 검증', () => {
  const swPath = path.join(ROOT, 'sw.js');
  assert.ok(fs.existsSync(swPath), 'sw.js 서비스워커 파일이 존재해야 함');
  const swContent = fs.readFileSync(swPath, 'utf-8');
  assert.ok(swContent.includes('addEventListener(\'fetch\''), 'SW fetch 이벤트 처리기');
  assert.ok(swContent.includes('caches.open'), '캐시 처리 로직');

  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf-8');
  assert.ok(html.includes('manifest.webmanifest'), 'index.html에 manifest 연결');
  assert.ok(html.includes('apple-touch-icon.png'), 'index.html에 apple-touch-icon 연결');
  assert.ok(html.includes('mobile-web-app-capable'), 'PWA 메타태그');
  assert.ok(html.includes('id="installBtn"'), '인앱 설치 버튼');
  assert.ok(html.includes('id="offlineBanner"'), '오프라인 알림 배너');

  /* 버전 태그가 어긋나면 '새 캐시'가 옛 URL 을 미리 받아 놓는다 — 겉으로는 멀쩡하고
     실제로는 지연 자산이 캐시되지 않는다. 세 곳(index.html · sw.js · loader.js)이
     같은 태그를 가리키는지 여기서 묶어 둔다. */
  const versioned = src => [...src.matchAll(/["'](\/(?:js|css)\/[^"']+\.js\?v=[^"']+)["']/g)].map(m => m[1]);
  const isLazyAsset = u => /\/js\/(?:features|data-prayer|data-stories|data-traditional|data-fengshui|app\/(?:planner|map|community))\.js/.test(u);
  const swUrls = versioned(swContent).filter(u => !isLazyAsset(u));
  for (const url of swUrls) {
    // index.html 은 상대경로(js/…), sw.js 는 절대경로(/js/…)로 적는다 — 경로 앞 '/'만 맞춰 비교
    assert.ok(html.includes(url.replace(/^\//, '')),
      `sw.js 가 미리 받는 ${url} 이 index.html 에 없다 (버전 태그 불일치)`);
  }
  const lazy = versioned(swContent).filter(isLazyAsset);
  assert.ok(lazy.length >= 5, '지연 자산 목록이 있어야 함');
  assert.ok(lazy.some(url => url.startsWith('/js/features.js?')), 'features.js 는 첫 화면 사전 캐시가 아닌 지연 캐시에 있어야 함');
  const loaderSrc = fs.readFileSync(path.join(ROOT, 'js', 'lib', 'loader.js'), 'utf-8');
  const loaderVersion = (/var VERSION = '([^']+)'/.exec(loaderSrc) || [])[1];
  for (const url of lazy) {
    assert.ok(url.endsWith('?v=' + loaderVersion),
      `지연 자산 ${url} 의 버전이 loader.js(VERSION=${loaderVersion}) 와 다르다`);
  }
});

test('4. 9대 제안 기능 모듈 (js/features.js) 구조 및 i18n / Web Audio / 도슨트 검증', () => {
  const featPath = path.join(ROOT, 'js', 'features.js');
  assert.ok(fs.existsSync(featPath), 'js/features.js 파일이 존재해야 함');
  const featCode = fs.readFileSync(featPath, 'utf-8');

  assert.ok(featCode.includes('PWA'), 'PWA 모듈');
  assert.ok(featCode.includes('Weather'), '실시간 날씨 모듈');
  assert.ok(featCode.includes('SEASON_INFO'), '계절별 사찰 추천 데이터');
  assert.ok(featCode.includes('Nav'), '내비게이션 모듈');
  assert.ok(featCode.includes('Certificate'), '완주증 모듈');
  assert.ok(featCode.includes('Templestay'), '템플스테이 모듈');
  assert.ok(featCode.includes('Synth'), 'Web Audio 사찰 소음 신시사이저');
  assert.ok(featCode.includes('Meditation'), '명상 타이머 모듈');
  assert.ok(featCode.includes('I18N'), '다국어 모듈');
  assert.ok(featCode.includes('Docent'), '오디오 도슨트 모듈');
});

test('5. 템플스테이 1박2일 힐링 코스가 여행 계획 템플릿에 등록되어 있음', () => {
  // 계획·추천 화면은 js/app/planner.js 로 분리되어 있다 → 셸+모듈을 함께 본다
  const appCode = readAppSources();
  assert.ok(appCode.includes('tpl-templestay-1n2d'), '템플스테이 1박2일 코스 ID');
  assert.ok(appCode.includes('산사 1박 2일 템플스테이 & 참선 힐링 코스'), '템플스테이 코스 제목');
  assert.ok(appCode.includes('templestay.com'), '템플스테이 공식 링크');
});

test('6. 전체 사찰(65곳) 실용정보·창건·문화재·관람소요에 확인 필요 항목이 0건으로 모두 채워져 있음', () => {
  const { listTemples } = require('../content/temples');
  const temples = listTemples();
  assert.ok(temples.length >= 65, `65곳 이상의 사찰 데이터 존재 (현재 ${temples.length}곳)`);
  for (const t of temples) {
    assert.equal((t.verify || []).length, 0, `${t.id}: verify 미결 항목이 없어야 함`);
    assert.ok(!String(t.founded || '').includes('확인 필요'), `${t.id}: founded 확인 필요 제거됨`);
    assert.ok(!String(t.duration || '').includes('확인 필요'), `${t.id}: duration 확인 필요 제거됨`);
    assert.ok(!String(t.practical.parking || '').includes('확인 필요'), `${t.id}: parking 확인 필요 제거됨`);
    assert.ok(!String(t.practical.fee || '').includes('확인 필요'), `${t.id}: fee 확인 필요 제거됨`);
    assert.ok(!String(t.practical.hours || '').includes('확인 필요'), `${t.id}: hours 확인 필요 제거됨`);
    assert.ok(!String(t.practical.transit || '').includes('확인 필요'), `${t.id}: transit 확인 필요 제거됨`);
    assert.ok(!String(t.practical.templestay || '').includes('확인 필요'), `${t.id}: templestay 확인 필요 제거됨`);
  }
});

test('7. Google AI Pro 설정 및 서버 엔드포인트(/api/ai/config, /api/ai/counsel) 연동 검증', async () => {
  const cfgCode = fs.readFileSync(path.join(ROOT, 'js', 'config.js'), 'utf-8');
  assert.ok(cfgCode.includes("aiTier: 'Google AI Pro'"), 'js/config.js에 Google AI Pro 티어 설정');
  assert.ok(cfgCode.includes("aiModel: 'gemini-4-argon'"), 'js/config.js에 gemini-4-argon 모델 설정');

  const meta = JSON.parse(fs.readFileSync(path.join(ROOT, 'metadata.json'), 'utf-8'));
  assert.ok(
    Array.isArray(meta.majorCapabilities) && meta.majorCapabilities.includes('MAJOR_CAPABILITY_SERVER_SIDE_GEMINI_API'),
    'metadata.json에 MAJOR_CAPABILITY_SERVER_SIDE_GEMINI_API 등록'
  );

  const featCode = fs.readFileSync(path.join(ROOT, 'js', 'features.js'), 'utf-8');
  assert.ok(featCode.includes('AICounsel'), 'js/features.js에 AICounsel 모듈 포함');

  const { getAiConfig, generateCounsel } = require('../ai');
  const aiCfg = getAiConfig();
  assert.equal(aiCfg.tier, 'Google AI Pro');
  assert.equal(aiCfg.model, 'gemini-4-argon');
  assert.equal(aiCfg.status, 'active');

  const res = await generateCounsel({
    prompt: '마음이 복잡하고 바다가 보이는 사찰에서 조용히 기도하고 싶어요',
    mood: '지쳤어요',
    templeId: 'naksansa'
  });
  assert.equal(res.ok, true);
  assert.equal(res.tier, 'Google AI Pro');
  assert.ok(res.empathy && res.empathy.length > 10, '공감 메시지 반환');
  assert.ok(res.verse && res.verse.text && res.verse.source, '경전 구절 반환');
  assert.ok(Array.isArray(res.recommendations) && res.recommendations.length > 0, '추천 사찰 반환');
  assert.equal(res.recommendations[0].id, 'naksansa', '요청한 사찰 우선 추천');
  assert.ok(Array.isArray(res.practice) && res.practice.length === 3, '3단계 참배 가이드 반환');
});


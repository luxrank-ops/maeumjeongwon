// 콘텐츠 전용 유료화(심화 스토리·보상 광고·콘텐츠 상점·순례 리포트) 테스트 + 스크린샷
const { chromium } = require('playwright-core');
const U = process.argv[2] || 'http://127.0.0.1:8642/';
const SS = '/workspace/maeumjeongwon/screenshots/';
const shots = process.argv[3] !== 'noshot';
(async () => {
  const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] });
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, locale: 'ko-KR' });
  const p = await ctx.newPage(); const errs = [];
  p.on('console', m => { if (m.type() === 'error' && !/tile\.openstreetmap|ERR_|Failed to load resource/.test(m.text())) errs.push('console: ' + m.text()); });
  p.on('pageerror', e => errs.push('pageerror: ' + e.message));
  const ok = (c, msg) => { console.log((c ? 'PASS ' : 'FAIL ') + msg); if (!c) process.exitCode = 1; };
  const txt = () => p.textContent('#view');
  const st = () => p.evaluate(() => JSON.parse(localStorage.getItem('maeumjeongwon.v1') || '{}'));
  await p.goto(U + '#/home'); await p.evaluate(() => localStorage.clear()); await p.reload(); await p.waitForTimeout(400);
  const home = await txt();
  ok(/이번 주 심화 스토리/.test(home) && /콘텐츠 상점/.test(home), 'home: story card + store card');
  // plus page: no templestay commission / partner wording
  await p.goto(U + '#/plus'); await p.waitForTimeout(300);
  const plus = await txt();
  ok(!/수수료|제휴|templestay\.com|굿즈/.test(plus), 'plus page has no commission/partner/goods references');
  ok(/자동 갱신/.test(plus) && /무료로 계속하기|7일 무료 체험/.test(plus) && /원작 콘텐츠/.test(plus), 'plus page: auto-renew notice + content offering');
  if (shots) await p.screenshot({ path: SS + '13-plus-content-only.png' });
  // temple detail: no templestay button, story card
  await p.goto(U + '#/temple/haeinsa'); await p.waitForTimeout(300);
  ok(await p.locator('a[href*="templestay.com"]').count() === 0, 'detail: templestay link removed');
  ok(/심화 스토리/.test(await txt()), 'detail: story card');
  // story: free preview + lock
  await p.goto(U + '#/story/haeinsa-1'); await p.waitForTimeout(300);
  let s1 = await txt();
  ok(/불타 버린 첫 번째 경판/.test(s1) && !/폭탄을 떨어뜨리지 않은 비행기/.test(s1), 'story: chapter 1 free, later chapters hidden');
  ok(await p.locator('.locked [data-act=ad]').count() === 1 && await p.locator('.locked [data-act=paywall]').count() === 1, 'story lock: ad + plus buttons');
  if (shots) { await p.evaluate(() => document.querySelector('.locked').scrollIntoView({ block: 'center' })); await p.waitForTimeout(200); await p.screenshot({ path: SS + '14-story-preview-lock.png' }); }
  // rewarded ad demo
  await p.click('.locked [data-act=ad]'); await p.waitForSelector('#adbox');
  ok(await p.locator('#adreward').isDisabled(), 'ad: reward disabled during countdown');
  if (shots) await p.screenshot({ path: SS + '15-rewarded-ad-demo.png' });
  await p.waitForFunction(() => !document.getElementById('adreward').disabled, null, { timeout: 8000 });
  await p.click('#adreward'); await p.waitForTimeout(300);
  s1 = await txt();
  ok(/폭탄을 떨어뜨리지 않은 비행기/.test(s1) && /광고 보상으로 열림/.test(s1), 'ad reward: story unlocked 24h');
  ok(/전해지는 이야기/.test(s1) && /참고/.test(s1), 'story: legend label + sources');
  const s2 = await st(); ok(s2.adLog && Object.values(s2.adLog)[0] === 1, 'ad log counted (daily cap)');
  // store + purchase confirm
  await p.goto(U + '#/store'); await p.waitForTimeout(300);
  ok(await p.locator('.titem').count() >= 7, 'store lists 7 items');
  if (shots) { await p.evaluate(() => document.getElementById('toast').classList.remove('show')); await p.screenshot({ path: SS + '16-content-store.png' }); }
  await p.click('[data-act=buy][data-id=guide-prayer]'); await p.waitForSelector('.sheet');
  ok(/자동 갱신 없음/.test(await p.textContent('.sheet')) && /청약철회/.test(await p.textContent('.sheet')), 'buy sheet: one-time + withdrawal notice');
  await p.click('[data-act=buy-ok]'); await p.waitForTimeout(200);
  ok((await st()).packs.includes('guide-prayer'), 'guide purchased (demo)');
  await p.goto(U + '#/guide/prayer'); await p.waitForTimeout(300);
  ok(await p.locator('.guide-entry').count() >= 15 && await p.locator('[data-act=print]').count() === 1, 'guide: full entries + print button');
  // course pack unlocks courses without plus
  await p.goto(U + '#/store'); await p.click('[data-act=buy][data-id=pack-south-coast]'); await p.click('[data-act=buy-ok]');
  await p.goto(U + '#/explore/theme/wish'); await p.waitForTimeout(300);
  ok(/직선거리/.test(await txt()) && await p.locator('.course .locked').count() >= 1, 'course pack unlocks its courses only');
  // skin
  await p.goto(U + '#/store'); await p.click('[data-act=buy][data-id=skin-maple]'); await p.click('[data-act=buy-ok]'); await p.click('[data-act=skin]');
  ok((await st()).skin === 'maple', 'maple skin applied');
  // report: visits then preview lock
  for (const id of ['haeinsa', 'tongdosa', 'boriam', 'naksansa']) { await p.goto(U + '#/temple/' + id); await p.click('[data-act=demo]'); await p.click('[data-act=demo-ok]'); await p.waitForSelector('.stampbig'); await p.click('button[data-act=close]'); }
  await p.evaluate(() => { const s = JSON.parse(localStorage.getItem('maeumjeongwon.v1')); s.visits[0].date = '2026-04-12T09:00:00'; s.visits[1].date = '2026-07-20T09:00:00'; localStorage.setItem('maeumjeongwon.v1', JSON.stringify(s)); });
  await p.goto(U + '#/report'); await p.reload(); await p.waitForTimeout(300);
  ok(/4곳/.test(await txt()) && await p.locator('.locked').count() === 1, 'report: free summary + locked details');
  if (shots) await p.evaluate(() => document.getElementById('toast').classList.remove('show'));
  if (shots) await p.screenshot({ path: SS + '17-report-preview-locked.png' });
  await p.goto(U + '#/plus'); await p.click('[data-act=plus-on]'); await p.goto(U + '#/report'); await p.waitForTimeout(300);
  const rp = await txt();
  ok(/많이 간 지역/.test(rp) && /연말 결산/.test(rp) && /계절별/.test(rp) && await p.locator('.locked').count() === 0, 'report: full for plus');
  if (shots) await p.evaluate(() => document.getElementById('toast').classList.remove('show'));
  if (shots) await p.screenshot({ path: SS + '18-report-plus.png' });
  await p.goto(U + '#/mind'); await p.waitForTimeout(200);
  ok(/재미로 보는/.test(await txt()) && await p.locator('.locked').count() === 0, 'mind report: entertainment notice, unlocked with plus');
  await p.goto(U + '#/missions'); await p.waitForTimeout(800);
  ok(await p.locator('svg.beads circle[fill="#c2410c"]').count() >= 1, 'beads render with maple skin');
  console.log('ERRORS:', errs.length ? errs : 'none');
  if (errs.length) process.exitCode = 1;
  await b.close();
})().catch(e => { console.error(e); process.exit(1); });

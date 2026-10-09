// 플러스(유료화 데모)·기도처 테마 테스트 + 스크린샷
const { chromium } = require('playwright-core');
const U = process.argv[2] || 'http://127.0.0.1:8642/';
const SS = '/workspace/maeumjeongwon/screenshots/';
const shots = process.argv[3] !== 'noshot';
(async () => {
  const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] });
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, locale: 'ko-KR' });
  const p = await ctx.newPage(); const errs = [];
  p.on('console', m => { if (m.type() === 'error') errs.push('console: ' + m.text()); });
  p.on('pageerror', e => errs.push('pageerror: ' + e.message));
  const ok = (c, msg) => { console.log((c ? 'PASS ' : 'FAIL ') + msg); if (!c) process.exitCode = 1; };
  await p.goto(U + '#/home'); await p.evaluate(() => localStorage.clear()); await p.goto(U + '#/home'); await p.reload(); await p.waitForTimeout(400);
  ok(await p.locator('.plusbanner').count() === 1, 'home shows plus banner for free user');
  // wish theme
  await p.goto(U + '#/explore/theme/wish'); await p.waitForTimeout(300);
  const wishTxt = await p.textContent('#view');
  ok(/한 가지 소원 기도처/.test(wishTxt) && /기도 안내/.test(wishTxt), 'wish theme name + 기도 안내 block');
  ok(/도선사/.test(wishTxt) && /칠장사/.test(wishTxt) && /갓바위/.test(wishTxt), 'wish theme lists new/enriched temples');
  ok(await p.locator('.course .locked').count() >= 3, 'wish courses locked for free user');
  if (shots) await p.screenshot({ path: SS + '10-theme-wish-prayer.png' });
  if (shots) { await p.evaluate(() => [...document.querySelectorAll('#view h2')].find(h => /이름난 기도처/.test(h.textContent)).scrollIntoView({ block: 'start' })); await p.evaluate(() => window.scrollBy(0, -70)); await p.waitForTimeout(200); await p.screenshot({ path: SS + '10b-theme-wish-list.png' }); }
  if (shots) { await p.evaluate(() => document.querySelector('.course').scrollIntoView({ block: 'start' })); await p.evaluate(() => window.scrollBy(0, -110)); await p.waitForTimeout(200); await p.screenshot({ path: SS + '10c-theme-course-locked.png' }); }
  await p.goto(U + '#/explore/theme/energy'); await p.waitForTimeout(300);
  const enTxt = await p.textContent('#view');
  ok(/기운 좋은 사찰/.test(enTxt) && /5대 적멸보궁 순례/.test(enTxt) && /남해 용문사/.test(enTxt), 'energy theme + jeokmyeol course + 남해 용문사');
  // detail: prayer block + legend lock
  await p.goto(U + '#/temple/boriam'); await p.waitForTimeout(300);
  ok(await p.locator('section.prayer').count() === 1, 'boriam prayer block');
  ok(await p.locator('.legend .locked').count() >= 1, 'boriam extra legend locked (free preview)');
  ok(/출처/.test(await p.textContent('section.prayer')), 'prayer block has sources');
  await p.evaluate(() => document.querySelector('section.prayer').scrollIntoView({ block: 'start' })); await p.evaluate(() => window.scrollBy(0, -70));
  await p.waitForTimeout(200); if (shots) await p.screenshot({ path: SS + '11-detail-prayer-guide.png' });
  // paywall
  await p.evaluate(() => document.querySelector('.legend .locked').scrollIntoView({ block: 'center' }));
  await p.click('.legend [data-act=paywall]'); await p.waitForSelector('.sheet');
  const pw = await p.textContent('.sheet');
  ok(/7일 무료 체험/.test(pw) && /자동 갱신/.test(pw) && /데모/.test(pw) && /무료로 계속하기/.test(pw), 'paywall shows trial, auto-renew notice, demo label, decline option');
  if (shots) await p.screenshot({ path: SS + '12-paywall.png' });
  await p.click('.sheet [data-act=trial-start]'); await p.waitForTimeout(300);
  ok(await p.locator('.legend .locked').count() === 0, 'after trial: legends unlocked');
  ok(/체험 7일/.test(await p.textContent('#plusChip')), 'plus chip shows trial days');
  const st = await p.evaluate(() => JSON.parse(localStorage.getItem('maeumjeongwon.v1')).plus);
  ok(st && st.status === 'trial', 'trial stored in localStorage');
  // offline save works in trial
  await p.click('[data-act=offline]'); await p.waitForTimeout(200);
  ok(/오프라인 저장됨/.test(await p.textContent('#view')), 'offline save (plus)');
  // course unlocked
  await p.goto(U + '#/explore/theme/wish'); await p.waitForTimeout(200);
  ok(await p.locator('.course .locked').count() === 0 && /직선거리/.test(await p.textContent('#view')), 'courses unlocked in trial');
  // expire trial -> locked again, no auto charge
  await p.evaluate(() => { const s = JSON.parse(localStorage.getItem('maeumjeongwon.v1')); s.plus.start = new Date(Date.now() - 8 * 86400000).toISOString(); localStorage.setItem('maeumjeongwon.v1', JSON.stringify(s)); });
  await p.goto(U + '#/plus'); await p.reload(); await p.waitForTimeout(300);
  ok(/동의 없이 결제되지 않았어요/.test(await p.textContent('#view')), 'expired trial: no auto conversion message');
  // plus page demo toggle on/off
  await p.click('[data-act=plus-on]'); await p.waitForTimeout(200);
  ok(/데모 플러스 이용 중/.test(await p.textContent('#view')), 'demo plus on');
  if (shots) await p.screenshot({ path: SS + '09-plus-page.png' });
  if (shots) { await p.evaluate(() => document.querySelector('table.cmp').scrollIntoView({ block: 'start' })); await p.evaluate(() => window.scrollBy(0, -70)); await p.waitForTimeout(200); await p.screenshot({ path: SS + '09b-plus-compare.png' }); }
  p.once('dialog', d => d.accept());
  await p.click('[data-act=plus-off]'); await p.waitForTimeout(300);
  ok(!(await p.evaluate(() => JSON.parse(localStorage.getItem('maeumjeongwon.v1')).plus)), 'demo plus off');
  // one-time pack
  await p.goto(U + '#/missions'); await p.waitForTimeout(800);
  ok(await p.locator('text=계절 한정 스탬프').count() >= 1, 'season stamp section');
  await p.click('[data-act=buy][data-id=pack-autumn2026]'); await p.waitForTimeout(300);
  ok((await p.evaluate(() => JSON.parse(localStorage.getItem('maeumjeongwon.v1')).packs)).includes('pack-autumn2026'), 'season pack demo purchase');
  // core free still works: demo check-in at new temple
  await p.goto(U + '#/temple/dosunsa'); await p.click('[data-act=demo]'); await p.click('[data-act=demo-ok]'); await p.waitForSelector('.stampbig');
  ok(true, 'free check-in works at new temple 도선사'); await p.click('button[data-act=close]');
  await p.goto(U + '#/map'); await p.waitForTimeout(1500);
  ok(await p.locator('.leaflet-interactive').count() >= 61, 'map markers incl. new temples');
  console.log('ERRORS:', errs.length ? errs : 'none');
  if (errs.length) process.exitCode = 1;
  await b.close();
})().catch(e => { console.error(e); process.exit(1); });

const { chromium } = require('playwright-core');
(async () => {
  const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] });
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, locale: 'ko-KR',
    geolocation: { latitude: 35.4880, longitude: 129.0640 }, permissions: ['geolocation'] });
  const p = await ctx.newPage(); const errs = [];
  p.on('console', m => { if (m.type() === 'error') errs.push('console: ' + m.text()); });
  p.on('pageerror', e => errs.push('pageerror: ' + e.message));
  const U = 'http://127.0.0.1:8642/';
  const SS = '/workspace/maeumjeongwon/screenshots/';
  await p.goto(U); await p.waitForTimeout(500);
  // GPS check-in at 통도사 (simulated geolocation)
  await p.goto(U + '#/temple/tongdosa'); await p.click('[data-act=gps]'); await p.waitForSelector('.stampbig', { timeout: 8000 });
  console.log('gps modal:', (await p.textContent('.sheet')).replace(/\s+/g, ' ').slice(0, 160));
  await p.click('button[data-act=close]');
  // GPS far away -> should not check in
  await p.goto(U + '#/temple/naksansa'); await p.click('[data-act=gps]'); await p.waitForTimeout(1500);
  console.log('far toast:', await p.textContent('#toast'));
  // demo check-ins
  for (const id of ['haeinsa', 'songgwangsa', 'naksansa', 'bulguksa', 'buseoksa', 'yonggungsa', 'hyangiram', 'jogyesa']) {
    await p.goto(U + '#/temple/' + id); await p.click('[data-act=demo]'); await p.click('[data-act=demo-ok]'); await p.waitForSelector('.stampbig'); await p.click('button[data-act=close]');
  }
  await p.goto(U + '#/home'); await p.click('[data-mood="1"]'); await p.waitForTimeout(300);
  await p.screenshot({ path: SS + '01-home.png', fullPage: false });
  await p.goto(U + '#/temple/buseoksa'); await p.waitForTimeout(300);
  await p.screenshot({ path: SS + '02-temple-detail.png' }); await p.evaluate(() => document.querySelector('.legend').scrollIntoView({block:'center'})); await p.waitForTimeout(200); await p.screenshot({ path: SS + '02b-temple-history-legend.png' });
  await p.goto(U + '#/missions'); await p.waitForTimeout(2500);
  await p.screenshot({ path: SS + '03-missions.png' }); await p.evaluate(() => document.querySelector('.dex').scrollIntoView({block:'start'})); await p.evaluate(() => window.scrollBy(0,-70)); await p.waitForTimeout(800); await p.screenshot({ path: SS + '03b-dex-pilgrim-map.png' });
  await p.goto(U + '#/map'); await p.waitForTimeout(3500);
  await p.screenshot({ path: SS + '04-map.png' });
  await p.goto(U + '#/explore/all'); await p.fill('#tq', '보광사'); await p.waitForTimeout(300);
  console.log('trad results:', await p.textContent('#tres p'));
  await p.goto(U + '#/explore/theme/wish'); await p.goto(U + '#/explore/region/' + encodeURIComponent('강원')); await p.goto(U + '#/dex');
  // journal with photo
  await p.goto(U + '#/journal/new/buseoksa'); await p.fill('textarea[name=note]', '무량수전 앞 노을이 좋았다.');
  await p.setInputFiles('input[name=photo]', SS + '01-home.png'); await p.click('#jform button[type=submit]'); await p.waitForTimeout(800);
  console.log('journal entries:', await p.locator('.jentry').count(), 'img:', await p.locator('.jentry img').count());
  // big mode
  await p.goto(U + '#/home'); await p.click('#bigToggle'); await p.waitForTimeout(300);
  await p.screenshot({ path: SS + '05-home-bigtext.png' });
  console.log('state:', await p.evaluate(() => { const s = JSON.parse(localStorage.getItem('maeumjeongwon.v1')); return { visits: s.visits.length, gps: s.visits.filter(v => v.method === 'gps').length, big: s.big }; }));
  console.log('ERRORS:', errs.length ? errs : 'none');
  await b.close();
})().catch(e => { console.error(e); process.exit(1); });

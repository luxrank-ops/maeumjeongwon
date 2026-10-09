'use strict';

const assert = require('node:assert/strict');
const http = require('node:http');
const crypto = require('node:crypto');
const { createApp } = require('../server/app');
const identity = require('../server/identity');
const { findTemple } = require('../server/content/temples');

const SECRET = 'smoke-test-secret-32-chars-minimum-0000';
const { publicKey, privateKey } = crypto.generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
const pubPem = publicKey.export({ type: 'spki', format: 'pem' });

(async () => {
  let passed = 0, failed = 0;
  function ok(cond, msg) {
    if (cond) { passed++; console.log('PASS ' + msg); }
    else { failed++; console.error('FAIL ' + msg); process.exitCode = 1; }
  }

  const app = createApp({
    secret: SECRET,
    adUnitIds: ['ca-app-pub-test/reward1'],
    adKeys: async (kid) => kid === '3335741209' ? pubPem : null
  });

  const server = http.createServer(app);
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${server.address().port}`;

  try {
    // 1. 세션 발급 및 서명 검증
    const sRes = await fetch(base + '/api/session', { method: 'POST' }).then(r => r.json());
    ok(identity.UID_RE.test(sRes.uid) && identity.verify(SECRET, sRes.token) === sRes.uid, '1. session issue & HMAC signature verify');

    // 2. 위조된 Bearer 토큰은 401 반환
    const badRes = await fetch(base + '/api/me', { headers: { Authorization: 'Bearer mj1.' + sRes.uid + '.forged_signature_123456789012345678901234567' } });
    ok(badRes.status === 401, '2. forged bearer token rejected with 401');

    // 3. 성주사(seongjusa) 무료 조회: 풍수 해설 나머지 2편은 응답에 없어야 함
    const seongjusa = findTemple('seongjusa');
    const hidden = (seongjusa.fengshui || []).slice(1);
    const freeExt = await fetch(base + '/api/temples/seongjusa/extras', {
      headers: { Authorization: 'Bearer ' + sRes.token }
    }).then(r => r.json());
    const freeStr = JSON.stringify(freeExt);
    ok(!freeExt.unlocked && hidden.length > 0 && hidden.every(x => !freeStr.includes(x)), '3. free: hidden fengshui texts not in response');

    // 4. 보리암(boriam) 무료 조회: 추가 전설은 제목만 있고 본문(text)은 없어야 함
    const boriam = findTemple('boriam');
    const hiddenLegendText = boriam.legends[0].text;
    const freeBoriam = await fetch(base + '/api/temples/boriam/extras', {
      headers: { Authorization: 'Bearer ' + sRes.token }
    }).then(r => r.json());
    ok(freeBoriam.legends.length >= 1 && !JSON.stringify(freeBoriam).includes(hiddenLegendText.slice(0, 20)), '4. free: extra legend text hidden, title only');

    // 5. 플러스 활성화 후 성주사 조회: 풍수 해설 전체가 포함되어야 함
    await fetch(base + '/api/dev/entitlement', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + sRes.token, 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'plus' })
    });
    const paidExt = await fetch(base + '/api/temples/seongjusa/extras', {
      headers: { Authorization: 'Bearer ' + sRes.token }
    }).then(r => r.json());
    const paidStr = JSON.stringify(paidExt);
    ok(paidExt.unlocked && hidden.every(x => paidStr.includes(x.slice(0, 15))), '5. plus: all fengshui texts shown');

    // 6. 플러스 활성화 후 보리암 조회: 추가 전설 본문(text)까지 모두 포함되어야 함
    const paidBoriam = await fetch(base + '/api/temples/boriam/extras', {
      headers: { Authorization: 'Bearer ' + sRes.token }
    }).then(r => r.json());
    ok(paidBoriam.unlocked && JSON.stringify(paidBoriam).includes(hiddenLegendText.slice(0, 20)), '6. plus: extra legend full text shown');

    // 7. AdMob SSV 서명 검증 콜백으로 비구독 사용자 스토리 해제
    const s2 = await fetch(base + '/api/session', { method: 'POST' }).then(r => r.json());
    const rawContent = `ad_network=5450213213286189855&ad_unit=ca-app-pub-test/reward1&custom_data=${s2.uid}|haeinsa-1&reward_amount=1&reward_item=story&timestamp=1700000000000&transaction_id=tx_smoke_1`;
    const sign = crypto.createSign('SHA256');
    sign.update(rawContent);
    sign.end();
    const sigB64Url = sign.sign(privateKey).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    const ssvRes = await fetch(`${base}/api/ads/ssv?${rawContent}&signature=${sigB64Url}&key_id=3335741209`).then(r => r.json());
    ok(ssvRes.ok && ssvRes.result === 'granted', '7. AdMob SSV callback signature verified and granted');

    console.log(`\nSmoke test summary: ${passed} passed, ${failed} failed`);
  } finally {
    server.close();
  }
})();

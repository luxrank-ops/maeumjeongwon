'use strict';

/* 홍보글 복사 — 홈 맨 아래 '📢 홍보글·링크 복사' 한 칸.
 *
 * 이 앱을 소개할 때 쓰는 문구와 주소가 한 번에 복사되어야 한다.
 * 가드가 지키는 것: ① 홍보글·주소가 실제 배포 주소(workers.dev)인지
 *                   ② 버튼이 홈 안에 있고 처리기(data-act)가 있는지
 *                   ③ Clipboard API + 비HTTPS/구형 WebView textarea fallback
 *                   ④ 복사 뒤 '복사됐어요' 피드백. */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..', '..');
const app = fs.readFileSync(path.join(ROOT, 'js', 'app.js'), 'utf-8');

test('홍보글·주소: 새 Cloudflare Workers 주소와 홍보 문구가 함께 들어 있다', () => {
  assert.match(app, /const PROMO_URL = 'https:\/\/maeumjeongwon\.luxrank\.workers\.dev'/, '복사할 주소는 새 Cloudflare Workers 주소여야 한다');
  for (const line of [
    '머리 복잡할 때, 조용한 절에 다녀오고 싶은 날 있으시죠? 🌿',
    '전국 991개 전통사찰을 한눈에 보고 마음을 쉬어가는 [마음정원(절로가)]이에요.',
    '✔ 내 상황에 딱 맞는 3문항 맞춤 사찰 추천',
    '✔ 사찰별 이야기·풍수 정보부터 사경첩·마음 상담까지 무료 이용!',
    '이번 주말 드라이브·산책 코스 찾으실 때 한번 들러 보세요 👇'
  ]) {
    assert.ok(app.includes(line), `홍보 문구가 빠졌다: ${line}`);
  }
  // 주소는 문구 마지막 줄에 붙는다(문구와 링크가 따로 놀지 않게)
  assert.match(app, /'이번 주말 드라이브·산책 코스 찾으실 때 한번 들러 보세요 👇',\s*PROMO_URL/, '복사 본문 마지막 줄이 주소여야 한다');
});

test('버튼은 홈 맨 아래 카드 안에 있고, data-act 처리기가 있다', () => {
  const home = app.slice(app.indexOf('function viewHome()'), app.indexOf('function greetPart()'));
  assert.match(home, /const promoCard = `<section class="card promo-card">/, '홍보 카드가 홈 화면 안에 있어야 한다');
  assert.match(home, /data-act="copy-promo">📢 홍보글·링크 복사</, '버튼 라벨은 무엇을 복사하는지 분명해야 한다');
  assert.match(home, /id="promoCopyStatus" role="status" aria-live="polite"/, '복사 결과를 리더기가 읽을 자리가 있어야 한다');
  assert.match(home, /\$\{promoCard\}/, '홈이 홍보 카드를 실제로 그려야 한다');
  // 홈의 다른 조각들과 같은 방식으로 처리된다 (단청 ② 가드와 같은 규칙)
  assert.match(app, /act === 'copy-promo'/, '클릭 처리기가 있어야 한다');
  assert.match(app, /function copyPromoText\(\)/, '복사 동작이 한 함수에 모여 있어야 한다');
});

test('복사 방식: Clipboard API → textarea fallback, 그리고 복사됐어요 피드백', () => {
  const fn = app.slice(app.indexOf('function copyPromoText()'), app.indexOf('function copyPromoText()') + 2200);
  assert.match(fn, /navigator\.clipboard && navigator\.clipboard\.writeText/, 'Clipboard API를 먼저 쓴다');
  assert.match(fn, /navigator\.clipboard\.writeText\(PROMO_TEXT\)\.then\(\(\) => done\(true\), fallback\)/, 'Clipboard API가 거부되면 fallback으로 넘어간다');
  assert.match(fn, /document\.execCommand\('copy'\)/, '비HTTPS·구형 WebView용 textarea fallback이 있어야 한다');
  assert.match(fn, /홍보글이 복사됐어요!/, '복사 후 버튼 라벨이 바뀌어야 한다');
  assert.match(fn, /카카오톡·밴드에 그대로 붙여넣으시면 됩니다\./, '다음에 무엇을 할지 알려 줘야 한다');
  assert.match(fn, /복사가 안 됐어요 · 다시 눌러 주세요/, '실패도 조용히 넘기지 않는다');
});

'use strict';

/* 절로가 — 사이트 고정 값 (검색 등록·분석용)
 *
 * 배포 환경변수(SITE_URL, GA_MEASUREMENT_ID)가 없거나, Cloud Run 미리보기 주소처럼
 * 검색엔진에 노출되면 안 되는 값이 들어 있어도 사이트는 자기 주소를 잃지 않아야 한다.
 * sitemap.xml·robots.txt·canonical 이 잘못된 도메인을 가리키면 검색 등록이 통째로 어긋난다.
 * 그래서 '이 사이트의 정식 주소'와 '이 사이트의 GA4 속성'을 여기 한 곳에 적어 둔다.
 */
module.exports = {
  // 정식 주소 (Cloudflare Workers 운영 도메인 — 2026-11-14 Vercel 에서 이전)
  SITE_URL: 'https://maeumjeongwon.luxrank.workers.dev',

  // GA4 속성 '절로가 (maeumjeongwon)' — 2026-11-14 생성, 스트림 '절로가 웹'(16339150224)
  GA_MEASUREMENT_ID: 'G-GK4GX2C0BW',

  // 검색엔진 소유확인 파일 — 루트(/)에서 그대로 내려야 확인이 된다.
  // 파일 이름·내용 모두 각 서비스가 발급한 값이라 임의로 바꾸면 확인이 실패한다.
  VERIFICATION_FILES: {
    'google968bd4b8f647180b.html': 'google-site-verification: google968bd4b8f647180b.html',
    'naver08c0f6832a6e38593b56274b38caf6c9.html': 'naver-site-verification: naver08c0f6832a6e38593b56274b38caf6c9.html',
    'naverabdc4ff28153e413f2c121f10ff83dea.html': 'naver-site-verification: naverabdc4ff28153e413f2c121f10ff83dea.html'
  }
};

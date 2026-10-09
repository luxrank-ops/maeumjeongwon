# 출시 점검표 (`docs/launch-checklist.md`)

## A. 서버 보안 및 환경 변수
- [ ] 운영 환경에서 `NODE_ENV=production` 설정
- [ ] `SESSION_SECRET` 32자 이상 난수로 설정
- [ ] `ALLOW_DEV_ENTITLEMENT`, `ALLOW_DEV_AD_REWARD` 미설정(또는 `0`) 확인

## B. 결제 연동 (RevenueCat)
- [ ] `REVENUECAT_WEBHOOK_AUTH` 설정 및 RevenueCat 대시보드 Authorization 헤더 일치 확인
- [ ] 구독 상품(`plus_monthly`, `plus_yearly`) 및 단품 카탈로그 ID 매핑 확인

## C. 앱 보상형 광고 (AdMob SSV)
- [ ] `ADMOB_AD_UNIT_IDS` 환경 변수 설정
- [ ] AdMob SSV 콜백 URL을 `/api/ads/ssv`로 등록

## G. 웹 SEO 및 Google AdSense (`docs/adsense-plan.md` 참고)
- [ ] 애드센스 승인 도메인 확정 및 `SITE_URL` 지정
- [ ] `ADSENSE_PUB_ID` (`pub-` + 16자리 숫자) 및 `ADSENSE_TEMPLE_SLOT` 설정 후 `npm run build:seo` 실행
- [ ] `https://도메인/ads.txt` 응답에 `google.com, pub-..., DIRECT, f08c47fec0942fa0` 노출 확인
- [ ] 사찰 SEO 페이지(`/temple/:id/`)에만 하단 광고 1칸이 들어가고, 스토리 페이지(`/story/:id/`)와 앱 셸(`index.html`)에는 애드센스 코드가 없는지 확인 (`npm test`)
- [ ] 개인정보 처리방침에 Google 쿠키 및 맞춤형 광고 안내 반영

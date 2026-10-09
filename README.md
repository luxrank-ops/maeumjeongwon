# 마음정원 (MVP 프로토타입)

전국 사찰의 기원·역사·전설을 이야기로 읽고, 순례 미션으로 모으고, 여행을 계획하는 사찰 순례·힐링 여행 앱의 정적 SPA 프로토타입입니다. 백엔드 없이 모든 기록은 브라우저 localStorage(`maeumjeongwon.v1`)에 저장됩니다.

## 실행
```bash
cd maeumjeongwon
python3 -m http.server 8642      # 또는: npx serve -l 8642 .
# 브라우저에서 http://localhost:8642  (모바일 화면 크기 권장)
```
GPS 인증은 브라우저 보안상 `localhost` 또는 HTTPS에서만 동작합니다. 지도 타일(OpenStreetMap)은 인터넷 연결이 필요합니다.

## 구성
- `index.html` — 앱 셸, 하단 탭(홈/탐색/지도/순례/수첩), 큰글씨 토글
- `css/style.css` — 따뜻한 한지 톤 모바일 우선 디자인, `body.big` 큰 글씨·간편 모드
- `js/app.js` — 해시 라우터, 마음 처방전, 탐색, 상세, GPS/데모 체크인, 미션·배지, 염주(108), 등급, 도감, 순례 지도, 사찰 수첩
- `js/data-temples.js` — 상세 사찰 55곳 (좌표·종단·창건·문화재·연혁·전설·관람 포인트·풍수 이야기·참고 영상·확인 필요 항목)
  - 2026-10: 유튜브 「풍생풍사TV」(https://www.youtube.com/channel/UC4vixRMoeQGcjGvJWcYLKxQ) 영상 자막·설명 기반으로 13곳 추가, 기존 12곳 보강 (풍수 해석은 영상 제작자 견해·효험 보장 아님)
- `js/data-traditional.js` — 첨부 PDF「전통사찰 현황」(2026.6.1.) 991곳 전체 목록
- `vendor/` — Leaflet 1.9.4
- `tools/smoke-test.js` — Playwright 스모크 테스트/스크린샷, `tools/geocode.py` — 좌표 조회 스크립트

## 데이터 원칙
- 전설은 모두 「전해지는 이야기」로 표기, 효험 보장 문구 없음
- 모르는 실용정보(주차·입장료·개방시간·교통·소요시간)는 「확인 필요」로 표기
- 출시 전 불교학·문화유산 전문가 감수 필요

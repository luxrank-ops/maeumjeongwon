---
version: 1
slug: "index-html"
primary_target: "index.html"
related_targets: ["css/style.css","js/app.js"]
---

# Surface brief — 앱 셸 + 전 표면 (리모델링)

- Scope: 모바일 우선 SPA 전 표면. Mode: Operate (읽기 화면은 Read 규칙, 내비·컨트롤은 플랫폼 표준 유지).
- Audience/job: 40~60대 사찰 방문객·힐링 여행자. 집에서 이야기 읽기·계획, 경내에서 방문 준비 확인·GPS 인증. 성공 = 마음을 고르고 어울리는 사찰을 찾아 실제로 다녀옴.
- Constraints: 첫 화면 gzip ≤140KB(CI), 웹폰트 추가 없음, 탭 5개 구조 유지, 큰글씨 모드·44px 타깃·reduced-motion 유지, 데모 결제/잠금 플로우 유지, 사실 표기 원칙, Leaflet 지도 유지.

## Direction contract

THESIS: 사경(寫經) 수행의 기록지 — 사용자의 하루·방문·수행이 방안 반격지 위에 한 칸씩 채워지는 앱. 카테고리 기본형(파스텔 그라디언트 + 둥근 카드 나열 + 식물 심볼)을 거부한다.

OWN-WORLD: 담청빛 미색 지면 `#f3f1ea`, 카드 `#faf9f4`, 먹 `#221e19`/`#575046`, 선 `#ded9cc`. 단일 강조색 주사(朱砂) `#b03a25`는 도장·선택 상태·주 행동 버튼에만. 명조 대제목(시스템 세리프 스택) + 고딕 본문, 1px 방안선, 각진 도장. 금니 골드 `#a5812e`는 108 완성 전용. 세계는 type·palette·density·시그니처 무브 넷만 빌린다 — 레이아웃·내비·컨트롤은 표준.

STORY: 방문자는 이 앱이 "기록해 주는" 도구임을 안다. 마음을 고르면 사찰과 이야기가 오고, 다녀오면 칸이 채워진다. 상업은 흐름의 끝 한 장.

FIRST VIEWPORT: 얇은 헤더(브랜드「절로가」좌, 플러스·큰글씨 우) → 오늘 날짜 문안 한 줄 → 대형 명조 제목 "오늘의 마음 처방" + 여섯 개 방안(方格) 감정 칩 → 선택 시 처방 카드(먹 테두리·주사 처방 마크) → '나의 사경' 진행 칸: 방문할 때마다 방안 한 칸에 주사 도장이 찍힌다(시그니처). 하단 5탭: 먹글씨+활성 주황 기점.

FORM: 내 grounded 후보 7개 중 공명 순 6번(공정한 주사위 배정), seed:7104e7900ef8450f. 후보: 1 사찰 안내표지 체계, 2 한지·창호지, 3 염주 108, 4 단청 절제 팔레트, 5 탁본, 6 **사경 방안(당선)**, 7 다식 문양. ※ 열은 degraded(챌린저·보드 없음, impeccable.style 롤 서비스 미도달)이며 배정 강도는 그대로 적용.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance.

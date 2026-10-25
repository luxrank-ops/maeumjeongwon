# v4 디자인 부록 — 사경첩(寫經帖) 리모델 (2026-10-26)

v3 '사찰 한지' 리프레시(`docs/design-refresh.md`)의 **후속 전면 교체** 기록. 최종 계약은 루트 `DESIGN.md` 와 `.impeccable/design.json` 이 진실 원천이다. 이 문서는 "v3 → v4 무엇이 왜 바뀌었나"의 감사 로그.

## 1. 방향 결정

- Impeccable `concept-seed` 롤 서비스 불가 → 구조적 폴백 롤(감정 사실 공표), 배정 6번 시드 `seed:7104e7900ef8450f`.
- 시각 방향 질문 UI(`serve-question --start`) 브라우저 부재로 실패(exit 2) → 제품 맥락(PRODUCT.md: 40–60대, 홀로가기·기록·준비)에서 **사경첩** 단일 추천으로 확정. 재시도 없음.
- 계약: `.impeccable/surfaces/index-html.md`(direction contract), 페이로드 `.impeccable/questions/direction-payload.json`.

## 2. 팔레트 교체표 (핵심)

| v3 | v4 | 의미 |
|---|---|---|
| `#f6f1e7` 종이 | `#f3f1ea` | 사경지(담청 미색) |
| `#33604a` 향초록 | — **삭제** | 세계 퇴장 |
| `#7a8f5c` 세이지 | — **삭제** | 세계 퇴장 |
| `#b5643c` 테라코타 | `#b03a25` | **주사(朱砂)** — 유일 포화 색 |
| `#c9a24a` 밝은 금 | `#8a6a22` | 금니(완성 전용, 절제) |
| `--pine-*` 토큰 | `--ju-*`(朱砂) | 103곳 일괄 개명 |
| 다크 `#121815` 녹조 | `#161310` 먹조 | 밤에도 '녹색 사찰' 아님 |

텍스처: v3 히어로 그래디언트+블롭 삭제 → `.sg-paper` 26px 반격 먹선 그리드 1종만.

## 3. 구조 변경 목록

### CSS (css/style.css)
- ⑮-1 팔레트(낮/저조도) 전면 재작성 + `--r:8/--r-sm:6/--r-lg:14`, ring·tint·rgb 부품 재조정, `prefers-contrast` 값 갱신(ju `#8a2c1c`/`#eda987`).
- 구조 편집 32건: `::selection`·커서·스크롤바 등 **브라우저 크롬 표면** 테마화, 브랜드마크 주사 전각화, 키커 CSS 삭제, 버튼/입력/시트 각 14→8·24→16, `.seal` 5px 사각, `.stampbig` 원→9px 사각, 진행바 평면화(2px), 도감 칸 6px+규칙 재정의(got=ju-soft/ju-line 주사 테두리), 기분 점 8px 회전 사각, 각종 점(dot) 2px 사각화, `--verse`·정보 카드의 4px 사이드탭 전면 1px화, 탭바 🪷 리딩 제거.
- 신규 시그니처 블록: `.sg-grid`(10열 반격도), `.sg-cell/.full/.next`, `.complete .full`(금니), `@keyframes stamp-in`(스태거, reduced-motion 정지).

### JS (렌더 마크업)
- 키커 라벨 총 20곳 제거(js/app.js 19 + js/app/community.js 1) — 제목만 남기거나 `tag`/`tag v` 로 강등(처방·선택 사항·공식 데이터·회원 전용·심화 스토리 편수).
- `pilgrimCard` 진행 바 → **`.sg-grid` 100칸 반격도** 생성(aria-label '반격 한 칸에 도장' 서사 유지).
- 지도 마커: 방문=주사 fill/짙은 테두리, 미방문=무빛 점토선. 일정 폴리라인 주사. 경유 마커 주사 링.
- 완주증 캔버스 색 10값 전면 교체(주사·금니·먹 계열). 염주 중앙 숫자 색 교정(`#221e19`).
- `THEME_BAR` 라이트/다크 `#f3f1ea`/`#161310`.

### 셸·부속
- index.html: theme-color 메타 2종, 파비콘 🪷이모지 → **vermilion 전각+心** data-URI.
- manifest.theme/background `#f3f1ea`; sw.js 캐시 `maeumjeongwon-v8`; build-seo theme-color.
- `tools/generate-icons.js` 색 상수 3건 교정(재생성 시 새 세계 반영; 실물 PNG 재생성은 후속 과제).
- js/features.js 잔여 `var(--bg)` 1곳 → `var(--paper)`(시맨틱 `--surface-1` 대응) 정리.

### 가드 테스트 갱신
- features-v9: manifest.theme_color 기대값 + 주석(사경지 톤).
- responsive-layout: theme-color 기대값.
- design-system: `--pine`→`--ju` 참조 갱신(기존 sed), 블록 앵커 그대로.
- app-runtime '홈 순서' 테스트: 앵커를 문자열 `'내 순례'`(삭제된 키커 글자) → 구조 클래스 `'pilgrim-card'` 로 교체(의도된 재배치 보장은 동일).

## 4. craft-floor 체크 결과

| 항목 | 결과 |
|---|---|
| 브라우저 크롬(selection/caret/scrollbar/dialog/포커스고리) | ✅ 전부 테마 토큰 |
| 하나의 저자 움직임(stamp-in, expo 이즈, reduced-motion) | ✅ |
| 오프셋 글로우·사이드 탭·박스 그림자 잔치 | ✅ 제거(detect 경고 5건 해소) |
| 모서리 일관성(≤14, 완전원 아바타·알약만) | ✅ |
| 타입 체계(본문 돋움/제목 명조, 숫자 강조 세리프) | ✅ 유지·강화 |
| 44px 타깃·big 모드·다크 팔레트 완결 | ✅(테스트 149/149) |
| 콘텐츠 규칙(전설/효험/확인 필요 라벨/외부 영상 없음) | ✅ 건드리지 않음 |

## 5. 검증 로그

- `npm run verify` (최종): 테스트 149/149 · 첫화면 gzip **133.4KB/140KB** · content/temples 스모크 · SEO 빌드(65/9).
- `impeccable detect`: side-tab 5건 → 0; 잔여 = 반격 그리드 서명(advisory) + 파비콘 오탐 3 — 이번 세션 대상 아님.
- 스크린샷 시각 검토: 샌드박스 브라우저 부재로 불가 → 라이브 프리뷰(8080)로 갈음(열화 공표).

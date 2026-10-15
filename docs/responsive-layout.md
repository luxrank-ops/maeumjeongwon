# 화면 최적화(반응형) 설계 — 모바일 · 태블릿 · 웹 데스크톱

2026-10 레이아웃 정리. 앱은 **모바일 우선**으로 그리되, 화면 폭이 넓어지면 구성 배치가 자동으로 다시 조립되도록 만들었다.
핵심은 "기기의 종류"를 보는 게 아니라 **남는 폭**을 보는 것 — 열 개수는 대부분 `auto-fill + minmax()` 이 브라우저가 계산한다.

## 1. 브레이크포인트

| 폭 | 대상 | 화면이 바뀌는 것 |
| --- | --- | --- |
| 기본 ~559px | 스마트폰 | 1열 스택, 하단 스티키 탭바, 하단 시트 모달, 터치 타깃 44px |
| ≥560px | 큰 폰·좁은 창·분할 화면 | 사찰 목록·배지·기분 칩 2열 후보, 카드 여백 확대 |
| ≥760px | 태블릿 세로 | 본문 740px, 지도 62vh, 모달이 중앙 대화상자로 전환, 스탬프 확대 |
| ≥1120px | 태블릿 가로·노트북 | **하단 탭 → 좌측 사이드 내비**, 캐버스 1240px, 본문은 900px 열로 중앙 정렬, 카드 안 본문은 72ch 로 선 길이 제한 |
| ≥1440px | 와이드 데스크톱 | 카드 자체를 2열 대시보드로 재배치(`data-flow=cards` 화면만), 지도 72svh |
| ≥1760px | 울트라와이드 | 열 폭만 추가 확대(열 개수는 계속 auto-fill 이 계산) |

`@media (max-height:560px) and (orientation:landscape)` — 가로모드 짧은 화면 전용: 탭바를 아이콘+라벨 한 줄로 눕히고, 카드 여백·스티커 이미지를 줄이고, 지도를 `100svh - 168px` 로 확보한다.
`@media (max-width:380px)` — 320~360px 에서 상단 칩·로고를 조여서 헤더 줄바꿈( horizontal 스크롤 )을 막는다.

## 2. 셸 구조

```
모바일·태블릿                       데스크톱(≥1120px)
┌──────────────┐ topbar(sticky)     ┌────────┬──────────────────┐
│  마음정원사   │                    │ 메뉴    │ topbar(sticky)   │
├──────────────┤                    │ 🏠 홈   ├──────────────────┤
│              │ body(1fr)          │ 🧭 탐색 │ main (max 900px) │
│    main      │                    │ 🗺️ 지도 │                  │
│              │                    │ 🏅 순례 │                  │
├──────────────┤                    │ 📔 수첩 │                  │
│ 탭바(sticky)  │ nav(auto)          └────────┴──────────────────┘
└──────────────┘                    grid-template-areas:"rail top" / "rail body"
```

* `#app` 은 CSS 그리드(행: `top / body / nav`). 하단 탭바는 `position:fixed` 가 아니라 **그리드 행에 붙은 sticky** — 모바일 브라우저 주소창이 접히거나 키보드가 올라와도 본문이 흔들리지 않는다.
* 데스크톱에서는 같은 요소를 `grid-area:rail` 로 옮겨 세로 내비가 된다(`.tabbar::before` 에 "메뉴" 라벨, `::after` 에 앱 상태 표기). **DOM은 하나**이므로 모바일 웹·하이브리드 앱·데스크톱이 같은 마크업을 쓴다.
* `svh` 를 쓰고 지원 전 브라우저에는 `vh` 를 한 줄 먼저 두어 폴백한다(지도·시트·본문 최소높이). 노치·홈인디케이터는 `env(safe-area-inset-*)` — `@supports` 로 감싸 미지원 환경에서 선언 전체이 깨지지 않게 했다.

## 3. 타이포·여백 스케일

* `--fs-base: clamp(15px, .55vw + 13px, 17.5px)` → `body{--fs:var(--fs-base); font-size:var(--fs)}`.
  계산 위치가 `body` 이므로 `body.big` 에서 `--fs-base` 를 교체하는 방식으로 큰 글씨 모드(18~21.5px)가 모든 화면 크기에서 함께 동작한다. (`:root` 에서 계산하면 자식 오버라이드가 반영되지 않는다.)
* `--pad-x/--pad-y/--gap/--r/--tap` 토큰으로 여백을 함께 키워, 태블릿·데스크톱에서 모바일 밀도가 그대로 유지되지 않게 했다.
* 입력기는 `font-size:max(16px, 1em)` — iOS Safari 의 포커스 자동 확대 방지. `input[type=checkbox]` 는 제외하고, `select` 는 `appearance:none` + 내장 화살표.

## 4. 구성 배치 규칙

| 요소 | 좁은 화면 | 넓은 화면 |
| --- | --- | --- |
| `.tlist`(사찰 목록) | 1열 | ≥560px `auto-fill minmax(300px)` → 2·3열 |
| `.moods` 기분 / `.badges` 배지 | `auto-fill` 3열·3열 | 150~176px 기준으로 열 증가 |
| `.dex` 도감 | `minmax(62px)` ≈ 5열 | 76px → 88px 로 칸 확대 |
| `.tilemap` 한국 지도 | 항상 5열(지형 격자) | `max-width:460~520px` 로 카드 안에서만 확대 |
| `.plans` 요금제 | 2열 고정(월/연 비교 유지) | ≥1120px `auto-fit` + 660px 캡 |
| `.grid2` 버튼 쌍 | 항상 2열 | 그대로(취소/확인 짝) |
| `#map` `#pmap` | `58svh`(320~660px) | 62 → 66 → 72svh |
| `.card` 안 텍스트 | 전부 | ≥1120px `72ch` 제한 |

## 5. 모달·토스트

* 모바일: 화면 아래 시트(`border-radius:20px 20px 0 0`, `max-height:90svh`, `overscroll-behavior:contain` — 시트 끝에서 본문이 같이 스크롤되는 것 방지).
* ≥760px: 중앙 대화상자(`max-width:700px`, 1440px 이상 820px).
* 열면 `body.modal-open{overflow:hidden}` 으로 배경 스크롤을 잠그고 시트에 포커스를 준다. 배경 클릭·`Esc`(`.sheet` 의 `data-act=close` 버튼과 별개로 웹 키보드 경로)로 닫는다.
* `#toast` 는 탭바 높이 + 안전영역 위에 떠서 어떤 화면에서도 가려지지 않는다.

## 6. 지도

`resize` · `orientationchange` · `visualViewport.resize` 에서 140ms 디바운스로 `invalidateSize()` 를 호출하고, 라우터가 지도를 만든 직후 380ms 에 한 번 더 맞춰 폰트·레이아웃 자리잡기를 견딘다.

## 7. 정적 SEO 페이지

`tools/build-seo.js` 가 뽑는 `/temple/:id/`, `/story/:id/` 도 같은 `css/style.css` 를 쓰므로 화면 최적화를 함께 받는다. 본문 열을 `max-width:680px` 고정에서 `width:min(100% - 32px, 780px)` 유동으로 바꾸고 `viewport-fit=cover`·`theme-color` 를 추가했다.

## 8. 접근성·입력 도구 분기

* `.skip`(본문 바로가기) 링크, `:focus-visible` 테두리, `aria-pressed`(큰 글씨) 유지.
* `@media (hover:hover) and (pointer:fine)` — 마우스에서만 호버 스타일·입력 높이 38px(밀도).
* `@media (hover:none) and (pointer:coarse)` — 터치에서만 목록 칸 최소높이 48px.
* `@media (prefers-reduced-motion:reduce)` — 시트 상승 애니메이션·토스트 페이드 즉시 종료.

## 9. 가드

`server/test/responsive-layout.test.js` 가 정적 검사로 다음을 지킨다: 5단계 브레이크포인트 존재, `max-width:480px` 하드 캡 금지, safe-area 폴백 구조, `svh`+`vh` 동반, 터치 44px·입력 16px, `auto-fill` 유지, `data-flow` 훅과 CSS 짝, 모달 스크롤 잠금, 리사이즈 시 `invalidateSize`, SEO 페이지 유동 폭.

## Known limitations

* 브라우저 레이아웃 자체를 검증하는 테스트는 없다(Playwright 스모크는 별도 실행) — 실기기 확인 항목: iOS 세이프에어리어, 안드로이드 주소창 접힘, 태블릿 분할 화면.
* 1440px 이상 2열 카드는 카드 높이가 크게 다를 때 여백이 생길 수 있다(`align-items:start`) — 실제 데이터로 단단해지면 상세 화면 등에 래퍼를 넣어 페어링한다.
* 저조도(다크) 모드는 2026-10 2차 리프레시에서 반영됐다 — 시맨틱 토큰(`--surface-*`/`--text-*`)
  도입 후 `:root[data-theme=dark]` 한 곳에서 팔레트만 교체한다. 자세한 판단은 docs/design-refresh.md 5-2.
* 실기기 감수 항목: 저조도 대비 감각, 상단 칩 5개가 320px에서 밀리는지, sticky 검색칸과 상단바 높이 정렬.

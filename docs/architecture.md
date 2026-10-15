# 앱 구조와 배치 — 분석과 정리 (2026-10)

사찰 순례·힐링 앱 「마음정원사 : 절로가」의 **코드 구조**와 **화면 배치**를 효율화한 작업 기록.
목표는 두 가지였다. ① 처음 열었을 때 실제로 쓰지 않는 코드까지 받지 않게 한다. ② 2,700줄짜리 단일 파일과
쌓여 있는 카드 목록을, 다음 사람이 손댈 수 있는 경계로 나눈다.

빌드 도구 없이(바닐라 JS + Express) 그대로 유지하면서 진행했다. 검증은 `npm run verify`.

---

## 0. 한 장 요약

| | 이전 | 이후 |
| --- | --- | --- |
| 첫 화면이 내려받는 양 | 699KB (gzip 208KB) | **364KB (gzip 118KB)** — 43% 감소 (`npm run budget`) |
| 앱 셸 한 파일 | `js/app.js` 2,768줄 · 196KB | `js/app.js` 1,869줄 · 143KB + `js/app/planner.js` 989줄(계획 화면에서만) |
| 지연 로딩 | 없음 (모든 화면이 전부 로드) | 화면별 자산 표(`js/lib/loader.js` NEEDS) — leaflet·전통사찰 991곳·기도·풍수·스토리·계획 모듈 |
| 압축 | 없음 | gzip 전 자산 (JS 196→60KB 등), 약 1/3 |
| 캐시 | 조건부 요청만 | `?v=` 자산 1년 immutable / 그 밖 7일 / HTML·SW는 no-cache |
| 화면 배치 | 홈 카드 15장이 순서 없이 누적 | "오늘 → 지금 → 계획 → 도구 → 읽을거리 → 상업" 위계 + 중복 카드 제거 |
| 문서 | README 한 곳에 산재 | `docs/architecture.md`(이 문서) + `docs/responsive-layout.md`(화면 규격) |

---

## 1. 계층 지도 (파일 / 역할 / 언제 받는가)

로딩 시점이 곧 구조다. "무거운가"가 아니라 **"그 화면에 들어가야 쓰는가"** 로 나눴다.

```
index.html ──▶ css/style.css ──▶ js/lib/loader.js ──▶ [핵심] ──▶ js/app.js
   (셸)            (한지 톤)        (지연 자산 표)      (데이터·기능)    (상태·화면·라우터)
                                                          │
                       라우트에 들어갈 때 loader.ensure() ─┘
                       ├─ 지도 화면      → vendor/leaflet.{css,js}      144KB
                       ├─ 전통사찰 991   → js/data-traditional.js       107KB
                       ├─ 계획 화면      → js/app/planner.js             58KB
                       ├─ 스토리(홈·상세) → js/data-stories.js            33KB
                       ├─ 기도 테마·가이드 → js/data-prayer.js             32KB
                       └─ 풍수 대백과    → js/data-fengshui.js           15KB
```

| 파일 | 역할 | 언제 받는가 |
| --- | --- | --- |
| `index.html` | 앱 셸(상단바·본문·탭바·모달 자리), 첫 화면 스크립트 7개 | 처음 |
| `css/style.css` | 디자인 토큰·셸 그리드·5단계 브레이크포인트 | 처음 |
| `js/lib/loader.js` | **지연 자산 표**(`ASSETS`·`NEEDS`·`SOFT`)와 로딩 실행기 | 처음 (5.7KB) |
| `js/app.js` | 앱 상태(localStorage)·화면 16개·라우터·이벤트 위임 | 처음 |
| `js/app/planner.js` | 사찰 여행 계획 + 조건별 추천 코스 | 계획 화면에서 |
| `js/features.js` | 9대 기능 모듈(PWA·날씨·내비·완주증·템플스테이·합성음·명상·i18n·도슨트·AI 상담) | 처음 |
| `js/planner-reco.js` | 추천 계획 엔진(순수 계산, DOM 없음) | 처음 |
| `js/data-temples.js` | 상세 사찰 65곳(+`THEMES`·`LIST_LABELS`) | 처음 |
| `js/data-stories.js` 등 나머지 `data-*` | 스토리·기도·전통사찰 991곳·풍수 대백과 | 그 화면에서 |
| `vendor/leaflet.*` | 지도 라이브러리 1.9.4 | 지도 화면에서 |
| `js/analytics.js`, `js/config.js` | 익명 통계, 앱 설정 | 처음 (합쳐 8KB) |
| `sw.js` | 오프라인 캐시(첫 설치 = 셸만, 지연 자산은 뒤에서 채움) | 서비스워커 |

```js
// js/lib/loader.js — 라우트 → 자산. 가장 구체적인 접두사가 이긴다.
var NEEDS = {
  home: ['stories'],                      // 홈의 '이번 주 심화 스토리' 카드
  story: ['stories'], temple: ['stories'],
  map: ['leaflet', 'stories'], missions: ['leaflet', 'stories'],
  planner: ['planner'], 'planner/view': ['planner', 'leaflet'],
  'planner/new': ['planner'], 'planner/theme': ['planner'],
  'journal/new': ['traditional'],         // 수첩 쓰기 = 사찰 선택 목록
  'explore/all': ['traditional'],
  'explore/theme/prayer': ['prayer'], 'explore/theme/wish': ['prayer'],
  'explore/theme/energy': ['prayer'], 'explore/theme/fengshui': ['fengshui'],
  fengshui: ['fengshui'], guide: ['prayer']
};
```

---

## 2. 첫 화면 로딩 예산

gzip(level 6) 기준 실제 전송 크기 — `npm run budget` 이 `index.html` 과 `js/lib/loader.js` 표를 읽어 그대로 계산한다
(숫자를 손으로 적지 않는다. `npm run verify` 에 `--check` 로 들어 있어 140KB 를 넘으면 실패한다).

| 파일 | 크기 | gzip | 이전 첫 화면 | 지금 첫 화면 |
| --- | --- | --- | --- | --- |
| index.html | 4.1KB | 1.7KB | ✅ | ✅ (splash 자리 포함) |
| css/style.css | 31.4KB | 9.8KB | ✅ | ✅ |
| js/lib/loader.js | 5.7KB | 2.4KB | — | ✅ (신규) |
| js/app.js | 142.5KB | 45.3KB | ✅ (196KB) | ✅ |
| js/data-temples.js | 106.5KB | 30.7KB | ✅ | ✅ |
| js/features.js | 48.7KB | 14.4KB | ✅ | ✅ |
| js/planner-reco.js | 12.9KB | 5.2KB | ✅ | ✅ |
| js/analytics.js + config.js | 7.9KB | 3.1KB | ✅ | ✅ |
| vendor/leaflet.js | 144.1KB | 41.7KB | ✅ → **지연** | 지도 화면에서 |
| vendor/leaflet.css | 14.5KB | 3.4KB | ✅ → **지연** | 지도 화면에서 |
| js/data-traditional.js | 107.3KB | 23.1KB | ✅ → **지연** | 전통사찰 화면에서 |
| js/data-prayer.js | 31.5KB | 11.6KB | ✅ → **지연** | 기도 테마·가이드에서 |
| js/data-fengshui.js | 15.1KB | 6.3KB | ✅ → **지연** | 풍수 화면에서 |
| js/data-stories.js | 32.7KB | 11.5KB | ✅ | 홈은 **먼저 그리고** 도착하면 채움(SOFT) |
| apple-touch-icon.png + manifest | 8.1KB | 7.6KB | ✅ | ✅ |
| js/app/planner.js | 58.3KB | 17.7KB | (셸에 포함) | 계획 화면에서 |
| **합계** | | | **699KB / gzip 208KB** | **364KB / gzip 118KB** |

두 가지 장치가 체감 속도를 만든다.

* **SOFT 자산** — 홈의 스토리 카드는 화면 아래쪽이라 기다리게 할 이유가 없다. `loader.SOFT = { home: ['stories'] }`.
  없으면 먼저 그리고, 도착하면 다시 그린다(시퀀스 번호로 늦게 온 응답이 되돌리지 못하게 막는다).
* **동기 경로** — 이미 받아 둔 자산뿐이면 `ensure()`를 거치지 않고 즉시 그린다(뒤로가기·탭 이동이 밀리지 않는다).

---

## 3. 지연 데이터를 화면이 쓰는 방법 (`hydrateLazyData`)

지연 데이터를 `const TRAD = window.TRADITIONAL_TEMPLATES.map(...)` 처럼 **IIFE 시작 시점에 붙잡으면 안 된다.**
그래서 무거운 데이터는 빈 그릇으로 두고, 로더가 가져온 뒤 `hydrateLazyData()`가 그릇을 **비우고 다시 채운다.**

```js
const TRAD = [], RAW_STORIES = [], STORIES = [];      // 참조는 고정
let  PRAYER_CRITERIA = [], PLAN_RECO = null;
function hydrateLazyData() {
  if (Array.isArray(window.TRADITIONAL_TEMPLATES)) {
    replaceAll(TRAD, window.TRADITIONAL_TEMPLATES.map(...));   // 같은 배열 객체를 채운다
    tradByNo = Object.fromEntries(TRAD.map(x => [x.no, x]));
  }
  ...
}
```

* 배열·객체는 **참조를 유지한 채** 채우므로 화면 코드는 이름을 그대로 쓴다(호출부 수정 없음).
* `lazyDataStamp`로 같은 조합을 두 번 만들지 않는다.
* 로더가 없는 환경(정적 SEO 페이지, 가드 테스트)에서는 `navigate()`가 동기 `render()`로 폴백해 **기존 동작 그대로**.

---

## 4. 앱 셸 분리 — 경계는 "의존 심볼 수"로 정했다

2,700줄을 감으로 자르지 않고, 섹션별 외부 참조를 세어 경계를 골랐다(`tools/_dep-audit.js`).
가장 깨끗하게 떨어져 나온 곳이 **사찰 여행 계획 + 추천 코스**였다.

| | 값 |
| --- | --- |
| 떼어 낸 범위 | `js/app.js` 1394–2338 (945줄, 셸의 35%) |
| 밖에서 가져다 쓰는 심볼 | 16개 (`S`·`save`·`render`·`toast`·`esc`·`today`·`haversine`·`resolveTemple`·`visited`·`openModal`·`TEMPLES`·`THEMES`·`MISSIONS`·`TRAD`·`SIDO_ORDER`·`PLAN_RECO`·`MJAnalytics`) |
| 밖으로 내주는 심볼 | 15개 (화면 3 · 액션 7 · 템플릿 목록 · 상태 4) |
| 상태 처리 | 초안(`draftStops`/`draftForm`/`draftCleared`)·검색기(`refreshTempleOptions`)는 모듈 안에 두고 **접근자로 노출** |

```js
// js/app/planner.js
function createPlanner(ctx) {
  const { S, save, render, toast, esc, today, haversine, resolveTemple, visited, openModal,
          TEMPLES, THEMES, MISSIONS, TRAD, SIDO_ORDER, MJAnalytics, PLAN_RECO } = ctx;
  /* ... 화면·계산 ... */
  return {
    viewPlanner, initPlanMap, bindPlannerForm, TRIP_TEMPLATES,
    ensureDefaultTrips, resetPlannerDraft, optimizeDraftOrder, openPlanPickModal,
    runRecommendation, applyRecommendation, dismissRecommendation,
    state: { get draftStops() {…}, set draftStops(v) {…}, /* … */ }
  };
}
```

셸 쪽은 얇은 다리만 남는다.

```js
// js/app.js
let planner = null;
function plannerMod() { return planner || (planner = window.MJ_PLANNER_FACTORY({ S, save, render, … })); }
function withPlanner(fn) { /* 계획 화면 밖(테마 코스·사찰 상세)에서 초안을 만질 때: 모듈 확보 후 실행 */ }
function viewPlanner(a, b) { const m = plannerMod(); return m ? m.viewPlanner(a, b) : '불러오는 중'; }
```

계획 화면 **밖**에서도 초안을 만지는 길이 셋 있다(테마 코스 → 계획에 담기, 사찰 상세 → 계획에 추가/새 계획).
이들은 `withPlanner()`로 모듈을 먼저 확보한 뒤 값을 넣는다 — 로더가 같은 요청을 합쳐 주므로 중복 다운로드는 없다.

### 왜 여기서 멈췄나

* **화면 단위로 더 쪼개지 않았다.** 홈·탐색·상세 같은 화면은 셸의 상태를 20~70개씩 참조한다. 쪼개면 `ctx`가
  화면보다 커져서 경계가 오히려 흐려진다. 계획 모듈은 예외적으로 결합도가 낮아(16개) 떼어 낼 값어치가 있었다.
* **`js/features.js`(1,269줄)는 그대로 뒀다.** 내부가 이미 9개 모듈 객체로 나뉘어 있고 서로 참조하지 않는다.
  파일만 늘리면 첫 화면에서 요청 9개가 더 생긴다. 통째로 하나(48.7KB·gzip 14.4KB)가 낫다.
* **`js/data-*.js` 경로도 옮기지 않았다.** 서버(`server/content/*`)가 같은 파일을 `vm`으로 읽고, 서비스워커·문서·
  가드 테스트가 경로를 참조한다. 이름 변경은 이득 없이 위험만 늘린다.

---

## 5. 화면 배치(IA)

### 5.1 내비게이션 — 탭 5개 + 레일 전용 2개

| | 모바일 | ≥1120px(좌측 레일) |
| --- | --- | --- |
| 하단 탭 | 홈·탐색·지도·순례·수첩 (5칸 유지) | 같은 DOM이 세로 메뉴가 된다 |
| 레일 전용 | (숨김) | 🗓️ 계획 · 🛍 상점 |

* 모바일은 엄지가 닿는 5칸을 지킨다. 계획·상점은 홈 카드·수첩 헤더·플러스 칩으로 이미 들어갈 수 있다.
* 넓은 화면에서는 화면이 남으므로 숨어 있던 라우트를 레일에 노출한다(`.tabbar a.rail-only`).
* 두 항목은 각각 `data-tab="journal"`·`data-tab="plus"` — 그 화면의 상위 탭도 함께 켜져 위치를 잃지 않는다.

### 5.2 홈 — 카드 15장에서 위계 있는 12장으로

배치 원칙: **오늘 할 일 → 지금 가기 좋은 곳 → 계획 → 도구 → 읽을거리 → 상업.**

| 순서 | 카드 | 왜 이 자리인가 |
| --- | --- | --- |
| 1 | (선택) 익명 통계 동의 | 한 번만 뜨는 안내 |
| 2 | 진행도 히어로 — 등급·염주·도감·완주증 | 돌아온 사람이 가장 먼저 확인하는 것 |
| 3 | (첫 방문) 온보딩 3문항 | 처음 온 사람의 다음 행동 |
| 4 | **오늘의 리추얼** | 매일 열게 만드는 것 — 위로 |
| 5 | **오늘의 마음 처방전** | 리추얼 다음의 두 번째 행동 |
| 6 | 지금 가기 좋은 계절 사찰 | 떠날 후보 |
| 7 | 사찰 여행 계획 | 계획으로 이어지는 길 |
| 8 | 도구 한 줄 (명상 / AI 상담) | 예전에는 히어로 버튼 + 큰 카드로 **중복**이었다 → 한 줄로 |
| 9 | 테마로 떠나기 | 탐색 위임 |
| 10 | 많이 찾는 사찰 | 탐색 위임 |
| 11 | 이번 주 심화 스토리 → 콘텐츠 상점 → 플러스 배너 | 상업 요소는 아래에 모아 흐름을 끊지 않는다 |
| 12 | 주의 문구(효험 비보장·산행 안전) | 항상 마지막 |

* 상단 히어로의 '명상' 버튼은 '순례 현황 보기'로 바꿨다 — 명상은 8번 도구 줄에 한 번만.
* 순례 화면 히어로의 중복 버튼도 리포트 입구로 바꾸고, 같은 곳을 가리키던 리포트 배너를 제거했다.
* 큰 글씨·간편 모드(`body.big`)에서 숨는 카드는 그대로 `simple-hide`(`상점·테마·많이 찾는 사찰·스토리·동의`).

### 5.3 공통 행동 줄

제목 옆에 버튼을 몰아넣으면 좁은 화면에서 헤더가 깨진다. **제목 + 주 행동 1개**만 남기고 나머지는 칩 줄로 내린다.

```html
<div class="row between"><h1>사찰 수첩</h1><a class="btn small" href="#/journal/new/">+ 기록</a></div>
<div class="screen-actions">
  <a class="chip" href="#/planner">🗓️ 여행 계획 (2)</a>
  <button class="chip" data-act="cert-open">📜 완주증</button>
  <button class="chip" data-act="sample-populate">✨ 샘플 값 채우기</button>
</div>
```

### 5.4 화면 크기별 규칙

반응형 규격(브레이크포인트 560·760·1120·1440·1760, safe-area, svh, `auto-fill` 열 계산, 모달 시트↔대화상자)은
`docs/responsive-layout.md`가 계속 담당한다. 이번 작업은 그 위에 **화면 안의 정보 순서**를 얹은 것뿐이다.

---

## 6. 서버 전송 (`server/app.js`)

```js
app.disable('x-powered-by');
app.use(compression({ threshold: 1400 }));   // 텍스트 자산·API JSON 전부 gzip (앱 셸 143KB → 45KB)
app.use(cachePolicy());                      // 아래 표
app.use(express.static(staticRoot, { etag: true, lastModified: true, maxAge: 0 }));
```

| 경로 | Cache-Control | 이유 |
| --- | --- | --- |
| `*.js?…&v=…` (버전 쿼리 있음) | `public, max-age=31536000, immutable` | 내용이 바뀌면 URL도 바뀐다 — 재검증 요청 자체가 사라진다 |
| 그 밖의 정적 자산 | `public, max-age=604800` (7일) | 새로 추가한 파일이 오래 남지 않게 |
| `index.html`·정적 SEO 페이지·`sw.js`·`*.webmanifest` | `no-cache` | 배포 즉시 반영. **서비스워커를 길게 캐시하면 업데이트가 멈춘다** |
| `/api/*` | (없음) | 사용자·결제 상태는 캐시 금지 |

버전 태그(`?v=`)는 **네 곳을 함께 올린다** — `index.html` · `tools/build-seo.js`(`ASSET_V`) ·
`js/lib/loader.js`(`VERSION`) · `sw.js`(`CACHE_NAME`).
첫 화면·정적 페이지가 부르는 JS/CSS 에 태그가 빠지면 7일 캐시에 갇혀 배포가 반영되지 않으므로
`delivery.test.js` 6번이 그 규칙을 지킨다(태그 없는 참조가 있으면 실패).

정적 SEO 페이지(`/temple/:id/`)는 `server.js`가 `sendFile`로 내보내므로 XML·TXT는 1일, HTML은 no-cache를 따로 지정한다.
서비스워커는 첫 설치에 **셸만** 캐시하고, 지연 자산은 활성화 뒤 백그라운드에서 채운다(`prefetchLazy()`).

---

## 7. 가드 — 규칙이 다시 무너지지 않게

| 지켜야 하는 것 | 테스트 |
| --- | --- |
| 핵심 화면이 런타임 오류 없이 그려진다 | `app-runtime.test.js` (가상 DOM에서 실제 렌더) |
| 홈은 스토리만, 지도는 leaflet, 계획은 모듈, 전통사찰·풍수·기도는 그 화면에서 | `app-runtime.test.js` — 자산 목록까지 확인 |
| 홈은 스토리를 기다리지 않고 먼저 그린다 | `app-runtime.test.js` (SOFT) |
| 지연 자산 표에 죽은 항목·빠진 화면이 없다 + 지연 자산이 첫 화면에 직접 박히지 않는다 | `app-runtime.test.js` |
| gzip·캐시 정책·서버 헤더 | `delivery.test.js` |
| 화면 크기 규격(브레이크포인트·safe-area·터치 44px…) | `responsive-layout.test.js` |
| 앱 셸에 웹 광고 코드 없음 | `seo-ads.test.js`·`responsive-layout.test.js` |
| 추천 엔진·풍수·기도·템플스테이 연결(셸+모듈 소스) | `planner-reco`·`fengshui-atlas`·`prayer-theme`·`features-v9` — `server/test/_sources.js`로 셸+`js/app/*.js`를 함께 본다 |

---

## 8. 남은 후보 (하지 않은 것 포함)

* **라우트 프리페치** — 유휴 시간에 다음 후보 자산을 미리 받기(`requestIdleCallback`). 지금은 정확히 필요할 때만 받는다.
* **웹폰트 자체 호스팅·이미지 포맷** — 한지 톤 폰트를 시스템 폰트로 두고 있고, 아이콘은 PNG. webp/avif·아이콘 스프라이트는 별도 작업.
* **`js/features.js` 분할** — 위 4절의 이유로 보류. 도슨트·합성음만 지연 로딩하는 방법은 남아 있다.
* **상태 관리 분리** — `S`(localStorage 스키마)와 화면이 아직 같은 스코프에 있다. 저장 키 버전(`v1`)을 올릴 때 함께 정리하는 편이 안전하다.
* **다크 모드** — 한지 톤 재설계가 필요해 `docs/responsive-layout.md`에도 별개 작업으로 적어 두었다.

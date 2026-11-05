# 화면 ID · 전환 · 회복 정책 (Routing & Resilience Spec)

> 2026-11 후속 라운드. 요청받은 세 산출물(① Tailwind 내장형 컴포넌트 계약 ② 화면 ID 기반 라우팅·회복 스펙
> ③ 적응형 데이터 매핑)을 **이 저장소의 정적 SPA 위에서** 실제 동작으로 옮긴 기록이다.
> 원본은 React/Tailwind/TSX 였지만 이 앱에는 React 를 넣지 않는다(정적 SPA 유지 · 첫 화면 예산 140KB).
> 그래서 **색·간격·문구·상태 전이 계약**을 그대로 가져오고, 그리는 방식만 vanilla DOM 으로 바꿨다.
>
> 가드: `server/test/recovery-report.test.js` (13개, 모듈을 vm 에서 실제로 돌린다) ·
> `server/test/design-sagyeong.test.js` · `server/test/mobile-ux.test.js` · `server/test/design-system.test.js`

---

## 0. 공통 정책 — 흰 화면은 실패가 아니다

| 원칙 | 구현 |
|---|---|
| 네트워크 단절·`ChunkLoadError` 로 **흰 화면을 만들지 않는다** | `index.html` 의 `#boot` 인라인 부트 셸(외부 CSS 0) + `window.MJ_BOOT` 이 성공/실패를 판정 |
| 스타일이 늦거나 실패하면 **로컬 복구 번들**이 대신 선다 | 부트: 인라인 CSS · 사경 시트: `applyFallbackTheme()` 인라인 색·격자 |
| 실패는 **침묵하지 않는다** — 어디까지 됐는지 말하고, 다음 행동을 준다 | 모든 예외 카드에 `.lost` 안내문 + **인라인 재시도 버튼** |
| 기록은 기기 안에만 | 상담 기록·리포트는 `localStorage` 만 쓰고 서버로 보내지 않는다 |
| 움직임은 **정보를 보태는 곳에만** | 화면 전환 3종은 `prefers-reduced-motion:reduce` 에서 즉시 완료 |

`#view`(= `main`)에 화면 ID 와 전환 이름을 데이터 속성으로 남긴다. 라우터가 매 렌더마다 다시 쓴다.

```js
const SCREEN_ID     = { home: 'SCR-MAIN-001', report: 'SCR-REP-003', account: 'SCR-AUTH-002' };
const SCREEN_MOTION = { 'SCR-MAIN-001': 'fade', 'SCR-AUTH-002': 'slide', 'SCR-REP-003': 'lift' };
$view.dataset.screen = SCREEN_ID[route] || '';
$view.dataset.motion = SCREEN_MOTION[SCREEN_ID[route]] || 'fade';
```

```css
@keyframes mj-fade{from{opacity:0}to{opacity:1}}
@keyframes mj-slide-left{from{opacity:0;transform:translateX(18px)}to{opacity:1;transform:none}}
@keyframes mj-lift{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:none}}
main.entering[data-motion=fade]{animation:mj-fade 400ms var(--ease) both}
main.entering[data-motion=slide]{animation:mj-slide-left 300ms var(--ease) both}
main.entering[data-motion=lift]>*{animation:mj-lift 250ms var(--ease) both;animation-delay:calc(var(--i,0) * 30ms)}
```

- 전환은 **`entering` 클래스가 붙은 첫 렌더에만** 돈다(같은 화면 재렌더에서 깜빡이지 않게).
- `lift` 는 자식이 30ms 간격으로 차례로 앉는다(최대 6개, 그 뒤는 함께). 카드가 많은 화면에서도 총 1초를 넘기지 않는다.
- 축소 설정: `@media (prefers-reduced-motion:reduce){ main.entering[data-motion]{animation:none} }`

---

## 1. SCR-MAIN-001 — 메인 상담 · 사경첩

| 항목 | 값 |
|---|---|
| 진입 | 앱 시작 / 하단 탭 '홈' |
| 전환 | Fade-in **400ms** (ease) |
| 레이아웃 | 32px 주사 격자(`rgba(183,28,28,0.04)`), 한 장 = 한 질문(第 一 問) |
| 주 행동 | 72px 인장 `印` (시트 하단 고정 + `--safe-b`) |
| 데이터 | 기기 안 `localStorage.maeumjeongwon.v1.counsel` (최근 60장) |

### 예외 1 — 토큰(응답 스트림) 유실

1. 요청이 끊기면 **같은 장에서** 최대 3회 재시도한다. 간격은 `300ms × i` (i = 1..3).
2. 재시도 중에도 장을 새로 만들지 않는다 — 붓글씨는 이어지고, 진행 상태는 `aria-busy` 로 알린다.
3. 3회 모두 실패하면 **유실 지점을 그대로 남긴다**:
   > …(정원의 연결이 흐려져 잠시 후 이어집니다)

   그 아래 **[다시 이어 쓰기]** 인라인 버튼 — 누르면 같은 장(`turn`)에 다시 요청한다.
4. 성공한 답만 기록으로 남는다(유실된 반쪽 답은 저장하지 않는다).

```js
async function askWithRetry(ask) {
  for (let i = 1; i <= RETRY_MAX; i++) {
    try { return await ask(); }
    catch (e) { if (i === RETRY_MAX) throw e; await sleep(300 * i); }
  }
}
```

### 예외 2 — 빈 입력

- 요청을 보내지 않고 **테두리를 주사색으로 2회 점멸**한다(`.is-alert`, `@keyframes sagye-alert`).
- `aria-invalid="true"` 를 붙이고 **포커스는 입력칸에 유지**한다. 토스트는 보조 수단으로만.
- 값을 입력하기 시작하면 표시를 즉시 걷는다.

---

## 2. SCR-AUTH-002 — 회복 탄력성 가입

| 항목 | 값 |
|---|---|
| 진입 | 하단 탭 '내 정원' → 로그인/가입 시트 |
| 전환 | Slide Left **300ms** |
| 폼 | **이메일 + 비밀번호 두 칸**(확인 칸 대신 '보기' 토글, 닉네임은 서버가 이메일 앞부분으로) |

### 예외 1 — CSS / PWA 매니페스트 유실

- 부트 단계: `#boot` 인라인 CSS 셸 — 네트워크 점검 · 스켈레톤 · [새로고침] · [캐시 초기화] · [게스트로 시작].
- 사경 시트 단계: 지연 CSS(`css/sagye.css`)가 실패하거나 **1.5초 안에 링크가 서지 않으면**
  `applyFallbackTheme()` 이 인라인 색과 격자를 넣는다. 표식은 `data-fallback-theme="inline"`.
  | 토큰 | 인라인 값 |
  |---|---|
  | paper | `#FAF7F2` |
  | ink | `#1A1A1A` |
  | jusa | `#B71C1C` |
  | line | `#E5DCD0` |
  | 격자 | 32px, `rgba(183,28,28,0.04)` |
- 매니페스트·아이콘이 없어도 폼과 버튼은 100% 동작해야 한다(설치만 안 될 뿐).

### 예외 2 — 인증 서버 500 / 타임아웃

- 모든 인증 호출은 `withTimeout(promise, 8000)` 을 지난다. 8초를 넘기거나 **5xx** 를 받으면 네트워크 실패와
  같은 길로 보낸다(`authModalState.netDown = true`).
- 시트 하단에 **[인터넷 없이 게스트로 임시 입장]** 이 나타난다(`#authGuest`, `data-act="guest-start"`).
- 게스트 입장은 `html[data-guest]` + `localStorage.maeumjeongwon.guest.v1` 만 세운다 —
  상담·순례·수첩은 그대로 동작하고, 로그인이 필요한 기능만 잠긴다.
- 서버가 살아 있으면 이 버튼은 **나타나지 않는다**(정상 경로를 흐리지 않게).

---

## 3. SCR-REP-003 — 적응형 주간 마음 리포트

| 항목 | 값 |
|---|---|
| 진입 | 내 정원 탭 → 마음 리포트 (`#/report`) |
| 전환 | Staggered Lift **250ms** (30ms 간격) |
| 데이터 | 상담 기록 → `MaeumReportState` (아래 4절) |
| 지연 자산 | `css/sagye.css` + `js/app/report.js` (`ASSETS.sagye`, 첫 화면 미포함) |

### 상태 3단

| 기록 수 | 상태 | 화면 |
|---|---|---|
| 0장 | `empty` | 문을 여는 안내 + 상담으로 가는 버튼 |
| 1~2장 | `seed` | 🌱 **마음 씨앗 카드** — 차트 컴포넌트를 **아예 만들지 않는다** |
| 3장~ | `full` | 마음 온도 꺾은선(불안 실선 · 안정 점선) + 낱말 구름 + PDF |

- 1~2장 문구는 **세어서 약속한다**: "…2번 더 이야기하면 주간 감정선이 피어납니다" (남은 장 수를 계산해 넣는다).
- 씨앗 단계: 1 씨앗 → 2 새싹(3장) → 3 줄기(6장) → 4 꽃(12장).
- **차트를 조건부로 배제**하는 것이 핵심이다. 점 1~2개짜리 꺾은선은 '추세'처럼 보이지만 추세가 아니다.

### 예외 — 캐시(기록) 오염

1. 읽기는 항상 `try/catch` 로 감싼다. `JSON.parse` 실패·`at` 이 날짜가 아닌 항목은 **걷어 내고** 그린다.
2. 걷어 낸 뒤 남은 기록이 3장 미만이면 상태가 내려간다(깨진 기록으로 대시보드를 만들지 않는다).
3. 한 장도 못 믿겠거나 스토리지 자체가 깨졌으면(`storageBroken`) **복구 카드**:
   > 기록을 읽지 못했어요 → [기록 새로고침] (`data-act="counsel-reset"`)
4. [기록 새로고침] 은 **상담 기록만** 안전 초기화한다. 순례·수첩·설정은 건드리지 않는다.
5. 파싱 실패 시 조용히 빈 배열로 대체하지 않는다 — 그러면 '기록이 없다'와 '기록이 깨졌다'를 구별할 수 없다.

---

## 4. 적응형 데이터 매핑

`MaeumReportState` (전체 타입은 `types/maeum-report.d.ts`). 목업 두 케이스는 `docs/mind-report-cases.json`.

```ts
interface MaeumReportState {
  hasEnoughData: boolean;          // N >= 3
  totalConsultationCount: number;
  lastUpdated: string;             // ISO
  mindGrowthSeed: { seedStage: 1|2|3|4; label: string };
  analyticsData?: {                // hasEnoughData === false 이면 없다
    weeklyTrend: WeeklyEmotionPoint[];
    topKeywords: MindKeywordTag[];
  };
}
```

### 계산 규칙

| 값 | 규칙 |
|---|---|
| 마음 온도 | 기분 라벨 → 1~5 (`지쳤어요 2` · `쓸쓸해요 2.4` · `복잡해요 2.6` · `바라는 게 3.2` · `설레요 3.8` · `감사해요 4.4`), 낱말 보정 ±0.3 |
| `anxietyScore` | `((5 - score) / 4) × 100` + 낱말 보정(불안 +8 · 화·억울 +6 · 지침 +4 · 감사/쉼 −6), 0~100 클램프 |
| `stabilityScore` | `100 - anxietyScore` (둘의 합은 항상 100) |
| `weeklyTrend` | 최근 7일을 **요일별로 묶어 평균**. 점이 있는 날만 남긴다(빈 요일을 0 으로 채우지 않는다) |
| `primaryEmotion` | 그날 가장 많이 나온 낱말. 동률이면 나중에 나온 것 |
| `topKeywords.intensity` | 빈도 ≥ 4 **High** · ≥ 3 Medium · 그 외 Low |
| 씨앗 단계 | 12장↑ 4 · 6장↑ 3 · 3장↑ 2 · 그 외 1 |

- 좌표는 화면 없이 검산할 수 있게 순수 함수(`trendPoints(values, w, h, pad)`)로 둔다 — `100` 이 위, `0` 이 아래.
- 데모: `#/report?demo=A`(씨앗 카드) · `#/report?demo=B`(차트·낱말·PDF). 데모는 저장소를 쓰지 않는다.

---

## 5. Tailwind 내장형 컴포넌트 → 이 앱의 계약

원본 `MaeumSanctuary` 는 Tailwind 클래스와 `fallbackStyles` 인라인 백업을 함께 갖는 React 컴포넌트였다.
React 를 넣지 않기로 했으므로 **참고 원본을 `components/MaeumSanctuary.tsx` 에 그대로 남기고**(빌드 대상 아님),
앱에는 계약만 옮겼다.

| 원본 | 이 앱 |
|---|---|
| `fallbackStyles` (배경·주사·글·24px 격자) | `#boot` 인라인 셸 + `applyFallbackTheme()` |
| 상단 헤더 `⌂ 마음정원 / 내 정원` | 상단 바(`.topbar`) + 브레드크럼 |
| auto-grow textarea | `.sagye-inputwrap textarea` (입력마다 `height:auto → scrollHeight`) |
| Clear(✕) | `enhanceFields()` 가 모든 텍스트필드에 붙인다 |
| 36~44px 인장 CTA | **72px** `.seal-send` (엄지 존 기준을 44px 이상으로 올려 잡았다) |

- 격자는 24px 가 아니라 **32px** — 이 앱의 본문 16px · 줄높이 1.6 과 맞춰야 글자가 격자에 걸리지 않는다.
- 색은 원본 그대로: `#FAF7F2` / `#1A1A1A` / `#B71C1C` / `rgba(183,28,28,0.04)`.

---

## 6. 검증

```bash
npm test                                   # 191개 (이 라운드 +13)
node --test server/test/recovery-report.test.js
npm run budget                             # 첫 화면 gzip 139.8KB / 140KB
npm run verify
```

`recovery-report.test.js` 는 소스 문자열만 보지 않는다. `vm` 안에 가짜 `window`·`localStorage` 를 세우고
`js/app/report.js` 를 **실제로 실행**해서, 1장/6장/깨진 기록/데모 A·B 각각의 HTML 과 상태 객체를 검사한다.

# 2026~2027 모바일 디자인 — 모션 · 질감 · 가변 컴포넌트 적용

> 붙여준 다섯 갈래(스크롤 주도형 · 가변 컴포넌트 · 마이크로 인터랙션 · 엄지 존 · 안티 퍼펙트 질감)를
> **화면에 걸린 것만** 남기고 옮긴 기록. 이미 되어 있던 것은 손대지 않았고, 새로 넣은 것은
> **지연 자산**(`css/sagye.css` · `js/app/report.js` · `js/features.js`)에 우선 두었다 —
> 첫 화면 예산 140KB 를 넘기지 않기 위해서다.
>
> 가드: `server/test/design-2026-motion.test.js` (9) · 기존 `design-system` · `mobile-ux` ·
> `design-sagyeong` · `recovery-report` 가 그대로 함께 돈다.

---

## 0. 한눈에 — 무엇이 새로 걸렸나

| 갈래 | 요청 | 이번에 한 일 | 어디 |
|---|---|---|---|
| ① 스크롤 주도형 | 헤더 축소 + 리퀴드 글래스 | `body.scrolled` 일 때 상단 바가 **4px 로 줄고** 부제가 접히며, 배경이 74% 투명 + `blur(20px)` 유리 한 줄로 바뀐다 | `css/style.css` (§⑮-2) |
| ① | 차트 선 그리기 | 리포트 꺾은선이 **화면에 들어올 때** 붓이 지나가듯 그려진다 (`animation-timeline: view()`) | `css/sagye.css` (⑲) |
| ② 가변 컴포넌트 | 프로그레시브 → 벤토 | 3장 = 두 칸, **6장(줄기)부터 숫자 타일 3개**가 붙고 560px 이상은 2열 + 넓은 카드 | `js/app/report.js` · `css/sagye.css` |
| ② | 영리한 스켈레톤 | 답을 기다리는 자리에 **구절·실천·사찰** 세 줄이 파형으로 흐른다 | `js/features.js` · `css/sagye.css` |
| ③ 마이크로 | 인장/팝 버튼 | 인장을 누르면 `scale(.9)` → **`.88 → 1.05 → 1`** 로 튀고, 지원 기기에서는 8ms 진동 | `css/sagye.css` · `js/features.js` |
| ③ | 텍스트 스트리밍 | **이미 있음** — 한 글자씩 앉는 붓글씨(축소 설정이면 즉시 완성). 이번엔 손대지 않았다 | `js/features.js` |
| ④ 엄지 존 | 하단 시트 | **이미 있음** — 그랩 핸들 · `90svh` · `--safe-b`. 확인만 했다 | `css/style.css` |
| ④ | Clear(✕) | **이미 있음** — 모든 텍스트필드, 44px(최소 24dp 이상). 사경 칩 줄에는 **마스크**를 더했다 | `js/app.js` · `css/sagye.css` |
| ⑤ 질감 | 미색 + 연한 격자 | `#FFFFFF` 대신 한지 바탕 + **32px 눈금**(낮 3.2% · 저조도 4%). 글자 위에는 겹치지 않는다 | `css/style.css` (`#app`) |
| ⑤ | 타이포 분리 | 시스템 라벨은 고딕(`--font-ui`), 콘텐츠의 목소리(제목·브랜드·경전 구절)는 명조(`--font-display`) | `css/style.css` · `css/sagye.css` |

---

## 1. 스크롤 주도형 — "스크롤이 오브젝트를 만진다"

### 1-1 헤더 축소 + 리퀴드 글래스 (첫 화면)

```css
body.scrolled .topbar{
  padding-top:calc(4px + var(--safe-t));padding-bottom:4px;
  background:color-mix(in srgb,var(--surface-1) 74%,transparent);
  backdrop-filter:saturate(1.6) blur(20px);
}
body.scrolled .brand-copy small{opacity:0;transform:translateY(-4px)}
```

- 스크롤 감시는 **이미 있던 것**을 그대로 쓴다(`app.js` 의 `scrolled` 토글, 디바운스). 스크롤 이벤트마다
  DOM 을 만지지 않는다.
- `color-mix` 를 모르는 브라우저에는 `rgba(--paper-rgb,.86)` 폴백을 함께 둔다.
- 축소 설정(`prefers-reduced-motion`)에서는 **전환만** 끄고 축소 자체는 유지한다 — 움직임이 문제이지
  상태 변화가 문제는 아니다.
- 부제(`small`)가 접히므로 한글이 흔들리지 않게 `transform`·`opacity` 만 쓴다(폭이 변하는 속성 금지).

### 1-2 차트는 화면에 들어올 때 그린다 (지연 자산)

```css
@supports (animation-timeline:view()){
  .counsel-trend .line:not(.stable){
    stroke-dasharray:1200;stroke-dashoffset:1200;
    animation:trend-draw linear both;animation-timeline:view();animation-range:entry 8% cover 42%
  }
  @keyframes trend-draw{to{stroke-dashoffset:0}}
}
```

- **JS 0바이트.** 스크롤 이벤트 대신 CSS 뷰 타임라인을 쓴다(브라우저가 합성 스레드에서 처리).
- 안정 점선(`.stable`)은 이미 `stroke-dasharray:4 6` 이라 그리지 않는다 — 덮으면 점선이 사라진다.
- 지원하지 않는 브라우저는 `@supports` 밖이라 **완성된 차트**가 그대로 보인다(정보 손실 없음).
- 같은 타임라인으로 벤토 카드가 아래에서 앉는다(`bento-rise`, `entry 0% → entry 55%`).

---

## 2. 가변 컴포넌트 — 데이터가 늘면 카드가 커진다

```
N = 0        → 빈 카드 (문을 여는 안내)
N = 1~2      → 🌱 씨앗 카드           ← 벤토를 만들지 않는다
N = 3~5      → 벤토 1열 (두 칸)       data-stage="basic"
N = 6~       → 벤토 + 숫자 타일 3개    data-stage="grown"
≥ 560px      → 2열, 감정선 카드는 두 칸(data-span="wide")
```

- 숫자 타일은 **쌓인 장 · 평균 불안 · 고요했던 날**(안정 60 이상). 6장 전에는 숫자를 늘어놓지 않는다 —
  표본이 적을 때의 평균은 정보가 아니라 소음이다.
- 계산은 `js/app/report.js` 안에서 끝난다(`statTiles`). 서버·네트워크를 부르지 않는다.
- 스켈레톤은 '답이 앉을 자리'를 흉내 낸다: `구절 / 실천 / 사찰` 세 줄, 줄마다 폭·지연이 다르다
  (`aria-hidden` — 읽어 주지 않는다). 답이 도착하면 `ans.innerHTML` 교체로 함께 사라진다.

---

## 3. 마이크로 인터랙션 — 손끝에 즉답

| 요소 | 값 |
|---|---|
| 인장 누름 | `.seal-send:active{transform:scale(.9)}` |
| 인장 반동 | `seal-stamp 280ms cubic-bezier(.34,1.56,.64,1)` — `.88 → 1.05 → 1` (한 번만, `animationend` 에서 클래스 제거) |
| 촉각 | `navigator.vibrate(8)` — 지원 기기에서만, 실패는 조용히 삼킨다 |
| 보통 버튼 | `.btn:active{transform:translateY(1px) scale(.97)}` (기존 `scale(.995)` 는 손끝에 안 보였다) |
| 타이핑 | 기존 붓글씨 스트리밍 유지 (축소 설정이면 즉시 완성) |

축소 설정에서는 진동과 반동을 모두 끈다(진동은 설정과 무관하게 유지 — 정보가 아니라 확인이다).

---

## 4. 엄지 존 — 이미 있던 것을 확인하고 한 곳만 보강

- 하단 시트: `border-radius:24px 24px 0 0` · 그랩 핸들 · `max-height:min(90svh,900px)` ·
  `padding-bottom:calc(20px + var(--safe-b))` — 홈 인디케이터를 피한다.
- 1차 행동 48dp(`--tap`) · 상단 칩 44dp + 히트 슬롭 · 텍스트필드 Clear(✕) 44dp.
- **보강**: 가로로 흐르는 칩 줄(`.sagye-quick`)에 마스크를 넣어 "더 있다"를 글자 손상 없이 알린다.

---

## 5. 안티 퍼펙트 질감 — 종이 위에 인쇄된 느낌

```css
#app{background-image:
  repeating-linear-gradient(0deg,var(--grid-line) 0 1px,transparent 1px var(--grid-step)),
  repeating-linear-gradient(90deg,var(--grid-line) 0 1px,transparent 1px var(--grid-step))}
```

- 눈금은 **배경에만**. 글자 위에 겹치는 의사요소를 두지 않는다(판독성 우선).
- 낮 `rgba(26,20,18,.032)` · 저조도 `rgba(242,237,231,.04)` — 스크롤해도 눈이 아프지 않은 선.
- 타이포 분리: 본문·라벨·버튼·태그·시스템 소제목(`h3`)은 **고딕**, `h1`/`h2`·워드마크·인장·경전 구절은
  **명조**. 두 목소리를 섞되 한 화면에서 세 번째 글꼴은 쓰지 않는다.

---

## 6. 예산 — 새 모션은 첫 화면을 무겁게 하지 않는다

| 자산 | 첫 화면? | 이번 증가 |
|---|---|---|
| `css/style.css` | 예 | 헤더 축소 · 눌림 · 32px 눈금 ≈ +0.4KB gzip |
| `css/sagye.css` | 아니오 (지연) | 벤토 · 뷰 타임라인 · 인장 반동 · 파형 스켈레톤 · 마스크 (전부 여기) |
| `js/app/report.js` | 아니오 (지연) | 벤토 래퍼 · 통계 타일 |
| `js/features.js` | 아니오 (지연) | 진동 · 스켈레톤 · `animationend` 정리 |

- 첫 화면 증가분은 **사문(주석)을 문서로 옮겨** 상계했다 — `⑮`·`⑯` 배너와 `app.js` 의 설계 산문을
  압축하고 `docs/design-refresh.md`·`docs/mobile-ux-guidelines.md` 로 포인터만 남겼다.
- 결과: **138.7KB / 140KB** (`npm run budget -- --check` 가 verify 에서 지킨다).

---

## 7. 검증

```bash
node --test server/test/design-2026-motion.test.js   # 9
npm test                                             # 200
npm run budget -- --check                            # 138.7 / 140
npm run verify
```

- 실DOM(jsdom): 스크롤 → `body.scrolled` 부착/해제 · `#/report?demo=B` 에서 `data-stage="grown"` +
  타일 3개 · 사경 대기 중 `.sagye-skel` 3줄이 도착 뒤 사라지는지.
- `prefers-reduced-motion` 에서 새 애니메이션 6종이 모두 꺼지는지(가드가 문자열로 확인).

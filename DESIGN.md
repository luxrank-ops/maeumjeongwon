# DESIGN.md — 마음정원 디자인 시스템 (v4 · 사경첩 寫經帖)

> 이 문서는 리모델의 **무결 계약**입니다. 새 화면·컴포넌트를 만들 때 여기 없는 색·각 ·움직임을 추가하지 마세요. 토큰 변경은 `css/style.css` ⑮-1 팔레트 블록 두 곳(낮/저조도)에서만, 그리고 `server/test/design-system.test.js` 가드와 함께 수정합니다.

- **방향**: 사경첩(寫經帖) — 반격지(사경 종이의 눈금 칸) 위에 하루·방문·염주가 한 칸씩 채워지는 기록 의례.
- **씨앗**: seed:7104e7900ef8450f (engine 오프라인 시 구조적 롤, 배정 6번).
- **계약 본문**: `.impeccable/surfaces/index-html.md` · 머신 페이로드 `.impeccable/questions/direction-payload.json` · 상태 `.impeccable/design.json`.
- **이전 세계와의 관계**: v3(연둣빛 사찰 한지)의 모든 색·그래디언트·둥근 카드 세계를 전면 교체. v3 기록은 `docs/design-refresh.md` 참조.

---

## 1. 세계관 (한 줄)

홀로 찾아가 40–60대 사용자가 절에 가는 날처럼 차분하게, **먹선(그리드)** 위에 **주사(인주) 도장**이 한 방씩 찍히는 사경 노트. 장식은 없고, 기록만 있다.

- 한 가지 포화 색: **주사(朱砂) #b03a25** — 도장·주요 행동·현재 칸에만.
- **금니(金泥) #8a6a22** 는 완성(모두 채움)일 때만 나타난다.
- 모서리는 사각형적(반지름 ≤ 14), 완전한 원은 콘텐츠 아바타뿐.
- 그림자는 "번짐"으로만 존재(엣지 글로우·제로 오프셋 발광 금지).
- 화면 질감은 **26px 반격 먹선 그리드**(`.sg-paper`, 두 축 1px, ju rgba .055) 하나뿐이다.

## 2. 팔레트 토큰 (⑮-1)

이름 체계(v3.1 유지): 팔레트 `--paper/--card/--ink/--sub/--line/--ju/--clay/--gold` → 시맨틱 `--surface-*` `--text-*` `--border-*` → 컴포넌트는 시맨틱만 부른다(가드 테스트 2번).

| 역할 | 토큰 | 낮 | 저조도 |
|---|---|---|---|
| 바탕(사경지) | `--paper` | `#f3f1ea` | `#161310` |
| 카드 | `--card` | `#faf8f2` | `#211d18` |
| 먹(본문) | `--ink` | `#221e19` | `#ece7dc` |
| 옆글자 | `--sub` | `#6a6153` | `#a89e8c` |
| 선 | `--line` / `--line-2` | `#d9d3c3` / `#c7bfae` | `#3a352c` / `#4a443a` |
| **주사(유일 포화)** | `--ju` | `#b03a25` | `#d98263` |
| 주사 위 글자 | `--on-ju` | `#faf8f2` | `#1c0f0a` |
| 인주 도장(눌림·깊은 주사) | `--clay` | `#8f3524` | `#cf7659` |
| 금니(완성 전용) | `--gold` | `#8a6a22` | `#b07f2e` |
| 위험 | `--danger` | `#a02434` | `#df8f9b` |
| 그림자 | `--shade` | `43,32,22` (rgb 부품) | — |
| 포커스 고리 | `--ring` | `rgba(176,58,37,.35)` | `rgba(217,130,99,.42)` |

저조도는 같은 토큰 목록을 전부 채운다(가드 테스트 3번 — 하나라도 빠지면 CI 실패).

## 3. 타이포·반지름·간격

- 서체: 본문 `var(--font-ui)`(Apple SD Gothic Neo → Pretendard → system-ui), 제목·숫자 강조 `var(--font-display)`(세리프: NanumMyeongjo→'Noto Serif KR'→'Noto Serif CJK KR'). 본문 돋움/제목 명조 대비를 깨지 않는다.
- 반지름: `--r:8px`(기본) · `--r-sm:6px` · `--r-lg:14px`(시트·대형 카드). 버튼·입력 8, 도장(`.seal`) 5, 스탬프 빅 9, 도감 칸 6.
- 간격: `--s1..--s6` (4/8/12/16/24/32). 카드 패딩 18–20.
- 터치 타깃 ≥44px 유지(제약), `body.big` 큰 글자 모드 모든 폭에서 유지.

## 4. 유일한 움직임 — stamp-in

```css
@keyframes stamp-in { from { transform: scale(1.8) rotate(-6deg); opacity: 0 } to { transform: none; opacity: 1 } }
```

- 도감 칸(`.sg-cell.full`)이 도장 찍히며 채워지는 0.5s `var(--ease)` 한 종류.
- `nth-child` 스태거 지연. `prefers-reduced-motion` 에서 완전히 끈다(가드 준수).
- 다른 진입 전이·패럴랙스·스프링 추가 금지. 호버는 색·얇은 선 변화만.

## 5. 시그니처 컴포넌트

1. **`.sg-grid` (server/test: '도감 표 100칸')** — 나의 발자취(내 순례) 카드의 100칸 반격도. 10열 3px 갭, 채운 칸(`.full`)은 주사+inset 먹선, 다음 칸(`.next`)은 파선, 완주 시 `.complete` 로 금니. 진행 바 디자인을 대체한다(`js/app.js` pilgrimCard).
2. **`.brand-mark`** — 32px 주사 전각(도장석), 모서리 6px, 안에 흰 心 세리프. 파비콘도 같은 도형(vermilion 정사각+心).
3. **`.sg-paper` 방안 지문** — 홈 히어로 카드에만 까는 26px 반격선. 그래디언트·블롭 금지의 예외이자 유일 질감.
4. **`.main-title-hero::after`** — 홈 대제목 옆 26px 윤곽 전각(기울어진 주사 정사각 outline, 투명도 .16). 로터스 장식 대신.
5. **도장들** — `.seal`(5px 정사각 印), `.stampbig`(9px 정사각 대형 스탬프; 구형 원형 금지).

## 6. 금지 목록 (이 세계에서 삭제된 것)

- 연두·세이지 계열 (`#7a8f5c`, `#33604a`, `--pine/*`) — 완전 삭제.
- 그래디언트 카드·라이트 블롭(히어로 `.blob`) — 삭제. (템플스테이 히어로의 135° tint 그래디언트도 제거됨)
- 4px 굵은 컬러 사이드 탭(`border-left:4px`) — 전면 삭제, 1px 선 또는 ju-line 얇은 테두리로 대체.
- 키커(kicker) 대문자 라벨(`.section-kicker`, `.main-title-kicker`) + 🪷 탭바 리딩 — 전면 삭제. 필요시 `tag`/`tag v` 로 대체.
- 오프셋 그림자 글로우·제로 오프셋 발광·네온 — 금지(팬텀 glow 감지 항목).
- 이모지 브랜딩(파비콘 🪷 등) — 삭제(도장 心으로 대체). 콘텐츠성 이모지(기분 선택 등)는 허용.

## 7. 검증 상태 (2026-10-26 시점)

- `npm run verify` ✅ (테스트 149/149 · 콘텐츠·사찰 스모크 · gzip 예산 133.4KB/140KB · SEO 빌드 65사찰/9스토리).
- `impeccable detect --json css/style.css index.html`:
  - 수정 완료: side-tab 5건(`.timeline` `.legal` `.journey-timeline` 먹선 1px화, `.templestay-hero` 슬래브 제거+ju-soft 평면화, prefers-contrast 4px 비대칭 제거).
  - 합의(서명): `codex-grid-background style.css:648` = 사경 반격 지문 — 이 세계의 유일 질감으로 의도됨.
  - 오탐 3건(index.html:0 dark-glow/stripes/grid): 파비콘 data-URI 의 `#b03a25` 색 휴리스틱. 파일 내 실제 box-shadow/gradient 0건(grep 증명).
- 스크린샷 피드백 루프: 샌드박스에 브라우저 없음 → 수행 불가(열화 공표). 라이브 프리뷰로 사용자 확인.

## 8. 후속 과제 (소유자 작업)

- **앱 아이콘 PNG 재생성**: `tools/generate-icons.js` 색 상수는 교정 완료(주사/금니/지색), 그러나 본체 드로잉은 아직 연꽃 → 전각 心으로 재설계 필요. 실행에 node-canvas(네이티브) 필요 = 데스크톱에서 `npm i canvas && node tools/generate-icons.js`. 현재 배포된 `assets/` PNG는 구 세계(연꽃) 그대로.
- 애드센스/GA 승인 시 인라인 브랜드 색 규칙은 `.nav-btn.*` 외 추가 허용 목록에 넣지 않는다.

## 9. 바꾸는 법 (절차)

1. `css/style.css` ⑮-1 낮/저조도 팔레트만 수정.
2. `npm run test -- design-system` → 팔레트 이름 직접 호출·저조도 누락 검사.
3. `impeccable detect css/style.css index.html` → warning 이 새로 생기면 설계 위반.
4. `npm run verify` 까지 통과 후 커밋.

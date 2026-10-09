# 웹 분석 설계 및 AARRR 측정 계획 (`docs/analytics-plan.md`)

## 1. 원칙: 동의 전 수집 금지 및 민감 정보 배제

- **동의 후 로드 (`js/analytics.js`)**: 앱 셸(`index.html`)과 정적 SEO 페이지(`/temple/:id/`, `/story/:id/`) 모두 **사용자가 '허용'을 누르기 전에는 `googletagmanager.com` 외부 스크립트를 절대 로드하지 않습니다.**
- **측정 ID 미설정 시 비활성**:
  - 앱 셸: `js/config.js`의 `gaId`가 비어 있으면 비활성
  - 정적 SEO 페이지: 빌드 환경 변수 `GA_MEASUREMENT_ID`가 없으면 `<meta name="mj-ga-id">`, `data-mj-page`, `<script src="/js/analytics.js">`, 푸터의 「분석 설정」 링크가 전혀 생성되지 않음
- **웹 전용**: Capacitor 네이티브 앱 환경에서는 웹 GA4를 로드하지 않습니다.
- **민감 데이터 원천 차단**: 허용 키는 `page`, `item`, `feature`, `method` 4개뿐이며, 값도 `^[a-z0-9_-]{1,40}$` 형식만 통과합니다. 기도 내용, 사찰 수첩 메모 본문, GPS 위경도 좌표는 절대 전송되지 않습니다.

## 2. 앱 셸과 정적 SEO 페이지의 동의 공유

- 저장소 키: `localStorage['maeumjeongwon.analytics']` (`'true'` / `'false'`)
- 정적 사찰·스토리 페이지에 처음 들어오면 하단에 동의 배너(`#mj-consent-banner`)가 표시됩니다.
  - **허용**: 즉시 GA4를 로드하고 현재 정적 페이지의 `page_view` 및 `temple_open` / `story_open` (`{ page, item }`)을 전송합니다.
  - **허용 안 함**: 배너를 닫고 아무것도 로드하지 않습니다.
  - 푸터의 **「분석 설정」** 링크(`data-mj-consent-open`)를 눌러 언제든 선택을 바꿀 수 있습니다.

## 3. AARRR 퍼널 이벤트 매핑

| 단계 | 이벤트 이름 | 파라미터 (`page`, `item`, `feature`, `method`) | 설명 | 비고 |
|---|---|---|---|---|
| **Acquisition (획득)** | `page_view` | `{ page }` (정적 페이지는 `{ page, item }`) | 앱 화면 및 검색 유입 정적 페이지 진입 확인 | 구현 완료 |
| **Activation (활성화)** | `temple_open`, `story_open` | `{ page: 'temple', item: tid }`, `{ page: 'story', item: sid }` | 사찰 상세 및 심화 스토리 열람 | 구현 완료 |
| **Retention / 아하 모먼트** | `checkin` | `{ method: 'gps' \| 'demo' }` | 사찰 방문 인증 (`method=gps`를 아하 모먼트 후보로 추적) | **「가정」** |
| **Revenue (수익)** | `paywall_view` | `{ feature: 'story' \| 'fengshui' \| 'plus_page' ... }` | 페이월 및 플러스 안내 열람 | 구현 완료 |

## 4. 빌드 방법 (정적 SEO 페이지)

```bash
SITE_URL=https://실제도메인 \
GA_MEASUREMENT_ID=G-XXXXXXXXXX \
npm run build:seo
```

## 5. 아하 모먼트 가설 및 미확인 항목

- **아하 모먼트 가설 (「가정」)**: 첫 방문 후 7일 이내에 GPS 방문 인증(`checkin`, `method=gps`) 또는 심화 스토리 열람(`story_open`)을 경험한 사용자의 잔존율이 높을 것이다.
- **Microsoft Clarity 세션 녹화 (「확인 필요」)**: 수첩 입력란과 위치 인증 화면 보호를 위해 아직 넣지 않았습니다.

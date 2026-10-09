# Google AdSense 운영 설계 (`docs/adsense-plan.md`)

## 1. 원칙: 어디에 붙이고 어디에 붙이지 않는가

| 구역 | 광고 허용 여부 | 이유 |
|---|---|---|
| 정적 SEO 사찰 안내 페이지 (`/temple/:id/`) | **허용 (하단 1칸)** | 공개된 사찰 기본 정보·전설을 읽은 뒤 본문 끝(Footer 위)에만 1개 배치 |
| 정적 SEO 심화 스토리 미리보기 (`/story/:id/`) | **금지** | 원작 유료 스토리 몰입 유지 및 페이월 전환 보호 |
| 앱 셸 (`index.html`, `#/home`, `#/temple/*`, 기도·독송 화면) | **웹 애드센스 금지** | 앱 내부는 웹 배너를 넣지 않으며, 사용자가 직접 누르는 보상형 광고(AdMob SDK + SSV)만 사용 |

## 2. 설정 및 빌드 방법

환경 변수가 설정되지 않으면 `ads.txt`도, 광고 스크립트도 생성되지 않습니다.

```bash
SITE_URL=https://실제도메인 \
ADSENSE_PUB_ID=pub-XXXXXXXXXXXXXXXX \
ADSENSE_TEMPLE_SLOT=XXXXXXXXXX \
npm run build:seo
```

- `ADSENSE_PUB_ID`: `pub-` 뒤에 숫자 16자리 (예: `pub-1234567890123456`). 형식이 틀리면 빌드가 중단됩니다.
- `ADSENSE_TEMPLE_SLOT`: 숫자 6자리 이상 광고 단위 ID. 생략하면 `ads.txt`만 생성되고 광고 칸과 로더 스크립트는 삽입되지 않습니다.

## 3. `ads.txt` 확인 방법

빌드 후 `seo-out/ads.txt`에 다음 형식으로 생성되며, `server.js`가 도메인 루트(`/ads.txt`)에서 서빙합니다.

```text
google.com, pub-XXXXXXXXXXXXXXXX, DIRECT, f08c47fec0942fa0
```

배포 후 `curl -i https://실제도메인/ads.txt`로 200 응답과 본문을 확인합니다.

## 4. 개인정보 처리방침 고지 항목

애드센스를 활성화할 때는 개인정보 처리방침에 다음 내용을 포함해야 합니다.
- 제3자(Google)가 쿠키를 사용하여 사용자의 이전 방문 기록을 바탕으로 광고를 게재할 수 있음
- Google 광고 설정(`https://adssettings.google.com`)에서 맞춤형 광고를 해제할 수 있음

# 마음정원 및 신규 프로젝트 자동화 관리 방안

본 문서는 AI Studio 개발 환경과 GitHub 간의 지속 가능한 연동, 빌드·테스트 자동화, 데이터 검증 및 배포 파이프라인 운영 방안을 정리한 가이드입니다.

---

## 1. 당면 과제 및 근본 원인 분석

1. **GitHub 토큰(PAT) 즉시 만료 현상**
   - **원인**: GitHub의 자동 Secret Scanning 시스템은 채팅이나 커밋 메시지, 공개 저장소에 노출된 `ghp_...` 형태의 Personal Access Token을 감지하면 즉시 강제 폐기(Revoke)합니다.
   - **해결**: 토큰은 채팅창에 평문으로 올리지 않고, 워크스페이스 내 로컬 설정 파일(`.env.local`)에만 안전하게 기록하여 사용해야 합니다.

2. **클라우드 개발 환경의 비영속성(Ephemeral Container)**
   - **원인**: 컨테이너가 재시작되면 `.git` 디렉터리나 전역 git-credentials가 초기화될 수 있습니다.
   - **해결**: `tools/git-push.js` 스크립트가 `.git` 부재 시 원격 저장소(`main`)와 자동 동기화(init -> fetch -> rebase)하는 자가 복구 로직을 수행하도록 설계되어 있습니다.

---

## 2. 4단계 자동화 관리 아키텍처

```
[ AI Studio 환경 ]                   [ GitHub 저장소 ]                   [ 배포 / 알림 ]
  코드 수정 / 데이터 보완               (luxrank-ops/maeumjeongwon)
          │                                      │
  npm run push ────────────(일회성 인증 헤더)───> Push (main)
          │                                      │
          ▼                                      ▼
.env.local 기반 PAT 로드                   GitHub Actions (CI/CD)
(.git 자동 복구 & 자가 치유)                ├─ 52개 자동화 테스트 (npm test)
                                           ├─ SEO 정적 페이지 빌드 (npm run build)
                                           └─ GitHub Pages / 배포 환경 반영
```

### [단계 1] Git 연동 & 인증 자동화
- **토큰 발급 권장**: Fine-grained Personal Access Token (만료 90~365일, 대상 저장소 한정, `Contents: Read/Write` 권한).
- **자가 치유 스크립트 활용**:
  ```bash
  npm run push
  # 또는 특정 커밋 메시지 지정
  node tools/git-push.js "원하는 커밋 메시지"
  ```
- 원격 URL에 토큰을 영구 저장하지 않고 일회성 인증 헤더로만 전송하여 유출 위험을 0으로 유지합니다.

### [단계 2] CI/CD 파이프라인 (GitHub Actions)
- 저장소에 `.github/workflows/ci.yml`을 구성하여 푸시 또는 PR 발생 시 자동 실행:
  - 의존성 설치 (`npm ci`)
  - 전체 단위/통합 테스트 52개 통과 검증 (`npm test`)
  - SEO 정적 사이트 빌드 검증 (`npm run build`)
- 테스트 실패 시 main 브랜치 보호(Branch Protection)와 연계 가능.

### [단계 3] 사찰 데이터 및 콘텐츠 자동 검증
- 신규 사찰, 좌표, 테마, 실용 정보(주차/입장료/시간/소요시간) 추가 시:
  - `npm test`: 스키마 및 필수 필드 결측치 자동 검출
  - `tools/temple-smoke.js`: 전체 61개 큐레이션 및 991개 전통사찰 정합성 검증

### [단계 4] 다중 프로젝트 관리 확장 (`camping-food-helper` 등)
- 각 프로젝트마다 독립된 GitHub Secret 등록 및 동일한 CI/CD 템플릿 재사용
- 공통 유틸리티(푸시 스크립트, SEO 빌더 등)의 모듈화

/* 마음 리포트 — 적응형 데이터 매핑 (타입 참고용)
 *
 * 이 앱은 TypeScript 로 빌드하지 않는다(정적 SPA · 첫 화면 예산). 이 파일은 **계약 문서**다.
 * 실제 구현은 `js/app/report.js` 이고, 목업 표본은 `docs/mind-report-cases.json`,
 * 화면·회복 정책은 `docs/routing-resilience-spec.md`.
 *
 * 가드: `server/test/recovery-report.test.js` 가 목업 JSON 과 구현 결과의 키·값을 대조한다.
 */

/** 사경(상담) 한 장 — 기기 안에만 저장된다. */
export interface CounselRecord {
  /** ISO 시각. 이 값이 날짜로 읽히지 않으면 그 장은 깨진 기록으로 본다. */
  at: string;
  /** 사용자가 쓴 물음 (최대 300자) */
  prompt: string;
  /** 고른 기분 라벨 — 마음 온도(1~5)의 재료 */
  mood: string;
  /** 붙은 낱말 (불안·지침·관계·건강·일·진로·시험·승진·돈·외로움·이별·상실·화·억울·감사·기도·발원·쉼) */
  kw: string[];
  /** 마음 온도 1~5 (소수 한 자리) */
  score: number;
  templeId?: string;
  verse?: string;
}

/** 주간 감정선의 한 점 — 요일 하나. 점이 없는 날은 만들지 않는다. */
export interface WeeklyEmotionPoint {
  /** `YYYY-MM-DD` */
  date: string;
  /** '월' | '화' | … */
  dayOfWeek: string;
  /** 0~100. 높을수록 불안이 크다. */
  anxietyScore: number;
  /** 0~100. 항상 `100 - anxietyScore`. */
  stabilityScore: number;
  /** 그날 가장 많이 나온 낱말 */
  primaryEmotion: string;
}

/** 되풀이되는 낱말 — 채도는 빈도가 아니라 농도다. */
export interface MindKeywordTag {
  keyword: string;
  /** 최근 기록에서 나온 횟수 */
  frequency: number;
  /** ≥4 High · ≥3 Medium · 그 외 Low */
  intensity: 'High' | 'Medium' | 'Low';
}

/** 씨앗에서 꽃까지 — 1 씨앗 · 2 새싹(3장) · 3 줄기(6장) · 4 꽃(12장) */
export interface MindGrowthSeed {
  seedStage: 1 | 2 | 3 | 4;
  label: '씨앗' | '새싹' | '줄기' | '꽃';
  message: string;
}

export interface MaeumReportAnalytics {
  weeklyTrend: WeeklyEmotionPoint[];
  topKeywords: MindKeywordTag[];
}

/** `/report` 화면이 받는 전체 상태. `buildReport(log)` 의 반환값이기도 하다. */
export interface MaeumReportState {
  /** `totalConsultationCount >= 3` — 이 값이 false 면 `analyticsData` 가 **없다** */
  hasEnoughData: boolean;
  totalConsultationCount: number;
  /** 마지막 기록의 ISO 시각. 기록이 없으면 빈 문자열. */
  lastUpdated: string;
  mindGrowthSeed: MindGrowthSeed;
  /** hasEnoughData === true 일 때만 존재. 화면은 이 키의 유무로 차트를 조건부 배제한다. */
  analyticsData?: MaeumReportAnalytics;
}

/** 기록 읽기 결과 — '없다'와 '깨졌다'를 구별하기 위한 봉투 */
export interface CounselReadResult {
  log: CounselRecord[];
  /** 기록 일부(또는 전부)가 신뢰할 수 없다 — 복구 카드로 간다 */
  broken: boolean;
}

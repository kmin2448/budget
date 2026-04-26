export const WEMEET_NAMED_RANGES = {
  USAGE_TYPE:       '사용구분범위',   // 집행현황!A2:A200
  TEAM_NAME:        '팀명범위',       // 집행현황!C2:C200
  DRAFT_AMOUNT:     '기안금액범위',   // 집행현황!D2:D200
  CONFIRMED_AMOUNT: '확정금액범위',   // 집행현황!E2:E200
  CLAIM_STATUS:     '청구여부범위',   // 집행현황!F2:F200
  TEAM_LIST:        '팀명단',         // 팀별취합!A3:A31
  USAGE_TYPE_LIST:  '사용구분목록',   // 사용구분!A1:A10
  MENTORING:        '멘토링',         // 사용구분!A1
  MEETING:          '회의비',         // 사용구분!A3
  MATERIAL:         '재료비',         // 사용구분!A4
  STUDENT_ACTIVITY: '학생활동지원비', // 사용구분!A5
} as const;

export const WEMEET_USAGE_TYPES = ['멘토링', '회의비', '재료비', '학생활동지원비'] as const;
export type WeMeetUsageType = (typeof WEMEET_USAGE_TYPES)[number];

// 집행현황 시트 데이터 범위 A2:H200
// A: 사용구분, B: 지출건명, C: 팀명, D: 기안금액, E: 확정금액, F: 청구여부, G: 사용일자, H: 파일URL
export const WEMEET_EXECUTION_RANGE = '집행현황!A2:H200';
// 팀별취합 시트 데이터 범위 A3:O31 (3열씩 × 4개 사용구분 + A팀명 + B예산 + C잔액)
export const WEMEET_SUMMARY_RANGE = '팀별취합!A3:O31';
// 팀명단 범위
export const WEMEET_TEAM_LIST_RANGE = '팀별취합!A3:A31';

export const WEMEET_MAX_TEAMS = 29;  // A3:A31 (29행)
export const WEMEET_MAX_ROWS = 199;  // A2:A200 (199행)

// 팀정보 시트 범위
export const WEMEET_TEAM_INFO_RANGE = '팀정보!A2:Z200';

// 팀별취합 열 인덱스 (0-based, A=0)
// 구조: A=팀명, B=총예산, C=잔액, 이후 사용구분별 (기안금액, 확정금액, 미청구금액) 3열씩
export const WEMEET_SUMMARY_COLS = {
  TEAM_NAME:            0,  // A: 팀명
  TOTAL_BUDGET:         1,  // B: 팀 예산
  BALANCE:              2,  // C: 잔액 = B - sum(D:R)
  MENTORING_DRAFT:      3,  // D: 멘토링 기안금액
  MENTORING_CONFIRMED:  4,  // E: 멘토링 확정금액
  MENTORING_CLAIMED:    5,  // F: 멘토링 미청구금액
  MEETING_DRAFT:        6,  // G: 회의비 기안금액
  MEETING_CONFIRMED:    7,  // H: 회의비 확정금액
  MEETING_CLAIMED:      8,  // I: 회의비 미청구금액
  MATERIAL_DRAFT:       9,  // J: 재료비 기안금액
  MATERIAL_CONFIRMED:  10,  // K: 재료비 확정금액
  MATERIAL_CLAIMED:    11,  // L: 재료비 미청구금액
  STUDENT_DRAFT:       12,  // M: 학생활동지원비 기안금액
  STUDENT_CONFIRMED:   13,  // N: 학생활동지원비 확정금액
  STUDENT_CLAIMED:     14,  // O: 학생활동지원비 미청구금액
} as const;

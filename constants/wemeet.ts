export const WEMEET_NAMED_RANGES = {
  USAGE_TYPE:       '사용구분범위',   // 집행현황!A2:A200
  TEAM_NAME:        '팀명범위',       // 집행현황!B2:B200
  PLANNED_AMOUNT:   '계획금액범위',   // 집행현황!C2:C200
  CONFIRMED:        '확정여부범위',   // 집행현황!D2:D200
  CONFIRMED_AMOUNT: '확정금액범위',  // 집행현황!E2:E200
  TEAM_LIST:        '팀명단',         // 팀별취합!A3:A31
  USAGE_TYPE_LIST:  '사용구분목록',   // 사용구분!A1:A10
  MENTORING:        '멘토링',         // 사용구분!A1
  MEETING:          '회의비',         // 사용구분!A2
  MATERIAL:         '재료비',         // 사용구분!A3
  STUDENT_ACTIVITY: '학생활동지원비', // 사용구분!A4
} as const;

export const WEMEET_USAGE_TYPES = ['멘토링', '회의비', '재료비', '학생활동지원비'] as const;
export type WeMeetUsageType = (typeof WEMEET_USAGE_TYPES)[number];

// 집행현황 시트 데이터 범위 (A2:I200)
export const WEMEET_EXECUTION_RANGE = '집행현황!A2:I200';
// 팀별취합 시트 데이터 범위 (A3:N31)
export const WEMEET_SUMMARY_RANGE = '팀별취합!A3:N31';
// 팀명단 범위
export const WEMEET_TEAM_LIST_RANGE = '팀별취합!A3:A31';

export const WEMEET_MAX_TEAMS = 29;  // A3:A31 (29행)
export const WEMEET_MAX_ROWS = 199;  // A2:A200 (199행)

// 팀정보 시트 범위
export const WEMEET_TEAM_INFO_RANGE = '팀정보!A2:Z200';

// 팀별취합 열 인덱스 (0-based, A=0)
export const WEMEET_SUMMARY_COLS = {
  TEAM_NAME:            0,  // A: 팀명
  TOTAL_BUDGET:         1,  // B: 팀 예산
  MENTORING_CONFIRMED:  2,  // C: 멘토링 확정
  MEETING_CONFIRMED:    3,  // D: 회의비 확정
  MATERIAL_CONFIRMED:   4,  // E: 재료비 확정
  STUDENT_CONFIRMED:    5,  // F: 학생활동지원비 확정
  MENTORING_PENDING:    6,  // G: 멘토링 미확정
  MEETING_PENDING:      7,  // H: 회의비 미확정
  MATERIAL_PENDING:     8,  // I: 재료비 미확정
  STUDENT_PENDING:      9,  // J: 학생활동지원비 미확정
  CONFIRMED_TOTAL:      10, // K: 지출확정금액합계
  CONFIRMED_BALANCE:    11, // L: 확정잔액
  EXPECTED_TOTAL:       12, // M: 총계획금액(확정+미확정)
  EXPECTED_BALANCE:     13, // N: 예정잔액
} as const;

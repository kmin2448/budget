export const SMALL_CLUB_NAMED_RANGES = {
  USAGE_TYPE:       '사용구분범위',
  TEAM_NAME:        '팀명범위',
  DRAFT_AMOUNT:     '기안금액범위',
  CONFIRMED_AMOUNT: '확정금액범위',
  CLAIM_STATUS:     '청구여부범위',
  TEAM_LIST:        '팀명단',
  USAGE_TYPE_LIST:  '사용구분목록',
  MENTORING:        '멘토링',
  MEETING:          '회의비',
  MATERIAL:         '재료비',
  STUDENT_ACTIVITY: '학생활동지원비',
} as const;

export const SMALL_CLUB_USAGE_TYPES = ['멘토링', '회의비', '재료비', '학생활동지원비'] as const;
export type SmallClubUsageType = (typeof SMALL_CLUB_USAGE_TYPES)[number];

// 집행현황 시트 데이터 범위 A2:I200
export const SMALL_CLUB_EXECUTION_RANGE = '집행현황!A2:I200';
// 팀별취합 시트 데이터 범위 A3:O31
export const SMALL_CLUB_SUMMARY_RANGE = '팀별취합!A3:O31';
// 팀명단 범위
export const SMALL_CLUB_TEAM_LIST_RANGE = '팀별취합!A3:A31';

export const SMALL_CLUB_MAX_TEAMS = 29;
export const SMALL_CLUB_MAX_ROWS  = 199;

// 팀정보 시트 범위
export const SMALL_CLUB_TEAM_INFO_RANGE = '팀정보!A2:Z200';

// 팀별취합 열 인덱스 (0-based, A=0)
export const SMALL_CLUB_SUMMARY_COLS = {
  TEAM_NAME:            0,
  TOTAL_BUDGET:         1,
  BALANCE:              2,
  MENTORING_DRAFT:      3,
  MENTORING_CONFIRMED:  4,
  MENTORING_CLAIMED:    5,
  MEETING_DRAFT:        6,
  MEETING_CONFIRMED:    7,
  MEETING_CLAIMED:      8,
  MATERIAL_DRAFT:       9,
  MATERIAL_CONFIRMED:  10,
  MATERIAL_CLAIMED:    11,
  STUDENT_DRAFT:       12,
  STUDENT_CONFIRMED:   13,
  STUDENT_CLAIMED:     14,
} as const;

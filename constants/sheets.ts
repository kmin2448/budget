export const NAMED_RANGES = {
  // 집행내역 정리 시트
  BUDGET_PLAN: '예산계획',           // L6:L125
  EXECUTION_COMPLETE: '집행완료',    // O6:O125
  EXECUTION_PLANNED: '집행예정',     // P6:P125
  CATEGORY: '비목',                  // C6:C125
  SUB_CATEGORY: '보조비목',          // D6:D125
  SUB_DETAIL: '보조세목',            // E6:E125

  // ★취합 시트
  ALLOCATION: '편성액',              // F3:F26
  ADJUSTMENT: '증감액',              // J3:J26
  ENAARA_CATEGORY: '이나라비목',     // B3:B26
  ENAARA_SUBCATEGORY: '이나라세목',  // C3:C26
  ENAARA_DETAIL: '이나라보조세목',   // D3:D26

  // 비목별 편성액 (★취합 시트)
  PERSONNEL_ALLOCATION: '인건비편성액',
  SCHOLARSHIP_ALLOCATION: '장학금편성액',
  EDU_PROGRAM_ALLOCATION: '교육연구프로그램개발운영비편성액',
  EDU_ENV_ALLOCATION: '교육연구환경개선비편성액',
  LAB_EQUIPMENT_ALLOCATION: '실험실습장비및기자재구입운영비편성액',
  CORPORATE_ALLOCATION: '기업지원협력활동비편성액',
  REGIONAL_ALLOCATION: '지역연계협업지원비편성액',
  PERFORMANCE_ALLOCATION: '성과활용확산지원비편성액',
  OTHER_ALLOCATION: '그밖의사업운영경비편성액',

  // 비목별 드롭다운 목록 (비목별 사용항목(드롭) 시트)
  PERSONNEL_DROP: '인건비드롭',
  SCHOLARSHIP_DROP: '장학금드롭',
  EDU_PROGRAM_DROP: '교육연구프로그램개발운영비드롭',
  EDU_ENV_DROP: '교육연구환경개선비드롭',
  LAB_EQUIPMENT_DROP: '실험실습장비및기자재구입운영비드롭',
  CORPORATE_DROP: '기업지원협력활동비드롭',
  REGIONAL_DROP: '지역연계협업지원비드롭',
  PERFORMANCE_DROP: '성과활용확산지원비드롭',
  OTHER_DROP: '그밖의사업운영경비드롭',

  // 비목별 집행 데이터 Named Range
  PERSONNEL_EXEC: '인건비집행',
  SCHOLARSHIP_EXEC: '장학금집행',
  EDU_PROGRAM_EXEC: '교육연구프로그램개발운영비집행',
  EDU_ENV_EXEC: '교육연구환경개선비집행',
  LAB_EQUIPMENT_EXEC: '실험실습장비및기자재구입운영비집행',
  CORPORATE_EXEC: '기업지원협력활동비집행',
  REGIONAL_EXEC: '지역연계협업지원비집행',
  PERFORMANCE_EXEC: '성과활용확산지원비집행',
  OTHER_EXEC: '그밖의사업운영경비집행',
} as const;

// 비목 시트명 목록 (드롭다운 연동용)
export const CATEGORY_SHEETS = [
  '인건비',
  '장학금',
  '교육연구프로그램개발운영비',
  '교육연구환경개선비',
  '실험실습장비및기자재구입운영비',
  '기업지원협력활동비',
  '지역연계협업지원비',
  '성과활용확산지원비',
  '그밖의사업운영경비',
] as const;

export type CategorySheet = (typeof CATEGORY_SHEETS)[number];

// 월 컬럼 순서 (3월~익년 2월, Sheets I~T열)
export const MONTH_COLUMNS = [
  '3월', '4월', '5월', '6월', '7월', '8월',
  '9월', '10월', '11월', '12월', '1월', '2월',
] as const;

export type MonthColumn = (typeof MONTH_COLUMNS)[number];

// 비목 → Named Range 드롭다운 매핑
export const CATEGORY_DROP_MAP: Record<CategorySheet, string> = {
  '인건비': NAMED_RANGES.PERSONNEL_DROP,
  '장학금': NAMED_RANGES.SCHOLARSHIP_DROP,
  '교육연구프로그램개발운영비': NAMED_RANGES.EDU_PROGRAM_DROP,
  '교육연구환경개선비': NAMED_RANGES.EDU_ENV_DROP,
  '실험실습장비및기자재구입운영비': NAMED_RANGES.LAB_EQUIPMENT_DROP,
  '기업지원협력활동비': NAMED_RANGES.CORPORATE_DROP,
  '지역연계협업지원비': NAMED_RANGES.REGIONAL_DROP,
  '성과활용확산지원비': NAMED_RANGES.PERFORMANCE_DROP,
  '그밖의사업운영경비': NAMED_RANGES.OTHER_DROP,
};

// 비목 → 편성액 Named Range 매핑
export const CATEGORY_ALLOCATION_MAP: Record<CategorySheet, string> = {
  '인건비': NAMED_RANGES.PERSONNEL_ALLOCATION,
  '장학금': NAMED_RANGES.SCHOLARSHIP_ALLOCATION,
  '교육연구프로그램개발운영비': NAMED_RANGES.EDU_PROGRAM_ALLOCATION,
  '교육연구환경개선비': NAMED_RANGES.EDU_ENV_ALLOCATION,
  '실험실습장비및기자재구입운영비': NAMED_RANGES.LAB_EQUIPMENT_ALLOCATION,
  '기업지원협력활동비': NAMED_RANGES.CORPORATE_ALLOCATION,
  '지역연계협업지원비': NAMED_RANGES.REGIONAL_ALLOCATION,
  '성과활용확산지원비': NAMED_RANGES.PERFORMANCE_ALLOCATION,
  '그밖의사업운영경비': NAMED_RANGES.OTHER_ALLOCATION,
};

// 비목 → 집행 Named Range 매핑 (I8:T* 월별 금액)
export const CATEGORY_EXEC_MAP: Record<CategorySheet, string> = {
  '인건비': NAMED_RANGES.PERSONNEL_EXEC,
  '장학금': NAMED_RANGES.SCHOLARSHIP_EXEC,
  '교육연구프로그램개발운영비': NAMED_RANGES.EDU_PROGRAM_EXEC,
  '교육연구환경개선비': NAMED_RANGES.EDU_ENV_EXEC,
  '실험실습장비및기자재구입운영비': NAMED_RANGES.LAB_EQUIPMENT_EXEC,
  '기업지원협력활동비': NAMED_RANGES.CORPORATE_EXEC,
  '지역연계협업지원비': NAMED_RANGES.REGIONAL_EXEC,
  '성과활용확산지원비': NAMED_RANGES.PERFORMANCE_EXEC,
  '그밖의사업운영경비': NAMED_RANGES.OTHER_EXEC,
};

// 비목 시트 데이터 시작 행 (전 비목 공통)
export const CATEGORY_DATA_START_ROW = 8;

// 인건비 시트는 구조가 다름: A=내용, B~M=3월~2월 (12개월)
// 다른 비목: A=구분, B=지출일자, C~H=지출건명(병합), I~T=3월~2월
export const PERSONNEL_CATEGORY = '인건비' as const;

// 비목 시트 데이터 끝 행 (Named Range 기준 실제 범위)
export const CATEGORY_DATA_END_ROW_MAP: Record<CategorySheet, number> = {
  '인건비':                           14,
  '장학금':                          174,
  '교육연구프로그램개발운영비':        351,
  '교육연구환경개선비':               151,
  '실험실습장비및기자재구입운영비':    193,
  '기업지원협력활동비':               168,
  '지역연계협업지원비':               168,
  '성과활용확산지원비':               166,
  '그밖의사업운영경비':                82,
};

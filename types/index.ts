// 예산 유형 (본예산 / 이월예산)
export type BudgetType = 'main' | 'carryover';

// 사용자 권한 체계
export type UserRole = 'super_admin' | 'admin' | 'viewer';

export const PERMISSIONS = {
  DASHBOARD_WRITE:   'dashboard:write',   // 대시보드 (프로그램 추가/수정/삭제)
  EXPENDITURE_WRITE: 'expenditure:write', // 집행내역 편집/업로드
  BUDGET_WRITE:      'budget:write',      // 예산관리 (증감액 입력, PDF)
  ADVANCE_WRITE:     'advance:write',     // 선지원금 편집
  CARD_WRITE:        'card:write',        // 산단카드 편집
  LIBRARY_WRITE:     'library:write',     // 자료실 업로드/삭제
} as const;

export type Permission = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];

// 사용자
export interface User {
  id: string;
  email: string;
  name: string | null;
  role: UserRole;
  created_at: string;
}

// 사용자 권한
export interface UserPermission {
  id: string;
  user_id: string;
  permission: Permission;
  granted_by: string | null;
  created_at: string;
}

// 예산변경 이력
export interface BudgetChangeHistory {
  id: string;
  changed_at: string;
  changed_by: string | null;
  category: string;
  before_amount: number;
  adjustment: number;
  after_amount: number;
  pdf_drive_url: string | null;
  snapshot: Record<string, unknown> | null;
  created_at: string;
}

// 지출부 파일 메타데이터
export interface ExpenditureFile {
  id: string;
  sheet_name: string;
  row_index: number;
  drive_file_id: string;
  drive_url: string;
  uploaded_by: string | null;
  uploaded_at: string;
}

// 산단카드 집행내역
export interface CardExpenditure {
  id: string;
  expense_date: string;
  category: string;
  merchant: string | null;
  description: string | null;
  amount: number;
  erp_registered: boolean;
  created_by: string | null;
  created_at: string;
}

// Google Sheets 집행내역 행
export interface ExpenditureRow {
  rowIndex: number;
  category: string;        // 비목 (C열)
  subCategory: string;     // 보조비목 (D열)
  subDetail: string;       // 보조세목 (E열)
  budgetPlan: number;      // 예산계획 (L열)
  executionComplete: number; // 집행완료 (O열)
  executionPlanned: number;  // 집행예정 (P열)
}

// 예산 요약 카드
export interface BudgetSummary {
  totalBudget: number;
  executionComplete: number;
  executionPlanned: number;
  balance: number;
  executionRate: number;
}

// 비목별 편성액
export interface CategoryBudget {
  category: string;
  allocation: number;
  adjustment: number;
  afterAllocation: number;
  executionComplete: number;
  executionPlanned: number;
  balance: number;
  executionRate: number;
}

// 비목별 집행내역 행 (각 비목 시트의 row)
export interface ExpenditureDetailRow {
  rowIndex: number;
  programName: string;      // A열: 구분
  expenseDate: string;      // B열: 지출일자 YYYY-MM-DD (빈값 = 집행예정)
  description: string;      // C열: 지출건명 (병합셀 C:H)
  monthlyAmounts: number[]; // I~T열 (index 0=3월 … 11=2월), 길이 12
  totalAmount: number;      // monthlyAmounts 합계
  status: 'complete' | 'planned';
  hasFile: boolean;
  fileUrl?: string;
  fileId?: string;
}

export interface ExpenditureBudgetInfo {
  allocation: number;
  executionComplete: number;
  executionPlanned: number;
  balance: number;
  executionRate: number;
}

export interface ExpenditurePageData {
  rows: ExpenditureDetailRow[];
  budgetInfo: ExpenditureBudgetInfo;
  dropdownOptions: string[];
}

// ── Phase 4: 예산관리 ─────────────────────────────────────────────

// ★취합 시트 세목별 행 (B3:J26 각 row)
export interface BudgetDetailRow {
  rowOffset: number;        // 0-based (0 = 시트 3행)
  category: string;         // 이나라비목 (B)
  subcategory: string;      // 이나라세목 (C)
  subDetail: string;        // 이나라보조세목 (D)
  allocation: number;       // 편성액 (F)
  adjustment: number;       // 증감액 (J)
  afterAllocation: number;  // 편성액 + 증감액
  executionComplete: number;
  executionPlanned: number;
  balance: number;          // afterAllocation - executionComplete - executionPlanned
  executionRate: number;
}

// 비목별 집계 행 (카테고리 레벨 요약)
export interface BudgetCategoryRow {
  category: string;
  allocation: number;        // K36-K44 Named Range 값
  adjustment: number;        // 해당 비목의 증감액 합계
  afterAllocation: number;
  executionComplete: number;
  executionPlanned: number;
  balance: number;
  executionRate: number;
}

// 예산 API 전체 응답
export interface BudgetData {
  detailRows: BudgetDetailRow[];
  categoryRows: BudgetCategoryRow[];
}

// 자료실 파일
export interface LibraryFile {
  id: string;
  title: string;
  description: string | null;
  file_name: string;
  file_size: number;
  mime_type: string;
  drive_file_id: string;
  drive_url: string;
  uploaded_by: string | null;
  uploader_name: string | null;
  uploaded_at: string;
}

// ── WE-Meet ──────────────────────────────────────────────────────────

export interface WeMeetExecution {
  rowIndex: number;        // 집행현황 시트 실제 행 번호 (2~200)
  usageType: string;       // A: 사용구분
  teamName: string;        // B: 팀명
  draftAmount: number;     // C: 기안금액
  confirmed: boolean;      // D: 확정여부
  confirmedAmount: number; // F: 확정금액
  usageDate: string;       // G: 사용(신청)일자
  description: string;     // H: 지출건명
  fileUrl?: string;        // I: 증빙제출 (Drive URL, 여러 개면 \n 구분)
}

export interface WeMeetTeamSummary {
  teamName: string;
  totalBudget: number;
  confirmed: {
    mentoring: number;
    meeting: number;
    material: number;
    studentActivity: number;
    total: number;
  };
  pending: {
    mentoring: number;
    meeting: number;
    material: number;
    studentActivity: number;
    total: number;
  };
  confirmedBalance: number;  // totalBudget - confirmed.total
  expectedBalance: number;   // totalBudget - (confirmed.total + pending.total)
}

export interface WeMeetPageData {
  executions: WeMeetExecution[];
  teams: string[];
}

export interface WeMeetTeamInfo {
  rowIndex: number;      // 팀정보 시트 행 번호 (2~)
  teamName: string;      // A: 팀명
  advisor: string;       // B: 지도교수
  topic: string;         // C: 주제
  mentorOrg: string;     // D: 멘토소속
  mentor: string;        // E: 멘토
  teamLeader: string;    // F: 팀장
  teamMembers: string;   // G: 팀원
  assistantMentor: string; // H: 보조멘토
  remarks: string;       // J: 비고
}

// 예산변경 확정 요청 payload
export interface BudgetChangePayload {
  changedAt: string;                       // YYYY-MM-DD
  adjustments: { rowOffset: number; value: number }[];
  snapshot: BudgetCategoryRow[];
}

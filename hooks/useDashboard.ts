import { useQuery } from '@tanstack/react-query';

export interface ProgramRow {
  rowIndex: number;
  category: string;       // B열: 구분
  programName: string;    // H열: 프로그램명
  budget: string;         // C열: 비목
  subCategory: string;    // D열: 보조비목(세목)
  subDetail: string;      // E열: 보조세목
  additionalReflection?: string; // R열: 추가 반영사항
  professor: string;      // F열: 소관
  note: string;           // I열: 비고
  teacher: string;        // J열: 담당교원
  staff: string;          // K열: 담당직원
  divisionCode: string;   // A열: 코드
  budgetPlan: number;
  executionComplete: number;
  executionPlanned: number;
  advanceFunds: number;
  balance: number;
  executionRate: number;
}

export interface DashboardSummary {
  totalBudget: number;          // H2: 총예산(간접비 포함)
  mainBudget: number;           // J2: 본예산(간접비 제외)
  indirectCost: number;         // I2: 간접비
  budgetPlanTarget: number;     // L2: 계획수립예산
  budgetPlan: number;           // L5: 예산계획 합계
  executionComplete: number;    // O5: 집행완료 합계
  executionPlanned: number;     // P5: 집행예정 합계
  balance: number;              // N5: 잔액(예산계획 기준)
  mainBudgetBalance: number;    // H2 - (집행완료 + 간접비)
  mainBudgetExecutionRate: number; // (집행완료 + 간접비) / H2 × 100
  executionRate: number;        // (집행완료 + 집행예정) / 예산계획 × 100
}

export interface DashboardData {
  summary: DashboardSummary;
  programRows: ProgramRow[];
}

async function fetchDashboard(): Promise<DashboardData> {
  const res = await fetch('/api/sheets/dashboard');
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error((body as { error?: string }).error ?? '데이터 로드 실패');
  }
  return res.json() as Promise<DashboardData>;
}

export function useDashboard() {
  return useQuery({
    queryKey: ['dashboard'],
    queryFn: fetchDashboard,
    staleTime: 5 * 60 * 1000, // 5분
  });
}

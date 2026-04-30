import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useBudgetType } from '@/contexts/BudgetTypeContext';
import type { UnitTask, BudgetType } from '@/types';

interface AdjustItem {
  rowIndex: number;
  programName: string;
  unitName: string;
  category: string;
  subcategory: string;
  subDetail: string;
  before: number;
  adjustment: number;
}

interface UnitBudgetResponse {
  unitTasks: UnitTask[];
}

async function fetchUnitBudget(budgetType: BudgetType): Promise<UnitBudgetResponse> {
  const res = await fetch(`/api/unit-budget?sheetType=${budgetType}`);
  if (!res.ok) {
    const body = await res.json().catch(() => ({})) as { error?: string };
    throw new Error(body.error ?? '단위과제 예산 데이터를 불러오지 못했습니다.');
  }
  return res.json() as Promise<UnitBudgetResponse>;
}

export function useUnitBudget() {
  const { budgetType } = useBudgetType();
  return useQuery({
    queryKey: ['unit-budget', budgetType],
    queryFn: () => fetchUnitBudget(budgetType),
    staleTime: 1000 * 60 * 5,
    retry: 1,
    retryDelay: 2000,
  });
}

interface AdjustPayload {
  items: AdjustItem[];
  changedAt: string;
}

interface ApplyAllocationItem {
  rowOffset: number;
  category: string;
  subcategory: string;
  subDetail: string;
  before: number;
  after: number;
}

interface ApplyAllocationPayload {
  items: ApplyAllocationItem[];
  changedAt: string;
}

export function useUnitBudgetApplyAllocation() {
  const { budgetType } = useBudgetType();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (payload: ApplyAllocationPayload) => {
      const res = await fetch('/api/unit-budget/apply-allocation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...payload, sheetType: budgetType }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({})) as { error?: string };
        throw new Error(body.error ?? '배정금액 반영에 실패했습니다.');
      }
      return res.json();
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['unit-budget', budgetType] });
      void queryClient.invalidateQueries({ queryKey: ['budget', budgetType] });
      void queryClient.invalidateQueries({ queryKey: ['budget-history'] });
      void queryClient.invalidateQueries({ queryKey: ['dashboard', budgetType] });
    },
  });
}

export function useUnitBudgetAdjust() {
  const { budgetType } = useBudgetType();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (payload: AdjustPayload) => {
      const res = await fetch('/api/unit-budget/adjust', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...payload, sheetType: budgetType }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({})) as { error?: string };
        throw new Error(body.error ?? '증감 처리에 실패했습니다.');
      }
      return res.json();
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['unit-budget', budgetType] });
      void queryClient.invalidateQueries({ queryKey: ['budget', budgetType] });
      void queryClient.invalidateQueries({ queryKey: ['budget-history'] });
      void queryClient.invalidateQueries({ queryKey: ['dashboard', budgetType] });
    },
  });
}

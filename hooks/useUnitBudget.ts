import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useBudgetType } from '@/contexts/BudgetTypeContext';
import type { UnitTask, TransferItem, BudgetType } from '@/types';

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

interface TransferPayload {
  transfers: TransferItem[];
  changedAt: string;
}

export function useUnitBudgetTransfer() {
  const { budgetType } = useBudgetType();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (payload: TransferPayload) => {
      const res = await fetch('/api/unit-budget/transfer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...payload, sheetType: budgetType }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({})) as { error?: string };
        throw new Error(body.error ?? '이체 처리에 실패했습니다.');
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

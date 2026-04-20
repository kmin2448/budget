// hooks/useBudget.ts
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useBudgetType } from '@/contexts/BudgetTypeContext';
import type { BudgetData, BudgetChangeHistory, BudgetCategoryRow, BudgetDetailRow, BudgetType } from '@/types';

// ── 예산 현황 데이터 ──────────────────────────────────────────────

async function fetchBudget(budgetType: BudgetType): Promise<BudgetData> {
  const res = await fetch(`/api/budget?sheetType=${budgetType}`);
  if (!res.ok) {
    const body = await res.json() as { error?: string };
    throw new Error(body.error ?? '예산 데이터를 불러오지 못했습니다.');
  }
  return res.json() as Promise<BudgetData>;
}

export function useBudget() {
  const { budgetType } = useBudgetType();
  return useQuery({
    queryKey: ['budget', budgetType],
    queryFn: () => fetchBudget(budgetType),
    staleTime: 1000 * 60 * 5,
    retry: 1,
    retryDelay: 2000,
  });
}

// ── 증감액 저장 ────────────────────────────────────────────────────

export function useSaveAdjustments() {
  const { budgetType } = useBudgetType();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (adjustments: { rowOffset: number; value: number }[]) => {
      const res = await fetch(`/api/budget?sheetType=${budgetType}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ adjustments }),
      });
      if (!res.ok) {
        const body = await res.json() as { error?: string };
        throw new Error(body.error ?? '저장에 실패했습니다.');
      }
      return res.json();
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['budget', budgetType] });
    },
  });
}

// ── 예산변경 이력 ─────────────────────────────────────────────────

async function fetchHistory(): Promise<BudgetChangeHistory[]> {
  const res = await fetch('/api/budget/history');
  if (!res.ok) {
    const body = await res.json() as { error?: string };
    throw new Error(body.error ?? '이력을 불러오지 못했습니다.');
  }
  return res.json() as Promise<BudgetChangeHistory[]>;
}

export function useBudgetHistory() {
  return useQuery({
    queryKey: ['budget-history'],
    queryFn: fetchHistory,
    staleTime: 1000 * 60 * 2,
  });
}

// ── 이력 삭제 ─────────────────────────────────────────────────────

export function useDeleteHistory() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/budget/history?id=${encodeURIComponent(id)}`, {
        method: 'DELETE',
      });
      if (!res.ok) {
        const body = await res.json() as { error?: string };
        throw new Error(body.error ?? '이력 삭제에 실패했습니다.');
      }
      return res.json();
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['budget-history'] });
    },
  });
}

// ── 이력 저장 ─────────────────────────────────────────────────────

export function useSaveHistory() {
  const { budgetType } = useBudgetType();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (payload: {
      changedAt: string;
      categorySnapshot: BudgetCategoryRow[];
      detailSnapshot: BudgetDetailRow[];
      pdfDriveUrl?: string;
    }) => {
      const res = await fetch('/api/budget/history', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const body = await res.json() as { error?: string };
        throw new Error(body.error ?? '이력 저장에 실패했습니다.');
      }
      return res.json();
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['budget-history'] });
      void queryClient.invalidateQueries({ queryKey: ['budget', budgetType] });
    },
  });
}

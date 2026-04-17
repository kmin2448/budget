// hooks/useAdvanceFunds.ts
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

export interface AdvanceFundsSummary {
  totalIncome: number;
  totalExpense: number;
  balance: number;
}

export interface AdvanceFundItem {
  rowIndex: number;
  label: string;
  amount: number;
}

export interface AdvanceFundsData {
  summary: AdvanceFundsSummary;
  incomeItems: AdvanceFundItem[];
  expenseItems: AdvanceFundItem[];
}

async function fetchAdvanceFunds(): Promise<AdvanceFundsData> {
  const res = await fetch('/api/sheets/advance-funds');
  if (!res.ok) {
    const body = (await res.json()) as { error: string };
    throw new Error(body.error ?? '선지원금 데이터 로드 실패');
  }
  return res.json() as Promise<AdvanceFundsData>;
}

export function useAdvanceFunds() {
  return useQuery({
    queryKey: ['advance-funds'],
    queryFn: fetchAdvanceFunds,
    staleTime: 3 * 60 * 1000,
  });
}

export function useAddAdvanceFundItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: { type: 'income' | 'expense'; label: string; amount: number }) => {
      const res = await fetch('/api/sheets/advance-funds', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const body = (await res.json()) as { error: string };
        throw new Error(body.error ?? '추가 실패');
      }
      return res.json();
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['advance-funds'] }),
  });
}

export function useUpdateAdvanceFundItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: {
      type: 'income' | 'expense';
      rowIndex: number;
      label: string;
      amount: number;
    }) => {
      const res = await fetch('/api/sheets/advance-funds', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const body = (await res.json()) as { error: string };
        throw new Error(body.error ?? '저장 실패');
      }
      return res.json();
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['advance-funds'] }),
  });
}

export function useDeleteAdvanceFundItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: { type: 'income' | 'expense'; rowIndex: number }) => {
      const res = await fetch('/api/sheets/advance-funds', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const body = (await res.json()) as { error: string };
        throw new Error(body.error ?? '삭제 실패');
      }
      return res.json();
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['advance-funds'] }),
  });
}

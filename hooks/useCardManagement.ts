// hooks/useCardManagement.ts
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { CardEntry, CardHolders } from '@/app/api/sheets/card-management/route';
import { CATEGORY_SHEETS, MONTH_COLUMNS } from '@/constants/sheets';

export type { CardEntry, CardHolders };

export interface CardData {
  entries: CardEntry[];
  cardHolders: CardHolders;
  cardTypes: string[];
}

// 월별(1~12) × 비목별 집계
export interface MonthlyCategorySummary {
  month: number;        // 1~12
  monthLabel: string;
  byCategory: Record<string, number>;
  total: number;
}

export function buildMonthlyCategorySummary(entries: CardEntry[], year: string): MonthlyCategorySummary[] {
  const result: MonthlyCategorySummary[] = [];
  for (let m = 1; m <= 12; m++) {
    const monthLabel = `${m}월`;
    const byCategory: Record<string, number> = {};
    let total = 0;
    for (const entry of entries) {
      if (!entry.expenseDate.startsWith(year)) continue;
      const entryMonth = Number(entry.expenseDate.split('-')[1]);
      if (entryMonth !== m) continue;
      byCategory[entry.category] = (byCategory[entry.category] ?? 0) + entry.amount;
      total += entry.amount;
    }
    if (total > 0) result.push({ month: m, monthLabel, byCategory, total });
  }
  return result;
}

// 카테고리 목록 (데이터에 있는 것만)
export function getUsedCategories(entries: CardEntry[]): string[] {
  const set = new Set<string>();
  for (const e of entries) if (e.category) set.add(e.category);
  // CATEGORY_SHEETS 순서 유지
  return [...CATEGORY_SHEETS].filter((c) => set.has(c));
}

async function fetchCardManagement(): Promise<CardData> {
  const res = await fetch('/api/sheets/card-management');
  if (!res.ok) {
    const body = (await res.json()) as { error: string };
    throw new Error(body.error ?? '카드관리 데이터 로드 실패');
  }
  return res.json() as Promise<CardData>;
}

export function useCardManagement() {
  return useQuery({
    queryKey: ['card-management'],
    queryFn: fetchCardManagement,
    staleTime: 3 * 60 * 1000,
  });
}

export function useCreateCardEntry() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: Omit<CardEntry, 'rowIndex'>) => {
      const res = await fetch('/api/sheets/card-management', {
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
    onSuccess: () => qc.invalidateQueries({ queryKey: ['card-management'] }),
  });
}

export function useUpdateCardEntry() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: CardEntry) => {
      const res = await fetch('/api/sheets/card-management', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const body = (await res.json()) as { error: string };
        throw new Error(body.error ?? '수정 실패');
      }
      return res.json();
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['card-management'] }),
  });
}

export function useDeleteCardEntry() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (rowIndex: number) => {
      const res = await fetch('/api/sheets/card-management', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rowIndex }),
      });
      if (!res.ok) {
        const body = (await res.json()) as { error: string };
        throw new Error(body.error ?? '삭제 실패');
      }
      return res.json();
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['card-management'] }),
  });
}

export interface CardConfigCard {
  name: string;
  holders: string[];
}

export function useUpdateCardConfig() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (cards: CardConfigCard[]) => {
      const res = await fetch('/api/sheets/card-config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cards }),
      });
      if (!res.ok) {
        const body = (await res.json()) as { error: string };
        throw new Error(body.error ?? '저장 실패');
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['card-management'] }),
  });
}

// re-export MONTH_COLUMNS for convenience
export { MONTH_COLUMNS };

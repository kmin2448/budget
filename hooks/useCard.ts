// hooks/useCard.ts
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { CardExpenditure } from '@/types';
import { CATEGORY_SHEETS, MONTH_COLUMNS } from '@/constants/sheets';

// 비목별 월간 집계 행
export interface CardMonthlySummary {
  category: string;
  monthly: number[];   // index 0=1월…11=12월
  total: number;
}

// 비목×월 매트릭스 (3월~2월 회계연도 기준이 아닌 달력 1~12월 기준으로 집계)
export function buildMonthlySummary(items: CardExpenditure[]): CardMonthlySummary[] {
  const map: Record<string, number[]> = {};
  for (const cat of CATEGORY_SHEETS) {
    map[cat] = Array(12).fill(0);
  }
  for (const item of items) {
    if (!map[item.category]) map[item.category] = Array(12).fill(0);
    const month = new Date(item.expense_date).getMonth(); // 0=1월…11=12월
    map[item.category][month] += item.amount;
  }
  return CATEGORY_SHEETS.map((cat) => ({
    category: cat,
    monthly: map[cat] ?? Array(12).fill(0),
    total: (map[cat] ?? []).reduce((a, b) => a + b, 0),
  }));
}

async function fetchCards(year: string): Promise<CardExpenditure[]> {
  const res = await fetch(`/api/card?year=${year}`);
  if (!res.ok) throw new Error('산단카드 데이터 로드 실패');
  const body = (await res.json()) as { items: CardExpenditure[] };
  return body.items;
}

export function useCard(year: string) {
  return useQuery({
    queryKey: ['card', year],
    queryFn: () => fetchCards(year),
    staleTime: 3 * 60 * 1000,
  });
}

export function useCreateCard() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: Omit<CardExpenditure, 'id' | 'created_by' | 'created_at'>) => {
      const res = await fetch('/api/card', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const err = (await res.json()) as { error: string };
        throw new Error(err.error ?? '저장 실패');
      }
      return res.json();
    },
    onSuccess: (_data, variables) => {
      const year = variables.expense_date.slice(0, 4);
      qc.invalidateQueries({ queryKey: ['card', year] });
    },
  });
}

export function useUpdateCard(year: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...body }: Partial<CardExpenditure> & { id: string }) => {
      const res = await fetch(`/api/card/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const err = (await res.json()) as { error: string };
        throw new Error(err.error ?? '수정 실패');
      }
      return res.json();
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['card', year] }),
  });
}

export function useDeleteCard(year: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/card/${id}`, { method: 'DELETE' });
      if (!res.ok) {
        const err = (await res.json()) as { error: string };
        throw new Error(err.error ?? '삭제 실패');
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['card', year] }),
  });
}

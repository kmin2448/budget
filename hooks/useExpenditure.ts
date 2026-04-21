// hooks/useExpenditure.ts
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useBudgetType } from '@/contexts/BudgetTypeContext';
import type { ExpenditurePageData, ExpenditureDetailRow, BudgetType } from '@/types';

// ── 조회 ──────────────────────────────────────────────────────────

async function fetchExpenditure(category: string, budgetType: BudgetType): Promise<ExpenditurePageData> {
  const res = await fetch(
    `/api/sheets/expenditure/${encodeURIComponent(category)}?sheetType=${budgetType}`,
  );
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error((body as { error?: string }).error ?? '데이터 로드 실패');
  }
  return res.json() as Promise<ExpenditurePageData>;
}

export function useExpenditure(category: string) {
  const { budgetType } = useBudgetType();
  return useQuery({
    queryKey: ['expenditure', category, budgetType],
    queryFn: () => fetchExpenditure(category, budgetType),
    staleTime: 3 * 60 * 1000,
    enabled: !!category,
  });
}

// ── 추가 ──────────────────────────────────────────────────────────

export interface RowPayload {
  programName: string;
  expenseDate: string;
  description: string;
  monthlyAmounts: number[];
}

export function useAddExpenditureRow(category: string) {
  const { budgetType } = useBudgetType();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (payload: RowPayload) => {
      const res = await fetch(
        `/api/sheets/expenditure/${encodeURIComponent(category)}?sheetType=${budgetType}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        },
      );
      if (!res.ok) {
        const body = await res.json() as { error?: string };
        throw new Error(body.error ?? '추가 실패');
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['expenditure', category, budgetType] });
      queryClient.invalidateQueries({ queryKey: ['dashboard', budgetType] });
    },
  });
}

// ── 수정 ──────────────────────────────────────────────────────────

export function useUpdateExpenditureRow(category: string) {
  const { budgetType } = useBudgetType();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (payload: RowPayload & { rowIndex: number }) => {
      const res = await fetch(
        `/api/sheets/expenditure/${encodeURIComponent(category)}?sheetType=${budgetType}`,
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        },
      );
      if (!res.ok) {
        const body = await res.json() as { error?: string };
        throw new Error(body.error ?? '수정 실패');
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['expenditure', category, budgetType] });
      queryClient.invalidateQueries({ queryKey: ['dashboard', budgetType] });
    },
  });
}

// ── 삭제 ──────────────────────────────────────────────────────────

export function useDeleteExpenditureRow(category: string) {
  const { budgetType } = useBudgetType();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (rowIndex: number) => {
      const res = await fetch(
        `/api/sheets/expenditure/${encodeURIComponent(category)}?sheetType=${budgetType}`,
        {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ rowIndex }),
        },
      );
      if (!res.ok) {
        const body = await res.json() as { error?: string };
        throw new Error(body.error ?? '삭제 실패');
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['expenditure', category, budgetType] });
      queryClient.invalidateQueries({ queryKey: ['dashboard', budgetType] });
    },
  });
}

// ── PDF 삭제 ──────────────────────────────────────────────────────

export function useDeleteFile(category: string) {
  const { budgetType } = useBudgetType();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (rowIndex: number) => {
      const res = await fetch('/api/drive/expenditure-upload', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ category, rowIndex }),
      });
      if (!res.ok) {
        const body = await res.json() as { error?: string };
        throw new Error(body.error ?? '파일 삭제 실패');
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['expenditure', category, budgetType] });
      queryClient.invalidateQueries({ queryKey: ['dashboard', budgetType] });
    },
  });
}

// ── PDF 업로드 ────────────────────────────────────────────────────

export function useUploadPdf(category: string) {
  const { budgetType } = useBudgetType();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ file, row }: { file: File; row: ExpenditureDetailRow }) => {
      // 파일명 자동 수정 로직 (청구서.md 참고)
      // 형식: ({이체일자}) {적요}_({금회청구액}).pdf
      const dateStr = row.expenseDate
        ? row.expenseDate.replace(/-/g, '').slice(2) // 2026-03-06 -> 260306
        : '일자미상';
      const amountStr = row.totalAmount.toLocaleString();
      let newFileName = `(${dateStr}) ${row.description}_(${amountStr}).pdf`;

      // 윈도우 파일명 금지문자 제거
      newFileName = newFileName.replace(/[/\\:*?"<>|]/g, '_');

      // 새 이름으로 File 객체 재생성
      const renamedFile = new File([file], newFileName, { type: file.type });

      const formData = new FormData();
      formData.append('file', renamedFile);
      formData.append('category', category);
      formData.append('rowIndex', String(row.rowIndex));
      formData.append('sheetType', budgetType);
      const res = await fetch('/api/drive/expenditure-upload', {
        method: 'POST',
        body: formData,
      });
      if (!res.ok) {
        const body = await res.json() as { error?: string };
        throw new Error(body.error ?? '업로드 실패');
      }
      return res.json() as Promise<{
        fileId: string;
        driveUrl: string;
        usagePercent: number;
        storageWarning: boolean;
      }>;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['expenditure', category, budgetType] });
      queryClient.invalidateQueries({ queryKey: ['dashboard', budgetType] });
    },
  });
}

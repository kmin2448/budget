// app/(dashboard)/budget/page.tsx
'use client';

import { useState, useEffect, useCallback } from 'react';
import { useSession } from 'next-auth/react';
import { RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { BudgetCategoryTable } from '@/components/budget/BudgetCategoryTable';
import { BudgetDetailTable } from '@/components/budget/BudgetDetailTable';
import { BudgetIntegratedTable } from '@/components/budget/BudgetIntegratedTable';
import { BudgetConfirmModal } from '@/components/budget/BudgetConfirmModal';
import { BudgetHistoryTable } from '@/components/budget/BudgetHistoryTable';
import {
  useBudget,
  useSaveAdjustments,
  useBudgetHistory,
  useSaveHistory,
  useDeleteHistory,
} from '@/hooks/useBudget';
import { parseKRW } from '@/lib/utils';
import type { BudgetCategoryRow, BudgetDetailRow } from '@/types';

type MainTab = 'status' | 'history';
type StatusSubTab = 'category' | 'detail' | 'integrated';

export default function BudgetPage() {
  const { data: session } = useSession();
  const { data, isLoading, isError, error, refetch } = useBudget();
  const { data: historyData, isLoading: historyLoading } = useBudgetHistory();

  const saveAdjustments = useSaveAdjustments();
  const saveHistory     = useSaveHistory();
  const deleteHistory   = useDeleteHistory();

  const [mainTab, setMainTab]   = useState<MainTab>('status');
  const [subTab, setSubTab]     = useState<StatusSubTab>('integrated');
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [pendingAdjustments, setPendingAdjustments] = useState<{ rowOffset: number; value: number }[]>([]);

  // ── 증감액 편집 상태 (통합 탭 입력 → 비목별·세목별 탭에도 반영) ──
  const [edits, setEdits] = useState<Record<number, string>>({});

  // refetch 완료 후 detailRows 교체 시 edits 동기화 (확정 후 초기화 포함)
  const detailRows = data?.detailRows;
  useEffect(() => {
    if (!detailRows) return;
    setEdits(
      Object.fromEntries(
        detailRows.map((r) => [r.rowOffset, r.adjustment !== 0 ? String(r.adjustment) : '']),
      ),
    );
  }, [detailRows]);

  const handleEditChange = useCallback((rowOffset: number, raw: string) => {
    setEdits((prev) => ({ ...prev, [rowOffset]: raw }));
  }, []);

  // 권한 체크
  const userRole = (session?.user as { role?: string } | undefined)?.role;
  const userPermissions = (session?.user as { permissions?: string[] } | undefined)?.permissions ?? [];
  const canWrite = userRole === 'super_admin' || userPermissions.includes('budget:write');

  // ── 입력된 증감액이 반영된 미리보기 행 (서브탭 전체 공유) ──
  const previewDetailRows: BudgetDetailRow[] = (data?.detailRows ?? []).map((r) => {
    const raw   = edits[r.rowOffset] ?? '';
    const adj   = raw === '' ? 0 : parseKRW(raw);
    const after = r.allocation + adj;
    return {
      ...r,
      adjustment:      adj,
      afterAllocation: after,
      balance:         after - r.executionComplete - r.executionPlanned,
      executionRate:
        after > 0
          ? Math.round(((r.executionComplete + r.executionPlanned) / after) * 1000) / 10
          : 0,
    };
  });

  const previewCategoryRows: BudgetCategoryRow[] = (data?.categoryRows ?? []).map((catRow) => {
    const catDetail       = previewDetailRows.filter((r) => r.category === catRow.category);
    const adjustment      = catDetail.reduce((s, r) => s + r.adjustment, 0);
    const afterAllocation = catRow.allocation + adjustment;
    return {
      ...catRow,
      adjustment,
      afterAllocation,
      balance: afterAllocation - catRow.executionComplete - catRow.executionPlanned,
    };
  });

  // 변경 확정 모달 열기
  function handleOpenConfirm() {
    setPendingAdjustments(
      previewDetailRows.map((r) => ({ rowOffset: r.rowOffset, value: r.adjustment })),
    );
    setConfirmOpen(true);
  }

  // 변경 확정: Sheets 저장 + Supabase 이력 기록
  async function handleConfirm(changedAt: string) {
    if (!data) return;
    try {
      await saveAdjustments.mutateAsync(pendingAdjustments);

      await saveHistory.mutateAsync({
        changedAt,
        categorySnapshot: previewCategoryRows,
        detailSnapshot:   previewDetailRows,
      });

      setConfirmOpen(false);
      setPendingAdjustments([]);
      setEdits({}); // 저장 성공 즉시 초기화
      void refetch();
      alert('예산변경이 확정되었습니다. 변경이력이 저장되었습니다.');
      setMainTab('history');
    } catch (err) {
      alert(err instanceof Error ? err.message : '확정 중 오류가 발생했습니다.');
    }
  }

  const isConfirming = saveAdjustments.isPending || saveHistory.isPending;

  return (
    <div className="space-y-5">
      {/* 페이지 헤더 */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">예산관리</h1>
          <p className="mt-1 text-sm text-gray-500">
            비목별 편성액 현황을 확인하고 증감액을 입력하여 예산을 변경합니다.
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => refetch()}
          disabled={isLoading}
          className="gap-1.5 text-gray-600"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${isLoading ? 'animate-spin' : ''}`} />
          새로고침
        </Button>
      </div>

      {/* 메인 탭 */}
      <div className="flex border-b border-gray-200">
        {(
          [
            { key: 'status',  label: '예산현황' },
            { key: 'history', label: '변경이력' },
          ] as { key: MainTab; label: string }[]
        ).map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setMainTab(key)}
            className={`relative px-5 py-2.5 text-sm font-medium transition-colors cursor-pointer
              ${
                mainTab === key
                  ? 'text-primary after:absolute after:bottom-0 after:left-0 after:h-0.5 after:w-full after:bg-primary'
                  : 'text-gray-500 hover:text-gray-800'
              }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* 에러 */}
      {isError && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error instanceof Error ? error.message : '데이터를 불러오지 못했습니다.'}
        </div>
      )}

      {/* ── 예산현황 탭 ── */}
      {mainTab === 'status' && (
        <div className="space-y-4">
          {/* 서브 탭 */}
          <div className="flex gap-2">
            {(
              [
                { key: 'integrated', label: '통합' },
                { key: 'category',   label: '비목별' },
                { key: 'detail',     label: '세목별' },
              ] as { key: StatusSubTab; label: string }[]
            ).map(({ key, label }) => (
              <button
                key={key}
                onClick={() => setSubTab(key)}
                className={`rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
                  subTab === key
                    ? 'bg-primary text-white'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          {isLoading ? (
            <div className="h-64 animate-pulse rounded-lg bg-gray-100" />
          ) : data ? (
            subTab === 'category' ? (
              <BudgetCategoryTable rows={previewCategoryRows} />
            ) : subTab === 'detail' ? (
              <BudgetDetailTable rows={previewDetailRows} />
            ) : (
              <BudgetIntegratedTable
                rows={data.detailRows}
                categoryRows={data.categoryRows}
                edits={edits}
                onEditChange={handleEditChange}
                canWrite={canWrite}
                isSaving={isConfirming}
                onOpenConfirm={handleOpenConfirm}
              />
            )
          ) : null}
        </div>
      )}

      {/* ── 변경이력 탭 ── */}
      {mainTab === 'history' && (
        <div>
          {historyLoading ? (
            <div className="h-40 animate-pulse rounded-lg bg-gray-100" />
          ) : (
            <BudgetHistoryTable
              records={historyData ?? []}
              canDelete={canWrite}
              onDelete={async (id) => {
                await deleteHistory.mutateAsync(id);
              }}
            />
          )}
        </div>
      )}

      {/* 확정 모달 */}
      {data && (
        <BudgetConfirmModal
          open={confirmOpen}
          detailSnapshot={previewDetailRows}
          categorySnapshot={previewCategoryRows}
          isLoading={isConfirming}
          onConfirm={handleConfirm}
          onClose={() => setConfirmOpen(false)}
        />
      )}
    </div>
  );
}

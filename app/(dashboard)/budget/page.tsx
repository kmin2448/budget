// app/(dashboard)/budget/page.tsx
'use client';

import { useState } from 'react';
import { useSession } from 'next-auth/react';
import { RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { BudgetCategoryTable } from '@/components/budget/BudgetCategoryTable';
import { BudgetDetailTable } from '@/components/budget/BudgetDetailTable';
import { BudgetIntegratedTable } from '@/components/budget/BudgetIntegratedTable';
import { BudgetAdjustmentEditor } from '@/components/budget/BudgetAdjustmentEditor';
import { BudgetConfirmModal } from '@/components/budget/BudgetConfirmModal';
import { BudgetHistoryTable } from '@/components/budget/BudgetHistoryTable';
import {
  useBudget,
  useSaveAdjustments,
  useBudgetHistory,
  useSaveHistory,
} from '@/hooks/useBudget';
import type { BudgetCategoryRow, BudgetDetailRow } from '@/types';

type MainTab = 'status' | 'change' | 'history';
type StatusSubTab = 'category' | 'detail' | 'integrated';

export default function BudgetPage() {
  const { data: session } = useSession();
  const { data, isLoading, isError, error, refetch } = useBudget();
  const { data: historyData, isLoading: historyLoading } = useBudgetHistory();

  const saveAdjustments = useSaveAdjustments();
  const saveHistory     = useSaveHistory();

  const [mainTab, setMainTab]   = useState<MainTab>('status');
  const [subTab, setSubTab]     = useState<StatusSubTab>('integrated');
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [pendingAdjustments, setPendingAdjustments] = useState<{ rowOffset: number; value: number }[]>([]);

  // 권한 체크
  const userRole = (session?.user as { role?: string } | undefined)?.role;
  const userPermissions = (session?.user as { permissions?: string[] } | undefined)?.permissions ?? [];
  const canWrite = userRole === 'super_admin' || userPermissions.includes('budget:write');

  // 증감액 Sheets 저장만 (이력 미기록)
  async function handleSaveOnly(adjustments: { rowOffset: number; value: number }[]) {
    try {
      await saveAdjustments.mutateAsync(adjustments);
      alert('Sheets에 저장되었습니다.');
    } catch (err) {
      alert(err instanceof Error ? err.message : '저장에 실패했습니다.');
    }
  }

  // 확정 모달 열기 (이력 기록 예정)
  function handleOpenConfirm(adjustments: { rowOffset: number; value: number }[]) {
    setPendingAdjustments(adjustments);
    setConfirmOpen(true);
  }

  // 변경 확정: Sheets 저장 + Supabase 이력 기록
  async function handleConfirm(changedAt: string) {
    if (!data) return;
    try {
      // 1. Sheets에 증감액 저장
      await saveAdjustments.mutateAsync(pendingAdjustments);

      // 2. 증감액 적용 후 snapshot 계산
      const adjMap = new Map(pendingAdjustments.map((a) => [a.rowOffset, a.value]));

      const updatedDetailRows: BudgetDetailRow[] = data.detailRows.map((r) => {
        const adj   = adjMap.has(r.rowOffset) ? (adjMap.get(r.rowOffset) ?? r.adjustment) : r.adjustment;
        const after = r.allocation + adj;
        return {
          ...r,
          adjustment: adj,
          afterAllocation: after,
          balance: after - r.executionComplete - r.executionPlanned,
        };
      });

      const categorySnapshot: BudgetCategoryRow[] = data.categoryRows.map((catRow) => {
        const catDetail   = updatedDetailRows.filter((r) => r.category === catRow.category);
        const adjustment  = catDetail.reduce((s, r) => s + r.adjustment, 0);
        const after       = catRow.allocation + adjustment;
        return {
          ...catRow,
          adjustment,
          afterAllocation: after,
          balance: after - catRow.executionComplete - catRow.executionPlanned,
        };
      });

      // 3. Supabase 이력 저장 (categorySnapshot + detailSnapshot)
      await saveHistory.mutateAsync({
        changedAt,
        categorySnapshot,
        detailSnapshot: updatedDetailRows,
      });

      setConfirmOpen(false);
      setPendingAdjustments([]);
      alert('예산변경이 확정되었습니다. 변경이력이 저장되었습니다.');
      setMainTab('history');
    } catch (err) {
      alert(err instanceof Error ? err.message : '확정 중 오류가 발생했습니다.');
    }
  }

  const isConfirming = saveAdjustments.isPending || saveHistory.isPending;

  // 확정 모달용 스냅샷 (preview)
  const confirmDetailSnapshot = data
    ? (() => {
        const adjMap = new Map(pendingAdjustments.map((a) => [a.rowOffset, a.value]));
        return data.detailRows.map((r) => {
          const adj   = adjMap.has(r.rowOffset) ? (adjMap.get(r.rowOffset) ?? r.adjustment) : r.adjustment;
          const after = r.allocation + adj;
          return { ...r, adjustment: adj, afterAllocation: after };
        });
      })()
    : [];

  const confirmCategorySnapshot: BudgetCategoryRow[] = data
    ? data.categoryRows.map((catRow) => {
        const catDetail   = confirmDetailSnapshot.filter((r) => r.category === catRow.category);
        const adjustment  = catDetail.reduce((s, r) => s + r.adjustment, 0);
        const afterAllocation = catRow.allocation + adjustment;
        return {
          ...catRow,
          adjustment,
          afterAllocation,
          balance: afterAllocation - catRow.executionComplete - catRow.executionPlanned,
        };
      })
    : [];

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
            { key: 'change',  label: '예산변경', disabled: !canWrite },
            { key: 'history', label: '변경이력' },
          ] as { key: MainTab; label: string; disabled?: boolean }[]
        ).map(({ key, label, disabled }) => (
          <button
            key={key}
            disabled={disabled}
            onClick={() => setMainTab(key)}
            className={`relative px-5 py-2.5 text-sm font-medium transition-colors
              ${disabled ? 'cursor-not-allowed text-gray-300' : 'cursor-pointer'}
              ${
                mainTab === key && !disabled
                  ? 'text-primary after:absolute after:bottom-0 after:left-0 after:h-0.5 after:w-full after:bg-primary'
                  : 'text-gray-500 hover:text-gray-800'
              }`}
          >
            {label}
            {disabled && (
              <span className="ml-1 text-xs text-gray-400">(권한 필요)</span>
            )}
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
              <BudgetCategoryTable rows={data.categoryRows} />
            ) : subTab === 'detail' ? (
              <BudgetDetailTable rows={data.detailRows} />
            ) : (
              <BudgetIntegratedTable
                rows={data.detailRows}
                categoryRows={data.categoryRows}
                canWrite={canWrite}
                isSaving={saveAdjustments.isPending || saveHistory.isPending}
                onOpenConfirm={handleOpenConfirm}
              />
            )
          ) : null}
        </div>
      )}

      {/* ── 예산변경 탭 ── */}
      {mainTab === 'change' && canWrite && (
        <div>
          {isLoading ? (
            <div className="h-64 animate-pulse rounded-lg bg-gray-100" />
          ) : data ? (
            <BudgetAdjustmentEditor
              detailRows={data.detailRows}
              categoryRows={data.categoryRows}
              isSaving={saveAdjustments.isPending}
              onSave={handleSaveOnly}
              onConfirm={handleOpenConfirm}
            />
          ) : null}
        </div>
      )}

      {/* ── 변경이력 탭 ── */}
      {mainTab === 'history' && (
        <div>
          {historyLoading ? (
            <div className="h-40 animate-pulse rounded-lg bg-gray-100" />
          ) : (
            <BudgetHistoryTable records={historyData ?? []} />
          )}
        </div>
      )}

      {/* 확정 모달 */}
      {data && (
        <BudgetConfirmModal
          open={confirmOpen}
          detailSnapshot={confirmDetailSnapshot}
          categorySnapshot={confirmCategorySnapshot}
          isLoading={isConfirming}
          onConfirm={handleConfirm}
          onClose={() => setConfirmOpen(false)}
        />
      )}
    </div>
  );
}

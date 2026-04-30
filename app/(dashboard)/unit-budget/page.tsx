'use client';

import { useState, useCallback } from 'react';
import { RefreshCw, CheckCircle, AlertCircle, Loader2 } from 'lucide-react';
import { useUnitBudget, useUnitBudgetAdjust } from '@/hooks/useUnitBudget';
import { UnitBudgetTable } from '@/components/unit-budget/UnitBudgetTable';
import { AdjustmentSummary } from '@/components/unit-budget/AdjustmentSummary';
import { ConfirmDialog } from '@/components/shared/ConfirmDialog';

export default function UnitBudgetPage() {
  const { data, isLoading, error, refetch } = useUnitBudget();
  const adjust = useUnitBudgetAdjust();

  const [adjustments, setAdjustments] = useState<Record<number, number>>({});
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const unitTasks = data?.unitTasks ?? [];

  const handleAdjChange = useCallback((rowIndex: number, value: number) => {
    setAdjustments((prev) => {
      if (value === 0) {
        const next = { ...prev };
        delete next[rowIndex];
        return next;
      }
      return { ...prev, [rowIndex]: value };
    });
  }, []);

  const hasAdjustments = Object.keys(adjustments).length > 0;

  const resetAdjustments = () => {
    setAdjustments({});
    setSuccessMsg(null);
    setErrorMsg(null);
  };

  const buildAdjItems = () => {
    const items: {
      rowIndex: number;
      programName: string;
      unitName: string;
      category: string;
      subcategory: string;
      subDetail: string;
      before: number;
      adjustment: number;
    }[] = [];

    for (const unit of unitTasks) {
      for (const row of unit.rows) {
        for (const prog of row.programs) {
          const adj = adjustments[prog.rowIndex];
          if (adj === undefined || adj === 0) continue;
          items.push({
            rowIndex: prog.rowIndex,
            programName: prog.programName,
            unitName: unit.name,
            category: row.category,
            subcategory: row.subcategory,
            subDetail: row.subDetail,
            before: prog.budgetPlan,
            adjustment: adj,
          });
        }
      }
    }
    return items;
  };

  const handleConfirm = async () => {
    setConfirmOpen(false);
    setSuccessMsg(null);
    setErrorMsg(null);

    const items = buildAdjItems();
    const changedAt = new Date().toISOString().slice(0, 10);
    try {
      await adjust.mutateAsync({ items, changedAt });
      setSuccessMsg(`${items.length}건의 예산계획 증감이 완료되었습니다. 변경이력에 저장되었습니다.`);
      setAdjustments({});
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : '증감 처리 중 오류가 발생했습니다.');
    }
  };

  return (
    <div className="flex flex-col gap-6 p-6">
      {/* 헤더 */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-[#131310]">단위과제 예산관리</h1>
          <p className="mt-0.5 text-sm text-text-secondary">
            단위과제별 예산계획 현황 및 직접 증감
          </p>
        </div>
        <button
          onClick={() => void refetch()}
          className="flex items-center gap-1.5 rounded-lg border border-divider bg-white px-3 py-1.5 text-sm text-text-secondary hover:bg-divider transition-colors"
        >
          <RefreshCw className="h-3.5 w-3.5" />
          새로고침
        </button>
      </div>

      {/* 알림 메시지 */}
      {successMsg && (
        <div className="flex items-start gap-2 rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700">
          <CheckCircle className="mt-0.5 h-4 w-4 shrink-0" />
          {successMsg}
        </div>
      )}
      {errorMsg && (
        <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          {errorMsg}
        </div>
      )}

      {/* 예산 테이블 */}
      <section className="space-y-4">
        <div>
          <h2 className="text-base font-semibold text-[#131310]">단위과제별 예산 현황</h2>
          <p className="text-xs text-text-secondary mt-0.5">
            증감액 열에 +/- 금액을 입력하면 하단에 변경 내역 요약이 표시됩니다.
          </p>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-16 text-text-secondary">
            <Loader2 className="mr-2 h-5 w-5 animate-spin" />
            데이터를 불러오는 중…
          </div>
        ) : error ? (
          <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">
            {error instanceof Error ? error.message : '데이터 로드 실패'}
          </div>
        ) : unitTasks.length === 0 ? (
          <div className="rounded-lg border border-divider bg-white px-4 py-8 text-center text-sm text-text-secondary">
            단위과제 데이터가 없습니다.
          </div>
        ) : (
          <UnitBudgetTable
            unitTasks={unitTasks}
            adjustments={adjustments}
            onAdjustmentChange={handleAdjChange}
          />
        )}

        {/* 변경 내역 요약 — 데이터 로드 후 항상 표시 */}
        {!isLoading && !error && unitTasks.length > 0 && (
          <AdjustmentSummary unitTasks={unitTasks} adjustments={adjustments} />
        )}

        {/* 확정 버튼 */}
        {hasAdjustments && (
          <div className="flex items-center justify-end gap-2 border-t border-divider pt-4">
            <button
              onClick={resetAdjustments}
              className="rounded-lg border border-divider bg-white px-4 py-2 text-sm text-text-secondary hover:bg-divider transition-colors"
            >
              초기화
            </button>
            <button
              onClick={() => setConfirmOpen(true)}
              disabled={adjust.isPending}
              className="flex items-center gap-1.5 rounded-lg bg-primary px-5 py-2 text-sm font-semibold text-white hover:bg-primary-light transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {adjust.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  처리 중…
                </>
              ) : (
                `증감 확정 (${Object.keys(adjustments).length}건)`
              )}
            </button>
          </div>
        )}
      </section>

      <ConfirmDialog
        open={confirmOpen}
        title="예산계획 증감 확정"
        description={`${Object.keys(adjustments).length}건의 프로그램 예산계획을 변경하시겠습니까? 확정 후 집행내역 정리의 예산계획(L열)이 업데이트되며 변경이력에 저장됩니다.`}
        confirmLabel="확정"
        loading={adjust.isPending}
        onConfirm={() => void handleConfirm()}
        onClose={() => setConfirmOpen(false)}
      />
    </div>
  );
}

'use client';

import { useState, useCallback } from 'react';
import { RefreshCw, CheckCircle, AlertCircle, Loader2, RotateCcw } from 'lucide-react';
import {
  useUnitBudget,
  useUnitBudgetAdjust,
  useUnitBudgetApplyAllocation,
} from '@/hooks/useUnitBudget';
import { UnitBudgetTable } from '@/components/unit-budget/UnitBudgetTable';
import { AdjustmentSummary } from '@/components/unit-budget/AdjustmentSummary';
import { AllocationPreview, type AllocationDiffRow } from '@/components/unit-budget/AllocationPreview';
import { ConfirmDialog } from '@/components/shared/ConfirmDialog';

export default function UnitBudgetPage() {
  const { data, isLoading, error, refetch } = useUnitBudget();
  const adjust      = useUnitBudgetAdjust();
  const applyAlloc  = useUnitBudgetApplyAllocation();

  // ── 증감 상태 ─────────────────────────────────────────────────────
  const [adjustments, setAdjustments] = useState<Record<number, number>>({});
  const [adjConfirmOpen, setAdjConfirmOpen] = useState(false);

  // ── 배정금액 적용 상태 ────────────────────────────────────────────
  const [allocationDiffs, setAllocationDiffs] = useState<AllocationDiffRow[]>([]);
  const [allocConfirmOpen, setAllocConfirmOpen] = useState(false);
  const [allocPreviewShown, setAllocPreviewShown] = useState(false);

  // ── 공통 메시지 ───────────────────────────────────────────────────
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg]     = useState<string | null>(null);

  const unitTasks    = data?.unitTasks ?? [];
  const hasAdjustments = Object.keys(adjustments).length > 0;
  const dataReady    = !isLoading && !error && unitTasks.length > 0;

  // ── 증감 핸들러 ──────────────────────────────────────────────────
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

  const resetAdjustments = () => {
    setAdjustments({});
    setSuccessMsg(null);
    setErrorMsg(null);
  };

  const buildAdjItems = () => {
    const items: {
      rowIndex: number; programName: string; unitName: string;
      category: string; subcategory: string; subDetail: string;
      before: number; adjustment: number;
    }[] = [];
    for (const unit of unitTasks) {
      for (const row of unit.rows) {
        for (const prog of row.programs) {
          const adj = adjustments[prog.rowIndex];
          if (!adj) continue;
          items.push({
            rowIndex: prog.rowIndex, programName: prog.programName,
            unitName: unit.name, category: row.category,
            subcategory: row.subcategory, subDetail: row.subDetail,
            before: prog.budgetPlan, adjustment: adj,
          });
        }
      }
    }
    return items;
  };

  const handleAdjConfirm = async () => {
    setAdjConfirmOpen(false);
    setSuccessMsg(null);
    setErrorMsg(null);
    const items = buildAdjItems();
    const changedAt = new Date().toISOString().slice(0, 10);
    try {
      await adjust.mutateAsync({ items, changedAt });
      setSuccessMsg(`${items.length}건의 예산계획 증감이 완료되었습니다.`);
      setAdjustments({});
      setAllocationDiffs([]);
      setAllocPreviewShown(false);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : '증감 처리 중 오류가 발생했습니다.');
    }
  };

  // ── 배정금액 적용 핸들러 ─────────────────────────────────────────
  const handlePreviewAllocation = () => {
    const diffs: AllocationDiffRow[] = [];
    for (const unit of unitTasks) {
      for (const row of unit.rows) {
        if (row.rowOffset !== null && row.budgetPlan !== row.allocation) {
          diffs.push({
            category:    row.category,
            subcategory: row.subcategory,
            subDetail:   row.subDetail,
            rowOffset:   row.rowOffset,
            before:      row.allocation,
            after:       row.budgetPlan,
          });
        }
      }
    }
    setAllocationDiffs(diffs);
    setAllocPreviewShown(true);
    setSuccessMsg(null);
    setErrorMsg(null);
  };

  const handleAllocConfirm = async () => {
    setAllocConfirmOpen(false);
    setSuccessMsg(null);
    setErrorMsg(null);
    const changedAt = new Date().toISOString().slice(0, 10);
    try {
      await applyAlloc.mutateAsync({ items: allocationDiffs, changedAt });
      setSuccessMsg(`${allocationDiffs.length}건의 배정금액이 업데이트되었습니다.`);
      setAllocationDiffs([]);
      setAllocPreviewShown(false);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : '배정금액 반영 중 오류가 발생했습니다.');
    }
  };

  const isPending = adjust.isPending || applyAlloc.isPending;

  return (
    <div className="flex flex-col gap-6 p-6">
      {/* 페이지 헤더 */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-[#131310]">단위과제 예산관리</h1>
          <p className="mt-0.5 text-sm text-text-secondary">
            단위과제별 예산계획 현황 및 직접 증감
          </p>
        </div>
        <button
          onClick={() => { void refetch(); setAllocationDiffs([]); setAllocPreviewShown(false); }}
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

      <section className="space-y-4">
        {/* 섹션 헤더 */}
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-base font-semibold text-[#131310]">단위과제별 예산 현황</h2>
            <p className="text-xs text-text-secondary mt-0.5">
              증감액 열에 +/- 금액을 입력하면 하단에 변경 내역 요약이 표시됩니다.
            </p>
          </div>
        </div>

        {/* ── 3개 액션 버튼 ── */}
        <div className="flex flex-wrap items-center gap-2">
          {/* 버튼 1: 증감액 확정 (계획금액 반영) */}
          <button
            onClick={() => setAdjConfirmOpen(true)}
            disabled={!hasAdjustments || isPending}
            className="flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white hover:bg-primary-light transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {adjust.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
            증감액 확정
            <span className="font-normal opacity-80">(계획금액 반영)</span>
          </button>

          {/* 구분선 */}
          <span className="text-divider">|</span>

          {/* 버튼 2: 계획금액 → 배정금액 */}
          <button
            onClick={handlePreviewAllocation}
            disabled={!dataReady || isPending}
            className="flex items-center gap-1.5 rounded-lg border border-primary bg-white px-4 py-2 text-sm font-semibold text-primary hover:bg-primary-bg transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            계획금액 → 배정금액
          </button>

          {/* 버튼 3: 배정금액 확정 */}
          <button
            onClick={() => setAllocConfirmOpen(true)}
            disabled={!allocPreviewShown || allocationDiffs.length === 0 || isPending}
            className="flex items-center gap-1.5 rounded-lg border border-amber-400 bg-amber-50 px-4 py-2 text-sm font-semibold text-amber-700 hover:bg-amber-100 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {applyAlloc.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
            배정금액 확정
          </button>

          {/* 증감 초기화 */}
          {hasAdjustments && (
            <>
              <span className="text-divider">|</span>
              <button
                onClick={resetAdjustments}
                className="flex items-center gap-1.5 rounded-lg border border-divider bg-white px-3 py-2 text-sm text-text-secondary hover:bg-divider transition-colors"
              >
                <RotateCcw className="h-3.5 w-3.5" />
                증감 초기화
              </button>
            </>
          )}
        </div>

        {/* 테이블 */}
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

        {/* 배정금액 변경 미리보기 (버튼 2 누른 후) */}
        {allocPreviewShown && dataReady && (
          <AllocationPreview diffs={allocationDiffs} />
        )}

        {/* 증감액 변경 내역 요약 (버튼 1용, 항상 표시) */}
        {dataReady && (
          <AdjustmentSummary unitTasks={unitTasks} adjustments={adjustments} />
        )}
      </section>

      {/* 확정 모달: 증감액 확정 */}
      <ConfirmDialog
        open={adjConfirmOpen}
        title="증감액 확정 (계획금액 반영)"
        description={`${Object.keys(adjustments).length}건의 프로그램 예산계획을 변경하시겠습니까? 확정 후 집행내역 정리의 예산계획(L열)이 업데이트되며 변경이력에 저장됩니다.`}
        confirmLabel="확정"
        loading={adjust.isPending}
        onConfirm={() => void handleAdjConfirm()}
        onClose={() => setAdjConfirmOpen(false)}
      />

      {/* 확정 모달: 배정금액 확정 */}
      <ConfirmDialog
        open={allocConfirmOpen}
        title="배정금액 확정"
        description={`${allocationDiffs.length}건의 항목에 대해 ★취합 편성액(F열)을 예산계획 금액으로 업데이트하시겠습니까? 변경이력에 저장됩니다.`}
        confirmLabel="확정"
        loading={applyAlloc.isPending}
        onConfirm={() => void handleAllocConfirm()}
        onClose={() => setAllocConfirmOpen(false)}
      />
    </div>
  );
}

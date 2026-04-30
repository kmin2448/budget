'use client';

import { useState, useCallback } from 'react';
import { Plus, RefreshCw, CheckCircle, AlertCircle, Loader2 } from 'lucide-react';
import { useUnitBudget, useUnitBudgetAdjust, useUnitBudgetTransfer } from '@/hooks/useUnitBudget';
import { UnitBudgetTable } from '@/components/unit-budget/UnitBudgetTable';
import { AdjustmentSummary } from '@/components/unit-budget/AdjustmentSummary';
import { TransferForm } from '@/components/unit-budget/TransferForm';
import { TransferSummary } from '@/components/unit-budget/TransferSummary';
import { ConfirmDialog } from '@/components/shared/ConfirmDialog';
import type { TransferItem } from '@/types';

function createEmptyTransfer(): TransferItem {
  return {
    id: crypto.randomUUID(),
    fromUnit: '',
    toUnit: '',
    fromCategory: '',
    fromSubcategory: '',
    fromSubDetail: '',
    toCategory: '',
    toSubcategory: '',
    toSubDetail: '',
    amount: 0,
    sourceProgramAllocations: [],
  };
}

export default function UnitBudgetPage() {
  const { data, isLoading, error, refetch } = useUnitBudget();
  const adjust = useUnitBudgetAdjust();
  const transfer = useUnitBudgetTransfer();

  // ── 증감 상태 ─────────────────────────────────────────────────────
  const [adjustments, setAdjustments] = useState<Record<number, number>>({});
  const [adjConfirmOpen, setAdjConfirmOpen] = useState(false);
  const [adjSuccessMsg, setAdjSuccessMsg] = useState<string | null>(null);
  const [adjErrorMsg, setAdjErrorMsg] = useState<string | null>(null);

  // ── 이체 상태 ─────────────────────────────────────────────────────
  const [transfers, setTransfers] = useState<TransferItem[]>([]);
  const [trfConfirmOpen, setTrfConfirmOpen] = useState(false);
  const [trfSuccessMsg, setTrfSuccessMsg] = useState<string | null>(null);
  const [trfErrorMsg, setTrfErrorMsg] = useState<string | null>(null);

  const unitTasks = data?.unitTasks ?? [];

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

  const hasAdjustments = Object.keys(adjustments).length > 0;

  const resetAdjustments = () => {
    setAdjustments({});
    setAdjSuccessMsg(null);
    setAdjErrorMsg(null);
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

  const handleAdjConfirm = async () => {
    setAdjConfirmOpen(false);
    setAdjSuccessMsg(null);
    setAdjErrorMsg(null);

    const items = buildAdjItems();
    const changedAt = new Date().toISOString().slice(0, 10);
    try {
      await adjust.mutateAsync({ items, changedAt });
      setAdjSuccessMsg(`${items.length}건의 예산계획 증감이 완료되었습니다. 변경이력에 저장되었습니다.`);
      setAdjustments({});
    } catch (err) {
      setAdjErrorMsg(err instanceof Error ? err.message : '증감 처리 중 오류가 발생했습니다.');
    }
  };

  // ── 이체 핸들러 ──────────────────────────────────────────────────
  const addTransfer = () => setTransfers((prev) => [...prev, createEmptyTransfer()]);

  const updateTransfer = useCallback((id: string, updated: TransferItem) => {
    setTransfers((prev) => prev.map((t) => (t.id === id ? updated : t)));
  }, []);

  const removeTransfer = (id: string) =>
    setTransfers((prev) => prev.filter((t) => t.id !== id));

  const resetTransfers = () => {
    setTransfers([]);
    setTrfSuccessMsg(null);
    setTrfErrorMsg(null);
  };

  const trfValidationErrors: string[] = [];
  for (const t of transfers) {
    const idx = transfers.indexOf(t);
    if (!t.fromUnit || !t.fromCategory) {
      trfValidationErrors.push(`이체 ${idx + 1}: 출발 단위과제/보조세목을 선택하세요.`);
    }
    if (!t.toUnit || !t.toCategory) {
      trfValidationErrors.push(`이체 ${idx + 1}: 도착 단위과제/보조세목을 선택하세요.`);
    }
    if (t.amount <= 0) {
      trfValidationErrors.push(`이체 ${idx + 1}: 이체 금액을 입력하세요.`);
    }
    const deductSum = t.sourceProgramAllocations.reduce((s, p) => s + p.deductAmount, 0);
    if (t.amount > 0 && deductSum !== t.amount) {
      trfValidationErrors.push(`이체 ${idx + 1}: 프로그램 차감 합계가 이체 금액과 일치하지 않습니다.`);
    }
  }

  const canConfirmTransfer =
    transfers.length > 0 && trfValidationErrors.length === 0 && !transfer.isPending;

  const handleTrfConfirm = async () => {
    setTrfConfirmOpen(false);
    setTrfSuccessMsg(null);
    setTrfErrorMsg(null);

    const changedAt = new Date().toISOString().slice(0, 10);
    try {
      await transfer.mutateAsync({ transfers, changedAt });
      setTrfSuccessMsg(`${transfers.length}건의 이체가 완료되었습니다. 예산관리 변경이력에 저장되었습니다.`);
      setTransfers([]);
    } catch (err) {
      setTrfErrorMsg(err instanceof Error ? err.message : '이체 처리 중 오류가 발생했습니다.');
    }
  };

  return (
    <div className="flex flex-col gap-6 p-6">
      {/* 페이지 헤더 */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-[#131310]">단위과제 예산관리</h1>
          <p className="mt-0.5 text-sm text-text-secondary">
            단위과제별 예산계획 직접 증감 및 단위과제 간 편성액 이체
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

      {/* ────────────────────────────────────────────────────────────
          Section 1: 예산계획 직접 증감
      ──────────────────────────────────────────────────────────── */}
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-base font-semibold text-[#131310]">프로그램 예산계획 증감</h2>
            <p className="text-xs text-text-secondary mt-0.5">
              증감액 열에 +/- 금액을 입력하세요. 집행내역 정리의 예산계획(L열)이 업데이트됩니다.
            </p>
          </div>
        </div>

        {/* 증감 알림 */}
        {adjSuccessMsg && (
          <div className="flex items-start gap-2 rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700">
            <CheckCircle className="mt-0.5 h-4 w-4 shrink-0" />
            {adjSuccessMsg}
          </div>
        )}
        {adjErrorMsg && (
          <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            {adjErrorMsg}
          </div>
        )}

        {/* 예산 테이블 */}
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

        {/* 변경 내역 요약 */}
        {hasAdjustments && (
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
              onClick={() => setAdjConfirmOpen(true)}
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

      {/* ────────────────────────────────────────────────────────────
          Section 2: 단위과제 간 예산 이체
      ──────────────────────────────────────────────────────────── */}
      <section className="space-y-4 border-t border-divider pt-6">
        {/* 이체 알림 */}
        {trfSuccessMsg && (
          <div className="flex items-start gap-2 rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700">
            <CheckCircle className="mt-0.5 h-4 w-4 shrink-0" />
            {trfSuccessMsg}
          </div>
        )}
        {trfErrorMsg && (
          <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            {trfErrorMsg}
          </div>
        )}

        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-base font-semibold text-[#131310]">
              단위과제 간 예산 이체
              {transfers.length > 0 && (
                <span className="ml-2 text-sm font-normal text-text-secondary">{transfers.length}건</span>
              )}
            </h2>
            <p className="text-xs text-text-secondary mt-0.5">
              단위과제 간 편성액(★취합 F열)과 예산계획(L열)을 동시에 이체합니다.
            </p>
          </div>
          <button
            onClick={addTransfer}
            disabled={isLoading || unitTasks.length === 0}
            className="flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-sm font-medium text-white hover:bg-primary-light transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Plus className="h-4 w-4" />
            이체 추가
          </button>
        </div>

        {transfers.length === 0 ? (
          <div className="rounded-lg border border-dashed border-divider bg-white px-4 py-8 text-center text-sm text-text-secondary">
            <p>이체 항목이 없습니다.</p>
            <p className="mt-1 text-xs">위의 &quot;이체 추가&quot; 버튼을 눌러 이체를 추가하세요.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {transfers.map((t, i) => (
              <TransferForm
                key={t.id}
                transfer={t}
                unitTasks={unitTasks}
                onChange={(updated) => updateTransfer(t.id, updated)}
                onRemove={() => removeTransfer(t.id)}
                index={i}
              />
            ))}
          </div>
        )}

        {transfers.length > 0 && <TransferSummary transfers={transfers} />}

        {trfValidationErrors.length > 0 && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3">
            <p className="mb-1.5 text-xs font-semibold text-red-600">확정 전 수정이 필요한 항목:</p>
            <ul className="space-y-0.5">
              {trfValidationErrors.map((msg, i) => (
                <li key={i} className="flex items-center gap-1.5 text-xs text-red-500">
                  <AlertCircle className="h-3 w-3 shrink-0" />
                  {msg}
                </li>
              ))}
            </ul>
          </div>
        )}

        {transfers.length > 0 && (
          <div className="flex items-center justify-end gap-2 border-t border-divider pt-4">
            <button
              onClick={resetTransfers}
              className="rounded-lg border border-divider bg-white px-4 py-2 text-sm text-text-secondary hover:bg-divider transition-colors"
            >
              초기화
            </button>
            <button
              onClick={() => setTrfConfirmOpen(true)}
              disabled={!canConfirmTransfer}
              className="flex items-center gap-1.5 rounded-lg bg-primary px-5 py-2 text-sm font-semibold text-white hover:bg-primary-light transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {transfer.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  처리 중…
                </>
              ) : (
                '이체 확정'
              )}
            </button>
          </div>
        )}
      </section>

      {/* 확정 모달: 증감 */}
      <ConfirmDialog
        open={adjConfirmOpen}
        title="예산계획 증감 확정"
        description={`${Object.keys(adjustments).length}건의 프로그램 예산계획을 변경하시겠습니까? 확정 후 집행내역 정리의 예산계획(L열)이 업데이트되며 변경이력에 저장됩니다.`}
        confirmLabel="확정"
        loading={adjust.isPending}
        onConfirm={() => void handleAdjConfirm()}
        onClose={() => setAdjConfirmOpen(false)}
      />

      {/* 확정 모달: 이체 */}
      <ConfirmDialog
        open={trfConfirmOpen}
        title="예산 이체 확정"
        description={`${transfers.length}건의 이체를 확정하시겠습니까? 확정 후 편성액과 예산계획이 변경되며 변경이력에 저장됩니다.`}
        confirmLabel="확정"
        loading={transfer.isPending}
        onConfirm={() => void handleTrfConfirm()}
        onClose={() => setTrfConfirmOpen(false)}
      />
    </div>
  );
}

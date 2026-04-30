'use client';

import { useState, useCallback } from 'react';
import { Plus, RefreshCw, CheckCircle, AlertCircle, Loader2 } from 'lucide-react';
import { useUnitBudget, useUnitBudgetTransfer } from '@/hooks/useUnitBudget';
import { UnitBudgetTable } from '@/components/unit-budget/UnitBudgetTable';
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
  const transfer = useUnitBudgetTransfer();

  const [transfers, setTransfers] = useState<TransferItem[]>([]);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const unitTasks = data?.unitTasks ?? [];

  const addTransfer = () => setTransfers((prev) => [...prev, createEmptyTransfer()]);

  const updateTransfer = useCallback((id: string, updated: TransferItem) => {
    setTransfers((prev) => prev.map((t) => (t.id === id ? updated : t)));
  }, []);

  const removeTransfer = (id: string) =>
    setTransfers((prev) => prev.filter((t) => t.id !== id));

  const resetAll = () => {
    setTransfers([]);
    setSuccessMsg(null);
    setErrorMsg(null);
  };

  // 유효성 검사
  const validationErrors: string[] = [];
  for (const t of transfers) {
    if (!t.fromUnit || !t.fromCategory) {
      validationErrors.push(`이체 ${transfers.indexOf(t) + 1}: 출발 단위과제/보조세목을 선택하세요.`);
    }
    if (!t.toUnit || !t.toCategory) {
      validationErrors.push(`이체 ${transfers.indexOf(t) + 1}: 도착 단위과제/보조세목을 선택하세요.`);
    }
    if (t.amount <= 0) {
      validationErrors.push(`이체 ${transfers.indexOf(t) + 1}: 이체 금액을 입력하세요.`);
    }
    const deductSum = t.sourceProgramAllocations.reduce((s, p) => s + p.deductAmount, 0);
    if (t.amount > 0 && deductSum !== t.amount) {
      validationErrors.push(
        `이체 ${transfers.indexOf(t) + 1}: 프로그램 차감 합계가 이체 금액과 일치하지 않습니다.`,
      );
    }
  }

  const canConfirm =
    transfers.length > 0 &&
    validationErrors.length === 0 &&
    !transfer.isPending;

  const handleConfirm = async () => {
    setConfirmOpen(false);
    setSuccessMsg(null);
    setErrorMsg(null);

    const changedAt = new Date().toISOString().slice(0, 10);
    try {
      await transfer.mutateAsync({ transfers, changedAt });
      setSuccessMsg(`${transfers.length}건의 이체가 완료되었습니다. 예산관리 변경이력에 저장되었습니다.`);
      setTransfers([]);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : '이체 처리 중 오류가 발생했습니다.');
    }
  };

  return (
    <div className="flex flex-col gap-6 p-6">
      {/* 페이지 헤더 */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-[#131310]">단위과제 예산관리</h1>
          <p className="mt-0.5 text-sm text-text-secondary">
            구분(단위과제)별 비목·세목·보조세목 예산 현황 및 단위과제 간 예산 이체
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

      {/* 예산 현황 테이블 */}
      <section>
        <h2 className="mb-3 text-base font-semibold text-[#131310]">단위과제별 예산 현황</h2>
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
          <UnitBudgetTable unitTasks={unitTasks} />
        )}
      </section>

      {/* 이체 섹션 */}
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold text-[#131310]">
            단위과제 간 예산 이체
            {transfers.length > 0 && (
              <span className="ml-2 text-sm font-normal text-text-secondary">{transfers.length}건</span>
            )}
          </h2>
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

        {/* 이체 요약 */}
        {transfers.length > 0 && (
          <TransferSummary transfers={transfers} />
        )}

        {/* 유효성 오류 */}
        {validationErrors.length > 0 && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3">
            <p className="mb-1.5 text-xs font-semibold text-red-600">확정 전 수정이 필요한 항목:</p>
            <ul className="space-y-0.5">
              {validationErrors.map((msg, i) => (
                <li key={i} className="flex items-center gap-1.5 text-xs text-red-500">
                  <AlertCircle className="h-3 w-3 shrink-0" />
                  {msg}
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* 하단 버튼 */}
        {transfers.length > 0 && (
          <div className="flex items-center justify-end gap-2 border-t border-divider pt-4">
            <button
              onClick={resetAll}
              className="rounded-lg border border-divider bg-white px-4 py-2 text-sm text-text-secondary hover:bg-divider transition-colors"
            >
              초기화
            </button>
            <button
              onClick={() => setConfirmOpen(true)}
              disabled={!canConfirm}
              className="flex items-center gap-1.5 rounded-lg bg-primary px-5 py-2 text-sm font-semibold text-white hover:bg-primary-light transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {transfer.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  처리 중…
                </>
              ) : (
                '확정하기'
              )}
            </button>
          </div>
        )}
      </section>

      {/* 확정 확인 모달 */}
      <ConfirmDialog
        open={confirmOpen}
        title="예산 이체 확정"
        description={`${transfers.length}건의 이체를 확정하시겠습니까? 확정 후 편성액과 예산계획이 변경되며, 예산관리 변경이력에 저장됩니다.`}
        confirmLabel="확정"
        loading={transfer.isPending}
        onConfirm={() => void handleConfirm()}
        onClose={() => setConfirmOpen(false)}
      />
    </div>
  );
}

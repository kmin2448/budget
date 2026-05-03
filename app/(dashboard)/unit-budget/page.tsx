'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import { RefreshCw, CheckCircle, AlertCircle, Loader2, RotateCcw, Search, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useSession } from 'next-auth/react';

const PENDING_ADJ_KEY = 'coss_dashboard_pending_adj';
import {
  useUnitBudget,
  useUnitBudgetAdjust,
  useUnitBudgetApplyAllocation,
} from '@/hooks/useUnitBudget';
import { useBudgetHistory, useDeleteHistory } from '@/hooks/useBudget';
import { UnitBudgetTable } from '@/components/unit-budget/UnitBudgetTable';
import { Tooltip } from '@/components/ui/tooltip';
import { AdjustmentSidePanel } from '@/components/unit-budget/AdjustmentSidePanel';
import { type AllocationDiffRow } from '@/components/unit-budget/AllocationPreview';
import { UnitBudgetHistoryTable } from '@/components/unit-budget/UnitBudgetHistoryTable';
import { ConfirmDialog } from '@/components/shared/ConfirmDialog';

type MainTab = 'status' | 'history';

export default function UnitBudgetPage() {
  const { data: session } = useSession();
  const { data, isLoading, error, refetch } = useUnitBudget();
  const adjust      = useUnitBudgetAdjust();
  const applyAlloc  = useUnitBudgetApplyAllocation();

  const { data: historyData, isLoading: historyLoading } = useBudgetHistory();
  const deleteHistory = useDeleteHistory();

  // ── 탭 상태 ───────────────────────────────────────────────────────
  const [mainTab, setMainTab] = useState<MainTab>('status');

  // ── 증감 상태 ─────────────────────────────────────────────────────
  const [adjustments, setAdjustments] = useState<Record<number, number>>({});
  const [pendingFromDashboard, setPendingFromDashboard] = useState<Set<number>>(new Set());
  const [adjConfirmOpen, setAdjConfirmOpen] = useState(false);

  // 초기 마운트 시 localStorage sync를 한 번 건너뛰기 위한 ref
  const skipNextSyncRef = useRef(true);

  // localStorage에서 대시보드 pending 증감액 읽어 초기화
  useEffect(() => {
    try {
      const raw = localStorage.getItem(PENDING_ADJ_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as Record<string, number>;
        const numericKeyed: Record<number, number> = {};
        const pendingSet = new Set<number>();
        for (const [k, v] of Object.entries(parsed)) {
          if (v !== 0) {
            numericKeyed[Number(k)] = v;
            pendingSet.add(Number(k));
          }
        }
        if (Object.keys(numericKeyed).length > 0) {
          setAdjustments(numericKeyed);
          setPendingFromDashboard(pendingSet);
        }
      }
    } catch { /* ignore */ }
  }, []);

  // adjustments 변경 시 localStorage에 역동기화 (대시보드에서도 반영)
  useEffect(() => {
    if (skipNextSyncRef.current) {
      skipNextSyncRef.current = false;
      return;
    }
    try {
      const toSave: Record<number, number> = {};
      for (const [k, v] of Object.entries(adjustments)) {
        if (v !== 0) toSave[Number(k)] = v;
      }
      if (Object.keys(toSave).length > 0) {
        localStorage.setItem(PENDING_ADJ_KEY, JSON.stringify(toSave));
      } else {
        localStorage.removeItem(PENDING_ADJ_KEY);
      }
    } catch { /* ignore */ }
  }, [adjustments]);

  // ── 배정금액 적용 상태 ────────────────────────────────────────────
  const [allocationDiffs, setAllocationDiffs] = useState<AllocationDiffRow[]>([]);
  const [allocConfirmOpen, setAllocConfirmOpen] = useState(false);
  const [allocPreviewShown, setAllocPreviewShown] = useState(false);
  const [pendingOfficialBudgetRows, setPendingOfficialBudgetRows] = useState<Set<number>>(new Set());

  // ── 단계 하이라이트 ───────────────────────────────────────────────
  const [activeStep, setActiveStep] = useState<1 | 2 | 3>(1);

  // ── 검색 ─────────────────────────────────────────────────────────
  const [searchQuery, setSearchQuery] = useState('');

  // ── 공통 메시지 ───────────────────────────────────────────────────
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg]     = useState<string | null>(null);

  const unitTasks    = data?.unitTasks ?? [];
  const hasAdjustments = Object.keys(adjustments).length > 0;
  const dataReady    = !isLoading && !error && unitTasks.length > 0;

  // 권한 확인
  const userRole = (session?.user as { role?: string } | undefined)?.role;
  const userPermissions = (session?.user as { permissions?: string[] } | undefined)?.permissions ?? [];
  const canWrite = userRole === 'super_admin' || userPermissions.includes('budget:write');

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
      setPendingFromDashboard(new Set());
      try { localStorage.removeItem(PENDING_ADJ_KEY); } catch { /* ignore */ }
      setAllocationDiffs([]);
      setAllocPreviewShown(false);
      setActiveStep(2);
      // 확정 후 이력 탭으로 이동
      setMainTab('history');
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : '증감 처리 중 오류가 발생했습니다.');
    }
  };

  // ── 편성(공식)예산 동기화 핸들러 ────────────────────────────────
  const handlePreviewAllocation = () => {
    const diffs: AllocationDiffRow[] = [];
    const pendingSet = new Set<number>();
    for (const unit of unitTasks) {
      for (const row of unit.rows) {
        for (const prog of row.programs) {
          if (prog.rowIndex !== -1 && prog.budgetPlan !== prog.officialBudget) {
            diffs.push({
              rowIndex:    prog.rowIndex,
              programName: prog.programName,
              category:    row.category,
              subcategory: row.subcategory,
              subDetail:   row.subDetail,
              before:      prog.officialBudget,
              after:       prog.budgetPlan,
            });
            pendingSet.add(prog.rowIndex);
          }
        }
      }
    }
    setAllocationDiffs(diffs);
    setPendingOfficialBudgetRows(pendingSet);
    setAllocPreviewShown(true);
    setSuccessMsg(null);
    setErrorMsg(null);
    setActiveStep(3);
  };

  const handleAllocConfirm = async () => {
    setAllocConfirmOpen(false);
    setSuccessMsg(null);
    setErrorMsg(null);
    const changedAt = new Date().toISOString().slice(0, 10);
    try {
      await applyAlloc.mutateAsync({ items: allocationDiffs, changedAt });
      setSuccessMsg(`${allocationDiffs.length}건의 편성(공식)예산이 계획금액으로 업데이트되었습니다.`);
      setAllocationDiffs([]);
      setAllocPreviewShown(false);
      setPendingOfficialBudgetRows(new Set());
      setActiveStep(1);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : '편성(공식)예산 반영 중 오류가 발생했습니다.');
    }
  };

  const isPending = adjust.isPending || applyAlloc.isPending;

  return (
    <div className="flex flex-col gap-4 p-6">
      {/* 페이지 헤더 */}
      <div className="flex items-center justify-between">
        <div className="flex items-baseline gap-2">
          <h1 className="text-xl font-bold text-[#131310]">단위과제 예산관리</h1>
          <p className="text-sm text-text-secondary">단위과제별 예산계획 현황 및 직접 증감</p>
        </div>
        <button
          onClick={() => { void refetch(); setAllocationDiffs([]); setAllocPreviewShown(false); }}
          className="flex items-center gap-1.5 rounded-[2px] border border-divider bg-white px-3 py-1.5 text-sm text-text-secondary hover:bg-divider transition-colors"
        >
          <RefreshCw className="h-3.5 w-3.5" />
          새로고침
        </button>
      </div>

      {/* 메인 탭 */}
      <div className="flex border-b border-[#E3E3E0]">
        {(
          [
            { key: 'status',  label: '예산현황' },
            { key: 'history', label: '증감이력' },
          ] as { key: MainTab; label: string }[]
        ).map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setMainTab(key)}
            className={`relative px-5 py-2.5 text-sm font-medium transition-colors cursor-pointer
              ${mainTab === key
                ? 'text-primary after:absolute after:bottom-0 after:left-0 after:h-0.5 after:w-full after:bg-primary'
                : 'text-text-secondary hover:text-[#131310]'
              }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* 알림 메시지 */}
      {successMsg && (
        <div className="flex items-start gap-2 rounded-[2px] border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700">
          <CheckCircle className="mt-0.5 h-4 w-4 shrink-0" />
          {successMsg}
        </div>
      )}
      {errorMsg && (
        <div className="flex items-start gap-2 rounded-[2px] border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          {errorMsg}
        </div>
      )}

      {/* ── 예산현황 탭 ── */}
      {mainTab === 'status' && (
        <section className="space-y-3">
          {/* 섹션 헤더 */}
          <div className="flex items-center gap-3 flex-wrap">
            <h2 className="text-base font-semibold text-[#131310] whitespace-nowrap">단위과제별 예산 현황</h2>
            <span className="text-xs text-text-secondary whitespace-nowrap">증감액 열에 +/- 금액 입력 → 우측 패널에 변경 내역 표시</span>
            <span className="flex items-center gap-1 text-xs whitespace-nowrap">
              <span className="inline-block h-3 w-3 rounded-sm border border-red-300 bg-red-100" />
              <span className="text-red-500">계획금액 ≠ 편성(공식)예산</span>
            </span>
            <span className="flex items-center gap-1 text-xs whitespace-nowrap">
              <span className="inline-block h-3 w-3 rounded-sm border border-sky-300 bg-sky-100" />
              <span className="text-sky-600">편성(공식)예산 동기화 대기 중</span>
            </span>
            <span className="flex items-center gap-1 text-xs whitespace-nowrap">
              <span className="text-red-500 font-bold leading-none">●</span>
              <span className="text-red-500">집행액이 편성,계획금액보다 큰 경우</span>
            </span>
          </div>

          {/* ── 검색(좌) + 버튼(우) ── */}
          <div className="flex items-center justify-between gap-2 flex-wrap">
            {/* 검색창 */}
            <div className="relative w-64 shrink-0">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-text-secondary pointer-events-none" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="프로그램명, 비목, 세목..."
                className="w-full rounded-[2px] border border-divider bg-white pl-9 pr-8 py-1.5 text-sm placeholder:text-text-secondary focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary/20 transition-colors"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-text-secondary hover:text-[#131310] transition-colors"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>

            {/* 버튼 그룹 (오른쪽 정렬) */}
            <div className="flex items-center gap-2 flex-wrap justify-end">
              {/* 버튼 1: 증감액 확정 */}
              <Tooltip text="증감액에 대해 예산계획금액에 반영합니다.">
                <Button
                  size="sm"
                  variant={activeStep === 1 ? 'default' : 'outline'}
                  onClick={() => setAdjConfirmOpen(true)}
                  disabled={!hasAdjustments || isPending}
                  className={`gap-1.5${activeStep !== 1 ? ' text-gray-600' : ''}`}
                >
                  {adjust.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                  <span className="opacity-60 font-normal">1.</span> 증감액 확정
                </Button>
              </Tooltip>

              {/* 버튼 2: 계획금액 → 편성액(공식) 건 확인 */}
              <Tooltip text="예산계획과 편성예산이 다른 건에 대해 확인합니다.">
                <Button
                  size="sm"
                  variant={activeStep === 2 ? 'default' : 'outline'}
                  onClick={handlePreviewAllocation}
                  disabled={!dataReady || isPending}
                  className={`gap-1.5${activeStep !== 2 ? ' text-gray-600' : ''}`}
                >
                  <span className="opacity-60 font-normal">2.</span> 계획금액 → 편성액(공식) 건 확인
                </Button>
              </Tooltip>

              {/* 버튼 3: 편성액(공식) 확정 */}
              <Tooltip text="예산계획에 맞춰 편성예산을 변경합니다.">
                <Button
                  size="sm"
                  variant={activeStep === 3 ? 'default' : 'outline'}
                  onClick={() => setAllocConfirmOpen(true)}
                  disabled={!allocPreviewShown || allocationDiffs.length === 0 || isPending}
                  className={`gap-1.5${activeStep !== 3 ? ' text-gray-600' : ''}`}
                >
                  {applyAlloc.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                  <span className="opacity-60 font-normal">3.</span> 편성액(공식) 확정
                </Button>
              </Tooltip>

              {/* 증감 초기화 */}
              {hasAdjustments && (
                <>
                  <span className="text-divider">|</span>
                  <button
                    onClick={resetAdjustments}
                    className="flex items-center gap-1.5 rounded-[2px] border border-divider bg-white px-3 py-1.5 text-sm text-text-secondary hover:bg-divider transition-colors"
                  >
                    <RotateCcw className="h-3.5 w-3.5" />
                    초기화
                  </button>
                </>
              )}
            </div>
          </div>

          {/* 테이블 */}
          {isLoading ? (
            <div className="flex items-center justify-center py-16 text-text-secondary">
              <Loader2 className="mr-2 h-5 w-5 animate-spin" />
              데이터를 불러오는 중…
            </div>
          ) : error ? (
            <div className="rounded-[2px] border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">
              {error instanceof Error ? error.message : '데이터 로드 실패'}
            </div>
          ) : unitTasks.length === 0 ? (
            <div className="rounded-[2px] border border-divider bg-white px-4 py-8 text-center text-sm text-text-secondary">
              단위과제 데이터가 없습니다.
            </div>
          ) : (
            <UnitBudgetTable
              unitTasks={unitTasks}
              adjustments={adjustments}
              onAdjustmentChange={handleAdjChange}
              pendingFromDashboard={pendingFromDashboard}
              pendingOfficialBudgetRows={pendingOfficialBudgetRows}
              showOnlyPendingSync={allocPreviewShown && pendingOfficialBudgetRows.size > 0}
              searchQuery={searchQuery}
            />
          )}

        </section>
      )}

      {/* ── 증감이력 탭 ── */}
      {mainTab === 'history' && (
        <section>
          {historyLoading ? (
            <div className="flex items-center justify-center py-16 text-text-secondary">
              <Loader2 className="mr-2 h-5 w-5 animate-spin" />
              이력을 불러오는 중…
            </div>
          ) : (
            <UnitBudgetHistoryTable
              records={historyData ?? []}
              canDelete={canWrite}
              onDelete={async (id) => {
                await deleteHistory.mutateAsync(id);
              }}
            />
          )}
        </section>
      )}

      {/* 고정 우측 패널: 증감액 변경 내역 요약 */}
      <AdjustmentSidePanel unitTasks={unitTasks} adjustments={adjustments} />

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

      {/* 확정 모달: 편성(공식)예산 확정 */}
      <ConfirmDialog
        open={allocConfirmOpen}
        title="편성(공식)예산 확정"
        description={`${allocationDiffs.length}건의 프로그램에 대해 편성(공식)예산(M열)을 계획금액으로 업데이트하시겠습니까? 변경이력에 저장됩니다.`}
        confirmLabel="확정"
        loading={applyAlloc.isPending}
        onConfirm={() => void handleAllocConfirm()}
        onClose={() => setAllocConfirmOpen(false)}
      />
    </div>
  );
}

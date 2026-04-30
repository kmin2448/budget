'use client';

import { useEffect } from 'react';
import { X, AlertCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatKRW, parseKRW } from '@/lib/utils';
import { KRWInput } from '@/components/ui/krw-input';
import type { UnitTask, TransferItem, UnitBudgetRow } from '@/types';

interface Props {
  transfer: TransferItem;
  unitTasks: UnitTask[];
  onChange: (updated: TransferItem) => void;
  onRemove: () => void;
  index: number;
}

function rowKey(r: Pick<UnitBudgetRow, 'category' | 'subcategory' | 'subDetail'>): string {
  return `${r.category}||${r.subcategory}||${r.subDetail}`;
}

function getRowsForUnit(unitTasks: UnitTask[], unitName: string): UnitBudgetRow[] {
  return unitTasks.find((u) => u.name === unitName)?.rows ?? [];
}

export function TransferForm({ transfer, unitTasks, onChange, onRemove, index }: Props) {
  const unitNames = unitTasks.map((u) => u.name);
  const fromRows = getRowsForUnit(unitTasks, transfer.fromUnit);
  const toRows   = getRowsForUnit(unitTasks, transfer.toUnit);

  const selectedFromRow = fromRows.find(
    (r) =>
      r.category    === transfer.fromCategory &&
      r.subcategory === transfer.fromSubcategory &&
      r.subDetail   === transfer.fromSubDetail,
  );

  const toRowOptions = toRows;

  const deductSum = transfer.sourceProgramAllocations.reduce((s, p) => s + p.deductAmount, 0);
  const hasDeductMismatch  = transfer.amount > 0 && deductSum !== transfer.amount;
  const hasInsufficientBalance =
    transfer.amount > 0 &&
    selectedFromRow !== undefined &&
    selectedFromRow.allocation < transfer.amount;

  // 출발 보조세목 변경 시 프로그램 배분 목록 리셋
  useEffect(() => {
    if (!selectedFromRow) return;
    onChange({
      ...transfer,
      sourceProgramAllocations: selectedFromRow.programs.map((p) => ({
        rowIndex: p.rowIndex,
        programName: p.programName,
        deductAmount: 0,
      })),
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [transfer.fromUnit, transfer.fromCategory, transfer.fromSubcategory, transfer.fromSubDetail]);

  const setFromUnit = (val: string) => {
    const rows = getRowsForUnit(unitTasks, val);
    const first = rows[0];
    onChange({
      ...transfer,
      fromUnit: val,
      fromCategory:    first?.category    ?? '',
      fromSubcategory: first?.subcategory ?? '',
      fromSubDetail:   first?.subDetail   ?? '',
      sourceProgramAllocations: [],
    });
  };

  const setFromRow = (key: string) => {
    const row = fromRows.find((r) => rowKey(r) === key);
    if (!row) return;
    onChange({
      ...transfer,
      fromCategory:    row.category,
      fromSubcategory: row.subcategory,
      fromSubDetail:   row.subDetail,
      sourceProgramAllocations: row.programs.map((p) => ({
        rowIndex: p.rowIndex,
        programName: p.programName,
        deductAmount: 0,
      })),
    });
  };

  const setToUnit = (val: string) => {
    const rows = getRowsForUnit(unitTasks, val);
    const first = rows[0];
    onChange({
      ...transfer,
      toUnit: val,
      toCategory:    first?.category    ?? '',
      toSubcategory: first?.subcategory ?? '',
      toSubDetail:   first?.subDetail   ?? '',
    });
  };

  const setToRow = (key: string) => {
    const row = toRows.find((r) => rowKey(r) === key);
    if (!row) return;
    onChange({
      ...transfer,
      toCategory:    row.category,
      toSubcategory: row.subcategory,
      toSubDetail:   row.subDetail,
    });
  };

  const setDeductAmount = (rowIndex: number, val: string) => {
    const num = parseKRW(val);
    onChange({
      ...transfer,
      sourceProgramAllocations: transfer.sourceProgramAllocations.map((p) =>
        p.rowIndex === rowIndex ? { ...p, deductAmount: num } : p,
      ),
    });
  };

  return (
    <div className="rounded-lg border border-divider bg-white p-4 shadow-sm">
      {/* 헤더 */}
      <div className="mb-3 flex items-center justify-between">
        <span className="text-sm font-semibold text-primary">이체 #{index + 1}</span>
        <button
          onClick={onRemove}
          className="rounded-md p-1 text-text-secondary hover:bg-divider hover:text-red-500 transition-colors"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {/* 출발 */}
        <div className="space-y-2">
          <p className="text-xs font-semibold text-text-secondary uppercase tracking-wide">출발</p>

          <div className="space-y-1.5">
            <label className="text-xs text-text-secondary">단위과제</label>
            <select
              value={transfer.fromUnit}
              onChange={(e) => setFromUnit(e.target.value)}
              className="w-full rounded-md border border-divider px-2 py-1.5 text-sm text-[#131310] focus:outline-none focus:ring-2 focus:ring-primary/30"
            >
              <option value="">선택</option>
              {unitNames.map((n) => (
                <option key={n} value={n}>{n}</option>
              ))}
            </select>
          </div>

          {transfer.fromUnit && (
            <div className="space-y-1.5">
              <label className="text-xs text-text-secondary">보조세목</label>
              <select
                value={rowKey({ category: transfer.fromCategory, subcategory: transfer.fromSubcategory, subDetail: transfer.fromSubDetail })}
                onChange={(e) => setFromRow(e.target.value)}
                className="w-full rounded-md border border-divider px-2 py-1.5 text-sm text-[#131310] focus:outline-none focus:ring-2 focus:ring-primary/30"
              >
                <option value="">선택</option>
                {fromRows.map((r) => (
                  <option key={rowKey(r)} value={rowKey(r)}>
                    {r.category} &gt; {r.subcategory} &gt; {r.subDetail} ({formatKRW(r.allocation)}원)
                  </option>
                ))}
              </select>
              {selectedFromRow && (
                <p className="text-[11px] text-text-secondary">
                  현재 편성액:{' '}
                  <span className="font-medium text-[#131310]">{formatKRW(selectedFromRow.allocation)}원</span>
                </p>
              )}
            </div>
          )}
        </div>

        {/* 도착 */}
        <div className="space-y-2">
          <p className="text-xs font-semibold text-text-secondary uppercase tracking-wide">도착</p>

          <div className="space-y-1.5">
            <label className="text-xs text-text-secondary">단위과제</label>
            <select
              value={transfer.toUnit}
              onChange={(e) => setToUnit(e.target.value)}
              className="w-full rounded-md border border-divider px-2 py-1.5 text-sm text-[#131310] focus:outline-none focus:ring-2 focus:ring-primary/30"
            >
              <option value="">선택</option>
              {unitNames.map((n) => (
                <option key={n} value={n}>{n}</option>
              ))}
            </select>
          </div>

          {transfer.toUnit && (
            <div className="space-y-1.5">
              <label className="text-xs text-text-secondary">보조세목</label>
              <select
                value={rowKey({ category: transfer.toCategory, subcategory: transfer.toSubcategory, subDetail: transfer.toSubDetail })}
                onChange={(e) => setToRow(e.target.value)}
                className="w-full rounded-md border border-divider px-2 py-1.5 text-sm text-[#131310] focus:outline-none focus:ring-2 focus:ring-primary/30"
              >
                <option value="">선택</option>
                {toRowOptions.map((r) => (
                  <option key={rowKey(r)} value={rowKey(r)}>
                    {r.category} &gt; {r.subcategory} &gt; {r.subDetail} ({formatKRW(r.allocation)}원)
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>
      </div>

      {/* 이체 금액 */}
      <div className="mt-3 space-y-1.5">
        <label className="text-xs text-text-secondary">이체 금액</label>
        <KRWInput
          value={transfer.amount > 0 ? formatKRW(transfer.amount) : ''}
          onChange={(val) => onChange({ ...transfer, amount: parseKRW(val) })}
          className="w-full max-w-[240px] rounded-md border border-divider px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
          placeholder="0"
        />
        {hasInsufficientBalance && (
          <p className="flex items-center gap-1 text-[11px] text-red-500">
            <AlertCircle className="h-3 w-3" />
            편성액이 부족합니다 (현재: {formatKRW(selectedFromRow?.allocation ?? 0)}원)
          </p>
        )}
      </div>

      {/* 출발측 프로그램 차감 배분 */}
      {transfer.amount > 0 && selectedFromRow && selectedFromRow.programs.length > 0 && (
        <div className="mt-3 space-y-2">
          <p className="text-xs font-semibold text-text-secondary">출발측 프로그램 차감 배분</p>
          <div className="overflow-hidden rounded-md border border-divider">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-divider bg-[#F8FAFC]">
                  <th className="px-3 py-2 text-left font-medium text-text-secondary">프로그램명</th>
                  <th className="px-3 py-2 text-right font-medium text-text-secondary w-[130px]">현재 예산계획</th>
                  <th className="px-3 py-2 text-right font-medium text-text-secondary w-[150px]">차감액</th>
                </tr>
              </thead>
              <tbody>
                {transfer.sourceProgramAllocations.map((prog) => {
                  const currentBudget =
                    selectedFromRow.programs.find((p) => p.rowIndex === prog.rowIndex)?.budgetPlan ?? 0;
                  return (
                    <tr key={prog.rowIndex} className="border-b border-divider last:border-0">
                      <td className="px-3 py-2 text-[#131310]">{prog.programName}</td>
                      <td className="px-3 py-2 text-right tabular-nums text-[#131310]">
                        {formatKRW(currentBudget)}
                      </td>
                      <td className="px-3 py-2 text-right">
                        <KRWInput
                          value={prog.deductAmount > 0 ? formatKRW(prog.deductAmount) : ''}
                          onChange={(val) => setDeductAmount(prog.rowIndex, val)}
                          className="w-full rounded-md border border-divider px-2 py-1 text-right text-xs focus:outline-none focus:ring-1 focus:ring-primary/30"
                          placeholder="0"
                        />
                      </td>
                    </tr>
                  );
                })}
                <tr
                  className={cn(
                    'border-t-2',
                    hasDeductMismatch ? 'border-red-200 bg-red-50' : 'border-divider bg-[#F8FAFC]',
                  )}
                >
                  <td className="px-3 py-2 font-medium text-[#131310]">합계</td>
                  <td />
                  <td
                    className={cn(
                      'px-3 py-2 text-right tabular-nums font-semibold',
                      hasDeductMismatch ? 'text-red-500' : 'text-primary',
                    )}
                  >
                    {formatKRW(deductSum)}
                    {hasDeductMismatch && (
                      <span className="ml-1 text-[10px] font-normal">
                        (이체 {formatKRW(transfer.amount)}원과 불일치)
                      </span>
                    )}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

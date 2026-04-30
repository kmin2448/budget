'use client';

import { useState, useEffect, useRef, Fragment } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { cn, formatKRW, parseKRW } from '@/lib/utils';
import { KRWInput } from '@/components/ui/krw-input';
import type { UnitTask } from '@/types';

interface Props {
  unitTasks: UnitTask[];
  adjustments: Record<number, number>;
  onAdjustmentChange: (rowIndex: number, value: number) => void;
}

interface FlatRow {
  rowIndex: number;
  programName: string;
  budgetPlan: number;
  category: string;
  subcategory: string;
  subDetail: string;
  allocation: number;
}

function flattenUnit(unit: UnitTask): FlatRow[] {
  const result: FlatRow[] = [];
  for (const row of unit.rows) {
    if (row.programs.length === 0) {
      result.push({
        rowIndex: -1,
        programName: '',
        budgetPlan: row.budgetPlan,
        category: row.category,
        subcategory: row.subcategory,
        subDetail: row.subDetail,
        allocation: row.allocation,
      });
    } else {
      for (const prog of row.programs) {
        result.push({
          rowIndex: prog.rowIndex,
          programName: prog.programName,
          budgetPlan: prog.budgetPlan,
          category: row.category,
          subcategory: row.subcategory,
          subDetail: row.subDetail,
          allocation: row.allocation,
        });
      }
    }
  }
  return result;
}

export function UnitBudgetTable({ unitTasks, adjustments, onAdjustmentChange }: Props) {
  const [openUnits, setOpenUnits] = useState<Set<string>>(
    () => new Set(unitTasks.map((u) => u.name)),
  );
  const [displayValues, setDisplayValues] = useState<Record<number, string>>({});
  const prevAdjLen = useRef(Object.keys(adjustments).length);

  useEffect(() => {
    const len = Object.keys(adjustments).length;
    if (len === 0 && prevAdjLen.current > 0) {
      setDisplayValues({});
    }
    prevAdjLen.current = len;
  }, [adjustments]);

  const toggleUnit = (name: string) =>
    setOpenUnits((prev) => {
      const next = new Set(prev);
      next.has(name) ? next.delete(name) : next.add(name);
      return next;
    });

  const handleChange = (rowIndex: number, val: string) => {
    setDisplayValues((prev) => {
      if (!val) {
        const { [rowIndex]: _, ...rest } = prev;
        return rest;
      }
      return { ...prev, [rowIndex]: val };
    });
    onAdjustmentChange(rowIndex, parseKRW(val));
  };

  return (
    <div className="overflow-x-auto rounded-lg border border-divider bg-white">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-divider bg-[#F8FAFC]">
            <th className="px-3 py-2.5 text-left font-semibold text-text-secondary">프로그램명</th>
            <th className="px-3 py-2.5 text-left font-semibold text-text-secondary text-xs w-[140px]">비목</th>
            <th className="px-3 py-2.5 text-left font-semibold text-text-secondary text-xs w-[110px]">세목</th>
            <th className="px-3 py-2.5 text-left font-semibold text-text-secondary text-xs w-[110px]">보조세목</th>
            <th className="px-3 py-2.5 text-right font-semibold text-text-secondary w-[120px]">편성액</th>
            <th className="px-3 py-2.5 text-right font-semibold text-text-secondary w-[120px]">예산계획</th>
            <th className="px-3 py-2.5 text-right font-semibold text-text-secondary w-[130px]">
              증감액
              <span className="ml-1 text-[10px] font-normal text-text-secondary">(+/-)</span>
            </th>
            <th className="px-3 py-2.5 text-right font-semibold text-text-secondary w-[120px]">변경후</th>
          </tr>
        </thead>
        <tbody>
          {unitTasks.map((unit) => {
            const isOpen = openUnits.has(unit.name);
            const rows = flattenUnit(unit);
            const unitAdjTotal = rows.reduce((sum, r) => sum + (adjustments[r.rowIndex] ?? 0), 0);

            return (
              <Fragment key={`frag-${unit.name}`}>
                <tr
                  className="cursor-pointer border-b border-divider bg-primary-bg hover:bg-[#C8D9EE] transition-colors"
                  onClick={() => toggleUnit(unit.name)}
                >
                  <td className="px-3 py-2.5 font-semibold text-primary" colSpan={4}>
                    <span className="flex items-center gap-1.5">
                      {isOpen
                        ? <ChevronDown className="h-4 w-4 shrink-0" />
                        : <ChevronRight className="h-4 w-4 shrink-0" />}
                      {unit.name}
                      <span className="ml-1 text-xs font-normal text-text-secondary">
                        ({rows.length}개 항목)
                      </span>
                    </span>
                  </td>
                  <td className="px-3 py-2.5 text-right font-semibold text-primary">
                    {formatKRW(unit.totalAllocation)}
                  </td>
                  <td className="px-3 py-2.5 text-right font-semibold text-primary">
                    {formatKRW(unit.totalBudgetPlan)}
                  </td>
                  <td className="px-3 py-2.5 text-right font-semibold">
                    {unitAdjTotal !== 0 ? (
                      <span className={unitAdjTotal > 0 ? 'text-blue-600' : 'text-red-500'}>
                        {unitAdjTotal > 0 ? '+' : ''}{formatKRW(unitAdjTotal)}
                      </span>
                    ) : (
                      <span className="font-normal text-text-secondary">—</span>
                    )}
                  </td>
                  <td className="px-3 py-2.5 text-right font-semibold text-primary">
                    {unitAdjTotal !== 0
                      ? formatKRW(unit.totalBudgetPlan + unitAdjTotal)
                      : formatKRW(unit.totalBudgetPlan)}
                  </td>
                </tr>

                {isOpen && rows.map((row, idx) => {
                  const adj = adjustments[row.rowIndex] ?? 0;
                  const isEditable = row.rowIndex !== -1;
                  return (
                    <tr
                      key={`${unit.name}-${row.rowIndex}-${idx}`}
                      className={cn(
                        'border-b border-divider transition-colors hover:bg-[#EEF4FB]',
                        idx % 2 === 0 ? 'bg-white' : 'bg-[#F8F8F7]',
                      )}
                    >
                      <td className="px-3 py-2 pl-8 text-[#131310]">{row.programName || '—'}</td>
                      <td className="px-3 py-2 text-xs text-text-secondary max-w-[140px]">
                        <span className="block truncate" title={row.category}>{row.category || '—'}</span>
                      </td>
                      <td className="px-3 py-2 text-xs text-text-secondary max-w-[110px]">
                        <span className="block truncate" title={row.subcategory}>{row.subcategory || '—'}</span>
                      </td>
                      <td className="px-3 py-2 text-xs text-text-secondary max-w-[110px]">
                        <span className="block truncate" title={row.subDetail}>{row.subDetail || '—'}</span>
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums text-[#131310]">
                        {row.allocation > 0 ? formatKRW(row.allocation) : '—'}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums text-[#131310]">
                        {row.budgetPlan > 0 ? formatKRW(row.budgetPlan) : '—'}
                      </td>
                      <td className="px-2 py-1.5">
                        {isEditable ? (
                          <KRWInput
                            value={displayValues[row.rowIndex] ?? ''}
                            onChange={(val) => handleChange(row.rowIndex, val)}
                            allowNegative={true}
                            className={cn(
                              'w-full text-right tabular-nums text-sm rounded px-1.5 py-1 transition-colors',
                              'border border-transparent bg-transparent',
                              'hover:border-divider hover:bg-white',
                              'focus:border-primary focus:bg-white focus:outline-none',
                              adj > 0 && 'text-blue-600 font-medium',
                              adj < 0 && 'text-red-500 font-medium',
                            )}
                            placeholder="—"
                          />
                        ) : (
                          <span className="block text-right text-text-secondary">—</span>
                        )}
                      </td>
                      <td className={cn(
                        'px-3 py-2 text-right tabular-nums',
                        adj > 0 ? 'text-blue-600 font-medium' : adj < 0 ? 'text-red-500 font-medium' : 'text-text-secondary',
                      )}>
                        {adj !== 0
                          ? formatKRW(row.budgetPlan + adj)
                          : '—'}
                      </td>
                    </tr>
                  );
                })}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

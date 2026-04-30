'use client';

import { useState, Fragment } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { cn, formatKRW } from '@/lib/utils';
import type { UnitTask, UnitBudgetRow } from '@/types';

interface Props {
  unitTasks: UnitTask[];
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

export function UnitBudgetTable({ unitTasks }: Props) {
  const [openUnits, setOpenUnits] = useState<Set<string>>(
    () => new Set(unitTasks.map((u) => u.name)),
  );

  const toggleUnit = (name: string) =>
    setOpenUnits((prev) => {
      const next = new Set(prev);
      if (next.has(name)) { next.delete(name); } else { next.add(name); }
      return next;
    });

  return (
    <div className="overflow-x-auto rounded-lg border border-divider bg-white">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-divider bg-[#F8FAFC]">
            <th className="px-3 py-2.5 text-left font-semibold text-text-secondary">프로그램명</th>
            <th className="px-3 py-2.5 text-left font-semibold text-text-secondary text-xs w-[150px] whitespace-nowrap">비목</th>
            <th className="px-3 py-2.5 text-left font-semibold text-text-secondary text-xs w-[120px] whitespace-nowrap">세목</th>
            <th className="px-3 py-2.5 text-left font-semibold text-text-secondary text-xs w-[120px] whitespace-nowrap">보조세목</th>
            <th className="px-3 py-2.5 text-right font-semibold text-text-secondary w-[130px]">편성액</th>
            <th className="px-3 py-2.5 text-right font-semibold text-text-secondary w-[130px]">예산계획</th>
          </tr>
        </thead>
        <tbody>
          {unitTasks.map((unit) => {
            const isOpen = openUnits.has(unit.name);
            const rows = flattenUnit(unit);

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
                </tr>

                {isOpen && rows.map((row, idx) => (
                  <tr
                    key={`${unit.name}-${row.rowIndex}-${idx}`}
                    className={cn(
                      'border-b border-divider transition-colors hover:bg-[#EEF4FB]',
                      idx % 2 === 0 ? 'bg-white' : 'bg-[#F8F8F7]',
                    )}
                  >
                    <td className="px-3 py-2 pl-8 text-[#131310]">
                      {row.programName || '—'}
                    </td>
                    <td className="px-3 py-2 text-xs text-text-secondary max-w-[150px]">
                      <span className="block truncate" title={row.category}>{row.category || '—'}</span>
                    </td>
                    <td className="px-3 py-2 text-xs text-text-secondary max-w-[120px]">
                      <span className="block truncate" title={row.subcategory}>{row.subcategory || '—'}</span>
                    </td>
                    <td className="px-3 py-2 text-xs text-text-secondary max-w-[120px]">
                      <span className="block truncate" title={row.subDetail}>{row.subDetail || '—'}</span>
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-[#131310]">
                      {row.allocation > 0 ? formatKRW(row.allocation) : '—'}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-[#131310]">
                      {row.budgetPlan > 0 ? formatKRW(row.budgetPlan) : '—'}
                    </td>
                  </tr>
                ))}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

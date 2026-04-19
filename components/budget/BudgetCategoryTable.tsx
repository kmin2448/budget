// components/budget/BudgetCategoryTable.tsx
'use client';

import { formatKRW } from '@/lib/utils';
import type { BudgetCategoryRow } from '@/types';

interface Props {
  rows: BudgetCategoryRow[];
}

export function BudgetCategoryTable({ rows }: Props) {
  const totals = rows.reduce(
    (acc, r) => ({
      allocation: acc.allocation + r.allocation,
      adjustment: acc.adjustment + r.adjustment,
      afterAllocation: acc.afterAllocation + r.afterAllocation,
      executionComplete: acc.executionComplete + r.executionComplete,
      executionPlanned: acc.executionPlanned + r.executionPlanned,
      balance: acc.balance + r.balance,
    }),
    { allocation: 0, adjustment: 0, afterAllocation: 0, executionComplete: 0, executionPlanned: 0, balance: 0 },
  );
  const totalRate =
    totals.afterAllocation > 0
      ? Math.round(((totals.executionComplete + totals.executionPlanned) / totals.afterAllocation) * 1000) / 10
      : 0;

  return (
    <div className="overflow-x-auto rounded-[2px] border border-[#E3E3E0] shadow-soft">
      <table className="min-w-full text-sm">
        <thead>
          <tr className="border-b border-[#E3E3E0] bg-[#F3F3EE]">
            <th className="px-4 py-3 text-left font-medium text-text-secondary">비목</th>
            <th className="px-4 py-3 text-right font-medium text-text-secondary">편성액</th>
            <th className="px-4 py-3 text-right font-medium text-text-secondary">증감액</th>
            <th className="px-4 py-3 text-right font-medium text-text-secondary">변경후 편성액</th>
            <th className="px-4 py-3 text-right font-medium text-text-secondary">예산비율</th>
            <th className="px-4 py-3 text-right font-medium text-text-secondary leading-tight">집행금액<br />(완료+예정)</th>
            <th className="px-4 py-3 text-right font-medium text-text-secondary">잔액</th>
            <th className="px-4 py-3 text-right font-medium text-text-secondary">집행률</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => {
            const budgetRatio =
              totals.afterAllocation > 0
                ? Math.round((row.afterAllocation / totals.afterAllocation) * 1000) / 10
                : 0;

            return (
              <tr
                key={row.category}
                className={`border-b border-[#F0F0EE] hover:bg-primary-bg/20 transition-colors ${
                  i % 2 === 0 ? 'bg-white' : 'bg-[#FAFAF8]'
                }`}
              >
                <td className="px-4 py-2.5 font-medium text-[#131310]">{row.category}</td>
                <td className="px-4 py-2.5 text-right tabular-nums text-[#131310]">
                  {formatKRW(row.allocation)}
                </td>
                <td
                  className={`px-4 py-2.5 text-right tabular-nums font-medium ${
                    row.adjustment > 0
                      ? 'text-primary'
                      : row.adjustment < 0
                      ? 'text-red-500'
                      : 'text-text-secondary'
                  }`}
                >
                  {row.adjustment !== 0
                    ? (row.adjustment > 0 ? '+' : '') + formatKRW(row.adjustment)
                    : '-'}
                </td>
                <td className="px-4 py-2.5 text-right tabular-nums font-semibold text-[#131310]">
                  {formatKRW(row.afterAllocation)}
                </td>
                <td className="px-4 py-2.5 text-right tabular-nums">
                  <div className="flex items-center justify-end gap-1.5">
                    <div className="h-1.5 w-16 overflow-hidden rounded-full bg-[#E3E3E0]">
                      <div
                        className="h-full rounded-full bg-primary/60"
                        style={{ width: `${budgetRatio}%` }}
                      />
                    </div>
                    <span className="w-10 text-right text-xs text-text-secondary tabular-nums">
                      {budgetRatio.toFixed(1)}%
                    </span>
                  </div>
                </td>
                <td className="px-4 py-2.5 text-right tabular-nums">
                  <div className="flex flex-col items-end gap-0.5">
                    <span className="font-medium text-[#131310]">
                      {formatKRW(row.executionComplete + row.executionPlanned)}
                    </span>
                    <span className="text-xs text-text-secondary">
                      (<span className="text-complete">{formatKRW(row.executionComplete)}</span>
                      {' + '}
                      <span className="text-planned">{formatKRW(row.executionPlanned)}</span>)
                    </span>
                  </div>
                </td>
                <td
                  className={`px-4 py-2.5 text-right tabular-nums font-medium ${
                    row.balance < 0 ? 'text-red-500' : 'text-[#131310]'
                  }`}
                >
                  {formatKRW(row.balance)}
                </td>
                <td className="px-4 py-2.5 text-right tabular-nums">
                  <span
                    className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${
                      row.executionRate >= 90
                        ? 'bg-green-50 text-complete'
                        : row.executionRate >= 50
                        ? 'bg-amber-50 text-planned'
                        : 'bg-[#F3F3EE] text-text-secondary'
                    }`}
                  >
                    {row.executionRate}%
                  </span>
                </td>
              </tr>
            );
          })}
        </tbody>
        <tfoot>
          <tr className="border-t border-[#E3E3E0] bg-[#F3F3EE] font-semibold">
            <td className="px-4 py-2.5 text-[#131310]">합계</td>
            <td className="px-4 py-2.5 text-right tabular-nums text-[#131310]">{formatKRW(totals.allocation)}</td>
            <td
              className={`px-4 py-2.5 text-right tabular-nums ${
                totals.adjustment > 0 ? 'text-primary' : totals.adjustment < 0 ? 'text-red-500' : 'text-text-secondary'
              }`}
            >
              {totals.adjustment !== 0
                ? (totals.adjustment > 0 ? '+' : '') + formatKRW(totals.adjustment)
                : '-'}
            </td>
            <td className="px-4 py-2.5 text-right tabular-nums text-[#131310]">
              {formatKRW(totals.afterAllocation)}
            </td>
            <td className="px-4 py-2.5 text-right tabular-nums text-text-secondary text-xs">
              100%
            </td>
            <td className="px-4 py-2.5 text-right tabular-nums">
              <div className="flex flex-col items-end gap-0.5">
                <span className="text-[#131310]">{formatKRW(totals.executionComplete + totals.executionPlanned)}</span>
                <span className="text-xs text-text-secondary">
                  (<span className="text-complete">{formatKRW(totals.executionComplete)}</span>
                  {' + '}
                  <span className="text-planned">{formatKRW(totals.executionPlanned)}</span>)
                </span>
              </div>
            </td>
            <td className="px-4 py-2.5 text-right tabular-nums text-[#131310]">{formatKRW(totals.balance)}</td>
            <td className="px-4 py-2.5 text-right tabular-nums">
              <span className="inline-block rounded-full bg-primary-bg px-2 py-0.5 text-xs font-semibold text-primary">
                {totalRate}%
              </span>
            </td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

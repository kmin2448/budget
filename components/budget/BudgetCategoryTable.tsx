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
    <div className="overflow-x-auto rounded-lg border border-gray-200">
      <table className="min-w-full text-sm">
        <thead>
          <tr className="border-b border-gray-200 bg-primary text-white">
            <th className="px-4 py-3 text-left font-semibold">비목</th>
            <th className="px-4 py-3 text-right font-semibold">편성액</th>
            <th className="px-4 py-3 text-right font-semibold">증감액</th>
            <th className="px-4 py-3 text-right font-semibold">변경후 편성액</th>
            <th className="px-4 py-3 text-right font-semibold leading-tight">집행금액<br />(완료+예정)</th>
            <th className="px-4 py-3 text-right font-semibold">잔액</th>
            <th className="px-4 py-3 text-right font-semibold">집행률</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr
              key={row.category}
              className={`border-b border-gray-100 hover:bg-primary-bg/30 transition-colors ${
                i % 2 === 0 ? 'bg-white' : 'bg-row-even'
              }`}
            >
              <td className="px-4 py-2.5 font-medium text-gray-800">{row.category}</td>
              <td className="px-4 py-2.5 text-right tabular-nums text-gray-700">
                {formatKRW(row.allocation)}
              </td>
              <td
                className={`px-4 py-2.5 text-right tabular-nums font-medium ${
                  row.adjustment > 0
                    ? 'text-blue-600'
                    : row.adjustment < 0
                    ? 'text-red-600'
                    : 'text-gray-400'
                }`}
              >
                {row.adjustment !== 0
                  ? (row.adjustment > 0 ? '+' : '') + formatKRW(row.adjustment)
                  : '-'}
              </td>
              <td className="px-4 py-2.5 text-right tabular-nums font-semibold text-gray-900">
                {formatKRW(row.afterAllocation)}
              </td>
              <td className="px-4 py-2.5 text-right tabular-nums">
                <div className="flex flex-col items-end gap-0.5">
                  <span className="font-medium text-gray-800">
                    {formatKRW(row.executionComplete + row.executionPlanned)}
                  </span>
                  <span className="text-xs text-gray-400">
                    (<span className="text-complete">{formatKRW(row.executionComplete)}</span>
                    {' + '}
                    <span className="text-planned">{formatKRW(row.executionPlanned)}</span>)
                  </span>
                </div>
              </td>
              <td
                className={`px-4 py-2.5 text-right tabular-nums font-medium ${
                  row.balance < 0 ? 'text-red-600' : 'text-gray-700'
                }`}
              >
                {formatKRW(row.balance)}
              </td>
              <td className="px-4 py-2.5 text-right tabular-nums">
                <span
                  className={`inline-block rounded-full px-2 py-0.5 text-xs font-semibold ${
                    row.executionRate >= 90
                      ? 'bg-green-100 text-green-700'
                      : row.executionRate >= 50
                      ? 'bg-amber-100 text-amber-700'
                      : 'bg-gray-100 text-gray-600'
                  }`}
                >
                  {row.executionRate}%
                </span>
              </td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="border-t-2 border-gray-300 bg-gray-50 font-semibold">
            <td className="px-4 py-2.5 text-gray-900">합계</td>
            <td className="px-4 py-2.5 text-right tabular-nums">{formatKRW(totals.allocation)}</td>
            <td
              className={`px-4 py-2.5 text-right tabular-nums ${
                totals.adjustment > 0 ? 'text-blue-600' : totals.adjustment < 0 ? 'text-red-600' : 'text-gray-400'
              }`}
            >
              {totals.adjustment !== 0
                ? (totals.adjustment > 0 ? '+' : '') + formatKRW(totals.adjustment)
                : '-'}
            </td>
            <td className="px-4 py-2.5 text-right tabular-nums text-gray-900">
              {formatKRW(totals.afterAllocation)}
            </td>
            <td className="px-4 py-2.5 text-right tabular-nums">
              <div className="flex flex-col items-end gap-0.5">
                <span>{formatKRW(totals.executionComplete + totals.executionPlanned)}</span>
                <span className="text-xs text-gray-400">
                  (<span className="text-complete">{formatKRW(totals.executionComplete)}</span>
                  {' + '}
                  <span className="text-planned">{formatKRW(totals.executionPlanned)}</span>)
                </span>
              </div>
            </td>
            <td className="px-4 py-2.5 text-right tabular-nums">{formatKRW(totals.balance)}</td>
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

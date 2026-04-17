'use client';

import { formatKRW } from '@/lib/utils';
import type { MonthlyCategorySummary } from '@/hooks/useCardManagement';

interface Props {
  summaries: MonthlyCategorySummary[];
  categories: string[];
}

export function CardMonthlyCategoryTable({ summaries, categories }: Props) {
  const currentMonth = new Date().getMonth() + 1; // 1~12

  if (summaries.length === 0) {
    return (
      <div className="flex items-center justify-center py-8 text-sm text-gray-400">
        해당 기간의 카드 집행내역이 없습니다.
      </div>
    );
  }

  const grandTotal = summaries.reduce((s, r) => s + r.total, 0);
  const catTotals: Record<string, number> = {};
  for (const row of summaries) {
    for (const cat of categories) {
      catTotals[cat] = (catTotals[cat] ?? 0) + (row.byCategory[cat] ?? 0);
    }
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-gray-200">
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b border-gray-200 bg-primary text-white">
            <th className="px-3 py-2 text-left font-medium w-14">월</th>
            {categories.map((cat) => (
              <th key={cat} className="px-2 py-2 text-right font-medium whitespace-nowrap">{cat}</th>
            ))}
            <th className="px-3 py-2 text-right font-medium w-24">합계</th>
          </tr>
        </thead>
        <tbody>
          {summaries.map((row, i) => (
            <tr key={row.month} className={`border-b border-gray-100 ${row.month === currentMonth ? 'bg-red-50' : i % 2 === 0 ? 'bg-white' : 'bg-gray-50/40'}`}>
              <td className="px-3 py-1.5 font-medium text-gray-700">{row.monthLabel}</td>
              {categories.map((cat) => (
                <td key={cat} className="px-2 py-1.5 text-right tabular-nums text-gray-600">
                  {row.byCategory[cat] ? formatKRW(row.byCategory[cat]) : '-'}
                </td>
              ))}
              <td className="px-3 py-1.5 text-right tabular-nums font-semibold text-gray-800">
                {formatKRW(row.total)}
              </td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="border-t-2 border-gray-300 bg-gray-100">
            <td className="px-3 py-2 font-semibold text-gray-700">합계</td>
            {categories.map((cat) => (
              <td key={cat} className="px-2 py-2 text-right tabular-nums font-semibold text-gray-700">
                {catTotals[cat] ? formatKRW(catTotals[cat]) : '-'}
              </td>
            ))}
            <td className="px-3 py-2 text-right tabular-nums font-bold text-primary">
              {formatKRW(grandTotal)}
            </td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

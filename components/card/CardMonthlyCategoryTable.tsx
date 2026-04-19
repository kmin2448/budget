'use client';

import { formatKRW, cn } from '@/lib/utils';
import type { MonthlyCategorySummary } from '@/hooks/useCardManagement';

interface Props {
  summaries: MonthlyCategorySummary[];
  categories: string[];
  visibleMonths: Set<number>;
}

export function getThreeMonthSet(currentMonth: number, summaries: MonthlyCategorySummary[]): Set<number> {
  const allMonths = new Set(summaries.map((s) => s.month));
  const prev = currentMonth === 1 ? 12 : currentMonth - 1;
  const next = currentMonth === 12 ? 1 : currentMonth + 1;
  const visible = new Set<number>();
  if (allMonths.has(prev)) visible.add(prev);
  if (allMonths.has(currentMonth)) visible.add(currentMonth);
  if (allMonths.has(next)) visible.add(next);
  return visible;
}

export function CardMonthlyCategoryTable({ summaries, categories, visibleMonths }: Props) {
  const currentMonth = new Date().getMonth() + 1;

  if (summaries.length === 0) {
    return (
      <div className="flex items-center justify-center py-8 text-sm text-gray-400">
        해당 기간의 카드 집행내역이 없습니다.
      </div>
    );
  }

  const isCollapsed = visibleMonths.size === 1 && visibleMonths.has(currentMonth);
  const visibleSummaries = summaries.filter((s) => visibleMonths.has(s.month));

  const grandTotal = visibleSummaries.reduce((s, r) => s + r.total, 0);
  const catTotals: Record<string, number> = {};
  for (const row of visibleSummaries) {
    for (const cat of categories) {
      catTotals[cat] = (catTotals[cat] ?? 0) + (row.byCategory[cat] ?? 0);
    }
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-gray-200">
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b border-gray-200 bg-primary text-white">
            <th className="w-14 px-3 py-2 text-left font-medium">월</th>
            {categories.map((cat) => (
              <th key={cat} className="whitespace-nowrap px-2 py-2 text-right font-medium">
                {cat}
              </th>
            ))}
            <th className="w-24 px-3 py-2 text-right font-medium">합계</th>
          </tr>
        </thead>
        <tbody>
          {summaries.map((row, i) => {
            if (!visibleMonths.has(row.month)) return null;
            const isCurrent = row.month === currentMonth;
            return (
              <tr
                key={row.month}
                className={cn(
                  'border-b border-gray-100',
                  isCurrent ? 'bg-red-50' : i % 2 === 0 ? 'bg-white' : 'bg-gray-50/40',
                )}
              >
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
            );
          })}
        </tbody>
        {!isCollapsed && (
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
        )}
      </table>
    </div>
  );
}

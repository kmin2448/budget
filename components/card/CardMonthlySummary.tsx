'use client';

import { formatKRW } from '@/lib/utils';
import type { CardMonthlySummary } from '@/hooks/useCard';

const MONTH_LABELS = ['1월','2월','3월','4월','5월','6월','7월','8월','9월','10월','11월','12월'];

interface CardMonthlySummaryTableProps {
  summaries: CardMonthlySummary[];
}

export function CardMonthlySummaryTable({ summaries }: CardMonthlySummaryTableProps) {
  const visibleSummaries = summaries.filter((s) => s.total > 0);

  if (visibleSummaries.length === 0) {
    return (
      <div className="flex items-center justify-center py-8 text-gray-400 text-sm">
        집계할 데이터가 없습니다.
      </div>
    );
  }

  // 월별 합계 (전체)
  const monthTotals = Array(12).fill(0) as number[];
  for (const s of visibleSummaries) {
    s.monthly.forEach((v, i) => { monthTotals[i] += v; });
  }
  const grandTotal = monthTotals.reduce((a, b) => a + b, 0);

  return (
    <div className="overflow-x-auto rounded-[2px] border border-gray-200">
      <table className="min-w-full text-xs">
        <thead>
          <tr className="border-b border-gray-200 bg-gray-50 text-left font-medium text-gray-500">
            <th className="px-3 py-2.5 min-w-[140px]">비목</th>
            {MONTH_LABELS.map((m) => (
              <th key={m} className="px-2 py-2.5 text-right whitespace-nowrap">{m}</th>
            ))}
            <th className="px-3 py-2.5 text-right font-semibold">합계</th>
          </tr>
        </thead>
        <tbody>
          {visibleSummaries.map((s, i) => (
            <tr
              key={s.category}
              className={`border-b border-gray-100 hover:bg-gray-50 ${
                i % 2 === 0 ? 'bg-white' : 'bg-row-even'
              }`}
            >
              <td className="px-3 py-2 font-medium text-gray-700 whitespace-nowrap">{s.category}</td>
              {s.monthly.map((v, idx) => (
                <td key={idx} className="px-2 py-2 text-right font-mono text-gray-700">
                  {v > 0 ? formatKRW(v) : '-'}
                </td>
              ))}
              <td className="px-3 py-2 text-right font-mono font-semibold text-gray-900">
                {formatKRW(s.total)}
              </td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="border-t-2 border-gray-200 bg-gray-50 font-semibold">
            <td className="px-3 py-2.5 text-gray-700">월별 합계</td>
            {monthTotals.map((v, idx) => (
              <td key={idx} className="px-2 py-2.5 text-right font-mono text-gray-900">
                {v > 0 ? formatKRW(v) : '-'}
              </td>
            ))}
            <td className="px-3 py-2.5 text-right font-mono text-gray-900">
              {formatKRW(grandTotal)}
            </td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

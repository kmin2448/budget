// components/budget/BudgetDetailTable.tsx
'use client';

import { formatKRW } from '@/lib/utils';
import type { BudgetDetailRow } from '@/types';

interface AggregatedRow {
  subcategory: string;
  subDetail: string;
  allocation: number;
  adjustment: number;
  afterAllocation: number;
  executionComplete: number;
  executionPlanned: number;
  balance: number;
  executionRate: number;
}

interface Props {
  rows: BudgetDetailRow[];
}

export function BudgetDetailTable({ rows }: Props) {
  // (세목, 보조세목) 기준으로 취합
  const aggregatedMap = new Map<string, AggregatedRow>();
  for (const row of rows) {
    const key = `${row.subcategory}||${row.subDetail}`;
    const existing = aggregatedMap.get(key);
    if (existing) {
      existing.allocation      += row.allocation;
      existing.adjustment      += row.adjustment;
      existing.afterAllocation += row.afterAllocation;
      existing.executionComplete += row.executionComplete;
      existing.executionPlanned  += row.executionPlanned;
      existing.balance           += row.balance;
    } else {
      aggregatedMap.set(key, {
        subcategory:       row.subcategory,
        subDetail:         row.subDetail,
        allocation:        row.allocation,
        adjustment:        row.adjustment,
        afterAllocation:   row.afterAllocation,
        executionComplete: row.executionComplete,
        executionPlanned:  row.executionPlanned,
        balance:           row.balance,
        executionRate:     0, // 아래에서 재계산
      });
    }
  }
  const SUBCATEGORY_ORDER = ['인건비', '보전금', '업무추진비', '유형자산', '연구개발비', '운영비', '여비'];
  const subOrder = (s: string) => { const i = SUBCATEGORY_ORDER.indexOf(s); return i === -1 ? SUBCATEGORY_ORDER.length : i; };

  // 취합 후 집행률 재계산 + 세목 지정 순서로 정렬
  const aggregatedRows = Array.from(aggregatedMap.values())
    .map((r) => ({
      ...r,
      executionRate:
        r.afterAllocation > 0
          ? Math.round(((r.executionComplete + r.executionPlanned) / r.afterAllocation) * 1000) / 10
          : 0,
    }))
    .sort((a, b) => subOrder(a.subcategory) - subOrder(b.subcategory));

  const totals = aggregatedRows.reduce(
    (s, r) => ({
      allocation:        s.allocation + r.allocation,
      adjustment:        s.adjustment + r.adjustment,
      afterAllocation:   s.afterAllocation + r.afterAllocation,
      executionComplete: s.executionComplete + r.executionComplete,
      executionPlanned:  s.executionPlanned + r.executionPlanned,
      balance:           s.balance + r.balance,
    }),
    { allocation: 0, adjustment: 0, afterAllocation: 0, executionComplete: 0, executionPlanned: 0, balance: 0 },
  );
  const totalRate =
    totals.afterAllocation > 0
      ? Math.round(((totals.executionComplete + totals.executionPlanned) / totals.afterAllocation) * 1000) / 10
      : 0;

  // 세목 그룹 첫 행 여부
  const firstInGroup = new Set<number>();
  let lastSub = '';
  aggregatedRows.forEach((r, i) => {
    if (r.subcategory !== lastSub) { firstInGroup.add(i); lastSub = r.subcategory; }
  });

  return (
    <div className="overflow-x-auto rounded-lg border border-[#E3E3E0] shadow-soft">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-[#E3E3E0] bg-[#F3F3EE]">
            <th className="w-44 px-4 py-3 text-left font-medium text-text-secondary">세목</th>
            <th className="px-4 py-3 text-left font-medium text-text-secondary">보조세목</th>
            <th className="w-32 px-4 py-3 text-right font-medium text-text-secondary">편성액</th>
            <th className="w-24 px-4 py-3 text-right font-medium text-text-secondary">증감액</th>
            <th className="w-32 px-4 py-3 text-right font-medium text-text-secondary">변경후 편성액</th>
            <th className="w-40 px-4 py-3 text-right font-medium text-text-secondary leading-tight">집행금액<br />(완료+예정)</th>
            <th className="w-28 px-4 py-3 text-right font-medium text-text-secondary">잔액</th>
            <th className="w-20 px-4 py-3 text-right font-medium text-text-secondary">집행률</th>
          </tr>
        </thead>
        <tbody>
          {aggregatedRows.map((row, i) => {
            const isFirst = firstInGroup.has(i);
            return (
              <tr
                key={`${row.subcategory}||${row.subDetail}`}
                className={`border-b border-[#F0F0EE] transition-colors hover:bg-primary-bg/20 ${
                  isFirst && i !== 0 ? 'border-t border-t-[#E3E3E0]' : ''
                } ${i % 2 === 0 ? 'bg-white' : 'bg-[#FAFAF8]'}`}
              >
                <td className="px-4 py-2.5 font-semibold text-primary">
                  {isFirst ? (row.subcategory || '-') : ''}
                </td>
                <td className="px-4 py-2.5 text-xs text-text-secondary">{row.subDetail || '-'}</td>
                <td className="px-4 py-2.5 text-right tabular-nums text-[#131310]">
                  {formatKRW(row.allocation)}
                </td>
                <td className={`px-4 py-2.5 text-right tabular-nums font-medium ${
                  row.adjustment > 0 ? 'text-primary' : row.adjustment < 0 ? 'text-red-500' : 'text-text-secondary'
                }`}>
                  {row.adjustment !== 0
                    ? (row.adjustment > 0 ? '+' : '') + formatKRW(row.adjustment)
                    : '-'}
                </td>
                <td className="px-4 py-2.5 text-right tabular-nums font-semibold text-[#131310]">
                  {formatKRW(row.afterAllocation)}
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
                <td className={`px-4 py-2.5 text-right tabular-nums font-medium ${
                  row.balance < 0 ? 'text-red-500' : 'text-[#131310]'
                }`}>
                  {formatKRW(row.balance)}
                </td>
                <td className="px-4 py-2.5 text-right tabular-nums">
                  <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${
                    row.executionRate >= 90 ? 'bg-green-50 text-complete'
                    : row.executionRate >= 50 ? 'bg-amber-50 text-planned'
                    : 'bg-[#F3F3EE] text-text-secondary'
                  }`}>
                    {row.executionRate}%
                  </span>
                </td>
              </tr>
            );
          })}
        </tbody>
        <tfoot>
          <tr className="border-t border-[#E3E3E0] bg-[#F3F3EE] font-semibold">
            <td className="px-4 py-2.5 text-[#131310]" colSpan={2}>합계</td>
            <td className="px-4 py-2.5 text-right tabular-nums text-[#131310]">{formatKRW(totals.allocation)}</td>
            <td className={`px-4 py-2.5 text-right tabular-nums ${
              totals.adjustment > 0 ? 'text-primary' : totals.adjustment < 0 ? 'text-red-500' : 'text-text-secondary'
            }`}>
              {totals.adjustment !== 0
                ? (totals.adjustment > 0 ? '+' : '') + formatKRW(totals.adjustment)
                : '-'}
            </td>
            <td className="px-4 py-2.5 text-right tabular-nums text-[#131310]">{formatKRW(totals.afterAllocation)}</td>
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

'use client';

import { cn } from '@/lib/utils';
import { formatKRW } from '@/lib/utils';
import type { TransferItem } from '@/types';

interface SummaryRow {
  category: string;
  subcategory: string;
  subDetail: string;
  delta: number; // 양수=증가, 음수=감소
}

interface Props {
  transfers: TransferItem[];
}

export function TransferSummary({ transfers }: Props) {
  if (transfers.length === 0) return null;

  // 보조세목별 집계
  const rowMap = new Map<string, SummaryRow>();

  const addDelta = (
    category: string,
    subcategory: string,
    subDetail: string,
    delta: number,
  ) => {
    const key = `${category}||${subcategory}||${subDetail}`;
    if (!rowMap.has(key)) {
      rowMap.set(key, { category, subcategory, subDetail, delta: 0 });
    }
    rowMap.get(key)!.delta += delta;
  };

  for (const t of transfers) {
    if (!t.fromCategory || !t.toCategory || t.amount === 0) continue;
    addDelta(t.fromCategory, t.fromSubcategory, t.fromSubDetail, -t.amount);
    addDelta(t.toCategory,   t.toSubcategory,   t.toSubDetail,   t.amount);
  }

  const summaryRows = Array.from(rowMap.values()).filter((r) => r.delta !== 0);

  // 비목별 소계
  const catMap = new Map<string, number>();
  for (const r of summaryRows) {
    catMap.set(r.category, (catMap.get(r.category) ?? 0) + r.delta);
  }

  const totalDelta = summaryRows.reduce((s, r) => s + r.delta, 0);

  if (summaryRows.length === 0) return null;

  // 비목별 그룹핑
  const grouped = new Map<string, SummaryRow[]>();
  for (const r of summaryRows) {
    if (!grouped.has(r.category)) grouped.set(r.category, []);
    grouped.get(r.category)!.push(r);
  }

  return (
    <div className="rounded-lg border border-divider bg-white overflow-hidden">
      <div className="border-b border-divider bg-[#F8FAFC] px-4 py-2.5">
        <h3 className="text-sm font-semibold text-[#131310]">
          총 이체 요약 <span className="ml-1 text-text-secondary font-normal">{transfers.filter((t) => t.amount > 0).length}건</span>
        </h3>
      </div>

      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-divider">
            <th className="px-4 py-2 text-left font-medium text-text-secondary">비목</th>
            <th className="px-4 py-2 text-left font-medium text-text-secondary">세목</th>
            <th className="px-4 py-2 text-left font-medium text-text-secondary">보조세목</th>
            <th className="px-4 py-2 text-right font-medium text-text-secondary w-[160px]">증감액</th>
          </tr>
        </thead>
        <tbody>
          {Array.from(grouped.entries()).map(([cat, rows]) => {
            const catDelta = catMap.get(cat) ?? 0;
            return (
              <>
                {rows.map((r, i) => (
                  <tr
                    key={`${r.category}||${r.subcategory}||${r.subDetail}`}
                    className="border-b border-divider last:border-0 hover:bg-[#F8FAFC]"
                  >
                    <td className="px-4 py-2 text-[#131310]">{i === 0 ? r.category : ''}</td>
                    <td className="px-4 py-2 text-[#131310]">{r.subcategory || '—'}</td>
                    <td className="px-4 py-2 text-[#131310]">{r.subDetail || '—'}</td>
                    <td className={cn(
                      'px-4 py-2 text-right tabular-nums font-medium',
                      r.delta > 0 ? 'text-blue-600' : r.delta < 0 ? 'text-red-500' : 'text-text-secondary',
                    )}>
                      {r.delta > 0 ? '+' : ''}{formatKRW(r.delta)}
                    </td>
                  </tr>
                ))}
                {/* 비목 소계 */}
                <tr className="border-b border-divider bg-[#F0F6FC]">
                  <td className="px-4 py-1.5 text-xs text-text-secondary" colSpan={3}>
                    {cat} 소계
                  </td>
                  <td className={cn(
                    'px-4 py-1.5 text-right text-xs tabular-nums font-semibold',
                    catDelta > 0 ? 'text-blue-600' : catDelta < 0 ? 'text-red-500' : 'text-text-secondary',
                  )}>
                    {catDelta > 0 ? '+' : ''}{formatKRW(catDelta)}
                  </td>
                </tr>
              </>
            );
          })}

          {/* 전체 순증감 */}
          <tr className="border-t-2 border-primary/20 bg-primary-bg">
            <td className="px-4 py-2.5 font-semibold text-primary" colSpan={3}>
              전체 순증감
            </td>
            <td className={cn(
              'px-4 py-2.5 text-right tabular-nums font-bold',
              totalDelta === 0
                ? 'text-primary'
                : totalDelta > 0
                  ? 'text-blue-600'
                  : 'text-red-500',
            )}>
              {totalDelta === 0 ? '±0' : `${totalDelta > 0 ? '+' : ''}${formatKRW(totalDelta)}`}
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

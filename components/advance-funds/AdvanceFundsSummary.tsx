'use client';

import { formatKRW } from '@/lib/utils';
import type { AdvanceFundsSummary } from '@/hooks/useAdvanceFunds';

interface Props {
  summary: AdvanceFundsSummary;
}

export function AdvanceFundsSummaryCard({ summary }: Props) {
  const { totalIncome, totalExpense, balance } = summary;

  return (
    <div className="flex flex-wrap gap-3">
      <div className="rounded-lg border border-gray-200 bg-white px-4 py-2.5 shadow-sm">
        <p className="text-xs text-gray-500">총 수입금액</p>
        <p className="mt-0.5 text-base font-bold text-complete">
          {formatKRW(totalIncome)}<span className="ml-0.5 text-xs font-normal text-gray-400">원</span>
        </p>
      </div>
      <div className="rounded-lg border border-gray-200 bg-white px-4 py-2.5 shadow-sm">
        <p className="text-xs text-gray-500">총 지출금액</p>
        <p className="mt-0.5 text-base font-bold text-planned">
          {formatKRW(totalExpense)}<span className="ml-0.5 text-xs font-normal text-gray-400">원</span>
        </p>
      </div>
      <div className="rounded-lg border border-gray-200 bg-white px-4 py-2.5 shadow-sm">
        <p className="text-xs text-gray-500">잔액 (수입 - 지출)</p>
        <p className={`mt-0.5 text-base font-bold ${balance < 0 ? 'text-red-500' : 'text-primary'}`}>
          {formatKRW(balance)}<span className="ml-0.5 text-xs font-normal text-gray-400">원</span>
        </p>
      </div>
    </div>
  );
}

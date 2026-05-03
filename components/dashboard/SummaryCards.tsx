import { formatKRW } from '@/lib/utils';
import type { DashboardSummary } from '@/hooks/useDashboard';
import { CheckCircle, Clock, BarChart2 } from 'lucide-react';

interface SummaryCardsProps {
  summary: DashboardSummary;
}

function AmountTooltip({ label, amount }: { label: string; amount: number }) {
  return (
    <span className="relative group/tip inline-block cursor-default">
      <span className="border-b border-dashed border-current/40 leading-none">{label}</span>
      <span className="pointer-events-none invisible group-hover/tip:visible absolute bottom-full left-1/2 z-50 mb-2 -translate-x-1/2 whitespace-nowrap rounded-md bg-gray-900 px-2.5 py-1.5 text-[11px] font-medium text-white shadow-lg">
        {formatKRW(amount)}원
        <span className="absolute left-1/2 top-full -translate-x-1/2 border-4 border-transparent border-t-gray-900" />
      </span>
    </span>
  );
}

export function SummaryCards({ summary }: SummaryCardsProps) {
  const balanceColor = summary.mainBudgetBalance >= 0 ? 'text-[#131310]' : 'text-red-500';
  const planBalanceColor = summary.balance >= 0 ? 'text-text-secondary' : 'text-red-400';

  return (
    <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">

      {/* ── 1. 총예산 카드 ── */}
      <div className="rounded-[2px] border border-[#E3E3E0] bg-white shadow-soft h-[150px] p-4 flex flex-col gap-2">
        <div className="flex items-center h-[22px]">
          <p className="text-xs font-medium text-text-secondary">총예산</p>
        </div>
        <div className="flex-1 flex flex-col justify-between">
          <div>
            <p className="text-xl font-semibold text-primary">{formatKRW(summary.totalBudget)}</p>
            <p className="text-xs text-text-secondary mt-0.5">총예산(간접비 포함)</p>
          </div>
          <div className="border-t border-divider pt-2 space-y-1">
            <div className="flex items-baseline justify-between gap-2">
              <span className="text-xs text-text-secondary shrink-0">본예산(간접비 제외)</span>
              <span className="text-sm font-medium text-[#131310] tabular-nums text-right">{formatKRW(summary.mainBudget)}</span>
            </div>
            <div className="flex items-baseline justify-between gap-2">
              <span className="text-xs text-text-secondary shrink-0">계획수립예산</span>
              <span className="text-sm font-medium text-[#131310] tabular-nums text-right">{formatKRW(summary.budgetPlanTarget)}</span>
            </div>
          </div>
        </div>
      </div>

      {/* ── 2. 잔액 카드 ── */}
      <div className="rounded-[2px] border border-[#E3E3E0] bg-white shadow-soft h-[150px] p-4 flex flex-col gap-2">
        <div className="flex items-center h-[22px]">
          <p className="text-xs font-medium text-text-secondary">잔액</p>
        </div>
        <div className="flex-1 flex flex-col justify-between">
          <div>
            <p className={`text-xl font-semibold ${balanceColor}`}>
              {formatKRW(summary.mainBudgetBalance)}
            </p>
            <div className="flex items-center gap-1.5 mt-0.5">
              <p className="text-xs text-text-secondary">
                <AmountTooltip label="총예산" amount={summary.totalBudget} />
                {' - ('}
                <AmountTooltip label="집행완료" amount={summary.executionComplete} />
                {' + '}
                <AmountTooltip label="집행예정" amount={summary.executionPlanned} />
                {' + '}
                <AmountTooltip label="간접비" amount={summary.indirectCost} />
                {')'}
              </p>
              <span className="shrink-0 inline-flex items-center gap-0.5 rounded-full bg-[#F3F3EE] px-1.5 py-px text-xs font-medium text-text-secondary">
                <BarChart2 className="h-3 w-3" />
                {(summary.mainBudgetExecutionRate ?? 0).toFixed(1)}%
              </span>
            </div>
          </div>
          <div className="border-t border-divider pt-2">
            <p className={`text-sm font-medium ${planBalanceColor}`}>
              {formatKRW(summary.balance)}
            </p>
            <p className="text-xs text-text-secondary">
              <AmountTooltip label="예산계획" amount={summary.budgetPlan} />
              {' - ('}
              <AmountTooltip label="집행완료" amount={summary.executionComplete} />
              {' + '}
              <AmountTooltip label="집행예정" amount={summary.executionPlanned} />
              {')'}
            </p>
          </div>
        </div>
      </div>

      {/* ── 3. 집행완료 + 집행예정 통합 카드 ── */}
      <div className="rounded-[2px] border border-[#E3E3E0] bg-white shadow-soft h-[150px] p-4 flex flex-col gap-2">
        <p className="text-xs font-medium text-text-secondary">집행 현황</p>
        <div className="flex-1 flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <CheckCircle className="h-4 w-4 text-complete" />
              <span className="text-sm text-text-secondary">집행완료</span>
            </div>
            <div className="text-right">
              <p className="text-lg font-semibold text-complete">{formatKRW(summary.executionComplete)}</p>
              <p className="text-xs text-text-secondary">지출일자 확정 건</p>
            </div>
          </div>
          <div className="border-t border-divider" />
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <Clock className="h-4 w-4 text-planned" />
              <span className="text-sm text-text-secondary">집행예정</span>
            </div>
            <div className="text-right">
              <p className="text-lg font-semibold text-planned">{formatKRW(summary.executionPlanned)}</p>
              <p className="text-xs text-text-secondary">지출일자 미확정 건</p>
            </div>
          </div>
        </div>
      </div>

    </div>
  );
}

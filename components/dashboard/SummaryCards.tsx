import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { formatKRW } from '@/lib/utils';
import type { DashboardSummary } from '@/hooks/useDashboard';
import { CheckCircle, Clock, TrendingUp, BarChart2 } from 'lucide-react';

interface SummaryCardsProps {
  summary: DashboardSummary;
}

export function SummaryCards({ summary }: SummaryCardsProps) {
  const balanceColor = summary.mainBudgetBalance >= 0 ? 'text-gray-800' : 'text-red-600';
  const planBalanceColor = summary.balance >= 0 ? 'text-gray-500' : 'text-red-400';

  return (
    <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">

      {/* ── 1. 총예산 카드 ── */}
      <Card className="border border-gray-100 bg-white shadow-sm ring-0 h-[150px] py-2 gap-2">
        <CardHeader className="p-2 pb-0.5">
          <CardTitle className="text-sm font-medium text-gray-500">총예산</CardTitle>
        </CardHeader>
        <CardContent className="px-3 pb-2">
          <div className="h-[44px] overflow-hidden">
            <p className="text-xl font-bold text-primary">{formatKRW(summary.totalBudget)}</p>
            <p className="text-xs text-gray-400">총예산(간접비 포함)</p>
          </div>
          <div className="border-t border-gray-100 my-0.5" />
          <div className="space-y-0.5">
            <div className="flex items-baseline justify-between">
              <span className="text-xs text-gray-500">본예산(간접비 제외)</span>
              <span className="text-sm font-semibold text-gray-700">{formatKRW(summary.mainBudget)}</span>
            </div>
            <div className="flex items-baseline justify-between">
              <span className="text-xs text-gray-500">계획수립예산</span>
              <span className="text-sm font-semibold text-gray-700">{formatKRW(summary.budgetPlanTarget)}</span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ── 2. 잔액 카드 ── */}
      <Card className="border border-gray-100 bg-white shadow-sm ring-0 h-[150px] py-2 gap-2">
        <CardHeader className="p-2 pb-0.5 flex flex-row items-center justify-between">
          <CardTitle className="text-sm font-medium text-gray-500">잔액</CardTitle>
          <div className="rounded-full p-0.5 bg-gray-50">
            <TrendingUp className={`h-4 w-4 ${balanceColor}`} />
          </div>
        </CardHeader>
        <CardContent className="px-3 pb-2">
          <div className="h-[44px] overflow-hidden">
            <p className={`text-xl font-bold ${balanceColor}`}>
              {formatKRW(summary.mainBudgetBalance)}
            </p>
            <div className="flex items-center gap-1.5">
              <p className="text-xs text-gray-400 truncate">총예산 - (집행완료 + 집행예정 + 간접비)</p>
              <span className="shrink-0 inline-flex items-center gap-0.5 rounded bg-gray-100 px-1.5 py-0.5 text-xs font-medium text-gray-600">
                <BarChart2 className="h-3 w-3" />
                {(summary.mainBudgetExecutionRate ?? 0).toFixed(1)}%
              </span>
            </div>
          </div>
          <div className="border-t border-gray-100 my-0.5" />
          <div>
            <p className={`text-sm font-semibold ${planBalanceColor}`}>
              {formatKRW(summary.balance)}
            </p>
            <p className="text-xs text-gray-400">예산계획 - 집행완료 - 집행예정</p>
          </div>
        </CardContent>
      </Card>

      {/* ── 3. 집행완료 + 집행예정 통합 카드 ── */}
      <Card className="border border-gray-100 bg-white shadow-sm ring-0 h-[150px] py-2 gap-2">
        <CardHeader className="p-2 pb-0.5">
          <CardTitle className="text-sm font-medium text-gray-500">집행 현황</CardTitle>
        </CardHeader>
        <CardContent className="px-3 pb-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <CheckCircle className="h-4 w-4 text-complete" />
              <span className="text-sm text-gray-500">집행완료</span>
            </div>
            <div className="text-right">
              <p className="text-lg font-bold text-complete">{formatKRW(summary.executionComplete)}</p>
              <p className="text-xs text-gray-400">지출일자 확정 건</p>
            </div>
          </div>
          <div className="border-t border-gray-100 my-0.5" />
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <Clock className="h-4 w-4 text-planned" />
              <span className="text-sm text-gray-500">집행예정</span>
            </div>
            <div className="text-right">
              <p className="text-lg font-bold text-planned">{formatKRW(summary.executionPlanned)}</p>
              <p className="text-xs text-gray-400">지출일자 미확정 건</p>
            </div>
          </div>
        </CardContent>
      </Card>

    </div>
  );
}

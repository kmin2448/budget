'use client';

import { formatKRW } from '@/lib/utils';
import type { WeMeetTeamSummary } from '@/types';

interface Props {
  summaries: WeMeetTeamSummary[];
  selectedTeam: string | null;
  onSelectTeam: (team: string | null) => void;
}

export function WeMeetSummaryCards({ summaries, selectedTeam, onSelectTeam }: Props) {
  if (summaries.length === 0) {
    return (
      <div className="rounded-lg border border-[#E3E3E0] bg-white px-4 py-6 text-center text-sm text-gray-400">
        팀 데이터가 없습니다.
      </div>
    );
  }

  return (
    <div className="overflow-x-auto pb-1">
      <div className="flex gap-3" style={{ minWidth: 'max-content' }}>
        {summaries.map((s) => {
          const isSelected = selectedTeam === s.teamName;
          const isOver = s.confirmedBalance < 0;
          const isWarn = s.expectedBalance < 0 && s.confirmedBalance >= 0;

          return (
            <button
              key={s.teamName}
              onClick={() => onSelectTeam(isSelected ? null : s.teamName)}
              className={[
                'flex w-44 flex-col gap-1.5 rounded-xl border p-3 text-left transition-all',
                isSelected
                  ? 'border-primary bg-primary-bg shadow-sm'
                  : 'border-[#E3E3E0] bg-white hover:border-primary/40 hover:bg-[#F5F9FC]',
              ].join(' ')}
            >
              <span className={['truncate text-xs font-semibold', isSelected ? 'text-primary' : 'text-[#131310]'].join(' ')}>
                {s.teamName}
              </span>

              <div className="flex flex-col gap-0.5">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] text-gray-400">확정</span>
                  <span className="text-xs font-medium text-[#131310]">
                    {formatKRW(s.confirmed.total)}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[10px] text-gray-400">확정잔액</span>
                  <span className={['text-xs font-semibold', isOver ? 'text-red-500' : 'text-complete'].join(' ')}>
                    {formatKRW(s.confirmedBalance)}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[10px] text-gray-400">예정잔액</span>
                  <span className={['text-xs', isWarn ? 'text-amber-500' : 'text-gray-500'].join(' ')}>
                    {formatKRW(s.expectedBalance)}
                  </span>
                </div>
              </div>

              {/* 예산 소진율 바 */}
              <div className="mt-0.5 h-1 w-full overflow-hidden rounded-full bg-gray-100">
                <div
                  className={['h-full rounded-full transition-all', isOver ? 'bg-red-400' : 'bg-primary'].join(' ')}
                  style={{
                    width: s.totalBudget > 0
                      ? `${Math.min(100, (s.confirmed.total / s.totalBudget) * 100)}%`
                      : '0%',
                  }}
                />
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

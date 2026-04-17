// components/expenditure/ExpenditureSummary.tsx
import { formatKRW } from '@/lib/utils';
import { cn } from '@/lib/utils';
import type { ExpenditureBudgetInfo } from '@/types';
import { CATEGORY_SHEETS } from '@/constants/sheets';

// primary #1F5C99 at 15% opacity
const SUMMARY_BG = 'rgba(31, 92, 153, 0.15)';
const DIVIDER_COLOR = 'rgba(255, 255, 255, 0.35)';
const DOT_COLOR = 'rgba(255, 255, 255, 0.55)';
const LABEL_COLOR = 'rgba(20, 30, 50, 0.72)';

interface ExpenditureSummaryProps {
  budgetInfo: ExpenditureBudgetInfo;
  activeCategory: string;
}

export function ExpenditureSummary({ budgetInfo, activeCategory }: ExpenditureSummaryProps) {
  const { allocation, executionComplete, executionPlanned, balance } = budgetInfo;
  const executionRate = budgetInfo.executionRate ?? 0;

  const items = [
    { label: '배정예산', value: formatKRW(allocation),          cls: 'text-gray-900' },
    { label: '집행완료', value: formatKRW(executionComplete),   cls: 'text-complete' },
    { label: '집행예정', value: formatKRW(executionPlanned),    cls: 'text-planned'  },
    { label: '잔액',     value: formatKRW(balance),             cls: balance < 0 ? 'text-red-400' : 'text-gray-900' },
    { label: '집행률',   value: `${executionRate.toFixed(1)}%`, cls: executionRate > 100 ? 'text-red-400' : 'text-gray-900' },
  ];

  // 역삼각형 위치: 선택된 탭의 중앙
  const totalTabs = CATEGORY_SHEETS.length;
  const activeIndex = CATEGORY_SHEETS.indexOf(activeCategory as typeof CATEGORY_SHEETS[number]);
  const safeIndex = activeIndex < 0 ? 0 : activeIndex;
  const arrowLeft = `calc(${((safeIndex + 0.5) / totalTabs) * 100}% - 10px)`;

  return (
    <div>
      {/* 정삼각형(▲) — 꼭지점이 탭 바로 아래에 닿도록, 카드와 동일 색상 */}
      <div className="relative h-[10px] overflow-visible">
        <div
          style={{
            position: 'absolute',
            left: arrowLeft,
            top: 0,
            width: 0,
            height: 0,
            borderLeft: '10px solid transparent',
            borderRight: '10px solid transparent',
            borderBottom: `10px solid ${SUMMARY_BG}`,
          }}
        />
      </div>

      {/* 집행 요약 카드 */}
      <div
        className="flex items-center rounded-md px-3 py-1.5"
        style={{ backgroundColor: SUMMARY_BG }}
      >
        {items.map(({ label, value, cls }, i) => (
          <div key={label} className="flex items-center">
            {/* 구분선 (첫 항목 제외) */}
            {i > 0 && (
              <div
                className="mx-3 h-3.5 w-px shrink-0"
                style={{ backgroundColor: DIVIDER_COLOR }}
              />
            )}
            <div className="flex items-center gap-1.5">
              <span className="text-[5px] leading-none font-bold" style={{ color: DOT_COLOR }}>●</span>
              <span className="text-[11px] font-bold shrink-0" style={{ color: LABEL_COLOR }}>{label}</span>
              <span className={cn('text-xs font-bold tabular-nums', cls)}>{value}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

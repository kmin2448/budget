// components/budget/BudgetIntegratedTable.tsx
'use client';

import { Button } from '@/components/ui/button';
import { formatKRW, parseKRW } from '@/lib/utils';
import { cn } from '@/lib/utils';
import { useSidebar } from '@/components/layout/SidebarContext';
import type { BudgetDetailRow, BudgetCategoryRow } from '@/types';

interface Props {
  rows: BudgetDetailRow[];
  categoryRows: BudgetCategoryRow[];
  edits: Record<number, string>;
  onEditChange: (rowOffset: number, raw: string) => void;
  canWrite: boolean;
  isSaving: boolean;
  onOpenConfirm: () => void;
}

export function BudgetIntegratedTable({
  rows,
  categoryRows,
  edits,
  onEditChange,
  canWrite,
  isSaving,
  onOpenConfirm,
}: Props) {
  const handleChange = (rowOffset: number, raw: string) => {
    const cleaned = raw.replace(/[^0-9,\-]/g, '');
    onEditChange(rowOffset, cleaned);
  };

  // 미리보기 계산
  const previewRows: BudgetDetailRow[] = rows.map((r) => {
    const raw   = edits[r.rowOffset] ?? '';
    const adj   = raw === '' ? 0 : parseKRW(raw);
    const after = r.allocation + adj;
    return {
      ...r,
      adjustment:       adj,
      afterAllocation:  after,
      balance:          after - r.executionComplete - r.executionPlanned,
      executionRate:
        after > 0
          ? Math.round(((r.executionComplete + r.executionPlanned) / after) * 1000) / 10
          : 0,
    };
  });

  const changedAdjustments = previewRows
    .filter((r) => {
      const orig = rows.find((o) => o.rowOffset === r.rowOffset);
      return r.adjustment !== (orig?.adjustment ?? 0);
    })
    .map((r) => ({ rowOffset: r.rowOffset, value: r.adjustment }));

  const hasChanges = changedAdjustments.length > 0;

  // 비목별 그룹화
  const grouped = previewRows.reduce<Record<string, BudgetDetailRow[]>>((acc, row) => {
    if (!acc[row.category]) acc[row.category] = [];
    acc[row.category].push(row);
    return acc;
  }, {});

  // 비목별 집계 (미리보기)
  const previewCategories: BudgetCategoryRow[] = categoryRows.map((catRow) => {
    const catDetail = previewRows.filter((r) => r.category === catRow.category);
    const adjustment = catDetail.reduce((s, r) => s + r.adjustment, 0);
    const afterAllocation = catRow.allocation + adjustment;
    return {
      ...catRow,
      adjustment,
      afterAllocation,
      balance: afterAllocation - catRow.executionComplete - catRow.executionPlanned,
    };
  });

  const totals = previewCategories.reduce(
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

  const { collapsed } = useSidebar();

  let globalIdx = 0;

  return (
    <div className="space-y-3">
      {/* 안내 + 변경확정 버튼 */}
      {canWrite && (
        <div className="flex items-center justify-between rounded-lg border border-amber-200 bg-amber-50 px-4 py-2.5 text-sm text-amber-800">
          <span>증감액 열에 금액을 입력하세요 (양수=증액, 음수=감액). 변경확정 시 이력이 기록됩니다.</span>
          <Button
            size="sm"
            disabled={!hasChanges || isSaving}
            onClick={() => onOpenConfirm()}
            className="ml-4 shrink-0 bg-primary text-white hover:bg-primary-light"
          >
            {isSaving ? '저장 중…' : '변경 확정'}
          </Button>
        </div>
      )}

      <div className="rounded-lg border border-[#E3E3E0] shadow-soft">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-[#E3E3E0] bg-[#F3F3EE]">
              <th className={cn('px-2 py-3 text-left font-medium text-text-secondary', collapsed ? 'whitespace-nowrap' : 'w-[12%]')}>비목</th>
              <th className="w-[11%] px-2 py-3 text-left font-medium text-text-secondary">세목</th>
              <th className="w-[13%] px-2 py-3 text-left font-medium text-text-secondary">보조세목</th>
              <th className="w-[10%] px-2 py-3 text-right font-medium text-text-secondary whitespace-nowrap">편성액</th>
              <th className="w-[9%] px-2 py-3 text-right font-medium text-text-secondary leading-tight">증감액{canWrite && <><br /><span className="font-normal text-[10px] opacity-70">입력</span></>}</th>
              <th className="w-[10%] px-2 py-3 text-right font-medium text-text-secondary leading-tight">변경후<br />편성액</th>
              <th className="w-[16%] px-2 py-3 text-right font-medium text-text-secondary leading-tight">집행금액<br />(완료+예정)</th>
              <th className="w-[10%] px-2 py-3 text-right font-medium text-text-secondary whitespace-nowrap">잔액</th>
              <th className="w-[7%] px-2 py-3 text-right font-medium text-text-secondary whitespace-nowrap">집행률</th>
            </tr>
          </thead>
          <tbody>
            {Object.entries(grouped).map(([category, catRows]) => {
              const catAlloc = catRows.reduce((s, r) => s + r.allocation, 0);
              const catAfter = catRows.reduce((s, r) => s + r.afterAllocation, 0);
              const catAdj   = catAfter - catAlloc;
              const isFirstCat = globalIdx === 0;

              return catRows.map((row, i) => {
                const isFirstOfCat = i === 0;
                // 세목 그룹 첫 행 여부
                const isFirstOfSub = i === 0 || catRows[i - 1].subcategory !== row.subcategory;
                const origAdj = rows.find((o) => o.rowOffset === row.rowOffset)?.adjustment ?? 0;
                const currentVal = edits[row.rowOffset] ?? '';
                const parsedVal  = currentVal === '' ? 0 : parseKRW(currentVal);
                const isChanged  = parsedVal !== origAdj;
                const rowBg      = globalIdx++ % 2 === 0 ? 'bg-white' : 'bg-[#FAFAF8]';

                return (
                  <tr
                    key={row.rowOffset}
                    className={cn(
                      'border-b border-[#F0F0EE] transition-colors hover:bg-primary-bg/20',
                      isFirstOfCat && !isFirstCat ? 'border-t border-t-[#E3E3E0]' : '',
                      !isFirstOfCat && isFirstOfSub ? 'border-t border-t-[#F0F0EE]' : '',
                      isChanged ? 'bg-[#E8F4F5] hover:bg-[#D6EEF1]' : rowBg,
                    )}
                  >
                    {/* 비목 — 비목 그룹 첫 행에만 */}
                    <td className={cn('px-2 py-2 align-middle font-semibold text-primary', collapsed && 'whitespace-nowrap')}>
                      {isFirstOfCat ? (
                        <div className="flex flex-col gap-0.5">
                          <span>{category}</span>
                          {catAdj !== 0 && (
                            <span className={cn('text-[10px] font-normal', catAdj > 0 ? 'text-blue-500' : 'text-red-500')}>
                              {catAdj > 0 ? '+' : ''}{formatKRW(catAdj)}
                            </span>
                          )}
                        </div>
                      ) : ''}
                    </td>

                    {/* 세목 — 세목 그룹 첫 행에만 */}
                    <td className="px-2 py-2 text-text-secondary">{isFirstOfSub ? (row.subcategory || '-') : ''}</td>
                    <td className="px-2 py-2 text-text-secondary">{row.subDetail || '-'}</td>
                    <td className="px-2 py-2 text-right tabular-nums text-[#131310] whitespace-nowrap">
                      {formatKRW(row.allocation)}
                    </td>

                    {/* 증감액 입력(canWrite) / 표시(!canWrite) */}
                    {canWrite ? (
                      <td className="px-1.5 py-1.5">
                        <input
                          type="text"
                          value={currentVal}
                          onChange={(e) => handleChange(row.rowOffset, e.target.value)}
                          placeholder="0"
                          className={cn(
                            'w-full rounded border px-1.5 py-1 text-right tabular-nums text-xs outline-none focus:ring-2 focus:ring-primary/40',
                            isChanged ? 'border-primary bg-white' : 'border-[#E3E3E0] bg-[#F3F3EE]',
                          )}
                        />
                      </td>
                    ) : (
                      <td className={cn(
                        'px-2 py-2 text-right tabular-nums whitespace-nowrap',
                        row.adjustment > 0 ? 'text-primary' : row.adjustment < 0 ? 'text-red-500' : 'text-text-secondary',
                      )}>
                        {row.adjustment !== 0 ? (row.adjustment > 0 ? '+' : '') + formatKRW(row.adjustment) : '-'}
                      </td>
                    )}

                    <td className={cn(
                      'px-2 py-2 text-right tabular-nums font-semibold whitespace-nowrap',
                      isChanged ? 'text-primary' : 'text-[#131310]',
                    )}>
                      {formatKRW(row.afterAllocation)}
                    </td>
                    <td className="px-2 py-2 text-right tabular-nums">
                      <div className="flex flex-col items-end gap-0.5">
                        <span className="font-medium text-[#131310] whitespace-nowrap">
                          {formatKRW(row.executionComplete + row.executionPlanned)}
                        </span>
                        <span className="text-[10px] text-text-secondary whitespace-nowrap">
                          (<span className="text-complete">{formatKRW(row.executionComplete)}</span>
                          {' + '}
                          <span className="text-planned">{formatKRW(row.executionPlanned)}</span>)
                        </span>
                      </div>
                    </td>
                    <td className={cn(
                      'px-2 py-2 text-right tabular-nums font-medium whitespace-nowrap',
                      row.balance < 0 ? 'text-red-500' : 'text-[#131310]',
                    )}>
                      {formatKRW(row.balance)}
                    </td>
                    <td className="px-2 py-2 text-right tabular-nums">
                      <span className={cn(
                        'inline-block rounded-full px-1.5 py-0.5 text-[10px] font-semibold',
                        row.executionRate >= 90 ? 'bg-green-50 text-complete'
                        : row.executionRate >= 50 ? 'bg-amber-50 text-planned'
                        : 'bg-[#F3F3EE] text-text-secondary',
                      )}>
                        {row.executionRate}%
                      </span>
                    </td>
                  </tr>
                );
              });
            })}
          </tbody>
          <tfoot>
            <tr className="border-t border-[#E3E3E0] bg-[#F3F3EE] font-semibold">
              <td className="px-2 py-2.5 text-[#131310]" colSpan={3}>합계</td>
              <td className="px-2 py-2.5 text-right tabular-nums text-[#131310] whitespace-nowrap">{formatKRW(totals.allocation)}</td>
              <td className={cn(
                'px-2 py-2.5 text-right tabular-nums whitespace-nowrap font-semibold',
                totals.adjustment > 0 ? 'text-primary' : totals.adjustment < 0 ? 'text-red-500' : 'text-text-secondary',
              )}>
                {totals.adjustment !== 0 ? (totals.adjustment > 0 ? '+' : '') + formatKRW(totals.adjustment) : '-'}
              </td>
              <td className="px-2 py-2.5 text-right tabular-nums text-[#131310] whitespace-nowrap">{formatKRW(totals.afterAllocation)}</td>
              <td className="px-2 py-2.5 text-right tabular-nums">
                <div className="flex flex-col items-end gap-0.5">
                  <span className="whitespace-nowrap text-[#131310]">{formatKRW(totals.executionComplete + totals.executionPlanned)}</span>
                  <span className="text-[10px] text-text-secondary whitespace-nowrap">
                    (<span className="text-complete">{formatKRW(totals.executionComplete)}</span>
                    {' + '}
                    <span className="text-planned">{formatKRW(totals.executionPlanned)}</span>)
                  </span>
                </div>
              </td>
              <td className="px-2 py-2.5 text-right tabular-nums whitespace-nowrap">{formatKRW(totals.balance)}</td>
              <td className="px-2 py-2.5 text-right tabular-nums">
                {(() => {
                  const rate = totals.afterAllocation > 0
                    ? Math.round(((totals.executionComplete + totals.executionPlanned) / totals.afterAllocation) * 1000) / 10
                    : 0;
                  return (
                    <span className="inline-block rounded-full bg-primary-bg px-1.5 py-0.5 text-[10px] font-semibold text-primary">
                      {rate}%
                    </span>
                  );
                })()}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>

      {/* 변경 미리보기 */}
      {hasChanges && (
        <div className="rounded-lg border border-[#E3E3E0] bg-[#E8F4F5] p-4">
          <h3 className="mb-3 text-sm font-semibold text-primary">변경 미리보기 (비목별 합계)</h3>
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-[#C5DFE3] text-primary">
                <th className="py-1 text-left">비목</th>
                <th className="py-1 text-right">현재 편성액</th>
                <th className="py-1 text-right">증감액</th>
                <th className="py-1 text-right">변경후 편성액</th>
                <th className="py-1 text-right">잔액</th>
              </tr>
            </thead>
            <tbody>
              {previewCategories.filter((r) => r.adjustment !== 0).map((r) => (
                <tr key={r.category} className="border-b border-[#C5DFE3]">
                  <td className="py-1 font-medium text-[#131310]">{r.category}</td>
                  <td className="py-1 text-right tabular-nums text-text-secondary">{formatKRW(r.allocation)}</td>
                  <td className={`py-1 text-right tabular-nums font-semibold ${r.adjustment > 0 ? 'text-primary' : 'text-red-500'}`}>
                    {r.adjustment > 0 ? '+' : ''}{formatKRW(r.adjustment)}
                  </td>
                  <td className="py-1 text-right tabular-nums font-semibold text-[#131310]">{formatKRW(r.afterAllocation)}</td>
                  <td className={`py-1 text-right tabular-nums ${r.balance < 0 ? 'text-red-500' : 'text-[#131310]'}`}>
                    {formatKRW(r.balance)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

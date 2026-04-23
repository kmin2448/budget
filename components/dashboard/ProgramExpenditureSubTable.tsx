'use client';

import { useRef, useState } from 'react';
import Link from 'next/link';
import { useExpenditure, useUpdateExpenditureRow } from '@/hooks/useExpenditure';
import { formatKRW, parseKRW, cn } from '@/lib/utils';
import { MONTH_COLUMNS, PERSONNEL_CATEGORY } from '@/constants/sheets';
import type { ExpenditureDetailRow } from '@/types';
import { Loader2, ArrowUpRight } from 'lucide-react';

interface Props {
  programName: string;
  budget: string;
  isLoggedIn: boolean;
}

type EditState =
  | { rowIndex: number; field: 'description' | 'expenseDate'; value: string; originalRow: ExpenditureDetailRow }
  | { rowIndex: number; field: 'month'; monthIdx: number; value: string; originalRow: ExpenditureDetailRow };

export function ProgramExpenditureSubTable({ programName, budget, isLoggedIn }: Props) {
  const { data, isLoading, isError } = useExpenditure(budget);
  const updateRow = useUpdateExpenditureRow(budget);
  const [editState, setEditState] = useState<EditState | null>(null);
  const committedRef = useRef(false);
  const isPersonnel = budget === PERSONNEL_CATEGORY;

  if (!budget) {
    return (
      <p className="text-xs text-gray-400 py-1">비목이 지정되지 않아 집행내역을 불러올 수 없습니다.</p>
    );
  }

  if (isLoading) {
    return (
      <div className="flex items-center gap-1.5 text-xs text-gray-400 py-1">
        <Loader2 className="h-3 w-3 animate-spin" />
        집행내역 불러오는 중...
      </div>
    );
  }

  if (isError) {
    return <p className="text-xs text-red-400 py-1">집행내역을 불러오지 못했습니다.</p>;
  }

  const rows = (data?.rows ?? []).filter((r) => r.programName === programName);

  if (rows.length === 0) {
    return <p className="text-xs text-gray-400 py-1 italic">이 프로그램의 집행내역이 없습니다.</p>;
  }

  function startEdit(state: EditState) {
    committedRef.current = false;
    setEditState(state);
  }

  async function saveEdit() {
    if (!editState || committedRef.current) return;
    committedRef.current = true;
    const { originalRow } = editState;
    const current = editState;
    setEditState(null);

    if (current.field === 'month') {
      const newAmount = parseKRW(current.value);
      if (newAmount === originalRow.monthlyAmounts[current.monthIdx]) return;
      const newMonthlyAmounts = [...originalRow.monthlyAmounts];
      newMonthlyAmounts[current.monthIdx] = newAmount;
      await updateRow.mutateAsync({
        rowIndex: originalRow.rowIndex,
        programName: originalRow.programName,
        expenseDate: originalRow.expenseDate,
        description: originalRow.description,
        monthlyAmounts: newMonthlyAmounts,
      });
    } else {
      const newValue = current.value.trim();
      const oldValue = (originalRow[current.field] as string) ?? '';
      if (newValue === oldValue) return;
      await updateRow.mutateAsync({
        rowIndex: originalRow.rowIndex,
        programName: originalRow.programName,
        expenseDate: current.field === 'expenseDate' ? newValue : originalRow.expenseDate,
        description: current.field === 'description' ? newValue : originalRow.description,
        monthlyAmounts: originalRow.monthlyAmounts,
      });
    }
  }

  function cancelEdit() {
    committedRef.current = true;
    setEditState(null);
  }

  function makeKeyHandler(onSave: () => void) {
    return (e: React.KeyboardEvent) => {
      if (e.key === 'Enter') { e.preventDefault(); onSave(); }
      if (e.key === 'Escape') cancelEdit();
    };
  }

  const inputCls =
    'w-full rounded border border-primary/40 bg-white px-1.5 py-0.5 text-xs outline-none focus:border-primary';

  return (
    <div className="overflow-x-auto rounded border border-[#E3E3E0] bg-[#FAFAF8]">
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b border-[#E3E3E0] bg-[#F3F3EE]">
            <th className="px-2 py-1.5 text-left font-medium text-text-secondary w-12">상태</th>
            <th className="px-2 py-1.5 text-left font-medium text-text-secondary w-24">지출일자</th>
            <th className="px-2 py-1.5 text-left font-medium text-text-secondary">지출건명</th>
            {!isPersonnel && (
              <th className="px-2 py-1.5 text-left font-medium text-text-secondary">월별 금액</th>
            )}
            <th className="px-2 py-1.5 text-right font-medium text-text-secondary w-24">합계</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const activeMonths = Array.from({ length: 12 }, (_, i) => ({
              label: MONTH_COLUMNS[i],
              idx: i,
              amount: row.monthlyAmounts[i],
            })).filter((m) => m.amount > 0);

            const isEditingDate =
              editState?.rowIndex === row.rowIndex && editState.field === 'expenseDate';
            const isEditingDesc =
              editState?.rowIndex === row.rowIndex && editState.field === 'description';

            return (
              <tr
                key={row.rowIndex}
                className="border-b border-[#E3E3E0] last:border-0 hover:bg-white transition-colors"
              >
                {/* 상태 배지 */}
                <td className="px-2 py-1.5 align-top">
                  <span
                    className={cn(
                      'inline-block rounded-full px-1.5 py-0.5 text-[10px] font-medium',
                      row.status === 'complete'
                        ? 'bg-green-100 text-green-700'
                        : 'bg-amber-100 text-amber-700',
                    )}
                  >
                    {row.status === 'complete' ? '완료' : '예정'}
                  </span>
                </td>

                {/* 지출일자 */}
                <td className="px-2 py-1.5 align-top">
                  {isEditingDate ? (
                    <input
                      autoFocus
                      type="date"
                      value={editState!.value}
                      onChange={(e) =>
                        setEditState((prev) => prev ? { ...prev, value: e.target.value } : null)
                      }
                      onBlur={() => void saveEdit()}
                      onKeyDown={makeKeyHandler(() => void saveEdit())}
                      className={inputCls}
                    />
                  ) : (
                    <span
                      className={cn(
                        'block rounded px-1 py-0.5 leading-none text-gray-600',
                        isLoggedIn && 'cursor-text hover:bg-amber-50/60',
                      )}
                      onDoubleClick={
                        isLoggedIn
                          ? () => startEdit({ rowIndex: row.rowIndex, field: 'expenseDate', value: row.expenseDate ?? '', originalRow: row })
                          : undefined
                      }
                    >
                      {row.expenseDate || <span className="text-gray-300">미입력</span>}
                    </span>
                  )}
                </td>

                {/* 지출건명 */}
                <td className="px-2 py-1.5 align-top">
                  <div className="flex items-center gap-1 min-w-0">
                    {isEditingDesc ? (
                      <input
                        autoFocus
                        type="text"
                        value={editState!.value}
                        onChange={(e) =>
                          setEditState((prev) => prev ? { ...prev, value: e.target.value } : null)
                        }
                        onBlur={() => void saveEdit()}
                        onKeyDown={makeKeyHandler(() => void saveEdit())}
                        className={cn(inputCls, 'flex-1 min-w-0')}
                      />
                    ) : (
                      <span
                        className={cn(
                          'flex-1 min-w-0 block rounded px-1 py-0.5 leading-none text-gray-800 truncate',
                          isLoggedIn && 'cursor-text hover:bg-amber-50/60',
                        )}
                        onDoubleClick={
                          isLoggedIn
                            ? () => startEdit({ rowIndex: row.rowIndex, field: 'description', value: row.description ?? '', originalRow: row })
                            : undefined
                        }
                      >
                        {row.description || <span className="text-gray-300">—</span>}
                      </span>
                    )}
                    {/* 바로가기 버튼 */}
                    <Link
                      href={`/expenditure/${encodeURIComponent(budget)}?rowIndex=${row.rowIndex}`}
                      title="비목별 집행내역에서 이 건 보기"
                      className="shrink-0 rounded p-0.5 text-gray-300 hover:bg-primary/10 hover:text-primary transition-colors"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <ArrowUpRight className="h-3.5 w-3.5" />
                    </Link>
                  </div>
                </td>

                {/* 월별 금액 태그 (인건비 제외) */}
                {!isPersonnel && (
                  <td className="px-2 py-1.5 align-top">
                    <div className="flex flex-wrap gap-1">
                      {activeMonths.length === 0 && (
                        <span className="text-gray-300">—</span>
                      )}
                      {activeMonths.map(({ label, idx, amount }) => {
                        const isEditingMonth =
                          editState?.rowIndex === row.rowIndex &&
                          editState.field === 'month' &&
                          (editState as { monthIdx: number }).monthIdx === idx;

                        if (isEditingMonth) {
                          return (
                            <input
                              key={idx}
                              autoFocus
                              type="text"
                              value={editState!.value}
                              onChange={(e) =>
                                setEditState((prev) => prev ? { ...prev, value: e.target.value } : null)
                              }
                              onBlur={() => void saveEdit()}
                              onKeyDown={makeKeyHandler(() => void saveEdit())}
                              className="w-28 rounded border border-primary/40 bg-white px-1.5 py-0.5 text-xs text-right outline-none focus:border-primary"
                            />
                          );
                        }

                        return (
                          <span
                            key={idx}
                            title={isLoggedIn ? '더블클릭하여 금액 수정' : undefined}
                            onDoubleClick={
                              isLoggedIn
                                ? () => startEdit({
                                    rowIndex: row.rowIndex,
                                    field: 'month',
                                    monthIdx: idx,
                                    value: formatKRW(amount),
                                    originalRow: row,
                                  })
                                : undefined
                            }
                            className={cn(
                              'inline-flex items-center gap-0.5 rounded px-1.5 py-0.5 text-[10px] leading-none',
                              row.status === 'complete'
                                ? 'bg-green-50 text-green-700'
                                : 'bg-amber-50 text-amber-700',
                              isLoggedIn && 'cursor-text hover:opacity-70',
                            )}
                          >
                            <span className="font-medium">{label}</span>
                            <span className="tabular-nums">{formatKRW(amount)}</span>
                          </span>
                        );
                      })}
                    </div>
                  </td>
                )}

                {/* 합계 */}
                <td className="px-2 py-1.5 text-right align-top tabular-nums">
                  <span
                    className={cn(
                      'font-medium',
                      row.status === 'complete' ? 'text-complete' : 'text-planned',
                    )}
                  >
                    {formatKRW(row.totalAmount)}
                  </span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      {isLoggedIn && (
        <p className="px-2 py-1 text-[10px] text-gray-400 border-t border-[#E3E3E0]">
          더블클릭 → 수정 · Enter 또는 바깥 클릭 시 자동 저장
        </p>
      )}
    </div>
  );
}

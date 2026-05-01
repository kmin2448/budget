// components/budget/BudgetAdjustmentEditor.tsx
// 예산변경 탭: 세목별 증감액 입력 + 미리보기
'use client';

import { useState, useCallback, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { KRWInput } from '@/components/ui/krw-input';
import { formatKRW, parseKRW } from '@/lib/utils';
import type { BudgetDetailRow, BudgetCategoryRow } from '@/types';

interface AdjWarningDialogProps {
  totalAdj: number;
  onCancel: () => void;
  onProceed: () => void;
}

function AdjWarningDialog({ totalAdj, onCancel, onProceed }: AdjWarningDialogProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-sm rounded-xl bg-white shadow-2xl">
        <div className="flex items-center gap-3 border-b px-5 py-4">
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-amber-100 text-amber-600 text-lg font-bold">!</span>
          <h2 className="text-base font-bold text-gray-900">증감액 합계 불일치</h2>
        </div>
        <div className="px-5 py-5 space-y-3 text-sm text-gray-700">
          <p>
            현재 증감액 합계가{' '}
            <span className={`font-semibold ${totalAdj > 0 ? 'text-blue-600' : 'text-red-600'}`}>
              {totalAdj > 0 ? '+' : ''}{formatKRW(totalAdj)}원
            </span>
            으로 <span className="font-semibold text-red-600">0이 아닙니다.</span>
          </p>
          <p className="text-gray-500 text-xs leading-relaxed">
            증감액 합계가 0이 아니면 전체 예산 총액이 변동됩니다.
            입력값을 다시 확인하거나, 그래도 확정하려면 아래 버튼을 누르세요.
          </p>
        </div>
        <div className="flex justify-end gap-2 border-t px-5 py-4">
          <Button variant="outline" size="sm" onClick={onCancel}>
            취소 (다시 확인)
          </Button>
          <Button
            size="sm"
            onClick={onProceed}
            className="bg-amber-500 text-white hover:bg-amber-600"
          >
            그래도 확정
          </Button>
        </div>
      </div>
    </div>
  );
}

interface Props {
  detailRows: BudgetDetailRow[];
  categoryRows: BudgetCategoryRow[];
  isSaving: boolean;
  onSave: (adjustments: { rowOffset: number; value: number }[]) => void;
  onConfirm: (adjustments: { rowOffset: number; value: number }[]) => void;
}

export function BudgetAdjustmentEditor({
  detailRows,
  categoryRows,
  isSaving,
  onSave,
  onConfirm,
}: Props) {
  // 증감액 편집 상태: rowOffset → 천단위 포맷 문자열 (음수 가능)
  const [edits, setEdits] = useState<Record<number, string>>(() =>
    Object.fromEntries(detailRows.map((r) => [r.rowOffset, r.adjustment !== 0 ? formatKRW(r.adjustment) : ''])),
  );
  const [showWarning, setShowWarning] = useState(false);

  // 확정 후 refetch 완료 시 detailRows가 바뀌면 edits를 새 값으로 동기화
  useEffect(() => {
    setEdits(
      Object.fromEntries(detailRows.map((r) => [r.rowOffset, r.adjustment !== 0 ? formatKRW(r.adjustment) : ''])),
    );
  }, [detailRows]);

  const handleChange = useCallback((rowOffset: number, formatted: string) => {
    setEdits((prev) => ({ ...prev, [rowOffset]: formatted }));
  }, []);

  // 편집된 증감액으로 detailRows 미리보기 계산
  const previewRows: BudgetDetailRow[] = detailRows.map((r) => {
    const raw = edits[r.rowOffset] ?? '';
    const value = raw === '' ? 0 : parseKRW(raw);
    return { ...r, adjustment: value, afterAllocation: r.allocation + value };
  });

  // 비목별 미리보기 집계
  const previewCategoryMap = new Map(categoryRows.map((r) => [r.category, { ...r }]));
  for (const pr of previewRows) {
    const cat = previewCategoryMap.get(pr.category);
    if (cat) {
      // adjustment 재계산 (해당 비목 세목들의 합)
    }
  }
  const previewCategories: BudgetCategoryRow[] = categoryRows.map((catRow) => {
    const catDetailRows = previewRows.filter((r) => r.category === catRow.category);
    const adjustment = catDetailRows.reduce((s, r) => s + r.adjustment, 0);
    const afterAllocation = catRow.allocation + adjustment;
    return {
      ...catRow,
      adjustment,
      afterAllocation,
      balance: afterAllocation - catRow.executionComplete - catRow.executionPlanned,
    };
  });

  // 변경된 행만 추출
  const changedAdjustments = previewRows
    .filter((r) => r.adjustment !== detailRows.find((o) => o.rowOffset === r.rowOffset)?.adjustment)
    .map((r) => ({ rowOffset: r.rowOffset, value: r.adjustment }));

  const hasChanges = changedAdjustments.length > 0;
  const totalAdjustment = previewRows.reduce((s, r) => s + r.adjustment, 0);

  const handleConfirmClick = () => {
    if (totalAdjustment !== 0) {
      setShowWarning(true);
    } else {
      onConfirm(previewRows.map((r) => ({ rowOffset: r.rowOffset, value: r.adjustment })));
    }
  };

  // 비목별 그룹화
  const grouped = previewRows.reduce<Record<string, BudgetDetailRow[]>>((acc, row) => {
    if (!acc[row.category]) acc[row.category] = [];
    acc[row.category].push(row);
    return acc;
  }, {});

  return (
    <div className="space-y-4">
      {/* 상단 안내 */}
      <div className="rounded-[2px] border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
        증감액 셀에 금액을 입력하세요. 양수(증액) 또는 음수(감액) 모두 가능합니다.
        입력 후 <strong>저장</strong>을 누르면 Sheets에 반영되고,
        <strong>변경 확정</strong>을 누르면 이력이 기록됩니다.
      </div>

      {/* 세목별 편집 테이블 */}
      <div className="overflow-x-auto rounded-[2px] border border-gray-200">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="border-b border-gray-200 bg-primary text-white">
              <th className="px-4 py-3 text-left font-semibold">비목</th>
              <th className="px-4 py-3 text-left font-semibold">세목</th>
              <th className="px-4 py-3 text-left font-semibold">보조세목</th>
              <th className="px-4 py-3 text-right font-semibold">현재 편성액</th>
              <th className="px-4 py-3 text-right font-semibold w-36">증감액 입력</th>
              <th className="px-4 py-3 text-right font-semibold">변경후 편성액</th>
            </tr>
          </thead>
          <tbody>
            {Object.entries(grouped).map(([category, catRows]) =>
              catRows.map((row, i) => {
                const originalAdj = detailRows.find((o) => o.rowOffset === row.rowOffset)?.adjustment ?? 0;
                const currentVal = edits[row.rowOffset] ?? '';
                const parsedVal = currentVal === '' ? 0 : parseKRW(currentVal);
                const isChanged = parsedVal !== originalAdj;

                return (
                  <tr
                    key={row.rowOffset}
                    className={`border-b border-gray-100 ${isChanged ? 'bg-blue-50' : i % 2 === 0 ? 'bg-white' : 'bg-row-even'}`}
                  >
                    {i === 0 && (
                      <td
                        rowSpan={catRows.length}
                        className="border-r border-gray-200 px-4 py-2.5 align-top font-semibold text-primary"
                      >
                        {category}
                      </td>
                    )}
                    <td className="px-4 py-2.5 text-gray-700">{row.subcategory || '-'}</td>
                    <td className="px-4 py-2.5 text-gray-600 text-xs">{row.subDetail || '-'}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-gray-700">
                      {formatKRW(row.allocation)}
                    </td>
                    <td className="px-2 py-1.5">
                      <KRWInput
                        allowNegative
                        value={currentVal}
                        onChange={(formatted) => handleChange(row.rowOffset, formatted)}
                        placeholder="0"
                        className={`w-full rounded border px-2 py-1 text-right tabular-nums text-sm outline-none focus:ring-2 focus:ring-primary/40 ${
                          isChanged ? 'border-blue-400 bg-white' : 'border-gray-200 bg-gray-50'
                        }`}
                      />
                    </td>
                    <td
                      className={`px-4 py-2.5 text-right tabular-nums font-semibold ${
                        isChanged ? 'text-blue-700' : 'text-gray-900'
                      }`}
                    >
                      {formatKRW(row.afterAllocation)}
                    </td>
                  </tr>
                );
              }),
            )}
          </tbody>
        </table>
      </div>

      {/* 비목별 미리보기 */}
      {hasChanges && (
        <div className="rounded-[2px] border border-blue-200 bg-blue-50 p-4">
          <h3 className="mb-3 text-sm font-semibold text-blue-800">변경 미리보기 (비목별 합계)</h3>
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-blue-200 text-blue-700">
                <th className="py-1 text-left">비목</th>
                <th className="py-1 text-right">현재 편성액</th>
                <th className="py-1 text-right">증감액</th>
                <th className="py-1 text-right">변경후 편성액</th>
                <th className="py-1 text-right">잔액</th>
              </tr>
            </thead>
            <tbody>
              {previewCategories
                .filter((r) => r.adjustment !== 0)
                .map((r) => (
                  <tr key={r.category} className="border-b border-blue-100">
                    <td className="py-1 font-medium text-blue-900">{r.category}</td>
                    <td className="py-1 text-right tabular-nums text-gray-700">
                      {formatKRW(r.allocation)}
                    </td>
                    <td
                      className={`py-1 text-right tabular-nums font-semibold ${
                        r.adjustment > 0 ? 'text-blue-600' : 'text-red-600'
                      }`}
                    >
                      {r.adjustment > 0 ? '+' : ''}{formatKRW(r.adjustment)}
                    </td>
                    <td className="py-1 text-right tabular-nums font-semibold text-blue-900">
                      {formatKRW(r.afterAllocation)}
                    </td>
                    <td
                      className={`py-1 text-right tabular-nums ${r.balance < 0 ? 'text-red-600' : 'text-gray-700'}`}
                    >
                      {formatKRW(r.balance)}
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      )}

      {/* 액션 버튼 */}
      <div className="flex items-center justify-end gap-3">
        <Button
          variant="outline"
          size="sm"
          disabled={!hasChanges || isSaving}
          onClick={() => onSave(changedAdjustments)}
          className="text-gray-600"
        >
          {isSaving ? '저장 중...' : 'Sheets에 저장'}
        </Button>
        <Button
          size="sm"
          disabled={!hasChanges || isSaving}
          onClick={handleConfirmClick}
          className="bg-primary text-white hover:bg-primary-light"
        >
          변경 확정 (이력 기록)
        </Button>
      </div>

      {showWarning && (
        <AdjWarningDialog
          totalAdj={totalAdjustment}
          onCancel={() => setShowWarning(false)}
          onProceed={() => {
            setShowWarning(false);
            onConfirm(previewRows.map((r) => ({ rowOffset: r.rowOffset, value: r.adjustment })));
          }}
        />
      )}
    </div>
  );
}

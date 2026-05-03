// components/expenditure/PersonnelMonthInputModal.tsx
'use client';

import { useState, useEffect } from 'react';
import { formatKRW, parseKRW } from '@/lib/utils';
import { KRWInput } from '@/components/ui/krw-input';
import { MONTH_COLUMNS } from '@/constants/sheets';
import { Loader2, X } from 'lucide-react';
import type { ExpenditureDetailRow } from '@/types';

interface PersonnelMonthInputModalProps {
  open: boolean;
  rows: ExpenditureDetailRow[];
  monthCount: number; // 12 for main, 4 for carryover
  onClose: () => void;
  onSave: (updates: { rowIndex: number; monthlyAmounts: number[] }[]) => Promise<void>;
}

export function PersonnelMonthInputModal({
  open, rows, monthCount, onClose, onSave,
}: PersonnelMonthInputModalProps) {
  const months = (MONTH_COLUMNS as readonly string[]).slice(0, monthCount);
  const [selectedMonthIdx, setSelectedMonthIdx] = useState(0);
  const [amounts, setAmounts] = useState<Record<number, string>>({});
  const [saving, setSaving] = useState(false);

  // 월 변경 또는 모달 열릴 때 현재 금액으로 초기화
  useEffect(() => {
    if (!open) return;
    const init: Record<number, string> = {};
    rows.forEach((row) => {
      const v = row.monthlyAmounts[selectedMonthIdx];
      init[row.rowIndex] = v > 0 ? formatKRW(v) : '';
    });
    setAmounts(init);
  }, [selectedMonthIdx, rows, open]);

  if (!open) return null;

  async function handleSave() {
    if (saving) return;
    setSaving(true);
    try {
      const updates = rows
        .filter((row) => {
          const newAmt = parseKRW(amounts[row.rowIndex] ?? '');
          return newAmt !== row.monthlyAmounts[selectedMonthIdx];
        })
        .map((row) => {
          const newAmt = parseKRW(amounts[row.rowIndex] ?? '');
          const newMonthlyAmounts = [...row.monthlyAmounts];
          newMonthlyAmounts[selectedMonthIdx] = newAmt;
          return { rowIndex: row.rowIndex, monthlyAmounts: newMonthlyAmounts };
        });
      if (updates.length > 0) {
        await onSave(updates);
      }
      onClose();
    } finally {
      setSaving(false);
    }
  }

  const total = rows.reduce(
    (s, row) => s + (parseKRW(amounts[row.rowIndex] ?? '') || 0),
    0,
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30">
      <div className="w-[520px] max-h-[85vh] overflow-y-auto rounded-lg border border-gray-200 bg-white shadow-xl">
        {/* 헤더 */}
        <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4">
          <h2 className="text-base font-semibold text-gray-800">인건비 월별 집행금액 입력</h2>
          <button onClick={onClose} className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-4 px-5 py-4">
          {/* 월 선택 */}
          <div>
            <label className="mb-2 block text-xs font-medium text-gray-600">입력 월 선택</label>
            <div className="flex flex-wrap gap-1.5">
              {months.map((m, i) => (
                <button
                  key={m}
                  onClick={() => setSelectedMonthIdx(i)}
                  className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                    selectedMonthIdx === i
                      ? 'bg-primary text-white'
                      : 'border border-gray-200 text-gray-500 hover:border-primary/60 hover:text-primary'
                  }`}
                >
                  {m}
                </button>
              ))}
            </div>
          </div>

          {/* 항목별 금액 입력 */}
          <div className="space-y-2">
            <p className="text-xs text-gray-500">
              <span className="font-medium text-gray-800">{months[selectedMonthIdx]}</span> 집행금액을 입력하세요.
            </p>
            <div className="rounded-lg border border-gray-100 divide-y divide-gray-100">
              {rows.map((row) => (
                <div key={row.rowIndex} className="flex items-center gap-3 px-3 py-2.5">
                  <span className="w-52 shrink-0 truncate text-sm text-gray-700" title={row.programName}>
                    {row.programName || '-'}
                  </span>
                  <div className="flex-1">
                    <KRWInput
                      value={amounts[row.rowIndex] ?? ''}
                      onChange={(v) => setAmounts((prev) => ({ ...prev, [row.rowIndex]: v }))}
                      placeholder="0"
                      className="w-full rounded border border-gray-200 px-2 py-1.5 text-right text-sm tabular-nums focus:border-primary/50 focus:outline-none focus:ring-1 focus:ring-primary/20"
                    />
                  </div>
                  <span className="shrink-0 text-xs text-gray-400">원</span>
                </div>
              ))}
            </div>
          </div>

          {/* 합계 */}
          <div className="flex items-center justify-between rounded-md bg-gray-50 px-3 py-2">
            <span className="text-xs text-gray-500">{months[selectedMonthIdx]} 집행 합계</span>
            <span className="text-sm font-semibold tabular-nums text-gray-800">
              {formatKRW(total)}원
            </span>
          </div>
        </div>

        {/* 버튼 */}
        <div className="flex justify-end gap-2 border-t border-gray-100 px-5 py-3">
          <button
            onClick={onClose}
            className="rounded px-4 py-1.5 text-sm text-gray-600 hover:bg-gray-100"
          >
            취소
          </button>
          <button
            onClick={() => void handleSave()}
            disabled={saving}
            className="flex items-center gap-1.5 rounded bg-primary px-4 py-1.5 text-sm font-medium text-white hover:bg-primary-light disabled:opacity-40"
          >
            {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            {saving ? '저장 중…' : '저장'}
          </button>
        </div>
      </div>
    </div>
  );
}

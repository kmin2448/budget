// components/expenditure/ExpenditureRowForm.tsx
'use client';

import { useState, useEffect } from 'react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { formatKRW, parseKRW } from '@/lib/utils';
import { MONTH_COLUMNS, PERSONNEL_CATEGORY } from '@/constants/sheets';
import type { ExpenditureDetailRow } from '@/types';
import type { RowPayload } from '@/hooks/useExpenditure';

interface ExpenditureRowFormProps {
  open: boolean;
  mode: 'add' | 'edit';
  category: string;
  initialData?: ExpenditureDetailRow;
  dropdownOptions: string[];
  onClose: () => void;
  onSubmit: (data: RowPayload) => Promise<void>;
}

interface FormState {
  programName: string;
  expenseDate: string;
  description: string;
  monthlyAmounts: string[]; // 천단위 포맷 문자열
}

const emptyForm: FormState = {
  programName: '',
  expenseDate: '',
  description: '',
  monthlyAmounts: Array<string>(12).fill(''),
};

const inputCls =
  'w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary disabled:bg-gray-50';

export function ExpenditureRowForm({
  open, mode, category, initialData, dropdownOptions, onClose, onSubmit,
}: ExpenditureRowFormProps) {
  const isPersonnel = category === PERSONNEL_CATEGORY;
  const [form, setForm] = useState<FormState>(emptyForm);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    if (initialData && mode === 'edit') {
      setForm({
        programName: initialData.programName,
        expenseDate: initialData.expenseDate,
        description: initialData.description,
        monthlyAmounts: initialData.monthlyAmounts.map((v) =>
          v > 0 ? formatKRW(v) : '',
        ),
      });
    } else {
      setForm(emptyForm);
    }
    setError(null);
  }, [open, initialData, mode]);

  function setMonthAmount(idx: number, raw: string) {
    const digits = raw.replace(/[^0-9]/g, '');
    const formatted = digits ? formatKRW(Number(digits)) : '';
    setForm((prev) => {
      const next = [...prev.monthlyAmounts];
      next[idx] = formatted;
      return { ...prev, monthlyAmounts: next };
    });
  }

  async function handleSubmit() {
    if (!form.programName.trim()) {
      setError(isPersonnel ? '내용을 입력해주세요.' : '구분(프로그램명)을 선택해주세요.');
      return;
    }
    if (!isPersonnel && !form.description.trim()) {
      setError('지출건명을 입력해주세요.');
      return;
    }
    const monthlyAmounts = form.monthlyAmounts.map((v) => parseKRW(v));
    if (monthlyAmounts.every((v) => v === 0)) {
      setError('월별 집행금액을 최소 하나 이상 입력해주세요.');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      await onSubmit({
        programName: form.programName.trim(),
        expenseDate: form.expenseDate,
        description: form.description.trim(),
        monthlyAmounts,
      });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : '저장 중 오류가 발생했습니다.');
    } finally {
      setLoading(false);
    }
  }

  const totalAmount = form.monthlyAmounts.reduce((s, v) => s + parseKRW(v), 0);

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="text-primary">
            {mode === 'add' ? '집행내역 추가' : '집행내역 수정'}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {isPersonnel ? (
            /* ── 인건비 전용: 내용 입력 ── */
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">
                내용 <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={form.programName}
                onChange={(e) => setForm((p) => ({ ...p, programName: e.target.value }))}
                placeholder="예: 홍길동 교수 인건비"
                className={inputCls}
              />
            </div>
          ) : (
            /* ── 일반 비목: 구분 + 지출일자 + 지출건명 ── */
            <>
              <div>
                <div className="mb-1 flex items-center gap-2">
                  <label className="text-sm font-medium text-gray-700">
                    구분(프로그램명) <span className="text-red-500">*</span>
                  </label>
                  <span className="text-xs text-gray-400">
                    해당 프로그램이 없으면{' '}
                    <a
                      href="/dashboard"
                      className="text-primary underline underline-offset-2 hover:text-primary-light"
                      onClick={onClose}
                    >
                      대시보드
                    </a>
                    에서 추가해 주세요.
                  </span>
                </div>
                <select
                  value={form.programName}
                  onChange={(e) => setForm((p) => ({ ...p, programName: e.target.value }))}
                  className={inputCls}
                >
                  <option value="">프로그램 선택</option>
                  {dropdownOptions.map((opt) => (
                    <option key={opt} value={opt}>{opt}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">
                  지출일자
                  <span className="ml-1 text-xs font-normal text-gray-400">
                    (입력 시 집행완료 / 미입력 시 집행예정)
                  </span>
                </label>
                <input
                  type="date"
                  value={form.expenseDate}
                  onChange={(e) => setForm((p) => ({ ...p, expenseDate: e.target.value }))}
                  className={inputCls}
                />
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">
                  지출건명 <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={form.description}
                  onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))}
                  placeholder="지출건명 입력"
                  className={inputCls}
                />
              </div>
            </>
          )}

          {/* 월별 집행금액 */}
          <div>
            <div className="mb-2 flex items-center justify-between">
              <label className="text-sm font-medium text-gray-700">
                월별 집행금액 (원)
                <span className="ml-1 text-xs font-normal text-gray-400">*</span>
              </label>
              <span className="text-xs text-gray-500">
                합계:{' '}
                <strong className="tabular-nums text-gray-800">
                  {formatKRW(totalAmount)}
                </strong>
                원
              </span>
            </div>
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
              {MONTH_COLUMNS.map((month, idx) => (
                <div key={month}>
                  <label className="mb-0.5 block text-xs text-gray-500">{month}</label>
                  <input
                    type="text"
                    inputMode="numeric"
                    value={form.monthlyAmounts[idx]}
                    onChange={(e) => setMonthAmount(idx, e.target.value)}
                    placeholder="0"
                    className={`${inputCls} text-right tabular-nums`}
                  />
                </div>
              ))}
            </div>
          </div>

          {error && (
            <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={loading}>
            취소
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={loading}
            className="bg-primary text-white hover:bg-primary-light"
          >
            {loading ? '저장 중...' : mode === 'add' ? '추가' : '수정'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

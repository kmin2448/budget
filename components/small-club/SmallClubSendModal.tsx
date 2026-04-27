'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { KRWInput } from '@/components/ui/krw-input';
import { parseKRW, formatKRW } from '@/lib/utils';
import { CATEGORY_SHEETS, MONTH_COLUMNS } from '@/constants/sheets';
import { useBudgetType } from '@/contexts/BudgetTypeContext';
import type { SmallClubExecution } from '@/types';

const LS_CATEGORY   = 'smallclub_send_category';
const LS_SUB_CAT    = 'smallclub_send_sub_category';
const LS_SUB_DETAIL = 'smallclub_send_sub_detail';

interface Props {
  open: boolean;
  row: SmallClubExecution | null;
  onClose: () => void;
}

function loadLS(key: string) {
  if (typeof window === 'undefined') return '';
  return localStorage.getItem(key) ?? '';
}

export function SmallClubSendModal({ open, row, onClose }: Props) {
  const { budgetType } = useBudgetType();

  const [category,    setCategory]    = useState('');
  const [subCat,      setSubCat]      = useState('');
  const [subDetail,   setSubDetail]   = useState('');
  const [description, setDescription] = useState('');
  const [expenseDate, setExpenseDate] = useState('');
  const [monthAmounts, setMonthAmounts] = useState<string[]>(Array(12).fill(''));

  const [isPending, setIsPending] = useState(false);
  const [error,     setError]     = useState('');
  const [success,   setSuccess]   = useState(false);

  useEffect(() => {
    if (open && row) {
      setCategory(loadLS(LS_CATEGORY) || CATEGORY_SHEETS[0]);
      setSubCat(loadLS(LS_SUB_CAT));
      setSubDetail(loadLS(LS_SUB_DETAIL));
      setDescription(row.description || '');
      setExpenseDate(new Date().toISOString().slice(0, 10));
      const currentMonth = new Date().getMonth();
      const fiscalIdx = currentMonth >= 2 ? currentMonth - 2 : currentMonth + 10;
      const amounts = Array(12).fill('');
      amounts[fiscalIdx] = formatKRW(row.confirmedAmount);
      setMonthAmounts(amounts);
      setError('');
      setSuccess(false);
    }
  }, [open, row]);

  const setMonthAmount = useCallback((idx: number, val: string) => {
    setMonthAmounts((prev) => {
      const next = [...prev];
      next[idx] = val;
      return next;
    });
  }, []);

  async function handleSubmit() {
    if (!category)    { setError('비목을 선택해주세요.'); return; }
    if (!subCat)      { setError('보조비목을 입력해주세요.'); return; }
    if (!description) { setError('지출건명을 입력해주세요.'); return; }
    if (!expenseDate) { setError('지출일자를 입력해주세요.'); return; }

    const monthlyAmounts = monthAmounts.map((v) => parseKRW(v));

    setIsPending(true);
    setError('');
    try {
      const res = await fetch(
        `/api/sheets/expenditure/${encodeURIComponent(category)}?sheetType=${budgetType}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            programName:   subDetail ? `${subCat} / ${subDetail}` : subCat,
            expenseDate,
            description,
            monthlyAmounts,
          }),
        },
      );
      if (!res.ok) {
        const body = await res.json() as { error?: string };
        throw new Error(body.error ?? '전송 실패');
      }
      localStorage.setItem(LS_CATEGORY,   category);
      localStorage.setItem(LS_SUB_CAT,    subCat);
      localStorage.setItem(LS_SUB_DETAIL, subDetail);

      setSuccess(true);
      setTimeout(() => { onClose(); setSuccess(false); }, 1200);
    } catch (err) {
      setError(err instanceof Error ? err.message : '전송 실패');
    } finally {
      setIsPending(false);
    }
  }

  const totalAmount = monthAmounts.reduce((s, v) => s + parseKRW(v), 0);

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>비목별 집행내역 전송</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-1">
          {error && (
            <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>
          )}
          {success && (
            <p className="rounded-md bg-green-50 px-3 py-2 text-sm text-green-600">전송 완료!</p>
          )}

          {row && (
            <div className="rounded-md bg-[#F5F9FC] px-3 py-2 text-xs text-[#6F6F6B] space-y-0.5">
              <span className="font-medium text-primary">소학회 원본: </span>
              {row.teamName} · {row.usageType} · 확정금액 {formatKRW(row.confirmedAmount)}
            </div>
          )}

          <div className="space-y-1.5">
            <label className="text-sm font-medium text-[#131310]">비목</label>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="w-full rounded-md border border-[#E3E3E0] bg-white px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
            >
              {CATEGORY_SHEETS.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-[#131310]">보조비목</label>
              <Input
                value={subCat}
                onChange={(e) => setSubCat(e.target.value)}
                placeholder="보조비목 입력"
                className="h-9 text-sm"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-[#131310]">보조세목 <span className="text-gray-400 font-normal">(선택)</span></label>
              <Input
                value={subDetail}
                onChange={(e) => setSubDetail(e.target.value)}
                placeholder="보조세목 입력"
                className="h-9 text-sm"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-medium text-[#131310]">지출건명</label>
            <Input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="지출건명"
              className="h-9 text-sm"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-medium text-[#131310]">지출일자</label>
            <Input
              type="date"
              value={expenseDate}
              onChange={(e) => setExpenseDate(e.target.value)}
              className="h-9 text-sm w-44"
            />
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-sm font-medium text-[#131310]">월별 집행금액</label>
              <span className="text-xs text-gray-400">합계: <span className="font-medium text-[#131310]">{formatKRW(totalAmount)}</span></span>
            </div>
            <div className="grid grid-cols-4 gap-2">
              {MONTH_COLUMNS.map((month, idx) => (
                <div key={month} className="space-y-0.5">
                  <label className="text-[10px] text-gray-400">{month}</label>
                  <KRWInput
                    value={monthAmounts[idx]}
                    onChange={(v) => setMonthAmount(idx, v)}
                    placeholder="0"
                    className="w-full rounded-md border border-[#E3E3E0] px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-primary"
                  />
                </div>
              ))}
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={isPending}>취소</Button>
          <Button onClick={handleSubmit} disabled={isPending}>
            {isPending ? '전송 중...' : '집행내역 전송'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

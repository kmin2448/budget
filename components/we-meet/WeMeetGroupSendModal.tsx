'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { formatKRW, parseKRW } from '@/lib/utils';
import { CATEGORY_SHEETS, MONTH_COLUMNS } from '@/constants/sheets';
import { loadSendSettings, saveSendSettings, type WeMeetSendSettings } from './WeMeetSendSettingsModal';
import type { WeMeetExecution } from '@/types';

// ── 타입 ──────────────────────────────────────────────────────────────

interface ExecGroup {
  key: string;
  usageType: string;
  description: string;
  rows: WeMeetExecution[];
}

interface Props {
  open: boolean;
  group: ExecGroup | null;
  onClose: () => void;
  onSent: (rowIndexes: number[]) => void;
}

// ── 유틸 ─────────────────────────────────────────────────────────────

function dateToFiscalIdx(dateStr: string): number {
  const m = dateStr ? parseInt(dateStr.substring(5, 7)) : new Date().getMonth() + 1;
  return m >= 3 ? m - 3 : m + 9;
}

function buildMonthlyAmounts(rows: WeMeetExecution[]): number[] {
  const amounts = Array(12).fill(0) as number[];
  for (const row of rows) {
    const amt = row.confirmedAmount > 0 ? row.confirmedAmount : row.draftAmount;
    if (amt === 0) continue;
    const idx = dateToFiscalIdx(row.usageDate);
    amounts[idx] += amt;
  }
  return amounts;
}

function buildDescription(description: string, rows: WeMeetExecution[]): string {
  const teams = rows.map((r) => r.teamName).filter(Boolean).join(',');
  return `(WE-Meet)${description}(${teams})`;
}

function defaultExpenseDate(rows: WeMeetExecution[]): string {
  const dates = rows.map((r) => r.usageDate).filter(Boolean).sort();
  return dates[0] ?? new Date().toISOString().slice(0, 10);
}

// ── KRW 입력 ──────────────────────────────────────────────────────────

function KRWCell({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <input
      type="text"
      value={value}
      onChange={(e) => {
        const raw = e.target.value.replace(/[^0-9]/g, '');
        onChange(raw === '' ? '' : Number(raw).toLocaleString('ko-KR'));
      }}
      placeholder="0"
      className="w-full rounded border border-[#E3E3E0] px-2 py-1 text-right text-xs focus:outline-none focus:ring-1 focus:ring-primary"
    />
  );
}

// ── 컴포넌트 ─────────────────────────────────────────────────────────

const fi = 'w-full rounded-md border border-[#E3E3E0] bg-white px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary';

export function WeMeetGroupSendModal({ open, group, onClose, onSent }: Props) {
  const [settings, setSettings]       = useState<WeMeetSendSettings>(() => loadSendSettings());
  const [description, setDescription] = useState('');
  const [expenseDate, setExpenseDate] = useState('');
  const [monthAmts, setMonthAmts]     = useState<string[]>(Array(12).fill(''));
  const [isPending, setIsPending]     = useState(false);
  const [error, setError]             = useState('');
  const [success, setSuccess]         = useState(false);

  // 모달 열릴 때 초기화
  useEffect(() => {
    if (open && group) {
      const s = loadSendSettings();
      setSettings(s);
      setDescription(buildDescription(group.description, group.rows));
      setExpenseDate(defaultExpenseDate(group.rows));
      const nums = buildMonthlyAmounts(group.rows);
      setMonthAmts(nums.map((v) => (v > 0 ? formatKRW(v) : '')));
      setError('');
      setSuccess(false);
    }
  }, [open, group]);

  const setMonth = useCallback((idx: number, val: string) => {
    setMonthAmts((prev) => { const n = [...prev]; n[idx] = val; return n; });
  }, []);

  function set<K extends keyof WeMeetSendSettings>(key: K, val: WeMeetSendSettings[K]) {
    setSettings((s) => ({ ...s, [key]: val }));
  }

  const programName = settings.subDetail
    ? `${settings.subCat} / ${settings.subDetail}`
    : settings.subCat;

  const totalAmount = monthAmts.reduce((s, v) => s + parseKRW(v), 0);

  async function handleSubmit() {
    if (!settings.category)  { setError('비목을 선택해주세요.'); return; }
    if (!settings.subCat)    { setError('구분/프로그램을 입력해주세요.'); return; }
    if (!description)        { setError('지출건명을 입력해주세요.'); return; }
    if (totalAmount === 0)   { setError('금액을 1개 이상 입력해주세요.'); return; }

    const monthlyAmounts = monthAmts.map((v) => parseKRW(v));

    setIsPending(true);
    setError('');
    try {
      // 1) 비목별 집행내역에 행 추가
      const res = await fetch(
        `/api/sheets/expenditure/${encodeURIComponent(settings.category)}?sheetType=${settings.budgetType}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            programName,
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

      // 2) WE-Meet 시트 I열에 보내기여부 표시
      if (group) {
        const rowIndexes = group.rows.map((r) => r.rowIndex);
        const markRes = await fetch('/api/we-meet/executions/mark-sent', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ rowIndexes }),
        });
        if (markRes.ok) {
          onSent(rowIndexes);
        }
      }

      // 3) 설정 저장
      saveSendSettings(settings);

      setSuccess(true);
      setTimeout(() => { onClose(); setSuccess(false); }, 1200);
    } catch (err) {
      setError(err instanceof Error ? err.message : '전송 실패');
    } finally {
      setIsPending(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="!w-[min(680px,calc(100vw-2rem))] !max-w-[min(680px,calc(100vw-2rem))] max-h-[90vh] overflow-y-auto rounded-[2px]" showCloseButton={false}>
        <DialogHeader>
          <DialogTitle>비목별 집행내역 전송</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-1">
          {error && (
            <p className="rounded-md bg-red-50 px-3 py-2 text-xs text-red-600">{error}</p>
          )}
          {success && (
            <p className="rounded-md bg-green-50 px-3 py-2 text-xs text-green-600">전송 완료!</p>
          )}

          {/* 원본 정보 */}
          {group && (
            <div className="rounded-md bg-[#F5F9FC] px-3 py-2.5 text-xs text-[#6F6F6B] space-y-1">
              <div>
                <span className="font-medium text-primary">WE-Meet 원본: </span>
                <span className="font-medium text-[#131310]">{group.usageType}</span>
                <span className="mx-1.5 text-gray-300">·</span>
                <span className="text-[#131310]">{group.description}</span>
              </div>
              <div className="flex flex-wrap gap-x-3 gap-y-0.5">
                {group.rows.map((r) => (
                  <span key={r.rowIndex} className="text-[11px]">
                    {r.teamName}
                    {r.confirmedAmount > 0 && (
                      <span className="ml-1 text-primary">{formatKRW(r.confirmedAmount)}</span>
                    )}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* ── 전송 설정 ── */}
          <div className="rounded-md border border-[#E3E3E0] p-3 space-y-3">
            <p className="text-[11px] font-medium text-[#6F6F6B] uppercase tracking-wide">전송 설정</p>

            {/* 예산구분 */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-xs font-medium text-[#6F6F6B]">예산구분</label>
                <div className="flex gap-4 pt-1">
                  {(['main', 'carryover'] as const).map((t) => (
                    <label key={t} className="flex items-center gap-1.5 cursor-pointer">
                      <input
                        type="radio"
                        name="send-budgetType"
                        value={t}
                        checked={settings.budgetType === t}
                        onChange={() => set('budgetType', t)}
                        className="accent-primary"
                      />
                      <span className="text-xs">{t === 'main' ? '본예산' : '이월예산'}</span>
                    </label>
                  ))}
                </div>
              </div>

              {/* 비목 */}
              <div className="space-y-1">
                <label className="text-xs font-medium text-[#6F6F6B]">비목</label>
                <select value={settings.category} onChange={(e) => set('category', e.target.value)}
                  className="w-full rounded border border-[#E3E3E0] bg-white px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-primary">
                  {CATEGORY_SHEETS.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
            </div>

            {/* 구분/프로그램 + 세목 */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-xs font-medium text-[#6F6F6B]">구분/프로그램 <span className="text-red-400">*</span></label>
                <input
                  type="text"
                  value={settings.subCat}
                  onChange={(e) => set('subCat', e.target.value)}
                  placeholder="예: WE-Meet 지원비"
                  className="w-full rounded border border-[#E3E3E0] bg-white px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-primary"
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-[#6F6F6B]">세목 <span className="text-gray-400 font-normal">(선택)</span></label>
                <input
                  type="text"
                  value={settings.subDetail}
                  onChange={(e) => set('subDetail', e.target.value)}
                  placeholder="예: WE-Meet"
                  className="w-full rounded border border-[#E3E3E0] bg-white px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-primary"
                />
              </div>
            </div>

            {programName && (
              <p className="text-[11px] text-gray-400">
                비목별 집행내역 A열(구분):
                <span className="ml-1 font-medium text-[#131310]">{programName}</span>
              </p>
            )}
          </div>

          {/* ── 집행 정보 ── */}
          <div className="space-y-3">
            {/* 지출건명 */}
            <div className="space-y-1">
              <label className="text-xs font-medium text-[#6F6F6B]">지출건명 <span className="text-red-400">*</span></label>
              <input
                type="text"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className={fi}
              />
            </div>

            {/* 지출일자 */}
            <div className="space-y-1">
              <label className="text-xs font-medium text-[#6F6F6B]">지출일자</label>
              <input
                type="date"
                value={expenseDate}
                onChange={(e) => setExpenseDate(e.target.value)}
                className="h-9 rounded-md border border-[#E3E3E0] bg-white px-3 text-sm focus:outline-none focus:ring-1 focus:ring-primary w-44"
              />
            </div>

            {/* 월별 금액 */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-xs font-medium text-[#6F6F6B]">월별 집행금액</label>
                <span className="text-xs text-gray-400">
                  합계: <span className="font-medium text-[#131310]">{formatKRW(totalAmount)}</span>
                </span>
              </div>
              <div className="grid grid-cols-6 gap-1.5">
                {MONTH_COLUMNS.map((month, idx) => (
                  <div key={month} className="space-y-0.5">
                    <label className="text-[10px] text-gray-400 block text-center">{month}</label>
                    <KRWCell value={monthAmts[idx]} onChange={(v) => setMonth(idx, v)} />
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={isPending}>취소</Button>
          <Button onClick={() => { void handleSubmit(); }} disabled={isPending || success}>
            {isPending ? '전송 중...' : '집행내역 전송'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

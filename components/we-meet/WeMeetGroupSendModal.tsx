'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Loader2, ExternalLink } from 'lucide-react';
import { formatKRW, parseKRW } from '@/lib/utils';
import { MONTH_COLUMNS } from '@/constants/sheets';
import { loadSendSettings, saveSendSettings } from './WeMeetSendSettingsModal';
import type { WeMeetExecution, ExpenditurePageData } from '@/types';

// ── 타입 ──────────────────────────────────────────────────────────────

interface ExecGroup {
  key: string;
  usageType: string;
  description: string;
  rows: WeMeetExecution[];
}

interface SentPayload {
  rowIndexes: number[];
  category: string;
  budgetType: 'main' | 'carryover';
  description: string;
  programName: string;
  expenditureRowIndex?: number;
}

interface Props {
  open: boolean;
  group: ExecGroup | null;
  initialSelectedIndexes?: number[];
  onClose: () => void;
  onSent: (payload: SentPayload) => void;
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
    amounts[dateToFiscalIdx(row.usageDate)] += amt;
  }
  return amounts;
}

const LAST_PROGRAM_KEY = 'wemeet_send_last_program';

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

export function WeMeetGroupSendModal({ open, group, initialSelectedIndexes, onClose, onSent }: Props) {
  const router = useRouter();

  // 전송 설정 (settings 기반)
  const [budgetType, setBudgetType]   = useState<'main' | 'carryover'>('main');
  const [category, setCategory]       = useState('');

  // 팀 선택
  const [selectedIdxSet, setSelectedIdxSet] = useState<Set<number>>(new Set());

  // 프로그램 목록 (API)
  const [programOptions, setProgramOptions]   = useState<string[]>([]);
  const [selectedProgram, setSelectedProgram] = useState('');
  const [isLoadingPrograms, setIsLoadingPrograms] = useState(false);
  const [programLoadError, setProgramLoadError]   = useState('');

  // 집행 정보
  const [description, setDescription] = useState('');
  const [monthAmts, setMonthAmts]     = useState<string[]>(Array(12).fill(''));

  // 상태
  const [isPending, setIsPending] = useState(false);
  const [error, setError]         = useState('');
  const [success, setSuccess]     = useState(false);

  // ── 모달 열릴 때 초기화 ─────────────────────────────────────────────
  useEffect(() => {
    if (open && group) {
      const s = loadSendSettings();
      setBudgetType(s.budgetType);
      setCategory(s.category);
      // initialSelectedIndexes가 있으면 해당 팀만, 없으면 전체 선택
      // eslint-disable-next-line react-hooks/exhaustive-deps
      setSelectedIdxSet(
        initialSelectedIndexes && initialSelectedIndexes.length > 0
          ? new Set(initialSelectedIndexes)
          : new Set(group.rows.map((r) => r.rowIndex)),
      );
      setError('');
      setSuccess(false);
    }
  // initialSelectedIndexes는 open 시점 스냅샷을 사용하므로 의도적으로 dep에서 제외
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, group]);

  // ── 프로그램 목록 로드 ───────────────────────────────────────────────
  useEffect(() => {
    if (!open || !category) return;
    let cancelled = false;
    setIsLoadingPrograms(true);
    setProgramLoadError('');
    setProgramOptions([]);

    fetch(`/api/sheets/expenditure/${encodeURIComponent(category)}?sheetType=${budgetType}`)
      .then((r) => r.ok ? r.json() as Promise<ExpenditurePageData> : Promise.reject(new Error('로드 실패')))
      .then((data) => {
        if (cancelled) return;
        const opts = data.dropdownOptions ?? [];
        setProgramOptions(opts);
        const lastUsed = typeof window !== 'undefined' ? (localStorage.getItem(LAST_PROGRAM_KEY) ?? '') : '';
        setSelectedProgram(opts.includes(lastUsed) ? lastUsed : (opts[0] ?? ''));
      })
      .catch((e) => {
        if (!cancelled) setProgramLoadError(e instanceof Error ? e.message : '로드 실패');
      })
      .finally(() => { if (!cancelled) setIsLoadingPrograms(false); });

    return () => { cancelled = true; };
  }, [open, category, budgetType]);

  // ── 선택된 행 (stable key for effects) ─────────────────────────────
  const selectedRows = useMemo(
    () => group?.rows.filter((r) => selectedIdxSet.has(r.rowIndex)) ?? [],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [Array.from(selectedIdxSet).sort().join(','), group],
  );
  const selectedTeams = selectedRows.map((r) => r.teamName).filter(Boolean);

  // 건명 자동 생성
  useEffect(() => {
    if (!group) return;
    const teams = group.rows
      .filter((r) => selectedIdxSet.has(r.rowIndex))
      .map((r) => r.teamName)
      .filter(Boolean);
    setDescription(
      teams.length > 0
        ? `${group.description}(${teams.join(',')})`
        : group.description,
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [Array.from(selectedIdxSet).sort().join(','), group?.description]);

  // 월별 금액 자동 배분
  useEffect(() => {
    const rows = group?.rows.filter((r) => selectedIdxSet.has(r.rowIndex)) ?? [];
    const nums = buildMonthlyAmounts(rows);
    setMonthAmts(nums.map((v) => (v > 0 ? formatKRW(v) : '')));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [Array.from(selectedIdxSet).sort().join(',')]);

  // ── 팀 선택 핸들러 ──────────────────────────────────────────────────
  const toggleRow = useCallback((rowIndex: number) => {
    setSelectedIdxSet((prev) => {
      const next = new Set(prev);
      if (next.has(rowIndex)) next.delete(rowIndex);
      else next.add(rowIndex);
      return next;
    });
  }, []);

  function toggleAll() {
    if (!group) return;
    const all = group.rows.map((r) => r.rowIndex);
    setSelectedIdxSet((prev) =>
      prev.size === all.length ? new Set() : new Set(all),
    );
  }

  const setMonth = useCallback((idx: number, val: string) => {
    setMonthAmts((prev) => { const n = [...prev]; n[idx] = val; return n; });
  }, []);

  const totalAmount = monthAmts.reduce((s, v) => s + parseKRW(v), 0);

  // ── 전송 ────────────────────────────────────────────────────────────
  async function handleSubmit() {
    if (!category)              { setError('비목이 설정되지 않았습니다. 보내기 설정을 확인해주세요.'); return; }
    if (!selectedProgram)       { setError('구분/프로그램을 선택해주세요.'); return; }
    if (!description)           { setError('지출건명을 입력해주세요.'); return; }
    if (selectedRows.length === 0) { setError('팀을 1개 이상 선택해주세요.'); return; }
    if (totalAmount === 0)      { setError('금액을 1개 이상 입력해주세요.'); return; }

    const monthlyAmounts = monthAmts.map((v) => parseKRW(v));
    setIsPending(true);
    setError('');
    try {
      const expenditureRes = await fetch(
        `/api/sheets/expenditure/${encodeURIComponent(category)}?sheetType=${budgetType}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            programName: selectedProgram,
            expenseDate: '',
            description,
            monthlyAmounts,
          }),
        },
      );
      if (!expenditureRes.ok) {
        const body = await expenditureRes.json() as { error?: string };
        throw new Error(body.error ?? '전송 실패');
      }
      const { rowIndex: expenditureRowIndex } = await expenditureRes.json() as { rowIndex?: number };

      // WE-Meet 시트 보내기여부·청구여부 표시 + 배치 이력 저장
      const rowIndexes = selectedRows.map((r) => r.rowIndex);
      await fetch('/api/we-meet/executions/mark-sent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          rowIndexes,
          category,
          budgetType,
          description,
          programName: selectedProgram,
          expenditureRowIndex,
        }),
      });

      // 설정 저장
      saveSendSettings({ budgetType, category });
      if (typeof window !== 'undefined') {
        localStorage.setItem(LAST_PROGRAM_KEY, selectedProgram);
      }

      onSent({ rowIndexes, category, budgetType, description, programName: selectedProgram, expenditureRowIndex });
      setSuccess(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : '전송 실패');
    } finally {
      setIsPending(false);
    }
  }

  const allSelected = group ? selectedIdxSet.size === group.rows.length : false;

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="!w-[min(700px,calc(100vw-2rem))] !max-w-[min(700px,calc(100vw-2rem))] max-h-[90vh] overflow-y-auto rounded-[2px]" showCloseButton={false}>
        <DialogHeader>
          <DialogTitle>비목별 집행내역 전송</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-1">
          {error && (
            <p className="rounded-md bg-red-50 px-3 py-2 text-xs text-red-600">{error}</p>
          )}
          {success && (
            <div className="rounded-md bg-green-50 px-3 py-2 text-xs text-green-700 space-y-0.5">
              <p className="font-medium">전송 완료!</p>
              <p className="text-green-600">
                비목별 집행내역({category})에 추가되었습니다. 청구여부도 자동으로 표시되었습니다.
              </p>
            </div>
          )}

          {/* ── 원본 건 정보 ── */}
          {group && (
            <div className="rounded-md bg-[#F5F9FC] px-3 py-2 text-xs text-[#6F6F6B]">
              <span className="font-medium text-primary">원본: </span>
              <span className="font-medium text-[#131310]">{group.usageType}</span>
              <span className="mx-1.5 text-gray-300">·</span>
              <span className="text-[#131310]">{group.description}</span>
            </div>
          )}

          {/* ── 팀 선택 ── */}
          {group && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-xs font-medium text-[#131310]">
                  팀 선택 <span className="text-gray-400 font-normal">({selectedIdxSet.size}/{group.rows.length}팀 선택됨)</span>
                </label>
                <button
                  onClick={toggleAll}
                  className="text-[11px] text-primary hover:underline"
                >
                  {allSelected ? '전체 해제' : '전체 선택'}
                </button>
              </div>
              <div className="rounded-md border border-[#E3E3E0] divide-y divide-[#F0F0ED]">
                {group.rows.map((row) => {
                  const amt = row.confirmedAmount > 0 ? row.confirmedAmount : row.draftAmount;
                  const isConf = row.confirmedAmount > 0;
                  return (
                    <label
                      key={row.rowIndex}
                      className="flex items-center gap-2.5 px-3 py-2 cursor-pointer hover:bg-[#F8FAFC] transition-colors"
                    >
                      <input
                        type="checkbox"
                        checked={selectedIdxSet.has(row.rowIndex)}
                        onChange={() => toggleRow(row.rowIndex)}
                        className="h-3.5 w-3.5 accent-primary shrink-0"
                      />
                      <span className="flex-1 text-xs font-medium text-[#131310]">{row.teamName}</span>
                      <span className={`text-[11px] tabular-nums ${isConf ? 'text-primary' : 'text-gray-400'}`}>
                        {isConf ? `확정 ${formatKRW(row.confirmedAmount)}` : amt > 0 ? `기안 ${formatKRW(amt)}` : '금액 없음'}
                      </span>
                      {row.usageDate && (
                        <span className="text-[11px] text-gray-400">{row.usageDate}</span>
                      )}
                      {row.sent && (
                        <span className="rounded-full bg-green-100 px-1.5 py-0.5 text-[10px] text-green-600">전송됨</span>
                      )}
                    </label>
                  );
                })}
              </div>
            </div>
          )}

          {/* ── 전송 설정 ── */}
          <div className="rounded-md border border-[#E3E3E0] p-3 space-y-3">
            <p className="text-[11px] font-medium text-[#6F6F6B] uppercase tracking-wide">전송 설정</p>

            {/* 예산구분 */}
            <div className="space-y-1">
              <label className="text-xs font-medium text-[#6F6F6B]">예산구분</label>
              <div className="flex gap-4 pt-0.5">
                {(['main', 'carryover'] as const).map((t) => (
                  <label key={t} className="flex items-center gap-1.5 cursor-pointer">
                    <input
                      type="radio"
                      name="send-budgetType"
                      value={t}
                      checked={budgetType === t}
                      onChange={() => setBudgetType(t)}
                      className="accent-primary"
                    />
                    <span className="text-sm">{t === 'main' ? '본예산' : '이월예산'}</span>
                  </label>
                ))}
              </div>
            </div>

            {/* 비목 (정보 표시) */}
            <div className="flex items-center gap-1.5">
              <span className="text-[11px] text-gray-400">비목:</span>
              <span className="text-[11px] text-gray-500 font-medium">{category || '—'}</span>
              <span className="text-[10px] text-gray-300">· 비목 변경은 보내기 설정에서</span>
            </div>

            {/* 구분/프로그램 */}
            <div className="space-y-1">
              <label className="text-xs font-medium text-[#6F6F6B]">
                구분/프로그램 <span className="text-red-400">*</span>
                <span className="ml-1 text-[10px] text-gray-400 font-normal">(비목별 집행내역 A열)</span>
              </label>
              {isLoadingPrograms ? (
                <div className="flex items-center gap-1.5 rounded-md border border-[#E3E3E0] px-3 py-2">
                  <Loader2 className="h-3.5 w-3.5 animate-spin text-gray-400" />
                  <span className="text-xs text-gray-400">목록 불러오는 중…</span>
                </div>
              ) : programLoadError ? (
                <p className="text-xs text-red-500">{programLoadError}</p>
              ) : programOptions.length === 0 ? (
                <p className="text-xs text-gray-400">해당 비목에 등록된 구분/프로그램이 없습니다.</p>
              ) : (
                <select
                  value={selectedProgram}
                  onChange={(e) => setSelectedProgram(e.target.value)}
                  className="w-full rounded-md border border-[#E3E3E0] bg-white px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
                >
                  {programOptions.map((opt) => (
                    <option key={opt} value={opt}>{opt}</option>
                  ))}
                </select>
              )}
            </div>
          </div>

          {/* ── 집행 정보 ── */}
          <div className="space-y-3">
            {/* 지출건명 */}
            <div className="space-y-1">
              <label className="text-xs font-medium text-[#6F6F6B]">
                지출건명 <span className="text-red-400">*</span>
                <span className="ml-1 text-[10px] text-gray-400 font-normal">(팀 선택에 따라 자동 생성)</span>
              </label>
              <input
                type="text"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="w-full rounded-md border border-[#E3E3E0] bg-white px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>

            {/* 월별 금액 */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-xs font-medium text-[#6F6F6B]">
                  월별 집행금액
                  <span className="ml-1 text-[10px] text-gray-400 font-normal">(팀 선택에 따라 자동 배분)</span>
                </label>
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
          {success ? (
            <>
              <Button variant="outline" onClick={() => { onClose(); setSuccess(false); }}>닫기</Button>
              <Button
                className="gap-1.5"
                onClick={() => {
                  router.push(`/expenditure/${encodeURIComponent(category)}`);
                  onClose();
                  setSuccess(false);
                }}
              >
                <ExternalLink className="h-3.5 w-3.5" />집행내역 바로가기
              </Button>
            </>
          ) : (
            <>
              <Button variant="outline" onClick={onClose} disabled={isPending}>취소</Button>
              <Button
                onClick={() => { void handleSubmit(); }}
                disabled={isPending || selectedIdxSet.size === 0}
              >
                {isPending ? '전송 중…' : `집행내역 전송 (${selectedIdxSet.size}팀)`}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

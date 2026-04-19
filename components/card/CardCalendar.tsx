'use client';

import { useState } from 'react';
import { ChevronLeft, ChevronRight, Plus, Check, X } from 'lucide-react';
import { cn, formatKRW } from '@/lib/utils';
import { CATEGORY_SHEETS } from '@/constants/sheets';
import type { CardEntry, CardHolders } from '@/hooks/useCardManagement';

interface Props {
  entries: CardEntry[];
  canWrite?: boolean;
  cardHolders?: CardHolders;
  cardTypes?: string[];
  onAdd?: (entry: Omit<CardEntry, 'rowIndex'>) => Promise<void>;
}

const ENTRY_COLORS = [
  'bg-blue-100 text-blue-700 border-blue-200',
  'bg-green-100 text-green-700 border-green-200',
  'bg-amber-100 text-amber-700 border-amber-200',
  'bg-purple-100 text-purple-700 border-purple-200',
  'bg-pink-100 text-pink-700 border-pink-200',
  'bg-orange-100 text-orange-700 border-orange-200',
  'bg-teal-100 text-teal-700 border-teal-200',
  'bg-red-100 text-red-700 border-red-200',
];

const DAY_LABELS = ['월', '화', '수', '목', '금', '토', '일'];

const EMPTY_DRAFT: Omit<CardEntry, 'rowIndex'> = {
  category: '', expenseDate: '', expenseTime: '',
  description: '', merchant: '', amount: 0,
  note: '', user: '', cardType: '', cardHolder: '',
};

const inputCls = 'w-full rounded border border-primary/40 bg-white px-1.5 py-1 text-xs focus:outline-none focus:border-primary';
const selectCls = 'w-full rounded border border-primary/40 bg-white px-1.5 py-1 text-xs focus:outline-none focus:border-primary';

function getDaysInMonth(year: number, month: number) {
  return new Date(year, month, 0).getDate();
}

function getFirstDayOfWeek(year: number, month: number): number {
  const d = new Date(year, month - 1, 1).getDay();
  return (d + 6) % 7;
}

function toDateStr(year: number, month: number, day: number): string {
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

export function CardCalendar({ entries, canWrite, cardHolders = {}, cardTypes = [], onAdd }: Props) {
  const today = new Date();
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth() + 1);

  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState<Omit<CardEntry, 'rowIndex'>>(EMPTY_DRAFT);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const holders = (type: string): string[] => cardHolders[type] ?? [];

  function prevMonth() {
    if (month === 1) { setYear((y) => y - 1); setMonth(12); }
    else setMonth((m) => m - 1);
  }
  function nextMonth() {
    if (month === 12) { setYear((y) => y + 1); setMonth(1); }
    else setMonth((m) => m + 1);
  }

  function openAddForDate(day: number) {
    setDraft({ ...EMPTY_DRAFT, expenseDate: toDateStr(year, month, day) });
    setAdding(true);
    setError(null);
  }

  async function commitAdd() {
    if (!draft.expenseDate) { setError('사용일자를 입력해주세요.'); return; }
    if (!onAdd) return;
    setSaving(true);
    setError(null);
    try {
      await onAdd(draft);
      setDraft(EMPTY_DRAFT);
      setAdding(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : '추가 실패');
    } finally {
      setSaving(false);
    }
  }

  const daysInMonth = getDaysInMonth(year, month);
  const firstDow = getFirstDayOfWeek(year, month);

  const dateMap: Record<string, CardEntry[]> = {};
  for (const entry of entries) {
    if (!entry.expenseDate) continue;
    const [y, m, d] = entry.expenseDate.split('-').map(Number);
    if (y === year && m === month) {
      const key = String(d);
      if (!dateMap[key]) dateMap[key] = [];
      dateMap[key].push(entry);
    }
  }

  const totalCells = Math.ceil((firstDow + daysInMonth) / 7) * 7;
  const cells: (number | null)[] = [
    ...Array(firstDow).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
    ...Array(totalCells - firstDow - daysInMonth).fill(null),
  ];

  const todayDay = today.getFullYear() === year && today.getMonth() + 1 === month
    ? today.getDate() : -1;

  return (
    <div className="space-y-3">
      {/* 내비게이션 */}
      <div className="flex items-center justify-between">
        <button onClick={prevMonth}
          className="rounded-full p-1.5 text-gray-500 hover:bg-gray-100">
          <ChevronLeft className="h-5 w-5" />
        </button>
        <h3 className="text-base font-semibold text-gray-800">
          {year}년 {month}월
        </h3>
        <button onClick={nextMonth}
          className="rounded-full p-1.5 text-gray-500 hover:bg-gray-100">
          <ChevronRight className="h-5 w-5" />
        </button>
      </div>

      {/* 추가 폼 */}
      {adding && (
        <div className="rounded-[2px] border border-primary/20 bg-blue-50/30 p-3 space-y-2">
          {error && <p className="text-xs text-red-500">{error}</p>}
          <div className="grid grid-cols-6 gap-2">
            <div>
              <label className="mb-0.5 block text-[10px] text-gray-500">비목</label>
              <select value={draft.category} onChange={(e) => setDraft((p) => ({ ...p, category: e.target.value }))} className={selectCls}>
                <option value="">선택</option>
                {CATEGORY_SHEETS.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label className="mb-0.5 block text-[10px] text-gray-500">사용일자</label>
              <input type="date" value={draft.expenseDate} onChange={(e) => setDraft((p) => ({ ...p, expenseDate: e.target.value }))} className={inputCls} />
            </div>
            <div>
              <label className="mb-0.5 block text-[10px] text-gray-500">시간</label>
              <input type="time" value={draft.expenseTime} onChange={(e) => setDraft((p) => ({ ...p, expenseTime: e.target.value }))} className={inputCls} />
            </div>
            <div>
              <label className="mb-0.5 block text-[10px] text-gray-500">건명</label>
              <input type="text" value={draft.description} onChange={(e) => setDraft((p) => ({ ...p, description: e.target.value }))} placeholder="건명" className={inputCls} />
            </div>
            <div>
              <label className="mb-0.5 block text-[10px] text-gray-500">거래처</label>
              <input type="text" value={draft.merchant} onChange={(e) => setDraft((p) => ({ ...p, merchant: e.target.value }))} placeholder="거래처" className={inputCls} />
            </div>
            <div>
              <label className="mb-0.5 block text-[10px] text-gray-500">금액</label>
              <input type="text"
                value={draft.amount > 0 ? formatKRW(draft.amount) : ''}
                onChange={(e) => {
                  const d = e.target.value.replace(/[^0-9]/g, '');
                  setDraft((p) => ({ ...p, amount: Number(d) }));
                }}
                placeholder="0" className={cn(inputCls, 'text-right')} />
            </div>
          </div>
          <div className="grid grid-cols-6 gap-2">
            <div>
              <label className="mb-0.5 block text-[10px] text-gray-500">비고</label>
              <input type="text" value={draft.note} onChange={(e) => setDraft((p) => ({ ...p, note: e.target.value }))} placeholder="비고" className={inputCls} />
            </div>
            <div>
              <label className="mb-0.5 block text-[10px] text-gray-500">사용자</label>
              <input type="text" value={draft.user} onChange={(e) => setDraft((p) => ({ ...p, user: e.target.value }))} placeholder="사용자" className={inputCls} />
            </div>
            <div>
              <label className="mb-0.5 block text-[10px] text-gray-500">카드구분</label>
              <select value={draft.cardType}
                onChange={(e) => setDraft((p) => ({ ...p, cardType: e.target.value, cardHolder: '' }))}
                className={selectCls}>
                <option value="">선택</option>
                {cardTypes.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div>
              <label className="mb-0.5 block text-[10px] text-gray-500">명의자</label>
              <select value={draft.cardHolder}
                onChange={(e) => setDraft((p) => ({ ...p, cardHolder: e.target.value }))}
                className={selectCls}
                disabled={!draft.cardType}>
                <option value="">{draft.cardType ? '선택' : '구분 먼저'}</option>
                {holders(draft.cardType).map((h) => <option key={h} value={h}>{h}</option>)}
              </select>
            </div>
            <div className="col-span-2 flex items-end gap-2">
              <button onClick={() => void commitAdd()} disabled={saving}
                className="flex items-center gap-1 rounded-md bg-complete px-3 py-1 text-xs text-white hover:opacity-90">
                <Check className="h-3.5 w-3.5" /> 저장
              </button>
              <button onClick={() => { setAdding(false); setError(null); }}
                className="flex items-center gap-1 rounded-md border border-gray-200 px-3 py-1 text-xs text-gray-500 hover:bg-gray-100">
                <X className="h-3.5 w-3.5" /> 취소
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 캘린더 그리드 */}
      <div className="rounded-[2px] border border-gray-200 overflow-hidden">
        {/* 요일 헤더 */}
        <div className="grid grid-cols-7 border-b border-gray-200 bg-gray-50">
          {DAY_LABELS.map((d, i) => (
            <div key={d}
              className={cn(
                'py-2 text-center text-xs font-medium',
                i === 5 ? 'text-blue-500' : i === 6 ? 'text-red-500' : 'text-gray-500',
              )}>
              {d}
            </div>
          ))}
        </div>

        {/* 날짜 셀 */}
        <div className="grid grid-cols-7">
          {cells.map((day, idx) => {
            const isToday = day === todayDay;
            const isWeekend = idx % 7 === 5 || idx % 7 === 6;
            const dayEntries = day ? (dateMap[String(day)] ?? []) : [];

            return (
              <div
                key={idx}
                className={cn(
                  'group relative min-h-[90px] border-b border-r border-gray-100 p-1.5',
                  idx % 7 === 6 && 'border-r-0',
                  !day && 'bg-gray-50/30',
                )}
              >
                {day && (
                  <>
                    <div className="mb-1 flex items-center justify-between">
                      <div className={cn(
                        'flex h-6 w-6 items-center justify-center rounded-full text-xs font-medium',
                        isToday ? 'bg-primary text-white' : isWeekend ? 'text-blue-500' : 'text-gray-700',
                      )}>
                        {day}
                      </div>
                      {canWrite && (
                        <button
                          onClick={() => openAddForDate(day)}
                          className="invisible flex h-5 w-5 items-center justify-center rounded-full text-gray-400 hover:bg-primary-bg hover:text-primary group-hover:visible"
                          title="항목 추가"
                        >
                          <Plus className="h-3 w-3" />
                        </button>
                      )}
                    </div>
                    <div className="space-y-0.5">
                      {dayEntries.map((entry, ei) => {
                        const color = ENTRY_COLORS[ei % ENTRY_COLORS.length];
                        const parts = [
                          entry.description,
                          entry.expenseTime,
                          entry.user,
                        ].filter(Boolean);
                        return (
                          <div
                            key={entry.rowIndex}
                            className={cn(
                              'rounded border px-1 py-0.5 text-[10px] leading-tight',
                              color,
                            )}
                            title={`${entry.description} | ${entry.user} | ${entry.expenseTime}`}
                          >
                            {parts.map((p, pi) => (
                              <span key={pi} className={cn(pi > 0 && 'ml-1 opacity-70')}>
                                {p}
                              </span>
                            ))}
                          </div>
                        );
                      })}
                    </div>
                  </>
                )}
              </div>
            );
          })}
        </div>
      </div>

      <div className="flex flex-wrap gap-2 text-xs text-gray-500">
        <span>색상은 같은 날짜 내 항목 순서를 나타냅니다.</span>
      </div>
    </div>
  );
}

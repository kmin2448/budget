'use client';

import React, { useState } from 'react';
import * as XLSX from 'xlsx';
import { formatKRW, parseKRW, cn } from '@/lib/utils';
import { KRWInput } from '@/components/ui/krw-input';
import { Trash2, Plus, Check, X, ChevronDown, ChevronRight, Download } from 'lucide-react';
import { CATEGORY_SHEETS } from '@/constants/sheets';
import type { CardEntry, CardHolders } from '@/hooks/useCardManagement';

interface Props {
  entries: CardEntry[];
  cardHolders: CardHolders;
  cardTypes: string[];
  canWrite: boolean;
  year: string;
  onAdd: (entry: Omit<CardEntry, 'rowIndex'>) => Promise<void>;
  onUpdate: (entry: CardEntry) => Promise<void>;
  onDelete: (rowIndex: number) => Promise<void>;
}

type EditingCell = { rowIndex: number; field: keyof CardEntry } | null;

const EMPTY_DRAFT: Omit<CardEntry, 'rowIndex'> = {
  category: '', expenseDate: '', expenseTime: '',
  description: '', merchant: '', amount: 0,
  note: '', user: '', cardType: '', cardHolder: '',
};

const inputCls = 'w-full rounded border border-primary/40 bg-white px-1 py-0.5 text-xs focus:outline-none focus:border-primary';
const selectCls = 'w-full rounded border border-primary/40 bg-white px-1 py-0.5 text-xs focus:outline-none focus:border-primary';

export function CardManagementTable({ entries, cardHolders, cardTypes, canWrite, year, onAdd, onUpdate, onDelete }: Props) {
  const [editingCell, setEditingCell] = useState<EditingCell>(null);
  const [draftValue, setDraftValue] = useState('');
  const [saving, setSaving] = useState(false);

  const [adding, setAdding] = useState(false);
  const [addDraft, setAddDraft] = useState<Omit<CardEntry, 'rowIndex'>>(EMPTY_DRAFT);
  const [addSaving, setAddSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pastExpanded, setPastExpanded] = useState(false);
  const [viewMode, setViewMode] = useState<'list' | 'monthly'>('list');
  const [selectedMonth, setSelectedMonth] = useState<number>(new Date().getMonth() + 1);

  const todayStr = new Date().toISOString().split('T')[0];

  const filtered = entries.filter((e) => e.expenseDate.startsWith(year));

  // 과거 / 오늘+미래 분리
  const pastEntries = filtered.filter((e) => e.expenseDate < todayStr);
  const currentEntries = filtered.filter((e) => e.expenseDate >= todayStr);

  // 과거 — 날짜별 소그룹 (펼쳤을 때 날짜 구분)
  const pastDateGroups = new Map<string, CardEntry[]>();
  for (const entry of pastEntries) {
    const d = entry.expenseDate || '';
    if (!pastDateGroups.has(d)) pastDateGroups.set(d, []);
    pastDateGroups.get(d)!.push(entry);
  }
  const sortedPastDates = Array.from(pastDateGroups.keys()).sort();

  // 오늘+미래 — 날짜별 그룹
  const currentDateGroups = new Map<string, CardEntry[]>();
  for (const entry of currentEntries) {
    const d = entry.expenseDate || '';
    if (!currentDateGroups.has(d)) currentDateGroups.set(d, []);
    currentDateGroups.get(d)!.push(entry);
  }
  const sortedCurrentDates = Array.from(currentDateGroups.keys()).sort();

  // 월별 그룹 (1~12월)
  const monthGroups = new Map<number, CardEntry[]>();
  for (const entry of filtered) {
    const m = Number(entry.expenseDate.split('-')[1]);
    if (!monthGroups.has(m)) monthGroups.set(m, []);
    monthGroups.get(m)!.push(entry);
  }

  // ── 인라인 편집 ──────────────────────────────────────────────

  function startEdit(entry: CardEntry, field: keyof CardEntry, e: React.MouseEvent) {
    if (!canWrite) return;
    e.stopPropagation();
    setEditingCell({ rowIndex: entry.rowIndex, field });
    const val = entry[field];
    setDraftValue(field === 'amount' ? formatKRW(Number(val)) : String(val ?? ''));
  }

  async function commitEdit(entry: CardEntry) {
    if (!editingCell || saving) return;
    const field = editingCell.field;
    const updated = { ...entry };
    if (field === 'amount') {
      updated.amount = parseKRW(draftValue);
    } else {
      (updated as Record<string, unknown>)[field] = draftValue;
    }
    setEditingCell(null);
    if (JSON.stringify(updated) === JSON.stringify(entry)) return;
    setSaving(true);
    try { await onUpdate(updated); }
    catch (err) { setError(err instanceof Error ? err.message : '수정 실패'); }
    finally { setSaving(false); }
  }

  function cancelEdit() { setEditingCell(null); setDraftValue(''); }

  // ── 행 추가 ──────────────────────────────────────────────────

  async function commitAdd() {
    if (!addDraft.expenseDate) { setError('사용일자를 입력해주세요.'); return; }
    setAddSaving(true);
    setError(null);
    try {
      await onAdd(addDraft);
      setAddDraft(EMPTY_DRAFT);
      setAdding(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : '추가 실패');
    } finally { setAddSaving(false); }
  }

  // ── 삭제 ─────────────────────────────────────────────────────

  async function handleDelete(rowIndex: number, e: React.MouseEvent) {
    e.stopPropagation();
    if (!confirm('이 항목을 삭제하시겠습니까?')) return;
    setSaving(true);
    try { await onDelete(rowIndex); }
    catch (err) { setError(err instanceof Error ? err.message : '삭제 실패'); }
    finally { setSaving(false); }
  }

  // ── 셀 렌더 ──────────────────────────────────────────────────

  function renderCell(entry: CardEntry, field: keyof CardEntry, display?: React.ReactNode) {
    const isEditing = editingCell?.rowIndex === entry.rowIndex && editingCell?.field === field;
    if (isEditing) {
      if (field === 'category') {
        return (
          <select autoFocus value={draftValue} onChange={(e) => setDraftValue(e.target.value)}
            onBlur={() => void commitEdit(entry)} className={selectCls}>
            <option value="">선택</option>
            {CATEGORY_SHEETS.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        );
      }
      if (field === 'cardType') {
        return (
          <select autoFocus value={draftValue} onChange={(e) => setDraftValue(e.target.value)}
            onBlur={() => void commitEdit(entry)} className={selectCls}>
            <option value="">선택</option>
            {cardTypes.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        );
      }
      if (field === 'cardHolder') {
        const holderList = holders(entry.cardType);
        return (
          <select autoFocus value={draftValue} onChange={(e) => setDraftValue(e.target.value)}
            onBlur={() => void commitEdit(entry)} className={selectCls}>
            <option value="">선택</option>
            {holderList.map((h) => <option key={h} value={h}>{h}</option>)}
          </select>
        );
      }
      if (field === 'amount') {
        return (
          <KRWInput
            autoFocus
            value={draftValue}
            onChange={setDraftValue}
            onBlur={() => void commitEdit(entry)}
            onKeyDown={(e) => { if (e.key === 'Enter') void commitEdit(entry); if (e.key === 'Escape') cancelEdit(); }}
            className={cn(inputCls, 'text-right')}
          />
        );
      }
      if (field === 'expenseDate') {
        return (
          <input autoFocus type="date" value={draftValue}
            onChange={(e) => setDraftValue(e.target.value)}
            onBlur={() => void commitEdit(entry)}
            onKeyDown={(e) => { if (e.key === 'Enter') void commitEdit(entry); if (e.key === 'Escape') cancelEdit(); }}
            className={inputCls} />
        );
      }
      return (
        <input autoFocus type="text" value={draftValue}
          onChange={(e) => setDraftValue(e.target.value)}
          onBlur={() => void commitEdit(entry)}
          onKeyDown={(e) => { if (e.key === 'Enter') void commitEdit(entry); if (e.key === 'Escape') cancelEdit(); }}
          className={inputCls} />
      );
    }
    return (
      <div
        className={cn('truncate', canWrite && 'cursor-text rounded hover:bg-primary-bg/30')}
        onClick={canWrite ? (e) => startEdit(entry, field, e) : undefined}
        title={canWrite ? '클릭하여 수정' : undefined}
      >
        {display ?? (String(entry[field] ?? '') || <span className="text-gray-300">-</span>)}
      </div>
    );
  }

  const holders = (type: string): string[] => cardHolders[type] ?? [];

  function exportToExcel(data: CardEntry[], label: string) {
    const rows = data.map((e) => ({
      '비목': e.category,
      '사용일자': e.expenseDate,
      '시간': e.expenseTime,
      '건명': e.description,
      '거래처': e.merchant,
      '금액': e.amount,
      '비고': e.note,
      '사용자': e.user,
      '카드구분': e.cardType,
      '명의자': e.cardHolder,
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, '카드관리');
    XLSX.writeFile(wb, `카드관리_${label}.xlsx`);
  }

  function renderEntryRow(entry: CardEntry, i: number, isToday: boolean) {
    const isZeroAmount = entry.amount === 0;
    return (
      <tr key={entry.rowIndex}
        className={cn(
          'border-b border-gray-100 transition-colors hover:bg-gray-50/60',
          isToday ? 'bg-red-50' : i % 2 === 0 ? 'bg-white' : 'bg-gray-50/30',
          isZeroAmount && 'text-blue-500',
        )}>
        <td className="px-2 py-1.5">{renderCell(entry, 'category')}</td>
        <td className="px-2 py-1.5">{renderCell(entry, 'expenseDate')}</td>
        <td className="px-2 py-1.5">{renderCell(entry, 'expenseTime')}</td>
        <td className="px-2 py-1.5">{renderCell(entry, 'description')}</td>
        <td className="px-2 py-1.5">{renderCell(entry, 'merchant')}</td>
        <td className="px-2 py-1.5 text-right">
          {editingCell?.rowIndex === entry.rowIndex && editingCell.field === 'amount'
            ? renderCell(entry, 'amount')
            : (
              <div className={cn('text-right tabular-nums', canWrite && 'cursor-text rounded hover:bg-primary-bg/30')}
                onClick={canWrite ? (e) => startEdit(entry, 'amount', e) : undefined}
                title={canWrite ? '클릭하여 수정' : undefined}>
                {formatKRW(entry.amount)}
              </div>
            )}
        </td>
        <td className="px-2 py-1.5">{renderCell(entry, 'note')}</td>
        <td className="px-2 py-1.5">{renderCell(entry, 'user')}</td>
        <td className="px-2 py-1.5">
          {editingCell?.rowIndex === entry.rowIndex && editingCell.field === 'cardType' ? (
            <select autoFocus value={draftValue} onChange={(e) => setDraftValue(e.target.value)}
              onBlur={() => void commitEdit(entry)} className={selectCls}>
              <option value="">선택</option>
              {cardTypes.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          ) : (
            <div className={cn('truncate', canWrite && 'cursor-text rounded hover:bg-primary-bg/30')}
              onClick={canWrite ? (e) => startEdit(entry, 'cardType', e) : undefined}
              title={canWrite ? '클릭하여 수정' : undefined}>
              {entry.cardType
                ? <span className="rounded-full bg-primary-bg px-1.5 py-0.5 text-[10px] font-medium text-primary">{entry.cardType}</span>
                : <span className="text-gray-300">-</span>}
            </div>
          )}
        </td>
        <td className="px-2 py-1.5">{renderCell(entry, 'cardHolder')}</td>
        {canWrite && (
          <td className="px-1 py-1.5 text-center">
            <button onClick={(e) => void handleDelete(entry.rowIndex, e)}
              disabled={saving}
              className="rounded p-1 text-gray-300 hover:bg-red-50 hover:text-red-400">
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </td>
        )}
      </tr>
    );
  }

  return (
    <div className="space-y-2">
      {/* 헤더 툴바 */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          {/* 탭 */}
          <div className="flex items-center gap-1 rounded-lg border border-gray-200 bg-gray-50 p-0.5">
            <button
              onClick={() => setViewMode('list')}
              className={cn(
                'rounded-md px-2.5 py-1 text-xs font-medium transition-colors',
                viewMode === 'list' ? 'bg-white text-primary shadow-sm' : 'text-gray-500 hover:text-gray-700',
              )}
            >
              집행내역 <span className="font-normal text-gray-400">({filtered.length}건)</span>
            </button>
            <button
              onClick={() => setViewMode('monthly')}
              className={cn(
                'rounded-md px-2.5 py-1 text-xs font-medium transition-colors',
                viewMode === 'monthly' ? 'bg-white text-primary shadow-sm' : 'text-gray-500 hover:text-gray-700',
              )}
            >
              월별
            </button>
          </div>

          {/* 월 선택 (월별 뷰일 때만) */}
          {viewMode === 'monthly' && (
            <select
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(Number(e.target.value))}
              className="rounded-md border border-gray-200 bg-white px-2 py-1 text-xs text-gray-700 focus:outline-none focus:ring-1 focus:ring-primary"
            >
              {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
                <option key={m} value={m}>{m}월</option>
              ))}
            </select>
          )}
        </div>

        <div className="flex items-center gap-1.5">
          {/* 엑셀 내보내기 */}
          <button
            onClick={() => {
              const data = viewMode === 'monthly'
                ? (monthGroups.get(selectedMonth) ?? [])
                : filtered;
              const label = viewMode === 'monthly' ? `${year}_${selectedMonth}월` : year;
              exportToExcel(data, label);
            }}
            className="flex items-center gap-1 rounded-md border border-gray-200 bg-white px-2.5 py-1.5 text-xs text-gray-600 hover:bg-gray-50"
            title="엑셀로 내보내기"
          >
            <Download className="h-3.5 w-3.5" /> 내보내기
          </button>

          {canWrite && !adding && (
            <button onClick={() => { setAdding(true); setAddDraft(EMPTY_DRAFT); setError(null); }}
              className="flex items-center gap-1 rounded-md border border-gray-200 bg-white px-2.5 py-1.5 text-xs text-gray-600 hover:bg-gray-50">
              <Plus className="h-3.5 w-3.5" /> 행 추가
            </button>
          )}
        </div>
      </div>

      {error && <p className="text-xs text-red-500">{error}</p>}

      <div className="rounded-[2px] border border-gray-200 overflow-hidden">
        <table className="w-full table-fixed text-xs">
          <thead>
            <tr className="border-b border-gray-200 bg-gray-50 text-left font-medium text-gray-500">
              <th className="px-2 py-2 w-[9%]">비목</th>
              <th className="px-2 py-2 w-[8%]">사용일자</th>
              <th className="px-2 py-2 w-[5%]">시간</th>
              <th className="px-2 py-2 w-[12%]">건명</th>
              <th className="px-2 py-2 w-[8%]">거래처</th>
              <th className="px-2 py-2 w-[8%] text-right">금액</th>
              <th className="px-2 py-2 w-[6%]">비고</th>
              <th className="px-2 py-2 w-[7%]">사용자</th>
              <th className="px-2 py-2 w-[9%]">카드구분</th>
              <th className="px-2 py-2 w-[11%]">명의자</th>
              {canWrite && <th className="w-[5%]" />}
            </tr>
          </thead>
          <tbody>
            {/* 행 추가 입력 폼 */}
            {adding && (
              <tr className="border-b border-primary/20 bg-blue-50/30">
                <td className="px-1 py-1.5">
                  <select value={addDraft.category} onChange={(e) => setAddDraft((p) => ({ ...p, category: e.target.value }))} className={selectCls}>
                    <option value="">비목</option>
                    {CATEGORY_SHEETS.map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                </td>
                <td className="px-1 py-1.5">
                  <input type="date" value={addDraft.expenseDate} onChange={(e) => setAddDraft((p) => ({ ...p, expenseDate: e.target.value }))} className={inputCls} />
                </td>
                <td className="px-1 py-1.5">
                  <input type="time" value={addDraft.expenseTime} onChange={(e) => setAddDraft((p) => ({ ...p, expenseTime: e.target.value }))} className={inputCls} />
                </td>
                <td className="px-1 py-1.5">
                  <input type="text" value={addDraft.description} onChange={(e) => setAddDraft((p) => ({ ...p, description: e.target.value }))} placeholder="건명" className={inputCls} />
                </td>
                <td className="px-1 py-1.5">
                  <input type="text" value={addDraft.merchant} onChange={(e) => setAddDraft((p) => ({ ...p, merchant: e.target.value }))} placeholder="거래처" className={inputCls} />
                </td>
                <td className="px-1 py-1.5">
                  <KRWInput
                    value={addDraft.amount > 0 ? formatKRW(addDraft.amount) : ''}
                    onChange={(formatted) => setAddDraft((p) => ({ ...p, amount: parseKRW(formatted) }))}
                    placeholder="0"
                    className={cn(inputCls, 'text-right')}
                  />
                </td>
                <td className="px-1 py-1.5">
                  <input type="text" value={addDraft.note} onChange={(e) => setAddDraft((p) => ({ ...p, note: e.target.value }))} placeholder="비고" className={inputCls} />
                </td>
                <td className="px-1 py-1.5">
                  <input type="text" value={addDraft.user} onChange={(e) => setAddDraft((p) => ({ ...p, user: e.target.value }))} placeholder="사용자" className={inputCls} />
                </td>
                <td className="px-1 py-1.5">
                  <select value={addDraft.cardType}
                    onChange={(e) => setAddDraft((p) => ({ ...p, cardType: e.target.value, cardHolder: '' }))}
                    className={selectCls}>
                    <option value="">구분</option>
                    {cardTypes.map((t) => <option key={t} value={t}>{t}</option>)}
                  </select>
                </td>
                <td className="px-1 py-1.5">
                  <select value={addDraft.cardHolder}
                    onChange={(e) => setAddDraft((p) => ({ ...p, cardHolder: e.target.value }))}
                    className={selectCls}
                    disabled={!addDraft.cardType}>
                    <option value="">{addDraft.cardType ? '명의자 선택' : '구분 먼저'}</option>
                    {holders(addDraft.cardType).map((h) => (
                      <option key={h} value={h}>{h}</option>
                    ))}
                  </select>
                </td>
                <td className="px-1 py-1.5">
                  <div className="flex gap-0.5 justify-center">
                    <button onClick={() => void commitAdd()} disabled={addSaving}
                      className="rounded p-1 text-complete hover:bg-green-50" title="저장">
                      <Check className="h-3.5 w-3.5" />
                    </button>
                    <button onClick={() => { setAdding(false); setError(null); }}
                      className="rounded p-1 text-gray-400 hover:bg-gray-100" title="취소">
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </td>
              </tr>
            )}

            {filtered.length === 0 && !adding && (
              <tr>
                <td colSpan={canWrite ? 11 : 10} className="py-10 text-center text-gray-400">
                  집행내역이 없습니다.
                </td>
              </tr>
            )}

            {/* ── 집행내역 뷰 ── */}
            {viewMode === 'list' && (
              <>
                {/* 이전 내역 (하나로 묶음) */}
                {pastEntries.length > 0 && (
                  <React.Fragment key="past-group">
                    <tr
                      className="cursor-pointer border-b border-gray-200 bg-gray-100/70 hover:bg-gray-200/60"
                      onClick={() => setPastExpanded((v) => !v)}>
                      <td colSpan={canWrite ? 11 : 10} className="px-2 py-1.5">
                        <div className="flex items-center gap-2 text-xs font-medium text-gray-500">
                          {pastExpanded
                            ? <ChevronDown className="h-3.5 w-3.5 text-gray-400" />
                            : <ChevronRight className="h-3.5 w-3.5 text-gray-400" />}
                          <span>이전 내역 보기</span>
                          <span className="font-normal text-gray-400">
                            ({pastEntries.length}건 · {formatKRW(pastEntries.reduce((s, e) => s + e.amount, 0))}원)
                          </span>
                        </div>
                      </td>
                    </tr>
                    {pastExpanded && sortedPastDates.map((dateStr) => {
                      const group = pastDateGroups.get(dateStr)!;
                      return group.map((entry, i) => renderEntryRow(entry, i, false));
                    })}
                  </React.Fragment>
                )}
                {/* 오늘 & 미래 */}
                {sortedCurrentDates.map((dateStr) => {
                  const group = currentDateGroups.get(dateStr)!;
                  const isToday = dateStr === todayStr;
                  return group.map((entry, i) => renderEntryRow(entry, i, isToday));
                })}
              </>
            )}

            {/* ── 월별 뷰 ── */}
            {viewMode === 'monthly' && (() => {
              const group = monthGroups.get(selectedMonth) ?? [];
              if (group.length === 0) return (
                <tr>
                  <td colSpan={canWrite ? 11 : 10} className="py-10 text-center text-gray-400">
                    {selectedMonth}월 집행내역이 없습니다.
                  </td>
                </tr>
              );
              const monthTotal = group.reduce((s, e) => s + e.amount, 0);
              return (
                <React.Fragment key={`month-${selectedMonth}`}>
                  <tr className="border-b border-gray-200 bg-primary/5">
                    <td colSpan={canWrite ? 11 : 10} className="px-2 py-1.5">
                      <div className="flex items-center gap-2 text-xs font-semibold text-primary">
                        <span>{selectedMonth}월</span>
                        <span className="font-normal text-gray-400">({group.length}건 · {formatKRW(monthTotal)}원)</span>
                      </div>
                    </td>
                  </tr>
                  {group.map((entry, i) => {
                    const isToday = entry.expenseDate === todayStr;
                    return renderEntryRow(entry, i, isToday);
                  })}
                </React.Fragment>
              );
            })()}
          </tbody>

          {filtered.length > 0 && (
            <tfoot>
              <tr className="border-t-2 border-gray-200 bg-gray-50">
                <td colSpan={5} className="px-2 py-2 font-semibold text-gray-600">합계</td>
                <td className="px-2 py-2 text-right tabular-nums font-bold text-gray-800">
                  {formatKRW(filtered.reduce((s, e) => s + e.amount, 0))}
                </td>
                <td colSpan={canWrite ? 5 : 4} />
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  );
}

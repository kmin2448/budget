// components/expenditure/ExpenditureTable.tsx
'use client';

import { useState, useEffect } from 'react';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { KRWInput } from '@/components/ui/krw-input';
import { formatKRW, parseKRW } from '@/lib/utils';
import { cn } from '@/lib/utils';
import {
  Pencil, Trash2, Upload, ExternalLink, Plus,
  ChevronUp, ChevronDown, ChevronRight, GripVertical, X, Search, Merge, Scissors, CalendarDays, FileText,
} from 'lucide-react';
import { MONTH_COLUMNS, PERSONNEL_CATEGORY } from '@/constants/sheets';
import { useBudgetType } from '@/contexts/BudgetTypeContext';
import { PersonnelMonthInputModal } from './PersonnelMonthInputModal';
import type { ExpenditureDetailRow } from '@/types';

type MonthFile = { monthIndex: number; fileId: string; fileUrl: string };

interface InlineEditState {
  rowIndex: number;
  field: 'programName' | 'description' | 'expenseDate';
  value: string;
  originalRow: ExpenditureDetailRow;
}

interface ExpenditureTableProps {
  rows: ExpenditureDetailRow[];
  canWrite: boolean;
  category: string;
  onAdd: () => void;
  onEdit: (row: ExpenditureDetailRow) => void;
  onDelete: (row: ExpenditureDetailRow) => void;
  onUpload: (row: ExpenditureDetailRow, monthIndex?: number) => void;
  onDeleteFile: (row: ExpenditureDetailRow, monthIndex?: number) => void;
  onPersonnelBatchUpdate?: (updates: { rowIndex: number; monthlyAmounts: number[] }[]) => Promise<void>;
  onMoveMonth?: (
    row: ExpenditureDetailRow,
    sourceMonthIdx: number,
    targetMonthIdx: number,
  ) => Promise<void>;
  onUpdate?: (
    row: ExpenditureDetailRow,
    changes: { programName?: string; description?: string; expenseDate?: string; monthlyAmounts?: number[] },
  ) => Promise<void>;
  onMerge?: (rowIndexes: number[], description: string, programName: string) => Promise<void>;
  onSplit?: (mergeId: string, mergedRowIndex: number, subItemIndexes: number[]) => Promise<void>;
  highlightRowIndex?: number;
}

interface MonthGroup {
  label: string;
  monthIdx: number;
  entries: { row: ExpenditureDetailRow; monthAmount: number }[];
}

interface DragState {
  row: ExpenditureDetailRow;
  sourceMonthIdx: number;
}

function getDefaultCollapsedGroups(): Set<number> {
  const today = new Date();
  const calMonth = today.getMonth() + 1;
  const prevCalMonth = calMonth === 1 ? 12 : calMonth - 1;
  const currentFiscalIdx = (calMonth - 3 + 12) % 12;
  const prevFiscalIdx    = (prevCalMonth - 3 + 12) % 12;
  const collapsed = new Set<number>();
  for (let i = 0; i < 12; i++) {
    if (i !== currentFiscalIdx && i !== prevFiscalIdx) collapsed.add(i);
  }
  return collapsed;
}

function groupByMonthlyAmounts(rows: ExpenditureDetailRow[]): MonthGroup[] {
  const groups: MonthGroup[] = [];
  for (let i = 0; i < MONTH_COLUMNS.length; i++) {
    const entries = rows
      .filter((row) => row.monthlyAmounts[i] > 0)
      .map((row) => ({ row, monthAmount: row.monthlyAmounts[i] }));
    if (entries.length > 0) {
      groups.push({ label: MONTH_COLUMNS[i], monthIdx: i, entries });
    }
  }
  return groups;
}

function getActiveMonths(row: ExpenditureDetailRow): string[] {
  return (MONTH_COLUMNS as readonly string[]).filter((_, i) => row.monthlyAmounts[i] > 0);
}

export function ExpenditureTable({
  rows, canWrite, category, onAdd, onEdit, onDelete, onUpload, onDeleteFile, onMoveMonth, onUpdate,
  onMerge, onSplit, highlightRowIndex, onPersonnelBatchUpdate,
}: ExpenditureTableProps) {
  const { budgetType } = useBudgetType();
  const monthCount = budgetType === 'carryover' ? 4 : 12;
  const [searchQuery, setSearchQuery] = useState('');

  // 비목 탭 전환 시 검색어 초기화
  useEffect(() => { setSearchQuery(''); }, [category]);

  const filteredRows = searchQuery.trim()
    ? rows.filter((row) => {
        const q = searchQuery.toLowerCase();
        return (
          row.programName?.toLowerCase().includes(q) ||
          row.description?.toLowerCase().includes(q)
        );
      })
    : rows;

  const [expandedKey, setExpandedKey] = useState<string | null>(null);
  const [collapsedGroups, setCollapsedGroups] = useState<Set<number>>(getDefaultCollapsedGroups);
  const [dragState, setDragState] = useState<DragState | null>(null);
  const [dragOverMonthIdx, setDragOverMonthIdx] = useState<number | null>(null);
  const [movingKey, setMovingKey] = useState<string | null>(null);

  // 편집 모드 (내부 상태)
  const [editMode, setEditMode] = useState(false);
  const [inlineEdit, setInlineEdit] = useState<InlineEditState | null>(null);

  // 합치기 모드
  const [mergeMode, setMergeMode]             = useState(false);
  const [selectedForMerge, setSelectedForMerge] = useState<Set<number>>(new Set());
  const [mergeModalOpen, setMergeModalOpen]   = useState(false);
  const [mergeDesc, setMergeDesc]             = useState('');
  const [mergeProgramName, setMergeProgramName] = useState('');
  const [merging, setMerging]                 = useState(false);
  const [monthEdit, setMonthEdit] = useState<{
    rowIndex: number;
    monthIdx: number;
    value: string;
    originalRow: ExpenditureDetailRow;
  } | null>(null);
  const [savingInline, setSavingInline] = useState(false);

  // 인건비 월별 금액 입력 모달
  const [personnelMonthModalOpen, setPersonnelMonthModalOpen] = useState(false);

  // 별건으로 빼기
  const [splitTarget, setSplitTarget] = useState<{
    row: ExpenditureDetailRow;
    selectedIndexes: Set<number>;
  } | null>(null);
  const [splitting, setSplitting] = useState(false);

  const isPersonnel = category === PERSONNEL_CATEGORY;
  const canMerge    = !!onMerge && !isPersonnel;
  const showActions = canWrite && editMode; // 삭제/이동 등 파괴적 액션
  // 병합 모드: 체크박스 열 1개 추가
  const colCount = isPersonnel
    ? (showActions ? 5 : 4)
    : mergeMode ? 7 : (showActions ? 7 : 6);
  const groups = isPersonnel ? null : groupByMonthlyAmounts(filteredRows);

  // ── 하이라이트 행 자동 펼침 + 스크롤 ─────────────────────────────
  useEffect(() => {
    if (!highlightRowIndex || rows.length === 0) return;
    // 모든 월 그룹 펼치기
    setCollapsedGroups(new Set());
    // DOM 업데이트 후 스크롤
    const id = setTimeout(() => {
      const el = document.querySelector<HTMLElement>(`[data-row-index="${highlightRowIndex}"]`);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }, 150);
    return () => clearTimeout(id);
  }, [highlightRowIndex, rows.length]);

  // ── 인라인 편집 ────────────────────────────────────────────────

  function startInlineEdit(
    row: ExpenditureDetailRow,
    field: InlineEditState['field'],
    e: React.MouseEvent,
  ) {
    e.stopPropagation();
    if (!canWrite || !onUpdate) return;
    setInlineEdit({
      rowIndex: row.rowIndex,
      field,
      value: (row[field as keyof ExpenditureDetailRow] as string) || '',
      originalRow: row,
    });
  }

  async function saveInlineEdit() {
    if (!inlineEdit || !onUpdate || savingInline) return;
    const { originalRow, field, value } = inlineEdit;
    const originalValue = (originalRow[field as keyof ExpenditureDetailRow] as string) || '';
    setInlineEdit(null);
    if (value.trim() === originalValue.trim()) return;
    setSavingInline(true);
    try {
      await onUpdate(originalRow, { [field]: value });
    } finally {
      setSavingInline(false);
    }
  }

  function startMonthEdit(row: ExpenditureDetailRow, monthIdx: number, e: React.MouseEvent) {
    e.stopPropagation();
    if (!canWrite || !onUpdate) return;
    setMonthEdit({
      rowIndex: row.rowIndex,
      monthIdx,
      value: row.monthlyAmounts[monthIdx] > 0 ? formatKRW(row.monthlyAmounts[monthIdx]) : '',
      originalRow: row,
    });
  }

  async function saveMonthEdit() {
    if (!monthEdit || !onUpdate || savingInline) return;
    const { originalRow, monthIdx, value } = monthEdit;
    const newAmount = parseKRW(value);
    setMonthEdit(null);
    if (newAmount === originalRow.monthlyAmounts[monthIdx]) return;
    const newMonthlyAmounts = [...originalRow.monthlyAmounts];
    newMonthlyAmounts[monthIdx] = newAmount;
    setSavingInline(true);
    try {
      await onUpdate(originalRow, { monthlyAmounts: newMonthlyAmounts });
    } finally {
      setSavingInline(false);
    }
  }

  // ── 병합 모드 ────────────────────────────────────────────────

  function handleStartMergeMode() {
    setEditMode(false);
    setInlineEdit(null);
    setMonthEdit(null);
    setMergeMode(true);
    setSelectedForMerge(new Set());
  }

  function handleCancelMergeMode() {
    setMergeMode(false);
    setSelectedForMerge(new Set());
    setMergeModalOpen(false);
  }

  function toggleMergeSelect(rowIndex: number) {
    setSelectedForMerge((prev) => {
      const next = new Set(prev);
      if (next.has(rowIndex)) next.delete(rowIndex);
      else next.add(rowIndex);
      return next;
    });
  }

  function handleOpenMergeModal() {
    const firstRow = filteredRows.find((r) => selectedForMerge.has(r.rowIndex));
    setMergeDesc('');
    setMergeProgramName(firstRow?.programName ?? '');
    setMergeModalOpen(true);
  }

  async function handleMergeConfirm() {
    if (!onMerge || !mergeDesc.trim() || merging) return;
    setMerging(true);
    try {
      await onMerge(Array.from(selectedForMerge), mergeDesc.trim(), mergeProgramName.trim());
      setMergeModalOpen(false);
      handleCancelMergeMode();
    } catch (err) {
      alert(err instanceof Error ? err.message : '합치기 중 오류가 발생했습니다.');
    } finally {
      setMerging(false);
    }
  }

  function handleCompleteEditMode() {
    if (inlineEdit && onUpdate) {
      const { originalRow, field, value } = inlineEdit;
      const originalValue = (originalRow[field as keyof ExpenditureDetailRow] as string) || '';
      if (value.trim() !== originalValue.trim()) {
        void onUpdate(originalRow, { [field]: value });
      }
    }
    setInlineEdit(null);
    setEditMode(false);
  }

  function handleCancelEditMode() {
    setInlineEdit(null);
    setMonthEdit(null);
    setEditMode(false);
  }

  function renderInlineInput(field: InlineEditState['field']) {
    return (
      <input
        autoFocus
        type={field === 'expenseDate' ? 'date' : 'text'}
        className="w-full rounded border border-primary/40 bg-white px-1.5 py-0.5 text-sm outline-none focus:border-primary"
        value={inlineEdit!.value}
        onChange={(e) => setInlineEdit((prev) => prev ? { ...prev, value: e.target.value } : null)}
        onBlur={() => void saveInlineEdit()}
        onKeyDown={(e) => {
          if (e.key === 'Enter') { e.preventDefault(); void saveInlineEdit(); }
          if (e.key === 'Escape') { e.preventDefault(); setInlineEdit(null); }
        }}
        onClick={(e) => e.stopPropagation()}
      />
    );
  }

  // ── 토글 ────────────────────────────────────────────────────────

  function toggleExpand(key: string) {
    setExpandedKey((prev) => (prev === key ? null : key));
  }

  function toggleGroup(monthIdx: number) {
    setCollapsedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(monthIdx)) next.delete(monthIdx);
      else next.add(monthIdx);
      return next;
    });
  }

  // ── 드래그 앤 드롭 ──────────────────────────────────────────────

  function handleDragStart(
    e: React.DragEvent<HTMLTableRowElement>,
    row: ExpenditureDetailRow,
    sourceMonthIdx: number,
  ) {
    setDragState({ row, sourceMonthIdx });
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', `${row.rowIndex}-${sourceMonthIdx}`);
  }

  function handleDragEnd() {
    setDragState(null);
    setDragOverMonthIdx(null);
  }

  function handleGroupDragEnter(e: React.DragEvent<HTMLTableRowElement>, monthIdx: number) {
    if (!dragState || monthIdx === dragState.sourceMonthIdx) return;
    e.preventDefault();
    setDragOverMonthIdx(monthIdx);
  }

  function handleGroupDragOver(e: React.DragEvent<HTMLTableRowElement>, monthIdx: number) {
    if (!dragState || monthIdx === dragState.sourceMonthIdx) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  }

  async function handleGroupDrop(e: React.DragEvent<HTMLTableRowElement>, targetMonthIdx: number) {
    e.preventDefault();
    if (!dragState || targetMonthIdx === dragState.sourceMonthIdx || !onMoveMonth) return;

    const key = `${dragState.row.rowIndex}-${dragState.sourceMonthIdx}→${targetMonthIdx}`;
    setMovingKey(key);
    setDragOverMonthIdx(null);
    setDragState(null);
    try {
      await onMoveMonth(dragState.row, dragState.sourceMonthIdx, targetMonthIdx);
    } finally {
      setMovingKey(null);
    }
  }

  // ── 행 렌더 ─────────────────────────────────────────────────────

  function renderDataRow(
    row: ExpenditureDetailRow,
    expandKey: string,
    monthIdx?: number,
    monthAmount?: number,
    activeMonths?: string[],
  ) {
    const isExpanded = expandedKey === expandKey;
    const multiMonths = activeMonths && activeMonths.length > 1;
    const isDragging =
      dragState?.row.rowIndex === row.rowIndex &&
      dragState?.sourceMonthIdx === monthIdx;
    const isMoving = movingKey?.startsWith(`${row.rowIndex}-${monthIdx ?? ''}`) ?? false;
    const draggable = showActions && !isPersonnel && monthIdx !== undefined;

    const showMonthAmount =
      monthAmount !== undefined && monthAmount !== row.totalAmount;

    const isEditingProgramName =
      inlineEdit?.rowIndex === row.rowIndex && inlineEdit?.field === 'programName';
    const isEditingDescription =
      inlineEdit?.rowIndex === row.rowIndex && inlineEdit?.field === 'description';
    const isEditingDate =
      inlineEdit?.rowIndex === row.rowIndex && inlineEdit?.field === 'expenseDate';

    const isHighlighted  = highlightRowIndex === row.rowIndex;
    const isMergeSelected = mergeMode && selectedForMerge.has(row.rowIndex);

    return [
      <TableRow
        key={`row-${expandKey}`}
        data-row-index={row.rowIndex}
        draggable={draggable}
        onDragStart={draggable ? (e) => handleDragStart(e, row, monthIdx!) : undefined}
        onDragEnd={draggable ? handleDragEnd : undefined}
        className={cn(
          'border-b border-gray-100 transition-colors',
          draggable && !mergeMode ? 'cursor-grab active:cursor-grabbing' : '',
          !editMode && !mergeMode && 'cursor-pointer',
          mergeMode && !isPersonnel && 'cursor-pointer',
          'hover:bg-gray-50/60',
          isExpanded && 'bg-gray-50/40',
          isDragging && 'opacity-40',
          isMoving && 'animate-pulse opacity-60',
          isHighlighted && 'bg-red-50 ring-1 ring-inset ring-red-200',
          isMergeSelected && 'bg-primary-bg/40 ring-1 ring-inset ring-primary/20',
        )}
        onClick={
          mergeMode && !isPersonnel
            ? () => toggleMergeSelect(row.rowIndex)
            : editMode
              ? undefined
              : () => toggleExpand(expandKey)
        }
      >
        {/* 합치기 모드 체크박스 열 */}
        {mergeMode && !isPersonnel && (
          <TableCell
            className="w-8 py-2 pl-3"
            onClick={(e) => e.stopPropagation()}
          >
            <input
              type="checkbox"
              checked={isMergeSelected}
              onChange={() => toggleMergeSelect(row.rowIndex)}
              className="h-3.5 w-3.5 cursor-pointer accent-primary"
            />
          </TableCell>
        )}

        {/* 펼침 아이콘 */}
        <TableCell
          className="py-2 pl-3 text-gray-300 cursor-pointer"
          onClick={(e) => {
            e.stopPropagation();
            toggleExpand(expandKey);
          }}
        >
          {isExpanded
            ? <ChevronDown className="h-3.5 w-3.5" />
            : <ChevronRight className="h-3.5 w-3.5" />}
        </TableCell>

        {isPersonnel ? (
          <>
            <TableCell
              className="max-w-0 overflow-hidden py-2 text-gray-700"
              onDoubleClick={canWrite ? (e) => startInlineEdit(row, 'programName', e) : undefined}
              title={canWrite && onUpdate ? '더블클릭하여 편집' : undefined}
            >
              {isEditingProgramName
                ? renderInlineInput('programName')
                : <span className={cn('block truncate text-sm', canWrite && onUpdate && 'cursor-text')} title={row.programName}>{row.programName || '-'}</span>
              }
            </TableCell>
            <TableCell
              className="py-2 text-right text-sm font-medium tabular-nums text-gray-800"
              onDoubleClick={canWrite ? (e) => { e.stopPropagation(); onEdit(row); } : undefined}
              title={canWrite ? '더블클릭하여 편집' : undefined}
            >
              <span className={cn(canWrite && 'cursor-pointer')}>{formatKRW(row.totalAmount)}</span>
            </TableCell>
            {/* 인건비 청구서 — 월별 업로드 개수 표시 (실제 업로드는 펼침 행에서) */}
            <TableCell className="w-16 py-2 text-center" onClick={(e) => e.stopPropagation()}>
              {(row.monthFiles?.length ?? 0) > 0 ? (
                <span className="inline-flex items-center gap-0.5 text-xs text-green-600">
                  <span className="inline-block h-2 w-2 rounded-full bg-green-500" />
                  {row.monthFiles!.length}건
                </span>
              ) : (
                <span className="text-xs text-gray-300">-</span>
              )}
            </TableCell>
          </>
        ) : (
          <>
            {/* 구분(프로그램명) */}
            <TableCell
              className="w-44 max-w-[11rem] overflow-hidden py-2"
              onDoubleClick={canWrite ? (e) => startInlineEdit(row, 'programName', e) : undefined}
              title={canWrite && onUpdate ? '더블클릭하여 편집' : undefined}
            >
              {isEditingProgramName ? (
                renderInlineInput('programName')
              ) : (
                <div className="flex min-w-0 items-center gap-1">
                  {draggable && (
                    <GripVertical className="h-3.5 w-3.5 shrink-0 text-gray-200" />
                  )}
                  <span
                    className={cn('block truncate text-[10px] text-gray-500', canWrite && onUpdate && 'cursor-text')}
                    title={row.programName}
                  >
                    {row.programName || '-'}
                  </span>
                </div>
              )}
            </TableCell>

            {/* 지출건명 + 월 태그 */}
            <TableCell
              className="w-[21rem] max-w-[21rem] overflow-hidden py-2 text-sm text-gray-700"
              onDoubleClick={canWrite ? (e) => startInlineEdit(row, 'description', e) : undefined}
              title={canWrite && onUpdate ? '더블클릭하여 편집' : undefined}
            >
              {isEditingDescription ? (
                renderInlineInput('description')
              ) : (
                <div className="flex min-w-0 items-center gap-1">
                  <span
                    className={cn('shrink truncate', canWrite && onUpdate && 'cursor-text')}
                    title={row.description}
                  >
                    {row.description || '-'}
                  </span>
                  {row.mergeInfo && (
                    <span className="shrink-0 rounded border border-amber-200 bg-amber-50 px-1 py-0.5 text-[10px] font-medium text-amber-600">
                      합산
                    </span>
                  )}
                  {multiMonths && activeMonths.map((m) => (
                    <span
                      key={m}
                      className="shrink-0 rounded bg-blue-50 px-1 py-0.5 text-[10px] font-medium text-blue-400"
                    >
                      {m}
                    </span>
                  ))}
                </div>
              )}
            </TableCell>

            {/* 집행금액 — 더블클릭 시 전체 편집 모달 */}
            <TableCell
              className="w-36 py-2 text-right text-sm font-semibold tabular-nums text-gray-800"
              onDoubleClick={canWrite ? (e) => { e.stopPropagation(); onEdit(row); } : undefined}
              title={canWrite ? '더블클릭하여 편집' : undefined}
            >
              <div className={cn('flex flex-col items-end', canWrite && 'cursor-pointer')}>
                <span>{formatKRW(row.totalAmount)}</span>
                {showMonthAmount && (
                  <span className="text-xs font-normal text-gray-400">
                    ({formatKRW(monthAmount)})
                  </span>
                )}
              </div>
            </TableCell>

            {/* 지출일자 */}
            <TableCell
              className="w-28 py-2 text-center"
              onDoubleClick={canWrite ? (e) => startInlineEdit(row, 'expenseDate', e) : undefined}
              title={canWrite && onUpdate ? '더블클릭하여 편집' : undefined}
            >
              {isEditingDate ? (
                renderInlineInput('expenseDate')
              ) : row.status === 'complete' ? (
                <span className={cn('text-xs text-gray-500', canWrite && onUpdate && 'cursor-text')}>
                  {row.expenseDate || '-'}
                </span>
              ) : (
                <span className={cn('text-xs text-gray-400', canWrite && onUpdate && 'cursor-text')}>-</span>
              )}
            </TableCell>

            {/* 청구서 — canWrite면 항상 노출 */}
            <TableCell className="w-20 py-2 text-center" onClick={(e) => e.stopPropagation()}>
              {row.hasFile ? (
                <div className="flex items-center justify-center gap-1">
                  <a href={row.fileUrl} target="_blank" rel="noopener noreferrer"
                    className="inline-flex items-center gap-0.5 text-xs text-primary hover:underline">
                    <ExternalLink className="h-3 w-3" />
                    열기
                  </a>
                  {canWrite && (
                    <button
                      onClick={() => onDeleteFile(row)}
                      className="rounded p-0.5 text-gray-300 hover:bg-red-50 hover:text-red-400"
                      title="파일 삭제"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  )}
                </div>
              ) : canWrite ? (
                <button onClick={() => onUpload(row)}
                  className="inline-flex items-center gap-0.5 rounded px-1.5 py-1 text-xs text-gray-400 hover:bg-gray-100 hover:text-gray-600">
                  <Upload className="h-3 w-3" />
                  업로드
                </button>
              ) : (
                <span className="text-xs text-gray-300">-</span>
              )}
            </TableCell>
          </>
        )}

        {/* 수정/삭제 — editMode에서만 표시 */}
        {showActions && (
          <TableCell className="w-20 py-2 text-center" onClick={(e) => e.stopPropagation()}>
            <div className="flex justify-center gap-1">
              <button onClick={() => onEdit(row)}
                className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-primary" title="수정">
                <Pencil className="h-3.5 w-3.5" />
              </button>
              <button onClick={() => onDelete(row)}
                className="rounded p-1 text-gray-400 hover:bg-red-50 hover:text-red-500" title="삭제">
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          </TableCell>
        )}
      </TableRow>,

      /* 펼침 행 — 월별 금액 전체 */
      ...(isExpanded ? [
        <TableRow
          key={`detail-${expandKey}`}
          className="border-b border-gray-100"
          onClick={(e) => { e.stopPropagation(); toggleExpand(expandKey); }}
        >
          <TableCell colSpan={colCount} className="px-6 py-3">
            <div className="grid grid-cols-6 gap-2 text-xs">
              {MONTH_COLUMNS.map((month, i) => {
                const isEditingThisMonth =
                  monthEdit?.rowIndex === row.rowIndex &&
                  monthEdit?.monthIdx === i;
                const monthFile: MonthFile | undefined = isPersonnel
                  ? row.monthFiles?.find((f) => f.monthIndex === i)
                  : undefined;
                return (
                  <div
                    key={month}
                    className="text-center"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <div className="mb-0.5 flex items-center justify-center gap-0.5 text-gray-400">
                      <span>{month}</span>
                      {isPersonnel && monthFile && monthFile.monthIndex !== -1 && (
                        <span
                          className="inline-block h-2 w-2 rounded-full bg-green-500"
                          title="청구서 업로드됨"
                        />
                      )}
                    </div>
                    {isEditingThisMonth ? (
                      <KRWInput
                        autoFocus
                        value={monthEdit.value}
                        onChange={(v) => setMonthEdit((p) => p ? { ...p, value: v } : null)}
                        onBlur={() => void saveMonthEdit()}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') { e.preventDefault(); void saveMonthEdit(); }
                          if (e.key === 'Escape') { e.preventDefault(); setMonthEdit(null); }
                        }}
                        className="w-full rounded border border-primary/40 bg-white px-1 py-0.5 text-center tabular-nums outline-none focus:border-primary"
                      />
                    ) : (
                      <div
                        className={cn(
                          'tabular-nums font-medium',
                          row.monthlyAmounts[i] > 0 ? 'text-gray-800' : 'text-gray-300',
                          canWrite && onUpdate && 'cursor-pointer rounded hover:bg-primary-bg/60',
                        )}
                        onDoubleClick={canWrite ? (e) => startMonthEdit(row, i, e) : undefined}
                        title={canWrite && onUpdate ? '더블클릭하여 편집' : undefined}
                      >
                        {row.monthlyAmounts[i] > 0 ? formatKRW(row.monthlyAmounts[i]) : '0'}
                      </div>
                    )}
                    {/* 인건비 전용: 월별 파일 업로드/삭제 */}
                    {isPersonnel && (row.monthlyAmounts[i] > 0 || monthFile) && (
                      <div className="mt-1 flex flex-col items-center gap-0.5">
                        {monthFile ? (
                          <div className="flex items-center gap-0.5">
                            <a
                              href={monthFile.fileUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              title="청구서 열기"
                              className="inline-flex items-center gap-0.5 rounded bg-green-50 px-1.5 py-0.5 text-[10px] font-medium text-green-700 ring-1 ring-green-200 hover:bg-green-100"
                            >
                              <FileText className="h-2.5 w-2.5" />
                              청구서
                            </a>
                            {canWrite && (
                              <button
                                onClick={() => onDeleteFile(row, i)}
                                className="rounded p-0.5 text-gray-300 hover:bg-red-50 hover:text-red-500"
                                title="파일 삭제"
                              >
                                <X className="h-2.5 w-2.5" />
                              </button>
                            )}
                          </div>
                        ) : canWrite ? (
                          <button
                            onClick={() => onUpload(row, i)}
                            className="inline-flex items-center gap-0.5 rounded border border-dashed border-gray-200 px-1.5 py-0.5 text-[10px] text-gray-400 hover:border-primary/40 hover:text-primary"
                            title="청구서 업로드"
                          >
                            <Upload className="h-2.5 w-2.5" />
                            업로드
                          </button>
                        ) : null}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* 인건비 레거시 파일 — month_index 없이 저장된 파일 표시 */}
            {isPersonnel && row.monthFiles?.some((f) => f.monthIndex === -1) && (
              <div className="mt-2 border-t border-gray-100 pt-2" onClick={(e) => e.stopPropagation()}>
                <p className="mb-1 text-[10px] text-gray-400">월 미지정 청구서</p>
                <div className="flex flex-wrap gap-1">
                  {row.monthFiles.filter((f) => f.monthIndex === -1).map((f) => (
                    <div key={f.fileId} className="flex items-center gap-0.5">
                      <a
                        href={f.fileUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-0.5 rounded bg-amber-50 px-1.5 py-0.5 text-[10px] font-medium text-amber-700 ring-1 ring-amber-200 hover:bg-amber-100"
                      >
                        <FileText className="h-2.5 w-2.5" />
                        청구서 (월 미지정)
                      </a>
                      {canWrite && (
                        <button
                          onClick={() => onDeleteFile(row, undefined)}
                          className="rounded p-0.5 text-gray-300 hover:bg-red-50 hover:text-red-500"
                          title="파일 삭제"
                        >
                          <X className="h-2.5 w-2.5" />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* 합친 내역 — mergeInfo가 있는 행만 표시 */}
            {row.mergeInfo && (
              <div className="mt-3 border-t border-amber-100 pt-2" onClick={(e) => e.stopPropagation()}>
                {/* 헤더 + 별건 빼기 버튼 */}
                <div className="mb-2 flex items-center justify-between">
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-amber-500">합친 내역</p>
                  {canWrite && onSplit && (
                    splitTarget?.row.rowIndex === row.rowIndex ? (
                      <div className="flex items-center gap-1.5">
                        <span className="text-[10px] text-amber-600">
                          {splitTarget.selectedIndexes.size}건 선택
                        </span>
                        <button
                          onClick={async () => {
                            if (!onSplit || splitTarget.selectedIndexes.size === 0 || splitting) return;
                            setSplitting(true);
                            try {
                              await onSplit(
                                row.mergeInfo!.id,
                                row.rowIndex,
                                Array.from(splitTarget.selectedIndexes),
                              );
                              setSplitTarget(null);
                            } catch (err) {
                              alert(err instanceof Error ? err.message : '오류가 발생했습니다.');
                            } finally {
                              setSplitting(false);
                            }
                          }}
                          disabled={splitTarget.selectedIndexes.size === 0 || splitting}
                          className="rounded bg-amber-500 px-2 py-0.5 text-[10px] font-medium text-white hover:bg-amber-600 disabled:opacity-40"
                        >
                          {splitting ? '처리 중…' : '빼기 확정'}
                        </button>
                        <button
                          onClick={() => setSplitTarget(null)}
                          className="rounded px-2 py-0.5 text-[10px] text-gray-400 hover:bg-gray-100"
                        >
                          취소
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => setSplitTarget({ row, selectedIndexes: new Set() })}
                        className="flex items-center gap-1 rounded px-2 py-0.5 text-[10px] text-gray-400 hover:bg-amber-50 hover:text-amber-600 transition-colors"
                      >
                        <Scissors className="h-3 w-3" />
                        별건으로 빼기
                      </button>
                    )
                  )}
                </div>

                {/* 별건 빼기 모드 안내 */}
                {splitTarget?.row.rowIndex === row.rowIndex && (
                  <p className="mb-1.5 text-[10px] text-amber-600">
                    빼낼 항목을 선택하세요. 선택한 항목은 별도 집행내역으로 분리됩니다.
                  </p>
                )}

                <div className="space-y-1.5">
                  {row.mergeInfo.subItems.map((item, idx) => {
                    const isSplitMode = splitTarget?.row.rowIndex === row.rowIndex;
                    const isSelected = isSplitMode && splitTarget!.selectedIndexes.has(idx);
                    const activeEntries = (MONTH_COLUMNS as readonly string[])
                      .map((m, i) => ({ m, i, amt: item.monthlyAmounts[i] }))
                      .filter(({ amt }) => amt > 0);

                    return (
                      <div
                        key={idx}
                        className={cn(
                          'flex items-start justify-between rounded px-2 py-1.5 transition-colors',
                          isSplitMode
                            ? isSelected
                              ? 'cursor-pointer bg-amber-100 ring-1 ring-amber-300'
                              : 'cursor-pointer bg-amber-50/60 hover:bg-amber-50'
                            : 'bg-amber-50/60',
                        )}
                        onClick={
                          isSplitMode
                            ? () =>
                                setSplitTarget((prev) => {
                                  if (!prev) return null;
                                  const next = new Set(prev.selectedIndexes);
                                  if (next.has(idx)) next.delete(idx);
                                  else next.add(idx);
                                  return { ...prev, selectedIndexes: next };
                                })
                            : undefined
                        }
                      >
                        <div className="flex min-w-0 flex-1 items-start gap-2 mr-3">
                          {isSplitMode && (
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={() => {}}
                              onClick={(e) => e.stopPropagation()}
                              className="mt-0.5 shrink-0 accent-amber-500"
                            />
                          )}
                          <div className="flex min-w-0 flex-wrap items-center gap-1">
                            <span className="text-xs text-gray-700 truncate">
                              {item.description || item.programName || '-'}
                            </span>
                            {item.programName && item.description && (
                              <span className="shrink-0 text-[10px] text-gray-400">[{item.programName}]</span>
                            )}
                            {activeEntries.map(({ m, i }) => (
                              <span key={i} className="shrink-0 rounded bg-blue-50 px-1 py-0.5 text-[10px] font-medium text-blue-400">{m}</span>
                            ))}
                          </div>
                        </div>
                        <div className="shrink-0 text-right text-xs">
                          {activeEntries.length > 1 ? (
                            <div className="space-y-0.5">
                              {activeEntries.map(({ m, i, amt }) => (
                                <div key={i} className="flex items-center justify-end gap-1 tabular-nums text-gray-500">
                                  <span className="text-[10px] text-gray-400">{m}</span>
                                  <span>{formatKRW(amt)}</span>
                                </div>
                              ))}
                              <div className="border-t border-amber-200 pt-0.5 font-semibold tabular-nums text-gray-700">
                                합계 {formatKRW(item.totalAmount)}원
                              </div>
                            </div>
                          ) : (
                            <span className="tabular-nums text-gray-700">{formatKRW(item.totalAmount)}원</span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* 전체 선택/해제 버튼 (빼기 모드에서만) */}
                {splitTarget?.row.rowIndex === row.rowIndex && row.mergeInfo.subItems.length > 1 && (
                  <div className="mt-1.5 flex gap-2">
                    <button
                      onClick={() =>
                        setSplitTarget((prev) =>
                          prev
                            ? { ...prev, selectedIndexes: new Set(row.mergeInfo!.subItems.map((_, i) => i)) }
                            : null,
                        )
                      }
                      className="text-[10px] text-amber-500 hover:underline"
                    >
                      전체 선택
                    </button>
                    <button
                      onClick={() =>
                        setSplitTarget((prev) => (prev ? { ...prev, selectedIndexes: new Set() } : null))
                      }
                      className="text-[10px] text-gray-400 hover:underline"
                    >
                      선택 해제
                    </button>
                  </div>
                )}
              </div>
            )}
          </TableCell>
        </TableRow>,
      ] : []),
    ];
  }

  // ── 렌더 ────────────────────────────────────────────────────────

  return (
    <div className="overflow-x-auto">
      {/* 테이블 헤더 */}
      <div className="flex items-center justify-between border-b border-gray-200 pb-2 mb-0">
        <div className="flex items-center gap-3">
          {/* 검색 */}
          <div className="relative">
            <Search className="absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400 pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="검색 (구분·건명)"
              className="h-7 w-44 rounded border border-gray-200 bg-white pl-7 pr-6 text-xs text-gray-700 placeholder:text-gray-400 focus:border-primary/40 focus:outline-none focus:ring-1 focus:ring-primary/20"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-1.5 top-1/2 -translate-y-1/2 text-gray-300 hover:text-gray-500"
                aria-label="검색어 지우기"
              >
                <X className="h-3 w-3" />
              </button>
            )}
          </div>

          <span className="text-sm font-medium text-gray-700">
            집행내역{' '}
            <span className="font-normal text-gray-400">
              {searchQuery
                ? `(${filteredRows.length} / ${rows.length}건)`
                : `(${rows.length}건)`}
            </span>
          </span>
          {!isPersonnel && groups && groups.length > 0 && (
            <div className="flex gap-1">
              <button
                onClick={() => setCollapsedGroups(new Set(groups.map((g) => g.monthIdx)))}
                className="rounded px-2 py-0.5 text-xs text-gray-400 hover:bg-gray-100 hover:text-gray-600"
              >
                전체 접기
              </button>
              <button
                onClick={() => {
                  const calMonth = new Date().getMonth() + 1;
                  const currentFiscalIdx = (calMonth - 3 + 12) % 12;
                  setCollapsedGroups(
                    new Set(groups.map((g) => g.monthIdx).filter((idx) => idx !== currentFiscalIdx)),
                  );
                }}
                className="rounded px-2 py-0.5 text-xs text-gray-400 hover:bg-gray-100 hover:text-gray-600"
              >
                당월만 펼치기
              </button>
              <button
                onClick={() => setCollapsedGroups(new Set())}
                className="rounded px-2 py-0.5 text-xs text-gray-400 hover:bg-gray-100 hover:text-gray-600"
              >
                전체 펼치기
              </button>
            </div>
          )}
        </div>

        {/* 우측: 행 추가 + 편집 모드 + 합치기 */}
        {canWrite && (
          <div className="flex items-center gap-1.5">
            {/* 인건비 전용: 월별 금액 일괄 입력 */}
            {isPersonnel && !editMode && !mergeMode && onPersonnelBatchUpdate && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => setPersonnelMonthModalOpen(true)}
                className="gap-1.5 text-gray-600"
              >
                <CalendarDays className="h-3.5 w-3.5" />
                월별 금액 입력
              </Button>
            )}
            {!mergeMode && (
              <Button
                size="sm"
                variant="outline"
                onClick={onAdd}
                className="gap-1.5 text-gray-600"
              >
                <Plus className="h-3.5 w-3.5" />
                행 추가
              </Button>
            )}

            {mergeMode ? (
              <>
                <span className="text-xs text-gray-500">
                  {selectedForMerge.size}건 선택
                  {selectedForMerge.size > 0 && (
                    <span className="ml-1 font-medium text-gray-700">
                      ({formatKRW(
                        Array.from(selectedForMerge).reduce((s, ri) => {
                          const r = rows.find((row) => row.rowIndex === ri);
                          return s + (r?.totalAmount ?? 0);
                        }, 0),
                      )}원)
                    </span>
                  )}
                </span>
                <Button
                  size="sm"
                  onClick={handleOpenMergeModal}
                  disabled={selectedForMerge.size < 2}
                  className="bg-primary text-white hover:bg-primary-light disabled:opacity-40"
                >
                  합치기 확정
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={handleCancelMergeMode}
                  className="text-gray-600"
                >
                  취소
                </Button>
              </>
            ) : editMode ? (
              <>
                <Button
                  size="sm"
                  onClick={handleCompleteEditMode}
                  className="bg-primary text-white hover:bg-primary-light"
                >
                  완료
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={handleCancelEditMode}
                  className="text-gray-600"
                >
                  취소
                </Button>
              </>
            ) : (
              <>
                {canMerge && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={handleStartMergeMode}
                    className="gap-1.5 text-gray-600"
                  >
                    <Merge className="h-3.5 w-3.5" />
                    합치기
                  </Button>
                )}
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setEditMode(true)}
                  className="gap-1.5 text-gray-600"
                >
                  <Pencil className="h-3.5 w-3.5" />
                  편집 모드
                </Button>
              </>
            )}
          </div>
        )}
      </div>

      {/* 편집 모드 안내 */}
      {editMode && (
        <div className="mb-1 flex items-center gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs text-amber-700">
          <span className="font-semibold">편집 모드</span>
          <span className="text-amber-600">건명·프로그램명·지출일자·월별 금액은 더블클릭으로 바로 수정합니다. 행을 펼치면 월별 금액을 개별 수정할 수 있습니다.</span>
          {savingInline && <span className="ml-auto text-amber-500">저장 중…</span>}
        </div>
      )}

      {/* 합치기 모드 안내 */}
      {mergeMode && (
        <div className="mb-1 flex items-center gap-2 rounded-md border border-primary/20 bg-primary-bg/40 px-3 py-1.5 text-xs text-primary">
          <Merge className="h-3.5 w-3.5 shrink-0" />
          <span className="font-semibold">합치기 모드</span>
          <span>합칠 집행내역을 클릭하거나 체크박스로 선택하세요. 2건 이상 선택 후 &lsquo;합치기 확정&rsquo;을 누르세요.</span>
        </div>
      )}

      {dragState && (
        <div className="border-b border-blue-100 bg-blue-50 px-4 py-1.5 text-xs text-blue-500">
          월 헤더 위로 드래그하여{' '}
          <strong>{MONTH_COLUMNS[dragState.sourceMonthIdx]}</strong> 금액을 다른 월로 이동하세요.
        </div>
      )}

      <Table>
        <TableHeader>
          <TableRow
            className="border-b border-gray-200 hover:bg-transparent [&>th]:h-auto [&>th]:py-1 [&>th]:leading-none"
            style={{ backgroundColor: 'rgba(32, 128, 141, 0.1)' }}
          >
            {mergeMode && !isPersonnel && <TableHead className="w-8" />}
            <TableHead className="w-6 text-gray-400" />
            {isPersonnel ? (
              <>
                <TableHead className="text-xs font-medium text-gray-500">내용</TableHead>
                <TableHead className="w-32 text-right text-xs font-medium text-gray-500">집행금액</TableHead>
                <TableHead className="w-16 text-center text-xs font-medium text-gray-500">청구서</TableHead>
              </>
            ) : (
              <>
                <TableHead className="w-44 text-xs font-medium text-gray-500">구분(프로그램명)</TableHead>
                <TableHead className="w-[21rem] text-xs font-medium text-gray-500">지출건명</TableHead>
                <TableHead className="w-36 text-right text-xs font-medium text-gray-500">집행금액</TableHead>
                <TableHead className="w-28 text-center text-xs font-medium text-gray-500">지출일자</TableHead>
                <TableHead className="w-20 text-center text-xs font-medium text-gray-500">청구서</TableHead>
              </>
            )}
            {showActions && <TableHead className="w-20 text-center text-xs font-medium text-gray-500">관리</TableHead>}
          </TableRow>
        </TableHeader>

        <TableBody>
          {rows.length === 0 ? (
            <TableRow className="border-0">
              <TableCell colSpan={colCount} className="h-32 text-center text-sm text-gray-400">
                집행내역이 없습니다.
              </TableCell>
            </TableRow>
          ) : filteredRows.length === 0 ? (
            <TableRow className="border-0">
              <TableCell colSpan={colCount} className="h-32 text-center text-sm text-gray-400">
                <span className="block mb-1">검색 결과가 없습니다.</span>
                <button
                  onClick={() => setSearchQuery('')}
                  className="text-xs text-primary hover:underline"
                >
                  검색어 지우기
                </button>
              </TableCell>
            </TableRow>
          ) : isPersonnel ? (
            filteredRows.flatMap((row) => renderDataRow(row, `${row.rowIndex}`))
          ) : (
            groups!.flatMap(({ label, monthIdx, entries }, groupIndex) => {
              const isCollapsed = collapsedGroups.has(monthIdx);

              // 앞에 이미 펼쳐진 그룹이 있으면 → 헤더 바로 밑이 아니므로 숨김 안 함
              // 앞에 펼쳐진 그룹이 없고(=헤더 바로 밑), 이후에 펼쳐진 그룹이 있을 때만 숨김
              const hasExpandedBefore = groups!.slice(0, groupIndex).some(
                (g) => !collapsedGroups.has(g.monthIdx),
              );
              const hiddenByLaterExpand = isCollapsed && !hasExpandedBefore && groups!.slice(groupIndex + 1).some(
                (g) => !collapsedGroups.has(g.monthIdx),
              );
              if (hiddenByLaterExpand) return [];

              const isDragTarget = dragOverMonthIdx === monthIdx;
              const isDraggingActive = !!dragState && dragState.sourceMonthIdx !== monthIdx;
              const groupTotal = entries.reduce((s, e) => s + e.monthAmount, 0);
              const completeTotal = entries
                .filter((e) => e.row.status === 'complete')
                .reduce((s, e) => s + e.monthAmount, 0);
              const plannedTotal = entries
                .filter((e) => e.row.status === 'planned')
                .reduce((s, e) => s + e.monthAmount, 0);

              const totalRow = (
                <TableRow
                  key={`group-${monthIdx}`}
                  className={cn(
                    'cursor-pointer select-none border-b transition-colors',
                    isDragTarget
                      ? 'border-blue-300 bg-blue-50'
                      : isDraggingActive
                        ? 'border-gray-200 bg-blue-50/40 hover:bg-blue-50'
                        : 'border-gray-200 hover:bg-gray-50/60',
                  )}
                  style={!isDragTarget && !isDraggingActive ? { backgroundColor: 'rgba(32,128,141,0.03)' } : undefined}
                  onDragEnter={(e) => handleGroupDragEnter(e, monthIdx)}
                  onDragOver={(e) => handleGroupDragOver(e, monthIdx)}
                  onDragLeave={() => {
                    if (dragOverMonthIdx === monthIdx) setDragOverMonthIdx(null);
                  }}
                  onDrop={(e) => handleGroupDrop(e, monthIdx)}
                  onClick={() => toggleGroup(monthIdx)}
                >
                  <TableCell colSpan={colCount} className="py-1 pl-3 pr-4 leading-none">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2 shrink-0">
                        {isCollapsed
                          ? <ChevronRight className="h-3.5 w-3.5 text-gray-400" />
                          : <ChevronUp className="h-3.5 w-3.5 text-gray-400" />}
                        <span className={cn(
                          'inline-block w-8 text-xs font-semibold',
                          isDragTarget ? 'text-blue-600' : 'text-primary',
                        )}>{label}</span>
                        {isDragTarget && (
                          <span className="text-xs font-medium text-blue-500">여기에 놓기</span>
                        )}
                      </div>
                      <div className="flex items-center gap-5 text-xs">
                        <div className="flex items-center">
                          <span className="w-[3rem] shrink-0 text-gray-400">집행예정</span>
                          <span className="w-[5.5rem] text-right tabular-nums font-medium text-planned">{formatKRW(plannedTotal)}</span>
                          <span className="ml-0.5 text-gray-400">원</span>
                        </div>
                        <div className="flex items-center">
                          <span className="w-[3rem] shrink-0 text-gray-400">집행완료</span>
                          <span className="w-[5.5rem] text-right tabular-nums font-medium text-complete">{formatKRW(completeTotal)}</span>
                          <span className="ml-0.5 text-gray-400">원</span>
                        </div>
                        <div className="flex items-center">
                          <span className="w-[3rem] shrink-0 text-gray-500">합계</span>
                          <span className="w-[5.5rem] text-right tabular-nums font-semibold text-gray-700">{formatKRW(groupTotal)}</span>
                          <span className="ml-0.5 text-gray-500">원</span>
                        </div>
                      </div>
                    </div>
                  </TableCell>
                </TableRow>
              );

              const detailRows = isCollapsed
                ? []
                : entries.flatMap(({ row, monthAmount }) =>
                    renderDataRow(
                      row,
                      `${row.rowIndex}-${monthIdx}`,
                      monthIdx,
                      monthAmount,
                      getActiveMonths(row),
                    )
                  );

              // 상세 행이 합계 행 위에 렌더링됨 (위로 펼치기)
              return [...detailRows, totalRow];
            })
          )}
        </TableBody>
      </Table>

      {/* 인건비 전용 범례 */}
      {isPersonnel && (
        <div className="mt-2 flex items-center gap-1.5 text-xs text-gray-400">
          <span className="inline-block h-2 w-2 shrink-0 rounded-full bg-green-500" />
          <span>행을 펼치면 월별 청구서를 업로드·삭제할 수 있습니다. 녹색 점 클릭 시 파일을 열 수 있습니다.</span>
        </div>
      )}

      {/* 인건비 월별 금액 일괄 입력 모달 */}
      {isPersonnel && (
        <PersonnelMonthInputModal
          open={personnelMonthModalOpen}
          rows={filteredRows}
          monthCount={monthCount}
          onClose={() => setPersonnelMonthModalOpen(false)}
          onSave={async (updates) => {
            if (onPersonnelBatchUpdate) {
              await onPersonnelBatchUpdate(updates);
            }
            setPersonnelMonthModalOpen(false);
          }}
        />
      )}

      {/* 합치기 확정 모달 */}
      {mergeModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30">
          <div className="w-[500px] max-h-[80vh] overflow-y-auto rounded-lg border border-gray-200 bg-white p-5 shadow-xl">
            <h2 className="mb-4 text-base font-semibold text-gray-800">
              {selectedForMerge.size}건 합치기
            </h2>

            {/* 선택된 건 목록 */}
            <div className="mb-4 rounded border border-gray-100 bg-gray-50 p-3">
              <p className="mb-2 text-xs text-gray-400">선택된 집행내역</p>
              <div className="space-y-1">
                {Array.from(selectedForMerge).map((ri) => {
                  const r = rows.find((row) => row.rowIndex === ri);
                  if (!r) return null;
                  const activeMonths = (MONTH_COLUMNS as readonly string[]).filter((_, i) => r.monthlyAmounts[i] > 0);
                  return (
                    <div key={ri} className="flex items-center justify-between border-b border-gray-100 py-1 text-xs last:border-0">
                      <div className="flex min-w-0 items-center gap-1">
                        <span className="truncate text-gray-700">{r.description || r.programName || '-'}</span>
                        {activeMonths.map((m) => (
                          <span key={m} className="shrink-0 rounded bg-blue-50 px-1 py-0.5 text-[10px] font-medium text-blue-400">{m}</span>
                        ))}
                      </div>
                      <span className="ml-3 shrink-0 tabular-nums text-gray-600">{formatKRW(r.totalAmount)}원</span>
                    </div>
                  );
                })}
              </div>
              <div className="mt-2 flex items-center justify-between border-t border-gray-200 pt-2">
                <span className="text-xs text-gray-500">합계</span>
                <span className="text-sm font-semibold tabular-nums text-gray-800">
                  {formatKRW(
                    Array.from(selectedForMerge).reduce((s, ri) => {
                      const r = rows.find((row) => row.rowIndex === ri);
                      return s + (r?.totalAmount ?? 0);
                    }, 0),
                  )}원
                </span>
              </div>
            </div>

            {/* 새 건명 */}
            <div className="mb-3">
              <label className="mb-1 block text-xs font-medium text-gray-700">
                새 건명 <span className="text-red-400">*</span>
              </label>
              <input
                autoFocus
                type="text"
                value={mergeDesc}
                onChange={(e) => setMergeDesc(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter' && mergeDesc.trim()) void handleMergeConfirm(); }}
                placeholder="합친 후 표시할 건명을 입력하세요"
                className="w-full rounded border border-gray-200 px-3 py-1.5 text-sm focus:border-primary/50 focus:outline-none focus:ring-1 focus:ring-primary/20"
              />
            </div>

            {/* 구분(프로그램명) */}
            <div className="mb-5">
              <label className="mb-1 block text-xs font-medium text-gray-700">구분(프로그램명)</label>
              <input
                type="text"
                value={mergeProgramName}
                onChange={(e) => setMergeProgramName(e.target.value)}
                placeholder="프로그램명"
                className="w-full rounded border border-gray-200 px-3 py-1.5 text-sm focus:border-primary/50 focus:outline-none focus:ring-1 focus:ring-primary/20"
              />
            </div>

            <div className="flex justify-end gap-2">
              <button
                onClick={() => setMergeModalOpen(false)}
                className="rounded px-4 py-1.5 text-sm text-gray-600 hover:bg-gray-100"
              >
                취소
              </button>
              <button
                onClick={() => void handleMergeConfirm()}
                disabled={!mergeDesc.trim() || merging}
                className="rounded bg-primary px-4 py-1.5 text-sm font-medium text-white hover:bg-primary-light disabled:opacity-40"
              >
                {merging ? '처리 중...' : '합치기'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

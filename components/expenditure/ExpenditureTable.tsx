// components/expenditure/ExpenditureTable.tsx
'use client';

import { useState } from 'react';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { formatKRW } from '@/lib/utils';
import { cn } from '@/lib/utils';
import {
  Pencil, Trash2, Upload, ExternalLink, Plus,
  ChevronUp, ChevronDown, ChevronRight, GripVertical, X,
} from 'lucide-react';
import { MONTH_COLUMNS, PERSONNEL_CATEGORY } from '@/constants/sheets';
import type { ExpenditureDetailRow } from '@/types';

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
  onUpload: (row: ExpenditureDetailRow) => void;
  onDeleteFile: (row: ExpenditureDetailRow) => void;
  onMoveMonth?: (
    row: ExpenditureDetailRow,
    sourceMonthIdx: number,
    targetMonthIdx: number,
  ) => Promise<void>;
  onUpdate?: (
    row: ExpenditureDetailRow,
    changes: { programName?: string; description?: string; expenseDate?: string },
  ) => Promise<void>;
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
}: ExpenditureTableProps) {
  const [expandedKey, setExpandedKey] = useState<string | null>(null);
  const [collapsedGroups, setCollapsedGroups] = useState<Set<number>>(getDefaultCollapsedGroups);
  const [dragState, setDragState] = useState<DragState | null>(null);
  const [dragOverMonthIdx, setDragOverMonthIdx] = useState<number | null>(null);
  const [movingKey, setMovingKey] = useState<string | null>(null);

  // 편집 모드 (내부 상태)
  const [editMode, setEditMode] = useState(false);
  const [inlineEdit, setInlineEdit] = useState<InlineEditState | null>(null);
  const [savingInline, setSavingInline] = useState(false);

  const isPersonnel = category === PERSONNEL_CATEGORY;
  const showActions = canWrite && editMode; // 삭제/이동 등 파괴적 액션
  const colCount = isPersonnel ? (showActions ? 4 : 3) : (showActions ? 7 : 6);
  const groups = isPersonnel ? null : groupByMonthlyAmounts(rows);

  // ── 인라인 편집 ────────────────────────────────────────────────

  function startInlineEdit(
    row: ExpenditureDetailRow,
    field: InlineEditState['field'],
    e: React.MouseEvent,
  ) {
    e.stopPropagation();
    if (!editMode || !onUpdate) return;
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
      editMode && inlineEdit?.rowIndex === row.rowIndex && inlineEdit?.field === 'programName';
    const isEditingDescription =
      editMode && inlineEdit?.rowIndex === row.rowIndex && inlineEdit?.field === 'description';
    const isEditingDate =
      editMode && inlineEdit?.rowIndex === row.rowIndex && inlineEdit?.field === 'expenseDate';

    return [
      <TableRow
        key={`row-${expandKey}`}
        draggable={draggable}
        onDragStart={draggable ? (e) => handleDragStart(e, row, monthIdx!) : undefined}
        onDragEnd={draggable ? handleDragEnd : undefined}
        className={cn(
          'border-b border-gray-100 transition-colors',
          draggable ? 'cursor-grab active:cursor-grabbing' : '',
          !editMode && 'cursor-pointer',
          'hover:bg-gray-50/60',
          isExpanded && 'bg-gray-50/40',
          isDragging && 'opacity-40',
          isMoving && 'animate-pulse opacity-60',
        )}
        // editMode일 때는 row 클릭으로 펼침/접힘 막음 (chevron cell에서 처리)
        onClick={editMode ? undefined : () => toggleExpand(expandKey)}
      >
        {/* 펼침 아이콘 — editMode에서도 chevron 클릭으로 토글 */}
        <TableCell
          className="py-2 pl-3 text-gray-300 cursor-pointer"
          onClick={editMode ? () => toggleExpand(expandKey) : undefined}
        >
          {isExpanded
            ? <ChevronDown className="h-3.5 w-3.5" />
            : <ChevronRight className="h-3.5 w-3.5" />}
        </TableCell>

        {isPersonnel ? (
          <>
            <TableCell
              className="max-w-0 overflow-hidden py-2 text-gray-700"
              onDoubleClick={editMode ? (e) => startInlineEdit(row, 'programName', e) : undefined}
              title={editMode ? '더블클릭하여 편집' : undefined}
            >
              {isEditingProgramName
                ? renderInlineInput('programName')
                : <span className={cn('block truncate text-sm', editMode && onUpdate && 'cursor-text')} title={row.programName}>{row.programName || '-'}</span>
              }
            </TableCell>
            <TableCell className="py-2 text-right text-sm font-medium tabular-nums text-gray-800">
              {formatKRW(row.totalAmount)}
            </TableCell>
          </>
        ) : (
          <>
            {/* 구분(프로그램명) */}
            <TableCell
              className="w-44 max-w-[11rem] overflow-hidden py-2"
              onDoubleClick={editMode ? (e) => startInlineEdit(row, 'programName', e) : undefined}
              title={editMode ? '더블클릭하여 편집' : undefined}
            >
              {isEditingProgramName ? (
                renderInlineInput('programName')
              ) : (
                <div className="flex min-w-0 items-center gap-1">
                  {draggable && (
                    <GripVertical className="h-3.5 w-3.5 shrink-0 text-gray-200" />
                  )}
                  <span
                    className={cn('block truncate text-[10px] text-gray-500', editMode && onUpdate && 'cursor-text')}
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
              onDoubleClick={editMode ? (e) => startInlineEdit(row, 'description', e) : undefined}
              title={editMode ? '더블클릭하여 편집' : undefined}
            >
              {isEditingDescription ? (
                renderInlineInput('description')
              ) : (
                <div className="flex min-w-0 items-center gap-1">
                  <span
                    className={cn('shrink truncate', editMode && onUpdate && 'cursor-text')}
                    title={row.description}
                  >
                    {row.description || '-'}
                  </span>
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
              onDoubleClick={editMode ? (e) => { e.stopPropagation(); onEdit(row); } : undefined}
              title={editMode ? '더블클릭하여 편집' : undefined}
            >
              <div className={cn('flex flex-col items-end', editMode && 'cursor-pointer')}>
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
              onDoubleClick={editMode ? (e) => startInlineEdit(row, 'expenseDate', e) : undefined}
              title={editMode ? '더블클릭하여 편집' : undefined}
            >
              {isEditingDate ? (
                renderInlineInput('expenseDate')
              ) : row.status === 'complete' ? (
                <span className={cn('text-xs text-gray-500', editMode && onUpdate && 'cursor-text')}>
                  {row.expenseDate || '-'}
                </span>
              ) : (
                <span className={cn('text-xs text-gray-400', editMode && onUpdate && 'cursor-text')}>-</span>
              )}
            </TableCell>

            {/* 지출부 — canWrite면 항상 노출 */}
            <TableCell className="w-20 py-2 text-center" onClick={(e) => e.stopPropagation()}>
              {row.hasFile ? (
                <div className="flex items-center justify-center gap-1">
                  <a href={row.fileUrl} target="_blank" rel="noopener noreferrer"
                    className="inline-flex items-center gap-0.5 text-xs text-primary hover:underline">
                    <ExternalLink className="h-3 w-3" />
                    열기
                  </a>
                  {showActions && (
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
              {MONTH_COLUMNS.map((month, i) => (
                <div key={month} className="text-center">
                  <div className="mb-0.5 text-gray-400">{month}</div>
                  <div className={cn(
                    'tabular-nums font-medium',
                    row.monthlyAmounts[i] > 0 ? 'text-gray-800' : 'text-gray-300',
                  )}>
                    {formatKRW(row.monthlyAmounts[i])}
                  </div>
                </div>
              ))}
            </div>
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
          <span className="text-sm font-medium text-gray-700">
            집행내역{' '}
            <span className="font-normal text-gray-400">({rows.length}건)</span>
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

        {/* 우측: 행 추가 + 편집 모드 토글 */}
        {canWrite && (
          <div className="flex items-center gap-1.5">
            <Button
              size="sm"
              variant="outline"
              onClick={onAdd}
              className="gap-1.5 text-gray-600"
            >
              <Plus className="h-3.5 w-3.5" />
              행 추가
            </Button>

            {editMode ? (
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
              <Button
                size="sm"
                variant="outline"
                onClick={() => setEditMode(true)}
                className="gap-1.5 text-gray-600"
              >
                <Pencil className="h-3.5 w-3.5" />
                편집 모드
              </Button>
            )}
          </div>
        )}
      </div>

      {/* 편집 모드 안내 */}
      {editMode && (
        <div className="mb-1 flex items-center gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs text-amber-700">
          <span className="font-semibold">편집 모드</span>
          <span className="text-amber-600">건명·프로그램명·지출일자는 더블클릭으로 바로 수정, 금액은 더블클릭 시 전체 편집 창이 열립니다.</span>
          {savingInline && <span className="ml-auto text-amber-500">저장 중…</span>}
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
            <TableHead className="w-6 text-gray-400" />
            {isPersonnel ? (
              <>
                <TableHead className="text-xs font-medium text-gray-500">내용</TableHead>
                <TableHead className="w-32 text-right text-xs font-medium text-gray-500">집행금액</TableHead>
              </>
            ) : (
              <>
                <TableHead className="w-44 text-xs font-medium text-gray-500">구분(프로그램명)</TableHead>
                <TableHead className="w-[21rem] text-xs font-medium text-gray-500">지출건명</TableHead>
                <TableHead className="w-36 text-right text-xs font-medium text-gray-500">집행금액</TableHead>
                <TableHead className="w-28 text-center text-xs font-medium text-gray-500">지출일자</TableHead>
                <TableHead className="w-20 text-center text-xs font-medium text-gray-500">지출부</TableHead>
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
          ) : isPersonnel ? (
            rows.flatMap((row) => renderDataRow(row, `${row.rowIndex}`))
          ) : (
            groups!.flatMap(({ label, monthIdx, entries }, groupIndex) => {
              const isCollapsed = collapsedGroups.has(monthIdx);

              // 접혀있는 상태에서 이후 그룹 중 펼쳐진 것이 있으면 숨김
              // (펼쳐진 달은 전체 펼치기 등에서도 계속 보여야 하므로 제외)
              const hiddenByLaterExpand = isCollapsed && groups!.slice(groupIndex + 1).some(
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
    </div>
  );
}

'use client';

import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  Table,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { formatKRW, cn } from '@/lib/utils';
import type { ProgramRow } from '@/hooks/useDashboard';
import { ChevronDown, ChevronRight, GripVertical, Trash2, CheckSquare, Square, Plus } from 'lucide-react';
import { useSidebar } from '@/components/layout/SidebarContext';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type CollisionDetection,
} from '@dnd-kit/core';

const sameTypeCollision: CollisionDetection = (args) => {
  const activeId = String(args.active.id);
  const prefix = activeId.startsWith('cat:') ? 'cat:' : 'row:';
  return closestCenter({
    ...args,
    droppableContainers: args.droppableContainers.filter(
      (c) => String(c.id).startsWith(prefix),
    ),
  });
};
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

interface ProgramTableProps {
  rows: ProgramRow[];
  onEdit?: (row: ProgramRow) => void;
  onDelete?: (row: ProgramRow) => void;
  canWrite: boolean;
  isLoggedIn?: boolean;
  editMode?: boolean;
  changes?: Record<number, Partial<ProgramRow>>;
  onCellChange?: (rowIndex: number, field: keyof ProgramRow, value: string | number) => void;
  onAutoSave?: (rowIndex: number, field: keyof ProgramRow, value: string | number) => void;
  openGroups?: Record<string, boolean>;
  onToggleGroup?: (key: string) => void;
  forcedOpenRows?: number[];
  emptyMessage?: string;
  onAddInCategory?: (category: string) => void;
}

type EditingCell = { rowIndex: number; field: string } | null;

// ── 인라인 편집 셀 ──────────────────────────────────────────────
interface InlineEditCellProps {
  rowIndex: number;
  field: keyof ProgramRow;
  value: string | number;
  editMode: boolean;
  isChanged: boolean;
  editingCell: EditingCell;
  setEditingCell: (v: EditingCell) => void;
  onCellChange?: (rowIndex: number, field: keyof ProgramRow, value: string | number) => void;
  onAutoSave?: (rowIndex: number, field: keyof ProgramRow, value: string | number) => void;
  displayValue?: React.ReactNode;
  className?: string;
  multiline?: boolean;
  showTitle?: boolean;
  editKey?: string;
}

function InlineEditCell({
  rowIndex, field, value, editMode, isChanged,
  editingCell, setEditingCell, onCellChange, onAutoSave,
  displayValue, className, multiline = false, showTitle = false, editKey,
}: InlineEditCellProps) {
  const cellKey = editKey ?? (field as string);
  const isEditing =
    editingCell?.rowIndex === rowIndex && editingCell?.field === cellKey;
  const [draft, setDraft] = useState('');
  const committedRef = useRef(false);

  function start(e: React.MouseEvent) {
    e.stopPropagation();
    committedRef.current = false;
    setDraft(String(value ?? ''));
    setEditingCell({ rowIndex, field: cellKey });
  }

  function commit() {
    if (committedRef.current) return;
    committedRef.current = true;
    const isNum = typeof value === 'number';
    const final: string | number = isNum
      ? Number(draft.replace(/,/g, '')) || 0
      : draft;
    if (editMode) {
      onCellChange?.(rowIndex, field, final);
    } else {
      onAutoSave?.(rowIndex, field, final);
    }
    setEditingCell(null);
  }

  function cancel() {
    committedRef.current = true;
    setEditingCell(null);
  }

  if (isEditing) {
    if (multiline) {
      return (
        <textarea
          autoFocus
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === 'Escape') { cancel(); }
            else if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); commit(); }
          }}
          rows={3}
          className="w-full resize-none rounded border border-primary bg-white px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
          onClick={(e) => e.stopPropagation()}
        />
      );
    }
    return (
      <input
        autoFocus
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') commit();
          if (e.key === 'Escape') cancel();
        }}
        className="w-full min-w-0 rounded border border-primary bg-white px-1 py-0.5 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
        onClick={(e) => e.stopPropagation()}
      />
    );
  }

  const strValue = String(value ?? '');
  return (
    <div
      className={cn(
        'rounded cursor-text hover:bg-amber-50/60 leading-none',
        isChanged && 'bg-amber-100 px-1 ring-1 ring-amber-300',
        className,
      )}
      onClick={editMode ? start : undefined}
      onDoubleClick={!editMode ? start : undefined}
      title={editMode ? `클릭하여 수정${showTitle && strValue ? ` | ${strValue}` : ''}` : `더블클릭하여 수정${showTitle && strValue ? ` | ${strValue}` : ''}`}
    >
      {displayValue ?? (value !== '' && value !== 0
        ? (multiline ? <span className="whitespace-pre-wrap">{strValue}</span> : strValue)
        : (editMode ? <span className="text-gray-300 text-xs">—</span> : '-'))}
    </div>
  );
}

// ── 메인 컴포넌트 ────────────────────────────────────────────────
export function ProgramTable({
  rows, onDelete, canWrite, isLoggedIn = false,
  editMode = false, changes = {}, onCellChange, onAutoSave,
  openGroups: externalOpenGroups, onToggleGroup: externalToggleGroup,
  forcedOpenRows, emptyMessage = '데이터가 없습니다.',
  onAddInCategory,
}: ProgramTableProps) {
  const { collapsed } = useSidebar();
  const grouped = rows.reduce<{ key: string; rows: ProgramRow[] }[]>((acc, row) => {
    const key = row.category || '기타';
    const existing = acc.find((g) => g.key === key);
    if (existing) existing.rows.push(row);
    else acc.push({ key, rows: [row] });
    return acc;
  }, []);

  const [internalOpenGroups, setInternalOpenGroups] = useState<Record<string, boolean>>(
    () => Object.fromEntries(grouped.map((g) => [g.key, true])),
  );
  const openGroups = externalOpenGroups ?? internalOpenGroups;
  const [openRows, setOpenRows] = useState<Record<number, boolean>>({});
  const [editingCell, setEditingCell] = useState<EditingCell>(null);
  const [localStatus, setLocalStatus] = useState<Record<number, { isCompleted?: boolean; isOnHold?: boolean }>>({});

  // ── 카테고리 / 행 정렬 순서 상태 ──
  const [categoryOrder, setCategoryOrder] = useState<string[]>([]);
  const [rowOrders, setRowOrders] = useState<Record<string, number[]>>({});
  const [isClient, setIsClient] = useState(false);

  useEffect(() => {
    setIsClient(true);
    try {
      const savedCat = localStorage.getItem('dashboard-category-order');
      if (savedCat) setCategoryOrder(JSON.parse(savedCat));
      const savedRows = localStorage.getItem('dashboard-row-order');
      if (savedRows) setRowOrders(JSON.parse(savedRows));
    } catch { /* ignore parse error */ }
  }, []);

  const orderedGrouped = useMemo(() => {
    if (!isClient) return grouped;
    return [...grouped].sort((a, b) => {
      let idxA = categoryOrder.indexOf(a.key);
      let idxB = categoryOrder.indexOf(b.key);
      if (idxA === -1) idxA = 9999;
      if (idxB === -1) idxB = 9999;
      if (idxA !== idxB) return idxA - idxB;
      return a.key.localeCompare(b.key, 'ko');
    });
  }, [grouped, categoryOrder, isClient]);

  function getOrderedRows(key: string, rows: ProgramRow[]): ProgramRow[] {
    const order = rowOrders[key];
    if (!order) return rows;
    return [...rows].sort((a, b) => {
      const ai = order.indexOf(a.rowIndex);
      const bi = order.indexOf(b.rowIndex);
      if (ai === -1 && bi === -1) return 0;
      if (ai === -1) return 1;
      if (bi === -1) return -1;
      return ai - bi;
    });
  }

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const activeStr = String(active.id);
    const overStr = String(over.id);

    if (activeStr.startsWith('cat:') && overStr.startsWith('cat:')) {
      // 카테고리 순서 변경
      const activeKey = activeStr.slice(4);
      const overKey = overStr.slice(4);
      const currentKeys = orderedGrouped.map((g) => g.key);
      const oldIndex = currentKeys.indexOf(activeKey);
      const newIndex = currentKeys.indexOf(overKey);
      if (oldIndex !== -1 && newIndex !== -1) {
        const next = arrayMove(currentKeys, oldIndex, newIndex);
        setCategoryOrder(next);
        localStorage.setItem('dashboard-category-order', JSON.stringify(next));
      }
    } else if (activeStr.startsWith('row:') && overStr.startsWith('row:')) {
      // 행 순서 변경
      const activeRowIndex = Number(activeStr.slice(4));
      const overRowIndex = Number(overStr.slice(4));
      const categoryKey = orderedGrouped.find((g) => g.rows.some((r) => r.rowIndex === activeRowIndex))?.key;
      if (!categoryKey) return;
      const group = orderedGrouped.find((g) => g.key === categoryKey);
      if (!group || !group.rows.some((r) => r.rowIndex === overRowIndex)) return;
      const orderedRows = getOrderedRows(categoryKey, group.rows);
      const oldIndex = orderedRows.findIndex((r) => r.rowIndex === activeRowIndex);
      const newIndex = orderedRows.findIndex((r) => r.rowIndex === overRowIndex);
      if (oldIndex === -1 || newIndex === -1) return;
      const newOrder = arrayMove(orderedRows.map((r) => r.rowIndex), oldIndex, newIndex);
      setRowOrders((prev) => {
        const next = { ...prev, [categoryKey]: newOrder };
        localStorage.setItem('dashboard-row-order', JSON.stringify(next));
        return next;
      });
    }
  }

  function toggleGroup(key: string) {
    if (externalToggleGroup) externalToggleGroup(key);
    else setInternalOpenGroups((prev) => ({ ...prev, [key]: !prev[key] }));
  }

  const forcedOpenSet = useMemo(() => new Set(forcedOpenRows ?? []), [forcedOpenRows]);

  function toggleRow(rowIndex: number) {
    setOpenRows((prev) => ({ ...prev, [rowIndex]: !prev[rowIndex] }));
  }

  function getRowOpen(rowIndex: number) {
    if (forcedOpenSet.has(rowIndex)) return true;
    return openRows[rowIndex] ?? false;
  }

  function getVal<K extends keyof ProgramRow>(row: ProgramRow, field: K): ProgramRow[K] {
    return (changes[row.rowIndex]?.[field] ?? row[field]) as ProgramRow[K];
  }

  function isCellChanged(rowIndex: number, field: keyof ProgramRow) {
    return changes[rowIndex]?.[field] !== undefined;
  }

  if (rows.length === 0) {
    return (
      <div className="flex h-40 items-center justify-center rounded-[2px] border border-dashed border-[#E3E3E0] text-sm text-text-secondary">
        {emptyMessage}
      </div>
    );
  }

  const colSpan = 10;

  return (
    <div className={cn(
        'overflow-x-auto rounded-[2px] border bg-white shadow-soft transition-colors',
        editMode ? 'border-amber-300' : 'border-[#E3E3E0]',
      )}>
        <DndContext sensors={sensors} collisionDetection={sameTypeCollision} onDragEnd={handleDragEnd}>
          <Table className="table-fixed">
            <TableHeader>
              <TableRow className="bg-sidebar hover:bg-sidebar">
                <TableHead className="w-12 text-text-secondary px-2" />
                <TableHead className={cn("text-text-secondary font-medium transition-all", collapsed ? "w-[490px]" : "w-[330px]")}>
                  구분 / 프로그램명
                </TableHead>
                <TableHead className="w-16 text-text-secondary font-medium">소관</TableHead>
                <TableHead className="w-32 text-text-secondary font-medium">담당교원</TableHead>
                <TableHead className="text-text-secondary font-medium">담당직원</TableHead>
                <TableHead className="w-32 text-right text-text-secondary font-medium">예산계획</TableHead>
                <TableHead className="w-32 text-right text-text-secondary font-medium">집행완료</TableHead>
                <TableHead className="w-32 text-right text-text-secondary font-medium">집행예정</TableHead>
                <TableHead className="w-16 text-right text-text-secondary font-medium">집행률</TableHead>
                <TableHead className="w-24 text-center text-text-secondary font-medium">완료/보류</TableHead>
              </TableRow>
            </TableHeader>
            <SortableContext items={orderedGrouped.map((g) => `cat:${g.key}`)} strategy={verticalListSortingStrategy}>
              {orderedGrouped.map(({ key, rows: groupRows }) => {
                const isGroupOpen = openGroups[key] ?? true;

              const catTotal = groupRows.reduce(
                (acc, r) => ({
                  budgetPlan: acc.budgetPlan + r.budgetPlan,
                  executionComplete: acc.executionComplete + r.executionComplete,
                  executionPlanned: acc.executionPlanned + r.executionPlanned,
                }),
                { budgetPlan: 0, executionComplete: 0, executionPlanned: 0 },
              );
              const catRate =
                catTotal.budgetPlan > 0
                  ? ((catTotal.executionComplete + catTotal.executionPlanned) /
                      catTotal.budgetPlan) *
                    100
                  : 0;

              return (
                <SortableTbody key={`cat-${key}`} id={`cat:${key}`}>
                  {({ attributes, listeners }) => (
                    <>
                      {/* ── 구분 헤더 행 ── */}
                      <TableRow
                        className="cursor-pointer bg-[#F3F3EE] hover:bg-[#EBEBЕ6] border-b border-divider"
                        onClick={() => toggleGroup(key)}
                      >
                        <TableCell className="py-2 pl-2 pr-1">
                          <div className="flex items-center gap-0.5">
                            <div
                              {...attributes}
                              {...listeners}
                              className="cursor-grab active:cursor-grabbing rounded flex-shrink-0 p-1 text-text-secondary hover:bg-divider hover:text-[#131310] transition-colors"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <GripVertical className="h-4 w-4" />
                            </div>
                            {isGroupOpen ? (
                              <ChevronDown className="h-4 w-4 text-gray-500 flex-shrink-0" />
                            ) : (
                              <ChevronRight className="h-4 w-4 text-gray-500 flex-shrink-0" />
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="py-2 font-semibold text-[#131310] overflow-hidden" colSpan={4}>
                          <div className="flex items-center">
                            {key}
                            <span className="ml-2 text-xs font-normal text-gray-500">
                              ({groupRows.length}건)
                            </span>
                          </div>
                        </TableCell>
                  <TableCell className="py-2 text-right font-semibold text-[#131310] tabular-nums">
                    {formatKRW(catTotal.budgetPlan)}
                  </TableCell>
                  <TableCell className="py-2 text-right font-semibold text-complete tabular-nums">
                    {formatKRW(catTotal.executionComplete)}
                  </TableCell>
                  <TableCell className="py-2 text-right font-semibold text-planned tabular-nums">
                    {formatKRW(catTotal.executionPlanned)}
                  </TableCell>
                  <TableCell className="py-2 text-right">
                    <ExecutionRateBadge rate={catRate} />
                  </TableCell>
                  <TableCell />
                </TableRow>

                {/* ── 개별 프로그램 행들 ── */}
                {isGroupOpen && (() => {
                  const orderedRows = getOrderedRows(key, groupRows);
                  return (
                    <SortableContext
                      items={orderedRows.map((r) => `row:${r.rowIndex}`)}
                      strategy={verticalListSortingStrategy}
                    >
                        {orderedRows.map((row) => {
                    const isRowOpen = getRowOpen(row.rowIndex);
                    const hasDetail =
                      getVal(row, 'note') ||
                      getVal(row, 'budget') ||
                      getVal(row, 'subCategory') ||
                      getVal(row, 'subDetail') ||
                      true; // 항상 디테일 창을 열어 추가 반영사항을 입력할 수 있게 함

                    const isIncomplete = !getVal(row, 'budget') || !getVal(row, 'subCategory') || !getVal(row, 'subDetail');

                    return (
                      <SortableRow key={`row-group-${row.rowIndex}`} id={`row:${row.rowIndex}`}>
                        {({ dragHandleListeners, dragHandleAttributes, setNodeRef, isDragging, transform, transition }) => (
                        <>
                        {/* 프로그램 행 */}
                        <TableRow
                          ref={setNodeRef}
                          style={{ transform: CSS.Translate.toString(transform), transition, opacity: isDragging ? 0.5 : 1, position: isDragging ? 'relative' : undefined, zIndex: isDragging ? 10 : undefined }}
                          className="transition-colors bg-white hover:bg-[#FAFAF8]"
                        >
                          <TableCell
                            className="py-2 pl-2 pr-1"
                          >
                            <div className="flex items-center gap-0.5">
                              <div
                                {...dragHandleAttributes}
                                {...dragHandleListeners}
                                className="cursor-grab active:cursor-grabbing rounded p-0.5 text-gray-300 hover:text-gray-500 hover:bg-gray-100 transition-colors"
                                onClick={(e) => e.stopPropagation()}
                              >
                                <GripVertical className="h-3.5 w-3.5" />
                              </div>
                              <div
                                className="cursor-pointer"
                                onClick={() => hasDetail && toggleRow(row.rowIndex)}
                              >
                            {hasDetail && (
                              isRowOpen
                                ? <ChevronDown className="h-3.5 w-3.5 text-gray-400" />
                                : <ChevronRight className="h-3.5 w-3.5 text-gray-400" />
                            )}
                              </div>
                            </div>
                          </TableCell>
                          <TableCell
                            className={cn("py-2 pl-5 text-sm overflow-hidden", isIncomplete ? "text-primary" : "text-gray-800", !editMode && hasDetail && "cursor-pointer")}
                            onClick={!editMode ? () => toggleRow(row.rowIndex) : undefined}
                          >
                            <InlineEditCell
                              rowIndex={row.rowIndex} field="programName"
                              value={getVal(row, 'programName')}
                              editMode={editMode}
                              isChanged={isCellChanged(row.rowIndex, 'programName')}
                              editingCell={editingCell} setEditingCell={setEditingCell}
                              onCellChange={onCellChange}
                              onAutoSave={onAutoSave}
                              editKey={`${row.rowIndex}_col_programName`}
                              className="truncate"
                            />
                          </TableCell>
                          <TableCell className="py-2 text-sm text-gray-600 overflow-hidden">
                            <InlineEditCell
                              rowIndex={row.rowIndex} field="professor"
                              value={getVal(row, 'professor')}
                              editMode={editMode}
                              isChanged={isCellChanged(row.rowIndex, 'professor')}
                              editingCell={editingCell} setEditingCell={setEditingCell}
                              onCellChange={onCellChange}
                              onAutoSave={onAutoSave}
                              editKey={`${row.rowIndex}_col_professor`}
                              className={collapsed ? "whitespace-normal break-keep" : "truncate"}
                              showTitle
                            />
                          </TableCell>
                          <TableCell className="py-2 text-sm text-gray-600 overflow-hidden">
                            <InlineEditCell
                              rowIndex={row.rowIndex} field="teacher"
                              value={getVal(row, 'teacher')}
                              editMode={editMode}
                              isChanged={isCellChanged(row.rowIndex, 'teacher')}
                              editingCell={editingCell} setEditingCell={setEditingCell}
                              onCellChange={onCellChange}
                              onAutoSave={onAutoSave}
                              editKey={`${row.rowIndex}_col_teacher`}
                              className={collapsed ? "whitespace-normal break-keep" : "truncate"}
                              showTitle
                            />
                          </TableCell>
                          <TableCell className="py-2 text-sm text-gray-600 overflow-hidden">
                            <InlineEditCell
                              rowIndex={row.rowIndex} field="staff"
                              value={getVal(row, 'staff')}
                              editMode={editMode}
                              isChanged={isCellChanged(row.rowIndex, 'staff')}
                              editingCell={editingCell} setEditingCell={setEditingCell}
                              onCellChange={onCellChange}
                              onAutoSave={onAutoSave}
                              editKey={`${row.rowIndex}_col_staff`}
                              className={collapsed ? "whitespace-normal break-keep" : "truncate"}
                              showTitle
                            />
                          </TableCell>
                          <TableCell className="py-2 text-right text-sm tabular-nums text-gray-700">
                            <InlineEditCell
                              rowIndex={row.rowIndex} field="budgetPlan"
                              value={getVal(row, 'budgetPlan')}
                              editMode={editMode}
                              isChanged={isCellChanged(row.rowIndex, 'budgetPlan')}
                              editingCell={editingCell} setEditingCell={setEditingCell}
                              onCellChange={onCellChange}
                              onAutoSave={onAutoSave}
                              editKey={`${row.rowIndex}_col_budgetPlan`}
                              displayValue={formatKRW(getVal(row, 'budgetPlan'))}
                              className="text-right"
                            />
                          </TableCell>
                          <TableCell className="py-2 text-right text-sm tabular-nums text-complete">
                            {formatKRW(row.executionComplete)}
                          </TableCell>
                          <TableCell className="py-2 text-right text-sm tabular-nums text-planned">
                            {formatKRW(row.executionPlanned)}
                          </TableCell>
                          <TableCell className="py-2 text-right">
                            <ExecutionRateBadge rate={row.executionRate} />
                          </TableCell>
                          <TableCell className="py-2 text-center">
                            {(() => {
                              const isCompleted = localStatus[row.rowIndex]?.isCompleted ?? row.isCompleted ?? false;
                              const isOnHold = localStatus[row.rowIndex]?.isOnHold ?? row.isOnHold ?? false;
                              return (
                                <div className="flex items-center justify-center" style={{ gap: '0.3px' }}>
                                  <button
                                    disabled={!isLoggedIn}
                                    title={isLoggedIn ? (isCompleted ? '완료 해제' : '완료 처리') : '로그인 필요'}
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      const next = !isCompleted;
                                      setLocalStatus((prev) => ({ ...prev, [row.rowIndex]: { ...prev[row.rowIndex], isCompleted: next } }));
                                      onAutoSave?.(row.rowIndex, 'isCompleted', next ? 'TRUE' : 'FALSE');
                                    }}
                                    className={cn(
                                      'flex items-center gap-0.5 rounded px-1 py-0.5 text-xs transition-colors',
                                      isLoggedIn ? 'cursor-pointer hover:opacity-70' : 'cursor-default opacity-40',
                                      isCompleted ? 'text-complete' : 'text-gray-300',
                                    )}
                                  >
                                    {isCompleted ? <CheckSquare className="h-3.5 w-3.5" /> : <Square className="h-3.5 w-3.5" />}
                                    <span>완료</span>
                                  </button>
                                  <button
                                    disabled={!isLoggedIn}
                                    title={isLoggedIn ? (isOnHold ? '보류 해제' : '보류 처리') : '로그인 필요'}
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      const next = !isOnHold;
                                      setLocalStatus((prev) => ({ ...prev, [row.rowIndex]: { ...prev[row.rowIndex], isOnHold: next } }));
                                      onAutoSave?.(row.rowIndex, 'isOnHold', next ? 'TRUE' : 'FALSE');
                                    }}
                                    className={cn(
                                      'flex items-center gap-0.5 rounded px-1 py-0.5 text-xs transition-colors',
                                      isLoggedIn ? 'cursor-pointer hover:opacity-70' : 'cursor-default opacity-40',
                                      isOnHold ? 'text-planned' : 'text-gray-300',
                                    )}
                                  >
                                    {isOnHold ? <CheckSquare className="h-3.5 w-3.5" /> : <Square className="h-3.5 w-3.5" />}
                                    <span>보류</span>
                                  </button>
                                </div>
                              );
                            })()}
                          </TableCell>
                        </TableRow>

                        {/* 상세 펼침 행 */}
                        {isRowOpen && hasDetail && (
                          <TableRow className="bg-[#FAFAF8]">
                            <TableCell colSpan={colSpan} className="pb-4 pt-2 pl-[52px] pr-6">
                              <div className="text-sm space-y-2">
                                {/* 추가 반영사항 */}
                                <div>
                                  <div className="font-medium text-text-secondary mb-1 flex items-center gap-1">
                                    추가 반영사항
                                    {row.additionalReflectionDate && (
                                      <span className="font-normal text-gray-400">({row.additionalReflectionDate})</span>
                                    )}
                                    {canWrite && (
                                      <button
                                        onClick={(e) => { e.stopPropagation(); onDelete?.(row); }}
                                        title="삭제"
                                        className="ml-auto flex items-center gap-1 rounded-lg px-2 py-0.5 text-xs text-gray-400 hover:bg-red-50 hover:text-red-500 transition-colors"
                                      >
                                        <Trash2 className="h-3.5 w-3.5" />
                                        삭제
                                      </button>
                                    )}
                                  </div>
                                  <textarea
                                    defaultValue={getVal(row, 'additionalReflection')}
                                    onBlur={(e) => {
                                      if (e.target.value !== row.additionalReflection) {
                                        const newDate = e.target.value ? new Date().toISOString().slice(0, 10) : '';
                                        onAutoSave?.(row.rowIndex, 'additionalReflection', e.target.value);
                                        onAutoSave?.(row.rowIndex, 'additionalReflectionDate', newDate);
                                        row.additionalReflection = e.target.value;
                                        row.additionalReflectionDate = newDate || undefined;
                                      }
                                    }}
                                    disabled={!isLoggedIn}
                                    placeholder={isLoggedIn ? "추가 반영사항을 입력하세요 (작성 후 바깥을 클릭하면 자동 저장됩니다)" : "추가 반영사항이 없습니다"}
                                    className="w-full resize-y rounded-[2px] border border-[#E3E3E0] p-2 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary disabled:bg-[#F3F3EE] disabled:text-text-secondary disabled:border-transparent transition-colors"
                                    rows={2}
                                  />
                                </div>
                                {/* 하단 메타 정보 */}
                                <div className="pt-2 border-t border-divider mt-1 space-y-1.5 text-xs">
                                  {/* 비고 */}
                                  {(getVal(row, 'note') || editMode) && (
                                    <div className="flex items-start gap-2 pl-1 border-l-[3px] border-[#1F5C99]/40 text-sm text-[#131310]">
                                      <InlineEditCell
                                        rowIndex={row.rowIndex} field="note"
                                        value={getVal(row, 'note')}
                                        editMode={editMode}
                                        isChanged={isCellChanged(row.rowIndex, 'note')}
                                        editingCell={editingCell} setEditingCell={setEditingCell}
                                        onCellChange={onCellChange}
                                        onAutoSave={onAutoSave}
                                        multiline
                                        className="flex items-start text-sm text-[#131310]"
                                      />
                                    </div>
                                  )}
                                  {/* 소관/담당교원/담당직원 */}
                                  <div className="flex flex-wrap gap-x-5 gap-y-1 text-gray-400">
                                    <div className="flex h-5 items-center gap-1">
                                      <span className="shrink-0">소관</span>
                                      <InlineEditCell
                                        rowIndex={row.rowIndex} field="professor"
                                        value={getVal(row, 'professor')}
                                        editMode={editMode}
                                        isChanged={isCellChanged(row.rowIndex, 'professor')}
                                        editingCell={editingCell} setEditingCell={setEditingCell}
                                        onCellChange={onCellChange}
                                        onAutoSave={onAutoSave}
                                        className="flex items-center"
                                      />
                                    </div>
                                    <div className="flex h-5 items-center gap-1">
                                      <span className="shrink-0">담당교원</span>
                                      <InlineEditCell
                                        rowIndex={row.rowIndex} field="teacher"
                                        value={getVal(row, 'teacher')}
                                        editMode={editMode}
                                        isChanged={isCellChanged(row.rowIndex, 'teacher')}
                                        editingCell={editingCell} setEditingCell={setEditingCell}
                                        onCellChange={onCellChange}
                                        onAutoSave={onAutoSave}
                                        className="flex items-center"
                                      />
                                    </div>
                                    <div className="flex h-5 items-center gap-1">
                                      <span className="shrink-0">담당직원</span>
                                      <InlineEditCell
                                        rowIndex={row.rowIndex} field="staff"
                                        value={getVal(row, 'staff')}
                                        editMode={editMode}
                                        isChanged={isCellChanged(row.rowIndex, 'staff')}
                                        editingCell={editingCell} setEditingCell={setEditingCell}
                                        onCellChange={onCellChange}
                                        onAutoSave={onAutoSave}
                                        className="flex items-center"
                                      />
                                    </div>
                                  </div>
                                  {/* 비목/세목/보조세목/예산계획/집행/잔액 */}
                                  <div className="flex flex-wrap gap-x-5 gap-y-1 text-gray-300">
                                    <div className="flex h-5 items-center gap-1">
                                      <span>비목</span>
                                      <InlineEditCell
                                        rowIndex={row.rowIndex} field="budget"
                                        value={getVal(row, 'budget')}
                                        editMode={editMode}
                                        isChanged={isCellChanged(row.rowIndex, 'budget')}
                                        editingCell={editingCell} setEditingCell={setEditingCell}
                                        onCellChange={onCellChange}
                                        onAutoSave={onAutoSave}
                                        className="flex items-center"
                                      />
                                    </div>
                                    <div className="flex h-5 items-center gap-1">
                                      <span>세목</span>
                                      <InlineEditCell
                                        rowIndex={row.rowIndex} field="subCategory"
                                        value={getVal(row, 'subCategory')}
                                        editMode={editMode}
                                        isChanged={isCellChanged(row.rowIndex, 'subCategory')}
                                        editingCell={editingCell} setEditingCell={setEditingCell}
                                        onCellChange={onCellChange}
                                        onAutoSave={onAutoSave}
                                        className="flex items-center"
                                      />
                                    </div>
                                    <div className="flex h-5 items-center gap-1">
                                      <span>보조세목</span>
                                      <InlineEditCell
                                        rowIndex={row.rowIndex} field="subDetail"
                                        value={getVal(row, 'subDetail')}
                                        editMode={editMode}
                                        isChanged={isCellChanged(row.rowIndex, 'subDetail')}
                                        editingCell={editingCell} setEditingCell={setEditingCell}
                                        onCellChange={onCellChange}
                                        onAutoSave={onAutoSave}
                                        className="flex items-center"
                                      />
                                    </div>
                                    <div className="flex h-5 items-center gap-1 text-gray-400">
                                      <span>예산계획</span>
                                      <InlineEditCell
                                        rowIndex={row.rowIndex} field="budgetPlan"
                                        value={getVal(row, 'budgetPlan')}
                                        editMode={editMode}
                                        isChanged={isCellChanged(row.rowIndex, 'budgetPlan')}
                                        editingCell={editingCell} setEditingCell={setEditingCell}
                                        onCellChange={onCellChange}
                                        onAutoSave={onAutoSave}
                                        displayValue={<span className="tabular-nums">{formatKRW(Number(getVal(row, 'budgetPlan')))}원</span>}
                                        className="flex items-center"
                                      />
                                    </div>
                                    <div className="flex h-5 items-center gap-1 text-gray-400">
                                      <span>집행</span>
                                      <span className="tabular-nums">{formatKRW(row.executionComplete + row.executionPlanned)}원</span>
                                    </div>
                                    <div className="flex h-5 items-center gap-1 text-gray-400">
                                      <span>잔액</span>
                                      <span className={cn('tabular-nums', row.balance < 0 ? 'text-red-400' : 'text-gray-400')}>
                                        {formatKRW(row.balance)}원
                                      </span>
                                    </div>
                                  </div>
                                </div>
                              </div>
                            </TableCell>
                          </TableRow>
                        )}
                        </>
                        )}
                      </SortableRow>
                    );
                  })}
                    </SortableContext>
                  );
                })()}

                {/* ── 행 추가 버튼 ── */}
                {isGroupOpen && canWrite && onAddInCategory && (
                  <TableRow className="border-t border-dashed border-[#E3E3E0] bg-white hover:bg-[#F8FBFF]">
                    <TableCell colSpan={colSpan} className="py-1.5">
                      <button
                        onClick={(e) => { e.stopPropagation(); onAddInCategory(key); }}
                        className="flex w-full items-center justify-end gap-1.5 rounded px-3 py-1 text-xs text-text-secondary hover:text-primary transition-colors"
                      >
                        <Plus className="h-3.5 w-3.5" />
                        <span>{key} 행 추가</span>
                      </button>
                    </TableCell>
                  </TableRow>
                )}
                    </>
                  )}
                </SortableTbody>
              );
            })}
            </SortableContext>
          </Table>
        </DndContext>
      </div>
  );
}

function ExecutionRateBadge({ rate }: { rate: number | null | undefined }) {
  const safeRate = rate ?? 0;
  const color =
    safeRate > 100
      ? 'bg-red-100 text-red-600'
      : safeRate >= 80
        ? 'bg-green-100 text-complete'
        : safeRate >= 50
          ? 'bg-amber-100 text-planned'
          : 'bg-gray-100 text-gray-600';
  return (
    <span className={cn('rounded-full px-2 py-0.5 text-xs font-medium', color)}>
      {safeRate.toFixed(1)}%
    </span>
  );
}

function SortableTbody({
  id,
  children,
}: {
  id: string;
  children: (props: { attributes: ReturnType<typeof useSortable>['attributes']; listeners: ReturnType<typeof useSortable>['listeners'] }) => React.ReactNode;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  
  const style = {
    transform: CSS.Translate.toString(transform),
    transition,
    position: isDragging ? ('relative' as const) : undefined,
    zIndex: isDragging ? 50 : 1,
    backgroundColor: isDragging ? 'white' : undefined,
    boxShadow: isDragging ? '0 10px 15px -3px rgba(0,0,0,0.1)' : undefined,
  };

  return (
    <tbody
      ref={setNodeRef}
      style={style}
      className={cn("[&_tr:last-child]:border-0", isDragging && "opacity-90")}
    >
      {children({ attributes, listeners })}
    </tbody>
  );
}

function SortableRow({
  id,
  children,
}: {
  id: string;
  children: (props: {
    dragHandleListeners: ReturnType<typeof useSortable>['listeners'];
    dragHandleAttributes: ReturnType<typeof useSortable>['attributes'];
    setNodeRef: ReturnType<typeof useSortable>['setNodeRef'];
    isDragging: boolean;
    transform: ReturnType<typeof useSortable>['transform'];
    transition: ReturnType<typeof useSortable>['transition'];
  }) => React.ReactNode;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  return <>{children({ dragHandleListeners: listeners, dragHandleAttributes: attributes, setNodeRef, isDragging, transform, transition })}</>;
}

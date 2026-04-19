'use client';

import React, { useState, useEffect, useMemo } from 'react';
import {
  Table,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { formatKRW, cn } from '@/lib/utils';
import type { ProgramRow } from '@/hooks/useDashboard';
import { ChevronDown, ChevronRight, GripVertical, Pencil, Trash2 } from 'lucide-react';
import { useSidebar } from '@/components/layout/SidebarContext';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
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
  displayValue?: React.ReactNode;
  className?: string;
  multiline?: boolean;
  showTitle?: boolean;
}

function InlineEditCell({
  rowIndex, field, value, editMode, isChanged,
  editingCell, setEditingCell, onCellChange,
  displayValue, className, multiline = false, showTitle = false,
}: InlineEditCellProps) {
  const isEditing =
    editingCell?.rowIndex === rowIndex && editingCell?.field === (field as string);
  const [draft, setDraft] = useState('');

  function start(e: React.MouseEvent) {
    e.stopPropagation();
    setDraft(String(value ?? ''));
    setEditingCell({ rowIndex, field: field as string });
  }

  function commit() {
    const isNum = typeof value === 'number';
    const final: string | number = isNum
      ? Number(draft.replace(/,/g, '')) || 0
      : draft;
    onCellChange?.(rowIndex, field, final);
    setEditingCell(null);
  }

  function cancel() {
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
          onKeyDown={(e) => { if (e.key === 'Escape') cancel(); }}
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
        'min-h-[1.25rem] rounded',
        editMode && 'cursor-text hover:bg-amber-50/60',
        isChanged && 'bg-amber-100 px-1 ring-1 ring-amber-300',
        className,
      )}
      onDoubleClick={editMode ? start : undefined}
      title={editMode ? `더블클릭하여 수정${showTitle && strValue ? ` | ${strValue}` : ''}` : (showTitle && strValue ? strValue : undefined)}
    >
      {displayValue ?? (value !== '' && value !== 0 ? strValue : (editMode ? <span className="text-gray-300 text-xs">—</span> : '-'))}
    </div>
  );
}

// ── 메인 컴포넌트 ────────────────────────────────────────────────
export function ProgramTable({
  rows, onEdit, onDelete, canWrite, isLoggedIn = false,
  editMode = false, changes = {}, onCellChange, onAutoSave,
  openGroups: externalOpenGroups, onToggleGroup: externalToggleGroup,
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

  // ── 카테고리 정렬 순서 상태 ──
  const [categoryOrder, setCategoryOrder] = useState<string[]>([]);
  const [isClient, setIsClient] = useState(false);

  useEffect(() => {
    setIsClient(true);
    const saved = localStorage.getItem('dashboard-category-order');
    if (saved) {
      try {
        setCategoryOrder(JSON.parse(saved));
      } catch { /* ignore parse error */ }
    }
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

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      const currentKeys = orderedGrouped.map((g) => g.key);
      const oldIndex = currentKeys.indexOf(String(active.id));
      const newIndex = currentKeys.indexOf(String(over.id));

      if (oldIndex !== -1 && newIndex !== -1) {
        const next = arrayMove(currentKeys, oldIndex, newIndex);
        setCategoryOrder(next);
        localStorage.setItem('dashboard-category-order', JSON.stringify(next));
      }
    }
  }

  function toggleGroup(key: string) {
    if (externalToggleGroup) externalToggleGroup(key);
    else setInternalOpenGroups((prev) => ({ ...prev, [key]: !prev[key] }));
  }

  function toggleRow(rowIndex: number) {
    setOpenRows((prev) => ({ ...prev, [rowIndex]: !prev[rowIndex] }));
  }

  function getVal<K extends keyof ProgramRow>(row: ProgramRow, field: K): ProgramRow[K] {
    return (changes[row.rowIndex]?.[field] ?? row[field]) as ProgramRow[K];
  }

  function isCellChanged(rowIndex: number, field: keyof ProgramRow) {
    return changes[rowIndex]?.[field] !== undefined;
  }

  if (rows.length === 0) {
    return (
      <div className="flex h-40 items-center justify-center rounded-lg border border-dashed border-[#E3E3E0] text-sm text-text-secondary">
        데이터가 없습니다.
      </div>
    );
  }

  const colSpan = canWrite ? 10 : 9;

  return (
    <div className={cn(
        'overflow-x-auto rounded-lg border bg-white shadow-soft transition-colors',
        editMode ? 'border-amber-300' : 'border-[#E3E3E0]',
      )}>
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <Table className="table-fixed">
            <TableHeader>
              <TableRow className="bg-sidebar hover:bg-sidebar">
                <TableHead className="w-12 text-text-secondary px-2" />
                <TableHead className={cn("text-text-secondary font-medium transition-all", collapsed ? "w-[562px]" : "w-[402px]")}>
                  구분 / 프로그램명
                </TableHead>
                <TableHead className="w-16 text-text-secondary font-medium">소관</TableHead>
                <TableHead className="w-32 text-text-secondary font-medium">담당교원</TableHead>
                <TableHead className="text-text-secondary font-medium">담당직원</TableHead>
                <TableHead className="w-24 text-right text-text-secondary font-medium">예산계획</TableHead>
                <TableHead className="w-24 text-right text-text-secondary font-medium">집행완료</TableHead>
                <TableHead className="w-24 text-right text-text-secondary font-medium">집행예정</TableHead>
                <TableHead className="w-16 text-right text-text-secondary font-medium">집행률</TableHead>
                {canWrite && <TableHead className="w-16 text-center text-text-secondary font-medium">관리</TableHead>}
              </TableRow>
            </TableHeader>
            <SortableContext items={orderedGrouped.map((g) => g.key)} strategy={verticalListSortingStrategy}>
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
                <SortableTbody key={`cat-${key}`} id={key}>
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
                  {canWrite && <TableCell />}
                </TableRow>

                {/* ── 개별 프로그램 행들 ── */}
                {isGroupOpen &&
                  groupRows.map((row) => {
                    const isRowOpen = openRows[row.rowIndex] ?? false;
                    const hasDetail =
                      getVal(row, 'note') ||
                      getVal(row, 'budget') ||
                      getVal(row, 'subCategory') ||
                      getVal(row, 'subDetail') ||
                      true; // 항상 디테일 창을 열어 추가 반영사항을 입력할 수 있게 함

                    const isIncomplete = !getVal(row, 'budget') || !getVal(row, 'subCategory') || !getVal(row, 'subDetail');

                    return (
                      <React.Fragment key={`row-group-${row.rowIndex}`}>
                        {/* 프로그램 행 */}
                        <TableRow
                          className={cn(
                            'transition-colors bg-white hover:bg-[#FAFAF8]',
                            hasDetail && 'cursor-pointer',
                          )}
                          onClick={() => hasDetail && toggleRow(row.rowIndex)}
                        >
                          <TableCell className="py-2 pl-7 pr-1">
                            {hasDetail && (
                              isRowOpen
                                ? <ChevronDown className="h-3.5 w-3.5 text-gray-400" />
                                : <ChevronRight className="h-3.5 w-3.5 text-gray-400" />
                            )}
                          </TableCell>
                          <TableCell className={cn("py-2 pl-5 text-sm overflow-hidden", isIncomplete ? "text-primary" : "text-gray-800")}>
                            <InlineEditCell
                              rowIndex={row.rowIndex} field="programName"
                              value={getVal(row, 'programName')}
                              editMode={editMode}
                              isChanged={isCellChanged(row.rowIndex, 'programName')}
                              editingCell={editingCell} setEditingCell={setEditingCell}
                              onCellChange={onCellChange}
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
                          {canWrite && (
                            <TableCell className="py-2 text-center">
                              <div className="flex justify-center gap-1">
                                <button
                                  onClick={(e) => { e.stopPropagation(); onEdit?.(row); }}
                                  title="수정"
                                  className="rounded-lg p-1.5 text-text-secondary hover:bg-primary-bg hover:text-primary transition-colors"
                                >
                                  <Pencil className="h-3.5 w-3.5" />
                                </button>
                                <button
                                  onClick={(e) => { e.stopPropagation(); onDelete?.(row); }}
                                  title="삭제"
                                  className="rounded-lg p-1.5 text-text-secondary hover:bg-red-50 hover:text-red-500 transition-colors"
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </button>
                              </div>
                            </TableCell>
                          )}
                        </TableRow>

                        {/* 상세 펼침 행 */}
                        {isRowOpen && hasDetail && (
                          <TableRow className="bg-[#FAFAF8]">
                            <TableCell colSpan={colSpan} className="pb-4 pt-2 pl-[52px] pr-6">
                              <div className="text-sm space-y-2">
                                {/* 프로그램명 (풀 텍스트) */}
                                <div className="pb-2 border-b border-divider flex gap-2">
                                  <span className="font-medium text-text-secondary shrink-0">프로그램명</span>
                                  <span className="text-[#131310] whitespace-pre-wrap flex-1">{getVal(row, 'programName')}</span>
                                </div>
                                {/* 비고 */}
                                {(getVal(row, 'note') || editMode) && (
                                  <div className="pb-2 border-b border-divider flex gap-2">
                                    <span className="font-medium text-text-secondary shrink-0">비고</span>
                                    <InlineEditCell
                                      rowIndex={row.rowIndex} field="note"
                                      value={getVal(row, 'note')}
                                      editMode={editMode}
                                      isChanged={isCellChanged(row.rowIndex, 'note')}
                                      editingCell={editingCell} setEditingCell={setEditingCell}
                                      onCellChange={onCellChange}
                                      multiline
                                      className="text-gray-500 whitespace-pre-wrap flex-1"
                                    />
                                  </div>
                                )}
                                {/* 비목/세목/보조세목/잔액 */}
                                <div className="flex flex-wrap gap-4 items-center">
                                  <div className="flex items-center gap-2">
                                    <span className="font-medium text-text-secondary">비목</span>
                                    {editMode ? (
                                      <InlineEditCell
                                        rowIndex={row.rowIndex} field="budget"
                                        value={getVal(row, 'budget')}
                                        editMode={editMode}
                                        isChanged={isCellChanged(row.rowIndex, 'budget')}
                                        editingCell={editingCell} setEditingCell={setEditingCell}
                                        onCellChange={onCellChange}
                                        className="text-gray-500"
                                      />
                                    ) : (
                                      <Badge variant="outline" className="border-[#E3E3E0] text-text-secondary">
                                        {getVal(row, 'budget') || '-'}
                                      </Badge>
                                    )}
                                  </div>
                                  <div className="flex items-center gap-2">
                                    <span className="font-medium text-text-secondary">세목</span>
                                    <InlineEditCell
                                      rowIndex={row.rowIndex} field="subCategory"
                                      value={getVal(row, 'subCategory')}
                                      editMode={editMode}
                                      isChanged={isCellChanged(row.rowIndex, 'subCategory')}
                                      editingCell={editingCell} setEditingCell={setEditingCell}
                                      onCellChange={onCellChange}
                                      className="text-gray-500"
                                    />
                                  </div>
                                  <div className="flex items-center gap-2">
                                    <span className="font-medium text-text-secondary">보조세목</span>
                                    <InlineEditCell
                                      rowIndex={row.rowIndex} field="subDetail"
                                      value={getVal(row, 'subDetail')}
                                      editMode={editMode}
                                      isChanged={isCellChanged(row.rowIndex, 'subDetail')}
                                      editingCell={editingCell} setEditingCell={setEditingCell}
                                      onCellChange={onCellChange}
                                      className="text-gray-500"
                                    />
                                  </div>
                                  <div className="flex items-center gap-2">
                                    <span className="font-medium text-text-secondary">잔액</span>
                                    <span className={cn(
                                      'font-medium tabular-nums text-text-secondary',
                                      row.balance < 0 && 'text-red-400',
                                    )}>
                                      {formatKRW(row.balance)}원
                                    </span>
                                  </div>
                                </div>
                                {/* 추가 반영사항 */}
                                <div className="pt-2 border-t border-divider mt-2">
                                  <div className="font-medium text-text-secondary mb-1">추가 반영사항</div>
                                  <textarea
                                    defaultValue={getVal(row, 'additionalReflection')}
                                    onBlur={(e) => {
                                      if (e.target.value !== row.additionalReflection) {
                                        onAutoSave?.(row.rowIndex, 'additionalReflection', e.target.value);
                                        row.additionalReflection = e.target.value;
                                      }
                                    }}
                                    disabled={!isLoggedIn}
                                    placeholder={isLoggedIn ? "추가 반영사항을 입력하세요 (작성 후 바깥을 클릭하면 자동 저장됩니다)" : "추가 반영사항이 없습니다"}
                                    className="w-full resize-y rounded-lg border border-[#E3E3E0] p-2 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary disabled:bg-[#F3F3EE] disabled:text-text-secondary disabled:border-transparent transition-colors"
                                    rows={2}
                                  />
                                </div>
                              </div>
                            </TableCell>
                          </TableRow>
                        )}
                      </React.Fragment>
                    );
                  })}
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

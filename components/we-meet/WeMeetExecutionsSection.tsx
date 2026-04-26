'use client';

import { useState, useMemo, useEffect } from 'react';
import {
  Plus, Trash2, RefreshCw, Check, X,
  ChevronDown, ChevronRight, Search, GripVertical,
  Send, Settings2, SendHorizonal, RotateCcw, ExternalLink,
} from 'lucide-react';
import {
  DndContext, type DragEndEvent, DragOverlay, type DragStartEvent,
  PointerSensor, useSensor, useSensors, closestCenter,
} from '@dnd-kit/core';
import {
  SortableContext, useSortable, verticalListSortingStrategy, arrayMove,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/shared/ConfirmDialog';
import { formatKRW, parseKRW } from '@/lib/utils';
import { WeMeetBulkAddModal } from '@/components/we-meet/WeMeetBulkAddModal';
import { WeMeetGroupSendModal } from '@/components/we-meet/WeMeetGroupSendModal';
import { WeMeetSendSettingsModal } from '@/components/we-meet/WeMeetSendSettingsModal';
import {
  useWeMeetExecutions,
  useAddWeMeetExecution,
  useUpdateWeMeetExecution,
  useDeleteWeMeetExecution,
  useAddBulkWeMeetExecutions,
  useReorderWeMeetExecutions,
  useMarkWeMeetSent,
  useWeMeetSendBatches,
  useUndoWeMeetBatch,
  type ExecutionPayload,
} from '@/hooks/useWeMeet';
import type { WeMeetExecution, WeMeetSendBatch } from '@/types';

// ── 타입 ──────────────────────────────────────────────────────────────

interface ExecGroup {
  key: string;
  usageType: string;
  description: string;
  rows: WeMeetExecution[];
}

interface TeamFormRow {
  teamName: string;
  usageDate: string;
  draftStr: string;
  confirmedStr: string;
  claimed: boolean;
  evidenceSubmitted: boolean;
}

interface NewGroupForm {
  usageType: string;
  description: string;
  teams: TeamFormRow[];
}

// ── 유틸 ──────────────────────────────────────────────────────────────

function groupExecutions(execs: WeMeetExecution[]): ExecGroup[] {
  const map = new Map<string, ExecGroup>();
  const order: string[] = [];
  for (const e of execs) {
    const key = `${e.usageType}||${e.description}`;
    if (!map.has(key)) {
      map.set(key, { key, usageType: e.usageType, description: e.description, rows: [] });
      order.push(key);
    }
    map.get(key)!.rows.push(e);
  }
  return order.map((k) => map.get(k)!);
}

const DEFAULT_TEAM: TeamFormRow = {
  teamName: '', usageDate: '', draftStr: '', confirmedStr: '', claimed: false, evidenceSubmitted: false,
};

const DEFAULT_NEW_GROUP: NewGroupForm = {
  usageType: '', description: '', teams: [{ ...DEFAULT_TEAM }],
};

// ── 금액 인라인 입력 ──────────────────────────────────────────────────

function AmountInput({ value, onSave, disabled = false, placeholder = '0' }: {
  value: number; onSave: (v: number) => void; disabled?: boolean; placeholder?: string;
}) {
  const [inputVal, setInputVal] = useState(value > 0 ? formatKRW(value) : '');

  useEffect(() => {
    setInputVal(value > 0 ? formatKRW(value) : '');
  }, [value]);

  return (
    <input
      type="text"
      value={inputVal}
      disabled={disabled}
      placeholder={placeholder}
      onChange={(e) => {
        const raw = e.target.value.replace(/[^0-9]/g, '');
        setInputVal(raw === '' ? '' : Number(raw).toLocaleString('ko-KR'));
      }}
      onBlur={() => {
        const next = parseKRW(inputVal) || 0;
        setInputVal(next > 0 ? formatKRW(next) : '');
        if (next !== value) onSave(next);
      }}
      onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }}
      className="w-24 rounded border border-transparent px-2 py-0.5 text-right text-xs text-[#131310] bg-transparent placeholder:text-gray-300 hover:border-[#D0D0CA] focus:border-[#E3E3E0] focus:outline-none focus:ring-1 focus:ring-primary transition-colors disabled:opacity-40"
    />
  );
}

function TeamSelect({ value, teams, onSave, disabled = false }: {
  value: string; teams: string[]; onSave: (v: string) => void; disabled?: boolean;
}) {
  const [local, setLocal] = useState(value);
  useEffect(() => setLocal(value), [value]);
  const allOptions = teams.includes(value) ? teams : [...teams, value];
  return (
    <select value={local} disabled={disabled}
      onChange={(e) => { setLocal(e.target.value); onSave(e.target.value); }}
      className="w-full rounded border border-transparent bg-transparent px-2 py-0.5 text-xs text-[#131310] hover:border-[#D0D0CA] focus:border-[#E3E3E0] focus:outline-none focus:ring-1 focus:ring-primary transition-colors disabled:opacity-40"
    >
      {allOptions.map((t) => <option key={t} value={t}>{t}</option>)}
    </select>
  );
}

function UsageTypeSelect({ value, usageTypes, onSave, disabled = false }: {
  value: string; usageTypes: string[]; onSave: (v: string) => void; disabled?: boolean;
}) {
  const [local, setLocal] = useState(value);
  useEffect(() => setLocal(value), [value]);
  const allOptions = usageTypes.includes(value) ? usageTypes : [...usageTypes, value];
  return (
    <select value={local} disabled={disabled}
      onChange={(e) => { setLocal(e.target.value); onSave(e.target.value); }}
      className="w-full rounded border border-transparent bg-transparent px-2 py-0.5 text-xs text-[#131310] hover:border-[#D0D0CA] focus:border-[#E3E3E0] focus:outline-none focus:ring-1 focus:ring-primary transition-colors disabled:opacity-40"
    >
      {allOptions.map((u) => <option key={u} value={u}>{u}</option>)}
    </select>
  );
}

const fi  = 'w-full rounded border border-[#E3E3E0] px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-primary';
const fis = 'w-full rounded border border-[#E3E3E0] bg-white px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-primary';

// ── DnD 드래그 핸들 래퍼 ─────────────────────────────────────────────

function SortableGroupBody({ id, disabled, children }: {
  id: string;
  disabled?: boolean;
  children: (dragHandle: React.ReactNode) => React.ReactNode;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id,
    disabled: disabled ?? false,
  });

  const dragHandle = !disabled ? (
    <span
      {...listeners}
      className="cursor-grab active:cursor-grabbing touch-none select-none shrink-0 text-gray-300 hover:text-gray-500 transition-colors"
      onClick={(e) => e.stopPropagation()}
    >
      <GripVertical className="h-3.5 w-3.5" />
    </span>
  ) : null;

  return (
    <tbody
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.4 : 1,
      }}
      {...attributes}
    >
      {children(dragHandle)}
    </tbody>
  );
}

// ── 컴포넌트 ─────────────────────────────────────────────────────────

interface Props {
  canWrite: boolean;
}

export function WeMeetExecutionsSection({ canWrite }: Props) {
  const { data, isLoading, isError, error, refetch } = useWeMeetExecutions();
  const addMutation       = useAddWeMeetExecution();
  const updateMutation    = useUpdateWeMeetExecution();
  const deleteMutation    = useDeleteWeMeetExecution();
  const bulkMutation      = useAddBulkWeMeetExecutions();
  const reorderMutation   = useReorderWeMeetExecutions();
  const markSentMutation  = useMarkWeMeetSent();
  const undoBatchMutation = useUndoWeMeetBatch();
  const { data: batchData } = useWeMeetSendBatches();

  const executions = useMemo(() => data?.executions ?? [], [data]);
  const teams      = data?.teams ?? [];
  const usageTypes = data?.usageTypes ?? [];
  const groups     = useMemo(() => groupExecutions(executions), [executions]);

  const [addTeamGroupKey, setAddTeamGroupKey] = useState<string | null>(null);
  const [newTeam, setNewTeam]                 = useState<TeamFormRow>({ ...DEFAULT_TEAM });
  const [showNewGroup, setShowNewGroup]       = useState(false);
  const [newGroupForm, setNewGroupForm]       = useState<NewGroupForm>({ ...DEFAULT_NEW_GROUP });
  const [deleteOpen, setDeleteOpen]           = useState(false);
  const [deleteTarget, setDeleteTarget]       = useState<WeMeetExecution | null>(null);
  const [showBulkModal, setShowBulkModal]         = useState(false);
  const [expandedKeys, setExpandedKeys]           = useState<Set<string>>(new Set());
  const [sendGroup, setSendGroup]                 = useState<ExecGroup | null>(null);
  const [sendInitialSelection, setSendInitialSelection] = useState<number[]>([]);
  const [showSendSettings, setShowSendSettings]   = useState(false);
  const [groupSelections, setGroupSelections]     = useState<Map<string, Set<number>>>(new Map());

  // 검색 + 사용구분 필터
  const [searchQuery, setSearchQuery] = useState('');
  const [activeType, setActiveType]   = useState('전체');

  // DnD 그룹 순서
  const [groupOrder, setGroupOrder]     = useState<string[]>([]);
  const [activeDragKey, setActiveDragKey] = useState<string | null>(null);

  // groupOrder를 groups 변경에 동기화
  useEffect(() => {
    setGroupOrder((prev) => {
      const existingKeys = new Set(groups.map((g) => g.key));
      const filtered = prev.filter((k) => existingKeys.has(k));
      const newKeys = groups.filter((g) => !prev.includes(g.key)).map((g) => g.key);
      return [...filtered, ...newKeys];
    });
  }, [groups]);

  // 순서 적용된 그룹
  const orderedGroups = useMemo(() => {
    const map = new Map(groups.map((g) => [g.key, g]));
    return groupOrder.map((k) => map.get(k)).filter((g): g is ExecGroup => g !== undefined);
  }, [groups, groupOrder]);

  // 검색·필터가 없을 때만 DnD 활성
  const isDndEnabled = canWrite && !searchQuery && activeType === '전체';

  // 필터링된 그룹
  const filteredGroups = useMemo(() => {
    let result = orderedGroups;
    if (activeType !== '전체') result = result.filter((g) => g.usageType === activeType);
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      result = result.filter(
        (g) =>
          g.usageType.toLowerCase().includes(q) ||
          g.description.toLowerCase().includes(q) ||
          g.rows.some((r) => r.teamName.toLowerCase().includes(q)),
      );
    }
    return result;
  }, [orderedGroups, activeType, searchQuery]);

  // DnD 센서
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
  );

  function handleDragStart(event: DragStartEvent) {
    setActiveDragKey(event.active.id as string);
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    setActiveDragKey(null);
    if (!over || active.id === over.id) return;

    const oldIdx = groupOrder.indexOf(active.id as string);
    const newIdx = groupOrder.indexOf(over.id as string);
    if (oldIdx === -1 || newIdx === -1) return;

    const newOrder = arrayMove(groupOrder, oldIdx, newIdx);
    setGroupOrder(newOrder);

    const map = new Map(groups.map((g) => [g.key, g]));
    const orderedExecs = newOrder.flatMap((k) => map.get(k)?.rows ?? []);
    reorderMutation.mutate(orderedExecs);
  }

  // ── 저장 ─────────────────────────────────────────────────────────────

  function saveRow(row: WeMeetExecution, patch: Partial<Omit<WeMeetExecution, 'rowIndex'>>) {
    updateMutation.mutate({
      rowIndex: row.rowIndex, usageType: row.usageType, teamName: row.teamName,
      draftAmount: row.draftAmount, confirmedAmount: row.confirmedAmount,
      claimed: row.claimed, description: row.description, usageDate: row.usageDate,
      evidenceSubmitted: row.evidenceSubmitted, ...patch,
    });
  }

  function saveGroupField(group: ExecGroup, patch: Partial<Pick<WeMeetExecution, 'usageType' | 'description'>>) {
    group.rows.forEach((r) => saveRow(r, patch));
  }

  async function handleAddTeamToGroup(group: ExecGroup) {
    if (!newTeam.teamName) return;
    const draft     = parseKRW(newTeam.draftStr) || 0;
    const confirmed = parseKRW(newTeam.confirmedStr) || 0;
    await addMutation.mutateAsync({
      usageType: group.usageType, teamName: newTeam.teamName,
      draftAmount: draft, confirmedAmount: confirmed,
      claimed: confirmed > 0 ? newTeam.claimed : false,
      description: group.description, usageDate: newTeam.usageDate,
      evidenceSubmitted: newTeam.evidenceSubmitted,
    });
    setAddTeamGroupKey(null);
    setNewTeam({ ...DEFAULT_TEAM });
  }

  async function handleSaveNewGroup() {
    const validTeams = newGroupForm.teams.filter((t) => t.teamName);
    if (!newGroupForm.usageType || !newGroupForm.description || validTeams.length === 0) return;

    const payloads: ExecutionPayload[] = validTeams.map((t) => {
      const draft     = parseKRW(t.draftStr) || 0;
      const confirmed = parseKRW(t.confirmedStr) || 0;
      return {
        usageType: newGroupForm.usageType, teamName: t.teamName,
        draftAmount: draft, confirmedAmount: confirmed,
        claimed: confirmed > 0 ? t.claimed : false,
        description: newGroupForm.description, usageDate: t.usageDate,
        evidenceSubmitted: t.evidenceSubmitted,
      };
    });
    await bulkMutation.mutateAsync(payloads);
    setShowNewGroup(false);
    setNewGroupForm({ ...DEFAULT_NEW_GROUP });
  }

  function updateNewGroupTeam(idx: number, patch: Partial<TeamFormRow>) {
    setNewGroupForm((f) => ({
      ...f, teams: f.teams.map((t, i) => (i === idx ? { ...t, ...patch } : t)),
    }));
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    await deleteMutation.mutateAsync(deleteTarget.rowIndex);
    setDeleteOpen(false);
    setDeleteTarget(null);
  }

  function toggleGroup(key: string) {
    setExpandedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function getGroupSelection(groupKey: string): Set<number> {
    return groupSelections.get(groupKey) ?? new Set<number>();
  }

  function toggleTeamSelection(groupKey: string, rowIndex: number) {
    setGroupSelections((prev) => {
      const current = prev.get(groupKey) ?? new Set<number>();
      const next = new Set(current);
      if (next.has(rowIndex)) next.delete(rowIndex);
      else next.add(rowIndex);
      const newMap = new Map(prev);
      newMap.set(groupKey, next);
      return newMap;
    });
  }

  function toggleAllTeamSelection(groupKey: string, unsentRows: WeMeetExecution[]) {
    setGroupSelections((prev) => {
      const current = prev.get(groupKey) ?? new Set<number>();
      const unsentIndexes = unsentRows.map((r) => r.rowIndex);
      const allSelected = unsentIndexes.every((i) => current.has(i));
      const newMap = new Map(prev);
      newMap.set(groupKey, allSelected ? new Set<number>() : new Set(unsentIndexes));
      return newMap;
    });
  }

  // ── 테이블 ───────────────────────────────────────────────────────────

  const colCount = canWrite ? 9 : 8;

  function renderGroupRows(group: ExecGroup, gi: number, dragHandle: React.ReactNode) {
    const result: React.ReactNode[] = [];
    const isExpanded   = expandedKeys.has(group.key);
    const topBorder    = gi > 0 ? 'border-t-2 border-[#D6E4F0]' : '';
    const totalDraft   = group.rows.reduce((s, r) => s + r.draftAmount, 0);
    const totalConf    = group.rows.reduce((s, r) => s + r.confirmedAmount, 0);
    const unclaimedAmt = group.rows.filter((r) => r.confirmedAmount > 0 && !r.claimed).reduce((s, r) => s + r.confirmedAmount, 0);
    const evidenceCnt  = group.rows.filter((r) => r.evidenceSubmitted).length;
    const allSent      = group.rows.length > 0 && group.rows.every((r) => r.sent);
    const anySent      = group.rows.some((r) => r.sent);

    if (!isExpanded) {
      result.push(
        <tr
          key={`collapsed-${group.key}`}
          className={`bg-white ${topBorder} cursor-pointer hover:bg-[#F5F9FC] transition-colors`}
          onClick={() => toggleGroup(group.key)}
        >
          <td className="px-3 py-2">
            <div className="flex items-center gap-1.5">
              {dragHandle}
              <ChevronRight className="h-3.5 w-3.5 shrink-0 text-gray-400" />
              <span className="text-xs text-[#131310]">{group.usageType}</span>
            </div>
          </td>
          <td className="px-3 py-2 text-xs text-[#131310]">{group.description}</td>
          <td className="px-3 py-2">
            <div className="flex items-center gap-1.5">
              <span className="rounded-full bg-[#D6E4F0] px-2 py-0.5 text-[11px] font-medium text-primary">
                {group.rows.length}팀
              </span>
              {allSent && (
                <span className="rounded-full bg-green-100 px-1.5 py-0.5 text-[10px] font-medium text-green-600 flex items-center gap-0.5">
                  <SendHorizonal className="h-2.5 w-2.5" />전송완료
                </span>
              )}
              {!allSent && anySent && (
                <span className="rounded-full bg-yellow-50 px-1.5 py-0.5 text-[10px] font-medium text-yellow-600">
                  일부전송
                </span>
              )}
            </div>
          </td>
          <td className="px-3 py-2 text-xs text-gray-300">—</td>
          <td className="px-3 py-2 text-right text-xs tabular-nums text-[#131310]">
            {totalDraft > 0 ? formatKRW(totalDraft) : <span className="text-gray-300">—</span>}
          </td>
          <td className="px-3 py-2 text-right text-xs tabular-nums text-[#131310]">
            {totalConf > 0 ? formatKRW(totalConf) : <span className="text-gray-300">—</span>}
          </td>
          <td className="px-3 py-2 text-right text-xs">
            {unclaimedAmt > 0
              ? <span className="inline-flex w-36 items-center justify-between text-red-400">
                  <span className="text-[10px]">(미청구)</span>
                  <span className="tabular-nums">{formatKRW(unclaimedAmt)}</span>
                </span>
              : <span className="text-gray-300">—</span>}
          </td>
          <td className="px-3 py-2 text-center text-xs">
            {evidenceCnt > 0
              ? <span className="text-[#131310]">{evidenceCnt}/{group.rows.length}</span>
              : <span className="text-gray-300">—</span>}
          </td>
          {canWrite && (
            <td className="px-2 py-2 text-center" onClick={(e) => e.stopPropagation()}>
              <button
                onClick={() => { setSendGroup(group); setSendInitialSelection(group.rows.map((r) => r.rowIndex)); }}
                title="비목별 집행내역으로 전송 (전체 팀)"
                className="rounded p-1 text-gray-300 hover:bg-[#D6E4F0] hover:text-primary transition-colors"
              >
                <Send className="h-3.5 w-3.5" />
              </button>
            </td>
          )}
        </tr>,
      );
      return result;
    }

    // ── 확장 상태 ────────────────────────────────────────────────────────
    const currentSelection = getGroupSelection(group.key);

    // 이 그룹의 row index 집합
    const groupRowIndexSet = new Set(group.rows.map((r) => r.rowIndex));

    // 이 그룹에 속한 배치들 (sent=TRUE 행들을 배치로 묶음)
    const allBatches: WeMeetSendBatch[] = batchData ?? [];
    const groupBatches = allBatches.filter((b) =>
      b.wemeetRowIndexes.some((ri) => groupRowIndexSet.has(ri)),
    );

    // 배치에 속한 row index 집합 (이미 전송된 행)
    const batchedRowSet = new Set(groupBatches.flatMap((b) => b.wemeetRowIndexes));

    // 미전송 행 (체크박스 표시 대상)
    const unsentRows = group.rows.filter((r) => !batchedRowSet.has(r.rowIndex));
    const allUnsentSelected = unsentRows.length > 0 && unsentRows.every((r) => currentSelection.has(r.rowIndex));

    // 첫 행: 취합 정보 + 보내기 버튼
    result.push(
      <tr key={`summary-${group.key}`} className={`bg-[#EEF4FB] ${topBorder}`}>
        {/* 사용구분: drag + collapse + usageType */}
        <td className="px-3 py-2">
          <div className="flex items-center gap-1">
            {dragHandle}
            <button
              onClick={() => toggleGroup(group.key)}
              className="shrink-0 rounded p-0.5 text-gray-400 hover:bg-[#D6E4F0] hover:text-primary transition-colors"
            >
              <ChevronDown className="h-3.5 w-3.5" />
            </button>
            <UsageTypeSelect value={group.rows[0]?.usageType ?? ''} usageTypes={usageTypes} disabled={!canWrite}
              onSave={(v) => saveGroupField(group, { usageType: v })} />
          </div>
        </td>

        {/* 지출건명 */}
        <td className="px-3 py-2">
          <input
            key={`${group.key}-desc`}
            type="text"
            defaultValue={group.description}
            disabled={!canWrite}
            placeholder="지출건명"
            onBlur={(e) => { if (e.target.value !== group.description) saveGroupField(group, { description: e.target.value }); }}
            onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }}
            className="w-full min-w-[120px] rounded border border-transparent bg-transparent px-2 py-0.5 text-xs text-[#131310] hover:border-[#D0D0CA] focus:border-[#E3E3E0] focus:outline-none focus:ring-1 focus:ring-primary transition-colors disabled:opacity-40"
          />
        </td>

        {/* 팀명 열: N팀 + 선택 수 (클릭 시 전체선택/해제) + sent 배지 */}
        <td className="px-3 py-2">
          <div className="flex items-center gap-1.5 flex-wrap">
            {unsentRows.length > 0 ? (
              <button
                onClick={() => toggleAllTeamSelection(group.key, unsentRows)}
                title={allUnsentSelected ? '미전송 전체 해제' : '미전송 전체 선택'}
                className="rounded-full bg-[#D6E4F0] px-2 py-0.5 text-[11px] font-medium text-primary hover:bg-primary hover:text-white transition-colors"
              >
                {currentSelection.size}/{unsentRows.length}팀
              </button>
            ) : (
              <span className="rounded-full bg-[#D6E4F0] px-2 py-0.5 text-[11px] font-medium text-primary">
                {group.rows.length}팀
              </span>
            )}
            {allSent && (
              <span className="rounded-full bg-green-100 px-1.5 py-0.5 text-[10px] font-medium text-green-600 flex items-center gap-0.5">
                <SendHorizonal className="h-2.5 w-2.5" />전송완료
              </span>
            )}
            {!allSent && anySent && (
              <span className="rounded-full bg-yellow-50 px-1.5 py-0.5 text-[10px] font-medium text-yellow-600">
                일부전송
              </span>
            )}
          </div>
        </td>

        {/* 사용일자 */}
        <td className="px-3 py-2 text-xs text-gray-300">—</td>

        {/* 기안금액 합계 */}
        <td className="px-3 py-2 text-right text-xs tabular-nums font-medium text-[#131310]">
          {totalDraft > 0 ? formatKRW(totalDraft) : <span className="text-gray-300">—</span>}
        </td>

        {/* 확정금액 합계 */}
        <td className="px-3 py-2 text-right text-xs tabular-nums font-medium text-[#131310]">
          {totalConf > 0 ? formatKRW(totalConf) : <span className="text-gray-300">—</span>}
        </td>

        {/* 미청구 합계 */}
        <td className="px-3 py-2 text-right text-xs">
          {unclaimedAmt > 0
            ? <span className="inline-flex w-36 items-center justify-between text-red-400">
                <span className="text-[10px]">(미청구)</span>
                <span className="tabular-nums">{formatKRW(unclaimedAmt)}</span>
              </span>
            : <span className="text-gray-300">—</span>}
        </td>

        {/* 증빙 건수 */}
        <td className="px-3 py-2 text-center text-xs">
          {evidenceCnt > 0
            ? <span className="text-[#131310]">{evidenceCnt}/{group.rows.length}</span>
            : <span className="text-gray-300">—</span>}
        </td>

        {/* 보내기 버튼 */}
        {canWrite && (
          <td className="px-2 py-2 text-center" onClick={(e) => e.stopPropagation()}>
            <button
              onClick={() => { setSendGroup(group); setSendInitialSelection(Array.from(currentSelection)); }}
              disabled={currentSelection.size === 0}
              title={currentSelection.size > 0 ? `선택한 ${currentSelection.size}팀 전송` : '미전송 팀을 선택하세요'}
              className="rounded p-1 text-gray-300 hover:bg-[#D6E4F0] hover:text-primary transition-colors disabled:cursor-not-allowed disabled:opacity-30"
            >
              <Send className="h-3.5 w-3.5" />
            </button>
          </td>
        )}
      </tr>,
    );

    // ── 미전송 팀 행 (체크박스 포함) ────────────────────────────────────
    unsentRows.forEach((row, ri) => {
      const isLast    = ri === unsentRows.length - 1 && groupBatches.length === 0;
      const bg        = ri % 2 === 0 ? 'bg-white' : 'bg-[#F5F9FC]';
      const isConf    = row.confirmedAmount > 0;
      const isChecked = currentSelection.has(row.rowIndex);

      result.push(
        <tr key={row.rowIndex} className={bg}>
          <td className="px-3 py-1.5">
            {canWrite ? (
              <div className="flex items-center pl-4">
                <button onClick={() => { setDeleteTarget(row); setDeleteOpen(true); }}
                  className="rounded p-1 text-gray-300 hover:bg-red-50 hover:text-red-500 transition-colors">
                  <Trash2 className="h-3 w-3" />
                </button>
              </div>
            ) : (
              <span className="text-gray-300 pl-2 select-none">↑</span>
            )}
          </td>
          <td className="px-3 py-1.5"><span className="text-gray-300 pl-2 select-none">↑</span></td>
          <td className="px-3 py-1.5">
            <TeamSelect value={row.teamName} teams={teams} disabled={!canWrite}
              onSave={(v) => saveRow(row, { teamName: v })} />
          </td>
          <td className="px-3 py-1.5">
            <input key={`${row.rowIndex}-date`} type="date" defaultValue={row.usageDate}
              disabled={!canWrite}
              onBlur={(e) => { if (e.target.value !== row.usageDate) saveRow(row, { usageDate: e.target.value }); }}
              className="rounded border border-transparent bg-transparent px-2 py-0.5 text-xs text-[#131310] hover:border-[#D0D0CA] focus:border-[#E3E3E0] focus:outline-none focus:ring-1 focus:ring-primary transition-colors disabled:opacity-40"
            />
          </td>
          <td className="px-3 py-1.5 text-right">
            <AmountInput value={row.draftAmount} disabled={!canWrite}
              onSave={(v) => saveRow(row, { draftAmount: v })} />
          </td>
          <td className="px-3 py-1.5 text-right">
            <AmountInput value={row.confirmedAmount} disabled={!canWrite} placeholder="0=미확정"
              onSave={(v) => saveRow(row, { confirmedAmount: v, claimed: v === 0 ? false : row.claimed })} />
          </td>
          <td className="px-3 py-1.5 text-center">
            <input type="checkbox" checked={row.claimed}
              disabled={!canWrite || !isConf}
              onChange={(e) => saveRow(row, { claimed: e.target.checked })}
              className="h-3.5 w-3.5 accent-primary disabled:cursor-default disabled:opacity-40"
              title={!isConf ? '확정금액 입력 후 활성화' : ''}
            />
          </td>
          <td className="px-3 py-1.5 text-center">
            <input type="checkbox" checked={row.evidenceSubmitted}
              disabled={!canWrite}
              onChange={(e) => saveRow(row, { evidenceSubmitted: e.target.checked })}
              className="h-3.5 w-3.5 accent-primary disabled:cursor-default"
            />
          </td>
          {canWrite && (
            <td className="px-2 py-1.5 text-center">
              <input type="checkbox" checked={isChecked}
                onChange={() => toggleTeamSelection(group.key, row.rowIndex)}
                className="h-3.5 w-3.5 accent-primary cursor-pointer"
              />
            </td>
          )}
        </tr>,
      );

      if (canWrite && isLast) {
        if (addTeamGroupKey === group.key) {
          const newConf = parseKRW(newTeam.confirmedStr) || 0;
          result.push(
            <tr key={`add-team-${group.key}`} className="bg-[#F8FAFF] border-t border-dashed border-[#C8DCF0]">
              <td className="px-3 py-1.5 pl-5 text-[10px] text-gray-300">+</td>
              <td className="px-3 py-1.5 text-[10px] text-gray-300">↑</td>
              <td className="px-3 py-1.5">
                <select value={newTeam.teamName} onChange={(e) => setNewTeam((t) => ({ ...t, teamName: e.target.value }))} className={fis}>
                  <option value="">팀 선택</option>
                  {teams.map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
              </td>
              <td className="px-3 py-1.5">
                <input type="date" value={newTeam.usageDate} onChange={(e) => setNewTeam((t) => ({ ...t, usageDate: e.target.value }))} className={fi} />
              </td>
              <td className="px-3 py-1.5">
                <input type="text" value={newTeam.draftStr}
                  onChange={(e) => { const raw = e.target.value.replace(/[^0-9]/g, ''); setNewTeam((t) => ({ ...t, draftStr: raw === '' ? '' : Number(raw).toLocaleString('ko-KR') })); }}
                  placeholder="0" className={`${fi} text-right`} />
              </td>
              <td className="px-3 py-1.5">
                <input type="text" value={newTeam.confirmedStr}
                  onChange={(e) => { const raw = e.target.value.replace(/[^0-9]/g, ''); const fmt = raw === '' ? '' : Number(raw).toLocaleString('ko-KR'); setNewTeam((t) => ({ ...t, confirmedStr: fmt, claimed: Number(raw) === 0 ? false : t.claimed })); }}
                  placeholder="0=미확정" className={`${fi} text-right placeholder:text-gray-300`} />
              </td>
              <td className="px-3 py-1.5 text-center">
                <input type="checkbox" checked={newTeam.claimed} disabled={newConf === 0}
                  onChange={(e) => setNewTeam((t) => ({ ...t, claimed: e.target.checked }))}
                  className="h-3.5 w-3.5 accent-primary disabled:opacity-40 disabled:cursor-default" />
              </td>
              <td className="px-3 py-1.5 text-center">
                <input type="checkbox" checked={newTeam.evidenceSubmitted}
                  onChange={(e) => setNewTeam((t) => ({ ...t, evidenceSubmitted: e.target.checked }))}
                  className="h-3.5 w-3.5 accent-primary" />
              </td>
              <td className="px-2 py-1.5">
                <div className="flex items-center gap-1">
                  <button onClick={() => { void handleAddTeamToGroup(group); }}
                    disabled={!newTeam.teamName || addMutation.isPending}
                    className="flex items-center justify-center rounded bg-primary p-1 text-white hover:bg-primary-light disabled:opacity-50">
                    <Check className="h-3 w-3" />
                  </button>
                  <button onClick={() => { setAddTeamGroupKey(null); setNewTeam({ ...DEFAULT_TEAM }); }}
                    className="flex items-center justify-center rounded border border-[#E3E3E0] p-1 text-gray-500 hover:bg-gray-50">
                    <X className="h-3 w-3" />
                  </button>
                </div>
              </td>
            </tr>,
          );
        } else {
          result.push(
            <tr key={`add-btn-${group.key}`} className="bg-[#FAFAF8]">
              <td colSpan={colCount} className="px-4 py-1">
                <button onClick={() => { setAddTeamGroupKey(group.key); setNewTeam({ ...DEFAULT_TEAM }); setShowNewGroup(false); }}
                  className="flex items-center gap-1 text-[11px] text-gray-400 hover:text-primary transition-colors">
                  <Plus className="h-3 w-3" />팀 추가
                </button>
              </td>
            </tr>,
          );
        }
      }
    });

    // 미전송 팀이 있고 배치도 있으면 "팀 추가" 버튼 (unsentRows 끝에 붙이기)
    if (canWrite && unsentRows.length > 0 && groupBatches.length > 0) {
      if (addTeamGroupKey === group.key) {
        const newConf = parseKRW(newTeam.confirmedStr) || 0;
        result.push(
          <tr key={`add-team-${group.key}`} className="bg-[#F8FAFF] border-t border-dashed border-[#C8DCF0]">
            <td className="px-3 py-1.5 pl-5 text-[10px] text-gray-300">+</td>
            <td className="px-3 py-1.5 text-[10px] text-gray-300">↑</td>
            <td className="px-3 py-1.5">
              <select value={newTeam.teamName} onChange={(e) => setNewTeam((t) => ({ ...t, teamName: e.target.value }))} className={fis}>
                <option value="">팀 선택</option>
                {teams.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </td>
            <td className="px-3 py-1.5">
              <input type="date" value={newTeam.usageDate} onChange={(e) => setNewTeam((t) => ({ ...t, usageDate: e.target.value }))} className={fi} />
            </td>
            <td className="px-3 py-1.5">
              <input type="text" value={newTeam.draftStr}
                onChange={(e) => { const raw = e.target.value.replace(/[^0-9]/g, ''); setNewTeam((t) => ({ ...t, draftStr: raw === '' ? '' : Number(raw).toLocaleString('ko-KR') })); }}
                placeholder="0" className={`${fi} text-right`} />
            </td>
            <td className="px-3 py-1.5">
              <input type="text" value={newTeam.confirmedStr}
                onChange={(e) => { const raw = e.target.value.replace(/[^0-9]/g, ''); const fmt = raw === '' ? '' : Number(raw).toLocaleString('ko-KR'); setNewTeam((t) => ({ ...t, confirmedStr: fmt, claimed: Number(raw) === 0 ? false : t.claimed })); }}
                placeholder="0=미확정" className={`${fi} text-right placeholder:text-gray-300`} />
            </td>
            <td className="px-3 py-1.5 text-center">
              <input type="checkbox" checked={newTeam.claimed} disabled={newConf === 0}
                onChange={(e) => setNewTeam((t) => ({ ...t, claimed: e.target.checked }))}
                className="h-3.5 w-3.5 accent-primary disabled:opacity-40 disabled:cursor-default" />
            </td>
            <td className="px-3 py-1.5 text-center">
              <input type="checkbox" checked={newTeam.evidenceSubmitted}
                onChange={(e) => setNewTeam((t) => ({ ...t, evidenceSubmitted: e.target.checked }))}
                className="h-3.5 w-3.5 accent-primary" />
            </td>
            <td className="px-2 py-1.5">
              <div className="flex items-center gap-1">
                <button onClick={() => { void handleAddTeamToGroup(group); }}
                  disabled={!newTeam.teamName || addMutation.isPending}
                  className="flex items-center justify-center rounded bg-primary p-1 text-white hover:bg-primary-light disabled:opacity-50">
                  <Check className="h-3 w-3" />
                </button>
                <button onClick={() => { setAddTeamGroupKey(null); setNewTeam({ ...DEFAULT_TEAM }); }}
                  className="flex items-center justify-center rounded border border-[#E3E3E0] p-1 text-gray-500 hover:bg-gray-50">
                  <X className="h-3 w-3" />
                </button>
              </div>
            </td>
          </tr>,
        );
      } else {
        result.push(
          <tr key={`add-btn-${group.key}`} className="bg-[#FAFAF8]">
            <td colSpan={colCount} className="px-4 py-1">
              <button onClick={() => { setAddTeamGroupKey(group.key); setNewTeam({ ...DEFAULT_TEAM }); setShowNewGroup(false); }}
                className="flex items-center gap-1 text-[11px] text-gray-400 hover:text-primary transition-colors">
                <Plus className="h-3 w-3" />팀 추가
              </button>
            </td>
          </tr>,
        );
      }
    }

    // ── 전송된 배치 그룹 ─────────────────────────────────────────────────
    groupBatches.forEach((batch, bi) => {
      const batchRows = group.rows.filter((r) => batch.wemeetRowIndexes.includes(r.rowIndex));
      const sentDateStr = new Date(batch.sentAt).toLocaleDateString('ko-KR', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });

      // 배치 헤더 행
      result.push(
        <tr key={`batch-header-${batch.id}`} className="bg-[#F0F5FF] border-t border-[#D6E4F0]">
          <td colSpan={canWrite ? 8 : 8} className="px-3 py-1.5">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="flex items-center gap-1 text-[11px] font-medium text-primary">
                <SendHorizonal className="h-3 w-3" />전송됨
              </span>
              <span className="text-[11px] text-gray-500">{sentDateStr}</span>
              <span className="text-[10px] text-gray-400">·</span>
              <span className="text-[11px] text-gray-500 truncate max-w-[180px]">{batch.programName}</span>
              <a
                href={`/expenditure/${encodeURIComponent(batch.category)}`}
                className="flex items-center gap-0.5 text-[11px] text-primary hover:underline ml-auto"
                title="비목별 집행내역 바로가기"
              >
                <ExternalLink className="h-3 w-3" />집행내역 확인
              </a>
              {canWrite && (
                <button
                  onClick={() => undoBatchMutation.mutate(batch.id)}
                  disabled={undoBatchMutation.isPending}
                  title="전송 취소 (보내기여부·청구여부 FALSE로 복원)"
                  className="flex items-center gap-0.5 text-[11px] text-red-400 hover:text-red-600 hover:underline disabled:opacity-50"
                >
                  <RotateCcw className="h-3 w-3" />전송 취소
                </button>
              )}
            </div>
          </td>
          {canWrite && <td className="px-2 py-1.5" />}
        </tr>,
      );

      // 배치 팀 행들
      batchRows.forEach((row, ri) => {
        const bg     = ri % 2 === 0 ? 'bg-[#F5F8FF]' : 'bg-[#EEF3FF]';
        const isConf = row.confirmedAmount > 0;
        const isLast = ri === batchRows.length - 1 && bi === groupBatches.length - 1;

        result.push(
          <tr key={`batch-row-${row.rowIndex}`} className={bg}>
            <td className="px-3 py-1.5">
              {canWrite ? (
                <div className="flex items-center pl-4">
                  <button onClick={() => { setDeleteTarget(row); setDeleteOpen(true); }}
                    className="rounded p-1 text-gray-300 hover:bg-red-50 hover:text-red-500 transition-colors">
                    <Trash2 className="h-3 w-3" />
                  </button>
                </div>
              ) : <span className="text-gray-300 pl-2 select-none">↑</span>}
            </td>
            <td className="px-3 py-1.5"><span className="text-gray-300 pl-2 select-none">↑</span></td>
            <td className="px-3 py-1.5">
              <div className="flex items-center gap-1.5">
                <TeamSelect value={row.teamName} teams={teams} disabled={!canWrite}
                  onSave={(v) => saveRow(row, { teamName: v })} />
                <span className="rounded-full bg-green-100 px-1.5 py-0.5 text-[10px] text-green-600 shrink-0">전송됨</span>
              </div>
            </td>
            <td className="px-3 py-1.5">
              <input key={`${row.rowIndex}-date`} type="date" defaultValue={row.usageDate}
                disabled={!canWrite}
                onBlur={(e) => { if (e.target.value !== row.usageDate) saveRow(row, { usageDate: e.target.value }); }}
                className="rounded border border-transparent bg-transparent px-2 py-0.5 text-xs text-[#131310] hover:border-[#D0D0CA] focus:border-[#E3E3E0] focus:outline-none focus:ring-1 focus:ring-primary transition-colors disabled:opacity-40"
              />
            </td>
            <td className="px-3 py-1.5 text-right">
              <AmountInput value={row.draftAmount} disabled={!canWrite} onSave={(v) => saveRow(row, { draftAmount: v })} />
            </td>
            <td className="px-3 py-1.5 text-right">
              <AmountInput value={row.confirmedAmount} disabled={!canWrite} placeholder="0=미확정"
                onSave={(v) => saveRow(row, { confirmedAmount: v, claimed: v === 0 ? false : row.claimed })} />
            </td>
            <td className="px-3 py-1.5 text-center">
              <input type="checkbox" checked={row.claimed}
                disabled={!canWrite || !isConf}
                onChange={(e) => saveRow(row, { claimed: e.target.checked })}
                className="h-3.5 w-3.5 accent-primary disabled:cursor-default disabled:opacity-40"
              />
            </td>
            <td className="px-3 py-1.5 text-center">
              <input type="checkbox" checked={row.evidenceSubmitted}
                disabled={!canWrite}
                onChange={(e) => saveRow(row, { evidenceSubmitted: e.target.checked })}
                className="h-3.5 w-3.5 accent-primary disabled:cursor-default"
              />
            </td>
            {canWrite && (
              <td className="px-2 py-1.5 text-center">
                <span className="text-[10px] text-green-500">✓</span>
              </td>
            )}
          </tr>,
        );

        // 마지막 배치의 마지막 행 뒤에 "팀 추가" 버튼 (미전송 팀이 없을 때)
        if (canWrite && isLast && unsentRows.length === 0) {
          if (addTeamGroupKey === group.key) {
            const newConf = parseKRW(newTeam.confirmedStr) || 0;
            result.push(
              <tr key={`add-team-${group.key}`} className="bg-[#F8FAFF] border-t border-dashed border-[#C8DCF0]">
                <td className="px-3 py-1.5 pl-5 text-[10px] text-gray-300">+</td>
                <td className="px-3 py-1.5 text-[10px] text-gray-300">↑</td>
                <td className="px-3 py-1.5">
                  <select value={newTeam.teamName} onChange={(e) => setNewTeam((t) => ({ ...t, teamName: e.target.value }))} className={fis}>
                    <option value="">팀 선택</option>
                    {teams.map((t) => <option key={t} value={t}>{t}</option>)}
                  </select>
                </td>
                <td className="px-3 py-1.5"><input type="date" value={newTeam.usageDate} onChange={(e) => setNewTeam((t) => ({ ...t, usageDate: e.target.value }))} className={fi} /></td>
                <td className="px-3 py-1.5"><input type="text" value={newTeam.draftStr} onChange={(e) => { const raw = e.target.value.replace(/[^0-9]/g, ''); setNewTeam((t) => ({ ...t, draftStr: raw === '' ? '' : Number(raw).toLocaleString('ko-KR') })); }} placeholder="0" className={`${fi} text-right`} /></td>
                <td className="px-3 py-1.5"><input type="text" value={newTeam.confirmedStr} onChange={(e) => { const raw = e.target.value.replace(/[^0-9]/g, ''); const fmt = raw === '' ? '' : Number(raw).toLocaleString('ko-KR'); setNewTeam((t) => ({ ...t, confirmedStr: fmt, claimed: Number(raw) === 0 ? false : t.claimed })); }} placeholder="0=미확정" className={`${fi} text-right placeholder:text-gray-300`} /></td>
                <td className="px-3 py-1.5 text-center"><input type="checkbox" checked={newTeam.claimed} disabled={newConf === 0} onChange={(e) => setNewTeam((t) => ({ ...t, claimed: e.target.checked }))} className="h-3.5 w-3.5 accent-primary disabled:opacity-40 disabled:cursor-default" /></td>
                <td className="px-3 py-1.5 text-center"><input type="checkbox" checked={newTeam.evidenceSubmitted} onChange={(e) => setNewTeam((t) => ({ ...t, evidenceSubmitted: e.target.checked }))} className="h-3.5 w-3.5 accent-primary" /></td>
                <td className="px-2 py-1.5">
                  <div className="flex items-center gap-1">
                    <button onClick={() => { void handleAddTeamToGroup(group); }} disabled={!newTeam.teamName || addMutation.isPending} className="flex items-center justify-center rounded bg-primary p-1 text-white hover:bg-primary-light disabled:opacity-50"><Check className="h-3 w-3" /></button>
                    <button onClick={() => { setAddTeamGroupKey(null); setNewTeam({ ...DEFAULT_TEAM }); }} className="flex items-center justify-center rounded border border-[#E3E3E0] p-1 text-gray-500 hover:bg-gray-50"><X className="h-3 w-3" /></button>
                  </div>
                </td>
              </tr>,
            );
          } else {
            result.push(
              <tr key={`add-btn-${group.key}`} className="bg-[#FAFAF8]">
                <td colSpan={colCount} className="px-4 py-1">
                  <button onClick={() => { setAddTeamGroupKey(group.key); setNewTeam({ ...DEFAULT_TEAM }); setShowNewGroup(false); }}
                    className="flex items-center gap-1 text-[11px] text-gray-400 hover:text-primary transition-colors">
                    <Plus className="h-3 w-3" />팀 추가
                  </button>
                </td>
              </tr>,
            );
          }
        }
      });
    });

    return result;
  }

  return (
    <div className="space-y-3">
      {/* 툴바 */}
      <div className="flex items-center justify-end gap-2">
        {canWrite && !showNewGroup && (
          <>
            <Button size="sm" variant="outline" onClick={() => setShowBulkModal(true)} className="gap-1.5 text-gray-600">
              <Plus className="h-3.5 w-3.5" />일괄 추가
            </Button>
            <Button size="sm" onClick={() => { setShowNewGroup(true); setAddTeamGroupKey(null); }} className="gap-1.5">
              <Plus className="h-3.5 w-3.5" />건 추가
            </Button>
            <Button size="sm" variant="outline" onClick={() => setShowSendSettings(true)} className="gap-1.5 text-gray-600" title="보내기 기본 설정">
              <Settings2 className="h-3.5 w-3.5" />보내기 설정
            </Button>
          </>
        )}
        <Button variant="outline" size="sm" onClick={() => { void refetch(); }} disabled={isLoading} className="gap-1.5 text-gray-600">
          <RefreshCw className={`h-3.5 w-3.5 ${isLoading ? 'animate-spin' : ''}`} />새로고침
        </Button>
      </div>

      {/* 검색 + 사용구분 필터 */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400 pointer-events-none" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="검색 (사용구분, 건명, 팀명)"
            className="h-8 w-52 rounded-md border border-[#E3E3E0] bg-white pl-8 pr-3 text-xs text-[#131310] placeholder:text-gray-400 focus:outline-none focus:ring-1 focus:ring-primary"
          />
        </div>
        <div className="flex items-center gap-1 flex-wrap">
          {['전체', ...usageTypes].map((type) => (
            <button
              key={type}
              onClick={() => setActiveType(type)}
              className={[
                'rounded-full px-2.5 py-0.5 text-[11px] font-medium transition-colors whitespace-nowrap',
                activeType === type
                  ? 'bg-primary text-white'
                  : 'bg-gray-100 text-gray-600 hover:bg-[#D6E4F0] hover:text-primary',
              ].join(' ')}
            >
              {type}
            </button>
          ))}
        </div>
      </div>

      {isError && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error instanceof Error ? error.message : '데이터를 불러오지 못했습니다.'}
        </div>
      )}

      {isLoading ? (
        <div className="h-64 animate-pulse rounded-lg bg-[#F3F3EE]" />
      ) : (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
        >
          <div className="overflow-x-auto rounded-lg border border-[#E3E3E0]">
            <table className="w-full border-collapse text-xs">
              <thead>
                <tr className="bg-[#F3F3EE]">
                  <th className="px-3 py-2.5 text-left font-medium text-[#6F6F6B] whitespace-nowrap">사용구분</th>
                  <th className="px-3 py-2.5 text-left font-medium text-[#6F6F6B]">지출건명</th>
                  <th className="px-3 py-2.5 text-left font-medium text-[#6F6F6B]">팀명</th>
                  <th className="px-3 py-2.5 text-left font-medium text-[#6F6F6B] whitespace-nowrap">사용일자</th>
                  <th className="px-3 py-2.5 text-right font-medium text-[#6F6F6B] whitespace-nowrap">기안금액</th>
                  <th className="px-3 py-2.5 text-right font-medium text-[#6F6F6B] whitespace-nowrap">확정금액</th>
                  <th className="px-3 py-2.5 text-center font-medium text-[#6F6F6B] whitespace-nowrap">청구여부</th>
                  <th className="px-3 py-2.5 text-center font-medium text-[#6F6F6B] whitespace-nowrap">증빙제출</th>
                  {canWrite && <th className="px-2 py-2.5 font-medium text-[#6F6F6B]"></th>}
                </tr>
              </thead>

              <SortableContext items={groupOrder} strategy={verticalListSortingStrategy}>
                {filteredGroups.map((group, gi) => (
                  <SortableGroupBody key={group.key} id={group.key} disabled={!isDndEnabled}>
                    {(dragHandle) => renderGroupRows(group, gi, dragHandle)}
                  </SortableGroupBody>
                ))}
              </SortableContext>

              {filteredGroups.length === 0 && !showNewGroup && (
                <tbody>
                  <tr>
                    <td colSpan={colCount} className="px-3 py-10 text-center text-gray-400">
                      {searchQuery || activeType !== '전체'
                        ? '검색 결과가 없습니다.'
                        : '집행내역이 없습니다. "건 추가" 버튼으로 새 항목을 입력하세요.'}
                    </td>
                  </tr>
                </tbody>
              )}

              {/* 새 건 추가 폼 */}
              {showNewGroup && (
                <tbody>
                  <tr><td colSpan={colCount} className="p-0"><div className="border-t-2 border-dashed border-primary/25" /></td></tr>

                  <tr className="bg-[#F0F5FF]">
                    <td className="px-3 py-2">
                      <select value={newGroupForm.usageType}
                        onChange={(e) => setNewGroupForm((f) => ({ ...f, usageType: e.target.value }))}
                        className={fis}>
                        <option value="">사용구분</option>
                        {usageTypes.map((u) => <option key={u} value={u}>{u}</option>)}
                      </select>
                    </td>
                    <td className="px-3 py-2">
                      <input type="text" value={newGroupForm.description}
                        onChange={(e) => setNewGroupForm((f) => ({ ...f, description: e.target.value }))}
                        placeholder="지출건명 입력" className={fi} />
                    </td>
                    <td colSpan={canWrite ? 7 : 6} className="px-3 py-2">
                      <span className="text-[11px] text-gray-400">
                        ↓ 팀별 사용일자·금액을 입력하세요 (팀마다 다른 일자/금액 가능)
                      </span>
                    </td>
                  </tr>

                  {newGroupForm.teams.map((team, ti) => {
                    const teamConf = parseKRW(team.confirmedStr) || 0;
                    return (
                      <tr key={ti} className="bg-[#F5F8FF]">
                        <td className="px-3 py-1.5 text-[10px] text-gray-300 pl-6">↑</td>
                        <td className="px-3 py-1.5 text-[10px] text-gray-300">↑</td>
                        <td className="px-3 py-1.5">
                          <select value={team.teamName}
                            onChange={(e) => updateNewGroupTeam(ti, { teamName: e.target.value })}
                            className={fis}>
                            <option value="">팀 선택</option>
                            {teams.map((t) => <option key={t} value={t}>{t}</option>)}
                          </select>
                        </td>
                        <td className="px-3 py-1.5">
                          <input type="date" value={team.usageDate}
                            onChange={(e) => updateNewGroupTeam(ti, { usageDate: e.target.value })}
                            className={fi} />
                        </td>
                        <td className="px-3 py-1.5">
                          <input type="text" value={team.draftStr}
                            onChange={(e) => {
                              const raw = e.target.value.replace(/[^0-9]/g, '');
                              updateNewGroupTeam(ti, { draftStr: raw === '' ? '' : Number(raw).toLocaleString('ko-KR') });
                            }}
                            placeholder="0" className={`${fi} text-right`} />
                        </td>
                        <td className="px-3 py-1.5">
                          <input type="text" value={team.confirmedStr}
                            onChange={(e) => {
                              const raw = e.target.value.replace(/[^0-9]/g, '');
                              const fmt = raw === '' ? '' : Number(raw).toLocaleString('ko-KR');
                              updateNewGroupTeam(ti, { confirmedStr: fmt, claimed: Number(raw) === 0 ? false : team.claimed });
                            }}
                            placeholder="0=미확정" className={`${fi} text-right placeholder:text-gray-300`} />
                        </td>
                        <td className="px-3 py-1.5 text-center">
                          <input type="checkbox" checked={team.claimed} disabled={teamConf === 0}
                            onChange={(e) => updateNewGroupTeam(ti, { claimed: e.target.checked })}
                            className="h-3.5 w-3.5 accent-primary disabled:opacity-40 disabled:cursor-default" />
                        </td>
                        <td className="px-3 py-1.5 text-center">
                          <input type="checkbox" checked={team.evidenceSubmitted}
                            onChange={(e) => updateNewGroupTeam(ti, { evidenceSubmitted: e.target.checked })}
                            className="h-3.5 w-3.5 accent-primary" />
                        </td>
                        {canWrite && (
                          <td className="px-2 py-1.5 text-center">
                            {newGroupForm.teams.length > 1 && (
                              <button onClick={() => setNewGroupForm((f) => ({ ...f, teams: f.teams.filter((_, i) => i !== ti) }))}
                                className="rounded p-1 text-gray-300 hover:bg-red-50 hover:text-red-500 transition-colors">
                                <Trash2 className="h-3 w-3" />
                              </button>
                            )}
                          </td>
                        )}
                      </tr>
                    );
                  })}

                  <tr className="bg-[#EEF3FF]">
                    <td colSpan={2} className="px-4 py-2">
                      <button onClick={() => setNewGroupForm((f) => ({ ...f, teams: [...f.teams, { ...DEFAULT_TEAM }] }))}
                        className="flex items-center gap-1 text-[11px] text-primary hover:underline">
                        <Plus className="h-3 w-3" />팀 추가
                      </button>
                    </td>
                    <td colSpan={canWrite ? 7 : 6} className="px-3 py-2">
                      <div className="flex items-center justify-end gap-2">
                        <button onClick={() => { setShowNewGroup(false); setNewGroupForm({ ...DEFAULT_NEW_GROUP }); }}
                          className="rounded-md border border-[#E3E3E0] bg-white px-3 py-1 text-xs text-gray-500 hover:bg-gray-50 transition-colors">
                          취소
                        </button>
                        <button onClick={() => { void handleSaveNewGroup(); }}
                          disabled={bulkMutation.isPending || !newGroupForm.usageType || !newGroupForm.description || newGroupForm.teams.every((t) => !t.teamName)}
                          className="rounded-md bg-primary px-3 py-1 text-xs text-white hover:bg-primary-light disabled:opacity-50 transition-colors">
                          {bulkMutation.isPending ? '저장 중...' : '저장'}
                        </button>
                      </div>
                    </td>
                  </tr>
                </tbody>
              )}
            </table>
          </div>

          <DragOverlay>
            {activeDragKey ? (() => {
              const g = groups.find((grp) => grp.key === activeDragKey);
              if (!g) return null;
              return (
                <div className="rounded-md border border-[#D6E4F0] bg-white px-4 py-2.5 text-xs shadow-xl">
                  <span className="font-medium text-[#131310]">{g.usageType}</span>
                  <span className="mx-1.5 text-gray-400">—</span>
                  <span className="text-[#131310]">{g.description}</span>
                  <span className="ml-2 text-[11px] text-primary">({g.rows.length}팀)</span>
                </div>
              );
            })() : null}
          </DragOverlay>
        </DndContext>
      )}

      {!isLoading && executions.length > 0 && (
        <p className="text-xs text-gray-400">
          총 {groups.length}건 / {executions.length}개 팀 행
          {isDndEnabled && <span className="ml-2 text-gray-300">· 핸들 드래그로 건 순서 변경 가능</span>}
        </p>
      )}

      <WeMeetBulkAddModal
        open={showBulkModal}
        teams={teams}
        usageTypes={usageTypes}
        isPending={bulkMutation.isPending}
        onClose={() => setShowBulkModal(false)}
        onSave={(payloads) => bulkMutation.mutateAsync(payloads)}
      />

      <WeMeetGroupSendModal
        open={sendGroup !== null}
        group={sendGroup}
        initialSelectedIndexes={sendInitialSelection}
        onClose={() => setSendGroup(null)}
        onSent={(payload) => {
          markSentMutation.mutate(payload);
          setSendGroup(null);
        }}
      />

      <WeMeetSendSettingsModal
        open={showSendSettings}
        onClose={() => setShowSendSettings(false)}
      />

      <ConfirmDialog
        open={deleteOpen}
        title="집행내역 삭제"
        description={`"${deleteTarget?.teamName} — ${deleteTarget?.usageType}" 내역을 삭제하시겠습니까?`}
        loading={deleteMutation.isPending}
        onConfirm={() => { void handleDelete(); }}
        onClose={() => { setDeleteOpen(false); setDeleteTarget(null); }}
      />
    </div>
  );
}

'use client';

import { useState, useMemo, useEffect } from 'react';
import { Plus, Trash2, RefreshCw, Check, X, ChevronDown, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/shared/ConfirmDialog';
import { formatKRW, parseKRW } from '@/lib/utils';
import { WeMeetBulkAddModal } from '@/components/we-meet/WeMeetBulkAddModal';
import {
  useWeMeetExecutions,
  useAddWeMeetExecution,
  useUpdateWeMeetExecution,
  useDeleteWeMeetExecution,
  useAddBulkWeMeetExecutions,
  type ExecutionPayload,
} from '@/hooks/useWeMeet';
import type { WeMeetExecution } from '@/types';

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
  return (
    <input
      key={`amt-${value}`}
      type="text"
      defaultValue={value > 0 ? formatKRW(value) : ''}
      disabled={disabled}
      placeholder={placeholder}
      onFocus={(e) => { e.target.value = value > 0 ? String(value) : ''; e.target.select(); }}
      onBlur={(e) => {
        const next = parseKRW(e.target.value) || 0;
        e.target.value = next > 0 ? formatKRW(next) : '';
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

// ── 컴포넌트 ─────────────────────────────────────────────────────────

interface Props {
  canWrite: boolean;
}

export function WeMeetExecutionsSection({ canWrite }: Props) {
  const { data, isLoading, isError, error, refetch } = useWeMeetExecutions();
  const addMutation    = useAddWeMeetExecution();
  const updateMutation = useUpdateWeMeetExecution();
  const deleteMutation = useDeleteWeMeetExecution();
  const bulkMutation   = useAddBulkWeMeetExecutions();

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
  const [showBulkModal, setShowBulkModal]     = useState(false);
  const [expandedKeys, setExpandedKeys]       = useState<Set<string>>(new Set());

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

  // ── 테이블 ───────────────────────────────────────────────────────────
  // 컬럼: 사용구분 | 지출건명 | 팀명 | 사용일자 | 기안금액 | 확정금액 | 청구여부 | 증빙제출 | (삭제)

  const colCount = canWrite ? 9 : 8;

  function renderGroupRows(group: ExecGroup, gi: number) {
    const result: React.ReactNode[] = [];
    const isExpanded    = expandedKeys.has(group.key);
    const topBorder     = gi > 0 ? 'border-t-2 border-[#D6E4F0]' : '';
    const totalDraft    = group.rows.reduce((s, r) => s + r.draftAmount, 0);
    const totalConf     = group.rows.reduce((s, r) => s + r.confirmedAmount, 0);
    const unclaimedAmt  = group.rows.filter((r) => r.confirmedAmount > 0 && !r.claimed).reduce((s, r) => s + r.confirmedAmount, 0);
    const evidenceCnt   = group.rows.filter((r) => r.evidenceSubmitted).length;

    if (!isExpanded) {
      result.push(
        <tr
          key={`collapsed-${group.key}`}
          className={`bg-white ${topBorder} cursor-pointer hover:bg-[#F5F9FC] transition-colors`}
          onClick={() => toggleGroup(group.key)}
        >
          <td className="px-3 py-2">
            <div className="flex items-center gap-1.5">
              <ChevronRight className="h-3.5 w-3.5 shrink-0 text-gray-400" />
              <span className="text-xs text-[#131310]">{group.usageType}</span>
            </div>
          </td>
          <td className="px-3 py-2 text-xs text-[#131310]">{group.description}</td>
          <td className="px-3 py-2">
            <span className="rounded-full bg-[#D6E4F0] px-2 py-0.5 text-[11px] font-medium text-primary">
              {group.rows.length}팀
            </span>
          </td>
          <td className="px-3 py-2 text-xs text-gray-300">—</td>
          <td className="px-3 py-2 text-right text-xs tabular-nums text-[#131310]">
            {totalDraft > 0 ? formatKRW(totalDraft) : <span className="text-gray-300">—</span>}
          </td>
          <td className="px-3 py-2 text-right text-xs tabular-nums text-[#131310]">
            {totalConf > 0 ? formatKRW(totalConf) : <span className="text-gray-300">—</span>}
          </td>
          <td className="px-3 py-2 text-right text-xs tabular-nums">
            {unclaimedAmt > 0
              ? <span className="text-red-400"><span className="mr-1 text-[10px]">(미청구)</span>{formatKRW(unclaimedAmt)}</span>
              : <span className="text-gray-300">—</span>}
          </td>
          <td className="px-3 py-2 text-center text-xs">
            {evidenceCnt > 0
              ? <span className="text-[#131310]">{evidenceCnt}/{group.rows.length}</span>
              : <span className="text-gray-300">—</span>}
          </td>
          {canWrite && <td className="px-2 py-2" />}
        </tr>,
      );
      return result;
    }

    group.rows.forEach((row, ri) => {
      const isFirst      = ri === 0;
      const isLast       = ri === group.rows.length - 1;
      const topBorderRow = isFirst && gi > 0 ? 'border-t-2 border-[#D6E4F0]' : '';
      const bg           = ri % 2 === 0 ? 'bg-white' : 'bg-[#F5F9FC]';
      const isConf       = row.confirmedAmount > 0;

      result.push(
        <tr key={row.rowIndex} className={`${bg} ${topBorderRow}`}>
          {/* 사용구분 (group) */}
          <td className="px-3 py-1.5">
            {isFirst ? (
              <div className="flex items-center gap-1">
                <button
                  onClick={() => toggleGroup(group.key)}
                  className="shrink-0 rounded p-0.5 text-gray-400 hover:bg-[#D6E4F0] hover:text-primary transition-colors"
                >
                  <ChevronDown className="h-3.5 w-3.5" />
                </button>
                <UsageTypeSelect value={row.usageType} usageTypes={usageTypes} disabled={!canWrite}
                  onSave={(v) => saveGroupField(group, { usageType: v })} />
              </div>
            ) : (
              <span className="text-gray-300 pl-2 select-none">↑</span>
            )}
          </td>

          {/* 지출건명 (group) */}
          <td className="px-3 py-1.5">
            {isFirst ? (
              <input key={`${row.rowIndex}-desc`} type="text" defaultValue={row.description}
                disabled={!canWrite} placeholder="지출건명"
                onBlur={(e) => { if (e.target.value !== row.description) saveGroupField(group, { description: e.target.value }); }}
                onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }}
                className="w-full min-w-[120px] rounded border border-transparent bg-transparent px-2 py-0.5 text-xs text-[#131310] hover:border-[#D0D0CA] focus:border-[#E3E3E0] focus:outline-none focus:ring-1 focus:ring-primary transition-colors disabled:opacity-40"
              />
            ) : (
              <span className="text-gray-300 pl-2 select-none">↑</span>
            )}
          </td>

          {/* 팀명 (per row) */}
          <td className="px-3 py-1.5">
            <TeamSelect value={row.teamName} teams={teams} disabled={!canWrite}
              onSave={(v) => saveRow(row, { teamName: v })} />
          </td>

          {/* 사용일자 (per row) */}
          <td className="px-3 py-1.5">
            <input key={`${row.rowIndex}-date`} type="date" defaultValue={row.usageDate}
              disabled={!canWrite}
              onBlur={(e) => { if (e.target.value !== row.usageDate) saveRow(row, { usageDate: e.target.value }); }}
              className="rounded border border-transparent bg-transparent px-2 py-0.5 text-xs text-[#131310] hover:border-[#D0D0CA] focus:border-[#E3E3E0] focus:outline-none focus:ring-1 focus:ring-primary transition-colors disabled:opacity-40"
            />
          </td>

          {/* 기안금액 */}
          <td className="px-3 py-1.5 text-right">
            <AmountInput value={row.draftAmount} disabled={!canWrite}
              onSave={(v) => saveRow(row, { draftAmount: v })} />
          </td>

          {/* 확정금액 */}
          <td className="px-3 py-1.5 text-right">
            <AmountInput value={row.confirmedAmount} disabled={!canWrite} placeholder="0=미확정"
              onSave={(v) => saveRow(row, { confirmedAmount: v, claimed: v === 0 ? false : row.claimed })} />
          </td>

          {/* 청구여부 */}
          <td className="px-3 py-1.5 text-center">
            <input type="checkbox" checked={row.claimed}
              disabled={!canWrite || !isConf}
              onChange={(e) => saveRow(row, { claimed: e.target.checked })}
              className="h-3.5 w-3.5 accent-primary disabled:cursor-default disabled:opacity-40"
              title={!isConf ? '확정금액 입력 후 활성화' : ''}
            />
          </td>

          {/* 증빙제출 */}
          <td className="px-3 py-1.5 text-center">
            <input type="checkbox" checked={row.evidenceSubmitted}
              disabled={!canWrite}
              onChange={(e) => saveRow(row, { evidenceSubmitted: e.target.checked })}
              className="h-3.5 w-3.5 accent-primary disabled:cursor-default"
            />
          </td>

          {/* 삭제 */}
          {canWrite && (
            <td className="px-2 py-1.5 text-center">
              <button onClick={() => { setDeleteTarget(row); setDeleteOpen(true); }}
                className="rounded p-1 text-gray-300 hover:bg-red-50 hover:text-red-500 transition-colors">
                <Trash2 className="h-3 w-3" />
              </button>
            </td>
          )}
        </tr>,
      );

      if (canWrite && isLast) {
        if (addTeamGroupKey === group.key) {
          const newConf = parseKRW(newTeam.confirmedStr) || 0;
          result.push(
            <tr key={`add-team-${group.key}`} className="bg-[#F8FAFF] border-t border-dashed border-[#C8DCF0]">
              <td className="px-3 py-1.5 text-[10px] text-gray-300 pl-5">↑</td>
              <td className="px-3 py-1.5 text-[10px] text-gray-300">↑</td>
              {/* 팀 선택 */}
              <td className="px-3 py-1.5">
                <select value={newTeam.teamName} onChange={(e) => setNewTeam((t) => ({ ...t, teamName: e.target.value }))} className={fis}>
                  <option value="">팀 선택</option>
                  {teams.map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
              </td>
              {/* 사용일자 */}
              <td className="px-3 py-1.5">
                <input type="date" value={newTeam.usageDate}
                  onChange={(e) => setNewTeam((t) => ({ ...t, usageDate: e.target.value }))}
                  className={fi} />
              </td>
              {/* 기안금액 */}
              <td className="px-3 py-1.5">
                <input type="text" value={newTeam.draftStr}
                  onChange={(e) => setNewTeam((t) => ({ ...t, draftStr: e.target.value }))}
                  placeholder="0" className={`${fi} text-right`} />
              </td>
              {/* 확정금액 */}
              <td className="px-3 py-1.5">
                <input type="text" value={newTeam.confirmedStr}
                  onChange={(e) => setNewTeam((t) => ({ ...t, confirmedStr: e.target.value, claimed: (parseKRW(e.target.value) || 0) === 0 ? false : t.claimed }))}
                  placeholder="0=미확정" className={`${fi} text-right placeholder:text-gray-300`} />
              </td>
              {/* 청구 */}
              <td className="px-3 py-1.5 text-center">
                <input type="checkbox" checked={newTeam.claimed} disabled={newConf === 0}
                  onChange={(e) => setNewTeam((t) => ({ ...t, claimed: e.target.checked }))}
                  className="h-3.5 w-3.5 accent-primary disabled:opacity-40 disabled:cursor-default" />
              </td>
              {/* 증빙 */}
              <td className="px-3 py-1.5 text-center">
                <input type="checkbox" checked={newTeam.evidenceSubmitted}
                  onChange={(e) => setNewTeam((t) => ({ ...t, evidenceSubmitted: e.target.checked }))}
                  className="h-3.5 w-3.5 accent-primary" />
              </td>
              {/* 저장/취소 */}
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
          </>
        )}
        <Button variant="outline" size="sm" onClick={() => { void refetch(); }} disabled={isLoading} className="gap-1.5 text-gray-600">
          <RefreshCw className={`h-3.5 w-3.5 ${isLoading ? 'animate-spin' : ''}`} />새로고침
        </Button>
      </div>

      {isError && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error instanceof Error ? error.message : '데이터를 불러오지 못했습니다.'}
        </div>
      )}

      {isLoading ? (
        <div className="h-64 animate-pulse rounded-lg bg-[#F3F3EE]" />
      ) : (
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

            <tbody>
              {groups.length === 0 && !showNewGroup && (
                <tr>
                  <td colSpan={colCount} className="px-3 py-10 text-center text-gray-400">
                    집행내역이 없습니다. &quot;건 추가&quot; 버튼으로 새 항목을 입력하세요.
                  </td>
                </tr>
              )}

              {groups.flatMap((group, gi) => renderGroupRows(group, gi))}

              {/* 새 건 추가 폼 */}
              {showNewGroup && (
                <>
                  <tr><td colSpan={colCount} className="p-0"><div className="border-t-2 border-dashed border-primary/25" /></td></tr>

                  {/* 공통 필드: 사용구분 + 지출건명 */}
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

                  {/* 팀 행들 */}
                  {newGroupForm.teams.map((team, ti) => {
                    const teamConf = parseKRW(team.confirmedStr) || 0;
                    return (
                      <tr key={ti} className="bg-[#F5F8FF]">
                        <td className="px-3 py-1.5 text-[10px] text-gray-300 pl-6">↑</td>
                        <td className="px-3 py-1.5 text-[10px] text-gray-300">↑</td>
                        {/* 팀 선택 */}
                        <td className="px-3 py-1.5">
                          <select value={team.teamName}
                            onChange={(e) => updateNewGroupTeam(ti, { teamName: e.target.value })}
                            className={fis}>
                            <option value="">팀 선택</option>
                            {teams.map((t) => <option key={t} value={t}>{t}</option>)}
                          </select>
                        </td>
                        {/* 사용일자 */}
                        <td className="px-3 py-1.5">
                          <input type="date" value={team.usageDate}
                            onChange={(e) => updateNewGroupTeam(ti, { usageDate: e.target.value })}
                            className={fi} />
                        </td>
                        {/* 기안금액 */}
                        <td className="px-3 py-1.5">
                          <input type="text" value={team.draftStr}
                            onChange={(e) => updateNewGroupTeam(ti, { draftStr: e.target.value })}
                            placeholder="0" className={`${fi} text-right`} />
                        </td>
                        {/* 확정금액 */}
                        <td className="px-3 py-1.5">
                          <input type="text" value={team.confirmedStr}
                            onChange={(e) => updateNewGroupTeam(ti, {
                              confirmedStr: e.target.value,
                              claimed: (parseKRW(e.target.value) || 0) === 0 ? false : team.claimed,
                            })}
                            placeholder="0=미확정" className={`${fi} text-right placeholder:text-gray-300`} />
                        </td>
                        {/* 청구 */}
                        <td className="px-3 py-1.5 text-center">
                          <input type="checkbox" checked={team.claimed} disabled={teamConf === 0}
                            onChange={(e) => updateNewGroupTeam(ti, { claimed: e.target.checked })}
                            className="h-3.5 w-3.5 accent-primary disabled:opacity-40 disabled:cursor-default" />
                        </td>
                        {/* 증빙 */}
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

                  {/* 팀 추가 + 저장/취소 */}
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
                </>
              )}
            </tbody>
          </table>
        </div>
      )}

      {!isLoading && executions.length > 0 && (
        <p className="text-xs text-gray-400">총 {groups.length}건 / {executions.length}개 팀 행</p>
      )}

      <WeMeetBulkAddModal
        open={showBulkModal}
        teams={teams}
        usageTypes={usageTypes}
        isPending={bulkMutation.isPending}
        onClose={() => setShowBulkModal(false)}
        onSave={(payloads) => bulkMutation.mutateAsync(payloads)}
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

'use client';

import { useState, useMemo } from 'react';
import { formatKRW, parseKRW } from '@/lib/utils';
import { ConfirmDialog } from '@/components/shared/ConfirmDialog';
import { ChevronRight, Plus, Pencil, Trash2, Check, X } from 'lucide-react';
import { WeMeetTeamPdfReport } from '@/components/we-meet/WeMeetPdfReport';
import type { WeMeetTeamSummary, WeMeetUsageSummary, WeMeetTeamInfo, WeMeetExecution } from '@/types';

// ── 상수 ────────────────────────────────────────────────────────────────

const NO_ADVISOR = '지도교수 미배정';

// 집행 데이터에서 사용구분별 집계 (시트 사용구분목록 변경 시 자동 반영)
function calcUsageBreakdown(execs: WeMeetExecution[]): Array<{
  usageType: string; draft: number; confirmed: number; unclaimed: number;
}> {
  const map = new Map<string, { draft: number; confirmed: number; unclaimed: number }>();
  const order: string[] = [];
  for (const e of execs) {
    if (!map.has(e.usageType)) {
      map.set(e.usageType, { draft: 0, confirmed: 0, unclaimed: 0 });
      order.push(e.usageType);
    }
    const acc = map.get(e.usageType)!;
    acc.draft     += e.draftAmount;
    acc.confirmed += e.confirmedAmount;
    if (e.confirmedAmount > 0 && !e.claimed) acc.unclaimed += e.confirmedAmount;
  }
  return order.map((t) => ({ usageType: t, ...map.get(t)! }));
}

// ── 타입 ────────────────────────────────────────────────────────────────

interface EditState {
  advisor: string; topic: string; mentorOrg: string; mentor: string;
  teamLeader: string; teamMembers: string; assistantMentor: string; remarks: string;
}

interface Props {
  summaries: WeMeetTeamSummary[];
  teamInfos: WeMeetTeamInfo[];
  executions: WeMeetExecution[];
  canWrite: boolean;
  onSelectTeam: (team: string | null) => void;
  onUpdateTeamInfo: (info: WeMeetTeamInfo) => void;
  onAddExecution: (teamName: string) => void;
  onEditExecution: (row: WeMeetExecution) => void;
  onDeleteExecution: (row: WeMeetExecution) => void;
  onUpdateExecution: (row: WeMeetExecution) => void;
  isToggling: boolean;
}

// ── 유틸 ────────────────────────────────────────────────────────────────

function usageTotals(s: WeMeetTeamSummary): { draft: number; confirmed: number; claimed: number } {
  const keys = ['mentoring', 'meeting', 'material', 'studentActivity'] as const;
  return keys.reduce(
    (acc, k) => {
      const u = s[k] as WeMeetUsageSummary;
      return { draft: acc.draft + u.draft, confirmed: acc.confirmed + u.confirmed, claimed: acc.claimed + u.claimed };
    },
    { draft: 0, confirmed: 0, claimed: 0 },
  );
}

function sumGroups(list: WeMeetTeamSummary[]) {
  return list.reduce(
    (acc, s) => {
      const t = usageTotals(s);
      return {
        totalBudget: acc.totalBudget + s.totalBudget,
        balance:     acc.balance     + s.balance,
        draft:       acc.draft       + t.draft,
        confirmed:   acc.confirmed   + t.confirmed,
        claimed:     acc.claimed     + t.claimed,
      };
    },
    { totalBudget: 0, balance: 0, draft: 0, confirmed: 0, claimed: 0 },
  );
}

function toEdit(info: WeMeetTeamInfo): EditState {
  return {
    advisor: info.advisor, topic: info.topic, mentorOrg: info.mentorOrg,
    mentor: info.mentor, teamLeader: info.teamLeader, teamMembers: info.teamMembers,
    assistantMentor: info.assistantMentor, remarks: info.remarks,
  };
}

// ── 컴포넌트 ─────────────────────────────────────────────────────────────

export function WeMeetSummaryTable({
  summaries, teamInfos, executions, canWrite,
  onSelectTeam, onUpdateTeamInfo,
  onAddExecution, onEditExecution, onDeleteExecution, onUpdateExecution, isToggling,
}: Props) {
  const [openAdvisors, setOpenAdvisors] = useState<Set<string>>(new Set());
  const [openTeam, setOpenTeam]         = useState<string | null>(null);
  const [editingRow, setEditingRow]     = useState<number | null>(null);
  const [editState, setEditState]       = useState<EditState | null>(null);
  const [savePending, setSavePending]   = useState(false);
  const [deleteOpen, setDeleteOpen]     = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<WeMeetExecution | null>(null);

  const teamInfoMap = useMemo(
    () => new Map(teamInfos.map((t) => [t.teamName, t])),
    [teamInfos],
  );

  const executionsByTeam = useMemo(() => {
    const m = new Map<string, WeMeetExecution[]>();
    for (const e of executions) {
      if (!m.has(e.teamName)) m.set(e.teamName, []);
      m.get(e.teamName)!.push(e);
    }
    return m;
  }, [executions]);

  const advisorGroups = useMemo(() => {
    const map = new Map<string, WeMeetTeamSummary[]>();
    for (const s of summaries) {
      const adv = teamInfoMap.get(s.teamName)?.advisor?.trim() || NO_ADVISOR;
      if (!map.has(adv)) map.set(adv, []);
      map.get(adv)!.push(s);
    }
    return Array.from(map.entries())
      .sort(([a], [b]) => {
        if (a === NO_ADVISOR) return 1;
        if (b === NO_ADVISOR) return -1;
        return a.localeCompare(b, 'ko');
      })
      .map(([advisor, teams]) => ({ advisor, teams }));
  }, [summaries, teamInfoMap]);

  const grandTotal = useMemo(() => sumGroups(summaries), [summaries]);

  function toggleAdvisor(advisor: string) {
    setOpenAdvisors((prev) => {
      const next = new Set(prev);
      if (next.has(advisor)) next.delete(advisor);
      else next.add(advisor);
      return next;
    });
  }

  function toggleTeam(teamName: string) {
    const next = openTeam === teamName ? null : teamName;
    setOpenTeam(next);
    onSelectTeam(next);
    setEditingRow(null);
    setEditState(null);
  }

  function startEdit(info: WeMeetTeamInfo) {
    setEditingRow(info.rowIndex);
    setEditState(toEdit(info));
  }

  function cancelEdit() {
    setEditingRow(null);
    setEditState(null);
  }

  async function saveEdit(info: WeMeetTeamInfo) {
    if (!editState) return;
    setSavePending(true);
    try {
      onUpdateTeamInfo({ ...info, ...editState });
      setEditingRow(null);
      setEditState(null);
    } finally {
      setSavePending(false);
    }
  }

  function setField<K extends keyof EditState>(key: K, val: string) {
    setEditState((prev) => (prev ? { ...prev, [key]: val } : prev));
  }

  if (summaries.length === 0) {
    return (
      <div className="rounded-lg border border-[#E3E3E0] bg-white px-4 py-6 text-center text-sm text-gray-400">
        팀 데이터가 없습니다.
      </div>
    );
  }

  const inp = (key: keyof EditState, placeholder: string, full = false) => (
    <div className={full ? 'col-span-full' : ''}>
      <label className="mb-0.5 block text-[10px] text-[#6F6F6B]">{placeholder}</label>
      <input
        value={editState?.[key] ?? ''}
        onChange={(e) => setField(key, e.target.value)}
        placeholder={placeholder}
        className="w-full rounded border border-[#E3E3E0] px-2 py-1 text-xs focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
      />
    </div>
  );

  return (
    <div>
      <div className="overflow-x-auto rounded-lg border border-[#E3E3E0]">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="bg-[#F3F3EE]">
              <th className="px-3 py-2.5 text-left font-medium text-[#6F6F6B]">팀명</th>
              <th className="px-3 py-2.5 text-right font-medium text-[#6F6F6B] whitespace-nowrap">기안금액</th>
              <th className="px-3 py-2.5 text-right font-medium text-[#6F6F6B] whitespace-nowrap">확정청구</th>
              <th className="px-3 py-2.5 text-right font-medium text-[#6F6F6B] whitespace-nowrap">확정미청구</th>
            </tr>
          </thead>

          <tbody>
            {advisorGroups.map(({ advisor, teams }) => {
              const isAdvisorOpen = openAdvisors.has(advisor);
              const gt = sumGroups(teams);

              return [
                <tr
                  key={`adv-${advisor}`}
                  className="cursor-pointer bg-[#EEF3F8] hover:bg-[#E5EDF5] transition-colors border-t border-[#D6E4F0]"
                  onClick={() => toggleAdvisor(advisor)}
                >
                  <td className="px-3 py-2.5 font-semibold text-[#1F5C99]">
                    <span className="flex items-center gap-1.5">
                      <ChevronRight className={`h-3.5 w-3.5 transition-transform duration-150 ${isAdvisorOpen ? 'rotate-90' : ''}`} />
                      {advisor}
                      <span className="ml-1 rounded-full bg-[#D6E4F0] px-1.5 py-0.5 text-[11px] font-medium text-[#1F5C99]">
                        {teams.length}팀
                      </span>
                    </span>
                  </td>
                  <td className="px-3 py-2.5 text-right text-gray-500">
                    {gt.draft > 0 ? formatKRW(gt.draft) : <span className="text-gray-300">—</span>}
                  </td>
                  <td className="px-3 py-2.5 text-right text-[#131310]">
                    {(gt.confirmed - gt.claimed) > 0 ? formatKRW(gt.confirmed - gt.claimed) : <span className="text-gray-300">—</span>}
                  </td>
                  <td className="px-3 py-2.5 text-right text-[#131310]">
                    {gt.claimed > 0 ? formatKRW(gt.claimed) : <span className="text-gray-300">—</span>}
                  </td>
                </tr>,

                ...(!isAdvisorOpen
                  ? []
                  : teams.flatMap((s: WeMeetTeamSummary, idx: number) => {
                      const isOpen    = openTeam === s.teamName;
                      const totals    = usageTotals(s);
                      const info      = teamInfoMap.get(s.teamName) ?? null;
                      const execs     = executionsByTeam.get(s.teamName) ?? [];
                      const isEditing = info !== null && editingRow === info.rowIndex;
                      const rowBg     = isOpen ? 'bg-primary-bg' : idx % 2 === 0 ? 'bg-white' : 'bg-[#F5F9FC]';

                      return [
                        <tr
                          key={s.teamName}
                          className={`${rowBg} cursor-pointer hover:bg-primary-bg/60 transition-colors`}
                          onClick={() => toggleTeam(s.teamName)}
                        >
                          <td className={`px-3 py-2 pl-8 font-medium ${isOpen ? 'text-primary' : 'text-[#131310]'}`}>
                            <span className="flex items-center gap-1.5">
                              <ChevronRight className={`h-3 w-3 shrink-0 text-gray-400 transition-transform duration-150 ${isOpen ? 'rotate-90' : ''}`} />
                              {s.teamName}
                            </span>
                          </td>
                          <td className="px-3 py-2 text-right text-gray-500">
                            {totals.draft > 0 ? formatKRW(totals.draft) : <span className="text-gray-300">—</span>}
                          </td>
                          <td className="px-3 py-2 text-right text-[#131310]">
                            {(totals.confirmed - totals.claimed) > 0 ? formatKRW(totals.confirmed - totals.claimed) : <span className="text-gray-300">—</span>}
                          </td>
                          <td className="px-3 py-2 text-right text-[#131310]">
                            {totals.claimed > 0 ? formatKRW(totals.claimed) : <span className="text-gray-300">—</span>}
                          </td>
                        </tr>,

                        ...(isOpen
                          ? [
                              <tr key={`${s.teamName}-panel`}>
                                <td colSpan={4} className="p-0 border-t border-[#E8EFF5]">
                                  <div className="bg-[#F8FAFC] px-5 py-4 space-y-4">

                                    {/* 사용구분별 요약 (집행 데이터 기반 동적 계산) */}
                                    <div>
                                      <p className="mb-2 text-xs font-semibold text-[#6F6F6B]">사용구분별 현황</p>
                                      {execs.length === 0 ? (
                                        <p className="text-xs text-gray-400">집행내역이 없습니다.</p>
                                      ) : (
                                        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                                          {calcUsageBreakdown(execs).map(({ usageType, draft, confirmed, unclaimed }) => {
                                            const claimedAmt = confirmed - unclaimed;
                                            return (
                                              <div key={usageType} className="rounded-md border border-[#E3E3E0] bg-white p-2.5">
                                                <p className="mb-1.5 text-[11px] font-medium text-[#6F6F6B]">{usageType}</p>
                                                <div className="space-y-0.5 text-[11px]">
                                                  <div className="flex justify-between">
                                                    <span className="text-gray-400">기안금액</span>
                                                    <span className={draft > 0 ? 'text-gray-600' : 'text-gray-300'}>
                                                      {draft > 0 ? formatKRW(draft) : '—'}
                                                    </span>
                                                  </div>
                                                  <div className="flex justify-between">
                                                    <span className="text-gray-400">확정청구</span>
                                                    <span className={claimedAmt > 0 ? 'font-medium text-[#131310]' : 'text-gray-300'}>
                                                      {claimedAmt > 0 ? formatKRW(claimedAmt) : '—'}
                                                    </span>
                                                  </div>
                                                  <div className="flex justify-between">
                                                    <span className="text-gray-400">확정미청구</span>
                                                    <span className={unclaimed > 0 ? 'text-primary' : 'text-gray-300'}>
                                                      {unclaimed > 0 ? formatKRW(unclaimed) : '—'}
                                                    </span>
                                                  </div>
                                                </div>
                                              </div>
                                            );
                                          })}
                                        </div>
                                      )}
                                    </div>

                                    <div className="border-t border-[#E3E3E0]" />

                                    {/* 팀 정보 */}
                                    {info ? (
                                      <div className="space-y-3">
                                        <div className="flex items-center justify-between">
                                          <p className="text-xs font-semibold text-primary">{info.teamName} — 팀 정보</p>
                                          <div className="flex items-center gap-1.5">
                                            <WeMeetTeamPdfReport
                                              teamName={s.teamName}
                                              summary={s}
                                              executions={executions}
                                              teamInfo={info}
                                            />
                                            {canWrite && !isEditing && (
                                              <button
                                                onClick={(e) => { e.stopPropagation(); startEdit(info); }}
                                                className="flex items-center gap-1 rounded-md border border-[#E3E3E0] bg-white px-2 py-1 text-xs text-[#6F6F6B] hover:border-primary hover:text-primary transition-colors"
                                              >
                                                <Pencil className="h-3 w-3" />
                                                팀 정보 수정
                                              </button>
                                            )}
                                            {isEditing && (
                                              <div className="flex items-center gap-1">
                                                <button
                                                  onClick={(e) => { e.stopPropagation(); void saveEdit(info); }}
                                                  disabled={savePending}
                                                  className="flex items-center gap-1 rounded-md bg-primary px-2 py-1 text-xs text-white hover:bg-primary-light transition-colors disabled:opacity-50"
                                                >
                                                  <Check className="h-3 w-3" />
                                                  저장
                                                </button>
                                                <button
                                                  onClick={(e) => { e.stopPropagation(); cancelEdit(); }}
                                                  className="flex items-center gap-1 rounded-md border border-[#E3E3E0] bg-white px-2 py-1 text-xs text-[#6F6F6B] hover:bg-gray-50 transition-colors"
                                                >
                                                  <X className="h-3 w-3" />
                                                  취소
                                                </button>
                                              </div>
                                            )}
                                          </div>
                                        </div>

                                        {isEditing ? (
                                          <div
                                            className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4"
                                            onClick={(e) => e.stopPropagation()}
                                          >
                                            {inp('advisor', '지도교수')}
                                            {inp('teamLeader', '팀장')}
                                            {inp('mentorOrg', '멘토소속')}
                                            {inp('mentor', '멘토')}
                                            {inp('assistantMentor', '보조멘토')}
                                            {inp('teamMembers', '팀원(합산)')}
                                            {inp('topic', '주제', true)}
                                          </div>
                                        ) : (
                                          <div className="grid grid-cols-2 gap-x-8 gap-y-1.5 sm:grid-cols-3 lg:grid-cols-5">
                                            {(
                                              [
                                                ['지도교수', info.advisor],
                                                ['멘토소속', info.mentorOrg],
                                                ['멘토',     info.mentor],
                                                ['보조멘토', info.assistantMentor],
                                                ['팀장',     info.teamLeader],
                                              ] as [string, string][]
                                            ).map(([label, val]) => (
                                              <div key={label} className="flex gap-1.5">
                                                <span className="shrink-0 text-xs text-[#6F6F6B]">{label}</span>
                                                <span className="text-xs font-medium text-[#131310] truncate">{val || '—'}</span>
                                              </div>
                                            ))}
                                          </div>
                                        )}

                                        {!isEditing && info.topic && (
                                          <div className="flex gap-1.5 text-xs">
                                            <span className="shrink-0 text-[#6F6F6B]">주제</span>
                                            <span className="text-[#131310]">{info.topic}</span>
                                          </div>
                                        )}

                                        {info.memberList && info.memberList.length > 0 && (
                                          <div className="flex flex-wrap items-center gap-1.5">
                                            <span className="shrink-0 text-xs text-[#6F6F6B]">팀원명단</span>
                                            {info.memberList.map((m, mi) => (
                                              <span key={mi} className="rounded-full bg-primary-bg px-2 py-0.5 text-[11px] text-primary">
                                                {m}
                                              </span>
                                            ))}
                                          </div>
                                        )}

                                        {(!info.memberList || info.memberList.length === 0) && info.teamMembers && !isEditing && (
                                          <div className="flex gap-1.5 text-xs">
                                            <span className="shrink-0 text-[#6F6F6B]">팀원</span>
                                            <span className="text-[#131310]">{info.teamMembers}</span>
                                          </div>
                                        )}

                                        <div className="space-y-1" onClick={(e) => e.stopPropagation()}>
                                          <label className="text-xs text-[#6F6F6B]">비고</label>
                                          <textarea
                                            key={`remarks-${info.rowIndex}-${info.remarks}`}
                                            defaultValue={info.remarks}
                                            onBlur={(e) => {
                                              const next = e.target.value;
                                              if (next !== info.remarks) {
                                                onUpdateTeamInfo({ ...info, remarks: next });
                                              }
                                            }}
                                            placeholder="비고를 입력하세요 (입력 후 다른 곳 클릭 시 자동 저장)"
                                            rows={2}
                                            className="w-full resize-y rounded border border-[#E3E3E0] p-2 text-xs text-[#131310] placeholder:text-gray-300 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary transition-colors"
                                          />
                                        </div>
                                      </div>
                                    ) : (
                                      <p className="text-xs text-gray-400">
                                        팀 정보가 등록되어 있지 않습니다. 팀 관리에서 팀 정보를 입력해 주세요.
                                      </p>
                                    )}

                                    <div className="border-t border-[#E3E3E0]" />

                                    {/* 집행현황 */}
                                    <div className="space-y-2">
                                      <div className="flex items-center justify-between">
                                        <p className="text-xs font-semibold text-[#6F6F6B]">
                                          집행현황
                                          <span className="ml-1.5 font-normal text-gray-400">({execs.length}건)</span>
                                        </p>
                                        {canWrite && (
                                          <button
                                            onClick={(e) => { e.stopPropagation(); onAddExecution(s.teamName); }}
                                            className="flex items-center gap-1 rounded-md border border-[#E3E3E0] bg-white px-2 py-1 text-xs text-[#6F6F6B] hover:border-primary hover:text-primary transition-colors"
                                          >
                                            <Plus className="h-3 w-3" />
                                            행 추가
                                          </button>
                                        )}
                                      </div>

                                      {execs.length === 0 ? (
                                        <p className="py-3 text-center text-xs text-gray-400">집행내역이 없습니다.</p>
                                      ) : (
                                        <div className="overflow-x-auto rounded-md border border-[#E3E3E0]">
                                          <table className="w-full border-collapse text-xs">
                                            <thead>
                                              <tr className="bg-[#F3F3EE]">
                                                <th className="px-3 py-2 text-left font-medium text-[#6F6F6B]">사용구분</th>
                                                <th className="px-3 py-2 text-left font-medium text-[#6F6F6B]">지출건명</th>
                                                <th className="px-3 py-2 text-right font-medium text-[#6F6F6B] whitespace-nowrap">기안금액</th>
                                                <th className="px-3 py-2 text-right font-medium text-[#6F6F6B] whitespace-nowrap">확정금액</th>
                                                <th className="px-3 py-2 text-center font-medium text-[#6F6F6B] whitespace-nowrap">청구</th>
                                                <th className="px-3 py-2 text-center font-medium text-[#6F6F6B] whitespace-nowrap">증빙</th>
                                                {canWrite && <th className="px-3 py-2 font-medium text-[#6F6F6B]"></th>}
                                              </tr>
                                            </thead>
                                            <tbody>
                                              {execs.map((row, ri) => (
                                                <tr key={row.rowIndex} className={ri % 2 === 0 ? 'bg-white' : 'bg-[#F5F9FC]'}>
                                                  <td className="px-3 py-1.5">
                                                    <span className="inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium bg-primary-bg text-primary">
                                                      {row.usageType}
                                                    </span>
                                                  </td>
                                                  <td className="px-3 py-1.5 max-w-[200px]">
                                                    <div className="truncate text-[#131310]">
                                                      {row.description || <span className="text-gray-300">—</span>}
                                                    </div>
                                                    {row.remarks && (
                                                      <div className="text-[10px] text-gray-400">{row.remarks}</div>
                                                    )}
                                                  </td>
                                                  <td className="px-3 py-1.5 text-right text-[#131310]">
                                                    {formatKRW(row.draftAmount)}
                                                  </td>
                                                  <td className="px-3 py-1.5 text-right">
                                                    {row.confirmedAmount > 0 ? (
                                                      <input
                                                        key={`${row.rowIndex}-${row.confirmedAmount}`}
                                                        type="text"
                                                        defaultValue={formatKRW(row.confirmedAmount)}
                                                        disabled={!canWrite || isToggling}
                                                        onBlur={(e) => {
                                                          const next = parseKRW(e.target.value);
                                                          if (next !== row.confirmedAmount) {
                                                            onUpdateExecution({ ...row, confirmedAmount: next });
                                                          }
                                                        }}
                                                        onClick={(e) => e.stopPropagation()}
                                                        className="w-24 rounded border border-[#E3E3E0] px-2 py-0.5 text-right text-xs font-medium text-[#131310] focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary disabled:opacity-40"
                                                      />
                                                    ) : (
                                                      <span className="text-gray-400 text-xs">미확정</span>
                                                    )}
                                                  </td>
                                                  <td className="px-3 py-1.5 text-center">
                                                    <input
                                                      type="checkbox"
                                                      checked={row.claimed}
                                                      disabled={!canWrite || isToggling || row.confirmedAmount === 0}
                                                      onChange={(e) => {
                                                        e.stopPropagation();
                                                        onUpdateExecution({ ...row, claimed: e.target.checked });
                                                      }}
                                                      className="h-3.5 w-3.5 cursor-pointer accent-primary disabled:cursor-default disabled:opacity-40"
                                                    />
                                                  </td>
                                                  <td className="px-3 py-1.5 text-center">
                                                    <input
                                                      type="checkbox"
                                                      checked={row.evidenceSubmitted}
                                                      disabled={!canWrite || isToggling}
                                                      onChange={(e) => {
                                                        e.stopPropagation();
                                                        onUpdateExecution({ ...row, evidenceSubmitted: e.target.checked });
                                                      }}
                                                      className="h-3.5 w-3.5 cursor-pointer accent-primary disabled:cursor-default"
                                                    />
                                                  </td>
                                                  {canWrite && (
                                                    <td className="px-3 py-1.5">
                                                      <div className="flex items-center justify-end gap-1">
                                                        <button
                                                          onClick={(e) => { e.stopPropagation(); onEditExecution(row); }}
                                                          className="rounded p-1 text-gray-400 hover:bg-blue-50 hover:text-blue-500 transition-colors"
                                                        >
                                                          <Pencil className="h-3 w-3" />
                                                        </button>
                                                        <button
                                                          onClick={(e) => {
                                                            e.stopPropagation();
                                                            setDeleteTarget(row);
                                                            setDeleteOpen(true);
                                                          }}
                                                          className="rounded p-1 text-gray-400 hover:bg-red-50 hover:text-red-500 transition-colors"
                                                        >
                                                          <Trash2 className="h-3 w-3" />
                                                        </button>
                                                      </div>
                                                    </td>
                                                  )}
                                                </tr>
                                              ))}
                                            </tbody>
                                            <tfoot>
                                              <tr className="border-t border-[#E3E3E0] bg-[#F3F3EE] font-medium">
                                                <td colSpan={2} className="px-3 py-1.5 text-[#6F6F6B]">합계</td>
                                                <td className="px-3 py-1.5 text-right text-[#131310]">
                                                  {formatKRW(execs.reduce((sum, r) => sum + r.draftAmount, 0))}
                                                </td>
                                                <td className="px-3 py-1.5 text-right text-[#131310]">
                                                  {formatKRW(execs.reduce((sum, r) => sum + r.confirmedAmount, 0))}
                                                </td>
                                                <td className="px-3 py-1.5 text-center text-xs text-gray-400">
                                                  {execs.filter((r) => r.claimed).length}/{execs.length}건
                                                </td>
                                                <td className="px-3 py-1.5 text-center text-xs text-gray-400">
                                                  {execs.filter((r) => r.evidenceSubmitted).length}/{execs.length}건
                                                </td>
                                                {canWrite && <td />}
                                              </tr>
                                            </tfoot>
                                          </table>
                                        </div>
                                      )}
                                    </div>
                                  </div>
                                </td>
                              </tr>,
                            ]
                          : []),
                      ];
                    })),
              ];
            })}
          </tbody>

          <tfoot>
            <tr className="border-t-2 border-[#E3E3E0] bg-[#F3F3EE] font-semibold">
              <td className="px-3 py-2 text-[#6F6F6B]">합계 ({summaries.length}팀)</td>
              <td className="px-3 py-2 text-right text-gray-500">{formatKRW(grandTotal.draft)}</td>
              <td className="px-3 py-2 text-right text-[#131310]">{formatKRW(grandTotal.confirmed - grandTotal.claimed)}</td>
              <td className="px-3 py-2 text-right text-[#131310]">{formatKRW(grandTotal.claimed)}</td>
            </tr>
          </tfoot>
        </table>
      </div>

      <ConfirmDialog
        open={deleteOpen}
        title="집행내역 삭제"
        description={`"${deleteTarget?.teamName} - ${deleteTarget?.usageType}" 내역을 삭제하시겠습니까?`}
        loading={false}
        onConfirm={() => {
          if (deleteTarget) onDeleteExecution(deleteTarget);
          setDeleteOpen(false);
          setDeleteTarget(null);
        }}
        onClose={() => { setDeleteOpen(false); setDeleteTarget(null); }}
      />
    </div>
  );
}

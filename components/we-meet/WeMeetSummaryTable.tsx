'use client';

import { useState, useMemo } from 'react';
import { formatKRW } from '@/lib/utils';
import { ConfirmDialog } from '@/components/shared/ConfirmDialog';
import { ChevronRight, Plus, Pencil, Trash2, Check, X } from 'lucide-react';
import { WeMeetTeamPdfReport } from '@/components/we-meet/WeMeetPdfReport';
import type { WeMeetTeamSummary, WeMeetTeamInfo, WeMeetExecution } from '@/types';

// ── 상수 ────────────────────────────────────────────────────────────────

const USAGE_LABELS = [
  { key: 'mentoring'       as const, label: '멘토링' },
  { key: 'meeting'         as const, label: '회의비' },
  { key: 'material'        as const, label: '재료비' },
  { key: 'studentActivity' as const, label: '학생활동지원비' },
];
const COL_COUNT = 10;
const NO_ADVISOR = '지도교수 미배정';

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
  onToggleConfirmed: (row: WeMeetExecution) => void;
  isToggling: boolean;
}

// ── 유틸 ────────────────────────────────────────────────────────────────

function sumGroups(list: WeMeetTeamSummary[]) {
  return list.reduce(
    (acc, s) => ({
      totalBudget:      acc.totalBudget + s.totalBudget,
      confirmedTotal:   acc.confirmedTotal + s.confirmed.total,
      pendingTotal:     acc.pendingTotal + s.pending.total,
      confirmedBalance: acc.confirmedBalance + s.confirmedBalance,
      expectedBalance:  acc.expectedBalance + s.expectedBalance,
      mentoring:        acc.mentoring + s.confirmed.mentoring,
      meeting:          acc.meeting + s.confirmed.meeting,
      material:         acc.material + s.confirmed.material,
      studentActivity:  acc.studentActivity + s.confirmed.studentActivity,
    }),
    { totalBudget: 0, confirmedTotal: 0, pendingTotal: 0, confirmedBalance: 0, expectedBalance: 0, mentoring: 0, meeting: 0, material: 0, studentActivity: 0 },
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
  onAddExecution, onEditExecution, onDeleteExecution, onToggleConfirmed, isToggling,
}: Props) {
  const [openAdvisors, setOpenAdvisors] = useState<Set<string>>(new Set());
  const [openTeam, setOpenTeam]         = useState<string | null>(null);
  const [editingRow, setEditingRow]     = useState<number | null>(null);
  const [editState, setEditState]       = useState<EditState | null>(null);
  const [savePending, setSavePending]   = useState(false);
  const [deleteOpen, setDeleteOpen]     = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<WeMeetExecution | null>(null);

  // ── 파생 데이터 ──────────────────────────────────────────────────────

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

  // 지도교수별 그룹 (이름순, 미배정 맨 뒤)
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

  // ── 이벤트 핸들러 ────────────────────────────────────────────────────

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

  // ── 빈 상태 ──────────────────────────────────────────────────────────

  if (summaries.length === 0) {
    return (
      <div className="rounded-lg border border-[#E3E3E0] bg-white px-4 py-6 text-center text-sm text-gray-400">
        팀 데이터가 없습니다.
      </div>
    );
  }

  // ── 헬퍼: 편집 인풋 ──────────────────────────────────────────────────

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

  // ── 렌더 ─────────────────────────────────────────────────────────────

  return (
    <div>
      <div className="overflow-x-auto rounded-lg border border-[#E3E3E0]">
        <table className="w-full border-collapse text-sm">

          {/* 헤더 */}
          <thead>
            <tr className="bg-[#F3F3EE]">
              <th className="px-3 py-2.5 text-left font-medium text-[#6F6F6B]">팀명</th>
              <th className="px-3 py-2.5 text-right font-medium text-[#6F6F6B]">배정예산</th>
              {USAGE_LABELS.map((u) => (
                <th key={u.key} className="px-3 py-2.5 text-right font-medium text-[#6F6F6B] whitespace-nowrap">
                  {u.label}
                  <span className="block text-[10px] font-normal text-gray-400">확정</span>
                </th>
              ))}
              <th className="px-3 py-2.5 text-right font-medium text-[#6F6F6B] whitespace-nowrap">미확정계</th>
              <th className="px-3 py-2.5 text-right font-medium text-[#6F6F6B]">확정합계</th>
              <th className="px-3 py-2.5 text-right font-medium text-[#6F6F6B]">확정잔액</th>
              <th className="px-3 py-2.5 text-right font-medium text-[#6F6F6B]">예정잔액</th>
            </tr>
          </thead>

          <tbody>
            {advisorGroups.map(({ advisor, teams }) => {
              const isAdvisorOpen = openAdvisors.has(advisor);
              const gt = sumGroups(teams);

              return [
                /* ── 지도교수 그룹 헤더 ── */
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
                  <td className="px-3 py-2.5 text-right font-semibold text-[#131310]">{formatKRW(gt.totalBudget)}</td>
                  {USAGE_LABELS.map((u) => (
                    <td key={u.key} className="px-3 py-2.5 text-right text-[#131310]">
                      {gt[u.key] > 0 ? formatKRW(gt[u.key]) : <span className="text-gray-300">—</span>}
                    </td>
                  ))}
                  <td className="px-3 py-2.5 text-right text-gray-400">
                    {gt.pendingTotal > 0 ? formatKRW(gt.pendingTotal) : <span className="text-gray-300">—</span>}
                  </td>
                  <td className="px-3 py-2.5 text-right font-semibold text-[#131310]">{formatKRW(gt.confirmedTotal)}</td>
                  <td className={`px-3 py-2.5 text-right font-semibold ${gt.confirmedBalance < 0 ? 'text-red-500' : 'text-complete'}`}>
                    {formatKRW(gt.confirmedBalance)}
                  </td>
                  <td className={`px-3 py-2.5 text-right ${gt.expectedBalance < 0 ? 'text-amber-500' : 'text-gray-500'}`}>
                    {formatKRW(gt.expectedBalance)}
                  </td>
                </tr>,

                /* ── 팀 행들 (지도교수 펼쳤을 때) ── */
                ...(!isAdvisorOpen
                  ? []
                  : teams.flatMap((s: WeMeetTeamSummary, idx: number) => {
                      const isOpen  = openTeam === s.teamName;
                      const isOver  = s.confirmedBalance < 0;
                      const isWarn  = s.expectedBalance < 0 && s.confirmedBalance >= 0;
                      const info    = teamInfoMap.get(s.teamName) ?? null;
                      const execs   = executionsByTeam.get(s.teamName) ?? [];
                      const isEditing = info !== null && editingRow === info.rowIndex;
                      const rowBg   = isOpen ? 'bg-primary-bg' : idx % 2 === 0 ? 'bg-white' : 'bg-[#F5F9FC]';

                      return [
                        /* 팀 요약 행 */
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
                          <td className="px-3 py-2 text-right text-[#131310]">{formatKRW(s.totalBudget)}</td>
                          {USAGE_LABELS.map((u) => (
                            <td key={u.key} className="px-3 py-2 text-right text-[#131310]">
                              {s.confirmed[u.key] > 0 ? formatKRW(s.confirmed[u.key]) : <span className="text-gray-300">—</span>}
                            </td>
                          ))}
                          <td className="px-3 py-2 text-right text-gray-400">
                            {s.pending.total > 0 ? formatKRW(s.pending.total) : <span className="text-gray-300">—</span>}
                          </td>
                          <td className="px-3 py-2 text-right font-medium text-[#131310]">{formatKRW(s.confirmed.total)}</td>
                          <td className={`px-3 py-2 text-right font-medium ${isOver ? 'text-red-500' : 'text-complete'}`}>
                            {formatKRW(s.confirmedBalance)}
                          </td>
                          <td className={`px-3 py-2 text-right ${isWarn ? 'text-amber-500' : 'text-gray-500'}`}>
                            {formatKRW(s.expectedBalance)}
                          </td>
                        </tr>,

                        /* 인라인 아코디언 패널 */
                        ...(isOpen
                          ? [
                              <tr key={`${s.teamName}-panel`}>
                                <td colSpan={COL_COUNT} className="p-0 border-t border-[#E8EFF5]">
                                  <div className="bg-[#F8FAFC] px-5 py-4 space-y-4">

                                    {/* 팀 정보 */}
                                    {info ? (
                                      <div className="space-y-3">
                                        {/* 헤더 + 액션 */}
                                        <div className="flex items-center justify-between">
                                          <p className="text-xs font-semibold text-primary">{info.teamName} — 팀 정보</p>
                                          <div className="flex items-center gap-1.5">
                                            <WeMeetTeamPdfReport
                                              teamName={s.teamName}
                                              summary={s}
                                              executions={executions}
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

                                        {/* 편집 폼 또는 읽기 전용 */}
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
                                            {inp('remarks', '비고', true)}
                                          </div>
                                        ) : (
                                          <div className="grid grid-cols-2 gap-x-8 gap-y-1.5 sm:grid-cols-3 lg:grid-cols-5">
                                            {(
                                              [
                                                ['지도교수', info.advisor],
                                                ['멘토소속', info.mentorOrg],
                                                ['멘토',    info.mentor],
                                                ['보조멘토', info.assistantMentor],
                                                ['팀장',    info.teamLeader],
                                              ] as [string, string][]
                                            ).map(([label, val]) => (
                                              <div key={label} className="flex gap-1.5">
                                                <span className="shrink-0 text-xs text-[#6F6F6B]">{label}</span>
                                                <span className="text-xs font-medium text-[#131310] truncate">{val || '—'}</span>
                                              </div>
                                            ))}
                                          </div>
                                        )}

                                        {/* 주제 (읽기 전용일 때만 별도 표시) */}
                                        {!isEditing && info.topic && (
                                          <div className="flex gap-1.5 text-xs">
                                            <span className="shrink-0 text-[#6F6F6B]">주제</span>
                                            <span className="text-[#131310]">{info.topic}</span>
                                          </div>
                                        )}

                                        {/* 팀원 명단 (K열 이후 개별) */}
                                        {info.memberList && info.memberList.length > 0 && (
                                          <div className="flex flex-wrap items-center gap-1.5">
                                            <span className="shrink-0 text-xs text-[#6F6F6B]">팀원명단</span>
                                            {info.memberList.map((m, mi) => (
                                              <span
                                                key={mi}
                                                className="rounded-full bg-primary-bg px-2 py-0.5 text-[11px] text-primary"
                                              >
                                                {m}
                                              </span>
                                            ))}
                                          </div>
                                        )}

                                        {/* 팀원 합산 텍스트 (G열, memberList 없을 때 표시) */}
                                        {(!info.memberList || info.memberList.length === 0) && info.teamMembers && !isEditing && (
                                          <div className="flex gap-1.5 text-xs">
                                            <span className="shrink-0 text-[#6F6F6B]">팀원</span>
                                            <span className="text-[#131310]">{info.teamMembers}</span>
                                          </div>
                                        )}

                                        {/* 비고 (읽기 전용일 때 표시) */}
                                        {!isEditing && (
                                          <div className="text-xs text-[#6F6F6B]">
                                            비고:&nbsp;
                                            <span className="text-[#131310]">{info.remarks || <em className="not-italic text-gray-300">없음</em>}</span>
                                          </div>
                                        )}
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
                                                <th className="px-3 py-2 text-right font-medium text-[#6F6F6B]">기안금액</th>
                                                <th className="px-3 py-2 text-center font-medium text-[#6F6F6B]">확정</th>
                                                <th className="px-3 py-2 text-right font-medium text-[#6F6F6B]">확정금액</th>
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
                                                    {row.usageDate && (
                                                      <div className="text-[10px] text-gray-400">{row.usageDate}</div>
                                                    )}
                                                  </td>
                                                  <td className="px-3 py-1.5 text-right text-[#131310]">{formatKRW(row.draftAmount)}</td>
                                                  <td className="px-3 py-1.5 text-center">
                                                    <input
                                                      type="checkbox"
                                                      checked={row.confirmed}
                                                      disabled={!canWrite || isToggling}
                                                      onChange={(e) => { e.stopPropagation(); onToggleConfirmed(row); }}
                                                      className="h-3.5 w-3.5 cursor-pointer accent-primary disabled:cursor-default"
                                                    />
                                                  </td>
                                                  <td className="px-3 py-1.5 text-right">
                                                    <span className={row.confirmed ? 'font-medium text-[#131310]' : 'text-gray-400'}>
                                                      {formatKRW(row.confirmedAmount)}
                                                    </span>
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
                                                <td />
                                                <td className="px-3 py-1.5 text-right text-[#131310]">
                                                  {formatKRW(execs.reduce((sum, r) => sum + (r.confirmed ? r.confirmedAmount : 0), 0))}
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

          {/* 전체 합계 */}
          <tfoot>
            <tr className="border-t-2 border-[#E3E3E0] bg-[#F3F3EE] font-semibold">
              <td className="px-3 py-2 text-[#6F6F6B]">합계 ({summaries.length}팀)</td>
              <td className="px-3 py-2 text-right text-[#131310]">{formatKRW(grandTotal.totalBudget)}</td>
              {USAGE_LABELS.map((u) => (
                <td key={u.key} className="px-3 py-2 text-right text-[#131310]">{formatKRW(grandTotal[u.key])}</td>
              ))}
              <td className="px-3 py-2 text-right text-gray-400">{formatKRW(grandTotal.pendingTotal)}</td>
              <td className="px-3 py-2 text-right text-[#131310]">{formatKRW(grandTotal.confirmedTotal)}</td>
              <td className={`px-3 py-2 text-right ${grandTotal.confirmedBalance < 0 ? 'text-red-500' : 'text-[#131310]'}`}>
                {formatKRW(grandTotal.confirmedBalance)}
              </td>
              <td className={`px-3 py-2 text-right ${grandTotal.expectedBalance < 0 ? 'text-amber-500' : 'text-[#131310]'}`}>
                {formatKRW(grandTotal.expectedBalance)}
              </td>
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

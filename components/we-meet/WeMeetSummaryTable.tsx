'use client';

import { useState, useMemo } from 'react';
import { formatKRW } from '@/lib/utils';
import { ConfirmDialog } from '@/components/shared/ConfirmDialog';
import { ChevronRight, Plus, Pencil, Trash2 } from 'lucide-react';
import type { WeMeetTeamSummary, WeMeetTeamInfo, WeMeetExecution } from '@/types';

interface Props {
  summaries: WeMeetTeamSummary[];
  teamInfos: WeMeetTeamInfo[];
  executions: WeMeetExecution[];
  selectedTeam: string | null;
  canWrite: boolean;
  onSelectTeam: (team: string | null) => void;
  onSaveTeamRemarks: (rowIndex: number, remarks: string) => void;
  onAddExecution: (teamName: string) => void;
  onEditExecution: (row: WeMeetExecution) => void;
  onDeleteExecution: (row: WeMeetExecution) => void;
  onToggleConfirmed: (row: WeMeetExecution) => void;
  isToggling: boolean;
}

const USAGE_LABELS = [
  { key: 'mentoring'       as const, label: '멘토링' },
  { key: 'meeting'         as const, label: '회의비' },
  { key: 'material'        as const, label: '재료비' },
  { key: 'studentActivity' as const, label: '학생활동지원비' },
];

const COL_COUNT = 10;

export function WeMeetSummaryTable({
  summaries, teamInfos, executions, selectedTeam, canWrite,
  onSelectTeam, onSaveTeamRemarks,
  onAddExecution, onEditExecution, onDeleteExecution, onToggleConfirmed, isToggling,
}: Props) {
  const [activeAdvisor, setActiveAdvisor] = useState<string>('전체');
  const [deleteOpen, setDeleteOpen]       = useState(false);
  const [deleteTarget, setDeleteTarget]   = useState<WeMeetExecution | null>(null);

  const advisorTabs = useMemo(() => {
    const seen = new Set<string>();
    const list: string[] = [];
    for (const info of teamInfos) {
      const a = info.advisor.trim();
      if (a && !seen.has(a)) { seen.add(a); list.push(a); }
    }
    return ['전체', ...list];
  }, [teamInfos]);

  const advisorTeamMap = useMemo(() => {
    const map = new Map<string, Set<string>>();
    for (const info of teamInfos) {
      const a = info.advisor.trim();
      if (!a) continue;
      if (!map.has(a)) map.set(a, new Set());
      map.get(a)!.add(info.teamName);
    }
    return map;
  }, [teamInfos]);

  const filteredSummaries = useMemo(() => {
    if (activeAdvisor === '전체') return summaries;
    const s = advisorTeamMap.get(activeAdvisor);
    if (!s) return [];
    return summaries.filter((r) => s.has(r.teamName));
  }, [summaries, activeAdvisor, advisorTeamMap]);

  const grandTotal = useMemo(() => filteredSummaries.reduce((acc, s) => ({
    totalBudget:      acc.totalBudget + s.totalBudget,
    confirmedTotal:   acc.confirmedTotal + s.confirmed.total,
    pendingTotal:     acc.pendingTotal + s.pending.total,
    confirmedBalance: acc.confirmedBalance + s.confirmedBalance,
    expectedBalance:  acc.expectedBalance + s.expectedBalance,
    mentoring:        acc.mentoring + s.confirmed.mentoring,
    meeting:          acc.meeting + s.confirmed.meeting,
    material:         acc.material + s.confirmed.material,
    studentActivity:  acc.studentActivity + s.confirmed.studentActivity,
  }), {
    totalBudget: 0, confirmedTotal: 0, pendingTotal: 0,
    confirmedBalance: 0, expectedBalance: 0,
    mentoring: 0, meeting: 0, material: 0, studentActivity: 0,
  }), [filteredSummaries]);

  const teamInfoMap = useMemo(() => {
    const m = new Map<string, WeMeetTeamInfo>();
    for (const t of teamInfos) m.set(t.teamName, t);
    return m;
  }, [teamInfos]);

  // executions per team
  const executionsByTeam = useMemo(() => {
    const m = new Map<string, WeMeetExecution[]>();
    for (const e of executions) {
      if (!m.has(e.teamName)) m.set(e.teamName, []);
      m.get(e.teamName)!.push(e);
    }
    return m;
  }, [executions]);

  if (summaries.length === 0) {
    return (
      <div className="rounded-lg border border-[#E3E3E0] bg-white px-4 py-6 text-center text-sm text-gray-400">
        팀 데이터가 없습니다.
      </div>
    );
  }

  const hasAdvisorTabs = advisorTabs.length > 1;

  return (
    <div className="space-y-0">
      {/* 지도교수 탭 */}
      {hasAdvisorTabs && (
        <div className="flex items-center gap-0 border-b border-[#E3E3E0] bg-white rounded-t-lg overflow-x-auto">
          {advisorTabs.map((advisor) => {
            const isActive = activeAdvisor === advisor;
            const count = advisor === '전체'
              ? summaries.length
              : (advisorTeamMap.get(advisor)?.size ?? 0);
            return (
              <button
                key={advisor}
                onClick={() => setActiveAdvisor(advisor)}
                className={[
                  'flex items-center gap-1.5 whitespace-nowrap px-4 py-2.5 text-sm font-medium border-b-2 transition-colors',
                  isActive
                    ? 'border-primary text-primary bg-white'
                    : 'border-transparent text-[#6F6F6B] hover:text-[#131310] hover:bg-[#F8F8F5]',
                ].join(' ')}
              >
                {advisor}
                <span className={[
                  'rounded-full px-1.5 py-0.5 text-xs font-medium',
                  isActive ? 'bg-primary/10 text-primary' : 'bg-[#EBEBEA] text-[#6F6F6B]',
                ].join(' ')}>
                  {count}
                </span>
              </button>
            );
          })}
        </div>
      )}

      <div className={`overflow-x-auto border-[#E3E3E0] ${hasAdvisorTabs ? 'rounded-b-lg border-x border-b' : 'rounded-lg border'}`}>
        <table className="w-full border-collapse text-sm">
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
            {filteredSummaries.map((s, idx) => {
              const isSelected = selectedTeam === s.teamName;
              const isOver     = s.confirmedBalance < 0;
              const isWarn     = s.expectedBalance < 0 && s.confirmedBalance >= 0;
              const rowBg      = isSelected ? 'bg-primary-bg' : idx % 2 === 0 ? 'bg-white' : 'bg-[#F5F9FC]';
              const info       = teamInfoMap.get(s.teamName) ?? null;
              const teamExecs  = executionsByTeam.get(s.teamName) ?? [];

              return [
                /* ── 팀 요약 행 ── */
                <tr
                  key={s.teamName}
                  className={`${rowBg} cursor-pointer hover:bg-primary-bg/60 transition-colors`}
                  onClick={() => onSelectTeam(isSelected ? null : s.teamName)}
                >
                  <td className={`px-3 py-2 font-medium ${isSelected ? 'text-primary' : 'text-[#131310]'}`}>
                    <span className="flex items-center gap-1.5">
                      <ChevronRight className={`h-3.5 w-3.5 shrink-0 text-gray-400 transition-transform duration-150 ${isSelected ? 'rotate-90' : ''}`} />
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

                /* ── 인라인 아코디언 ── */
                isSelected && (
                  <tr key={`${s.teamName}-accordion`}>
                    <td colSpan={COL_COUNT} className="p-0 border-t border-[#E8EFF5]">
                      <div className="bg-[#F8FAFC] px-5 py-4 space-y-4">

                        {/* 팀 정보 */}
                        {info ? (
                          <div className="space-y-2">
                            <p className="text-xs font-semibold text-primary">{info.teamName} — 팀 정보</p>
                            <div className="grid grid-cols-2 gap-x-8 gap-y-1.5 sm:grid-cols-3 lg:grid-cols-5">
                              {([
                                ['지도교수', info.advisor],
                                ['멘토소속', info.mentorOrg],
                                ['멘토',    info.mentor],
                                ['보조멘토', info.assistantMentor],
                                ['팀장',    info.teamLeader],
                              ] as [string, string][]).map(([label, val]) => (
                                <div key={label} className="flex gap-1.5">
                                  <span className="shrink-0 text-xs text-[#6F6F6B]">{label}</span>
                                  <span className="text-xs font-medium text-[#131310] truncate">{val || '—'}</span>
                                </div>
                              ))}
                            </div>
                            {info.topic && (
                              <div className="flex gap-1.5 text-xs">
                                <span className="shrink-0 text-[#6F6F6B]">주제</span>
                                <span className="text-[#131310]">{info.topic}</span>
                              </div>
                            )}
                            {info.teamMembers && (
                              <div className="flex gap-1.5 text-xs">
                                <span className="shrink-0 text-[#6F6F6B]">팀원</span>
                                <span className="text-[#131310]">{info.teamMembers}</span>
                              </div>
                            )}
                            <textarea
                              key={info.rowIndex}
                              defaultValue={info.remarks}
                              onBlur={(e) => {
                                if (e.target.value !== info.remarks) {
                                  onSaveTeamRemarks(info.rowIndex, e.target.value);
                                  info.remarks = e.target.value;
                                }
                              }}
                              placeholder="비고를 입력하세요 (작성 후 바깥을 클릭하면 자동 저장됩니다)"
                              rows={2}
                              className="w-full resize-y rounded-[2px] border border-[#E3E3E0] p-2 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary transition-colors"
                            />
                          </div>
                        ) : (
                          <p className="text-xs text-gray-400">
                            팀 정보가 등록되어 있지 않습니다. 상단 &quot;팀 관리&quot;에서 팀 정보를 입력해 주세요.
                          </p>
                        )}

                        {/* 구분선 */}
                        <div className="border-t border-[#E3E3E0]" />

                        {/* 집행현황 */}
                        <div className="space-y-2">
                          <div className="flex items-center justify-between">
                            <p className="text-xs font-semibold text-[#6F6F6B]">
                              집행현황
                              <span className="ml-1.5 font-normal text-gray-400">({teamExecs.length}건)</span>
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

                          {teamExecs.length === 0 ? (
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
                                    {canWrite && <th className="px-3 py-2 text-right font-medium text-[#6F6F6B]"></th>}
                                  </tr>
                                </thead>
                                <tbody>
                                  {teamExecs.map((row, ri) => (
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
                                              onClick={(e) => { e.stopPropagation(); setDeleteTarget(row); setDeleteOpen(true); }}
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
                                      {formatKRW(teamExecs.reduce((sum, r) => sum + r.draftAmount, 0))}
                                    </td>
                                    <td />
                                    <td className="px-3 py-1.5 text-right text-[#131310]">
                                      {formatKRW(teamExecs.reduce((sum, r) => sum + (r.confirmed ? r.confirmedAmount : 0), 0))}
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
                  </tr>
                ),
              ];
            })}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-[#E3E3E0] bg-[#F3F3EE] font-semibold">
              <td className="px-3 py-2 text-[#6F6F6B]">합계 ({filteredSummaries.length}팀)</td>
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

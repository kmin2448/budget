'use client';

import { useState, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/shared/ConfirmDialog';
import { ChevronRight, Plus, Minus, Trash2, Check, X } from 'lucide-react';
import type { SmallClubTeamInfo } from '@/types';
import type { TeamInfoPayload } from '@/hooks/useSmallClub';

const NO_ADVISOR = '지도교수 미배정';

const EMPTY_PAYLOAD: TeamInfoPayload = {
  teamName: '', advisor: '', topic: '', mentorOrg: '', mentor: '',
  teamLeader: '', teamMembers: '', assistantMentor: '', remarks: '',
  memberList: [],
};

interface EditState {
  advisor: string; topic: string; mentorOrg: string; mentor: string;
  teamLeader: string; teamMembers: string; assistantMentor: string; remarks: string;
  memberList: string[];
}

interface Props {
  teamInfos: SmallClubTeamInfo[];
  onAddTeam: (payload: TeamInfoPayload) => Promise<void>;
  onUpdateTeam: (info: SmallClubTeamInfo) => Promise<void>;
  onDeleteTeam: (rowIndex: number) => Promise<void>;
  isDeleting: boolean;
  advisorOrder?: string[];
}

const DEFAULT_MEMBER_SLOTS = 5;

function toEditState(info: SmallClubTeamInfo): EditState {
  const existing = info.memberList ?? [];
  const memberList = existing.length >= DEFAULT_MEMBER_SLOTS
    ? [...existing]
    : [...existing, ...Array(DEFAULT_MEMBER_SLOTS - existing.length).fill('')];
  return {
    advisor: info.advisor, topic: info.topic, mentorOrg: info.mentorOrg,
    mentor: info.mentor, teamLeader: info.teamLeader, teamMembers: info.teamMembers,
    assistantMentor: info.assistantMentor, remarks: info.remarks,
    memberList,
  };
}

export function SmallClubTeamManageTable({
  teamInfos, onAddTeam, onUpdateTeam, onDeleteTeam, isDeleting, advisorOrder = [],
}: Props) {
  const [openAdvisors, setOpenAdvisors] = useState<Set<string>>(new Set());
  const [openTeamRow,  setOpenTeamRow]  = useState<number | null>(null);
  const [editState,    setEditState]    = useState<EditState | null>(null);
  const [savePending,  setSavePending]  = useState(false);
  const [newTeamName,  setNewTeamName]  = useState('');
  const [addPending,   setAddPending]   = useState(false);
  const [deleteOpen,   setDeleteOpen]   = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<SmallClubTeamInfo | null>(null);

  const advisorGroups = useMemo(() => {
    const map = new Map<string, SmallClubTeamInfo[]>();
    for (const info of teamInfos) {
      const adv = info.advisor?.trim() || NO_ADVISOR;
      if (!map.has(adv)) map.set(adv, []);
      map.get(adv)!.push(info);
    }
    return Array.from(map.entries())
      .sort(([a], [b]) => {
        if (a === NO_ADVISOR) return 1;
        if (b === NO_ADVISOR) return -1;
        return a.localeCompare(b, 'ko');
      })
      .map(([advisor, teams]: [string, SmallClubTeamInfo[]]) => ({ advisor, teams }));
  }, [teamInfos]);

  const orderedAdvisorGroups = useMemo(() => {
    if (advisorOrder.length === 0) return advisorGroups;
    const map = new Map(advisorGroups.map((g) => [g.advisor, g]));
    const ordered = advisorOrder.flatMap((a) => { const g = map.get(a); return g ? [g] : []; });
    const orderedSet = new Set(advisorOrder);
    const remaining = advisorGroups.filter((g) => !orderedSet.has(g.advisor));
    return [...ordered, ...remaining];
  }, [advisorGroups, advisorOrder]);

  function toggleAdvisor(advisor: string) {
    setOpenAdvisors((prev) => {
      const next = new Set(prev);
      if (next.has(advisor)) next.delete(advisor);
      else next.add(advisor);
      return next;
    });
  }

  function openEdit(info: SmallClubTeamInfo) {
    if (openTeamRow === info.rowIndex) {
      setOpenTeamRow(null);
      setEditState(null);
    } else {
      setOpenTeamRow(info.rowIndex);
      setEditState(toEditState(info));
    }
  }

  function cancelEdit() {
    setOpenTeamRow(null);
    setEditState(null);
  }

  async function handleSave(info: SmallClubTeamInfo) {
    if (!editState) return;
    setSavePending(true);
    try {
      await onUpdateTeam({ ...info, ...editState });
      setOpenTeamRow(null);
      setEditState(null);
    } finally {
      setSavePending(false);
    }
  }

  async function handleAdd() {
    const name = newTeamName.trim();
    if (!name) return;
    setAddPending(true);
    try {
      await onAddTeam({ ...EMPTY_PAYLOAD, teamName: name });
      setNewTeamName('');
    } finally {
      setAddPending(false);
    }
  }

  function setField<K extends keyof Omit<EditState, 'memberList'>>(key: K, val: string) {
    setEditState((prev) => (prev ? { ...prev, [key]: val } : prev));
  }

  function setMember(idx: number, val: string) {
    setEditState((prev) => {
      if (!prev) return prev;
      const next = [...prev.memberList];
      next[idx] = val;
      return { ...prev, memberList: next };
    });
  }

  function addMember() {
    setEditState((prev) => (prev ? { ...prev, memberList: [...prev.memberList, ''] } : prev));
  }

  function removeMember(idx: number) {
    setEditState((prev) => {
      if (!prev) return prev;
      const next = prev.memberList.filter((_, i) => i !== idx);
      return { ...prev, memberList: next };
    });
  }

  type StringField = keyof Omit<EditState, 'memberList'>;
  const inp = (key: StringField, label: string, full = false) => (
    <div className={full ? 'col-span-full' : ''}>
      <label className="mb-0.5 block text-[10px] text-[#6F6F6B]">{label}</label>
      <input
        value={editState?.[key] ?? ''}
        onChange={(e) => setField(key, e.target.value)}
        placeholder={label}
        className="w-full rounded border border-[#E3E3E0] px-2 py-1 text-xs focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
      />
    </div>
  );

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <input
          type="text"
          value={newTeamName}
          onChange={(e) => setNewTeamName(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') void handleAdd(); }}
          placeholder="새 소학회명 입력"
          className="h-8 rounded-md border border-[#E3E3E0] px-3 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary w-52"
        />
        <Button
          size="sm"
          onClick={() => void handleAdd()}
          disabled={!newTeamName.trim() || addPending}
          className="gap-1.5 h-8"
        >
          <Plus className="h-3.5 w-3.5" />
          소학회 추가
        </Button>
        <span className="ml-auto text-xs text-gray-400">총 {teamInfos.length}개</span>
      </div>

      {teamInfos.length === 0 ? (
        <div className="rounded-lg border border-[#E3E3E0] bg-white px-4 py-8 text-center text-sm text-gray-400">
          소학회 데이터가 없습니다. 소학회를 추가해 주세요.
        </div>
      ) : (
        <div className="rounded-lg border border-[#E3E3E0] overflow-hidden divide-y divide-[#E3E3E0]">
          {orderedAdvisorGroups.map(({ advisor, teams }) => {
            const isOpen = openAdvisors.has(advisor);

            return (
              <div key={advisor}>
                <button
                  type="button"
                  className="w-full flex items-center gap-2 px-4 py-3 bg-[#EEF3F8] hover:bg-[#E5EDF5] transition-colors text-left"
                  onClick={() => toggleAdvisor(advisor)}
                >
                  <ChevronRight className={`h-3.5 w-3.5 text-[#1F5C99] transition-transform duration-150 ${isOpen ? 'rotate-90' : ''}`} />
                  <span className="font-semibold text-sm text-[#1F5C99]">{advisor}</span>
                  <span className="ml-1 rounded-full bg-[#D6E4F0] px-1.5 py-0.5 text-[11px] font-medium text-[#1F5C99]">
                    {teams.length}개
                  </span>
                </button>

                {isOpen && (
                  <div className="divide-y divide-[#F0F0EE]">
                    {teams.map((info: SmallClubTeamInfo) => {
                      const isEditing = openTeamRow === info.rowIndex;

                      return (
                        <div key={info.rowIndex}>
                          <div
                            className={`flex items-center gap-3 px-5 py-2.5 cursor-pointer transition-colors ${
                              isEditing ? 'bg-primary-bg' : 'bg-white hover:bg-[#F5F9FC]'
                            }`}
                            onClick={() => openEdit(info)}
                          >
                            <ChevronRight className={`h-3 w-3 text-gray-400 shrink-0 transition-transform duration-150 ${isEditing ? 'rotate-90' : ''}`} />

                            <span className={`font-medium text-sm w-28 shrink-0 ${isEditing ? 'text-primary' : 'text-[#131310]'}`}>
                              {info.teamName}
                            </span>

                            <div className="flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-[#6F6F6B] min-w-0">
                              {info.teamLeader && (
                                <span>팀장: <span className="text-[#131310]">{info.teamLeader}</span></span>
                              )}
                              {info.topic && (
                                <span className="truncate max-w-[200px]">주제: <span className="text-[#131310]">{info.topic}</span></span>
                              )}
                              {info.memberList && info.memberList.length > 0 && (
                                <span>팀원 {info.memberList.length}명</span>
                              )}
                            </div>

                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setDeleteTarget(info);
                                setDeleteOpen(true);
                              }}
                              className="ml-auto shrink-0 rounded p-1 text-gray-300 hover:bg-red-50 hover:text-red-500 transition-colors"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>

                          {isEditing && (
                            <div
                              className="bg-[#F8FAFC] border-t border-[#E8EFF5] px-6 py-4 space-y-3"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <p className="text-xs font-semibold text-primary">{info.teamName} — 정보 수정</p>

                              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
                                {inp('advisor', '지도교수')}
                                {inp('teamLeader', '팀장')}
                                {inp('teamMembers', '팀원(합산텍스트)')}
                                {inp('topic', '주제', true)}
                                {inp('remarks', '비고', true)}
                              </div>

                              <div className="space-y-1.5">
                                <div className="flex items-center justify-between">
                                  <p className="text-[10px] font-medium text-[#6F6F6B]">팀원명단 (개별 입력)</p>
                                  <button
                                    type="button"
                                    onClick={addMember}
                                    className="flex items-center gap-1 rounded border border-[#E3E3E0] bg-white px-2 py-0.5 text-[11px] text-[#6F6F6B] hover:border-primary hover:text-primary transition-colors"
                                  >
                                    <Plus className="h-3 w-3" />
                                    팀원 추가
                                  </button>
                                </div>
                                <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3 lg:grid-cols-5">
                                  {(editState?.memberList ?? []).map((m, mi) => (
                                    <div key={mi} className="flex items-center gap-1">
                                      <input
                                        value={m}
                                        onChange={(e) => setMember(mi, e.target.value)}
                                        placeholder={`팀원 ${mi + 1}`}
                                        className="w-full rounded border border-[#E3E3E0] px-2 py-1 text-xs focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                                      />
                                      <button
                                        type="button"
                                        onClick={() => removeMember(mi)}
                                        className="shrink-0 rounded p-1 text-gray-300 hover:bg-red-50 hover:text-red-400 transition-colors"
                                      >
                                        <Minus className="h-3 w-3" />
                                      </button>
                                    </div>
                                  ))}
                                </div>
                              </div>

                              <div className="flex items-center gap-2 pt-1">
                                <button
                                  type="button"
                                  onClick={() => void handleSave(info)}
                                  disabled={savePending}
                                  className="flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-white hover:bg-primary-light transition-colors disabled:opacity-50"
                                >
                                  <Check className="h-3.5 w-3.5" />
                                  저장
                                </button>
                                <button
                                  type="button"
                                  onClick={cancelEdit}
                                  className="flex items-center gap-1.5 rounded-md border border-[#E3E3E0] bg-white px-3 py-1.5 text-xs text-[#6F6F6B] hover:bg-gray-50 transition-colors"
                                >
                                  <X className="h-3.5 w-3.5" />
                                  취소
                                </button>
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      <ConfirmDialog
        open={deleteOpen}
        title="소학회 삭제"
        description={`"${deleteTarget?.teamName}" 소학회를 삭제하시겠습니까? 소학회 정보가 함께 삭제됩니다.`}
        loading={isDeleting}
        onConfirm={() => {
          if (deleteTarget) void onDeleteTeam(deleteTarget.rowIndex);
          setDeleteOpen(false);
          setDeleteTarget(null);
        }}
        onClose={() => { setDeleteOpen(false); setDeleteTarget(null); }}
      />
    </div>
  );
}

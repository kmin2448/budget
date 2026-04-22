'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/shared/ConfirmDialog';
import { Plus, Pencil, Trash2, Check, X } from 'lucide-react';
import type { WeMeetTeamInfo } from '@/types';
import type { TeamInfoPayload } from '@/hooks/useWeMeet';

interface EditState {
  advisor: string;
  topic: string;
  mentorOrg: string;
  mentor: string;
  teamLeader: string;
  teamMembers: string;
  assistantMentor: string;
  remarks: string;
}

interface Props {
  teamInfos: WeMeetTeamInfo[];
  onAddTeam: (payload: TeamInfoPayload) => Promise<void>;
  onUpdateTeam: (info: WeMeetTeamInfo) => Promise<void>;
  onDeleteTeam: (rowIndex: number) => Promise<void>;
  isDeleting: boolean;
}

function toEditState(info: WeMeetTeamInfo): EditState {
  return {
    advisor:         info.advisor,
    topic:           info.topic,
    mentorOrg:       info.mentorOrg,
    mentor:          info.mentor,
    teamLeader:      info.teamLeader,
    teamMembers:     info.teamMembers,
    assistantMentor: info.assistantMentor,
    remarks:         info.remarks,
  };
}

export function WeMeetTeamManageTable({
  teamInfos, onAddTeam, onUpdateTeam, onDeleteTeam,
  isDeleting,
}: Props) {
  const [editingRowIndex, setEditingRowIndex] = useState<number | null>(null);
  const [editState, setEditState]             = useState<EditState | null>(null);
  const [newTeamName, setNewTeamName]         = useState('');
  const [deleteOpen, setDeleteOpen]           = useState(false);
  const [deleteTarget, setDeleteTarget]       = useState<WeMeetTeamInfo | null>(null);
  const [savePending, setSavePending]         = useState(false);
  const [addPending, setAddPending]           = useState(false);

  function startEdit(info: WeMeetTeamInfo) {
    setEditingRowIndex(info.rowIndex);
    setEditState(toEditState(info));
  }

  function cancelEdit() {
    setEditingRowIndex(null);
    setEditState(null);
  }

  async function handleSave(info: WeMeetTeamInfo) {
    if (!editState) return;
    setSavePending(true);
    try {
      await onUpdateTeam({ ...info, ...editState });
      setEditingRowIndex(null);
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
      await onAddTeam({
        teamName: name, advisor: '', topic: '', mentorOrg: '', mentor: '',
        teamLeader: '', teamMembers: '', assistantMentor: '', remarks: '',
      });
      setNewTeamName('');
    } finally {
      setAddPending(false);
    }
  }

  function setField(key: keyof EditState, value: string) {
    setEditState((prev) => prev ? { ...prev, [key]: value } : prev);
  }

  const fieldInput = (key: keyof EditState, placeholder: string) => (
    <input
      value={editState?.[key] ?? ''}
      onChange={(e) => setField(key, e.target.value)}
      placeholder={placeholder}
      className="w-full min-w-[80px] rounded border border-[#E3E3E0] px-2 py-1 text-xs focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
    />
  );

  return (
    <div className="space-y-3">
      {/* 추가 행 */}
      <div className="flex items-center gap-2">
        <input
          type="text"
          value={newTeamName}
          onChange={(e) => setNewTeamName(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') handleAdd(); }}
          placeholder="새 팀명 입력"
          className="h-8 rounded-md border border-[#E3E3E0] px-3 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary w-48"
        />
        <Button
          size="sm"
          onClick={handleAdd}
          disabled={!newTeamName.trim() || addPending}
          className="gap-1.5 h-8"
        >
          <Plus className="h-3.5 w-3.5" />
          팀 추가
        </Button>
      </div>

      {/* 테이블 */}
      <div className="overflow-x-auto rounded-lg border border-[#E3E3E0]">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="bg-[#F3F3EE]">
              <th className="px-3 py-2.5 text-left font-medium text-[#6F6F6B] whitespace-nowrap">팀명</th>
              <th className="px-3 py-2.5 text-left font-medium text-[#6F6F6B] whitespace-nowrap">지도교수</th>
              <th className="px-3 py-2.5 text-left font-medium text-[#6F6F6B] whitespace-nowrap">주제</th>
              <th className="px-3 py-2.5 text-left font-medium text-[#6F6F6B] whitespace-nowrap">멘토소속</th>
              <th className="px-3 py-2.5 text-left font-medium text-[#6F6F6B] whitespace-nowrap">멘토</th>
              <th className="px-3 py-2.5 text-left font-medium text-[#6F6F6B] whitespace-nowrap">보조멘토</th>
              <th className="px-3 py-2.5 text-left font-medium text-[#6F6F6B] whitespace-nowrap">팀장</th>
              <th className="px-3 py-2.5 text-left font-medium text-[#6F6F6B] whitespace-nowrap">팀원</th>
              <th className="px-3 py-2.5 text-left font-medium text-[#6F6F6B] whitespace-nowrap">비고</th>
              <th className="px-3 py-2.5 text-center font-medium text-[#6F6F6B]"></th>
            </tr>
          </thead>
          <tbody>
            {teamInfos.length === 0 ? (
              <tr>
                <td colSpan={10} className="py-10 text-center text-sm text-gray-400">
                  팀 데이터가 없습니다. 팀을 추가해 주세요.
                </td>
              </tr>
            ) : (
              teamInfos.map((info, idx) => {
                const isEditing = editingRowIndex === info.rowIndex;
                const rowBg     = idx % 2 === 0 ? 'bg-white' : 'bg-[#F5F9FC]';

                return (
                  <tr key={info.rowIndex} className={rowBg}>
                    <td className="px-3 py-2 font-medium text-[#131310] whitespace-nowrap">
                      {info.teamName}
                    </td>

                    {isEditing ? (
                      <>
                        <td className="px-2 py-1.5">{fieldInput('advisor', '지도교수')}</td>
                        <td className="px-2 py-1.5">{fieldInput('topic', '주제')}</td>
                        <td className="px-2 py-1.5">{fieldInput('mentorOrg', '멘토소속')}</td>
                        <td className="px-2 py-1.5">{fieldInput('mentor', '멘토')}</td>
                        <td className="px-2 py-1.5">{fieldInput('assistantMentor', '보조멘토')}</td>
                        <td className="px-2 py-1.5">{fieldInput('teamLeader', '팀장')}</td>
                        <td className="px-2 py-1.5">{fieldInput('teamMembers', '팀원')}</td>
                        <td className="px-2 py-1.5">{fieldInput('remarks', '비고')}</td>
                        <td className="px-2 py-1.5">
                          <div className="flex items-center gap-1">
                            <button
                              onClick={() => handleSave(info)}
                              disabled={savePending}
                              title="저장"
                              className="rounded p-1 text-white bg-primary hover:bg-primary-light transition-colors disabled:opacity-50"
                            >
                              <Check className="h-3.5 w-3.5" />
                            </button>
                            <button
                              onClick={cancelEdit}
                              title="취소"
                              className="rounded p-1 text-gray-500 hover:bg-gray-100 transition-colors"
                            >
                              <X className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </td>
                      </>
                    ) : (
                      <>
                        <td className="px-3 py-2 text-[#131310] whitespace-nowrap">{info.advisor || <span className="text-gray-300">—</span>}</td>
                        <td className="px-3 py-2 text-[#131310] max-w-[150px]">
                          <div className="truncate">{info.topic || <span className="text-gray-300">—</span>}</div>
                        </td>
                        <td className="px-3 py-2 text-[#131310] whitespace-nowrap">{info.mentorOrg || <span className="text-gray-300">—</span>}</td>
                        <td className="px-3 py-2 text-[#131310] whitespace-nowrap">{info.mentor || <span className="text-gray-300">—</span>}</td>
                        <td className="px-3 py-2 text-[#131310] whitespace-nowrap">{info.assistantMentor || <span className="text-gray-300">—</span>}</td>
                        <td className="px-3 py-2 text-[#131310] whitespace-nowrap">{info.teamLeader || <span className="text-gray-300">—</span>}</td>
                        <td className="px-3 py-2 text-[#131310] max-w-[150px]">
                          <div className="truncate">{info.teamMembers || <span className="text-gray-300">—</span>}</div>
                        </td>
                        <td className="px-3 py-2 text-[#131310] max-w-[120px]">
                          <div className="truncate">{info.remarks || <span className="text-gray-300">—</span>}</div>
                        </td>
                        <td className="px-3 py-2">
                          <div className="flex items-center justify-end gap-1">
                            <button
                              onClick={() => startEdit(info)}
                              title="수정"
                              className="rounded p-1 text-gray-400 hover:bg-blue-50 hover:text-blue-500 transition-colors"
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </button>
                            <button
                              onClick={() => { setDeleteTarget(info); setDeleteOpen(true); }}
                              title="삭제"
                              className="rounded p-1 text-gray-400 hover:bg-red-50 hover:text-red-500 transition-colors"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </td>
                      </>
                    )}
                  </tr>
                );
              })
            )}
          </tbody>
          <tfoot>
            <tr className="border-t border-[#E3E3E0] bg-[#F3F3EE]">
              <td colSpan={10} className="px-3 py-2 text-xs text-[#6F6F6B]">
                총 {teamInfos.length}팀
              </td>
            </tr>
          </tfoot>
        </table>
      </div>

      <ConfirmDialog
        open={deleteOpen}
        title="팀 삭제"
        description={`"${deleteTarget?.teamName}" 팀을 삭제하시겠습니까? 팀 정보와 배정예산 정보가 함께 삭제됩니다.`}
        loading={isDeleting}
        onConfirm={() => {
          if (deleteTarget) onDeleteTeam(deleteTarget.rowIndex);
          setDeleteOpen(false);
          setDeleteTarget(null);
        }}
        onClose={() => { setDeleteOpen(false); setDeleteTarget(null); }}
      />
    </div>
  );
}

'use client';

import { useState } from 'react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Trash2, Plus, Users, Save } from 'lucide-react';
import { ConfirmDialog } from '@/components/shared/ConfirmDialog';
import { WEMEET_MAX_TEAMS } from '@/constants/wemeet';
import type { WeMeetTeamInfo } from '@/types';

interface Team {
  teamName: string;
  rowIndex: number;
}

type TeamInfoPayload = Omit<WeMeetTeamInfo, 'rowIndex'>;

const EMPTY_INFO: TeamInfoPayload = {
  teamName: '', advisor: '', topic: '', mentorOrg: '',
  mentor: '', teamLeader: '', teamMembers: '', assistantMentor: '', remarks: '',
};

const INFO_FIELDS: [string, keyof TeamInfoPayload][] = [
  ['지도교수', 'advisor'],
  ['멘토소속', 'mentorOrg'],
  ['멘토', 'mentor'],
  ['보조멘토', 'assistantMentor'],
  ['팀장', 'teamLeader'],
];

interface Props {
  open: boolean;
  teams: Team[];
  teamInfos: WeMeetTeamInfo[];
  onClose: () => void;
  onAddTeam: (name: string) => Promise<void>;
  onDeleteTeam: (rowIndex: number) => Promise<void>;
  onAddTeamInfo: (payload: TeamInfoPayload) => Promise<void>;
  onUpdateTeamInfo: (payload: WeMeetTeamInfo) => Promise<void>;
  isAdding: boolean;
  isDeleting: boolean;
  isUpdating: boolean;
}

type TabKey = 'list' | 'info';

export function WeMeetTeamManager({
  open, teams, teamInfos, onClose,
  onAddTeam, onDeleteTeam, onAddTeamInfo, onUpdateTeamInfo,
  isAdding, isDeleting, isUpdating,
}: Props) {
  const [activeTab, setActiveTab]         = useState<TabKey>('list');

  // 팀 목록 탭
  const [newTeamName, setNewTeamName]     = useState('');
  const [addError, setAddError]           = useState('');
  const [deleteOpen, setDeleteOpen]       = useState(false);
  const [deleteTarget, setDeleteTarget]   = useState<Team | null>(null);

  // 팀 정보 탭
  const [selectedTeam, setSelectedTeam]   = useState<Team | null>(null);
  const [editForm, setEditForm]           = useState<TeamInfoPayload>(EMPTY_INFO);
  const [editError, setEditError]         = useState('');
  const [savedMsg, setSavedMsg]           = useState(false);

  const isFull = teams.length >= WEMEET_MAX_TEAMS;

  /* ── 팀 목록 탭 핸들러 ── */
  async function handleAdd() {
    if (!newTeamName.trim()) { setAddError('팀명을 입력해주세요.'); return; }
    setAddError('');
    try {
      await onAddTeam(newTeamName.trim());
      setNewTeamName('');
    } catch (err) {
      setAddError(err instanceof Error ? err.message : '추가 실패');
    }
  }

  /* ── 팀 정보 탭 핸들러 ── */
  function selectTeamForEdit(team: Team) {
    const existing = teamInfos.find((t) => t.teamName === team.teamName);
    setEditForm(existing ? { ...existing } : { ...EMPTY_INFO, teamName: team.teamName });
    setEditError('');
    setSavedMsg(false);
    setSelectedTeam(team);
  }

  function handleField(key: keyof TeamInfoPayload, value: string) {
    setEditForm((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSave() {
    setEditError('');
    try {
      const existing = teamInfos.find((t) => t.teamName === selectedTeam!.teamName);
      if (existing) {
        await onUpdateTeamInfo({ ...editForm, rowIndex: existing.rowIndex });
      } else {
        await onAddTeamInfo({ ...editForm, teamName: selectedTeam!.teamName });
      }
      setSavedMsg(true);
      setTimeout(() => setSavedMsg(false), 2000);
    } catch (err) {
      setEditError(err instanceof Error ? err.message : '저장 실패');
    }
  }

  function handleClose() {
    onClose();
    setActiveTab('list');
    setSelectedTeam(null);
    setEditForm(EMPTY_INFO);
    setNewTeamName('');
    setAddError('');
  }

  const TABS: { key: TabKey; label: string }[] = [
    { key: 'list', label: '팀 목록' },
    { key: 'info', label: '팀 정보' },
  ];

  return (
    <>
      <Dialog open={open} onOpenChange={(v) => { if (!v) handleClose(); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Users className="h-4 w-4 text-primary" />
              팀 관리
            </DialogTitle>
          </DialogHeader>

          {/* 탭 헤더 */}
          <div className="flex border-b border-[#E3E3E0] -mx-6 px-6">
            {TABS.map((tab) => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={[
                  'px-4 py-2 text-sm font-medium border-b-2 transition-colors',
                  activeTab === tab.key
                    ? 'border-primary text-primary'
                    : 'border-transparent text-[#6F6F6B] hover:text-[#131310]',
                ].join(' ')}
              >
                {tab.label}
                {tab.key === 'info' && (
                  <span className={[
                    'ml-1.5 rounded-full px-1.5 py-0.5 text-[10px] font-medium',
                    activeTab === tab.key ? 'bg-primary/10 text-primary' : 'bg-[#EBEBEA] text-[#6F6F6B]',
                  ].join(' ')}>
                    {teamInfos.length}
                  </span>
                )}
              </button>
            ))}
          </div>

          {/* ── 팀 목록 탭 ── */}
          {activeTab === 'list' && (
            <div className="space-y-4 pt-1">
              <div className="max-h-64 overflow-y-auto rounded-lg border border-[#E3E3E0]">
                {teams.length === 0 ? (
                  <p className="py-6 text-center text-sm text-gray-400">등록된 팀이 없습니다.</p>
                ) : (
                  <ul className="divide-y divide-[#F0F0EE]">
                    {teams.map((t) => (
                      <li key={t.rowIndex} className="flex items-center justify-between px-3 py-2">
                        <span className="text-sm text-[#131310]">{t.teamName}</span>
                        <button
                          onClick={() => { setDeleteTarget(t); setDeleteOpen(true); }}
                          disabled={isDeleting}
                          className="rounded p-1 text-gray-400 hover:bg-red-50 hover:text-red-500 transition-colors disabled:opacity-40"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              <p className="text-xs text-gray-400 text-right">{teams.length} / {WEMEET_MAX_TEAMS}팀</p>

              <div className="space-y-1.5">
                {addError && <p className="text-xs text-red-500">{addError}</p>}
                <div className="flex gap-2">
                  <Input
                    value={newTeamName}
                    onChange={(e) => setNewTeamName(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') handleAdd(); }}
                    placeholder="새 팀명 입력"
                    disabled={isFull || isAdding}
                    className="h-8 text-sm"
                  />
                  <Button
                    size="sm"
                    onClick={handleAdd}
                    disabled={isFull || isAdding}
                    className="h-8 gap-1 shrink-0"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    추가
                  </Button>
                </div>
                {isFull && (
                  <p className="text-xs text-amber-600">최대 {WEMEET_MAX_TEAMS}팀까지 추가할 수 있습니다.</p>
                )}
              </div>
            </div>
          )}

          {/* ── 팀 정보 탭 ── */}
          {activeTab === 'info' && (
            <div className="space-y-3 pt-1">
              {/* 팀 선택 드롭다운 */}
              <div className="flex items-center gap-2">
                <label className="shrink-0 text-xs font-medium text-[#6F6F6B]">팀 선택</label>
                <select
                  value={selectedTeam?.teamName ?? ''}
                  onChange={(e) => {
                    const found = teams.find((t) => t.teamName === e.target.value);
                    if (found) selectTeamForEdit(found);
                  }}
                  className="flex-1 h-8 rounded border border-[#E3E3E0] bg-white px-2 text-sm text-[#131310] focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary/30"
                >
                  <option value="">팀을 선택하세요</option>
                  {teams.map((t) => {
                    const hasInfo = teamInfos.some((ti) => ti.teamName === t.teamName);
                    return (
                      <option key={t.rowIndex} value={t.teamName}>
                        {t.teamName}{hasInfo ? ' ✓' : ''}
                      </option>
                    );
                  })}
                </select>
              </div>

              {/* 편집 폼 */}
              {selectedTeam ? (
                <>
                  <div className="grid grid-cols-2 gap-x-3 gap-y-2.5">
                    {INFO_FIELDS.map(([label, key]) => (
                      <div key={key} className="space-y-1">
                        <label className="text-xs font-medium text-[#6F6F6B]">{label}</label>
                        <Input
                          value={editForm[key] as string}
                          onChange={(e) => handleField(key, e.target.value)}
                          disabled={isUpdating}
                          className="h-8 text-sm"
                          placeholder={label}
                        />
                      </div>
                    ))}
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs font-medium text-[#6F6F6B]">주제</label>
                    <Input
                      value={editForm.topic}
                      onChange={(e) => handleField('topic', e.target.value)}
                      disabled={isUpdating}
                      className="h-8 text-sm"
                      placeholder="프로젝트 주제"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs font-medium text-[#6F6F6B]">팀원</label>
                    <Input
                      value={editForm.teamMembers}
                      onChange={(e) => handleField('teamMembers', e.target.value)}
                      disabled={isUpdating}
                      className="h-8 text-sm"
                      placeholder="팀원 명단 (쉼표로 구분)"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs font-medium text-[#6F6F6B]">비고</label>
                    <textarea
                      value={editForm.remarks}
                      onChange={(e) => handleField('remarks', e.target.value)}
                      disabled={isUpdating}
                      rows={2}
                      placeholder="비고"
                      className="w-full resize-none rounded border border-[#E3E3E0] px-2 py-1.5 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary disabled:bg-[#F3F3EE] transition-colors"
                    />
                  </div>

                  {editError && <p className="text-xs text-red-500">{editError}</p>}

                  <div className="flex items-center justify-end gap-2 pt-1">
                    {savedMsg && (
                      <span className="text-xs text-complete">저장되었습니다.</span>
                    )}
                    <Button
                      size="sm"
                      onClick={handleSave}
                      disabled={isUpdating}
                      className="gap-1.5"
                    >
                      <Save className="h-3.5 w-3.5" />
                      {isUpdating ? '저장 중...' : '저장'}
                    </Button>
                  </div>
                </>
              ) : (
                <div className="rounded-lg border border-dashed border-[#E3E3E0] py-10 text-center text-sm text-gray-400">
                  위에서 팀을 선택하면 정보를 입력할 수 있습니다.
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={deleteOpen}
        title="팀 삭제"
        description={`"${deleteTarget?.teamName}" 팀을 삭제하시겠습니까? 팀별취합 목록에서 제거됩니다.`}
        loading={isDeleting}
        onConfirm={async () => {
          if (deleteTarget) await onDeleteTeam(deleteTarget.rowIndex);
          setDeleteOpen(false);
          setDeleteTarget(null);
        }}
        onClose={() => { setDeleteOpen(false); setDeleteTarget(null); }}
      />
    </>
  );
}

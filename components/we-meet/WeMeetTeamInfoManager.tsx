'use client';

import { useState } from 'react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Pencil, Trash2, Plus, ClipboardList, X, Save } from 'lucide-react';
import { ConfirmDialog } from '@/components/shared/ConfirmDialog';
import type { WeMeetTeamInfo } from '@/types';
import type { TeamInfoPayload } from '@/hooks/useWeMeet';

interface Props {
  open: boolean;
  teamInfos: WeMeetTeamInfo[];
  availableTeams: string[]; // 팀별취합 시트의 팀명 목록
  onClose: () => void;
  onAdd: (payload: TeamInfoPayload) => Promise<void>;
  onUpdate: (payload: WeMeetTeamInfo) => Promise<void>;
  onDelete: (rowIndex: number) => Promise<void>;
  isAdding: boolean;
  isUpdating: boolean;
  isDeleting: boolean;
}

const EMPTY_FORM: TeamInfoPayload = {
  teamName: '',
  advisor: '',
  topic: '',
  mentorOrg: '',
  mentor: '',
  teamLeader: '',
  teamMembers: '',
  assistantMentor: '',
  remarks: '',
};

interface FormState extends TeamInfoPayload {
  rowIndex?: number; // undefined = 신규
}

export function WeMeetTeamInfoManager({
  open, teamInfos, availableTeams, onClose,
  onAdd, onUpdate, onDelete,
  isAdding, isUpdating, isDeleting,
}: Props) {
  const [formOpen, setFormOpen]       = useState(false);
  const [formMode, setFormMode]       = useState<'add' | 'edit'>('add');
  const [formData, setFormData]       = useState<FormState>(EMPTY_FORM);
  const [formError, setFormError]     = useState('');
  const [deleteOpen, setDeleteOpen]   = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<WeMeetTeamInfo | null>(null);

  const isPending = isAdding || isUpdating;

  function openAddForm() {
    setFormMode('add');
    setFormData(EMPTY_FORM);
    setFormError('');
    setFormOpen(true);
  }

  function openEditForm(info: WeMeetTeamInfo) {
    setFormMode('edit');
    setFormData({ ...info });
    setFormError('');
    setFormOpen(true);
  }

  function handleField(key: keyof TeamInfoPayload, value: string | null) {
    setFormData((prev) => ({ ...prev, [key]: value ?? '' }));
  }

  async function handleSubmit() {
    if (!formData.teamName.trim()) {
      setFormError('팀명을 선택해주세요.');
      return;
    }
    setFormError('');
    try {
      if (formMode === 'add') {
        await onAdd(formData);
      } else if (formData.rowIndex !== undefined) {
        await onUpdate({ ...formData, rowIndex: formData.rowIndex } as WeMeetTeamInfo);
      }
      setFormOpen(false);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : '저장 실패');
    }
  }

  return (
    <>
      {/* 팀정보 목록 다이얼로그 */}
      <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
        <DialogContent className="max-w-4xl max-h-[85vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ClipboardList className="h-4 w-4 text-primary" />
              팀 정보 관리
            </DialogTitle>
          </DialogHeader>

          <div className="flex-1 overflow-auto space-y-3 py-1">
            {/* 추가 버튼 */}
            <div className="flex justify-end">
              <Button size="sm" onClick={openAddForm} className="gap-1.5">
                <Plus className="h-3.5 w-3.5" />
                팀 정보 추가
              </Button>
            </div>

            {/* 팀정보 테이블 */}
            {teamInfos.length === 0 ? (
              <div className="rounded-lg border border-dashed border-[#E3E3E0] py-12 text-center text-sm text-gray-400">
                등록된 팀 정보가 없습니다.
              </div>
            ) : (
              <div className="rounded-lg border border-[#E3E3E0] overflow-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-[#F8F8F5] border-b border-[#E3E3E0]">
                      {['팀명', '지도교수', '주제', '멘토소속', '멘토', '팀장', '팀원', '보조멘토', ''].map((h) => (
                        <th
                          key={h}
                          className="px-3 py-2 text-left text-xs font-medium text-[#6F6F6B] whitespace-nowrap"
                        >
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#F0F0EE]">
                    {teamInfos.map((info) => (
                      <tr key={info.rowIndex} className="hover:bg-[#FAFAF7] transition-colors">
                        <td className="px-3 py-2 font-medium text-[#131310] whitespace-nowrap">{info.teamName}</td>
                        <td className="px-3 py-2 text-[#6F6F6B] whitespace-nowrap">{info.advisor || '-'}</td>
                        <td className="px-3 py-2 text-[#6F6F6B] max-w-[160px] truncate" title={info.topic}>{info.topic || '-'}</td>
                        <td className="px-3 py-2 text-[#6F6F6B] whitespace-nowrap">{info.mentorOrg || '-'}</td>
                        <td className="px-3 py-2 text-[#6F6F6B] whitespace-nowrap">{info.mentor || '-'}</td>
                        <td className="px-3 py-2 text-[#6F6F6B] whitespace-nowrap">{info.teamLeader || '-'}</td>
                        <td className="px-3 py-2 text-[#6F6F6B] max-w-[120px] truncate" title={info.teamMembers}>{info.teamMembers || '-'}</td>
                        <td className="px-3 py-2 text-[#6F6F6B] whitespace-nowrap">{info.assistantMentor || '-'}</td>
                        <td className="px-3 py-2">
                          <div className="flex items-center gap-1">
                            <button
                              onClick={() => openEditForm(info)}
                              className="rounded p-1 text-gray-400 hover:bg-blue-50 hover:text-blue-500 transition-colors"
                              title="수정"
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </button>
                            <button
                              onClick={() => { setDeleteTarget(info); setDeleteOpen(true); }}
                              disabled={isDeleting}
                              className="rounded p-1 text-gray-400 hover:bg-red-50 hover:text-red-500 transition-colors disabled:opacity-40"
                              title="삭제"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* 추가/수정 폼 다이얼로그 */}
      <Dialog open={formOpen} onOpenChange={(v) => { if (!v && !isPending) setFormOpen(false); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {formMode === 'add' ? <Plus className="h-4 w-4 text-primary" /> : <Pencil className="h-4 w-4 text-primary" />}
              팀 정보 {formMode === 'add' ? '추가' : '수정'}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-3 py-1">
            {/* 팀명 선택 */}
            <div className="space-y-1">
              <label className="text-xs font-medium text-[#6F6F6B]">
                팀명 <span className="text-red-400">*</span>
              </label>
              <Select
                value={formData.teamName ?? ''}
                onValueChange={(v) => handleField('teamName', v)}
                disabled={isPending}
              >
                <SelectTrigger className="h-8 text-sm">
                  <SelectValue placeholder="팀을 선택하세요" />
                </SelectTrigger>
                <SelectContent>
                  {availableTeams.map((t) => (
                    <SelectItem key={t} value={t}>{t}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* 2열 그리드 필드 */}
            <div className="grid grid-cols-2 gap-3">
              {([
                ['지도교수', 'advisor'],
                ['멘토소속', 'mentorOrg'],
                ['멘토', 'mentor'],
                ['보조멘토', 'assistantMentor'],
                ['팀장', 'teamLeader'],
              ] as [string, keyof TeamInfoPayload][]).map(([label, key]) => (
                <div key={key} className="space-y-1">
                  <label className="text-xs font-medium text-[#6F6F6B]">{label}</label>
                  <Input
                    value={formData[key] as string}
                    onChange={(e) => handleField(key, e.target.value)}
                    disabled={isPending}
                    className="h-8 text-sm"
                    placeholder={label}
                  />
                </div>
              ))}
            </div>

            {/* 주제 (full width) */}
            <div className="space-y-1">
              <label className="text-xs font-medium text-[#6F6F6B]">주제</label>
              <Input
                value={formData.topic}
                onChange={(e) => handleField('topic', e.target.value)}
                disabled={isPending}
                className="h-8 text-sm"
                placeholder="프로젝트 주제"
              />
            </div>

            {/* 팀원 (full width) */}
            <div className="space-y-1">
              <label className="text-xs font-medium text-[#6F6F6B]">팀원</label>
              <Input
                value={formData.teamMembers}
                onChange={(e) => handleField('teamMembers', e.target.value)}
                disabled={isPending}
                className="h-8 text-sm"
                placeholder="팀원 명단 (쉼표로 구분)"
              />
            </div>

            {formError && (
              <p className="text-xs text-red-500">{formError}</p>
            )}

            <div className="flex justify-end gap-2 pt-1">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setFormOpen(false)}
                disabled={isPending}
                className="gap-1"
              >
                <X className="h-3.5 w-3.5" />
                취소
              </Button>
              <Button
                size="sm"
                onClick={handleSubmit}
                disabled={isPending}
                className="gap-1"
              >
                <Save className="h-3.5 w-3.5" />
                {isPending ? '저장 중...' : '저장'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* 삭제 확인 */}
      <ConfirmDialog
        open={deleteOpen}
        title="팀 정보 삭제"
        description={`"${deleteTarget?.teamName}" 팀의 정보를 삭제하시겠습니까?`}
        loading={isDeleting}
        onConfirm={async () => {
          if (deleteTarget) await onDelete(deleteTarget.rowIndex);
          setDeleteOpen(false);
          setDeleteTarget(null);
        }}
        onClose={() => { setDeleteOpen(false); setDeleteTarget(null); }}
      />
    </>
  );
}

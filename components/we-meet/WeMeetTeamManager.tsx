'use client';

import { useState } from 'react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Trash2, Plus, Users } from 'lucide-react';
import { ConfirmDialog } from '@/components/shared/ConfirmDialog';
import { WEMEET_MAX_TEAMS } from '@/constants/wemeet';

interface Team {
  teamName: string;
  rowIndex: number;
}

interface Props {
  open: boolean;
  teams: Team[];
  onClose: () => void;
  onAddTeam: (name: string) => Promise<void>;
  onDeleteTeam: (rowIndex: number) => Promise<void>;
  isAdding: boolean;
  isDeleting: boolean;
}

export function WeMeetTeamManager({
  open, teams, onClose, onAddTeam, onDeleteTeam, isAdding, isDeleting,
}: Props) {
  const [newTeamName, setNewTeamName] = useState('');
  const [addError, setAddError]       = useState('');
  const [deleteOpen, setDeleteOpen]   = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Team | null>(null);

  const isFull = teams.length >= WEMEET_MAX_TEAMS;

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

  return (
    <>
      <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Users className="h-4 w-4 text-primary" />
              팀 관리
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-1">
            {/* 팀 목록 */}
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

            {/* 팀 추가 */}
            <div className="space-y-1.5">
              {addError && (
                <p className="text-xs text-red-500">{addError}</p>
              )}
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

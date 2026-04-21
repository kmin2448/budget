'use client';

import { useState } from 'react';
import { useSession } from 'next-auth/react';
import { Button } from '@/components/ui/button';
import { RefreshCw, Users } from 'lucide-react';
import { WeMeetSummaryTable } from '@/components/we-meet/WeMeetSummaryTable';
import { WeMeetTable } from '@/components/we-meet/WeMeetTable';
import { WeMeetRowForm } from '@/components/we-meet/WeMeetRowForm';
import { WeMeetTeamManager } from '@/components/we-meet/WeMeetTeamManager';
import { WeMeetAllPdfReport, WeMeetTeamPdfReport } from '@/components/we-meet/WeMeetPdfReport';
import { WeMeetSendModal } from '@/components/we-meet/WeMeetSendModal';
import {
  useWeMeetExecutions,
  useWeMeetSummary,
  useAddWeMeetExecution,
  useUpdateWeMeetExecution,
  useDeleteWeMeetExecution,
  useAddWeMeetTeam,
  useDeleteWeMeetTeam,
  type ExecutionPayload,
} from '@/hooks/useWeMeet';
import type { WeMeetExecution } from '@/types';

export default function WeMeetPage() {
  const { data: session } = useSession();
  const userRole = (session?.user as { role?: string } | undefined)?.role;
  const canWrite = userRole === 'super_admin' || userRole === 'admin';

  const { data, isLoading, isError, error, refetch } = useWeMeetExecutions();
  const { data: summaries = [], isLoading: isSummaryLoading, refetch: refetchSummary } = useWeMeetSummary();

  const addMutation        = useAddWeMeetExecution();
  const updateMutation     = useUpdateWeMeetExecution();
  const deleteMutation     = useDeleteWeMeetExecution();
  const addTeamMutation    = useAddWeMeetTeam();
  const deleteTeamMutation = useDeleteWeMeetTeam();

  const [selectedTeam, setSelectedTeam]       = useState<string | null>(null);
  const [formOpen, setFormOpen]               = useState(false);
  const [formMode, setFormMode]               = useState<'add' | 'edit'>('add');
  const [editTarget, setEditTarget]           = useState<WeMeetExecution | undefined>();
  const [teamManagerOpen, setTeamManagerOpen] = useState(false);
  const [sendTarget, setSendTarget]           = useState<WeMeetExecution | null>(null);

  const executions = data?.executions ?? [];
  const teams      = data?.teams ?? [];

  const teamsWithIndex = teams.map((name, i) => ({ teamName: name, rowIndex: i + 3 }));

  const selectedSummary = selectedTeam
    ? summaries.find((s) => s.teamName === selectedTeam)
    : undefined;

  function handleAdd() {
    setFormMode('add');
    setEditTarget(undefined);
    setFormOpen(true);
  }

  function handleEdit(row: WeMeetExecution) {
    setFormMode('edit');
    setEditTarget(row);
    setFormOpen(true);
  }

  async function handleFormSubmit(payload: ExecutionPayload) {
    if (formMode === 'add') {
      await addMutation.mutateAsync(payload);
    } else if (editTarget) {
      await updateMutation.mutateAsync({ ...payload, rowIndex: editTarget.rowIndex });
    }
  }

  async function handleToggleConfirmed(row: WeMeetExecution) {
    await updateMutation.mutateAsync({
      rowIndex:        row.rowIndex,
      usageType:       row.usageType,
      teamName:        row.teamName,
      plannedAmount:   row.plannedAmount,
      confirmed:       !row.confirmed,
      confirmedAmount: row.confirmedAmount,
      description:     row.description,
    });
  }

  async function handleDelete(row: WeMeetExecution) {
    await deleteMutation.mutateAsync(row.rowIndex);
  }

  function handleRefresh() {
    refetch();
    refetchSummary();
  }

  return (
    <div className="space-y-5">
      {/* 페이지 헤더 */}
      <div className="flex items-center justify-between">
        <div className="flex items-baseline gap-2">
          <h1 className="text-2xl font-semibold text-[#131310] tracking-tight">WE-Meet 지원</h1>
          <span className="text-sm text-gray-400">프로젝트 수행팀 예산 지원관리</span>
        </div>
        <div className="flex items-center gap-2">
          {canWrite && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setTeamManagerOpen(true)}
              className="gap-1.5 text-gray-600"
            >
              <Users className="h-3.5 w-3.5" />
              팀 관리
            </Button>
          )}
          {!isSummaryLoading && <WeMeetAllPdfReport summaries={summaries} />}
          <Button
            variant="outline"
            size="sm"
            onClick={handleRefresh}
            disabled={isLoading}
            className="gap-1.5 text-gray-600"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${isLoading ? 'animate-spin' : ''}`} />
            새로고침
          </Button>
        </div>
      </div>

      {/* 에러 */}
      {isError && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error instanceof Error ? error.message : '데이터를 불러오지 못했습니다.'}
        </div>
      )}

      {/* 팀별 예산 현황 테이블 */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-medium text-[#6F6F6B]">
            팀별 예산 현황
            <span className="ml-1.5 text-xs text-gray-400">팀 행 클릭 시 아래 집행현황 필터</span>
          </h2>
          {selectedTeam && selectedSummary && (
            <WeMeetTeamPdfReport
              teamName={selectedTeam}
              summary={selectedSummary}
              executions={executions}
            />
          )}
        </div>
        {isSummaryLoading ? (
          <div className="h-40 animate-pulse rounded-lg bg-[#F3F3EE]" />
        ) : (
          <WeMeetSummaryTable
            summaries={summaries}
            selectedTeam={selectedTeam}
            onSelectTeam={setSelectedTeam}
          />
        )}
      </div>

      {/* 집행현황 테이블 */}
      {isLoading ? (
        <div className="h-64 animate-pulse rounded-lg bg-[#F3F3EE]" />
      ) : (
        <WeMeetTable
          rows={executions}
          teams={teams}
          canWrite={canWrite}
          selectedTeam={selectedTeam}
          onSelectTeam={setSelectedTeam}
          onAdd={handleAdd}
          onEdit={handleEdit}
          onDelete={handleDelete}
          onToggleConfirmed={handleToggleConfirmed}
          onSendToExpenditure={(row) => setSendTarget(row)}
          isToggling={updateMutation.isPending}
        />
      )}

      {/* 행 추가/수정 모달 */}
      <WeMeetRowForm
        open={formOpen}
        mode={formMode}
        teams={teams}
        initialData={editTarget}
        onClose={() => setFormOpen(false)}
        onSubmit={handleFormSubmit}
        isPending={addMutation.isPending || updateMutation.isPending}
      />

      {/* 팀 관리 모달 */}
      <WeMeetTeamManager
        open={teamManagerOpen}
        teams={teamsWithIndex}
        onClose={() => setTeamManagerOpen(false)}
        onAddTeam={addTeamMutation.mutateAsync}
        onDeleteTeam={deleteTeamMutation.mutateAsync}
        isAdding={addTeamMutation.isPending}
        isDeleting={deleteTeamMutation.isPending}
      />

      {/* 비목별 집행내역 전송 모달 */}
      <WeMeetSendModal
        open={sendTarget !== null}
        row={sendTarget}
        onClose={() => setSendTarget(null)}
      />
    </div>
  );
}

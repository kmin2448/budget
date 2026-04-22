'use client';

import { useState } from 'react';
import { useSession } from 'next-auth/react';
import { Button } from '@/components/ui/button';
import { RefreshCw, Users, X } from 'lucide-react';
import { WeMeetSummaryTable } from '@/components/we-meet/WeMeetSummaryTable';
import { WeMeetTeamManageTable } from '@/components/we-meet/WeMeetTeamManageTable';
import { WeMeetRowForm } from '@/components/we-meet/WeMeetRowForm';
import { WeMeetAllPdfReport, WeMeetTeamPdfReport } from '@/components/we-meet/WeMeetPdfReport';
import { WeMeetSendModal } from '@/components/we-meet/WeMeetSendModal';
import {
  useWeMeetExecutions,
  useWeMeetSummary,
  useAddWeMeetExecution,
  useUpdateWeMeetExecution,
  useDeleteWeMeetExecution,
  useWeMeetTeamInfos,
  useAddWeMeetTeamInfo,
  useUpdateWeMeetTeamInfo,
  useDeleteWeMeetTeamInfo,
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
  const { data: teamInfoData, refetch: refetchTeamInfos } = useWeMeetTeamInfos();
  const addTeamInfoMutation    = useAddWeMeetTeamInfo();
  const updateTeamInfoMutation = useUpdateWeMeetTeamInfo();
  const deleteTeamInfoMutation = useDeleteWeMeetTeamInfo();

  const [selectedTeam, setSelectedTeam]     = useState<string | null>(null);
  const [formOpen, setFormOpen]             = useState(false);
  const [formMode, setFormMode]             = useState<'add' | 'edit'>('add');
  const [editTarget, setEditTarget]         = useState<WeMeetExecution | undefined>();
  const [addTeamName, setAddTeamName]       = useState<string | undefined>();
  const [showTeamManage, setShowTeamManage] = useState(false);
  const [sendTarget, setSendTarget]         = useState<WeMeetExecution | null>(null);

  const executions = data?.executions ?? [];
  const teams      = data?.teams ?? [];
  const teamInfos  = teamInfoData?.teamInfos ?? [];

  const selectedSummary = selectedTeam
    ? summaries.find((s) => s.teamName === selectedTeam)
    : undefined;

  function handleAddExecution(teamName: string) {
    setFormMode('add');
    setEditTarget(undefined);
    setAddTeamName(teamName);
    setFormOpen(true);
  }

  function handleEditExecution(row: WeMeetExecution) {
    setFormMode('edit');
    setEditTarget(row);
    setAddTeamName(undefined);
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
      draftAmount:     row.draftAmount,
      confirmed:       !row.confirmed,
      confirmedAmount: row.confirmedAmount,
      description:     row.description,
      usageDate:       row.usageDate,
    });
  }

  async function handleDeleteExecution(row: WeMeetExecution) {
    await deleteMutation.mutateAsync(row.rowIndex);
  }

  function handleRefresh() {
    refetch();
    refetchSummary();
    refetchTeamInfos();
  }

  function handleToggleTeamManage() {
    setShowTeamManage((v) => !v);
    if (!showTeamManage) setSelectedTeam(null);
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
              variant={showTeamManage ? 'default' : 'outline'}
              size="sm"
              onClick={handleToggleTeamManage}
              className="gap-1.5"
            >
              <Users className="h-3.5 w-3.5" />
              팀 관리
              {showTeamManage && <X className="h-3 w-3 ml-0.5" />}
            </Button>
          )}
          {!isSummaryLoading && !showTeamManage && (
            <WeMeetAllPdfReport summaries={summaries} />
          )}
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

      {/* 팀 관리 테이블 또는 팀별 예산 현황 */}
      {showTeamManage ? (
        <div className="space-y-1.5">
          <h2 className="text-sm font-medium text-[#6F6F6B]">
            팀 관리
            <span className="ml-1.5 text-xs text-gray-400">팀 추가·삭제 및 팀 정보 수정</span>
          </h2>
          <WeMeetTeamManageTable
            teamInfos={teamInfos}
            onAddTeam={addTeamInfoMutation.mutateAsync}
            onUpdateTeam={updateTeamInfoMutation.mutateAsync}
            onDeleteTeam={deleteTeamInfoMutation.mutateAsync}
            isDeleting={deleteTeamInfoMutation.isPending}
          />
        </div>
      ) : (
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-medium text-[#6F6F6B]">
              팀별 예산 현황
              <span className="ml-1.5 text-xs text-gray-400">팀 행 클릭 시 팀 정보 및 집행현황 표시</span>
            </h2>
            {selectedTeam && selectedSummary && (
              <WeMeetTeamPdfReport
                teamName={selectedTeam}
                summary={selectedSummary}
                executions={executions}
              />
            )}
          </div>
          {isSummaryLoading || isLoading ? (
            <div className="h-40 animate-pulse rounded-lg bg-[#F3F3EE]" />
          ) : (
            <WeMeetSummaryTable
              summaries={summaries}
              teamInfos={teamInfos}
              executions={executions}
              selectedTeam={selectedTeam}
              canWrite={canWrite}
              onSelectTeam={setSelectedTeam}
              onSaveTeamRemarks={(rowIndex, remarks) => {
                const info = teamInfos.find((t) => t.rowIndex === rowIndex);
                if (info) updateTeamInfoMutation.mutate({ ...info, remarks });
              }}
              onAddExecution={handleAddExecution}
              onEditExecution={handleEditExecution}
              onDeleteExecution={handleDeleteExecution}
              onToggleConfirmed={handleToggleConfirmed}
              isToggling={updateMutation.isPending}
            />
          )}
        </div>
      )}

      {/* 행 추가/수정 모달 */}
      <WeMeetRowForm
        open={formOpen}
        mode={formMode}
        teams={teams}
        initialData={editTarget}
        defaultTeam={addTeamName}
        onClose={() => { setFormOpen(false); setAddTeamName(undefined); }}
        onSubmit={handleFormSubmit}
        isPending={addMutation.isPending || updateMutation.isPending}
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

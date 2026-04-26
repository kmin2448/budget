'use client';

import { useState, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { RefreshCw, Search } from 'lucide-react';
import { WeMeetSummaryTable } from '@/components/we-meet/WeMeetSummaryTable';
import { WeMeetRowForm } from '@/components/we-meet/WeMeetRowForm';
import { WeMeetAllPdfReport } from '@/components/we-meet/WeMeetPdfReport';
import { WeMeetSendModal } from '@/components/we-meet/WeMeetSendModal';
import {
  useWeMeetExecutions,
  useWeMeetSummary,
  useAddWeMeetExecution,
  useUpdateWeMeetExecution,
  useDeleteWeMeetExecution,
  useWeMeetTeamInfos,
  useUpdateWeMeetTeamInfo,
  type ExecutionPayload,
} from '@/hooks/useWeMeet';
import type { WeMeetExecution } from '@/types';

interface Props {
  canWrite: boolean;
}

export function WeMeetTeamsSection({ canWrite }: Props) {
  const { data, isLoading, isError, error, refetch }                                             = useWeMeetExecutions();
  const { data: summaries = [], isLoading: isSummaryLoading, refetch: refetchSummary }           = useWeMeetSummary();
  const { data: teamInfoData, isError: isTeamInfoError, error: teamInfoError, refetch: refetchTeamInfos } = useWeMeetTeamInfos();

  const addMutation            = useAddWeMeetExecution();
  const updateMutation         = useUpdateWeMeetExecution();
  const deleteMutation         = useDeleteWeMeetExecution();
  const updateTeamInfoMutation = useUpdateWeMeetTeamInfo();

  const [searchQuery, setSearchQuery] = useState('');
  const [formOpen, setFormOpen]       = useState(false);
  const [formMode, setFormMode]       = useState<'add' | 'edit'>('add');
  const [editTarget, setEditTarget]   = useState<WeMeetExecution | undefined>();
  const [addTeamName, setAddTeamName] = useState<string | undefined>();
  const [sendTarget, setSendTarget]   = useState<WeMeetExecution | null>(null);

  const executions = data?.executions ?? [];
  const teams      = data?.teams ?? [];
  const usageTypes = data?.usageTypes ?? [];
  const teamInfos  = teamInfoData?.teamInfos ?? [];

  const filteredSummaries = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return summaries;
    return summaries.filter((s) => {
      if (s.teamName.toLowerCase().includes(q)) return true;
      const info = teamInfos.find((t) => t.teamName === s.teamName);
      if (info) {
        if (info.advisor.toLowerCase().includes(q)) return true;
        if (info.topic.toLowerCase().includes(q)) return true;
        if (info.mentor.toLowerCase().includes(q)) return true;
        if (info.teamLeader.toLowerCase().includes(q)) return true;
      }
      return false;
    });
  }, [summaries, searchQuery, teamInfos]);

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

  function handleUpdateExecution(row: WeMeetExecution) {
    void updateMutation.mutateAsync({
      rowIndex:          row.rowIndex,
      usageType:         row.usageType,
      teamName:          row.teamName,
      draftAmount:       row.draftAmount,
      confirmedAmount:   row.confirmedAmount,
      claimed:           row.claimed,
      description:       row.description,
      usageDate:         row.usageDate,
      evidenceSubmitted: row.evidenceSubmitted,
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

  return (
    <div className="space-y-4">
      {/* 툴바 */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative w-full sm:w-64">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder="팀명, 지도교수, 멘토, 주제 검색…"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="h-8 w-full rounded-md border border-[#E3E3E0] bg-white pl-8 pr-3 text-sm placeholder:text-gray-300 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
          />
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {!isSummaryLoading && (
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
      {isTeamInfoError && (
        <div className="rounded-lg border border-orange-200 bg-orange-50 px-4 py-3 text-sm text-orange-700">
          팀 정보 로드 실패: {teamInfoError instanceof Error ? teamInfoError.message : '팀 정보를 불러오지 못했습니다.'}
        </div>
      )}

      {/* 팀별 예산 현황 */}
      {isSummaryLoading || isLoading ? (
        <div className="h-40 animate-pulse rounded-lg bg-[#F3F3EE]" />
      ) : (
        <WeMeetSummaryTable
          summaries={filteredSummaries}
          teamInfos={teamInfos}
          executions={executions}
          canWrite={canWrite}
          onSelectTeam={() => {}}
          onUpdateTeamInfo={updateTeamInfoMutation.mutate}
          onAddExecution={handleAddExecution}
          onEditExecution={handleEditExecution}
          onDeleteExecution={handleDeleteExecution}
          onUpdateExecution={handleUpdateExecution}
          isToggling={updateMutation.isPending}
        />
      )}

      <WeMeetRowForm
        open={formOpen}
        mode={formMode}
        teams={teams}
        usageTypes={usageTypes}
        initialData={editTarget}
        defaultTeam={addTeamName}
        onClose={() => { setFormOpen(false); setAddTeamName(undefined); }}
        onSubmit={handleFormSubmit}
        isPending={addMutation.isPending || updateMutation.isPending}
      />

      <WeMeetSendModal
        open={sendTarget !== null}
        row={sendTarget}
        onClose={() => setSendTarget(null)}
      />
    </div>
  );
}

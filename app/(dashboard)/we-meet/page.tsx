'use client';

import { useState, useEffect, useRef } from 'react';
import { useSession } from 'next-auth/react';
import { Button } from '@/components/ui/button';
import { RefreshCw, Users, X, ExternalLink, Pencil, Check } from 'lucide-react';
import { WeMeetSummaryTable } from '@/components/we-meet/WeMeetSummaryTable';
import { WeMeetTeamManageTable } from '@/components/we-meet/WeMeetTeamManageTable';
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

  const { data, isLoading, isError, error, refetch }                       = useWeMeetExecutions();
  const { data: summaries = [], isLoading: isSummaryLoading, refetch: refetchSummary } = useWeMeetSummary();

  const addMutation            = useAddWeMeetExecution();
  const updateMutation         = useUpdateWeMeetExecution();
  const deleteMutation         = useDeleteWeMeetExecution();
  const { data: teamInfoData, isError: isTeamInfoError, error: teamInfoError, refetch: refetchTeamInfos } = useWeMeetTeamInfos();
  const addTeamInfoMutation    = useAddWeMeetTeamInfo();
  const updateTeamInfoMutation = useUpdateWeMeetTeamInfo();
  const deleteTeamInfoMutation = useDeleteWeMeetTeamInfo();

  const [formOpen, setFormOpen]             = useState(false);
  const [formMode, setFormMode]             = useState<'add' | 'edit'>('add');
  const [editTarget, setEditTarget]         = useState<WeMeetExecution | undefined>();
  const [addTeamName, setAddTeamName]       = useState<string | undefined>();
  const [showTeamManage, setShowTeamManage] = useState(false);
  const [sendTarget, setSendTarget]         = useState<WeMeetExecution | null>(null);

  const DEFAULT_REF_URL = 'https://docs.google.com/spreadsheets/d/1Z1TuM4Z8AlKdhiPUicWOG90OFHe317EyQ4WXQaJuaHQ/edit?gid=603218452#gid=603218452';
  const STORAGE_KEY = 'wemeet-reference-url';

  const [referenceUrl, setReferenceUrl]   = useState(DEFAULT_REF_URL);
  const [isEditingUrl, setIsEditingUrl]   = useState(false);
  const [urlInput, setUrlInput]           = useState('');
  const urlInputRef                       = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) setReferenceUrl(saved);
  }, []);

  function openUrlEdit() {
    setUrlInput(referenceUrl);
    setIsEditingUrl(true);
    setTimeout(() => urlInputRef.current?.select(), 0);
  }

  function saveUrl() {
    const trimmed = urlInput.trim();
    if (trimmed) {
      setReferenceUrl(trimmed);
      localStorage.setItem(STORAGE_KEY, trimmed);
    }
    setIsEditingUrl(false);
  }

  function cancelUrlEdit() {
    setIsEditingUrl(false);
  }

  const executions = data?.executions ?? [];
  const teams      = data?.teams ?? [];
  const teamInfos  = teamInfoData?.teamInfos ?? [];

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
    const togglingOn = !row.confirmed;
    await updateMutation.mutateAsync({
      rowIndex:        row.rowIndex,
      usageType:       row.usageType,
      teamName:        row.teamName,
      draftAmount:     row.draftAmount,
      confirmed:       togglingOn,
      confirmedAmount: togglingOn && row.confirmedAmount === 0 ? row.draftAmount : row.confirmedAmount,
      description:     row.description,
      usageDate:       row.usageDate,
    });
  }

  function handleUpdateExecution(row: WeMeetExecution) {
    void updateMutation.mutateAsync({
      rowIndex:        row.rowIndex,
      usageType:       row.usageType,
      teamName:        row.teamName,
      draftAmount:     row.draftAmount,
      confirmed:       row.confirmed,
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
      {isTeamInfoError && (
        <div className="rounded-lg border border-orange-200 bg-orange-50 px-4 py-3 text-sm text-orange-700">
          팀 정보 로드 실패: {teamInfoError instanceof Error ? teamInfoError.message : '팀 정보를 불러오지 못했습니다.'}
        </div>
      )}

      {/* 팀 관리 또는 팀별 예산 현황 */}
      {showTeamManage ? (
        <div className="space-y-1.5">
          <h2 className="text-sm font-medium text-[#6F6F6B]">
            팀 관리
            <span className="ml-1.5 text-xs text-gray-400">지도교수별 팀 관리 · 팀 추가 · 삭제 · 정보 수정</span>
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
          <div className="flex items-center gap-3 flex-wrap">
            <h2 className="text-sm font-medium text-[#6F6F6B] whitespace-nowrap">
              팀별 예산 현황
              <span className="ml-1.5 text-xs text-gray-400">지도교수 행 클릭으로 팀 목록 펼치기 · 팀 클릭으로 상세 정보 및 집행현황 확인</span>
            </h2>

            {/* 참고링크 */}
            <div className="flex items-center gap-1 ml-auto">
              {isEditingUrl ? (
                <>
                  <input
                    ref={urlInputRef}
                    value={urlInput}
                    onChange={(e) => setUrlInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') saveUrl();
                      if (e.key === 'Escape') cancelUrlEdit();
                    }}
                    placeholder="URL 입력"
                    className="h-7 w-72 rounded border border-[#E3E3E0] px-2 text-xs text-[#131310] focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                  />
                  <button
                    onClick={saveUrl}
                    title="저장"
                    className="flex h-7 w-7 items-center justify-center rounded bg-primary text-white hover:bg-primary-light transition-colors"
                  >
                    <Check className="h-3.5 w-3.5" />
                  </button>
                  <button
                    onClick={cancelUrlEdit}
                    title="취소"
                    className="flex h-7 w-7 items-center justify-center rounded border border-[#E3E3E0] bg-white text-gray-500 hover:bg-gray-50 transition-colors"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </>
              ) : (
                <>
                  <a
                    href={referenceUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1.5 rounded-md border border-[#D6E4F0] bg-[#EEF3F8] px-2.5 py-1 text-xs font-medium text-[#1F5C99] hover:bg-[#D6E4F0] transition-colors"
                  >
                    <ExternalLink className="h-3 w-3" />
                    참고링크 바로가기
                  </a>
                  {canWrite && (
                    <button
                      onClick={openUrlEdit}
                      title="링크 주소 수정"
                      className="flex h-7 w-7 items-center justify-center rounded border border-[#E3E3E0] bg-white text-gray-400 hover:border-primary hover:text-primary transition-colors"
                    >
                      <Pencil className="h-3 w-3" />
                    </button>
                  )}
                </>
              )}
            </div>
          </div>
          {isSummaryLoading || isLoading ? (
            <div className="h-40 animate-pulse rounded-lg bg-[#F3F3EE]" />
          ) : (
            <WeMeetSummaryTable
              summaries={summaries}
              teamInfos={teamInfos}
              executions={executions}
              canWrite={canWrite}
              onSelectTeam={() => { /* PDF 선택은 컴포넌트 내부에서 처리 */ }}
              onUpdateTeamInfo={updateTeamInfoMutation.mutate}
              onAddExecution={handleAddExecution}
              onEditExecution={handleEditExecution}
              onDeleteExecution={handleDeleteExecution}
              onToggleConfirmed={handleToggleConfirmed}
              onUpdateExecution={handleUpdateExecution}
              isToggling={updateMutation.isPending}
            />
          )}
        </div>
      )}

      {/* 집행 행 추가/수정 모달 */}
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

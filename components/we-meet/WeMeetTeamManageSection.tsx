'use client';

import { useMemo, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { RefreshCw } from 'lucide-react';
import { WeMeetTeamManageTable } from '@/components/we-meet/WeMeetTeamManageTable';
import {
  useWeMeetTeamInfos,
  useAddWeMeetTeam,
  useAddWeMeetTeamInfo,
  useUpdateWeMeetTeamInfo,
  useDeleteWeMeetTeam,
  useDeleteWeMeetTeamInfo,
  type TeamInfoPayload,
} from '@/hooks/useWeMeet';
import type { WeMeetTeamInfo } from '@/types';

interface Props {
  canWrite: boolean;
  advisorOrder?: string[];
}

export function WeMeetTeamManageSection({ canWrite, advisorOrder }: Props) {
  const { data: teamInfoData, isLoading, isError, error, refetch } = useWeMeetTeamInfos();

  const addTeamMutation        = useAddWeMeetTeam();
  const addTeamInfoMutation    = useAddWeMeetTeamInfo();
  const updateTeamInfoMutation = useUpdateWeMeetTeamInfo();
  const deleteTeamMutation     = useDeleteWeMeetTeam();
  const deleteTeamInfoMutation = useDeleteWeMeetTeamInfo();

  const teamInfos = teamInfoData?.teamInfos ?? [];
  const teamList  = teamInfoData?.teams ?? [];

  // 팀정보에 없는 팀별취합 항목을 synthetic 엔트리(rowIndex 음수)로 포함
  const teamInfoNameSet = useMemo(
    () => new Set(teamInfos.map((t) => t.teamName)),
    [teamInfos],
  );

  const allTeamInfos = useMemo<WeMeetTeamInfo[]>(() => {
    const synthetic = teamList
      .filter((t) => !teamInfoNameSet.has(t.teamName))
      .map((t): WeMeetTeamInfo => ({
        teamName:        t.teamName,
        rowIndex:        -(t.rowIndex),  // 음수 = 팀별취합에만 존재
        advisor:         '',
        topic:           '',
        mentorOrg:       '',
        mentor:          '',
        teamLeader:      '',
        teamMembers:     '',
        assistantMentor: '',
        remarks:         '',
        memberList:      [],
      }));
    return [...teamInfos, ...synthetic];
  }, [teamInfos, teamList, teamInfoNameSet]);

  // 팀 추가: 팀별취합 + 팀정보 양쪽 추가 (중복 방지)
  const handleAddTeam = useCallback(async (payload: TeamInfoPayload) => {
    const alreadyInList = teamList.some((t) => t.teamName === payload.teamName);
    if (!alreadyInList) {
      await addTeamMutation.mutateAsync(payload.teamName);
    }
    await addTeamInfoMutation.mutateAsync(payload);
  }, [teamList, addTeamMutation, addTeamInfoMutation]);

  // 팀 정보 저장: rowIndex < 0이면 신규 추가(팀별취합에만 존재), 아니면 수정
  const handleUpdateTeam = useCallback(async (info: WeMeetTeamInfo) => {
    if (info.rowIndex < 0) {
      await addTeamInfoMutation.mutateAsync(info);
    } else {
      await updateTeamInfoMutation.mutateAsync(info);
    }
  }, [addTeamInfoMutation, updateTeamInfoMutation]);

  // 팀 삭제: rowIndex < 0이면 팀별취합만 삭제, 양수면 팀정보 + 팀별취합 모두 삭제
  const handleDeleteTeam = useCallback(async (rowIndex: number) => {
    if (rowIndex < 0) {
      await deleteTeamMutation.mutateAsync(-rowIndex);
    } else {
      const teamName  = teamInfos.find((t) => t.rowIndex === rowIndex)?.teamName;
      await deleteTeamInfoMutation.mutateAsync(rowIndex);
      const listEntry = teamList.find((t) => t.teamName === teamName);
      if (listEntry) {
        await deleteTeamMutation.mutateAsync(listEntry.rowIndex);
      }
    }
  }, [teamInfos, teamList, deleteTeamInfoMutation, deleteTeamMutation]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <span className="text-sm text-gray-400">지도교수별 팀 관리 · 팀 추가 · 삭제 · 정보 수정</span>
        <Button
          variant="outline"
          size="sm"
          onClick={() => { void refetch(); }}
          disabled={isLoading}
          className="gap-1.5 text-gray-600"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${isLoading ? 'animate-spin' : ''}`} />
          새로고침
        </Button>
      </div>

      {isError && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error instanceof Error ? error.message : '데이터를 불러오지 못했습니다.'}
        </div>
      )}

      {!canWrite ? (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">
          팀 관리는 관리자만 접근할 수 있습니다.
        </div>
      ) : isLoading ? (
        <div className="h-40 animate-pulse rounded-lg bg-[#F3F3EE]" />
      ) : (
        <WeMeetTeamManageTable
          teamInfos={allTeamInfos}
          onAddTeam={handleAddTeam}
          onUpdateTeam={handleUpdateTeam}
          onDeleteTeam={handleDeleteTeam}
          isDeleting={deleteTeamInfoMutation.isPending || deleteTeamMutation.isPending}
          advisorOrder={advisorOrder ?? []}
        />
      )}
    </div>
  );
}

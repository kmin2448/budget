'use client';

import { Button } from '@/components/ui/button';
import { RefreshCw } from 'lucide-react';
import { WeMeetTeamManageTable } from '@/components/we-meet/WeMeetTeamManageTable';
import {
  useWeMeetTeamInfos,
  useAddWeMeetTeamInfo,
  useUpdateWeMeetTeamInfo,
  useDeleteWeMeetTeamInfo,
} from '@/hooks/useWeMeet';

interface Props {
  canWrite: boolean;
  advisorOrder?: string[];
}

export function WeMeetTeamManageSection({ canWrite, advisorOrder }: Props) {
  const { data: teamInfoData, isLoading, isError, error, refetch } = useWeMeetTeamInfos();
  const addTeamInfoMutation    = useAddWeMeetTeamInfo();
  const updateTeamInfoMutation = useUpdateWeMeetTeamInfo();
  const deleteTeamInfoMutation = useDeleteWeMeetTeamInfo();

  const teamInfos = teamInfoData?.teamInfos ?? [];

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
          teamInfos={teamInfos}
          onAddTeam={addTeamInfoMutation.mutateAsync}
          onUpdateTeam={updateTeamInfoMutation.mutateAsync}
          onDeleteTeam={deleteTeamInfoMutation.mutateAsync}
          isDeleting={deleteTeamInfoMutation.isPending}
          advisorOrder={advisorOrder ?? []}
        />
      )}
    </div>
  );
}

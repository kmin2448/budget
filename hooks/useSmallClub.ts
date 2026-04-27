import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { WeMeetExecution, WeMeetTeamSummary, WeMeetTeamInfo, SmallClubSendBatch } from '@/types';

const QUERY_KEY        = 'small-club';
const SUMMARY_KEY      = 'small-club-summary';
const TEAM_INFO_KEY    = 'small-club-team-info';
const SEND_BATCHES_KEY = 'small-club-send-batches';

// ── 집행현황 조회 ─────────────────────────────────────────────────────

interface SmallClubListResponse {
  executions: WeMeetExecution[];
  teams: string[];
  usageTypes: string[];
}

async function fetchExecutions(): Promise<SmallClubListResponse> {
  const res = await fetch('/api/small-club/executions');
  if (!res.ok) {
    const body = await res.json().catch(() => ({})) as { error?: string };
    throw new Error(body.error ?? '데이터 로드 실패');
  }
  return res.json() as Promise<SmallClubListResponse>;
}

export function useSmallClubExecutions() {
  return useQuery({
    queryKey: [QUERY_KEY],
    queryFn: fetchExecutions,
    staleTime: 3 * 60 * 1000,
  });
}

// ── 팀별 요약 조회 ───────────────────────────────────────────────────

async function fetchSummary(): Promise<WeMeetTeamSummary[]> {
  const res = await fetch('/api/small-club/summary');
  if (!res.ok) {
    const body = await res.json().catch(() => ({})) as { error?: string };
    throw new Error(body.error ?? '요약 데이터 로드 실패');
  }
  const data = await res.json() as { summary: WeMeetTeamSummary[] };
  return data.summary;
}

export function useSmallClubSummary() {
  return useQuery({
    queryKey: [SUMMARY_KEY],
    queryFn: fetchSummary,
    staleTime: 3 * 60 * 1000,
  });
}

// ── 행 추가 ──────────────────────────────────────────────────────────

export type SmallClubExecutionPayload = Omit<WeMeetExecution, 'rowIndex' | 'sent'>;

export function useAddSmallClubExecution() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (payload: SmallClubExecutionPayload) => {
      const res = await fetch('/api/small-club/executions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const body = await res.json() as { error?: string };
        throw new Error(body.error ?? '추가 실패');
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [QUERY_KEY] });
      queryClient.invalidateQueries({ queryKey: [SUMMARY_KEY] });
    },
  });
}

// ── 행 수정 ──────────────────────────────────────────────────────────

export function useUpdateSmallClubExecution() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (payload: SmallClubExecutionPayload & { rowIndex: number }) => {
      const { rowIndex, ...data } = payload;
      const res = await fetch(`/api/small-club/executions/${rowIndex}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const body = await res.json() as { error?: string };
        throw new Error(body.error ?? '수정 실패');
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [QUERY_KEY] });
      queryClient.invalidateQueries({ queryKey: [SUMMARY_KEY] });
    },
  });
}

// ── 행 삭제 ──────────────────────────────────────────────────────────

export function useDeleteSmallClubExecution() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (rowIndex: number) => {
      const res = await fetch(`/api/small-club/executions/${rowIndex}`, { method: 'DELETE' });
      if (!res.ok) {
        const body = await res.json() as { error?: string };
        throw new Error(body.error ?? '삭제 실패');
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [QUERY_KEY] });
      queryClient.invalidateQueries({ queryKey: [SUMMARY_KEY] });
    },
  });
}

// ── 집행현황 보내기 표시 ──────────────────────────────────────────────

interface MarkSentPayload {
  rowIndexes: number[];
  category?: string;
  budgetType?: string;
  description?: string;
  programName?: string;
  expenditureRowIndex?: number;
}

export function useMarkSmallClubSent() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (payload: MarkSentPayload) => {
      const res = await fetch('/api/small-club/executions/mark-sent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const body = await res.json() as { error?: string };
        throw new Error(body.error ?? '보내기 표시 실패');
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [QUERY_KEY] });
      queryClient.invalidateQueries({ queryKey: [SEND_BATCHES_KEY] });
    },
  });
}

// ── 보내기 배치 조회 ──────────────────────────────────────────────────

async function fetchSendBatches(): Promise<SmallClubSendBatch[]> {
  const res = await fetch('/api/small-club/send-batches');
  if (!res.ok) return [];
  const data = await res.json() as { batches: SmallClubSendBatch[] };
  return data.batches;
}

export function useSmallClubSendBatches() {
  return useQuery({
    queryKey: [SEND_BATCHES_KEY],
    queryFn: fetchSendBatches,
    staleTime: 2 * 60 * 1000,
  });
}

// ── 보내기 배치 취소 ──────────────────────────────────────────────────

export function useUndoSmallClubBatch() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (batchId: string) => {
      const res = await fetch(`/api/small-club/send-batches/${batchId}`, { method: 'DELETE' });
      if (!res.ok) {
        const body = await res.json() as { error?: string };
        throw new Error(body.error ?? '취소 실패');
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [QUERY_KEY] });
      queryClient.invalidateQueries({ queryKey: [SEND_BATCHES_KEY] });
    },
  });
}

// ── 집행현황 순서 변경 ────────────────────────────────────────────────

export function useReorderSmallClubExecutions() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (rows: WeMeetExecution[]) => {
      const res = await fetch('/api/small-club/executions/reorder', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rows }),
      });
      if (!res.ok) {
        const body = await res.json() as { error?: string };
        throw new Error(body.error ?? '순서 변경 실패');
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [QUERY_KEY] });
      queryClient.invalidateQueries({ queryKey: [SUMMARY_KEY] });
    },
  });
}

// ── 다중 행 일괄 추가 ──────────────────────────────────────────────────

export function useAddBulkSmallClubExecutions() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (payloads: SmallClubExecutionPayload[]) => {
      const res = await fetch('/api/small-club/executions/bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ executions: payloads }),
      });
      if (!res.ok) {
        const body = await res.json() as { error?: string };
        throw new Error(body.error ?? '일괄 추가 실패');
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [QUERY_KEY] });
      queryClient.invalidateQueries({ queryKey: [SUMMARY_KEY] });
    },
  });
}

// ── 소학회 추가 ──────────────────────────────────────────────────────

export function useAddSmallClubTeam() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (teamName: string) => {
      const res = await fetch('/api/small-club/teams', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ teamName }),
      });
      if (!res.ok) {
        const body = await res.json() as { error?: string };
        throw new Error(body.error ?? '소학회 추가 실패');
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [QUERY_KEY] });
      queryClient.invalidateQueries({ queryKey: [SUMMARY_KEY] });
    },
  });
}

// ── 소학회 삭제 ──────────────────────────────────────────────────────

export function useDeleteSmallClubTeam() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (rowIndex: number) => {
      const res = await fetch(`/api/small-club/teams/${rowIndex}`, { method: 'DELETE' });
      if (!res.ok) {
        const body = await res.json() as { error?: string };
        throw new Error(body.error ?? '소학회 삭제 실패');
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [QUERY_KEY] });
      queryClient.invalidateQueries({ queryKey: [SUMMARY_KEY] });
    },
  });
}

// ── 팀정보 조회 ──────────────────────────────────────────────────────

interface TeamInfoResponse {
  teamInfos: WeMeetTeamInfo[];
  teams: string[];
}

async function fetchTeamInfos(): Promise<TeamInfoResponse> {
  const res = await fetch('/api/small-club/team-info');
  if (!res.ok) {
    const body = await res.json().catch(() => ({})) as { error?: string };
    throw new Error(body.error ?? '소학회 정보 로드 실패');
  }
  return res.json() as Promise<TeamInfoResponse>;
}

export function useSmallClubTeamInfos() {
  return useQuery({
    queryKey: [TEAM_INFO_KEY],
    queryFn: fetchTeamInfos,
    staleTime: 3 * 60 * 1000,
  });
}

// ── 팀정보 추가 ──────────────────────────────────────────────────────

export type SmallClubTeamInfoPayload = Omit<WeMeetTeamInfo, 'rowIndex'>;
export type TeamInfoPayload = SmallClubTeamInfoPayload;

export function useAddSmallClubTeamInfo() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (payload: SmallClubTeamInfoPayload) => {
      const res = await fetch('/api/small-club/team-info', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const body = await res.json() as { error?: string };
        throw new Error(body.error ?? '소학회 정보 추가 실패');
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [TEAM_INFO_KEY] });
    },
  });
}

// ── 팀정보 수정 ──────────────────────────────────────────────────────

export function useUpdateSmallClubTeamInfo() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (payload: WeMeetTeamInfo) => {
      const { rowIndex, ...data } = payload;
      const res = await fetch(`/api/small-club/team-info/${rowIndex}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const body = await res.json() as { error?: string };
        throw new Error(body.error ?? '소학회 정보 수정 실패');
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [TEAM_INFO_KEY] });
    },
  });
}

// ── 팀정보 삭제 ──────────────────────────────────────────────────────

export function useDeleteSmallClubTeamInfo() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (rowIndex: number) => {
      const res = await fetch(`/api/small-club/team-info/${rowIndex}`, { method: 'DELETE' });
      if (!res.ok) {
        const body = await res.json() as { error?: string };
        throw new Error(body.error ?? '소학회 정보 삭제 실패');
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [TEAM_INFO_KEY] });
    },
  });
}

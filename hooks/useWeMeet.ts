import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { WeMeetExecution, WeMeetTeamSummary, WeMeetTeamInfo, WeMeetSendBatch } from '@/types';

const QUERY_KEY = 'wemeet';
const SUMMARY_KEY = 'wemeet-summary';
const TEAM_INFO_KEY = 'wemeet-team-info';
const SEND_BATCHES_KEY = 'wemeet-send-batches';

// ── 집행현황 조회 ─────────────────────────────────────────────────────

interface WeMeetListResponse {
  executions: WeMeetExecution[];
  teams: string[];
  usageTypes: string[];
}

async function fetchExecutions(): Promise<WeMeetListResponse> {
  const res = await fetch('/api/we-meet/executions');
  if (!res.ok) {
    const body = await res.json().catch(() => ({})) as { error?: string };
    throw new Error(body.error ?? '데이터 로드 실패');
  }
  return res.json() as Promise<WeMeetListResponse>;
}

export function useWeMeetExecutions() {
  return useQuery({
    queryKey: [QUERY_KEY],
    queryFn: fetchExecutions,
    staleTime: 3 * 60 * 1000,
  });
}

// ── 팀별 요약 조회 ───────────────────────────────────────────────────

async function fetchSummary(): Promise<WeMeetTeamSummary[]> {
  const res = await fetch('/api/we-meet/summary');
  if (!res.ok) {
    const body = await res.json().catch(() => ({})) as { error?: string };
    throw new Error(body.error ?? '요약 데이터 로드 실패');
  }
  const data = await res.json() as { summary: WeMeetTeamSummary[] };
  return data.summary;
}

export function useWeMeetSummary() {
  return useQuery({
    queryKey: [SUMMARY_KEY],
    queryFn: fetchSummary,
    staleTime: 3 * 60 * 1000,
  });
}

// ── 행 추가 ──────────────────────────────────────────────────────────

export type ExecutionPayload = Omit<WeMeetExecution, 'rowIndex' | 'sent'>;

export function useAddWeMeetExecution() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (payload: ExecutionPayload) => {
      const res = await fetch('/api/we-meet/executions', {
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

export function useUpdateWeMeetExecution() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (payload: ExecutionPayload & { rowIndex: number }) => {
      const { rowIndex, ...data } = payload;
      const res = await fetch(`/api/we-meet/executions/${rowIndex}`, {
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

export function useDeleteWeMeetExecution() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (rowIndex: number) => {
      const res = await fetch(`/api/we-meet/executions/${rowIndex}`, { method: 'DELETE' });
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

export function useMarkWeMeetSent() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (payload: MarkSentPayload) => {
      const res = await fetch('/api/we-meet/executions/mark-sent', {
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

async function fetchSendBatches(): Promise<WeMeetSendBatch[]> {
  const res = await fetch('/api/we-meet/send-batches');
  if (!res.ok) return [];
  const data = await res.json() as { batches: WeMeetSendBatch[] };
  return data.batches;
}

export function useWeMeetSendBatches() {
  return useQuery({
    queryKey: [SEND_BATCHES_KEY],
    queryFn: fetchSendBatches,
    staleTime: 2 * 60 * 1000,
  });
}

// ── 보내기 배치 취소 ──────────────────────────────────────────────────

export function useUndoWeMeetBatch() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (batchId: string) => {
      const res = await fetch(`/api/we-meet/send-batches/${batchId}`, { method: 'DELETE' });
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

export function useReorderWeMeetExecutions() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (rows: WeMeetExecution[]) => {
      const res = await fetch('/api/we-meet/executions/reorder', {
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

// ── 다중 행 일괄 추가 (팀별 개별 금액 지원) ──────────────────────────

export function useAddBulkWeMeetExecutions() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (payloads: ExecutionPayload[]) => {
      const res = await fetch('/api/we-meet/executions/bulk', {
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

// ── 팀 추가 ──────────────────────────────────────────────────────────

export function useAddWeMeetTeam() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (teamName: string) => {
      const res = await fetch('/api/we-meet/teams', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ teamName }),
      });
      if (!res.ok) {
        const body = await res.json() as { error?: string };
        throw new Error(body.error ?? '팀 추가 실패');
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [QUERY_KEY] });
      queryClient.invalidateQueries({ queryKey: [SUMMARY_KEY] });
    },
  });
}

// ── 팀 삭제 ──────────────────────────────────────────────────────────

export function useDeleteWeMeetTeam() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (rowIndex: number) => {
      const res = await fetch(`/api/we-meet/teams/${rowIndex}`, { method: 'DELETE' });
      if (!res.ok) {
        const body = await res.json() as { error?: string };
        throw new Error(body.error ?? '팀 삭제 실패');
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
  const res = await fetch('/api/we-meet/team-info');
  if (!res.ok) {
    const body = await res.json().catch(() => ({})) as { error?: string };
    throw new Error(body.error ?? '팀 정보 로드 실패');
  }
  return res.json() as Promise<TeamInfoResponse>;
}

export function useWeMeetTeamInfos() {
  return useQuery({
    queryKey: [TEAM_INFO_KEY],
    queryFn: fetchTeamInfos,
    staleTime: 3 * 60 * 1000,
  });
}

// ── 팀정보 추가 ──────────────────────────────────────────────────────

export type TeamInfoPayload = Omit<WeMeetTeamInfo, 'rowIndex'>;

export function useAddWeMeetTeamInfo() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (payload: TeamInfoPayload) => {
      const res = await fetch('/api/we-meet/team-info', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const body = await res.json() as { error?: string };
        throw new Error(body.error ?? '팀 정보 추가 실패');
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [TEAM_INFO_KEY] });
    },
  });
}

// ── 팀정보 수정 ──────────────────────────────────────────────────────

export function useUpdateWeMeetTeamInfo() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (payload: WeMeetTeamInfo) => {
      const { rowIndex, ...data } = payload;
      const res = await fetch(`/api/we-meet/team-info/${rowIndex}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const body = await res.json() as { error?: string };
        throw new Error(body.error ?? '팀 정보 수정 실패');
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [TEAM_INFO_KEY] });
    },
  });
}

// ── 팀정보 삭제 ──────────────────────────────────────────────────────

export function useDeleteWeMeetTeamInfo() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (rowIndex: number) => {
      const res = await fetch(`/api/we-meet/team-info/${rowIndex}`, { method: 'DELETE' });
      if (!res.ok) {
        const body = await res.json() as { error?: string };
        throw new Error(body.error ?? '팀 정보 삭제 실패');
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [TEAM_INFO_KEY] });
    },
  });
}

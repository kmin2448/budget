'use client';

import { useState, useEffect } from 'react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { KRWInput } from '@/components/ui/krw-input';
import { parseKRW, formatKRW } from '@/lib/utils';
import { WEMEET_USAGE_TYPES } from '@/constants/wemeet';
import type { WeMeetExecution } from '@/types';
import type { ExecutionPayload } from '@/hooks/useWeMeet';

function Label({ children, htmlFor, className }: { children: React.ReactNode; htmlFor?: string; className?: string }) {
  return (
    <label htmlFor={htmlFor} className={`text-sm font-medium text-[#131310] ${className ?? ''}`}>
      {children}
    </label>
  );
}

interface Props {
  open: boolean;
  mode: 'add' | 'edit';
  teams: string[];
  initialData?: WeMeetExecution;
  defaultTeam?: string;
  onClose: () => void;
  onSubmit: (payload: ExecutionPayload) => Promise<void>;
  isPending: boolean;
}

const DEFAULT_FORM: ExecutionPayload = {
  usageType: '',
  teamName: '',
  draftAmount: 0,
  confirmed: false,
  confirmedAmount: 0,
  description: '',
  usageDate: '',
};

export function WeMeetRowForm({ open, mode, teams, initialData, defaultTeam, onClose, onSubmit, isPending }: Props) {
  const [form, setForm]           = useState<ExecutionPayload>(DEFAULT_FORM);
  const [draftStr,    setDraftStr]    = useState('');
  const [confirmedStr, setConfirmedStr] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (open) {
      if (mode === 'edit' && initialData) {
        setForm({
          usageType:       initialData.usageType,
          teamName:        initialData.teamName,
          draftAmount:     initialData.draftAmount,
          confirmed:       initialData.confirmed,
          confirmedAmount: initialData.confirmedAmount,
          description:     initialData.description,
          usageDate:       initialData.usageDate,
        });
        setDraftStr(formatKRW(initialData.draftAmount));
        setConfirmedStr(formatKRW(initialData.confirmedAmount));
      } else {
        setForm({ ...DEFAULT_FORM, teamName: defaultTeam ?? '' });
        setDraftStr('');
        setConfirmedStr('');
      }
      setError('');
    }
  }, [open, mode, initialData, defaultTeam]);

  // 확정 체크 해제 시 확정금액 초기화
  function handleConfirmedChange(checked: boolean) {
    setForm((f) => ({ ...f, confirmed: checked }));
    if (!checked) {
      setConfirmedStr('');
    } else if (!confirmedStr) {
      setConfirmedStr(draftStr);
    }
  }

  async function handleSubmit() {
    if (!form.usageType) { setError('사용구분을 선택해주세요.'); return; }
    if (!form.teamName)  { setError('팀명을 선택해주세요.'); return; }
    setError('');

    const draft     = parseKRW(draftStr);
    const confirmed = parseKRW(confirmedStr);

    await onSubmit({
      ...form,
      draftAmount:     draft,
      confirmedAmount: form.confirmed ? confirmed : draft, // FALSE면 기안금액을 E열에
    });
    onClose();
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{mode === 'add' ? '집행내역 추가' : '집행내역 수정'}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {error && (
            <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>
          )}

          {/* 사용구분 */}
          <div className="space-y-1.5">
            <Label>사용구분</Label>
            <select
              value={form.usageType}
              onChange={(e) => setForm((f) => ({ ...f, usageType: e.target.value }))}
              className="w-full rounded-md border border-[#E3E3E0] bg-white px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
            >
              <option value="">선택</option>
              {WEMEET_USAGE_TYPES.map((u) => <option key={u} value={u}>{u}</option>)}
            </select>
          </div>

          {/* 팀명 */}
          <div className="space-y-1.5">
            <Label>팀명</Label>
            <select
              value={form.teamName}
              onChange={(e) => setForm((f) => ({ ...f, teamName: e.target.value }))}
              className="w-full rounded-md border border-[#E3E3E0] bg-white px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
            >
              <option value="">선택</option>
              {teams.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>

          {/* 지출건명 + 사용일자 */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>지출건명</Label>
              <input
                type="text"
                value={form.description}
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                placeholder="지출건명 입력"
                className="w-full rounded-md border border-[#E3E3E0] px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>
            <div className="space-y-1.5">
              <Label>사용일자</Label>
              <input
                type="date"
                value={form.usageDate}
                onChange={(e) => setForm((f) => ({ ...f, usageDate: e.target.value }))}
                className="w-full rounded-md border border-[#E3E3E0] px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>
          </div>

          {/* 기안금액 */}
          <div className="space-y-1.5">
            <Label>기안금액</Label>
            <KRWInput
              value={draftStr}
              onChange={setDraftStr}
              placeholder="0"
              className="w-full rounded-md border border-[#E3E3E0] px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>

          {/* 확정여부 */}
          <div className="flex items-center gap-2">
            <input
              id="confirmed"
              type="checkbox"
              checked={form.confirmed}
              onChange={(e) => handleConfirmedChange(e.target.checked)}
              className="h-4 w-4 accent-primary"
            />
            <Label htmlFor="confirmed" className="cursor-pointer">확정</Label>
            {!form.confirmed && draftStr && (
              <span className="ml-auto text-xs text-gray-400">
                미확정 — 기안금액({draftStr})이 집계에 반영됩니다
              </span>
            )}
          </div>

          {/* 확정금액 — 확정=TRUE일 때만 표시 */}
          {form.confirmed && (
            <div className="space-y-1.5">
              <Label>확정금액</Label>
              <KRWInput
                value={confirmedStr}
                onChange={setConfirmedStr}
                placeholder="0"
                className="w-full rounded-md border border-[#E3E3E0] px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={isPending}>취소</Button>
          <Button onClick={handleSubmit} disabled={isPending}>
            {isPending ? '저장 중...' : mode === 'add' ? '추가' : '저장'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

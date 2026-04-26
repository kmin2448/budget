'use client';

import { useState, useCallback } from 'react';
import { Plus, Trash2, ChevronsDown } from 'lucide-react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { parseKRW, formatKRW } from '@/lib/utils';
import type { ExecutionPayload } from '@/hooks/useWeMeet';

interface TeamRow {
  id: number;
  teamName: string;
  usageDate: string;
  draftStr: string;
  confirmedStr: string;
  claimed: boolean;
  evidenceSubmitted: boolean;
}

interface Props {
  open: boolean;
  teams: string[];
  usageTypes: string[];
  onClose: () => void;
  onSave: (payloads: ExecutionPayload[]) => Promise<void>;
  isPending: boolean;
}

let _id = 0;
const newId = () => ++_id;

function blankRow(teamName = ''): TeamRow {
  return {
    id: newId(), teamName, usageDate: '', draftStr: '', confirmedStr: '',
    claimed: false, evidenceSubmitted: false,
  };
}

const fi  = 'w-full rounded border border-[#E3E3E0] px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-primary bg-white';
const fis = 'w-full rounded border border-[#E3E3E0] bg-white px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-primary';

export function WeMeetBulkAddModal({ open, teams, usageTypes, onClose, onSave, isPending }: Props) {
  const [usageType,   setUsageType]   = useState('');
  const [description, setDescription] = useState('');
  const [rows,        setRows]        = useState<TeamRow[]>([blankRow()]);
  const [error,       setError]       = useState('');

  // 일괄 적용 필드
  const [bulkDate,      setBulkDate]      = useState('');
  const [bulkDraftStr,  setBulkDraftStr]  = useState('');
  const [bulkConfStr,   setBulkConfStr]   = useState('');

  function reset() {
    setUsageType('');
    setDescription('');
    setRows([blankRow()]);
    setError('');
    setBulkDate('');
    setBulkDraftStr('');
    setBulkConfStr('');
  }

  function handleClose() {
    reset();
    onClose();
  }

  // 행 수정
  const updateRow = useCallback((id: number, patch: Partial<TeamRow>) => {
    setRows((prev) => prev.map((r) => r.id === id ? { ...r, ...patch } : r));
  }, []);

  // 행 삭제
  function removeRow(id: number) {
    setRows((prev) => prev.length > 1 ? prev.filter((r) => r.id !== id) : prev);
  }

  // 빈 행 추가
  function addRow() {
    setRows((prev) => [...prev, blankRow()]);
  }

  // 전체 팀 불러오기
  function loadAllTeams() {
    const existing = new Set(rows.map((r) => r.teamName).filter(Boolean));
    const toAdd = teams.filter((t) => !existing.has(t));
    if (toAdd.length === 0) return;
    setRows((prev) => {
      const base = prev.filter((r) => r.teamName); // 빈 행 제거
      return [...base, ...toAdd.map((t) => blankRow(t))];
    });
  }

  // 일괄 적용
  function applyBulk() {
    setRows((prev) => prev.map((r) => {
      const patch: Partial<TeamRow> = {};
      if (bulkDate)     patch.usageDate   = bulkDate;
      if (bulkDraftStr) patch.draftStr    = bulkDraftStr;
      if (bulkConfStr)  {
        patch.confirmedStr = bulkConfStr;
        if ((parseKRW(bulkConfStr) || 0) === 0) patch.claimed = false;
      }
      return { ...r, ...patch };
    }));
  }

  // 저장
  async function handleSave() {
    if (!usageType)   { setError('사용구분을 선택해주세요.'); return; }
    if (!description) { setError('지출건명을 입력해주세요.'); return; }

    const valid = rows.filter((r) => r.teamName);
    if (valid.length === 0) { setError('최소 1개 팀을 입력해주세요.'); return; }
    setError('');

    const payloads: ExecutionPayload[] = valid.map((r) => {
      const draft     = parseKRW(r.draftStr) || 0;
      const confirmed = parseKRW(r.confirmedStr) || 0;
      return {
        usageType,
        description,
        teamName:          r.teamName,
        draftAmount:       draft,
        confirmedAmount:   confirmed,
        claimed:           confirmed > 0 ? r.claimed : false,
        usageDate:         r.usageDate,
        evidenceSubmitted: r.evidenceSubmitted,
      };
    });

    await onSave(payloads);
    reset();
    onClose();
  }

  const validCount = rows.filter((r) => r.teamName).length;

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) handleClose(); }}>
      <DialogContent className="max-w-5xl w-full rounded-xl" showCloseButton={false}>
        <DialogHeader>
          <DialogTitle>집행내역 일괄 추가</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {error && (
            <p className="rounded-md bg-red-50 px-3 py-2 text-xs text-red-600">{error}</p>
          )}

          {/* 공통 필드 */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-xs font-medium text-[#6F6F6B]">사용구분 <span className="text-red-400">*</span></label>
              <select
                value={usageType}
                onChange={(e) => setUsageType(e.target.value)}
                className={fis}
              >
                <option value="">선택</option>
                {usageTypes.map((u) => <option key={u} value={u}>{u}</option>)}
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-[#6F6F6B]">지출건명 <span className="text-red-400">*</span></label>
              <input
                type="text"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="지출건명 입력"
                className={fi}
              />
            </div>
          </div>

          {/* 일괄 적용 바 */}
          <div className="flex items-center gap-2 rounded-md border border-[#E3E3E0] bg-[#F8FAFC] px-3 py-2">
            <span className="shrink-0 text-[11px] font-medium text-[#6F6F6B]">일괄 적용</span>
            <input
              type="date"
              value={bulkDate}
              onChange={(e) => setBulkDate(e.target.value)}
              placeholder="사용일자"
              className="w-36 rounded border border-[#E3E3E0] bg-white px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-primary"
            />
            <input
              type="text"
              value={bulkDraftStr}
              onChange={(e) => setBulkDraftStr(e.target.value)}
              placeholder="기안금액"
              className="w-28 rounded border border-[#E3E3E0] bg-white px-2 py-1 text-right text-xs focus:outline-none focus:ring-1 focus:ring-primary"
            />
            <input
              type="text"
              value={bulkConfStr}
              onChange={(e) => setBulkConfStr(e.target.value)}
              placeholder="확정금액"
              className="w-28 rounded border border-[#E3E3E0] bg-white px-2 py-1 text-right text-xs focus:outline-none focus:ring-1 focus:ring-primary"
            />
            <button
              onClick={applyBulk}
              disabled={!bulkDate && !bulkDraftStr && !bulkConfStr}
              className="flex items-center gap-1 rounded-md bg-[#D6E4F0] px-2.5 py-1 text-xs font-medium text-primary hover:bg-primary hover:text-white transition-colors disabled:opacity-40"
            >
              <ChevronsDown className="h-3 w-3" />
              전체 행에 적용
            </button>
          </div>

          {/* 팀 입력 테이블 */}
          <div className="overflow-auto max-h-96 rounded-md border border-[#E3E3E0]">
            <table className="w-full border-collapse text-xs">
              <thead className="sticky top-0 z-10">
                <tr className="bg-[#F3F3EE]">
                  <th className="px-3 py-2 text-left font-medium text-[#6F6F6B] whitespace-nowrap">팀명 <span className="text-red-400">*</span></th>
                  <th className="px-3 py-2 text-left font-medium text-[#6F6F6B] whitespace-nowrap">사용일자</th>
                  <th className="px-3 py-2 text-right font-medium text-[#6F6F6B] whitespace-nowrap">기안금액</th>
                  <th className="px-3 py-2 text-right font-medium text-[#6F6F6B] whitespace-nowrap">확정금액</th>
                  <th className="px-2 py-2 text-center font-medium text-[#6F6F6B] whitespace-nowrap">청구</th>
                  <th className="px-2 py-2 text-center font-medium text-[#6F6F6B] whitespace-nowrap">증빙</th>
                  <th className="px-2 py-2 font-medium text-[#6F6F6B]"></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row, idx) => {
                  const confAmt = parseKRW(row.confirmedStr) || 0;
                  return (
                    <tr key={row.id} className={idx % 2 === 0 ? 'bg-white' : 'bg-[#F5F9FC]'}>
                      {/* 팀명 */}
                      <td className="px-2 py-1.5 min-w-[130px]">
                        <select
                          value={row.teamName}
                          onChange={(e) => updateRow(row.id, { teamName: e.target.value })}
                          className={fis}
                        >
                          <option value="">팀 선택</option>
                          {teams.map((t) => <option key={t} value={t}>{t}</option>)}
                        </select>
                      </td>
                      {/* 사용일자 */}
                      <td className="px-2 py-1.5">
                        <input
                          type="date"
                          value={row.usageDate}
                          onChange={(e) => updateRow(row.id, { usageDate: e.target.value })}
                          className={fi}
                        />
                      </td>
                      {/* 기안금액 */}
                      <td className="px-2 py-1.5 min-w-[100px]">
                        <input
                          type="text"
                          value={row.draftStr}
                          onChange={(e) => updateRow(row.id, { draftStr: e.target.value })}
                          placeholder="0"
                          className={`${fi} text-right`}
                        />
                      </td>
                      {/* 확정금액 */}
                      <td className="px-2 py-1.5 min-w-[100px]">
                        <input
                          type="text"
                          value={row.confirmedStr}
                          onChange={(e) => {
                            const v = e.target.value;
                            updateRow(row.id, {
                              confirmedStr: v,
                              claimed: (parseKRW(v) || 0) === 0 ? false : row.claimed,
                            });
                          }}
                          placeholder="0=미확정"
                          className={`${fi} text-right`}
                        />
                      </td>
                      {/* 청구 */}
                      <td className="px-2 py-1.5 text-center">
                        <input
                          type="checkbox"
                          checked={row.claimed}
                          disabled={confAmt === 0}
                          onChange={(e) => updateRow(row.id, { claimed: e.target.checked })}
                          className="h-3.5 w-3.5 accent-primary disabled:opacity-40 disabled:cursor-default"
                          title={confAmt === 0 ? '확정금액 입력 후 활성화' : ''}
                        />
                      </td>
                      {/* 증빙 */}
                      <td className="px-2 py-1.5 text-center">
                        <input
                          type="checkbox"
                          checked={row.evidenceSubmitted}
                          onChange={(e) => updateRow(row.id, { evidenceSubmitted: e.target.checked })}
                          className="h-3.5 w-3.5 accent-primary"
                        />
                      </td>
                      {/* 삭제 */}
                      <td className="px-2 py-1.5 text-center">
                        <button
                          onClick={() => removeRow(row.id)}
                          disabled={rows.length === 1}
                          className="rounded p-1 text-gray-300 hover:bg-red-50 hover:text-red-500 transition-colors disabled:pointer-events-none"
                        >
                          <Trash2 className="h-3 w-3" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              {validCount > 0 && (
                <tfoot>
                  <tr className="border-t border-[#E3E3E0] bg-[#F3F3EE]">
                    <td colSpan={2} className="px-3 py-1.5 text-[11px] text-[#6F6F6B]">
                      합계 ({validCount}팀)
                    </td>
                    <td className="px-3 py-1.5 text-right text-[11px] text-[#131310]">
                      {formatKRW(rows.filter((r) => r.teamName).reduce((s, r) => s + (parseKRW(r.draftStr) || 0), 0))}
                    </td>
                    <td className="px-3 py-1.5 text-right text-[11px] text-[#131310]">
                      {formatKRW(rows.filter((r) => r.teamName).reduce((s, r) => s + (parseKRW(r.confirmedStr) || 0), 0))}
                    </td>
                    <td colSpan={3} />
                  </tr>
                </tfoot>
              )}
            </table>
          </div>

          {/* 행 추가 버튼들 */}
          <div className="flex items-center gap-2">
            <button
              onClick={addRow}
              className="flex items-center gap-1 text-xs text-gray-500 hover:text-primary transition-colors"
            >
              <Plus className="h-3 w-3" />
              행 추가
            </button>
            <span className="text-gray-200">|</span>
            <button
              onClick={loadAllTeams}
              disabled={teams.length === 0}
              className="flex items-center gap-1 text-xs text-gray-500 hover:text-primary transition-colors disabled:opacity-40"
            >
              <Plus className="h-3 w-3" />
              전체 팀 불러오기
              {teams.length > 0 && (
                <span className="ml-0.5 rounded-full bg-gray-100 px-1.5 py-px text-[10px] text-gray-500">
                  {teams.length}팀
                </span>
              )}
            </button>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleClose} disabled={isPending}>
            취소
          </Button>
          <Button
            onClick={() => { void handleSave(); }}
            disabled={isPending || validCount === 0 || !usageType || !description}
          >
            {isPending ? '저장 중...' : `저장 (${validCount}개 팀)`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

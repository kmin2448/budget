'use client';

import { useState, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ConfirmDialog } from '@/components/shared/ConfirmDialog';
import { Plus, Pencil, Trash2, Search, SendHorizonal } from 'lucide-react';
import { formatKRW } from '@/lib/utils';
import type { WeMeetExecution } from '@/types';
import { WEMEET_USAGE_TYPES } from '@/constants/wemeet';

interface Props {
  rows: WeMeetExecution[];
  teams: string[];
  canWrite: boolean;
  selectedTeam: string | null;
  onSelectTeam: (team: string | null) => void;
  onAdd: () => void;
  onEdit: (row: WeMeetExecution) => void;
  onDelete: (row: WeMeetExecution) => void;
  onSendToExpenditure: (row: WeMeetExecution) => void;
}

export function WeMeetTable({
  rows, teams, canWrite, selectedTeam, onSelectTeam,
  onAdd, onEdit, onDelete, onSendToExpenditure,
}: Props) {
  const [search, setSearch]           = useState('');
  const [filterTeam, setFilterTeam]   = useState<string>('');
  const [filterUsage, setFilterUsage] = useState<string>('');

  const [deleteOpen, setDeleteOpen]     = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<WeMeetExecution | null>(null);

  // 상단 팀 테이블 선택 시 필터 연동 (선택된 팀이 없으면 로컬 필터 사용)
  const effectiveTeam = selectedTeam ?? filterTeam;

  const filtered = useMemo(() => {
    return rows.filter((r) => {
      if (effectiveTeam && r.teamName !== effectiveTeam) return false;
      if (filterUsage && r.usageType !== filterUsage) return false;
      if (search && !r.teamName.includes(search) && !r.usageType.includes(search) && !r.description?.includes(search)) return false;
      return true;
    });
  }, [rows, effectiveTeam, filterUsage, search]);

  const totalDraft     = filtered.reduce((s, r) => s + r.draftAmount, 0);
  const totalConfirmed = filtered.reduce((s, r) => s + r.confirmedAmount, 0);

  const colSpan = canWrite ? 7 : 6;

  return (
    <div className="space-y-3">
      {/* 섹션 헤더 */}
      <div className="flex items-center gap-2">
        <h2 className="text-sm font-medium text-[#6F6F6B]">
          집행현황
          {selectedTeam && (
            <span className="ml-1.5 font-semibold text-primary">— {selectedTeam}</span>
          )}
        </h2>
        {selectedTeam && (
          <button
            onClick={() => onSelectTeam(null)}
            className="text-xs text-gray-400 hover:text-gray-600"
          >
            (전체 보기)
          </button>
        )}
      </div>

      {/* 필터 바 */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="팀명/구분/건명 검색"
            className="h-8 pl-8 text-sm w-48"
          />
        </div>

        {!selectedTeam && (
          <select
            value={filterTeam}
            onChange={(e) => setFilterTeam(e.target.value)}
            className="h-8 rounded-md border border-[#E3E3E0] bg-white px-2 text-sm text-[#131310] focus:outline-none focus:ring-1 focus:ring-primary"
          >
            <option value="">전체 팀</option>
            {teams.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        )}

        <select
          value={filterUsage}
          onChange={(e) => setFilterUsage(e.target.value)}
          className="h-8 rounded-md border border-[#E3E3E0] bg-white px-2 text-sm text-[#131310] focus:outline-none focus:ring-1 focus:ring-primary"
        >
          <option value="">전체 구분</option>
          {WEMEET_USAGE_TYPES.map((u) => <option key={u} value={u}>{u}</option>)}
        </select>

        {(filterTeam || filterUsage || search) && (
          <button
            onClick={() => { setFilterTeam(''); setFilterUsage(''); setSearch(''); }}
            className="text-xs text-gray-400 hover:text-gray-600"
          >
            초기화
          </button>
        )}

        {canWrite && (
          <Button size="sm" onClick={onAdd} className="ml-auto gap-1.5 h-8">
            <Plus className="h-3.5 w-3.5" />
            행 추가
          </Button>
        )}
      </div>

      {/* 테이블 */}
      <div className="overflow-x-auto rounded-lg border border-[#E3E3E0]">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="bg-[#F3F3EE]">
              <th className="px-3 py-2.5 text-left font-medium text-[#6F6F6B]">사용구분</th>
              <th className="px-3 py-2.5 text-left font-medium text-[#6F6F6B]">팀명</th>
              <th className="px-3 py-2.5 text-left font-medium text-[#6F6F6B]">지출건명</th>
              <th className="px-3 py-2.5 text-right font-medium text-[#6F6F6B]">기안금액</th>
              <th className="px-3 py-2.5 text-center font-medium text-[#6F6F6B]">확정</th>
              <th className="px-3 py-2.5 text-right font-medium text-[#6F6F6B]">확정금액</th>
              {canWrite && <th className="px-3 py-2.5 text-right font-medium text-[#6F6F6B]"></th>}
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={colSpan} className="py-10 text-center text-sm text-gray-400">
                  집행내역이 없습니다.
                </td>
              </tr>
            ) : (
              filtered.map((row, idx) => (
                <tr key={row.rowIndex} className={idx % 2 === 0 ? 'bg-white' : 'bg-[#F5F9FC]'}>
                  <td className="px-3 py-2">
                    <span className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium bg-primary-bg text-primary">
                      {row.usageType}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-[#131310]">{row.teamName}</td>
                  <td className="px-3 py-2 max-w-[200px]" title={row.description}>
                    <div className="truncate text-[#131310]">
                      {row.description || <span className="text-gray-300">—</span>}
                    </div>
                    {row.remarks && (
                      <div className="text-[11px] text-gray-400">{row.remarks}</div>
                    )}
                  </td>
                  <td className="px-3 py-2 text-right text-[#131310]">{formatKRW(row.draftAmount)}</td>
                  <td className="px-3 py-2 text-center">
                    <span className={`text-xs ${row.confirmedAmount > 0 ? 'text-complete' : 'text-gray-300'}`}>
                      {row.confirmedAmount > 0 ? '●' : '○'}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-right">
                    <span className={row.confirmedAmount > 0 ? 'font-medium text-[#131310]' : 'text-gray-400'}>
                      {row.confirmedAmount > 0 ? formatKRW(row.confirmedAmount) : '—'}
                    </span>
                  </td>
                  {canWrite && (
                    <td className="px-3 py-2">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          onClick={() => onSendToExpenditure(row)}
                          title="비목별 집행내역으로 전송"
                          className="rounded p-1 text-gray-400 hover:bg-green-50 hover:text-green-600 transition-colors"
                        >
                          <SendHorizonal className="h-3.5 w-3.5" />
                        </button>
                        <button
                          onClick={() => onEdit(row)}
                          className="rounded p-1 text-gray-400 hover:bg-blue-50 hover:text-blue-500 transition-colors"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                        <button
                          onClick={() => { setDeleteTarget(row); setDeleteOpen(true); }}
                          className="rounded p-1 text-gray-400 hover:bg-red-50 hover:text-red-500 transition-colors"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </td>
                  )}
                </tr>
              ))
            )}
          </tbody>
          {filtered.length > 0 && (
            <tfoot>
              <tr className="border-t border-[#E3E3E0] bg-[#F3F3EE] font-medium">
                <td colSpan={3} className="px-3 py-2 text-[#6F6F6B]">합계 ({filtered.length}건)</td>
                <td className="px-3 py-2 text-right text-[#131310]">{formatKRW(totalDraft)}</td>
                <td />
                <td className="px-3 py-2 text-right text-[#131310]">{formatKRW(totalConfirmed)}</td>
                {canWrite && <td />}
              </tr>
            </tfoot>
          )}
        </table>
      </div>

      <ConfirmDialog
        open={deleteOpen}
        title="집행내역 삭제"
        description={`"${deleteTarget?.teamName} - ${deleteTarget?.usageType}" 내역을 삭제하시겠습니까?`}
        loading={false}
        onConfirm={() => {
          if (deleteTarget) onDelete(deleteTarget);
          setDeleteOpen(false);
          setDeleteTarget(null);
        }}
        onClose={() => { setDeleteOpen(false); setDeleteTarget(null); }}
      />
    </div>
  );
}

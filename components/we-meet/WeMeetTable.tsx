'use client';

import { useState, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ConfirmDialog } from '@/components/shared/ConfirmDialog';
import { Plus, Pencil, Trash2, Search } from 'lucide-react';
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
  onToggleConfirmed: (row: WeMeetExecution) => void;
  isToggling: boolean;
}

export function WeMeetTable({
  rows, teams, canWrite, selectedTeam, onSelectTeam,
  onAdd, onEdit, onDelete, onToggleConfirmed, isToggling,
}: Props) {
  const [search, setSearch]           = useState('');
  const [filterTeam, setFilterTeam]   = useState<string>('');
  const [filterUsage, setFilterUsage] = useState<string>('');

  const [deleteOpen, setDeleteOpen]     = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<WeMeetExecution | null>(null);

  // 카드 클릭 시 필터 연동
  const effectiveTeam = selectedTeam ?? filterTeam;

  const filtered = useMemo(() => {
    return rows.filter((r) => {
      if (effectiveTeam && r.teamName !== effectiveTeam) return false;
      if (filterUsage && r.usageType !== filterUsage) return false;
      if (search && !r.teamName.includes(search) && !r.usageType.includes(search)) return false;
      return true;
    });
  }, [rows, effectiveTeam, filterUsage, search]);

  function handleDeleteClick(row: WeMeetExecution) {
    setDeleteTarget(row);
    setDeleteOpen(true);
  }

  const totalPlanned   = filtered.reduce((s, r) => s + r.plannedAmount, 0);
  const totalConfirmed = filtered.reduce((s, r) => s + (r.confirmed ? r.confirmedAmount : 0), 0);

  return (
    <div className="space-y-3">
      {/* 필터 바 */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="팀명/사용구분 검색"
            className="h-8 pl-8 text-sm w-44"
          />
        </div>

        <select
          value={selectedTeam ?? filterTeam}
          onChange={(e) => {
            onSelectTeam(null);
            setFilterTeam(e.target.value);
          }}
          className="h-8 rounded-md border border-[#E3E3E0] bg-white px-2 text-sm text-[#131310] focus:outline-none focus:ring-1 focus:ring-primary"
        >
          <option value="">전체 팀</option>
          {teams.map((t) => <option key={t} value={t}>{t}</option>)}
        </select>

        <select
          value={filterUsage}
          onChange={(e) => setFilterUsage(e.target.value)}
          className="h-8 rounded-md border border-[#E3E3E0] bg-white px-2 text-sm text-[#131310] focus:outline-none focus:ring-1 focus:ring-primary"
        >
          <option value="">전체 구분</option>
          {WEMEET_USAGE_TYPES.map((u) => <option key={u} value={u}>{u}</option>)}
        </select>

        {(selectedTeam || filterTeam || filterUsage || search) && (
          <button
            onClick={() => { onSelectTeam(null); setFilterTeam(''); setFilterUsage(''); setSearch(''); }}
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
              <th className="px-3 py-2.5 text-right font-medium text-[#6F6F6B]">계획금액</th>
              <th className="px-3 py-2.5 text-center font-medium text-[#6F6F6B]">확정</th>
              <th className="px-3 py-2.5 text-right font-medium text-[#6F6F6B]">확정금액</th>
              {canWrite && <th className="px-3 py-2.5 text-right font-medium text-[#6F6F6B]"></th>}
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={canWrite ? 6 : 5} className="py-10 text-center text-sm text-gray-400">
                  집행내역이 없습니다.
                </td>
              </tr>
            ) : (
              filtered.map((row, idx) => (
                <tr
                  key={row.rowIndex}
                  className={idx % 2 === 0 ? 'bg-white' : 'bg-[#F5F9FC]'}
                >
                  <td className="px-3 py-2">
                    <span className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium bg-primary-bg text-primary">
                      {row.usageType}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-[#131310]">{row.teamName}</td>
                  <td className="px-3 py-2 text-right text-[#131310]">{formatKRW(row.plannedAmount)}</td>
                  <td className="px-3 py-2 text-center">
                    <input
                      type="checkbox"
                      checked={row.confirmed}
                      disabled={!canWrite || isToggling}
                      onChange={() => onToggleConfirmed(row)}
                      className="h-4 w-4 cursor-pointer accent-primary disabled:cursor-default"
                    />
                  </td>
                  <td className="px-3 py-2 text-right">
                    <span className={row.confirmed ? 'font-medium text-[#131310]' : 'text-gray-400'}>
                      {formatKRW(row.confirmedAmount)}
                    </span>
                  </td>
                  {canWrite && (
                    <td className="px-3 py-2">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          onClick={() => onEdit(row)}
                          className="rounded p-1 text-gray-400 hover:bg-blue-50 hover:text-blue-500 transition-colors"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                        <button
                          onClick={() => handleDeleteClick(row)}
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
                <td colSpan={2} className="px-3 py-2 text-[#6F6F6B]">합계 ({filtered.length}건)</td>
                <td className="px-3 py-2 text-right text-[#131310]">{formatKRW(totalPlanned)}</td>
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

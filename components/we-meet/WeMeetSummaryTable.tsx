'use client';

import { useState, useMemo } from 'react';
import { ChevronDown, ChevronRight, ChevronsDownUp, ChevronsUpDown } from 'lucide-react';
import { formatKRW } from '@/lib/utils';
import type { WeMeetTeamSummary } from '@/types';

interface Props {
  summaries: WeMeetTeamSummary[];
  selectedTeam: string | null;
  onSelectTeam: (team: string | null) => void;
}

const USAGE_LABELS = [
  { key: 'mentoring'       as const, label: '멘토링' },
  { key: 'meeting'         as const, label: '회의비' },
  { key: 'material'        as const, label: '재료비' },
  { key: 'studentActivity' as const, label: '학생활동지원비' },
];

export function WeMeetSummaryTable({ summaries, selectedTeam, onSelectTeam }: Props) {
  const [openRows, setOpenRows] = useState<Set<string>>(new Set());

  const allOpen = useMemo(() => summaries.every((s) => openRows.has(s.teamName)), [summaries, openRows]);

  function toggleRow(teamName: string) {
    setOpenRows((prev) => {
      const next = new Set(prev);
      if (next.has(teamName)) next.delete(teamName);
      else next.add(teamName);
      return next;
    });
  }

  function toggleAll() {
    if (allOpen) {
      setOpenRows(new Set());
    } else {
      setOpenRows(new Set(summaries.map((s) => s.teamName)));
    }
  }

  const grandTotal = useMemo(() => summaries.reduce((acc, s) => ({
    totalBudget:      acc.totalBudget + s.totalBudget,
    confirmedTotal:   acc.confirmedTotal + s.confirmed.total,
    confirmedBalance: acc.confirmedBalance + s.confirmedBalance,
    expectedBalance:  acc.expectedBalance + s.expectedBalance,
  }), { totalBudget: 0, confirmedTotal: 0, confirmedBalance: 0, expectedBalance: 0 }), [summaries]);

  if (summaries.length === 0) {
    return (
      <div className="rounded-lg border border-[#E3E3E0] bg-white px-4 py-6 text-center text-sm text-gray-400">
        팀 데이터가 없습니다.
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-[#E3E3E0]">
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="bg-[#F3F3EE]">
            <th className="w-8 px-2 py-2.5">
              <button
                onClick={toggleAll}
                title={allOpen ? '전체 접기' : '전체 펼치기'}
                className="flex items-center justify-center rounded p-0.5 text-gray-400 hover:bg-gray-200 transition-colors"
              >
                {allOpen
                  ? <ChevronsDownUp className="h-3.5 w-3.5" />
                  : <ChevronsUpDown className="h-3.5 w-3.5" />}
              </button>
            </th>
            <th className="px-3 py-2.5 text-left font-medium text-[#6F6F6B]">팀명</th>
            <th className="px-3 py-2.5 text-right font-medium text-[#6F6F6B]">배정예산</th>
            <th className="px-3 py-2.5 text-right font-medium text-[#6F6F6B]">확정합계</th>
            <th className="px-3 py-2.5 text-right font-medium text-[#6F6F6B]">확정잔액</th>
            <th className="px-3 py-2.5 text-right font-medium text-[#6F6F6B]">예정잔액</th>
          </tr>
        </thead>
        <tbody>
          {summaries.map((s, idx) => {
            const isOpen     = openRows.has(s.teamName);
            const isSelected = selectedTeam === s.teamName;
            const isOver     = s.confirmedBalance < 0;
            const isWarn     = s.expectedBalance < 0 && s.confirmedBalance >= 0;
            const rowBg      = isSelected ? 'bg-primary-bg' : idx % 2 === 0 ? 'bg-white' : 'bg-[#F5F9FC]';

            return [
              // 팀 요약 행
              <tr
                key={s.teamName}
                className={`${rowBg} cursor-pointer hover:bg-primary-bg/60 transition-colors`}
                onClick={() => onSelectTeam(isSelected ? null : s.teamName)}
              >
                <td className="px-2 py-2 text-center">
                  <button
                    onClick={(e) => { e.stopPropagation(); toggleRow(s.teamName); }}
                    className="flex items-center justify-center rounded p-0.5 text-gray-400 hover:bg-gray-200 transition-colors"
                  >
                    {isOpen
                      ? <ChevronDown className="h-3.5 w-3.5" />
                      : <ChevronRight className="h-3.5 w-3.5" />}
                  </button>
                </td>
                <td className={`px-3 py-2 font-medium ${isSelected ? 'text-primary' : 'text-[#131310]'}`}>
                  {s.teamName}
                </td>
                <td className="px-3 py-2 text-right text-[#131310]">{formatKRW(s.totalBudget)}</td>
                <td className="px-3 py-2 text-right font-medium text-[#131310]">{formatKRW(s.confirmed.total)}</td>
                <td className={`px-3 py-2 text-right font-medium ${isOver ? 'text-red-500' : 'text-complete'}`}>
                  {formatKRW(s.confirmedBalance)}
                </td>
                <td className={`px-3 py-2 text-right ${isWarn ? 'text-amber-500' : 'text-gray-500'}`}>
                  {formatKRW(s.expectedBalance)}
                </td>
              </tr>,

              // 펼쳐진 상세 행 (사용구분별)
              isOpen && (
                <tr key={`${s.teamName}-detail`} className={rowBg}>
                  <td />
                  <td colSpan={5} className="px-3 pb-2 pt-0">
                    <div className="rounded-md border border-[#E3E3E0] overflow-hidden">
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="bg-[#F0F0EE]">
                            <th className="px-3 py-1.5 text-left font-medium text-[#6F6F6B]">사용구분</th>
                            <th className="px-3 py-1.5 text-right font-medium text-[#6F6F6B]">확정</th>
                            <th className="px-3 py-1.5 text-right font-medium text-[#6F6F6B]">기안(미확정)</th>
                            <th className="px-3 py-1.5 text-right font-medium text-[#6F6F6B]">소계</th>
                          </tr>
                        </thead>
                        <tbody>
                          {USAGE_LABELS.map((u) => (
                            <tr key={u.key} className="border-t border-[#F0F0EE]">
                              <td className="px-3 py-1.5 text-[#131310]">{u.label}</td>
                              <td className="px-3 py-1.5 text-right text-[#131310]">{formatKRW(s.confirmed[u.key])}</td>
                              <td className="px-3 py-1.5 text-right text-gray-400">{formatKRW(s.pending[u.key])}</td>
                              <td className="px-3 py-1.5 text-right font-medium text-[#131310]">
                                {formatKRW(s.confirmed[u.key] + s.pending[u.key])}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </td>
                </tr>
              ),
            ];
          })}
        </tbody>
        <tfoot>
          <tr className="border-t-2 border-[#E3E3E0] bg-[#F3F3EE] font-semibold">
            <td />
            <td className="px-3 py-2 text-[#6F6F6B]">합계 ({summaries.length}팀)</td>
            <td className="px-3 py-2 text-right text-[#131310]">{formatKRW(grandTotal.totalBudget)}</td>
            <td className="px-3 py-2 text-right text-[#131310]">{formatKRW(grandTotal.confirmedTotal)}</td>
            <td className={`px-3 py-2 text-right ${grandTotal.confirmedBalance < 0 ? 'text-red-500' : 'text-[#131310]'}`}>
              {formatKRW(grandTotal.confirmedBalance)}
            </td>
            <td className={`px-3 py-2 text-right ${grandTotal.expectedBalance < 0 ? 'text-amber-500' : 'text-[#131310]'}`}>
              {formatKRW(grandTotal.expectedBalance)}
            </td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

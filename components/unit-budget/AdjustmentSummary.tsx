'use client';

import { useMemo } from 'react';
import { cn, formatKRW } from '@/lib/utils';
import type { UnitTask } from '@/types';

interface Props {
  unitTasks: UnitTask[];
  adjustments: Record<number, number>; // rowIndex → adjustment
}

interface ProgramChange {
  rowIndex: number;
  unitName: string;
  programName: string;
  category: string;
  subcategory: string;
  subDetail: string;
  before: number;
  adj: number;
  after: number;
}

interface CategoryChange {
  category: string;
  before: number;
  adj: number;
  after: number;
}

interface SubDetailChange {
  category: string;
  subcategory: string;
  subDetail: string;
  before: number;
  adj: number;
  after: number;
}

function adjColor(v: number) {
  return v > 0 ? 'text-blue-600' : v < 0 ? 'text-red-500' : 'text-text-secondary';
}
function adjPrefix(v: number) {
  return v > 0 ? '+' : '';
}

export function AdjustmentSummary({ unitTasks, adjustments }: Props) {
  const { programChanges, categoryChanges, subDetailChanges } = useMemo(() => {
    const programs: ProgramChange[] = [];

    for (const unit of unitTasks) {
      for (const row of unit.rows) {
        for (const prog of row.programs) {
          const adj = adjustments[prog.rowIndex];
          if (adj === undefined || adj === 0) continue;
          programs.push({
            rowIndex: prog.rowIndex,
            unitName: unit.name,
            programName: prog.programName,
            category: row.category,
            subcategory: row.subcategory,
            subDetail: row.subDetail,
            before: prog.budgetPlan,
            adj,
            after: prog.budgetPlan + adj,
          });
        }
      }
    }

    // 비목별 집계
    const catMap = new Map<string, { before: number; adj: number }>();
    for (const p of programs) {
      const e = catMap.get(p.category) ?? { before: 0, adj: 0 };
      catMap.set(p.category, { before: e.before + p.before, adj: e.adj + p.adj });
    }
    const cats: CategoryChange[] = Array.from(catMap.entries()).map(([cat, v]) => ({
      category: cat,
      before: v.before,
      adj: v.adj,
      after: v.before + v.adj,
    }));

    // 세목&보조세목별 집계
    const subMap = new Map<string, { cat: string; sub: string; det: string; before: number; adj: number }>();
    for (const p of programs) {
      const key = `${p.category}||${p.subcategory}||${p.subDetail}`;
      const e = subMap.get(key) ?? { cat: p.category, sub: p.subcategory, det: p.subDetail, before: 0, adj: 0 };
      subMap.set(key, { ...e, before: e.before + p.before, adj: e.adj + p.adj });
    }
    const subs: SubDetailChange[] = Array.from(subMap.values()).map((v) => ({
      category: v.cat,
      subcategory: v.sub,
      subDetail: v.det,
      before: v.before,
      adj: v.adj,
      after: v.before + v.adj,
    }));

    return { programChanges: programs, categoryChanges: cats, subDetailChanges: subs };
  }, [unitTasks, adjustments]);

  if (programChanges.length === 0) return null;

  // 단위과제별 그룹핑
  const byUnit = new Map<string, ProgramChange[]>();
  for (const p of programChanges) {
    if (!byUnit.has(p.unitName)) byUnit.set(p.unitName, []);
    byUnit.get(p.unitName)!.push(p);
  }

  return (
    <div className="space-y-4">
      <h3 className="text-sm font-semibold text-[#131310]">변경 내역 요약</h3>

      {/* Section 1: 단위과제-프로그램 간 변경 내역 */}
      <div className="overflow-hidden rounded-lg border border-divider bg-white">
        <div className="border-b border-divider bg-[#F8FAFC] px-4 py-2.5">
          <p className="text-xs font-semibold text-text-secondary">단위과제 · 프로그램 간 변경 내역</p>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-divider bg-[#FAFAFA]">
              <th className="px-3 py-2 text-left text-xs font-medium text-text-secondary">단위과제</th>
              <th className="px-3 py-2 text-left text-xs font-medium text-text-secondary">프로그램명</th>
              <th className="px-3 py-2 text-left text-xs font-medium text-text-secondary w-[200px]">비목 &gt; 세목 &gt; 보조세목</th>
              <th className="px-3 py-2 text-right text-xs font-medium text-text-secondary w-[110px]">변경 전</th>
              <th className="px-3 py-2 text-right text-xs font-medium text-text-secondary w-[110px]">증감액</th>
              <th className="px-3 py-2 text-right text-xs font-medium text-text-secondary w-[110px]">변경 후</th>
            </tr>
          </thead>
          <tbody>
            {Array.from(byUnit.entries()).map(([unitName, progs]) => (
              progs.map((p, i) => (
                <tr key={p.rowIndex} className="border-b border-divider last:border-0 hover:bg-[#F8FAFC]">
                  <td className="px-3 py-2 text-xs text-primary font-medium">
                    {i === 0 ? unitName : ''}
                  </td>
                  <td className="px-3 py-2 text-xs text-[#131310]">{p.programName || '—'}</td>
                  <td className="px-3 py-2 text-xs text-text-secondary">
                    <span title={`${p.category} > ${p.subcategory} > ${p.subDetail}`} className="block truncate max-w-[200px]">
                      {[p.category, p.subcategory, p.subDetail].filter(Boolean).join(' > ')}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-right text-xs tabular-nums text-[#131310]">
                    {formatKRW(p.before)}
                  </td>
                  <td className={cn('px-3 py-2 text-right text-xs tabular-nums font-semibold', adjColor(p.adj))}>
                    {adjPrefix(p.adj)}{formatKRW(p.adj)}
                  </td>
                  <td className="px-3 py-2 text-right text-xs tabular-nums font-medium text-[#131310]">
                    {formatKRW(p.after)}
                  </td>
                </tr>
              ))
            ))}
          </tbody>
        </table>
      </div>

      {/* Section 2: 비목별 변경내역 */}
      <div className="overflow-hidden rounded-lg border border-divider bg-white">
        <div className="border-b border-divider bg-[#F8FAFC] px-4 py-2.5">
          <p className="text-xs font-semibold text-text-secondary">비목별 변경 내역</p>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-divider bg-[#FAFAFA]">
              <th className="px-3 py-2 text-left text-xs font-medium text-text-secondary">비목</th>
              <th className="px-3 py-2 text-right text-xs font-medium text-text-secondary w-[130px]">변경 전</th>
              <th className="px-3 py-2 text-right text-xs font-medium text-text-secondary w-[130px]">증감액</th>
              <th className="px-3 py-2 text-right text-xs font-medium text-text-secondary w-[130px]">변경 후</th>
            </tr>
          </thead>
          <tbody>
            {categoryChanges.map((c) => (
              <tr key={c.category} className="border-b border-divider last:border-0 hover:bg-[#F8FAFC]">
                <td className="px-3 py-2 text-xs text-[#131310] font-medium">{c.category}</td>
                <td className="px-3 py-2 text-right text-xs tabular-nums text-[#131310]">
                  {formatKRW(c.before)}
                </td>
                <td className={cn('px-3 py-2 text-right text-xs tabular-nums font-semibold', adjColor(c.adj))}>
                  {adjPrefix(c.adj)}{formatKRW(c.adj)}
                </td>
                <td className="px-3 py-2 text-right text-xs tabular-nums font-medium text-[#131310]">
                  {formatKRW(c.after)}
                </td>
              </tr>
            ))}
            {/* 합계 */}
            <tr className="border-t-2 border-primary/20 bg-primary-bg">
              <td className="px-3 py-2.5 text-xs font-semibold text-primary">합계</td>
              <td className="px-3 py-2.5 text-right text-xs tabular-nums font-semibold text-primary">
                {formatKRW(categoryChanges.reduce((s, c) => s + c.before, 0))}
              </td>
              <td className={cn(
                'px-3 py-2.5 text-right text-xs tabular-nums font-bold',
                adjColor(categoryChanges.reduce((s, c) => s + c.adj, 0)),
              )}>
                {(() => {
                  const total = categoryChanges.reduce((s, c) => s + c.adj, 0);
                  return `${adjPrefix(total)}${formatKRW(total)}`;
                })()}
              </td>
              <td className="px-3 py-2.5 text-right text-xs tabular-nums font-semibold text-primary">
                {formatKRW(categoryChanges.reduce((s, c) => s + c.after, 0))}
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* Section 3: 세목&보조세목 간 변경 내역 요약 */}
      <div className="overflow-hidden rounded-lg border border-divider bg-white">
        <div className="border-b border-divider bg-[#F8FAFC] px-4 py-2.5">
          <p className="text-xs font-semibold text-text-secondary">세목 · 보조세목 간 변경 내역</p>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-divider bg-[#FAFAFA]">
              <th className="px-3 py-2 text-left text-xs font-medium text-text-secondary">비목</th>
              <th className="px-3 py-2 text-left text-xs font-medium text-text-secondary">세목</th>
              <th className="px-3 py-2 text-left text-xs font-medium text-text-secondary">보조세목</th>
              <th className="px-3 py-2 text-right text-xs font-medium text-text-secondary w-[120px]">변경 전</th>
              <th className="px-3 py-2 text-right text-xs font-medium text-text-secondary w-[120px]">증감액</th>
              <th className="px-3 py-2 text-right text-xs font-medium text-text-secondary w-[120px]">변경 후</th>
            </tr>
          </thead>
          <tbody>
            {subDetailChanges.map((s, i) => (
              <tr key={i} className="border-b border-divider last:border-0 hover:bg-[#F8FAFC]">
                <td className="px-3 py-2 text-xs text-[#131310]">{s.category}</td>
                <td className="px-3 py-2 text-xs text-text-secondary">{s.subcategory || '—'}</td>
                <td className="px-3 py-2 text-xs text-text-secondary">{s.subDetail || '—'}</td>
                <td className="px-3 py-2 text-right text-xs tabular-nums text-[#131310]">
                  {formatKRW(s.before)}
                </td>
                <td className={cn('px-3 py-2 text-right text-xs tabular-nums font-semibold', adjColor(s.adj))}>
                  {adjPrefix(s.adj)}{formatKRW(s.adj)}
                </td>
                <td className="px-3 py-2 text-right text-xs tabular-nums font-medium text-[#131310]">
                  {formatKRW(s.after)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

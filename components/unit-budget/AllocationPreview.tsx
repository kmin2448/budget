'use client';

import { cn, formatKRW } from '@/lib/utils';

export interface AllocationDiffRow {
  category: string;
  subcategory: string;
  subDetail: string;
  rowOffset: number;
  before: number;
  after: number;
}

interface Props {
  diffs: AllocationDiffRow[];
}

function diffColor(v: number) {
  return v > 0 ? 'text-blue-600' : v < 0 ? 'text-red-500' : 'text-text-secondary';
}
function diffPrefix(v: number) {
  return v > 0 ? '+' : '';
}

export function AllocationPreview({ diffs }: Props) {
  // 비목별 그룹핑
  const catMap = new Map<string, AllocationDiffRow[]>();
  for (const d of diffs) {
    if (!catMap.has(d.category)) catMap.set(d.category, []);
    catMap.get(d.category)!.push(d);
  }

  const total = {
    before: diffs.reduce((s, d) => s + d.before, 0),
    after: diffs.reduce((s, d) => s + d.after, 0),
    diff: diffs.reduce((s, d) => s + (d.after - d.before), 0),
  };

  return (
    <div className="overflow-hidden rounded-[2px] border border-amber-200 bg-white">
      <div className="border-b border-amber-200 bg-amber-50 px-4 py-2.5">
        <p className="text-xs font-semibold text-amber-700">
          배정금액 변경 미리보기
          <span className="ml-2 font-normal text-amber-600">
            — 확인 후 &quot;배정금액 확정&quot; 버튼을 눌러 반영하세요.
          </span>
        </p>
      </div>

      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-divider bg-[#FAFAFA]">
            <th className="px-3 py-2 text-left text-xs font-medium text-text-secondary">비목</th>
            <th className="px-3 py-2 text-left text-xs font-medium text-text-secondary">세목</th>
            <th className="px-3 py-2 text-left text-xs font-medium text-text-secondary">보조세목</th>
            <th className="px-3 py-2 text-right text-xs font-medium text-text-secondary w-[130px]">현재 배정금액</th>
            <th className="px-3 py-2 text-right text-xs font-medium text-text-secondary w-[130px]">새 배정금액</th>
            <th className="px-3 py-2 text-right text-xs font-medium text-text-secondary w-[120px]">증감</th>
          </tr>
        </thead>
        <tbody>
          {diffs.length === 0 ? (
            <tr>
              <td colSpan={6} className="px-4 py-4 text-center text-xs text-text-secondary">
                변동사항 없음 — 계획금액과 배정금액이 모두 일치합니다.
              </td>
            </tr>
          ) : (
            <>
              {Array.from(catMap.entries()).map(([cat, rows]) => {
                const catBefore = rows.reduce((s, r) => s + r.before, 0);
                const catAfter  = rows.reduce((s, r) => s + r.after,  0);
                const catDiff   = catAfter - catBefore;
                return (
                  <>
                    {rows.map((row, i) => {
                      const d = row.after - row.before;
                      return (
                        <tr
                          key={`${row.category}-${row.subcategory}-${row.subDetail}`}
                          className="border-b border-divider hover:bg-[#F8FAFC]"
                        >
                          <td className="px-3 py-2 text-xs text-[#131310]">{i === 0 ? cat : ''}</td>
                          <td className="px-3 py-2 text-xs text-text-secondary">{row.subcategory || '—'}</td>
                          <td className="px-3 py-2 text-xs text-text-secondary">{row.subDetail || '—'}</td>
                          <td className="px-3 py-2 text-right text-xs tabular-nums text-[#131310]">
                            {formatKRW(row.before)}
                          </td>
                          <td className="px-3 py-2 text-right text-xs tabular-nums font-medium text-[#131310]">
                            {formatKRW(row.after)}
                          </td>
                          <td className={cn('px-3 py-2 text-right text-xs tabular-nums font-semibold', diffColor(d))}>
                            {diffPrefix(d)}{formatKRW(d)}
                          </td>
                        </tr>
                      );
                    })}
                    {/* 비목 소계 */}
                    <tr className="border-b border-divider bg-[#F0F6FC]">
                      <td className="px-3 py-1.5 text-xs text-text-secondary" colSpan={3}>
                        {cat} 소계
                      </td>
                      <td className="px-3 py-1.5 text-right text-xs tabular-nums font-medium text-[#131310]">
                        {formatKRW(catBefore)}
                      </td>
                      <td className="px-3 py-1.5 text-right text-xs tabular-nums font-medium text-[#131310]">
                        {formatKRW(catAfter)}
                      </td>
                      <td className={cn('px-3 py-1.5 text-right text-xs tabular-nums font-semibold', diffColor(catDiff))}>
                        {diffPrefix(catDiff)}{formatKRW(catDiff)}
                      </td>
                    </tr>
                  </>
                );
              })}
              {/* 전체 합계 */}
              <tr className="border-t-2 border-amber-200 bg-amber-50">
                <td colSpan={3} className="px-3 py-2.5 text-xs font-semibold text-amber-700">합계</td>
                <td className="px-3 py-2.5 text-right text-xs tabular-nums font-semibold text-amber-700">
                  {formatKRW(total.before)}
                </td>
                <td className="px-3 py-2.5 text-right text-xs tabular-nums font-semibold text-amber-700">
                  {formatKRW(total.after)}
                </td>
                <td className={cn('px-3 py-2.5 text-right text-xs tabular-nums font-bold', diffColor(total.diff))}>
                  {diffPrefix(total.diff)}{formatKRW(total.diff)}
                </td>
              </tr>
            </>
          )}
        </tbody>
      </table>
    </div>
  );
}

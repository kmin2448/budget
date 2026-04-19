// components/budget/BudgetConfirmModal.tsx
// 변경 확정 모달: 날짜 입력 + PDF 생성 + 이력 저장
'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { formatKRW } from '@/lib/utils';
import { BudgetPdfDownload } from '@/components/budget/BudgetPdfDownload';
import type { BudgetDetailRow, BudgetCategoryRow } from '@/types';

interface Props {
  open: boolean;
  detailSnapshot: BudgetDetailRow[];
  categorySnapshot: BudgetCategoryRow[];
  isLoading: boolean;
  onConfirm: (changedAt: string) => void;
  onClose: () => void;
}

function adjCell(adj: number) {
  if (adj === 0) return <span className="text-gray-400">-</span>;
  return (
    <span className={adj > 0 ? 'text-blue-700' : 'text-red-700'}>
      {adj > 0 ? '+' : ''}{formatKRW(adj)}
    </span>
  );
}

function PageHeader({ title, changedAt }: { title: string; changedAt: string }) {
  return (
    <div className="mb-3 text-center">
      <p className="text-sm font-bold text-gray-900">예산변경 비교표 — {title}</p>
      <p className="text-[10px] text-gray-500">변경일자: {changedAt}</p>
    </div>
  );
}


export function BudgetConfirmModal({
  open,
  detailSnapshot,
  categorySnapshot,
  isLoading,
  onConfirm,
  onClose,
}: Props) {
  const getLocalDate = () => new Date().toLocaleDateString('sv');
  const [changedAt, setChangedAt] = useState(getLocalDate);

  // 모달이 열릴 때마다 오늘 날짜(로컬 시간대)로 초기화
  useEffect(() => {
    if (open) setChangedAt(getLocalDate());
  }, [open]);

  if (!open) return null;

  const hasChanges = detailSnapshot.some((r) => r.adjustment !== 0);

  // 화면 미리보기용 데이터 준비
  const grouped = detailSnapshot.reduce<Record<string, BudgetDetailRow[]>>((acc, row) => {
    if (!acc[row.category]) acc[row.category] = [];
    acc[row.category].push(row);
    return acc;
  }, {});

  const subMap = new Map<string, Map<string, BudgetDetailRow[]>>();
  for (const row of [...detailSnapshot].sort((a, b) => (a.subcategory || '').localeCompare(b.subcategory || '', 'ko'))) {
    const sub    = row.subcategory || '-';
    const detail = row.subDetail   || '-';
    if (!subMap.has(sub)) subMap.set(sub, new Map());
    const dm = subMap.get(sub)!;
    if (!dm.has(detail)) dm.set(detail, []);
    dm.get(detail)!.push(row);
  }

  const totalBefore = categorySnapshot.reduce((s, r) => s + r.allocation, 0);
  const totalAdj    = categorySnapshot.reduce((s, r) => s + r.adjustment, 0);
  const totalAfter  = categorySnapshot.reduce((s, r) => s + r.afterAllocation, 0);
  const totalExec   = categorySnapshot.reduce((s, r) => s + r.executionComplete + r.executionPlanned, 0);
  const totalBal    = categorySnapshot.reduce((s, r) => s + r.balance, 0);

  const thCls  = 'py-1.5 px-1.5 font-semibold text-left text-[10px]';
  const thRCls = 'py-1.5 px-1.5 font-semibold text-right whitespace-nowrap text-[10px]';
  const tdCls  = 'py-1 px-1.5 text-[10px]';
  const tdRCls = 'py-1 px-1.5 text-right tabular-nums text-[10px]';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-5xl rounded-xl bg-white shadow-2xl flex flex-col max-h-[90vh]">
        {/* 헤더 */}
        <div className="flex items-center justify-between border-b px-6 py-4 shrink-0">
          <h2 className="text-lg font-bold text-gray-900">예산변경 확정</h2>
          <button onClick={onClose} disabled={isLoading} className="text-gray-400 hover:text-gray-600">✕</button>
        </div>

        {/* 본문 */}
        <div className="overflow-y-auto px-6 py-5 space-y-5 flex-1">
          {/* 변경일자 */}
          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700">변경일자</label>
            <input
              type="date"
              value={changedAt}
              onChange={(e) => setChangedAt(e.target.value)}
              max={getLocalDate()}
              className="rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/40"
            />
          </div>

          {/* ── 미리보기 페이지 1: 통합 ── */}
          <div className="rounded-[2px] border p-4 bg-white">
            <PageHeader title="1. 통합" changedAt={changedAt} />
            <table className="w-full border-collapse">
              <thead>
                <tr className="bg-primary text-white">
                  <th className={thCls} style={{ width: '13%' }}>비목</th>
                  <th className={thCls} style={{ width: '12%' }}>세목</th>
                  <th className={thCls} style={{ width: '13%' }}>세세목</th>
                  <th className={thRCls} style={{ width: '12%' }}>편성액</th>
                  <th className={thRCls} style={{ width: '10%' }}>증감액</th>
                  <th className={thRCls} style={{ width: '12%' }}>변경후 편성액</th>
                  <th className={thRCls} style={{ width: '14%' }}>집행금액</th>
                  <th className={thRCls} style={{ width: '14%' }}>잔액</th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(grouped).map(([category, rows]) => {
                  const catRow = categorySnapshot.find((c) => c.category === category);
                  return rows.map((row, i) => (
                    <tr
                      key={`${row.rowOffset}`}
                      className={`border-b border-gray-100 ${i === 0 ? 'border-t border-t-gray-300' : ''} ${row.adjustment !== 0 ? 'bg-blue-50/40' : i % 2 === 0 ? 'bg-white' : 'bg-gray-50/40'}`}
                    >
                      <td className={`${tdCls} font-semibold text-primary`}>
                        {i === 0 ? (
                          <div>
                            <div>{category}</div>
                            {(catRow?.adjustment ?? 0) !== 0 && (
                              <div className={`text-[9px] font-normal ${(catRow?.adjustment ?? 0) > 0 ? 'text-blue-500' : 'text-red-500'}`}>
                                {(catRow?.adjustment ?? 0) > 0 ? '+' : ''}{formatKRW(catRow?.adjustment ?? 0)}
                              </div>
                            )}
                          </div>
                        ) : ''}
                      </td>
                      <td className={`${tdCls} text-gray-600`}>{row.subcategory || '-'}</td>
                      <td className={`${tdCls} text-gray-500`}>{row.subDetail || '-'}</td>
                      <td className={`${tdRCls} text-gray-700`}>{formatKRW(row.allocation)}</td>
                      <td className={tdRCls}>{adjCell(row.adjustment)}</td>
                      <td className={`${tdRCls} font-semibold text-gray-900`}>{formatKRW(row.afterAllocation)}</td>
                      <td className={`${tdRCls} text-gray-700`}>
                        {i === 0 && catRow ? formatKRW(catRow.executionComplete + catRow.executionPlanned) : ''}
                      </td>
                      <td className={`${tdRCls} ${i === 0 && (catRow?.balance ?? 0) < 0 ? 'text-red-600' : 'text-gray-700'}`}>
                        {i === 0 && catRow ? formatKRW(catRow.balance) : ''}
                      </td>
                    </tr>
                  ));
                })}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-gray-800 font-bold bg-gray-100">
                  <td className={tdCls} colSpan={3}>합계</td>
                  <td className={tdRCls}>{formatKRW(totalBefore)}</td>
                  <td className={tdRCls}>{adjCell(totalAdj)}</td>
                  <td className={tdRCls}>{formatKRW(totalAfter)}</td>
                  <td className={tdRCls}>{formatKRW(totalExec)}</td>
                  <td className={`${tdRCls} ${totalBal < 0 ? 'text-red-600' : ''}`}>{formatKRW(totalBal)}</td>
                </tr>
              </tfoot>
            </table>
          </div>

          {/* ── 미리보기 페이지 2: 비목별 + 세목별 ── */}
          <div className="rounded-[2px] border p-4 bg-white space-y-4">
            <PageHeader title="2. 비목별 / 3. 세목별" changedAt={changedAt} />

            <div>
              <p className="mb-1.5 text-[10px] font-bold text-gray-700 border-b border-gray-300 pb-1">2. 비목별</p>
              <table className="w-full border-collapse">
                <thead>
                  <tr className="bg-primary text-white">
                    <th className={thCls} style={{ width: '20%' }}>비목</th>
                    <th className={thRCls} style={{ width: '14%' }}>편성액</th>
                    <th className={thRCls} style={{ width: '11%' }}>증감액</th>
                    <th className={thRCls} style={{ width: '14%' }}>변경후 편성액</th>
                    <th className={thRCls} style={{ width: '9%' }}>예산비율</th>
                    <th className={thRCls} style={{ width: '14%' }}>집행금액</th>
                    <th className={thRCls} style={{ width: '18%' }}>잔액</th>
                  </tr>
                </thead>
                <tbody>
                  {categorySnapshot.map((row, i) => {
                    const budgetRatio = totalAfter > 0
                      ? Math.round((row.afterAllocation / totalAfter) * 1000) / 10
                      : 0;
                    return (
                      <tr
                        key={row.category}
                        className={`border-b border-gray-100 ${row.adjustment !== 0 ? 'bg-blue-50/40' : i % 2 === 0 ? 'bg-white' : 'bg-gray-50/40'}`}
                      >
                        <td className={`${tdCls} font-medium text-gray-800`}>{row.category}</td>
                        <td className={`${tdRCls} text-gray-700`}>{formatKRW(row.allocation)}</td>
                        <td className={tdRCls}>{adjCell(row.adjustment)}</td>
                        <td className={`${tdRCls} font-semibold text-gray-900`}>{formatKRW(row.afterAllocation)}</td>
                        <td className={`${tdRCls} text-gray-500`}>{budgetRatio.toFixed(1)}%</td>
                        <td className={`${tdRCls} text-gray-700`}>{formatKRW(row.executionComplete + row.executionPlanned)}</td>
                        <td className={`${tdRCls} ${row.balance < 0 ? 'text-red-600' : 'text-gray-700'}`}>{formatKRW(row.balance)}</td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-gray-800 font-bold bg-gray-100">
                    <td className={tdCls}>합계</td>
                    <td className={tdRCls}>{formatKRW(totalBefore)}</td>
                    <td className={tdRCls}>{adjCell(totalAdj)}</td>
                    <td className={tdRCls}>{formatKRW(totalAfter)}</td>
                    <td className={`${tdRCls} text-gray-500`}>100%</td>
                    <td className={tdRCls}>{formatKRW(totalExec)}</td>
                    <td className={`${tdRCls} ${totalBal < 0 ? 'text-red-600' : ''}`}>{formatKRW(totalBal)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>

            <div>
              <p className="mb-1.5 text-[10px] font-bold text-gray-700 border-b border-gray-300 pb-1">3. 세목별</p>
              <table className="w-full border-collapse">
                <thead>
                  <tr className="bg-primary text-white">
                    <th className={thCls} style={{ width: '25%' }}>세목</th>
                    <th className={thCls} style={{ width: '30%' }}>세세목</th>
                    <th className={thRCls} style={{ width: '15%' }}>편성액</th>
                    <th className={thRCls} style={{ width: '12%' }}>증감액</th>
                    <th className={thRCls} style={{ width: '18%' }}>변경후 편성액</th>
                  </tr>
                </thead>
                <tbody>
                  {Array.from(subMap.entries()).map(([subcategory, detailMap]) => {
                    const subRows = Array.from(detailMap.values()).flat();
                    const subAlloc = subRows.reduce((s, r) => s + r.allocation, 0);
                    const subAdj   = subRows.reduce((s, r) => s + r.adjustment, 0);
                    const subAfter = subRows.reduce((s, r) => s + r.afterAllocation, 0);
                    const sortedDetails = Array.from(detailMap.entries()).sort(([a], [b]) =>
                      a.localeCompare(b, 'ko'),
                    );
                    return [
                      <tr key={`sub-hdr-${subcategory}`} className="border-t border-gray-300 bg-gray-50">
                        <td className={`${tdCls} font-semibold text-gray-800`}>{subcategory}</td>
                        <td className={tdCls} />
                        <td className={`${tdRCls} font-semibold text-gray-800`}>{formatKRW(subAlloc)}</td>
                        <td className={`${tdRCls} font-semibold`}>{adjCell(subAdj)}</td>
                        <td className={`${tdRCls} font-semibold text-gray-900`}>{formatKRW(subAfter)}</td>
                      </tr>,
                      ...sortedDetails.map(([subDetail, detailRows]) => {
                        const dAlloc = detailRows.reduce((s, r) => s + r.allocation, 0);
                        const dAdj   = detailRows.reduce((s, r) => s + r.adjustment, 0);
                        const dAfter = detailRows.reduce((s, r) => s + r.afterAllocation, 0);
                        return (
                          <tr
                            key={`sub-detail-${subcategory}-${subDetail}`}
                            className={`border-b border-gray-100 ${dAdj !== 0 ? 'bg-blue-50/40' : 'bg-white'}`}
                          >
                            <td className={tdCls} />
                            <td className={`${tdCls} text-gray-500`}>{subDetail}</td>
                            <td className={`${tdRCls} text-gray-700`}>{formatKRW(dAlloc)}</td>
                            <td className={tdRCls}>{adjCell(dAdj)}</td>
                            <td className={`${tdRCls} text-gray-800`}>{formatKRW(dAfter)}</td>
                          </tr>
                        );
                      }),
                    ];
                  })}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-gray-800 font-bold bg-gray-100">
                    <td className={tdCls} colSpan={2}>합계</td>
                    <td className={tdRCls}>{formatKRW(totalBefore)}</td>
                    <td className={tdRCls}>{adjCell(totalAdj)}</td>
                    <td className={tdRCls}>{formatKRW(totalAfter)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>

          {!hasChanges && (
            <p className="text-sm text-gray-500">변경된 항목이 없습니다.</p>
          )}
        </div>

        {/* 푸터 */}
        <div className="flex items-center justify-between border-t px-6 py-4 shrink-0">
          <BudgetPdfDownload
            detailSnapshot={detailSnapshot}
            categorySnapshot={categorySnapshot}
            changedAt={changedAt}
            label="PDF 다운로드 (2페이지)"
          />
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={onClose} disabled={isLoading}>취소</Button>
            <Button
              size="sm"
              onClick={() => onConfirm(changedAt)}
              disabled={isLoading || !hasChanges}
              className="bg-primary text-white hover:bg-primary-light"
            >
              {isLoading ? '저장 중...' : '확정 및 이력 저장'}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

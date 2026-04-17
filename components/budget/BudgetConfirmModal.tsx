// components/budget/BudgetConfirmModal.tsx
// 변경 확정 모달: 날짜 입력 + PDF 생성 + 이력 저장
'use client';

import { useState, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { formatKRW } from '@/lib/utils';
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

export function BudgetConfirmModal({
  open,
  detailSnapshot,
  categorySnapshot,
  isLoading,
  onConfirm,
  onClose,
}: Props) {
  const today = new Date().toISOString().slice(0, 10);
  const [changedAt, setChangedAt] = useState(today);
  const printRef = useRef<HTMLDivElement>(null);

  if (!open) return null;

  const hasChanges = detailSnapshot.some((r) => r.adjustment !== 0);

  // 비목별 그룹 (통합 섹션용)
  const grouped = detailSnapshot.reduce<Record<string, BudgetDetailRow[]>>((acc, row) => {
    if (!acc[row.category]) acc[row.category] = [];
    acc[row.category].push(row);
    return acc;
  }, {});

  // 전체 합계
  const totalBefore = categorySnapshot.reduce((s, r) => s + r.allocation, 0);
  const totalAdj    = categorySnapshot.reduce((s, r) => s + r.adjustment, 0);
  const totalAfter  = categorySnapshot.reduce((s, r) => s + r.afterAllocation, 0);
  const totalExec   = categorySnapshot.reduce((s, r) => s + r.executionComplete + r.executionPlanned, 0);
  const totalBal    = categorySnapshot.reduce((s, r) => s + r.balance, 0);

  const thCls = 'py-1.5 px-1.5 font-semibold text-left';
  const thRCls = 'py-1.5 px-1.5 font-semibold text-right whitespace-nowrap';
  const tdCls = 'py-1 px-1.5';
  const tdRCls = 'py-1 px-1.5 text-right tabular-nums';

  async function handleDownloadPdf() {
    if (!printRef.current) return;
    const { default: jsPDF } = await import('jspdf');
    const { default: html2canvas } = await import('html2canvas');

    const canvas = await html2canvas(printRef.current, { scale: 2, useCORS: true });
    const imgData = canvas.toDataURL('image/png');
    const pdf = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
    const pdfW = pdf.internal.pageSize.getWidth();
    const pdfH = (canvas.height * pdfW) / canvas.width;
    const pageH = pdf.internal.pageSize.getHeight();

    if (pdfH <= pageH) {
      pdf.addImage(imgData, 'PNG', 0, 0, pdfW, pdfH);
    } else {
      // 긴 경우 페이지 분할
      let rendered = 0;
      while (rendered < canvas.height) {
        const sliceH = Math.min((pageH / pdfW) * canvas.width, canvas.height - rendered);
        const sliceCanvas = document.createElement('canvas');
        sliceCanvas.width = canvas.width;
        sliceCanvas.height = sliceH;
        const ctx = sliceCanvas.getContext('2d')!;
        ctx.drawImage(canvas, 0, -rendered);
        const sliceData = sliceCanvas.toDataURL('image/png');
        if (rendered > 0) pdf.addPage();
        pdf.addImage(sliceData, 'PNG', 0, 0, pdfW, (sliceH * pdfW) / canvas.width);
        rendered += sliceH;
      }
    }
    pdf.save(`예산변경확정서_${changedAt}.pdf`);
  }

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
              max={today}
              className="rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/40"
            />
          </div>

          {/* PDF 캡처 영역 */}
          <div ref={printRef} className="rounded-lg border p-5 bg-white space-y-6">
            {/* 문서 제목 */}
            <div className="text-center">
              <p className="text-base font-bold text-gray-900">예산변경 비교표</p>
              <p className="text-xs text-gray-500">변경일자: {changedAt}</p>
            </div>

            {/* ── 1. 통합 ── */}
            <div>
              <p className="mb-1.5 text-xs font-bold text-gray-700 border-b border-gray-300 pb-1">1. 통합</p>
              <table className="w-full text-[11px] border-collapse">
                <thead>
                  <tr className="bg-primary text-white">
                    <th className={thCls} style={{ width: '14%' }}>비목</th>
                    <th className={thCls} style={{ width: '12%' }}>세목</th>
                    <th className={thCls} style={{ width: '14%' }}>세세목</th>
                    <th className={thRCls} style={{ width: '12%' }}>편성액</th>
                    <th className={thRCls} style={{ width: '10%' }}>증감액</th>
                    <th className={thRCls} style={{ width: '12%' }}>변경후 편성액</th>
                    <th className={thRCls} style={{ width: '13%' }}>집행금액</th>
                    <th className={thRCls} style={{ width: '13%' }}>잔액</th>
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(grouped).map(([category, rows]) => {
                    const catCategoryRow = categorySnapshot.find(c => c.category === category);
                    return rows.map((row, i) => (
                      <tr
                        key={`${row.rowOffset}`}
                        className={`border-b border-gray-100 ${i === 0 ? 'border-t border-t-gray-300' : ''} ${row.adjustment !== 0 ? 'bg-blue-50/40' : i % 2 === 0 ? 'bg-white' : 'bg-gray-50/40'}`}
                      >
                        <td className={`${tdCls} font-semibold text-primary`}>
                          {i === 0 ? (
                            <div>
                              <div>{category}</div>
                              {(catCategoryRow?.adjustment ?? 0) !== 0 && (
                                <div className={`text-[10px] font-normal ${(catCategoryRow?.adjustment ?? 0) > 0 ? 'text-blue-500' : 'text-red-500'}`}>
                                  {(catCategoryRow?.adjustment ?? 0) > 0 ? '+' : ''}{formatKRW(catCategoryRow?.adjustment ?? 0)}
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
                          {i === 0 && catCategoryRow ? formatKRW(catCategoryRow.executionComplete + catCategoryRow.executionPlanned) : ''}
                        </td>
                        <td className={`${tdRCls} ${i === 0 && (catCategoryRow?.balance ?? 0) < 0 ? 'text-red-600' : 'text-gray-700'}`}>
                          {i === 0 && catCategoryRow ? formatKRW(catCategoryRow.balance) : ''}
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

            {/* ── 2. 비목별 ── */}
            <div>
              <p className="mb-1.5 text-xs font-bold text-gray-700 border-b border-gray-300 pb-1">2. 비목별</p>
              <table className="w-full text-[11px] border-collapse">
                <thead>
                  <tr className="bg-primary text-white">
                    <th className={thCls} style={{ width: '20%' }}>비목</th>
                    <th className={thRCls} style={{ width: '16%' }}>편성액</th>
                    <th className={thRCls} style={{ width: '14%' }}>증감액</th>
                    <th className={thRCls} style={{ width: '16%' }}>변경후 편성액</th>
                    <th className={thRCls} style={{ width: '17%' }}>집행금액</th>
                    <th className={thRCls} style={{ width: '17%' }}>잔액</th>
                  </tr>
                </thead>
                <tbody>
                  {categorySnapshot.map((row, i) => (
                    <tr
                      key={row.category}
                      className={`border-b border-gray-100 ${row.adjustment !== 0 ? 'bg-blue-50/40' : i % 2 === 0 ? 'bg-white' : 'bg-gray-50/40'}`}
                    >
                      <td className={`${tdCls} font-medium text-gray-800`}>{row.category}</td>
                      <td className={`${tdRCls} text-gray-700`}>{formatKRW(row.allocation)}</td>
                      <td className={tdRCls}>{adjCell(row.adjustment)}</td>
                      <td className={`${tdRCls} font-semibold text-gray-900`}>{formatKRW(row.afterAllocation)}</td>
                      <td className={`${tdRCls} text-gray-700`}>{formatKRW(row.executionComplete + row.executionPlanned)}</td>
                      <td className={`${tdRCls} ${row.balance < 0 ? 'text-red-600' : 'text-gray-700'}`}>{formatKRW(row.balance)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-gray-800 font-bold bg-gray-100">
                    <td className={tdCls}>합계</td>
                    <td className={tdRCls}>{formatKRW(totalBefore)}</td>
                    <td className={tdRCls}>{adjCell(totalAdj)}</td>
                    <td className={tdRCls}>{formatKRW(totalAfter)}</td>
                    <td className={tdRCls}>{formatKRW(totalExec)}</td>
                    <td className={`${tdRCls} ${totalBal < 0 ? 'text-red-600' : ''}`}>{formatKRW(totalBal)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>

            {/* ── 3. 세목별 ── */}
            {(() => {
              // 1차: 세목 기준 정렬 후 그룹화
              const subMap = new Map<string, Map<string, BudgetDetailRow[]>>();
              const sortedBySubcat = [...detailSnapshot].sort((a, b) =>
                (a.subcategory || '').localeCompare(b.subcategory || '', 'ko'),
              );
              for (const row of sortedBySubcat) {
                const sub = row.subcategory || '-';
                const detail = row.subDetail || '-';
                if (!subMap.has(sub)) subMap.set(sub, new Map());
                const detailMap = subMap.get(sub)!;
                if (!detailMap.has(detail)) detailMap.set(detail, []);
                detailMap.get(detail)!.push(row);
              }

              return (
                <div>
                  <p className="mb-1.5 text-xs font-bold text-gray-700 border-b border-gray-300 pb-1">3. 세목별</p>
                  <table className="w-full text-[11px] border-collapse">
                    <thead>
                      <tr className="bg-primary text-white">
                        <th className={thCls} style={{ width: '22%' }}>세목</th>
                        <th className={thCls} style={{ width: '26%' }}>세세목</th>
                        <th className={thRCls} style={{ width: '17%' }}>편성액</th>
                        <th className={thRCls} style={{ width: '13%' }}>증감액</th>
                        <th className={thRCls} style={{ width: '22%' }}>변경후 편성액</th>
                      </tr>
                    </thead>
                    <tbody>
                      {Array.from(subMap.entries()).map(([subcategory, detailMap]) => {
                        const subRows = Array.from(detailMap.values()).flat();
                        const subAlloc = subRows.reduce((s, r) => s + r.allocation, 0);
                        const subAdj   = subRows.reduce((s, r) => s + r.adjustment, 0);
                        const subAfter = subRows.reduce((s, r) => s + r.afterAllocation, 0);

                        // 2차: 세세목 기준 정렬
                        const sortedDetails = Array.from(detailMap.entries()).sort(([a], [b]) =>
                          a.localeCompare(b, 'ko'),
                        );

                        return [
                          // 세목 헤더 행 (취합액)
                          <tr key={`sub-hdr-${subcategory}`} className="border-t border-gray-300 bg-gray-50">
                            <td className={`${tdCls} font-semibold text-gray-800`}>{subcategory}</td>
                            <td className={tdCls} />
                            <td className={`${tdRCls} font-semibold text-gray-800`}>{formatKRW(subAlloc)}</td>
                            <td className={`${tdRCls} font-semibold`}>{adjCell(subAdj)}</td>
                            <td className={`${tdRCls} font-semibold text-gray-900`}>{formatKRW(subAfter)}</td>
                          </tr>,
                          // 세세목별 취합 행 (중복 합산)
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
              );
            })()}
          </div>

          {!hasChanges && (
            <p className="text-sm text-gray-500">변경된 항목이 없습니다.</p>
          )}
        </div>

        {/* 푸터 */}
        <div className="flex items-center justify-between border-t px-6 py-4 shrink-0">
          <Button variant="outline" size="sm" onClick={handleDownloadPdf} className="gap-1.5 text-gray-600">
            PDF 다운로드
          </Button>
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

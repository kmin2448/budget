// components/budget/BudgetPdfDownload.tsx
// PDF 다운로드 버튼 + 캡처용 숨김 레이아웃 (BudgetConfirmModal·BudgetHistoryTable 공용)
'use client';

import { useRef } from 'react';
import type { CSSProperties } from 'react';
import { FileDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { formatKRW } from '@/lib/utils';
import type { BudgetDetailRow, BudgetCategoryRow } from '@/types';

interface Props {
  detailSnapshot: BudgetDetailRow[];
  categorySnapshot: BudgetCategoryRow[];
  changedAt: string;
  label?: string;
  variant?: 'outline' | 'default';
  size?: 'sm' | 'default';
  className?: string;
}

// ── PDF 전용 인라인 스타일 상수 ──────────────────────────────────────
const PDF_PAGE: CSSProperties = {
  width: 800,
  padding: '22px 28px',
  background: '#ffffff',
  fontFamily: '-apple-system, BlinkMacSystemFont, "Helvetica Neue", Arial, "Malgun Gothic", sans-serif',
  boxSizing: 'border-box',
};
const PDF_TITLE_WRAP: CSSProperties = { textAlign: 'center', marginBottom: 18, paddingBottom: 10, borderBottom: '2px solid #1F5C99' };
const PDF_TITLE_MAIN: CSSProperties = { display: 'block', fontSize: 17, fontWeight: 700, color: '#111827', letterSpacing: '-0.5px', marginBottom: 5 };
const PDF_TITLE_DATE: CSSProperties = { display: 'block', fontSize: 10, color: '#6b7280', fontWeight: 400 };
const pdfSecLabel = (mt = 0): CSSProperties => ({
  fontSize: 12, fontWeight: 700, color: '#1F5C99',
  borderBottom: '1.5px solid #1F5C99',
  paddingBottom: 4, marginBottom: 7, marginTop: mt,
});
const PDF_TABLE: CSSProperties = { width: '100%', borderCollapse: 'collapse', tableLayout: 'auto' };
const pdfTh = (w: string, right = false): CSSProperties => ({
  padding: '7px 5px 10px 5px', background: '#1F5C99', color: '#ffffff',
  fontWeight: 600, fontSize: 8, textAlign: right ? 'right' : 'left',
  width: w, lineHeight: 1.4, verticalAlign: 'middle',
});
const PDF_TD: CSSProperties = {
  padding: '7px 5px', fontSize: 8, lineHeight: 1.5,
  verticalAlign: 'middle', whiteSpace: 'nowrap',
};
const PDF_TDR: CSSProperties = {
  padding: '7px 5px', fontSize: 8, textAlign: 'right', lineHeight: 1.5,
  verticalAlign: 'middle', whiteSpace: 'nowrap',
};
const pdfBg = (idx: number, hasAdj: boolean): CSSProperties => ({
  background: hasAdj ? '#eff6ff' : idx % 2 === 0 ? '#ffffff' : '#f8fafc',
  borderBottom: '1px solid #f0f0f0',
});
const pdfAdjStyle = (v: number): CSSProperties => ({
  padding: '7px 5px', fontSize: 8, textAlign: 'right', lineHeight: 1.5,
  verticalAlign: 'middle', whiteSpace: 'nowrap',
  fontWeight: v !== 0 ? 600 : 400,
  color: v > 0 ? '#1d4ed8' : v < 0 ? '#dc2626' : '#9ca3af',
});
const PDF_TFOOT_TD: CSSProperties = {
  padding: '7px 5px', fontSize: 8, lineHeight: 1.5,
  verticalAlign: 'middle', background: '#f1f5f9', borderTop: '2px solid #374151', fontWeight: 700,
};
const PDF_TFOOT_TDR: CSSProperties = {
  padding: '7px 5px', fontSize: 8, textAlign: 'right', lineHeight: 1.5,
  verticalAlign: 'middle', background: '#f1f5f9', borderTop: '2px solid #374151', fontWeight: 700,
  whiteSpace: 'nowrap',
};
const pdfAdjStr = (v: number) => v !== 0 ? `${v > 0 ? '+' : ''}${formatKRW(v)}` : '-';

export function BudgetPdfDownload({
  detailSnapshot,
  categorySnapshot,
  changedAt,
  label = 'PDF 다운로드',
  variant = 'outline',
  size = 'sm',
  className,
}: Props) {
  const page1Ref = useRef<HTMLDivElement>(null);
  const page2Ref = useRef<HTMLDivElement>(null);

  // 비목별 그룹화 (Page 1)
  const grouped = detailSnapshot.reduce<Record<string, BudgetDetailRow[]>>((acc, row) => {
    if (!acc[row.category]) acc[row.category] = [];
    acc[row.category].push(row);
    return acc;
  }, {});

  // 세목별 그룹화 (Page 2, Section 3)
  const subMap = new Map<string, Map<string, BudgetDetailRow[]>>();
  const sortedBySubcat = [...detailSnapshot].sort((a, b) =>
    (a.subcategory || '').localeCompare(b.subcategory || '', 'ko'),
  );
  for (const row of sortedBySubcat) {
    const sub    = row.subcategory || '-';
    const detail = row.subDetail   || '-';
    if (!subMap.has(sub)) subMap.set(sub, new Map());
    const detailMap = subMap.get(sub)!;
    if (!detailMap.has(detail)) detailMap.set(detail, []);
    detailMap.get(detail)!.push(row);
  }

  const totalBefore = categorySnapshot.reduce((s, r) => s + r.allocation, 0);
  const totalAdj    = categorySnapshot.reduce((s, r) => s + r.adjustment, 0);
  const totalAfter  = categorySnapshot.reduce((s, r) => s + r.afterAllocation, 0);
  const totalExec   = categorySnapshot.reduce((s, r) => s + r.executionComplete + r.executionPlanned, 0);
  const totalBal    = categorySnapshot.reduce((s, r) => s + r.balance, 0);

  async function handleDownload() {
    if (!page1Ref.current || !page2Ref.current) return;
    try {
      const jsPDFModule = await import('jspdf');
      const JsPDF = jsPDFModule.jsPDF ?? (jsPDFModule as unknown as { default: { jsPDF: unknown } }).default?.jsPDF;
      if (!JsPDF) throw new Error('jsPDF 모듈을 불러오지 못했습니다.');
      const { default: html2canvas } = await import('html2canvas');

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const pdf = new (JsPDF as any)({ orientation: 'portrait', unit: 'mm', format: 'a4' });
      const pdfW: number = pdf.internal.pageSize.getWidth();
      const pdfH: number = pdf.internal.pageSize.getHeight();
      const margin   = 10;
      const contentW = pdfW - margin * 2;
      const contentH = pdfH - margin * 2;

      const captureOpts = { scale: 2, useCORS: true, logging: false, scrollX: 0, scrollY: 0, backgroundColor: '#ffffff' };

      const addPage = async (el: HTMLDivElement, isFirst: boolean) => {
        if (!isFirst) pdf.addPage();
        const canvas = await html2canvas(el, { ...captureOpts, width: el.scrollWidth, height: el.scrollHeight });
        let imgW = contentW;
        let imgH = (canvas.height / canvas.width) * contentW;
        if (imgH > contentH) { imgH = contentH; imgW = (canvas.width / canvas.height) * contentH; }
        pdf.addImage(canvas.toDataURL('image/png'), 'PNG', margin + (contentW - imgW) / 2, margin, imgW, imgH);
      };

      await addPage(page1Ref.current, true);
      await addPage(page2Ref.current, false);
      pdf.save(`예산변경확정서_${changedAt}.pdf`);
    } catch (err) {
      console.error('PDF 생성 오류:', err);
      alert(`PDF 생성 중 오류가 발생했습니다: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  return (
    <>
      <Button variant={variant} size={size} onClick={handleDownload} className={`gap-1.5 text-gray-600 ${className ?? ''}`}>
        <FileDown className="h-3.5 w-3.5" />
        {label}
      </Button>

      {/* ── 캡처 전용 숨김 영역 ── */}
      <div style={{ position: 'absolute', left: '-9999px', top: 0 }} aria-hidden="true">

        {/* 페이지 1 — 1. 통합 */}
        <div ref={page1Ref} style={PDF_PAGE}>
          <div style={PDF_TITLE_WRAP}>
            <span style={PDF_TITLE_MAIN}>예산변경 비교표</span>
            <span style={PDF_TITLE_DATE}>변경일자: {changedAt}</span>
          </div>
          <div style={pdfSecLabel()}>1. 통합</div>
          <table style={PDF_TABLE}>
            <thead>
              <tr>
                <th style={pdfTh('14%')}>비목</th>
                <th style={{ ...pdfTh('11%'), paddingLeft: 40 }}>세목</th>
                <th style={pdfTh('11%')}>보조세목</th>
                <th style={pdfTh('13%', true)}>편성액</th>
                <th style={pdfTh('9%', true)}>증감액</th>
                <th style={pdfTh('13%', true)}>변경후 편성액</th>
                <th style={pdfTh('14%', true)}>집행금액</th>
                <th style={pdfTh('15%', true)}>잔액</th>
              </tr>
            </thead>
            <tbody>
              {Object.entries(grouped).map(([category, rows]) => {
                const catRow = categorySnapshot.find((c) => c.category === category);
                return rows.map((row, i) => {
                  const bg = pdfBg(i, row.adjustment !== 0);
                  return (
                    <tr key={`p1-${row.rowOffset}`}>
                      <td style={{ ...PDF_TD, ...bg, fontWeight: 600, color: '#1F5C99' }}>
                        {i === 0 && category}
                      </td>
                      <td style={{ ...PDF_TD, ...bg, color: '#4b5563', paddingLeft: 40 }}>{row.subcategory || '-'}</td>
                      <td style={{ ...PDF_TD, ...bg, color: '#6b7280' }}>{row.subDetail || '-'}</td>
                      <td style={{ ...PDF_TDR, ...bg, color: '#374151' }}>{formatKRW(row.allocation)}</td>
                      <td style={{ ...pdfAdjStyle(row.adjustment), ...bg }}>{pdfAdjStr(row.adjustment)}</td>
                      <td style={{ ...PDF_TDR, ...bg, fontWeight: 600, color: '#111827' }}>{formatKRW(row.afterAllocation)}</td>
                      <td style={{ ...PDF_TDR, ...bg }}>
                        {i === 0 && catRow ? formatKRW(catRow.executionComplete + catRow.executionPlanned) : ''}
                      </td>
                      <td style={{ ...PDF_TDR, ...bg, color: i === 0 && (catRow?.balance ?? 0) < 0 ? '#dc2626' : '#374151' }}>
                        {i === 0 && catRow ? formatKRW(catRow.balance) : ''}
                      </td>
                    </tr>
                  );
                });
              })}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan={3} style={PDF_TFOOT_TD}>합계</td>
                <td style={PDF_TFOOT_TDR}>{formatKRW(totalBefore)}</td>
                <td style={{ ...pdfAdjStyle(totalAdj), background: '#f1f5f9', borderTop: '2px solid #374151', fontWeight: 700 }}>{pdfAdjStr(totalAdj)}</td>
                <td style={PDF_TFOOT_TDR}>{formatKRW(totalAfter)}</td>
                <td style={PDF_TFOOT_TDR}>{formatKRW(totalExec)}</td>
                <td style={{ ...PDF_TFOOT_TDR, color: totalBal < 0 ? '#dc2626' : '#374151' }}>{formatKRW(totalBal)}</td>
              </tr>
            </tfoot>
          </table>
        </div>

        {/* 페이지 2 — 2. 비목별 + 3. 세목별 */}
        <div ref={page2Ref} style={PDF_PAGE}>
          <div style={PDF_TITLE_WRAP}>
            <span style={PDF_TITLE_MAIN}>예산변경 비교표</span>
            <span style={PDF_TITLE_DATE}>변경일자: {changedAt}</span>
          </div>

          <div style={pdfSecLabel()}>2. 비목별</div>
          <table style={PDF_TABLE}>
            <thead>
              <tr>
                <th style={pdfTh('26%')}>비목</th>
                <th style={pdfTh('16%', true)}>편성액</th>
                <th style={pdfTh('13%', true)}>증감액</th>
                <th style={pdfTh('16%', true)}>변경후 편성액</th>
                <th style={pdfTh('15%', true)}>집행금액</th>
                <th style={pdfTh('14%', true)}>잔액</th>
              </tr>
            </thead>
            <tbody>
              {categorySnapshot.map((row, i) => {
                const bg = pdfBg(i, row.adjustment !== 0);
                return (
                  <tr key={`p2-cat-${row.category}`}>
                    <td style={{ ...PDF_TD, ...bg, fontWeight: 500, color: '#1F5C99' }}>{row.category}</td>
                    <td style={{ ...PDF_TDR, ...bg, color: '#374151' }}>{formatKRW(row.allocation)}</td>
                    <td style={{ ...pdfAdjStyle(row.adjustment), ...bg }}>{pdfAdjStr(row.adjustment)}</td>
                    <td style={{ ...PDF_TDR, ...bg, fontWeight: 600, color: '#111827' }}>{formatKRW(row.afterAllocation)}</td>
                    <td style={{ ...PDF_TDR, ...bg, color: '#374151' }}>{formatKRW(row.executionComplete + row.executionPlanned)}</td>
                    <td style={{ ...PDF_TDR, ...bg, color: row.balance < 0 ? '#dc2626' : '#374151' }}>{formatKRW(row.balance)}</td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr>
                <td style={PDF_TFOOT_TD}>합계</td>
                <td style={PDF_TFOOT_TDR}>{formatKRW(totalBefore)}</td>
                <td style={{ ...pdfAdjStyle(totalAdj), background: '#f1f5f9', borderTop: '2px solid #374151', fontWeight: 700 }}>{pdfAdjStr(totalAdj)}</td>
                <td style={PDF_TFOOT_TDR}>{formatKRW(totalAfter)}</td>
                <td style={PDF_TFOOT_TDR}>{formatKRW(totalExec)}</td>
                <td style={{ ...PDF_TFOOT_TDR, color: totalBal < 0 ? '#dc2626' : '#374151' }}>{formatKRW(totalBal)}</td>
              </tr>
            </tfoot>
          </table>

          <div style={pdfSecLabel(28)}>3. 세목별</div>
          <table style={PDF_TABLE}>
            <thead>
              <tr>
                <th style={pdfTh('27%')}>세목</th>
                <th style={pdfTh('29%')}>보조세목</th>
                <th style={pdfTh('16%', true)}>편성액</th>
                <th style={pdfTh('12%', true)}>증감액</th>
                <th style={pdfTh('16%', true)}>변경후 편성액</th>
              </tr>
            </thead>
            <tbody>
              {Array.from(subMap.entries()).map(([subcategory, detailMap]) => {
                const subRows  = Array.from(detailMap.values()).flat();
                const subAlloc = subRows.reduce((s, r) => s + r.allocation, 0);
                const subAdj   = subRows.reduce((s, r) => s + r.adjustment, 0);
                const subAfter = subRows.reduce((s, r) => s + r.afterAllocation, 0);
                const sortedDetails = Array.from(detailMap.entries()).sort(([a], [b]) => a.localeCompare(b, 'ko'));
                const subHdrBg: CSSProperties = { background: '#eef2f8', borderTop: '1px solid #c7d2e4', borderBottom: '1px solid #c7d2e4' };
                return [
                  <tr key={`p2-sub-${subcategory}`}>
                    <td style={{ ...PDF_TD, ...subHdrBg, fontWeight: 700, color: '#1F5C99' }}>{subcategory}</td>
                    <td style={{ ...PDF_TD, ...subHdrBg }} />
                    <td style={{ ...PDF_TDR, ...subHdrBg, fontWeight: 600, color: '#374151' }}>{formatKRW(subAlloc)}</td>
                    <td style={{ ...pdfAdjStyle(subAdj), ...subHdrBg, fontWeight: 600 }}>{pdfAdjStr(subAdj)}</td>
                    <td style={{ ...PDF_TDR, ...subHdrBg, fontWeight: 600, color: '#111827' }}>{formatKRW(subAfter)}</td>
                  </tr>,
                  ...sortedDetails.map(([subDetail, detailRows]) => {
                    const dAlloc = detailRows.reduce((s, r) => s + r.allocation, 0);
                    const dAdj   = detailRows.reduce((s, r) => s + r.adjustment, 0);
                    const dAfter = detailRows.reduce((s, r) => s + r.afterAllocation, 0);
                    const detBg: CSSProperties = { background: dAdj !== 0 ? '#eff6ff' : '#ffffff', borderBottom: '1px solid #f0f0f0' };
                    return (
                      <tr key={`p2-d-${subcategory}-${subDetail}`}>
                        <td style={{ ...PDF_TD, ...detBg }} />
                        <td style={{ ...PDF_TD, ...detBg, color: '#6b7280' }}>{subDetail}</td>
                        <td style={{ ...PDF_TDR, ...detBg, color: '#374151' }}>{formatKRW(dAlloc)}</td>
                        <td style={{ ...pdfAdjStyle(dAdj), ...detBg }}>{pdfAdjStr(dAdj)}</td>
                        <td style={{ ...PDF_TDR, ...detBg, color: '#1f2937' }}>{formatKRW(dAfter)}</td>
                      </tr>
                    );
                  }),
                ];
              })}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan={2} style={PDF_TFOOT_TD}>합계</td>
                <td style={PDF_TFOOT_TDR}>{formatKRW(totalBefore)}</td>
                <td style={{ ...pdfAdjStyle(totalAdj), background: '#f1f5f9', borderTop: '2px solid #374151', fontWeight: 700 }}>{pdfAdjStr(totalAdj)}</td>
                <td style={PDF_TFOOT_TDR}>{formatKRW(totalAfter)}</td>
              </tr>
            </tfoot>
          </table>
        </div>

      </div>
    </>
  );
}

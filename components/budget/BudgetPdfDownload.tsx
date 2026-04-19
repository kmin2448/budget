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

// ── PDF 전용 인라인 스타일 ───────────────────────────────────────────
const PDF_PAGE: CSSProperties = {
  width: 800,
  padding: '22px 28px',
  background: '#ffffff',
  fontFamily: '-apple-system, BlinkMacSystemFont, "Helvetica Neue", Arial, "Malgun Gothic", sans-serif',
  boxSizing: 'border-box',
};
const PDF_TITLE_WRAP: CSSProperties = {
  textAlign: 'center', marginBottom: 18, paddingBottom: 10, borderBottom: '2px solid #374151',
};
const PDF_TITLE_MAIN: CSSProperties = {
  display: 'block', fontSize: 17, fontWeight: 700, color: '#111827',
  letterSpacing: '-0.5px', marginBottom: 5, lineHeight: 1.4,
};
const PDF_TITLE_DATE: CSSProperties = {
  display: 'block', fontSize: 10, color: '#6b7280', fontWeight: 400, lineHeight: 1.4,
};
const pdfSecLabel = (mt = 0): CSSProperties => ({
  fontSize: 12, fontWeight: 700, color: '#374151',
  borderBottom: '1.5px solid #9ca3af',
  paddingBottom: 4, marginBottom: 7, marginTop: mt, lineHeight: 1.4,
});
const PDF_TABLE: CSSProperties = { width: '100%', borderCollapse: 'collapse', tableLayout: 'auto' };

// th — verticalAlign middle은 th에서 비교적 잘 동작함
const pdfTh = (w: string, right = false): CSSProperties => ({
  paddingTop: 8, paddingBottom: 8, paddingLeft: 5, paddingRight: 5,
  background: '#4b5563', color: '#ffffff',
  fontWeight: 600, fontSize: 8,
  textAlign: right ? 'right' : 'left',
  width: w, lineHeight: 1.4, verticalAlign: 'middle',
});

// td outer — 높이 고정 없이 상하 패딩만으로 높이를 잡음
const pdfTd = (right = false, extra: CSSProperties = {}): CSSProperties => ({
  paddingTop: 5,
  paddingBottom: 9,
  paddingLeft: 5,
  paddingRight: 5,
  fontSize: 8,
  whiteSpace: 'nowrap',
  textAlign: right ? 'right' : 'left',
  ...extra,
});

// td 내부 flex wrapper — 텍스트 세로 중앙 정렬의 실질적 담당
const pdfInner = (right = false, extra: CSSProperties = {}): CSSProperties => ({
  display: 'flex',
  alignItems: 'center',
  justifyContent: right ? 'flex-end' : 'flex-start',
  minHeight: '100%',
  lineHeight: 'normal',
  ...extra,
});

const pdfBg = (idx: number, hasAdj: boolean): CSSProperties => ({
  background: hasAdj ? '#f0f0f0' : idx % 2 === 0 ? '#ffffff' : '#f8fafc',
  borderBottom: '1px solid #e5e7eb',
});

const pdfFootBg: CSSProperties = {
  background: '#e5e7eb', borderTop: '2px solid #374151',
};

const adjColor = (v: number) =>
  v > 0 ? '#374151' : v < 0 ? '#6b7280' : '#9ca3af';

const pdfAdjStr = (v: number) =>
  v !== 0 ? `${v > 0 ? '+' : ''}${formatKRW(v)}` : '-';

// ── 셀 렌더 헬퍼 ────────────────────────────────────────────────────
// 단순 텍스트 셀
function Td({
  children, right = false, tdExtra = {}, innerExtra = {},
}: {
  children: React.ReactNode;
  right?: boolean;
  tdExtra?: CSSProperties;
  innerExtra?: CSSProperties;
}) {
  return (
    <td style={pdfTd(right, tdExtra)}>
      <div style={pdfInner(right, innerExtra)}>{children}</div>
    </td>
  );
}

// 증감액 전용 셀
function AdjTd({ v, tdExtra = {} }: { v: number; tdExtra?: CSSProperties }) {
  return (
    <td style={pdfTd(true, { fontWeight: v !== 0 ? 600 : 400, ...tdExtra })}>
      <div style={pdfInner(true, { color: adjColor(v) })}>{pdfAdjStr(v)}</div>
    </td>
  );
}

// tfoot 셀
function TfTd({
  children, right = false, extra = {},
}: {
  children: React.ReactNode;
  right?: boolean;
  extra?: CSSProperties;
}) {
  return (
    <td style={pdfTd(right, { ...pdfFootBg, fontWeight: 700, ...extra })}>
      <div style={pdfInner(right)}>{children}</div>
    </td>
  );
}

// tfoot 증감액 셀
function TfAdjTd({ v }: { v: number }) {
  return (
    <td style={pdfTd(true, { ...pdfFootBg, fontWeight: 700 })}>
      <div style={pdfInner(true, { color: adjColor(v) })}>{pdfAdjStr(v)}</div>
    </td>
  );
}

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
                      <Td tdExtra={{ ...bg, fontWeight: 600, color: '#374151' }}>
                        {i === 0 ? category : ''}
                      </Td>
                      <Td tdExtra={{ ...bg, color: '#4b5563', paddingLeft: 40 }}>
                        {row.subcategory || '-'}
                      </Td>
                      <Td tdExtra={{ ...bg, color: '#6b7280' }}>{row.subDetail || '-'}</Td>
                      <Td right tdExtra={{ ...bg, color: '#374151' }}>{formatKRW(row.allocation)}</Td>
                      <AdjTd v={row.adjustment} tdExtra={bg} />
                      <Td right tdExtra={{ ...bg, fontWeight: 600, color: '#111827' }}>
                        {formatKRW(row.afterAllocation)}
                      </Td>
                      <Td right tdExtra={{ ...bg, color: '#374151' }}>
                        {i === 0 && catRow ? formatKRW(catRow.executionComplete + catRow.executionPlanned) : ''}
                      </Td>
                      <Td right tdExtra={{ ...bg, color: '#374151' }}>
                        {i === 0 && catRow ? formatKRW(catRow.balance) : ''}
                      </Td>
                    </tr>
                  );
                });
              })}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan={3} style={pdfTd(false, { ...pdfFootBg, fontWeight: 700 })}>
                  <div style={pdfInner()}>합계</div>
                </td>
                <TfTd right>{formatKRW(totalBefore)}</TfTd>
                <TfAdjTd v={totalAdj} />
                <TfTd right>{formatKRW(totalAfter)}</TfTd>
                <TfTd right>{formatKRW(totalExec)}</TfTd>
                <TfTd right>{formatKRW(totalBal)}</TfTd>
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
                <th style={pdfTh('24%')}>비목</th>
                <th style={pdfTh('14%', true)}>편성액</th>
                <th style={pdfTh('11%', true)}>증감액</th>
                <th style={pdfTh('14%', true)}>변경후 편성액</th>
                <th style={pdfTh('8%', true)}>예산비율</th>
                <th style={pdfTh('14%', true)}>집행금액</th>
                <th style={pdfTh('15%', true)}>잔액</th>
              </tr>
            </thead>
            <tbody>
              {categorySnapshot.map((row, i) => {
                const bg = pdfBg(i, row.adjustment !== 0);
                const budgetRatio = totalAfter > 0
                  ? Math.round((row.afterAllocation / totalAfter) * 1000) / 10
                  : 0;
                return (
                  <tr key={`p2-cat-${row.category}`}>
                    <Td tdExtra={{ ...bg, fontWeight: 500, color: '#374151' }}>{row.category}</Td>
                    <Td right tdExtra={{ ...bg, color: '#374151' }}>{formatKRW(row.allocation)}</Td>
                    <AdjTd v={row.adjustment} tdExtra={bg} />
                    <Td right tdExtra={{ ...bg, fontWeight: 600, color: '#111827' }}>
                      {formatKRW(row.afterAllocation)}
                    </Td>
                    <Td right tdExtra={{ ...bg, color: '#6b7280' }}>{budgetRatio.toFixed(1)}%</Td>
                    <Td right tdExtra={{ ...bg, color: '#374151' }}>
                      {formatKRW(row.executionComplete + row.executionPlanned)}
                    </Td>
                    <Td right tdExtra={{ ...bg, color: '#374151' }}>{formatKRW(row.balance)}</Td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr>
                <TfTd>합계</TfTd>
                <TfTd right>{formatKRW(totalBefore)}</TfTd>
                <TfAdjTd v={totalAdj} />
                <TfTd right>{formatKRW(totalAfter)}</TfTd>
                <TfTd right extra={{ color: '#6b7280' }}>100%</TfTd>
                <TfTd right>{formatKRW(totalExec)}</TfTd>
                <TfTd right>{formatKRW(totalBal)}</TfTd>
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
                const subHdrBg: CSSProperties = {
                  background: '#f3f4f6', borderTop: '1px solid #d1d5db', borderBottom: '1px solid #d1d5db',
                };
                return [
                  <tr key={`p2-sub-${subcategory}`}>
                    <Td tdExtra={{ ...subHdrBg, fontWeight: 700, color: '#374151' }}>{subcategory}</Td>
                    <Td tdExtra={subHdrBg}>{''}</Td>
                    <Td right tdExtra={{ ...subHdrBg, fontWeight: 600, color: '#374151' }}>
                      {formatKRW(subAlloc)}
                    </Td>
                    <AdjTd v={subAdj} tdExtra={{ ...subHdrBg, fontWeight: 600 }} />
                    <Td right tdExtra={{ ...subHdrBg, fontWeight: 600, color: '#111827' }}>
                      {formatKRW(subAfter)}
                    </Td>
                  </tr>,
                  ...sortedDetails.map(([subDetail, detailRows]) => {
                    const dAlloc = detailRows.reduce((s, r) => s + r.allocation, 0);
                    const dAdj   = detailRows.reduce((s, r) => s + r.adjustment, 0);
                    const dAfter = detailRows.reduce((s, r) => s + r.afterAllocation, 0);
                    const detBg: CSSProperties = {
                      background: dAdj !== 0 ? '#f3f4f6' : '#ffffff', borderBottom: '1px solid #e5e7eb',
                    };
                    return (
                      <tr key={`p2-d-${subcategory}-${subDetail}`}>
                        <Td tdExtra={detBg}>{''}</Td>
                        <Td tdExtra={{ ...detBg, color: '#6b7280' }}>{subDetail}</Td>
                        <Td right tdExtra={{ ...detBg, color: '#374151' }}>{formatKRW(dAlloc)}</Td>
                        <AdjTd v={dAdj} tdExtra={detBg} />
                        <Td right tdExtra={{ ...detBg, color: '#1f2937' }}>{formatKRW(dAfter)}</Td>
                      </tr>
                    );
                  }),
                ];
              })}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan={2} style={pdfTd(false, { ...pdfFootBg, fontWeight: 700 })}>
                  <div style={pdfInner()}>합계</div>
                </td>
                <TfTd right>{formatKRW(totalBefore)}</TfTd>
                <TfAdjTd v={totalAdj} />
                <TfTd right>{formatKRW(totalAfter)}</TfTd>
              </tr>
            </tfoot>
          </table>
        </div>

      </div>
    </>
  );
}

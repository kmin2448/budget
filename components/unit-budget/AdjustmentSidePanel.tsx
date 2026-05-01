'use client';

import { useState, useRef, useMemo } from 'react';
import type { CSSProperties } from 'react';
import { ChevronLeft, ChevronRight, FileText, FileSpreadsheet } from 'lucide-react';
import { cn, formatKRW } from '@/lib/utils';
import type { UnitTask } from '@/types';
import * as XLSX from 'xlsx';

interface Props {
  unitTasks: UnitTask[];
  adjustments: Record<number, number>;
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

// ── PDF 인라인 스타일 (증감이력 PDF와 동일한 스타일) ──────────────
const PDF_PAGE: CSSProperties = {
  width: 794,
  padding: '24px 28px',
  background: '#ffffff',
  fontFamily: '-apple-system, BlinkMacSystemFont, "Helvetica Neue", Arial, "Malgun Gothic", sans-serif',
  boxSizing: 'border-box',
};

const PDF_TITLE_WRAP: CSSProperties = {
  borderBottom: '1px solid #e5e7eb',
  paddingBottom: 12,
  marginBottom: 16,
};

const PDF_TITLE_MAIN: CSSProperties = {
  display: 'block', fontSize: 15, fontWeight: 700, color: '#131310',
};

const PDF_TITLE_DATE: CSSProperties = {
  display: 'block', fontSize: 10, color: '#6b7280', fontWeight: 400, marginTop: 2,
};

const PDF_SEC_LABEL: CSSProperties = {
  fontSize: 10, fontWeight: 600, color: '#6b7280', marginBottom: 4,
};

const PDF_TABLE: CSSProperties = { width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed' };

const PDF_TABLE_WRAP: CSSProperties = {
  borderRadius: 4, overflow: 'hidden', border: '1px solid #e5e7eb',
};

function pdfTh(right = false, extra: CSSProperties = {}): CSSProperties {
  return {
    padding: '8px',
    background: '#F8FAFC',
    color: '#6b7280',
    fontWeight: 500,
    fontSize: 10,
    textAlign: right ? 'right' : 'left',
    lineHeight: 1.4,
    borderBottom: '1px solid #e5e7eb',
    whiteSpace: 'nowrap' as const,
    ...extra,
  };
}

function pdfTdStyle(right = false, extra: CSSProperties = {}): CSSProperties {
  return {
    padding: '8px',
    fontSize: 10,
    textAlign: right ? 'right' : 'left',
    lineHeight: 1.4,
    borderBottom: '1px solid #f3f3f3',
    ...extra,
  };
}

function pdfFootTd(right = false, extra: CSSProperties = {}): CSSProperties {
  return {
    padding: '8px',
    fontSize: 10,
    fontWeight: 600,
    textAlign: right ? 'right' : 'left',
    background: '#EBF3FA',
    borderTop: '2px solid rgba(31, 92, 153, 0.2)',
    color: '#1F5C99',
    whiteSpace: right ? ('nowrap' as const) : ('normal' as const),
    ...extra,
  };
}

function adjInlineColor(v: number): CSSProperties {
  return { color: v > 0 ? '#2563EB' : v < 0 ? '#EF4444' : '#9ca3af' };
}

export function AdjustmentSidePanel({ unitTasks, adjustments }: Props) {
  const [isOpen, setIsOpen] = useState(false);
  const pdfRef = useRef<HTMLDivElement>(null);

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

    const catMap = new Map<string, { before: number; adj: number }>();
    for (const p of programs) {
      const e = catMap.get(p.category) ?? { before: 0, adj: 0 };
      catMap.set(p.category, { before: e.before + p.before, adj: e.adj + p.adj });
    }
    const cats: CategoryChange[] = Array.from(catMap.entries()).map(([cat, v]) => ({
      category: cat, before: v.before, adj: v.adj, after: v.before + v.adj,
    }));

    const subMap = new Map<string, { sub: string; det: string; before: number; adj: number }>();
    for (const p of programs) {
      const key = `${p.subcategory}||${p.subDetail}`;
      const e = subMap.get(key) ?? { sub: p.subcategory, det: p.subDetail, before: 0, adj: 0 };
      subMap.set(key, { ...e, before: e.before + p.before, adj: e.adj + p.adj });
    }
    const subs: SubDetailChange[] = Array.from(subMap.values()).map((v) => ({
      subcategory: v.sub, subDetail: v.det, before: v.before, adj: v.adj, after: v.before + v.adj,
    }));

    return { programChanges: programs, categoryChanges: cats, subDetailChanges: subs };
  }, [unitTasks, adjustments]);

  const byUnit = useMemo(() => {
    const map = new Map<string, ProgramChange[]>();
    for (const p of programChanges) {
      if (!map.has(p.unitName)) map.set(p.unitName, []);
      map.get(p.unitName)!.push(p);
    }
    return map;
  }, [programChanges]);

  const progTotal = { before: 0, adj: 0, after: 0 };
  const catTotal  = { before: 0, adj: 0, after: 0 };
  const subTotal  = { before: 0, adj: 0, after: 0 };
  for (const p of programChanges) { progTotal.before += p.before; progTotal.adj += p.adj; progTotal.after += p.after; }
  for (const c of categoryChanges) { catTotal.before += c.before; catTotal.adj += c.adj; catTotal.after += c.after; }
  for (const s of subDetailChanges) { subTotal.before += s.before; subTotal.adj += s.adj; subTotal.after += s.after; }

  const changeCount = programChanges.length;
  const today = new Date().toLocaleDateString('ko-KR');

  // ── PDF 다운로드 (증감이력과 동일한 인라인 CSS 방식) ─────────────
  const handleDownloadPdf = async () => {
    const el = pdfRef.current;
    if (!el) return;
    const jsPDFMod = await import('jspdf');
    const JsPDF = jsPDFMod.jsPDF ?? (jsPDFMod as unknown as { default: { jsPDF: unknown } }).default?.jsPDF;
    if (!JsPDF) return;
    const { default: html2canvas } = await import('html2canvas');

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const pdf = new (JsPDF as any)({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    const margin = 10;
    const pageW: number = pdf.internal.pageSize.getWidth();
    const pageH: number = pdf.internal.pageSize.getHeight();
    const contentW = pageW - margin * 2;
    const pageContentH = pageH - margin * 2;

    const canvas = await html2canvas(el, {
      scale: 2,
      useCORS: true,
      logging: false,
      scrollX: 0,
      scrollY: 0,
      backgroundColor: '#ffffff',
      width: el.scrollWidth,
      height: el.scrollHeight,
    });

    const imgData = canvas.toDataURL('image/png');
    const contentH = (canvas.height * contentW) / canvas.width;

    pdf.addImage(imgData, 'PNG', margin, margin, contentW, contentH);

    if (contentH > pageContentH) {
      let pageOffset = pageContentH;
      while (pageOffset < contentH) {
        pdf.addPage();
        pdf.addImage(imgData, 'PNG', margin, margin - pageOffset, contentW, contentH);
        pageOffset += pageContentH;
      }
    }

    pdf.save('예산변경내역.pdf');
  };

  // ── Excel 다운로드 ────────────────────────────────────────────────
  const handleDownloadExcel = () => {
    const wb = XLSX.utils.book_new();

    const sheet1: (string | number)[][] = [
      ['예산변경내역'],
      [today],
      [],
      ['[단위과제 · 프로그램 간 변경 내역]'],
      ['단위과제', '프로그램명', '비목 > 세목 > 보조세목', '변경 전', '증감액', '변경 후'],
      ...programChanges.map((p, i) => [
        i === 0 || programChanges[i - 1].unitName !== p.unitName ? p.unitName : '',
        p.programName,
        [p.category, p.subcategory, p.subDetail].filter(Boolean).join(' > '),
        p.before, p.adj, p.after,
      ]),
      ['합계', '', '', progTotal.before, progTotal.adj, progTotal.after],
      [],
      ['[비목별 변경 내역]'],
      ['비목', '변경 전', '증감액', '변경 후'],
      ...categoryChanges.map((c) => [c.category, c.before, c.adj, c.after]),
      ['합계', catTotal.before, catTotal.adj, catTotal.after],
      [],
      ['[세목 · 보조세목 간 변경 내역]'],
      ['세목', '보조세목', '변경 전', '증감액', '변경 후'],
      ...subDetailChanges.map((s) => [s.subcategory, s.subDetail, s.before, s.adj, s.after]),
      ['합계', '', subTotal.before, subTotal.adj, subTotal.after],
    ];

    const ws = XLSX.utils.aoa_to_sheet(sheet1);
    ws['!cols'] = [{ wch: 20 }, { wch: 28 }, { wch: 42 }, { wch: 16 }, { wch: 16 }, { wch: 16 }];
    XLSX.utils.book_append_sheet(wb, ws, '예산변경내역');
    XLSX.writeFile(wb, '예산변경내역.xlsx');
  };

  return (
    <div
      className={cn(
        'fixed right-0 top-0 h-screen z-50 transition-transform duration-300',
        isOpen ? 'translate-x-0' : 'translate-x-[800px]',
      )}
    >
      {/* 토글 탭 — 패널 왼쪽에 항상 노출 */}
      <button
        onClick={() => setIsOpen((v) => !v)}
        className={cn(
          'absolute -left-10 top-1/2 -translate-y-1/2',
          'flex flex-col items-center gap-1.5 rounded-l-lg',
          'border border-r-0 border-divider bg-white px-2.5 py-4',
          'shadow-md hover:bg-primary-bg transition-colors',
          changeCount > 0 && 'border-l-primary/40',
        )}
      >
        {isOpen
          ? <ChevronRight className="h-3.5 w-3.5 text-text-secondary" />
          : <ChevronLeft className="h-3.5 w-3.5 text-primary" />}
        {changeCount > 0 && (
          <span className="flex h-5 w-5 items-center justify-center rounded-full bg-primary text-[10px] font-bold text-white">
            {changeCount > 99 ? '99+' : changeCount}
          </span>
        )}
        <span className="[writing-mode:vertical-rl] text-[11px] font-medium text-text-secondary select-none">
          변경요약
        </span>
      </button>

      {/* 패널 본체 */}
      <div className="w-[800px] h-full bg-white border-l border-divider shadow-2xl flex flex-col">

        {/* 패널 헤더 */}
        <div className="flex items-center justify-between border-b border-divider bg-[#F8FAFC] px-4 py-3 shrink-0">
          <div>
            <h3 className="text-sm font-semibold text-[#131310]">변경 내역 요약</h3>
            {changeCount > 0 && (
              <p className="text-xs text-text-secondary mt-0.5">{changeCount}건 변경 입력됨</p>
            )}
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={handleDownloadPdf}
              disabled={changeCount === 0}
              title="PDF로 저장"
              className="flex items-center gap-1 rounded px-2 py-1 text-xs text-text-secondary hover:bg-red-50 hover:text-red-600 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
            >
              <FileText className="h-3.5 w-3.5" />
              PDF
            </button>
            <button
              onClick={handleDownloadExcel}
              disabled={changeCount === 0}
              title="엑셀로 저장"
              className="flex items-center gap-1 rounded px-2 py-1 text-xs text-text-secondary hover:bg-green-50 hover:text-green-700 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
            >
              <FileSpreadsheet className="h-3.5 w-3.5" />
              Excel
            </button>
          </div>
        </div>

        {/* 스크롤 가능한 콘텐츠 */}
        <div className="flex-1 overflow-y-auto">
          <div className="p-4 space-y-4 bg-white">

            <div className="border-b border-divider pb-3">
              <h2 className="text-base font-bold text-[#131310]">예산변경내역</h2>
              <p className="text-xs text-text-secondary mt-0.5">{today} 기준</p>
            </div>

            {changeCount === 0 ? (
              <div className="flex items-center justify-center py-16 text-xs text-text-secondary">
                증감액 입력 시 변경 내역이 표시됩니다.
              </div>
            ) : (
              <>
                {/* Section 1: 단위과제-프로그램 */}
                <div className="space-y-1.5">
                  <p className="text-xs font-semibold text-text-secondary flex items-center gap-1.5">
                    단위과제 · 프로그램 간 변경 내역
                  </p>
                  <div className="overflow-x-auto rounded-[4px] border border-divider">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="border-b border-divider bg-[#F8FAFC]">
                          <th className="px-2 py-2 text-left font-medium text-text-secondary whitespace-nowrap">단위과제</th>
                          <th className="px-2 py-2 text-left font-medium text-text-secondary whitespace-nowrap">프로그램명</th>
                          <th className="px-2 py-2 text-left font-medium text-text-secondary whitespace-nowrap">비목 &gt; 세목</th>
                          <th className="px-2 py-2 text-right font-medium text-text-secondary whitespace-nowrap">변경 전</th>
                          <th className="px-2 py-2 text-right font-medium text-text-secondary whitespace-nowrap">증감액</th>
                          <th className="px-2 py-2 text-right font-medium text-text-secondary whitespace-nowrap">변경 후</th>
                        </tr>
                      </thead>
                      <tbody>
                        {Array.from(byUnit.entries()).map(([unitName, progs]) =>
                          progs.map((p, i) => (
                            <tr key={p.rowIndex} className="border-b border-divider last:border-0 hover:bg-[#F8FAFC]">
                              <td className="px-2 py-2 text-primary font-medium whitespace-nowrap">
                                {i === 0 ? unitName : ''}
                              </td>
                              <td className="px-2 py-2 text-[#131310] max-w-[90px]">
                                <span className="block truncate" title={p.programName}>{p.programName || '—'}</span>
                              </td>
                              <td className="px-2 py-2 text-text-secondary max-w-[110px]">
                                <span className="block truncate" title={`${p.category} > ${p.subcategory} > ${p.subDetail}`}>
                                  {[p.category, p.subcategory, p.subDetail].filter(Boolean).join(' > ')}
                                </span>
                              </td>
                              <td className="px-2 py-2 text-right tabular-nums text-[#131310] whitespace-nowrap">
                                {formatKRW(p.before)}
                              </td>
                              <td className={cn('px-2 py-2 text-right tabular-nums font-semibold whitespace-nowrap', adjColor(p.adj))}>
                                {adjPrefix(p.adj)}{formatKRW(p.adj)}
                              </td>
                              <td className="px-2 py-2 text-right tabular-nums font-medium text-[#131310] whitespace-nowrap">
                                {formatKRW(p.after)}
                              </td>
                            </tr>
                          ))
                        )}
                        <tr className="border-t-2 border-primary/20 bg-primary-bg">
                          <td colSpan={3} className="px-2 py-2 font-semibold text-primary">합계</td>
                          <td className="px-2 py-2 text-right tabular-nums font-semibold text-primary whitespace-nowrap">{formatKRW(progTotal.before)}</td>
                          <td className={cn('px-2 py-2 text-right tabular-nums font-bold whitespace-nowrap', adjColor(progTotal.adj))}>{adjPrefix(progTotal.adj)}{formatKRW(progTotal.adj)}</td>
                          <td className="px-2 py-2 text-right tabular-nums font-semibold text-primary whitespace-nowrap">{formatKRW(progTotal.after)}</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Section 2: 비목별 */}
                <div className="space-y-1.5">
                  <p className="text-xs font-semibold text-text-secondary flex items-center gap-1.5">
                    비목별 변경 내역
                  </p>
                  <div className="overflow-x-auto rounded-[4px] border border-divider">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="border-b border-divider bg-[#F8FAFC]">
                          <th className="px-2 py-2 text-left font-medium text-text-secondary">비목</th>
                          <th className="px-2 py-2 text-right font-medium text-text-secondary whitespace-nowrap">변경 전</th>
                          <th className="px-2 py-2 text-right font-medium text-text-secondary whitespace-nowrap">증감액</th>
                          <th className="px-2 py-2 text-right font-medium text-text-secondary whitespace-nowrap">변경 후</th>
                        </tr>
                      </thead>
                      <tbody>
                        {categoryChanges.map((c) => (
                          <tr key={c.category} className="border-b border-divider last:border-0 hover:bg-[#F8FAFC]">
                            <td className="px-2 py-2 text-[#131310] font-medium">{c.category}</td>
                            <td className="px-2 py-2 text-right tabular-nums text-[#131310] whitespace-nowrap">{formatKRW(c.before)}</td>
                            <td className={cn('px-2 py-2 text-right tabular-nums font-semibold whitespace-nowrap', adjColor(c.adj))}>{adjPrefix(c.adj)}{formatKRW(c.adj)}</td>
                            <td className="px-2 py-2 text-right tabular-nums font-medium text-[#131310] whitespace-nowrap">{formatKRW(c.after)}</td>
                          </tr>
                        ))}
                        <tr className="border-t-2 border-primary/20 bg-primary-bg">
                          <td className="px-2 py-2 font-semibold text-primary">합계</td>
                          <td className="px-2 py-2 text-right tabular-nums font-semibold text-primary whitespace-nowrap">{formatKRW(catTotal.before)}</td>
                          <td className={cn('px-2 py-2 text-right tabular-nums font-bold whitespace-nowrap', adjColor(catTotal.adj))}>{adjPrefix(catTotal.adj)}{formatKRW(catTotal.adj)}</td>
                          <td className="px-2 py-2 text-right tabular-nums font-semibold text-primary whitespace-nowrap">{formatKRW(catTotal.after)}</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Section 3: 세목·보조세목 */}
                <div className="space-y-1.5">
                  <p className="text-xs font-semibold text-text-secondary flex items-center gap-1.5">
                    세목 · 보조세목 간 변경 내역
                  </p>
                  <div className="overflow-x-auto rounded-[4px] border border-divider">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="border-b border-divider bg-[#F8FAFC]">
                          <th className="px-2 py-2 text-left font-medium text-text-secondary">세목</th>
                          <th className="px-2 py-2 text-left font-medium text-text-secondary">보조세목</th>
                          <th className="px-2 py-2 text-right font-medium text-text-secondary whitespace-nowrap">변경 전</th>
                          <th className="px-2 py-2 text-right font-medium text-text-secondary whitespace-nowrap">증감액</th>
                          <th className="px-2 py-2 text-right font-medium text-text-secondary whitespace-nowrap">변경 후</th>
                        </tr>
                      </thead>
                      <tbody>
                        {subDetailChanges.map((s, i) => (
                          <tr key={i} className="border-b border-divider last:border-0 hover:bg-[#F8FAFC]">
                            <td className="px-2 py-2 text-[#131310]">{s.subcategory || '—'}</td>
                            <td className="px-2 py-2 text-text-secondary">{s.subDetail || '—'}</td>
                            <td className="px-2 py-2 text-right tabular-nums text-[#131310] whitespace-nowrap">{formatKRW(s.before)}</td>
                            <td className={cn('px-2 py-2 text-right tabular-nums font-semibold whitespace-nowrap', adjColor(s.adj))}>{adjPrefix(s.adj)}{formatKRW(s.adj)}</td>
                            <td className="px-2 py-2 text-right tabular-nums font-medium text-[#131310] whitespace-nowrap">{formatKRW(s.after)}</td>
                          </tr>
                        ))}
                        <tr className="border-t-2 border-primary/20 bg-primary-bg">
                          <td colSpan={2} className="px-2 py-2 font-semibold text-primary">합계</td>
                          <td className="px-2 py-2 text-right tabular-nums font-semibold text-primary whitespace-nowrap">{formatKRW(subTotal.before)}</td>
                          <td className={cn('px-2 py-2 text-right tabular-nums font-bold whitespace-nowrap', adjColor(subTotal.adj))}>{adjPrefix(subTotal.adj)}{formatKRW(subTotal.adj)}</td>
                          <td className="px-2 py-2 text-right tabular-nums font-semibold text-primary whitespace-nowrap">{formatKRW(subTotal.after)}</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* PDF 캡처용 숨김 영역 — 증감이력과 동일한 인라인 CSS 방식 */}
      <div style={{ position: 'absolute', left: '-9999px', top: 0 }} aria-hidden="true">
        <div ref={pdfRef} style={PDF_PAGE}>

          {/* 헤더 */}
          <div style={PDF_TITLE_WRAP}>
            <span style={PDF_TITLE_MAIN}>예산변경내역</span>
            <span style={PDF_TITLE_DATE}>{today} 기준</span>
          </div>

          {/* Section 1: 단위과제·프로그램 간 변경 내역 */}
          <div style={{ marginBottom: 16 }}>
            <p style={PDF_SEC_LABEL}>단위과제 · 프로그램 간 변경 내역</p>
            <div style={PDF_TABLE_WRAP}>
              <table style={PDF_TABLE}>
                <thead>
                  <tr>
                    <th style={pdfTh(false, { width: '14%' })}>단위과제</th>
                    <th style={pdfTh(false, { width: '17%' })}>프로그램명</th>
                    <th style={pdfTh(false, { width: '29%' })}>비목 &gt; 세목 &gt; 보조세목</th>
                    <th style={pdfTh(true, { width: '14%' })}>변경 전</th>
                    <th style={pdfTh(true, { width: '12%' })}>증감액</th>
                    <th style={pdfTh(true, { width: '14%' })}>변경 후</th>
                  </tr>
                </thead>
                <tbody>
                  {Array.from(byUnit.entries()).map(([unitName, progs]) =>
                    progs.map((p, i) => {
                      const path = [p.category, p.subcategory, p.subDetail].filter(Boolean).join(' > ');
                      const bg = i % 2 === 0 ? '#ffffff' : '#f8fafc';
                      return (
                        <tr key={p.rowIndex}>
                          <td style={pdfTdStyle(false, { background: bg, fontWeight: 500, color: '#1F5C99', whiteSpace: 'nowrap' })}>
                            {i === 0 ? unitName : ''}
                          </td>
                          <td style={pdfTdStyle(false, { background: bg, color: '#131310' })}>{p.programName || '—'}</td>
                          <td style={pdfTdStyle(false, { background: bg, color: '#6b7280', fontSize: 9 })}>{path}</td>
                          <td style={pdfTdStyle(true, { background: bg, color: '#131310', whiteSpace: 'nowrap' })}>
                            {formatKRW(p.before)}
                          </td>
                          <td style={{ ...pdfTdStyle(true), background: bg, whiteSpace: 'nowrap', fontWeight: p.adj !== 0 ? 600 : 400, ...adjInlineColor(p.adj) }}>
                            {p.adj !== 0 ? (p.adj > 0 ? '+' : '') + formatKRW(p.adj) : '-'}
                          </td>
                          <td style={pdfTdStyle(true, { background: bg, color: '#131310', fontWeight: 500, whiteSpace: 'nowrap' })}>
                            {formatKRW(p.after)}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
                <tfoot>
                  <tr>
                    <td colSpan={3} style={pdfFootTd()}>합계</td>
                    <td style={pdfFootTd(true)}>{formatKRW(progTotal.before)}</td>
                    <td style={{ ...pdfFootTd(true), ...adjInlineColor(progTotal.adj) }}>
                      {progTotal.adj !== 0 ? (progTotal.adj > 0 ? '+' : '') + formatKRW(progTotal.adj) : '-'}
                    </td>
                    <td style={pdfFootTd(true)}>{formatKRW(progTotal.after)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>

          {/* Section 2: 비목별 변경 내역 */}
          <div style={{ marginBottom: 16 }}>
            <p style={PDF_SEC_LABEL}>비목별 변경 내역</p>
            <div style={PDF_TABLE_WRAP}>
              <table style={PDF_TABLE}>
                <thead>
                  <tr>
                    <th style={pdfTh(false, { width: '60%' })}>비목</th>
                    <th style={pdfTh(true, { width: '14%' })}>변경 전</th>
                    <th style={pdfTh(true, { width: '12%' })}>증감액</th>
                    <th style={pdfTh(true, { width: '14%' })}>변경 후</th>
                  </tr>
                </thead>
                <tbody>
                  {categoryChanges.map((c, i) => {
                    const bg = i % 2 === 0 ? '#ffffff' : '#f8fafc';
                    return (
                      <tr key={c.category}>
                        <td style={pdfTdStyle(false, { background: bg, color: '#131310', fontWeight: 500 })}>{c.category}</td>
                        <td style={pdfTdStyle(true, { background: bg, color: '#131310', whiteSpace: 'nowrap' })}>
                          {formatKRW(c.before)}
                        </td>
                        <td style={{ ...pdfTdStyle(true), background: bg, whiteSpace: 'nowrap', fontWeight: c.adj !== 0 ? 600 : 400, ...adjInlineColor(c.adj) }}>
                          {c.adj !== 0 ? (c.adj > 0 ? '+' : '') + formatKRW(c.adj) : '-'}
                        </td>
                        <td style={pdfTdStyle(true, { background: bg, color: '#131310', fontWeight: 500, whiteSpace: 'nowrap' })}>
                          {formatKRW(c.after)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr>
                    <td style={pdfFootTd()}>합계</td>
                    <td style={pdfFootTd(true)}>{formatKRW(catTotal.before)}</td>
                    <td style={{ ...pdfFootTd(true), ...adjInlineColor(catTotal.adj) }}>
                      {catTotal.adj !== 0 ? (catTotal.adj > 0 ? '+' : '') + formatKRW(catTotal.adj) : '-'}
                    </td>
                    <td style={pdfFootTd(true)}>{formatKRW(catTotal.after)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>

          {/* Section 3: 세목·보조세목 간 변경 내역 */}
          <div>
            <p style={PDF_SEC_LABEL}>세목 · 보조세목 간 변경 내역</p>
            <div style={PDF_TABLE_WRAP}>
              <table style={PDF_TABLE}>
                <thead>
                  <tr>
                    <th style={pdfTh(false, { width: '30%' })}>세목</th>
                    <th style={pdfTh(false, { width: '30%' })}>보조세목</th>
                    <th style={pdfTh(true, { width: '14%' })}>변경 전</th>
                    <th style={pdfTh(true, { width: '12%' })}>증감액</th>
                    <th style={pdfTh(true, { width: '14%' })}>변경 후</th>
                  </tr>
                </thead>
                <tbody>
                  {subDetailChanges.map((s, i) => {
                    const bg = i % 2 === 0 ? '#ffffff' : '#f8fafc';
                    return (
                      <tr key={i}>
                        <td style={pdfTdStyle(false, { background: bg, color: '#131310' })}>{s.subcategory || '—'}</td>
                        <td style={pdfTdStyle(false, { background: bg, color: '#6b7280' })}>{s.subDetail || '—'}</td>
                        <td style={pdfTdStyle(true, { background: bg, color: '#131310', whiteSpace: 'nowrap' })}>
                          {formatKRW(s.before)}
                        </td>
                        <td style={{ ...pdfTdStyle(true), background: bg, whiteSpace: 'nowrap', fontWeight: s.adj !== 0 ? 600 : 400, ...adjInlineColor(s.adj) }}>
                          {s.adj !== 0 ? (s.adj > 0 ? '+' : '') + formatKRW(s.adj) : '-'}
                        </td>
                        <td style={pdfTdStyle(true, { background: bg, color: '#131310', fontWeight: 500, whiteSpace: 'nowrap' })}>
                          {formatKRW(s.after)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr>
                    <td colSpan={2} style={pdfFootTd()}>합계</td>
                    <td style={pdfFootTd(true)}>{formatKRW(subTotal.before)}</td>
                    <td style={{ ...pdfFootTd(true), ...adjInlineColor(subTotal.adj) }}>
                      {subTotal.adj !== 0 ? (subTotal.adj > 0 ? '+' : '') + formatKRW(subTotal.adj) : '-'}
                    </td>
                    <td style={pdfFootTd(true)}>{formatKRW(subTotal.after)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}

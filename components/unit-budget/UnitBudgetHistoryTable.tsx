// components/unit-budget/UnitBudgetHistoryTable.tsx
'use client';

import { useState, useRef } from 'react';
import type { CSSProperties } from 'react';
import { ChevronDown, ChevronUp, FileDown, Trash2, History } from 'lucide-react';
import { formatKRW } from '@/lib/utils';
import { ConfirmDialog } from '@/components/shared/ConfirmDialog';
import type { BudgetChangeHistory } from '@/types';

interface AdjustmentItem {
  unitName: string;
  programName: string;
  category: string;
  subcategory: string;
  subDetail: string;
  before: number;
  adjustment: number;
  after: number;
}

function parseItems(snap: Record<string, unknown> | null): AdjustmentItem[] {
  if (!snap || snap.type !== 'program-adjustment') return [];
  return (snap.items as AdjustmentItem[]) ?? [];
}

function adjColor(v: number) {
  return v > 0 ? 'text-primary' : v < 0 ? 'text-red-500' : 'text-text-secondary';
}
function adjStr(v: number) {
  return v !== 0 ? (v > 0 ? '+' : '') + formatKRW(v) : '-';
}

// ── PDF 인라인 스타일 (변경내역 요약 PDF와 동일한 스타일) ──────────
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

// ── 이력 카드 1건 ─────────────────────────────────────────────────
function RecordCard({
  record,
  label,
  canDelete,
  onDelete,
}: {
  record: BudgetChangeHistory;
  label: string;
  canDelete?: boolean;
  onDelete?: () => Promise<void>;
}) {
  const [isOpen, setIsOpen]           = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [deleting, setDeleting]       = useState(false);
  const [pdfLoading, setPdfLoading]   = useState(false);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const pdfRef = useRef<any>(null);

  const items = parseItems(record.snapshot ?? null);
  const totalBefore = items.reduce((s, i) => s + i.before, 0);
  const totalAdj    = items.reduce((s, i) => s + i.adjustment, 0);
  const totalAfter  = items.reduce((s, i) => s + i.after, 0);

  // 비목별 집계
  const catMap = new Map<string, { before: number; adj: number; after: number }>();
  for (const item of items) {
    const e = catMap.get(item.category) ?? { before: 0, adj: 0, after: 0 };
    catMap.set(item.category, { before: e.before + item.before, adj: e.adj + item.adjustment, after: e.after + item.after });
  }
  const categoryChanges = Array.from(catMap.entries()).map(([cat, v]) => ({ category: cat, ...v }));

  // 세목·보조세목별 집계
  const subMap = new Map<string, { subcategory: string; subDetail: string; before: number; adj: number; after: number }>();
  for (const item of items) {
    const key = `${item.subcategory}||${item.subDetail}`;
    const e = subMap.get(key) ?? { subcategory: item.subcategory, subDetail: item.subDetail, before: 0, adj: 0, after: 0 };
    subMap.set(key, { ...e, before: e.before + item.before, adj: e.adj + item.adjustment, after: e.after + item.after });
  }
  const subDetailChanges = Array.from(subMap.values());

  async function handleDownloadPdf() {
    const el = pdfRef.current as HTMLDivElement | null;
    if (!el) return;
    setPdfLoading(true);
    try {
      const jsPDFMod = await import('jspdf');
      const JsPDF = jsPDFMod.jsPDF ?? (jsPDFMod as unknown as { default: { jsPDF: unknown } }).default?.jsPDF;
      if (!JsPDF) throw new Error('jsPDF 모듈을 불러오지 못했습니다.');
      const { default: html2canvas } = await import('html2canvas');

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const pdf = new (JsPDF as any)({ orientation: 'portrait', unit: 'mm', format: 'a4' });
      const margin      = 10;
      const pageW: number = pdf.internal.pageSize.getWidth();
      const pageH: number = pdf.internal.pageSize.getHeight();
      const contentW    = pageW - margin * 2;
      const pageContentH = pageH - margin * 2;

      const canvas = await html2canvas(el, {
        scale: 2, useCORS: true, logging: false, scrollX: 0, scrollY: 0,
        backgroundColor: '#ffffff', width: el.scrollWidth, height: el.scrollHeight,
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

      pdf.save(`단위과제_예산변경_${record.changed_at}.pdf`);
    } catch (err) {
      alert(`PDF 생성 오류: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setPdfLoading(false);
    }
  }

  async function handleDelete() {
    if (!onDelete) return;
    setDeleting(true);
    try { await onDelete(); }
    finally { setDeleting(false); setConfirmOpen(false); }
  }

  return (
    <>
      <div className="rounded-[2px] border border-[#E3E3E0] overflow-hidden shadow-soft">
        {/* 헤더 */}
        <div
          className="flex items-center justify-between bg-[#F3F3EE] border-b border-[#E3E3E0] px-4 py-2.5 cursor-pointer"
          onClick={() => setIsOpen((v) => !v)}
        >
          <div className="flex items-center gap-2">
            {isOpen
              ? <ChevronUp className="h-3.5 w-3.5 text-primary" />
              : <ChevronDown className="h-3.5 w-3.5 text-text-secondary" />}
            <span className="font-semibold text-primary text-sm">{label}</span>
            <span className="text-xs text-gray-500">{items.length}개 항목</span>
            {totalAdj !== 0 && (
              <span className={`text-xs font-semibold ${totalAdj > 0 ? 'text-primary' : 'text-red-500'}`}>
                ({totalAdj > 0 ? '+' : ''}{formatKRW(totalAdj)})
              </span>
            )}
          </div>
          <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
            <button
              onClick={() => void handleDownloadPdf()}
              disabled={pdfLoading || items.length === 0}
              className="flex items-center gap-1 rounded border border-[#E3E3E0] bg-white px-2 py-1 text-xs text-text-secondary hover:border-primary hover:text-primary transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
            >
              <FileDown className="h-3 w-3" />
              {pdfLoading ? '생성 중…' : 'PDF'}
            </button>
            {canDelete && (
              <button
                onClick={() => setConfirmOpen(true)}
                className="rounded p-1 text-gray-400 hover:bg-red-50 hover:text-red-500 transition-colors"
                title="이력 삭제"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        </div>

        {/* 상세 테이블 */}
        {isOpen && (
          <div className="bg-white">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-[#E3E3E0] bg-[#F8FAFC] text-text-secondary">
                  <th className="px-3 py-2 text-left font-medium">단위과제</th>
                  <th className="px-3 py-2 text-left font-medium">프로그램명</th>
                  <th className="px-3 py-2 text-left font-medium">비목 &gt; 세목 &gt; 보조세목</th>
                  <th className="px-3 py-2 text-right font-medium">변경 전</th>
                  <th className="px-3 py-2 text-right font-medium">증감액</th>
                  <th className="px-3 py-2 text-right font-medium">변경 후</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item, i) => (
                  <tr
                    key={i}
                    className={`border-b border-[#F0F0EE] last:border-0 hover:bg-[#FAFAF8] ${
                      i % 2 === 0 ? 'bg-white' : 'bg-[#FAFAF8]'
                    }`}
                  >
                    <td className="px-3 py-2 font-medium text-primary whitespace-nowrap">{item.unitName}</td>
                    <td className="px-3 py-2 text-[#131310] max-w-[140px]">
                      <span className="block truncate" title={item.programName}>{item.programName || '—'}</span>
                    </td>
                    <td className="px-3 py-2 text-text-secondary max-w-[200px]">
                      <span
                        className="block truncate"
                        title={[item.category, item.subcategory, item.subDetail].filter(Boolean).join(' > ')}
                      >
                        {[item.category, item.subcategory, item.subDetail].filter(Boolean).join(' > ')}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-[#131310] whitespace-nowrap">
                      {formatKRW(item.before)}
                    </td>
                    <td className={`px-3 py-2 text-right tabular-nums font-semibold whitespace-nowrap ${adjColor(item.adjustment)}`}>
                      {adjStr(item.adjustment)}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums font-semibold text-[#131310] whitespace-nowrap">
                      {formatKRW(item.after)}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t border-[#E3E3E0] bg-[#F3F3EE] font-semibold">
                  <td colSpan={3} className="px-3 py-2 text-[#131310]">합계</td>
                  <td className="px-3 py-2 text-right tabular-nums text-[#131310] whitespace-nowrap">
                    {formatKRW(totalBefore)}
                  </td>
                  <td className={`px-3 py-2 text-right tabular-nums whitespace-nowrap ${adjColor(totalAdj)}`}>
                    {adjStr(totalAdj)}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums text-[#131310] whitespace-nowrap">
                    {formatKRW(totalAfter)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>

      {/* PDF 캡처용 숨김 영역 — 변경내역 요약 PDF와 동일한 3섹션 구조 */}
      <div style={{ position: 'absolute', left: '-9999px', top: 0 }} aria-hidden="true">
        <div ref={pdfRef} style={PDF_PAGE}>

          {/* 헤더 */}
          <div style={PDF_TITLE_WRAP}>
            <span style={PDF_TITLE_MAIN}>예산변경내역</span>
            <span style={PDF_TITLE_DATE}>{label} · {record.changed_at} 기준</span>
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
                  {items.map((item, i) => {
                    const path = [item.category, item.subcategory, item.subDetail].filter(Boolean).join(' > ');
                    const bg = i % 2 === 0 ? '#ffffff' : '#f8fafc';
                    return (
                      <tr key={i}>
                        <td style={pdfTdStyle(false, { background: bg, fontWeight: 500, color: '#1F5C99', whiteSpace: 'nowrap' })}>
                          {item.unitName}
                        </td>
                        <td style={pdfTdStyle(false, { background: bg, color: '#131310' })}>{item.programName || '—'}</td>
                        <td style={pdfTdStyle(false, { background: bg, color: '#6b7280', fontSize: 9 })}>{path}</td>
                        <td style={pdfTdStyle(true, { background: bg, color: '#131310', whiteSpace: 'nowrap' })}>
                          {formatKRW(item.before)}
                        </td>
                        <td style={{ ...pdfTdStyle(true), background: bg, whiteSpace: 'nowrap', fontWeight: item.adjustment !== 0 ? 600 : 400, ...adjInlineColor(item.adjustment) }}>
                          {item.adjustment !== 0 ? (item.adjustment > 0 ? '+' : '') + formatKRW(item.adjustment) : '-'}
                        </td>
                        <td style={pdfTdStyle(true, { background: bg, color: '#131310', fontWeight: 500, whiteSpace: 'nowrap' })}>
                          {formatKRW(item.after)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr>
                    <td colSpan={3} style={pdfFootTd()}>합계</td>
                    <td style={pdfFootTd(true)}>{formatKRW(totalBefore)}</td>
                    <td style={{ ...pdfFootTd(true), ...adjInlineColor(totalAdj) }}>
                      {totalAdj !== 0 ? (totalAdj > 0 ? '+' : '') + formatKRW(totalAdj) : '-'}
                    </td>
                    <td style={pdfFootTd(true)}>{formatKRW(totalAfter)}</td>
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
                    <td style={pdfFootTd(true)}>{formatKRW(totalBefore)}</td>
                    <td style={{ ...pdfFootTd(true), ...adjInlineColor(totalAdj) }}>
                      {totalAdj !== 0 ? (totalAdj > 0 ? '+' : '') + formatKRW(totalAdj) : '-'}
                    </td>
                    <td style={pdfFootTd(true)}>{formatKRW(totalAfter)}</td>
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
                    <td style={pdfFootTd(true)}>{formatKRW(totalBefore)}</td>
                    <td style={{ ...pdfFootTd(true), ...adjInlineColor(totalAdj) }}>
                      {totalAdj !== 0 ? (totalAdj > 0 ? '+' : '') + formatKRW(totalAdj) : '-'}
                    </td>
                    <td style={pdfFootTd(true)}>{formatKRW(totalAfter)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>

        </div>
      </div>

      <ConfirmDialog
        open={confirmOpen}
        title="이력 삭제"
        description={`${label}을(를) 삭제하면 복구할 수 없습니다. 계속하시겠습니까?`}
        confirmLabel="삭제"
        loading={deleting}
        onConfirm={() => void handleDelete()}
        onClose={() => setConfirmOpen(false)}
      />
    </>
  );
}

// ── 메인 컴포넌트 ─────────────────────────────────────────────────
interface Props {
  records: BudgetChangeHistory[];
  canDelete?: boolean;
  onDelete?: (id: string) => Promise<void>;
}

export function UnitBudgetHistoryTable({ records, canDelete, onDelete }: Props) {
  // program-adjustment 타입만 필터링
  const adjRecords = records
    .filter((r) => (r.snapshot as Record<string, unknown> | null)?.type === 'program-adjustment')
    .sort((a, b) => b.changed_at.localeCompare(a.changed_at));

  if (adjRecords.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-gray-300 py-12 text-center">
        <History className="mx-auto mb-3 h-8 w-8 text-gray-300" />
        <p className="text-sm text-gray-500">아직 증감액 확정 이력이 없습니다.</p>
        <p className="mt-1 text-xs text-gray-400">증감액 확정 버튼을 사용하면 이력이 기록됩니다.</p>
      </div>
    );
  }

  // 날짜별 그룹화
  const grouped = adjRecords.reduce<Record<string, BudgetChangeHistory[]>>((acc, r) => {
    const date = r.changed_at;
    if (!acc[date]) acc[date] = [];
    acc[date].push(r);
    return acc;
  }, {});

  const sortedDates = Object.keys(grouped).sort((a, b) => b.localeCompare(a));

  return (
    <div className="space-y-4">
      <p className="text-sm text-gray-500">
        총 <span className="font-semibold text-gray-800">{adjRecords.length}건</span>의 증감 확정 이력이 있습니다.
      </p>

      {sortedDates.map((date) => {
        const sessions = grouped[date];
        const isMulti  = sessions.length > 1;
        return (
          <div key={date} className="space-y-2">
            {isMulti && (
              <div className="px-1 text-xs font-semibold text-text-secondary uppercase tracking-wide">
                {date} — {sessions.length}회 변경
              </div>
            )}
            {sessions.map((record, idx) => (
              <RecordCard
                key={record.id}
                record={record}
                label={isMulti ? `${date} (${idx + 1}차 변경)` : `${date} 변경`}
                canDelete={canDelete}
                onDelete={onDelete ? () => onDelete(record.id) : undefined}
              />
            ))}
          </div>
        );
      })}
    </div>
  );
}

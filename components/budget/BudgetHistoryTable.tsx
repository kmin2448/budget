// components/budget/BudgetHistoryTable.tsx
'use client';

import { useState, useRef, useCallback } from 'react';
import type { CSSProperties } from 'react';
import { Trash2, ChevronDown, ChevronUp, FileDown, FileSpreadsheet, History } from 'lucide-react';
import { formatKRW } from '@/lib/utils';
import { ConfirmDialog } from '@/components/shared/ConfirmDialog';
import { BudgetPdfDownload } from '@/components/budget/BudgetPdfDownload';
import { Button } from '@/components/ui/button';
import type { BudgetChangeHistory, BudgetCategoryRow, BudgetDetailRow } from '@/types';

type HistorySubTab = 'category' | 'detail' | 'integrated';

interface Props {
  records: BudgetChangeHistory[];
  canDelete?: boolean;
  onDelete?: (id: string) => Promise<void>;
}

// ── 유틸 ──────────────────────────────────────────────────────────
function parseSnapshot(snap: Record<string, unknown> | null): {
  categorySnapshot: BudgetCategoryRow[];
  detailSnapshot: BudgetDetailRow[];
} {
  if (!snap) return { categorySnapshot: [], detailSnapshot: [] };
  if ('categorySnapshot' in snap) {
    return {
      categorySnapshot: (snap.categorySnapshot as BudgetCategoryRow[]) ?? [],
      detailSnapshot:   (snap.detailSnapshot   as BudgetDetailRow[])   ?? [],
    };
  }
  if (Array.isArray(snap)) {
    return { categorySnapshot: snap as BudgetCategoryRow[], detailSnapshot: [] };
  }
  return { categorySnapshot: [], detailSnapshot: [] };
}

function adjColor(v: number) {
  return v > 0 ? 'text-primary' : v < 0 ? 'text-red-500' : 'text-text-secondary';
}
function adjStr(v: number) {
  return v !== 0 ? (v > 0 ? '+' : '') + formatKRW(v) : '-';
}
function formatMonth(ym: string): string {
  const parts = ym.split('-');
  return `${parts[0]}년 ${parseInt(parts[1] ?? '1', 10)}월`;
}

// ── Excel 내보내기 (단건) ─────────────────────────────────────────
async function exportRecordToExcel(record: BudgetChangeHistory, label: string) {
  const XLSX = await import('xlsx');
  const { categorySnapshot, detailSnapshot } = parseSnapshot(record.snapshot ?? null);

  const wb = XLSX.utils.book_new();

  // 비목별 시트
  const catRows = [
    ['비목', '변경전 편성액', '증감액', '변경후 편성액', '집행금액', '잔액'],
    ...categorySnapshot.map((r) => [
      r.category,
      r.allocation,
      r.adjustment,
      r.afterAllocation,
      r.executionComplete + r.executionPlanned,
      r.balance,
    ]),
    [
      '합계',
      categorySnapshot.reduce((s, r) => s + r.allocation, 0),
      categorySnapshot.reduce((s, r) => s + r.adjustment, 0),
      categorySnapshot.reduce((s, r) => s + r.afterAllocation, 0),
      categorySnapshot.reduce((s, r) => s + r.executionComplete + r.executionPlanned, 0),
      categorySnapshot.reduce((s, r) => s + r.balance, 0),
    ],
  ];
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(catRows), '비목별');

  // 세목별 시트
  if (detailSnapshot.length > 0) {
    const detRows = [
      ['비목', '세목', '보조세목', '변경전 편성액', '증감액', '변경후 편성액', '집행완료', '집행예정', '잔액'],
      ...detailSnapshot.map((r) => [
        r.category,
        r.subcategory || '-',
        r.subDetail || '-',
        r.allocation,
        r.adjustment,
        r.afterAllocation,
        r.executionComplete,
        r.executionPlanned,
        r.balance,
      ]),
    ];
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(detRows), '통합');
  }

  XLSX.writeFile(wb, `예산변경_${label}_${record.changed_at}.xlsx`);
}

// ── Excel 내보내기 (전체) ─────────────────────────────────────────
async function exportAllToExcel(records: BudgetChangeHistory[]) {
  const XLSX = await import('xlsx');
  const wb = XLSX.utils.book_new();

  // 이력 요약 시트
  const summaryRows = [
    ['변경일', '변경비목', '변경전 총액', '증감액', '변경후 총액'],
    ...records.map((r) => [r.changed_at, r.category, r.before_amount, r.adjustment, r.after_amount]),
  ];
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(summaryRows), '이력요약');

  // 이력별 비목 시트
  [...records].reverse().forEach((record, idx) => {
    const { categorySnapshot } = parseSnapshot(record.snapshot ?? null);
    if (categorySnapshot.length === 0) return;
    const sheetName = `${idx + 1}_${record.changed_at.replace(/-/g, '').slice(2)}`.slice(0, 31);
    const data = [
      ['비목', '변경전 편성액', '증감액', '변경후 편성액', '집행금액', '잔액'],
      ...categorySnapshot.map((r) => [
        r.category, r.allocation, r.adjustment, r.afterAllocation,
        r.executionComplete + r.executionPlanned, r.balance,
      ]),
    ];
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(data), sheetName);
  });

  XLSX.writeFile(wb, `예산변경이력_전체_${new Date().toISOString().slice(0, 10)}.xlsx`);
}

// ── 변경이력 뷰 컴포넌트들 (기존 유지) ───────────────────────────

function CategoryView({ rows }: { rows: BudgetCategoryRow[] }) {
  const changed = rows.filter((r) => r.adjustment !== 0);
  if (changed.length === 0) return <EmptyView />;
  return (
    <table className="w-full text-xs">
      <thead>
        <tr className="border-b border-[#E3E3E0] bg-[#F3F3EE] text-text-secondary">
          <th className="px-3 py-2 text-left font-medium">비목</th>
          <th className="px-3 py-2 text-right font-medium">변경전 편성액</th>
          <th className="px-3 py-2 text-right font-medium">증감액</th>
          <th className="px-3 py-2 text-right font-medium">변경후 편성액</th>
          <th className="px-3 py-2 text-right font-medium">잔액</th>
        </tr>
      </thead>
      <tbody>
        {changed.map((r) => (
          <tr key={r.category} className="border-b border-[#F0F0EE] last:border-0 hover:bg-[#FAFAF8]">
            <td className="px-3 py-2 font-medium text-[#131310]">{r.category}</td>
            <td className="px-3 py-2 text-right tabular-nums text-[#131310]">{formatKRW(r.allocation)}</td>
            <td className={`px-3 py-2 text-right tabular-nums font-semibold ${adjColor(r.adjustment)}`}>
              {adjStr(r.adjustment)}
            </td>
            <td className="px-3 py-2 text-right tabular-nums font-semibold text-[#131310]">{formatKRW(r.afterAllocation)}</td>
            <td className={`px-3 py-2 text-right tabular-nums ${r.balance < 0 ? 'text-red-500' : 'text-[#131310]'}`}>
              {formatKRW(r.balance)}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function DetailView({ rows }: { rows: BudgetDetailRow[] }) {
  const aggMap = new Map<string, { subcategory: string; subDetail: string; allocation: number; adjustment: number; afterAllocation: number }>();
  for (const r of rows) {
    const key = `${r.subcategory}||${r.subDetail}`;
    const ex  = aggMap.get(key);
    if (ex) {
      ex.allocation      += r.allocation;
      ex.adjustment      += r.adjustment;
      ex.afterAllocation += r.afterAllocation;
    } else {
      aggMap.set(key, { subcategory: r.subcategory, subDetail: r.subDetail, allocation: r.allocation, adjustment: r.adjustment, afterAllocation: r.afterAllocation });
    }
  }
  const changed = Array.from(aggMap.values()).filter((r) => r.adjustment !== 0);
  if (changed.length === 0) return <EmptyView />;
  return (
    <table className="w-full text-xs">
      <thead>
        <tr className="border-b border-[#E3E3E0] bg-[#F3F3EE] text-text-secondary">
          <th className="px-3 py-2 text-left font-medium">세목</th>
          <th className="px-3 py-2 text-left font-medium">보조세목</th>
          <th className="px-3 py-2 text-right font-medium">변경전 편성액</th>
          <th className="px-3 py-2 text-right font-medium">증감액</th>
          <th className="px-3 py-2 text-right font-medium">변경후 편성액</th>
        </tr>
      </thead>
      <tbody>
        {changed.map((r) => (
          <tr key={`${r.subcategory}||${r.subDetail}`} className="border-b border-[#F0F0EE] last:border-0 hover:bg-[#FAFAF8]">
            <td className="px-3 py-2 font-medium text-primary">{r.subcategory || '-'}</td>
            <td className="px-3 py-2 text-text-secondary">{r.subDetail || '-'}</td>
            <td className="px-3 py-2 text-right tabular-nums text-[#131310]">{formatKRW(r.allocation)}</td>
            <td className={`px-3 py-2 text-right tabular-nums font-semibold ${adjColor(r.adjustment)}`}>
              {adjStr(r.adjustment)}
            </td>
            <td className="px-3 py-2 text-right tabular-nums font-semibold text-[#131310]">{formatKRW(r.afterAllocation)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function IntegratedView({ rows, categoryRows }: { rows: BudgetDetailRow[]; categoryRows: BudgetCategoryRow[] }) {
  const changed = rows.filter((r) => r.adjustment !== 0);

  if (changed.length === 0) {
    const changedCats = categoryRows.filter((r) => r.adjustment !== 0);
    if (changedCats.length === 0) return <EmptyView />;
    return (
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b border-[#E3E3E0] bg-[#F3F3EE] text-text-secondary">
            <th className="px-3 py-2 text-left font-medium">비목</th>
            <th className="px-3 py-2 text-right font-medium">변경전 편성액</th>
            <th className="px-3 py-2 text-right font-medium">증감액</th>
            <th className="px-3 py-2 text-right font-medium">변경후 편성액</th>
          </tr>
        </thead>
        <tbody>
          {changedCats.map((r) => (
            <tr key={r.category} className="border-b border-[#F0F0EE] last:border-0 hover:bg-[#FAFAF8]">
              <td className="px-3 py-2 font-semibold text-primary">{r.category}</td>
              <td className="px-3 py-2 text-right tabular-nums text-[#131310]">{formatKRW(r.allocation)}</td>
              <td className={`px-3 py-2 text-right tabular-nums font-semibold ${adjColor(r.adjustment)}`}>{adjStr(r.adjustment)}</td>
              <td className="px-3 py-2 text-right tabular-nums font-semibold text-[#131310]">{formatKRW(r.afterAllocation)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    );
  }

  const grouped = changed.reduce<Record<string, BudgetDetailRow[]>>((acc, r) => {
    if (!acc[r.category]) acc[r.category] = [];
    acc[r.category].push(r);
    return acc;
  }, {});

  let idx = 0;
  return (
    <table className="w-full text-xs">
      <thead>
        <tr className="border-b border-[#E3E3E0] bg-[#F3F3EE] text-text-secondary">
          <th className="px-3 py-2 text-left font-medium">비목</th>
          <th className="px-3 py-2 text-left font-medium">세목</th>
          <th className="px-3 py-2 text-left font-medium">보조세목</th>
          <th className="px-3 py-2 text-right font-medium">변경전 편성액</th>
          <th className="px-3 py-2 text-right font-medium">증감액</th>
          <th className="px-3 py-2 text-right font-medium">변경후 편성액</th>
        </tr>
      </thead>
      <tbody>
        {Object.entries(grouped).map(([category, catRows]) =>
          catRows.map((r, i) => {
            const bg = idx++ % 2 === 0 ? 'bg-white' : 'bg-gray-50/50';
            const isFirst = i === 0;
            return (
              <tr key={r.rowOffset} className={`border-b border-gray-100 last:border-0 hover:bg-primary-bg/20 ${bg} ${isFirst && idx > 1 ? 'border-t border-t-gray-200' : ''}`}>
                <td className="px-3 py-2 font-semibold text-primary">{isFirst ? category : ''}</td>
                <td className="px-3 py-2 text-[#131310]">{r.subcategory || '-'}</td>
                <td className="px-3 py-2 text-text-secondary">{r.subDetail || '-'}</td>
                <td className="px-3 py-2 text-right tabular-nums text-[#131310]">{formatKRW(r.allocation)}</td>
                <td className={`px-3 py-2 text-right tabular-nums font-semibold ${adjColor(r.adjustment)}`}>
                  {adjStr(r.adjustment)}
                </td>
                <td className="px-3 py-2 text-right tabular-nums font-semibold text-[#131310]">{formatKRW(r.afterAllocation)}</td>
              </tr>
            );
          }),
        )}
      </tbody>
    </table>
  );
}

function EmptyView() {
  return <p className="px-4 py-3 text-xs text-gray-400">변경된 항목이 없습니다.</p>;
}

// ── 세션 1건 ─────────────────────────────────────────────────────
function SessionView({
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
  const [subTab, setSubTab]           = useState<HistorySubTab>('integrated');
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [deleting, setDeleting]       = useState(false);
  const [xlsxLoading, setXlsxLoading] = useState(false);

  const { categorySnapshot, detailSnapshot } = parseSnapshot(record.snapshot ?? null);

  const effectiveCategorySnapshot: BudgetCategoryRow[] = categorySnapshot.length > 0
    ? categorySnapshot
    : [{
        category:          record.category,
        allocation:        record.before_amount,
        adjustment:        record.adjustment,
        afterAllocation:   record.after_amount,
        executionComplete: 0,
        executionPlanned:  0,
        balance:           record.after_amount,
        executionRate:     0,
      }];

  const hasFullSnapshot = categorySnapshot.length > 0 && detailSnapshot.length > 0;

  const changedCatCount = effectiveCategorySnapshot.filter((r) => r.adjustment !== 0).length;
  const changedDetCount = detailSnapshot.filter((r) => r.adjustment !== 0).length;
  const changeLabel = changedDetCount > 0
    ? `${changedDetCount}개 세목 변경`
    : changedCatCount > 0
    ? `${changedCatCount}개 비목 변경`
    : '세목 내 조정';

  async function handleDelete() {
    if (!onDelete) return;
    setDeleting(true);
    try { await onDelete(); }
    finally { setDeleting(false); setConfirmOpen(false); }
  }

  async function handleExcel() {
    setXlsxLoading(true);
    try { await exportRecordToExcel(record, label); }
    catch (err) { alert(`Excel 생성 오류: ${err instanceof Error ? err.message : String(err)}`); }
    finally { setXlsxLoading(false); }
  }

  const tabs: { key: HistorySubTab; label: string }[] = [
    { key: 'category',   label: '비목별' },
    { key: 'detail',     label: '세목별' },
    { key: 'integrated', label: '통합' },
  ];

  return (
    <>
      <div className="rounded-[2px] border border-[#E3E3E0] overflow-hidden shadow-soft">
        {/* 헤더 */}
        <div className="flex items-center justify-between bg-[#F3F3EE] border-b border-divider px-4 py-2.5">
          <span className="font-semibold text-primary text-sm">{label}</span>
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-500">{changeLabel}</span>

            {/* 기존 확정서 링크 */}
            {record.pdf_drive_url && (
              <a
                href={record.pdf_drive_url}
                target="_blank"
                rel="noopener noreferrer"
                className="rounded bg-primary px-2 py-0.5 text-xs text-white hover:bg-primary-light"
              >
                확정서 보기
              </a>
            )}

            {/* PDF 다운로드 (전체 행 포함) */}
            {hasFullSnapshot && (
              <BudgetPdfDownload
                detailSnapshot={detailSnapshot}
                categorySnapshot={effectiveCategorySnapshot}
                changedAt={record.changed_at}
                label="PDF"
                size="sm"
                variant="outline"
                className="h-7 px-2 text-xs"
              />
            )}

            {/* Excel 내보내기 */}
            {categorySnapshot.length > 0 && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => void handleExcel()}
                disabled={xlsxLoading}
                className="h-7 gap-1 px-2 text-xs text-text-secondary"
              >
                <FileSpreadsheet className="h-3 w-3" />
                {xlsxLoading ? '...' : 'Excel'}
              </Button>
            )}

            {/* 삭제 */}
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

        {/* 서브 탭 */}
        <div className="flex gap-0 border-b border-[#E3E3E0] bg-white px-4 pt-2">
          {tabs.map(({ key, label: tabLabel }) => (
            <button
              key={key}
              onClick={() => setSubTab(key)}
              className={`px-3 py-1.5 text-xs font-medium transition-colors relative ${
                subTab === key
                  ? 'text-primary after:absolute after:bottom-0 after:left-0 after:h-0.5 after:w-full after:bg-primary'
                  : 'text-gray-500 hover:text-[#131310]'
              }`}
            >
              {tabLabel}
            </button>
          ))}
        </div>

        {/* 내용 */}
        <div className="bg-white">
          {subTab === 'category'   && <CategoryView   rows={effectiveCategorySnapshot} />}
          {subTab === 'detail'     && <DetailView     rows={detailSnapshot} />}
          {subTab === 'integrated' && <IntegratedView rows={detailSnapshot} categoryRows={effectiveCategorySnapshot} />}
        </div>
      </div>

      <ConfirmDialog
        open={confirmOpen}
        title="변경이력 삭제"
        description={`${label}을(를) 삭제하면 복구할 수 없습니다. 계속하시겠습니까?`}
        confirmLabel="삭제"
        loading={deleting}
        onConfirm={() => void handleDelete()}
        onClose={() => setConfirmOpen(false)}
      />
    </>
  );
}

// ── 날짜 그룹 ─────────────────────────────────────────────────────
function DateGroup({
  date,
  sessions,
  canDelete,
  onDelete,
}: {
  date: string;
  sessions: BudgetChangeHistory[];
  canDelete?: boolean;
  onDelete?: (id: string) => Promise<void>;
}) {
  const multiSession = sessions.length > 1;
  return (
    <div className="space-y-2">
      {multiSession && (
        <div className="px-1 text-xs font-semibold text-text-secondary uppercase tracking-wide">
          {date} — {sessions.length}회 변경
        </div>
      )}
      {sessions.map((session, idx) => (
        <SessionView
          key={session.id}
          record={session}
          label={multiSession ? `${date} (${idx + 1}차 변경)` : `${date} 변경`}
          canDelete={canDelete}
          onDelete={onDelete ? () => onDelete(session.id) : undefined}
        />
      ))}
    </div>
  );
}

// ── 전체 이력 PDF 숨김 레이아웃 — BudgetPdfDownload Page1(통합)과 동일 포맷 ──
const PDF_ALL_PAGE: CSSProperties = {
  width: 1080, padding: '22px 28px', background: '#ffffff',
  fontFamily: '-apple-system, BlinkMacSystemFont, "Helvetica Neue", Arial, "Malgun Gothic", sans-serif',
  boxSizing: 'border-box',
};
const PDF_TITLE_WRAP: CSSProperties  = { textAlign: 'center', marginBottom: 18, paddingBottom: 10, borderBottom: '2px solid #1F5C99' };
const PDF_TITLE_MAIN: CSSProperties  = { display: 'block', fontSize: 17, fontWeight: 700, color: '#111827', letterSpacing: '-0.5px', marginBottom: 5 };
const PDF_TITLE_DATE: CSSProperties  = { display: 'block', fontSize: 10, color: '#6b7280', fontWeight: 400 };
const PDF_SEC_LABEL: CSSProperties   = { fontSize: 12, fontWeight: 700, color: '#1F5C99', borderBottom: '1.5px solid #1F5C99', paddingBottom: 4, marginBottom: 7 };
const PDF_TABLE: CSSProperties       = { width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed' };
const PDF_TD: CSSProperties          = { padding: '5px 4px', fontSize: 8, lineHeight: 1.4, verticalAlign: 'middle', wordBreak: 'keep-all' };
const PDF_TDR: CSSProperties         = { padding: '5px 4px', fontSize: 8.5, textAlign: 'right', lineHeight: 1.4, verticalAlign: 'middle', whiteSpace: 'nowrap' };
const PDF_TFOOT_TD: CSSProperties    = { padding: '5px 4px', fontSize: 8.5, lineHeight: 1.4, verticalAlign: 'middle', background: '#f1f5f9', borderTop: '2px solid #374151', fontWeight: 700 };
const PDF_TFOOT_TDR: CSSProperties   = { padding: '5px 4px', fontSize: 8.5, textAlign: 'right', lineHeight: 1.4, verticalAlign: 'middle', background: '#f1f5f9', borderTop: '2px solid #374151', fontWeight: 700, whiteSpace: 'nowrap' };

function pdfTh(w: string, right = false): CSSProperties {
  return { padding: '5px 4px', background: '#1F5C99', color: '#ffffff', fontWeight: 600, fontSize: 8.5, textAlign: right ? 'right' : 'left', width: w, lineHeight: 1.3, verticalAlign: 'middle' };
}
function pdfBgStyle(idx: number, hasAdj: boolean): CSSProperties {
  return { background: hasAdj ? '#eff6ff' : idx % 2 === 0 ? '#ffffff' : '#f8fafc', borderBottom: '1px solid #f0f0f0' };
}
function pdfAdjStyle(v: number): CSSProperties {
  return { padding: '5px 4px', fontSize: 8.5, textAlign: 'right', lineHeight: 1.4, verticalAlign: 'middle', whiteSpace: 'nowrap', fontWeight: v !== 0 ? 600 : 400, color: v > 0 ? '#1d4ed8' : v < 0 ? '#dc2626' : '#9ca3af' };
}
function pdfAdjStr(v: number) { return v !== 0 ? `${v > 0 ? '+' : ''}${formatKRW(v)}` : '-'; }

function AllHistoryPdfPageContent({
  record,
  index,
  total,
}: {
  record: BudgetChangeHistory;
  index: number;
  total: number;
}) {
  const { categorySnapshot, detailSnapshot } = parseSnapshot(record.snapshot ?? null);

  const effectiveCatSnapshot: BudgetCategoryRow[] = categorySnapshot.length > 0
    ? categorySnapshot
    : [{
        category: record.category, allocation: record.before_amount,
        adjustment: record.adjustment, afterAllocation: record.after_amount,
        executionComplete: 0, executionPlanned: 0, balance: record.after_amount, executionRate: 0,
      }];

  // detailSnapshot이 있으면 통합(비목+세목+보조세목) 테이블, 없으면 비목 테이블
  const grouped = detailSnapshot.reduce<Record<string, BudgetDetailRow[]>>((acc, row) => {
    if (!acc[row.category]) acc[row.category] = [];
    acc[row.category].push(row);
    return acc;
  }, {});
  const hasDetail = detailSnapshot.length > 0;

  const totalBefore = effectiveCatSnapshot.reduce((s, r) => s + r.allocation, 0);
  const totalAdj    = effectiveCatSnapshot.reduce((s, r) => s + r.adjustment, 0);
  const totalAfter  = effectiveCatSnapshot.reduce((s, r) => s + r.afterAllocation, 0);
  const totalExec   = effectiveCatSnapshot.reduce((s, r) => s + r.executionComplete + r.executionPlanned, 0);
  const totalBal    = effectiveCatSnapshot.reduce((s, r) => s + r.balance, 0);
  const recordNum   = total - index;

  return (
    <div style={PDF_ALL_PAGE}>
      {/* 타이틀 */}
      <div style={PDF_TITLE_WRAP}>
        <span style={PDF_TITLE_MAIN}>예산변경 비교표</span>
        <span style={PDF_TITLE_DATE}>
          {recordNum}차 변경 · 변경일자: {record.changed_at}
          {index === 0 ? ` · 총 ${total}건 이력` : ''}
        </span>
      </div>

      {/* 섹션 레이블 */}
      <div style={PDF_SEC_LABEL}>1. 통합</div>

      {hasDetail ? (
        /* 비목+세목+보조세목 통합 테이블 (BudgetPdfDownload Page1과 동일) */
        <table style={PDF_TABLE}>
          <thead>
            <tr>
              <th style={pdfTh('14%')}>비목</th>
              <th style={pdfTh('11%')}>세목</th>
              <th style={pdfTh('11%')}>세세목</th>
              <th style={pdfTh('13%', true)}>편성액</th>
              <th style={pdfTh('9%',  true)}>증감액</th>
              <th style={pdfTh('13%', true)}>변경후 편성액</th>
              <th style={pdfTh('14%', true)}>집행금액</th>
              <th style={pdfTh('15%', true)}>잔액</th>
            </tr>
          </thead>
          <tbody>
            {Object.entries(grouped).map(([category, rows]) => {
              const catRow = effectiveCatSnapshot.find((c) => c.category === category);
              return rows.map((row, i) => {
                const bg = pdfBgStyle(i, row.adjustment !== 0);
                return (
                  <tr key={`${record.id}-${row.rowOffset}`}>
                    <td style={{ ...PDF_TD, ...bg, fontWeight: 600, color: '#1F5C99' }}>
                      {i === 0 && (
                        <>
                          <div>{category}</div>
                          {(catRow?.adjustment ?? 0) !== 0 && (
                            <div style={{ fontSize: 7, color: (catRow?.adjustment ?? 0) > 0 ? '#1d4ed8' : '#dc2626' }}>
                              {(catRow?.adjustment ?? 0) > 0 ? '+' : ''}{formatKRW(catRow?.adjustment ?? 0)}
                            </div>
                          )}
                        </>
                      )}
                    </td>
                    <td style={{ ...PDF_TD, ...bg, color: '#4b5563' }}>{row.subcategory || '-'}</td>
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
      ) : (
        /* snapshot 없는 구형 이력: 비목 수준만 표시 */
        <table style={PDF_TABLE}>
          <thead>
            <tr>
              <th style={pdfTh('36%')}>비목</th>
              <th style={pdfTh('13%', true)}>편성액</th>
              <th style={pdfTh('9%', true)}>증감액</th>
              <th style={pdfTh('13%', true)}>변경후 편성액</th>
              <th style={pdfTh('14%', true)}>집행금액</th>
              <th style={pdfTh('15%', true)}>잔액</th>
            </tr>
          </thead>
          <tbody>
            {effectiveCatSnapshot.map((row, i) => {
              const bg = pdfBgStyle(i, row.adjustment !== 0);
              return (
                <tr key={row.category}>
                  <td style={{ ...PDF_TD, ...bg, fontWeight: 500, color: '#1F5C99' }}>{row.category}</td>
                  <td style={{ ...PDF_TDR, ...bg, color: '#374151' }}>{formatKRW(row.allocation)}</td>
                  <td style={{ ...pdfAdjStyle(row.adjustment), ...bg }}>{pdfAdjStr(row.adjustment)}</td>
                  <td style={{ ...PDF_TDR, ...bg, fontWeight: 600, color: '#111827' }}>{formatKRW(row.afterAllocation)}</td>
                  <td style={{ ...PDF_TDR, ...bg }}>{formatKRW(row.executionComplete + row.executionPlanned)}</td>
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
      )}
    </div>
  );
}

// ── 메인 컴포넌트 ─────────────────────────────────────────────────
export function BudgetHistoryTable({ records, canDelete, onDelete }: Props) {
  const [showOlder, setShowOlder]           = useState(false);
  const [selectedMonth, setSelectedMonth]   = useState<string>('all');
  const [pdfAllLoading, setPdfAllLoading]   = useState(false);
  const [xlsxAllLoading, setXlsxAllLoading] = useState(false);

  const allPdfRefs = useRef<(HTMLDivElement | null)[]>([]);
  const setAllPdfRef = useCallback((el: HTMLDivElement | null, idx: number) => {
    allPdfRefs.current[idx] = el;
  }, []);

  if (records.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-gray-300 py-12 text-center text-sm text-gray-500">
        아직 예산변경 이력이 없습니다.
      </div>
    );
  }

  const sortedRecords = [...records].sort((a, b) => b.changed_at.localeCompare(a.changed_at));
  const recentRecords = sortedRecords.slice(0, 3);
  const olderRecords  = sortedRecords.slice(3);

  // 월별 필터 옵션 (이전 이력 기준)
  const olderMonths = Array.from(new Set(olderRecords.map((r) => r.changed_at.substring(0, 7))))
    .sort()
    .reverse();

  const filteredOlder = selectedMonth === 'all'
    ? olderRecords
    : olderRecords.filter((r) => r.changed_at.startsWith(selectedMonth));

  // 날짜별 그룹화
  function groupByDate(recs: BudgetChangeHistory[]): Record<string, BudgetChangeHistory[]> {
    return recs.reduce<Record<string, BudgetChangeHistory[]>>((acc, r) => {
      if (!acc[r.changed_at]) acc[r.changed_at] = [];
      acc[r.changed_at].push(r);
      return acc;
    }, {});
  }

  // 전체 PDF 다운로드 (오래된 순)
  async function handleDownloadAllPdf() {
    const refs = allPdfRefs.current.filter(Boolean) as HTMLDivElement[];
    if (refs.length === 0) return;
    setPdfAllLoading(true);
    try {
      const jsPDFMod = await import('jspdf');
      const JsPDF = jsPDFMod.jsPDF ?? (jsPDFMod as unknown as { default: { jsPDF: unknown } }).default?.jsPDF;
      if (!JsPDF) throw new Error('jsPDF 모듈을 불러오지 못했습니다.');
      const { default: html2canvas } = await import('html2canvas');

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const pdf = new (JsPDF as any)({ orientation: 'landscape', unit: 'mm', format: 'a4' });
      const pdfW: number  = pdf.internal.pageSize.getWidth();
      const pdfH: number  = pdf.internal.pageSize.getHeight();
      const margin    = 10;
      const contentW  = pdfW - margin * 2;
      const contentH  = pdfH - margin * 2;
      const captureOpts = { scale: 2, useCORS: true, logging: false, scrollX: 0, scrollY: 0, backgroundColor: '#ffffff' };

      for (let i = 0; i < refs.length; i++) {
        if (i > 0) pdf.addPage();
        const el = refs[i];
        const canvas = await html2canvas(el, { ...captureOpts, width: el.scrollWidth, height: el.scrollHeight });
        let imgW = contentW;
        let imgH = (canvas.height / canvas.width) * contentW;
        if (imgH > contentH) { imgH = contentH; imgW = (canvas.width / canvas.height) * contentH; }
        pdf.addImage(canvas.toDataURL('image/png'), 'PNG', margin + (contentW - imgW) / 2, margin, imgW, imgH);
      }

      pdf.save(`예산변경이력_전체_${new Date().toISOString().slice(0, 10)}.pdf`);
    } catch (err) {
      alert(`PDF 생성 오류: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setPdfAllLoading(false);
    }
  }

  async function handleDownloadAllExcel() {
    setXlsxAllLoading(true);
    try { await exportAllToExcel(records); }
    catch (err) { alert(`Excel 생성 오류: ${err instanceof Error ? err.message : String(err)}`); }
    finally { setXlsxAllLoading(false); }
  }

  const recentGrouped = groupByDate(recentRecords);
  const olderGrouped  = groupByDate(filteredOlder);
  const sortedRecordsOldFirst = [...records].reverse();

  return (
    <div className="space-y-4">
      {/* ── 툴바 ── */}
      <div className="flex items-center justify-between">
        <p className="text-sm text-gray-500">
          총 <span className="font-semibold text-gray-800">{records.length}건</span>의 변경이력이 있습니다.
        </p>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => void handleDownloadAllPdf()}
            disabled={pdfAllLoading}
            className="gap-1.5 text-text-secondary"
          >
            <FileDown className="h-3.5 w-3.5" />
            {pdfAllLoading ? 'PDF 생성 중...' : '전체 PDF 다운로드'}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => void handleDownloadAllExcel()}
            disabled={xlsxAllLoading}
            className="gap-1.5 text-text-secondary"
          >
            <FileSpreadsheet className="h-3.5 w-3.5" />
            {xlsxAllLoading ? '...' : '전체 Excel 내보내기'}
          </Button>
        </div>
      </div>

      {/* ── 최근 3건 ── */}
      {Object.entries(recentGrouped).map(([date, sessions]) => (
        <DateGroup
          key={date}
          date={date}
          sessions={sessions}
          canDelete={canDelete}
          onDelete={onDelete}
        />
      ))}

      {/* ── 이전 변경사항 보기 ── */}
      {olderRecords.length > 0 && (
        <div className="rounded-[2px] border border-gray-200 overflow-hidden">
          <button
            onClick={() => setShowOlder((v) => !v)}
            className="flex w-full items-center justify-between px-4 py-3 bg-gray-50 hover:bg-gray-100 transition-colors"
          >
            <div className="flex items-center gap-2">
              <History className="h-4 w-4 text-gray-500" />
              <span className="text-sm font-medium text-[#131310]">
                이전 변경사항 보기
              </span>
              <span className="rounded-full bg-gray-200 px-2 py-0.5 text-xs font-semibold text-text-secondary">
                {olderRecords.length}건
              </span>
            </div>
            {showOlder
              ? <ChevronUp className="h-4 w-4 text-gray-400" />
              : <ChevronDown className="h-4 w-4 text-gray-400" />
            }
          </button>

          {showOlder && (
            <div className="p-4 space-y-4">
              {/* 월별 필터 */}
              {olderMonths.length > 1 && (
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs font-medium text-gray-500">기간 필터:</span>
                  <button
                    onClick={() => setSelectedMonth('all')}
                    className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                      selectedMonth === 'all'
                        ? 'bg-primary text-white'
                        : 'bg-gray-100 text-text-secondary hover:bg-gray-200'
                    }`}
                  >
                    전체보기
                  </button>
                  {olderMonths.map((ym) => (
                    <button
                      key={ym}
                      onClick={() => setSelectedMonth(ym)}
                      className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                        selectedMonth === ym
                          ? 'bg-primary text-white'
                          : 'bg-gray-100 text-text-secondary hover:bg-gray-200'
                      }`}
                    >
                      {formatMonth(ym)}
                    </button>
                  ))}
                </div>
              )}

              {/* 필터된 이전 이력 목록 */}
              {filteredOlder.length === 0 ? (
                <p className="text-sm text-gray-400 text-center py-6">
                  해당 월에 변경이력이 없습니다.
                </p>
              ) : (
                <div className="space-y-4">
                  {Object.entries(olderGrouped).map(([date, sessions]) => (
                    <DateGroup
                      key={date}
                      date={date}
                      sessions={sessions}
                      canDelete={canDelete}
                      onDelete={onDelete}
                    />
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ── 전체 PDF용 숨김 레이아웃 (오래된 순) ── */}
      <div style={{ position: 'absolute', left: '-9999px', top: 0 }} aria-hidden="true">
        {sortedRecordsOldFirst.map((record, idx) => (
          <div
            key={`all-pdf-${record.id}`}
            ref={(el) => setAllPdfRef(el, idx)}
          >
            <AllHistoryPdfPageContent
              record={record}
              index={idx}
              total={records.length}
            />
          </div>
        ))}
      </div>
    </div>
  );
}

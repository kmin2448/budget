// components/budget/BudgetHistoryTable.tsx
'use client';

import { useState } from 'react';
import { formatKRW } from '@/lib/utils';
import type { BudgetChangeHistory, BudgetCategoryRow, BudgetDetailRow } from '@/types';

type HistorySubTab = 'category' | 'detail' | 'integrated';

interface Props {
  records: BudgetChangeHistory[];
}

function parseSnapshot(snap: Record<string, unknown> | null): {
  categorySnapshot: BudgetCategoryRow[];
  detailSnapshot: BudgetDetailRow[];
} {
  if (!snap) return { categorySnapshot: [], detailSnapshot: [] };
  // 신규 포맷: { categorySnapshot, detailSnapshot }
  if ('categorySnapshot' in snap) {
    return {
      categorySnapshot: (snap.categorySnapshot as BudgetCategoryRow[]) ?? [],
      detailSnapshot:   (snap.detailSnapshot   as BudgetDetailRow[])   ?? [],
    };
  }
  // 구 포맷: 배열 자체가 categorySnapshot
  if (Array.isArray(snap)) {
    return { categorySnapshot: snap as BudgetCategoryRow[], detailSnapshot: [] };
  }
  return { categorySnapshot: [], detailSnapshot: [] };
}

function adjColor(v: number) {
  return v > 0 ? 'text-blue-600' : v < 0 ? 'text-red-600' : 'text-gray-400';
}
function adjStr(v: number) {
  return v !== 0 ? (v > 0 ? '+' : '') + formatKRW(v) : '-';
}

// ── 비목별 변경 테이블 ─────────────────────────────────────────────
function CategoryView({ rows }: { rows: BudgetCategoryRow[] }) {
  const changed = rows.filter((r) => r.adjustment !== 0);
  if (changed.length === 0) return <EmptyView />;
  return (
    <table className="w-full text-xs">
      <thead>
        <tr className="border-b border-gray-200 bg-gray-50 text-gray-600">
          <th className="px-3 py-2 text-left font-medium">비목</th>
          <th className="px-3 py-2 text-right font-medium">변경전 편성액</th>
          <th className="px-3 py-2 text-right font-medium">증감액</th>
          <th className="px-3 py-2 text-right font-medium">변경후 편성액</th>
          <th className="px-3 py-2 text-right font-medium">잔액</th>
        </tr>
      </thead>
      <tbody>
        {changed.map((r) => (
          <tr key={r.category} className="border-b border-gray-100 last:border-0 hover:bg-gray-50">
            <td className="px-3 py-2 font-medium text-gray-800">{r.category}</td>
            <td className="px-3 py-2 text-right tabular-nums text-gray-700">{formatKRW(r.allocation)}</td>
            <td className={`px-3 py-2 text-right tabular-nums font-semibold ${adjColor(r.adjustment)}`}>
              {adjStr(r.adjustment)}
            </td>
            <td className="px-3 py-2 text-right tabular-nums font-semibold text-gray-900">{formatKRW(r.afterAllocation)}</td>
            <td className={`px-3 py-2 text-right tabular-nums ${r.balance < 0 ? 'text-red-600' : 'text-gray-700'}`}>
              {formatKRW(r.balance)}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

// ── 세목별 변경 테이블 ─────────────────────────────────────────────
function DetailView({ rows }: { rows: BudgetDetailRow[] }) {
  // (세목, 보조세목) 취합 후 증감액 != 0인 것만
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
        <tr className="border-b border-gray-200 bg-gray-50 text-gray-600">
          <th className="px-3 py-2 text-left font-medium">세목</th>
          <th className="px-3 py-2 text-left font-medium">보조세목</th>
          <th className="px-3 py-2 text-right font-medium">변경전 편성액</th>
          <th className="px-3 py-2 text-right font-medium">증감액</th>
          <th className="px-3 py-2 text-right font-medium">변경후 편성액</th>
        </tr>
      </thead>
      <tbody>
        {changed.map((r) => (
          <tr key={`${r.subcategory}||${r.subDetail}`} className="border-b border-gray-100 last:border-0 hover:bg-gray-50">
            <td className="px-3 py-2 font-medium text-primary">{r.subcategory || '-'}</td>
            <td className="px-3 py-2 text-gray-600">{r.subDetail || '-'}</td>
            <td className="px-3 py-2 text-right tabular-nums text-gray-700">{formatKRW(r.allocation)}</td>
            <td className={`px-3 py-2 text-right tabular-nums font-semibold ${adjColor(r.adjustment)}`}>
              {adjStr(r.adjustment)}
            </td>
            <td className="px-3 py-2 text-right tabular-nums font-semibold text-gray-900">{formatKRW(r.afterAllocation)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

// ── 통합 변경 테이블 ──────────────────────────────────────────────
function IntegratedView({ rows }: { rows: BudgetDetailRow[] }) {
  const changed = rows.filter((r) => r.adjustment !== 0);
  if (changed.length === 0) return <EmptyView />;

  const grouped = changed.reduce<Record<string, BudgetDetailRow[]>>((acc, r) => {
    if (!acc[r.category]) acc[r.category] = [];
    acc[r.category].push(r);
    return acc;
  }, {});

  let idx = 0;
  return (
    <table className="w-full text-xs">
      <thead>
        <tr className="border-b border-gray-200 bg-gray-50 text-gray-600">
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
                <td className="px-3 py-2 text-gray-700">{r.subcategory || '-'}</td>
                <td className="px-3 py-2 text-gray-600">{r.subDetail || '-'}</td>
                <td className="px-3 py-2 text-right tabular-nums text-gray-700">{formatKRW(r.allocation)}</td>
                <td className={`px-3 py-2 text-right tabular-nums font-semibold ${adjColor(r.adjustment)}`}>
                  {adjStr(r.adjustment)}
                </td>
                <td className="px-3 py-2 text-right tabular-nums font-semibold text-gray-900">{formatKRW(r.afterAllocation)}</td>
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

// ── 날짜 그룹 컴포넌트 ────────────────────────────────────────────
function DateGroup({ date, items }: { date: string; items: BudgetChangeHistory[] }) {
  const [subTab, setSubTab] = useState<HistorySubTab>('category');

  const { categorySnapshot, detailSnapshot } = parseSnapshot(items[0]?.snapshot ?? null);

  const tabs: { key: HistorySubTab; label: string }[] = [
    { key: 'category',   label: '비목별' },
    { key: 'detail',     label: '세목별' },
    { key: 'integrated', label: '통합' },
  ];

  return (
    <div className="rounded-lg border border-gray-200 overflow-hidden">
      {/* 날짜 헤더 */}
      <div className="flex items-center justify-between bg-primary-bg px-4 py-2.5">
        <span className="font-semibold text-primary text-sm">{date} 변경</span>
        <div className="flex items-center gap-3">
          <span className="text-xs text-gray-500">{items.length}개 비목 변경</span>
          {items[0]?.pdf_drive_url && (
            <a
              href={items[0].pdf_drive_url}
              target="_blank"
              rel="noopener noreferrer"
              className="rounded bg-primary px-2 py-0.5 text-xs text-white hover:bg-primary-light"
            >
              확정서 보기
            </a>
          )}
        </div>
      </div>

      {/* 서브 탭 */}
      <div className="flex gap-0 border-b border-gray-200 bg-white px-4 pt-2">
        {tabs.map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setSubTab(key)}
            className={`px-3 py-1.5 text-xs font-medium transition-colors relative ${
              subTab === key
                ? 'text-primary after:absolute after:bottom-0 after:left-0 after:h-0.5 after:w-full after:bg-primary'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* 뷰 */}
      <div className="bg-white">
        {subTab === 'category'   && <CategoryView   rows={categorySnapshot} />}
        {subTab === 'detail'     && <DetailView     rows={detailSnapshot}   />}
        {subTab === 'integrated' && <IntegratedView rows={detailSnapshot}   />}
      </div>
    </div>
  );
}

// ── 메인 컴포넌트 ─────────────────────────────────────────────────
export function BudgetHistoryTable({ records }: Props) {
  if (records.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-gray-300 py-12 text-center text-sm text-gray-500">
        아직 예산변경 이력이 없습니다.
      </div>
    );
  }

  // 날짜별 그룹화
  const grouped = records.reduce<Record<string, BudgetChangeHistory[]>>((acc, r) => {
    const date = r.changed_at;
    if (!acc[date]) acc[date] = [];
    acc[date].push(r);
    return acc;
  }, {});

  return (
    <div className="space-y-4">
      {Object.entries(grouped).map(([date, items]) => (
        <DateGroup key={date} date={date} items={items} />
      ))}
    </div>
  );
}

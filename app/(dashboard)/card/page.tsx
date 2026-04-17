'use client';

import { useState } from 'react';
import { useSession } from 'next-auth/react';
import { Calendar, List, TableProperties, ChevronDown, ChevronUp } from 'lucide-react';
import {
  useCardManagement,
  useCreateCardEntry,
  useUpdateCardEntry,
  useDeleteCardEntry,
  buildMonthlyCategorySummary,
  getUsedCategories,
} from '@/hooks/useCardManagement';
import type { CardEntry } from '@/hooks/useCardManagement';
import { CardMonthlyCategoryTable } from '@/components/card/CardMonthlyCategoryTable';
import { CardManagementTable } from '@/components/card/CardManagementTable';
import { CardCalendar } from '@/components/card/CardCalendar';

type TabKey = 'list' | 'calendar';

export default function CardPage() {
  const { data: session } = useSession();
  const currentYear = new Date().getFullYear().toString();
  const year = currentYear;
  const [tab, setTab] = useState<TabKey>('list');
  const [summaryOpen, setSummaryOpen] = useState(true);

  const { data, isLoading, isError } = useCardManagement();
  const createEntry = useCreateCardEntry();
  const updateEntry = useUpdateCardEntry();
  const deleteEntry = useDeleteCardEntry();

  const userRole = (session?.user as { role?: string } | undefined)?.role;
  const userPermissions = (session?.user as { permissions?: string[] } | undefined)?.permissions ?? [];
  const canWrite = userRole === 'super_admin' || userRole === 'staff' || userPermissions.includes('card:write');

  const entries = data?.entries ?? [];
  const cardHolders = data?.cardHolders ?? {};
  const cardTypes = data?.cardTypes ?? [];

  const summaries = buildMonthlyCategorySummary(entries, year);
  const categories = getUsedCategories(entries.filter((e) => e.expenseDate.startsWith(year)));

  async function handleAdd(entry: Omit<CardEntry, 'rowIndex'>) {
    await createEntry.mutateAsync(entry);
  }

  async function handleUpdate(entry: CardEntry) {
    await updateEntry.mutateAsync(entry);
  }

  async function handleDelete(rowIndex: number) {
    await deleteEntry.mutateAsync(rowIndex);
  }

  return (
    <div className="space-y-6">
      {/* 헤더 */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">카드관리</h1>
        <p className="mt-1 text-sm text-gray-500">법인카드 집행내역을 관리합니다.</p>
      </div>

      {/* 탭 */}
      <div className="flex gap-1 rounded-lg border border-gray-200 bg-gray-50 p-1 w-fit">
        <button
          onClick={() => setTab('list')}
          className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
            tab === 'list' ? 'bg-white text-primary shadow-sm' : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          <List className="h-4 w-4" />
          집행내역
        </button>
        <button
          onClick={() => setTab('calendar')}
          className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
            tab === 'calendar' ? 'bg-white text-primary shadow-sm' : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          <Calendar className="h-4 w-4" />
          캘린더
        </button>
      </div>

      {/* 로딩 / 에러 */}
      {isLoading && (
        <div className="flex items-center justify-center py-16 text-gray-400">
          데이터를 불러오는 중...
        </div>
      )}
      {isError && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-600">
          데이터 로드에 실패했습니다. 페이지를 새로고침해 주세요.
        </div>
      )}

      {/* 본문 */}
      {!isLoading && !isError && (
        <>
          {tab === 'list' && (
            <div className="space-y-6">
              {/* 월별 비목별 집계 */}
              <div>
                <button
                  onClick={() => setSummaryOpen((v) => !v)}
                  className="mb-2 flex items-center rounded-lg px-1 py-0.5 hover:bg-gray-50"
                >
                  <div className="flex items-center gap-1.5">
                    <TableProperties className="h-4 w-4 text-gray-500" />
                    <span className="text-sm font-medium text-gray-700">월별 비목별 집계</span>
                    {summaryOpen
                      ? <ChevronUp className="h-4 w-4 text-gray-400" />
                      : <ChevronDown className="h-4 w-4 text-gray-400" />}
                  </div>
                </button>
                {summaryOpen && (
                  <CardMonthlyCategoryTable summaries={summaries} categories={categories} />
                )}
              </div>

              {/* 집행내역 테이블 */}
              <CardManagementTable
                entries={entries}
                cardHolders={cardHolders}
                cardTypes={cardTypes}
                canWrite={canWrite}
                year={year}
                onAdd={handleAdd}
                onUpdate={handleUpdate}
                onDelete={handleDelete}
              />
            </div>
          )}

          {tab === 'calendar' && (
            <CardCalendar
              entries={entries}
              canWrite={canWrite}
              cardHolders={cardHolders}
              cardTypes={cardTypes}
              onAdd={handleAdd}
            />
          )}
        </>
      )}
    </div>
  );
}

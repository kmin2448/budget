'use client';

import { useSession } from 'next-auth/react';
import { RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  useAdvanceFunds,
  useAddAdvanceFundItem,
  useUpdateAdvanceFundItem,
  useDeleteAdvanceFundItem,
} from '@/hooks/useAdvanceFunds';
import { AdvanceFundsSummaryCard } from '@/components/advance-funds/AdvanceFundsSummary';
import { AdvanceFundsTable } from '@/components/advance-funds/AdvanceFundsTable';
import { useQueryClient } from '@tanstack/react-query';

export default function AdvanceFundsPage() {
  const { data: session } = useSession();
  const qc = useQueryClient();

  const { data, isLoading, isError } = useAdvanceFunds();
  const addItem    = useAddAdvanceFundItem();
  const updateItem = useUpdateAdvanceFundItem();
  const deleteItem = useDeleteAdvanceFundItem();

  const userRole = (session?.user as { role?: string } | undefined)?.role;
  const userPermissions = (session?.user as { permissions?: string[] } | undefined)?.permissions ?? [];
  const canWrite = userRole === 'super_admin' || userPermissions.includes('advance:write');

  return (
    <div className="space-y-6">
      {/* 헤더 */}
      <div className="flex items-center justify-between">
        <div className="flex items-baseline gap-3">
          <h1 className="text-2xl font-bold text-gray-900">선지원금 현황</h1>
          <span className="text-sm text-gray-500">선지원금 수입·지출 내역을 관리합니다. 총수입, 총지출, 잔액은 Sheets에서 자동 계산됩니다.</span>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => qc.invalidateQueries({ queryKey: ['advance-funds'] })}
          disabled={isLoading}
        >
          <RefreshCw className={`mr-1.5 h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
          새로고침
        </Button>
      </div>

      {isLoading && (
        <div className="flex items-center justify-center py-16 text-gray-400">
          데이터를 불러오는 중...
        </div>
      )}

      {isError && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-600">
          데이터 로드에 실패했습니다. Google Sheets 연결 상태를 확인하고 새로고침해 주세요.
        </div>
      )}

      {data && !isLoading && (
        <>
          <AdvanceFundsSummaryCard summary={data.summary} />

          <div>
            <h2 className="mb-3 text-base font-semibold text-gray-800">수입 · 지출 내역</h2>
            <AdvanceFundsTable
              incomeItems={data.incomeItems}
              expenseItems={data.expenseItems}
              canWrite={canWrite}
              onAdd={(type, label, amount) => addItem.mutateAsync({ type, label, amount })}
              onUpdate={(type, rowIndex, label, amount) =>
                updateItem.mutateAsync({ type, rowIndex, label, amount })
              }
              onDelete={(type, rowIndex) => deleteItem.mutateAsync({ type, rowIndex })}
            />
          </div>
        </>
      )}
    </div>
  );
}

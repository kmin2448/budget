'use client';

import { useState } from 'react';
import { formatKRW } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/shared/ConfirmDialog';
import { Trash2, CheckCircle2, Circle } from 'lucide-react';
import type { CardExpenditure } from '@/types';

interface CardTableProps {
  items: CardExpenditure[];
  canWrite: boolean;
  onToggleErp: (id: string, current: boolean) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}

export function CardTable({ items, canWrite, onToggleErp, onDelete }: CardTableProps) {
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  async function handleDelete() {
    if (!deleteTarget) return;
    setDeleteLoading(true);
    try {
      await onDelete(deleteTarget);
    } finally {
      setDeleteLoading(false);
      setDeleteTarget(null);
    }
  }

  if (items.length === 0) {
    return (
      <div className="flex items-center justify-center py-16 text-gray-400">
        등록된 산단카드 집행내역이 없습니다.
      </div>
    );
  }

  return (
    <>
      <div className="overflow-x-auto rounded-lg border border-gray-200">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-200 bg-gray-50 text-left text-xs font-medium text-gray-500">
              <th className="px-4 py-2.5">지출일자</th>
              <th className="px-4 py-2.5">비목</th>
              <th className="px-4 py-2.5">거래처</th>
              <th className="px-4 py-2.5">건명</th>
              <th className="px-4 py-2.5 text-right">금액</th>
              <th className="px-4 py-2.5 text-center">ERP등록</th>
              {canWrite && <th className="px-4 py-2.5" />}
            </tr>
          </thead>
          <tbody>
            {items.map((item, i) => (
              <tr
                key={item.id}
                className={`border-b border-gray-100 transition-colors hover:bg-gray-50 ${
                  i % 2 === 0 ? 'bg-white' : 'bg-row-even'
                }`}
              >
                <td className="px-4 py-2.5 whitespace-nowrap text-gray-600">{item.expense_date}</td>
                <td className="px-4 py-2.5">
                  <span className="rounded-full bg-primary-bg px-2 py-0.5 text-xs font-medium text-primary">
                    {item.category}
                  </span>
                </td>
                <td className="px-4 py-2.5 text-gray-700">{item.merchant ?? '-'}</td>
                <td className="px-4 py-2.5 text-gray-700">{item.description ?? '-'}</td>
                <td className="px-4 py-2.5 text-right font-mono font-medium text-gray-900">
                  {formatKRW(item.amount)}
                </td>
                <td className="px-4 py-2.5 text-center">
                  {canWrite ? (
                    <button
                      onClick={() => onToggleErp(item.id, item.erp_registered)}
                      className="inline-flex items-center justify-center transition-colors"
                      title={item.erp_registered ? 'ERP 등록 해제' : 'ERP 등록'}
                    >
                      {item.erp_registered ? (
                        <CheckCircle2 className="h-4 w-4 text-complete" />
                      ) : (
                        <Circle className="h-4 w-4 text-gray-300" />
                      )}
                    </button>
                  ) : (
                    item.erp_registered ? (
                      <CheckCircle2 className="mx-auto h-4 w-4 text-complete" />
                    ) : (
                      <Circle className="mx-auto h-4 w-4 text-gray-300" />
                    )
                  )}
                </td>
                {canWrite && (
                  <td className="px-4 py-2.5">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setDeleteTarget(item.id)}
                      className="h-7 w-7 p-0 text-gray-400 hover:text-red-500"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-gray-200 bg-gray-50 font-medium">
              <td colSpan={4} className="px-4 py-2.5 text-sm text-gray-600">합계</td>
              <td className="px-4 py-2.5 text-right font-mono text-gray-900">
                {formatKRW(items.reduce((s, i) => s + i.amount, 0))}
              </td>
              <td colSpan={canWrite ? 2 : 1} />
            </tr>
          </tfoot>
        </table>
      </div>

      <ConfirmDialog
        open={!!deleteTarget}
        title="집행내역 삭제"
        description="이 산단카드 집행내역을 삭제합니다. 복구할 수 없습니다."
        confirmLabel="삭제"
        loading={deleteLoading}
        onConfirm={handleDelete}
        onClose={() => setDeleteTarget(null)}
      />
    </>
  );
}

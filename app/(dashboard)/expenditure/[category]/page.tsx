// app/(dashboard)/expenditure/[category]/page.tsx
'use client';

import { useState, useRef, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { useBudgetType } from '@/contexts/BudgetTypeContext';
import { Button } from '@/components/ui/button';
import { RefreshCw } from 'lucide-react';
import { CategoryTabs } from '@/components/expenditure/CategoryTabs';
import { ExpenditureSummary } from '@/components/expenditure/ExpenditureSummary';
import { ExpenditureTable } from '@/components/expenditure/ExpenditureTable';
import { ExpenditureRowForm } from '@/components/expenditure/ExpenditureRowForm';
import { InvoiceBatchUploader } from '@/components/expenditure/InvoiceBatchUploader';
import { ConfirmDialog } from '@/components/shared/ConfirmDialog';
import {
  useExpenditure,
  useAddExpenditureRow,
  useUpdateExpenditureRow,
  useDeleteExpenditureRow,
  useUploadPdf,
  useDeleteFile,
  type RowPayload,
} from '@/hooks/useExpenditure';
import type { ExpenditureDetailRow } from '@/types';

export default function ExpenditurePage({
  params,
}: {
  params: { category: string };
}) {
  const category = decodeURIComponent(params.category);
  const searchParams = useSearchParams();
  const highlightRowIndex = searchParams.get('rowIndex') ? Number(searchParams.get('rowIndex')) : undefined;
  const { data: session } = useSession();
  const { data, isLoading, isError, error, refetch } = useExpenditure(category);
  const { budgetType, setBudgetType } = useBudgetType();
  const isCarryover = budgetType === 'carryover';

  // URL ?sheetType= 파라미터가 있으면 해당 예산구분으로 탭 강제 설정 (WE-Meet 바로가기 등)
  useEffect(() => {
    const typeFromUrl = searchParams.get('sheetType');
    if (typeFromUrl === 'main' || typeFromUrl === 'carryover') {
      setBudgetType(typeFromUrl);
    }
  // 마운트 시 1회만 실행
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const addMutation    = useAddExpenditureRow(category);
  const updateMutation = useUpdateExpenditureRow(category);
  const deleteMutation = useDeleteExpenditureRow(category);
  const uploadMutation    = useUploadPdf(category);
  const deleteFileMutation = useDeleteFile(category);

  // 폼 상태
  const [formOpen, setFormOpen]   = useState(false);
  const [formMode, setFormMode]   = useState<'add' | 'edit'>('add');
  const [editTarget, setEditTarget] = useState<ExpenditureDetailRow | undefined>();

  // 삭제 확인 상태
  const [deleteOpen, setDeleteOpen]     = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<ExpenditureDetailRow | undefined>();

  // 파일 업로드/삭제 상태
  const fileInputRef                      = useRef<HTMLInputElement>(null);
  const [uploadTarget, setUploadTarget]   = useState<ExpenditureDetailRow | undefined>();
  const [uploadError, setUploadError]     = useState<string | null>(null);
  const [storageWarning, setStorageWarning] = useState<{ usagePercent: number } | null>(null);
  const [deleteFileTarget, setDeleteFileTarget] = useState<ExpenditureDetailRow | undefined>();
  const [deleteFileOpen, setDeleteFileOpen]     = useState(false);

  // 권한
  const userRole = (session?.user as { role?: string } | undefined)?.role;
  const userPermissions = (session?.user as { permissions?: string[] } | undefined)?.permissions ?? [];
  const canWrite = userRole === 'super_admin' || userRole === 'staff' || userPermissions.includes('expenditure:write');

  // ── 핸들러 ──────────────────────────────────────────────────────

  function handleAdd() {
    setFormMode('add');
    setEditTarget(undefined);
    setFormOpen(true);
  }

  function handleEdit(row: ExpenditureDetailRow) {
    setFormMode('edit');
    setEditTarget(row);
    setFormOpen(true);
  }

  function handleDeleteClick(row: ExpenditureDetailRow) {
    setDeleteTarget(row);
    setDeleteOpen(true);
  }

  function handleDeleteFileClick(row: ExpenditureDetailRow) {
    setDeleteFileTarget(row);
    setDeleteFileOpen(true);
  }

  async function handleDeleteFileConfirm() {
    if (!deleteFileTarget) return;
    try {
      await deleteFileMutation.mutateAsync(deleteFileTarget.rowIndex);
      setDeleteFileOpen(false);
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : '파일 삭제 실패');
      setDeleteFileOpen(false);
    } finally {
      setDeleteFileTarget(undefined);
    }
  }

  function handleUploadClick(row: ExpenditureDetailRow) {
    setUploadError(null);
    setUploadTarget(row);
    fileInputRef.current?.click();
  }

  async function handleFileSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !uploadTarget) return;
    try {
      const result = await uploadMutation.mutateAsync({ file, row: uploadTarget });
      if (result.storageWarning) {
        setStorageWarning({ usagePercent: result.usagePercent });
      }
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : '업로드 실패');
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = '';
      setUploadTarget(undefined);
    }
  }

  async function handleFormSubmit(payload: RowPayload) {
    if (formMode === 'add') {
      await addMutation.mutateAsync(payload);
    } else if (editTarget) {
      await updateMutation.mutateAsync({ ...payload, rowIndex: editTarget.rowIndex });
    }
  }

  async function handleInlineUpdate(
    row: ExpenditureDetailRow,
    changes: { programName?: string; description?: string; expenseDate?: string; monthlyAmounts?: number[] },
  ) {
    await updateMutation.mutateAsync({
      rowIndex: row.rowIndex,
      programName: changes.programName ?? row.programName,
      description: changes.description ?? row.description,
      expenseDate: changes.expenseDate ?? row.expenseDate,
      monthlyAmounts: changes.monthlyAmounts ?? row.monthlyAmounts,
    });
  }

  async function handleMoveMonth(
    row: ExpenditureDetailRow,
    sourceMonthIdx: number,
    targetMonthIdx: number,
  ) {
    const newMonthlyAmounts = [...row.monthlyAmounts];
    const amount = newMonthlyAmounts[sourceMonthIdx];
    newMonthlyAmounts[sourceMonthIdx] = 0;
    newMonthlyAmounts[targetMonthIdx] += amount;
    await updateMutation.mutateAsync({
      rowIndex: row.rowIndex,
      programName: row.programName,
      expenseDate: row.expenseDate,
      description: row.description,
      monthlyAmounts: newMonthlyAmounts,
    });
  }

  async function handleDeleteConfirm() {
    if (!deleteTarget) return;
    try {
      await deleteMutation.mutateAsync(deleteTarget.rowIndex);
      setDeleteOpen(false);
    } catch (err) {
      alert(err instanceof Error ? err.message : '삭제 중 오류가 발생했습니다.');
    }
  }

  // ── 렌더 ────────────────────────────────────────────────────────

  return (
    <div className="space-y-5">
      {/* 페이지 헤더 */}
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-baseline gap-2">
            <h1 className="text-2xl font-semibold text-[#131310] tracking-tight">비목별 집행내역</h1>
            {isCarryover && (
              <span className="inline-flex items-center rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-medium text-amber-700">
                이월예산
              </span>
            )}
            <span className="text-sm text-gray-400">비목을 선택하여 집행내역을 조회하고 입력합니다.</span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => refetch()}
            disabled={isLoading}
            className="gap-1.5 text-gray-600"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${isLoading ? 'animate-spin' : ''}`} />
            새로고침
          </Button>
        </div>
      </div>

      {/* 비목 탭 + 정삼각형 + 예산 요약 묶음 — gap-0으로 꼭지점이 탭 바로 아래에 붙음 */}
      <div className="flex flex-col gap-0">
        <CategoryTabs activeCategory={category} />

        {/* 에러 */}
        {isError && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error instanceof Error ? error.message : '데이터를 불러오지 못했습니다.'}
          </div>
        )}

        {uploadError && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            업로드 오류: {uploadError}
          </div>
        )}

        {storageWarning && (
          <div className="flex items-start justify-between rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            <span>
              ⚠ 파일 저장 용량이 <strong>{storageWarning.usagePercent}%</strong> 사용 중입니다.
              용량 초과 전에 불필요한 파일을 정리하거나 Supabase 플랜 업그레이드를 검토해 주세요.
            </span>
            <button
              onClick={() => setStorageWarning(null)}
              className="ml-4 shrink-0 text-amber-600 hover:text-amber-800"
            >
              ✕
            </button>
          </div>
        )}

        {/* 역삼각형 + 예산 요약 (탭 바로 아래 붙임) */}
        {isLoading ? (
          <div className="h-[52px] animate-pulse rounded-md bg-[#F3F3EE]" />
        ) : (
          data && (
            <ExpenditureSummary
              budgetInfo={data.budgetInfo}
              activeCategory={category}
            />
          )
        )}
      </div>

      {/* 다중 청구서 일괄 업로더 */}
      {canWrite && <InvoiceBatchUploader currentCategory={category} onUploadComplete={() => refetch()} />}

      {/* 집행내역 테이블 */}
      {isLoading ? (
        <div className="h-64 animate-pulse rounded-lg bg-[#F3F3EE]" />
      ) : (
        <ExpenditureTable
          rows={data?.rows ?? []}
          canWrite={canWrite}
          category={category}
          onAdd={handleAdd}
          onEdit={handleEdit}
          onDelete={handleDeleteClick}
          onUpload={handleUploadClick}
          onDeleteFile={handleDeleteFileClick}
          onMoveMonth={handleMoveMonth}
          onUpdate={handleInlineUpdate}
          highlightRowIndex={highlightRowIndex}
        />
      )}

      {/* 숨겨진 파일 input */}
      <input
        ref={fileInputRef}
        type="file"
        accept="application/pdf"
        className="hidden"
        onChange={handleFileSelected}
      />

      {/* 추가/수정 모달 */}
      <ExpenditureRowForm
        open={formOpen}
        mode={formMode}
        category={category}
        initialData={editTarget}
        dropdownOptions={data?.dropdownOptions ?? []}
        onClose={() => setFormOpen(false)}
        onSubmit={handleFormSubmit}
      />

      {/* 집행내역 삭제 확인 */}
      <ConfirmDialog
        open={deleteOpen}
        title="집행내역 삭제"
        description={`"${deleteTarget?.description || '해당 집행내역'}"을 삭제하시겠습니까? Sheets의 해당 행이 초기화됩니다.`}
        loading={deleteMutation.isPending}
        onConfirm={handleDeleteConfirm}
        onClose={() => setDeleteOpen(false)}
      />

      {/* 파일 삭제 확인 */}
      <ConfirmDialog
        open={deleteFileOpen}
        title="지출부 파일 삭제"
        description={`"${deleteFileTarget?.description || '해당 행'}"의 지출부 파일을 삭제하시겠습니까? Google Drive에서도 삭제됩니다.`}
        loading={deleteFileMutation.isPending}
        onConfirm={handleDeleteFileConfirm}
        onClose={() => setDeleteFileOpen(false)}
      />
    </div>
  );
}

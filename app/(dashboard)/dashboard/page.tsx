'use client';

import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useDashboard, type ProgramRow } from '@/hooks/useDashboard';
import { SummaryCards } from '@/components/dashboard/SummaryCards';
import { ProgramTable } from '@/components/dashboard/ProgramTable';
import { ProgramModal } from '@/components/dashboard/ProgramModal';
import { ConfirmDialog } from '@/components/shared/ConfirmDialog';
import { Button } from '@/components/ui/button';
import { Plus, RefreshCw, Pencil } from 'lucide-react';
import { useSession } from 'next-auth/react';

export default function DashboardPage() {
  const { data, isLoading, isError, error, refetch } = useDashboard();
  const { data: session } = useSession();
  const queryClient = useQueryClient();

  const [modalOpen, setModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState<'add' | 'edit'>('add');
  const [editTarget, setEditTarget] = useState<ProgramRow | undefined>(undefined);

  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<ProgramRow | undefined>(undefined);
  const [deleteLoading, setDeleteLoading] = useState(false);

  // 인라인 편집 모드
  const [editMode, setEditMode] = useState(false);
  const [changes, setChanges] = useState<Record<number, Partial<ProgramRow>>>({});
  const [isSaving, setIsSaving] = useState(false);

  // 권한 체크
  const userRole = (session?.user as { role?: string } | undefined)?.role;
  const userPermissions = (session?.user as { permissions?: string[] } | undefined)?.permissions ?? [];
  const canWrite = userRole === 'super_admin' || userPermissions.includes('dashboard:write');
  const isLoggedIn = !!session;

  function handleCellChange(rowIndex: number, field: keyof ProgramRow, value: string | number) {
    setChanges((prev) => ({
      ...prev,
      [rowIndex]: { ...prev[rowIndex], [field]: value },
    }));
  }

  async function handleAutoSave(rowIndex: number, field: keyof ProgramRow, value: string | number) {
    try {
      const res = await fetch('/api/sheets/program', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ updates: [{ rowIndex, field, value }] }),
      });
      if (!res.ok) throw new Error('자동 저장 실패');
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
    } catch (err) {
      console.error(err);
      // Fail silently without disrupting user flow
    }
  }

  function handleCancelEdit() {
    setChanges({});
    setEditMode(false);
  }

  async function handleSave() {
    const updates: { rowIndex: number; field: string; value: string | number }[] = [];
    for (const [rowIndexStr, fieldChanges] of Object.entries(changes)) {
      const rowIndex = Number(rowIndexStr);
      for (const [field, value] of Object.entries(fieldChanges)) {
        updates.push({ rowIndex, field, value: value as string | number });
      }
    }

    if (updates.length === 0) {
      setEditMode(false);
      return;
    }

    setIsSaving(true);
    try {
      const res = await fetch('/api/sheets/program', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ updates }),
      });
      if (!res.ok) {
        const body = await res.json() as { error?: string };
        throw new Error(body.error ?? '저장 실패');
      }
      await queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      setChanges({});
      setEditMode(false);
    } catch (err) {
      alert(err instanceof Error ? err.message : '저장 중 오류가 발생했습니다.');
    } finally {
      setIsSaving(false);
    }
  }

  function handleAdd() {
    setModalMode('add');
    setEditTarget(undefined);
    setModalOpen(true);
  }

  function handleEdit(row: ProgramRow) {
    setModalMode('edit');
    setEditTarget(row);
    setModalOpen(true);
  }

  function handleDeleteClick(row: ProgramRow) {
    setDeleteTarget(row);
    setDeleteOpen(true);
  }

  async function handleDeleteConfirm() {
    if (!deleteTarget) return;
    setDeleteLoading(true);
    try {
      const res = await fetch('/api/sheets/program', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rowIndex: deleteTarget.rowIndex }),
      });
      if (!res.ok) {
        const body = await res.json() as { error?: string };
        throw new Error(body.error ?? '삭제 실패');
      }
      await queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      setDeleteOpen(false);
    } catch (err) {
      alert(err instanceof Error ? err.message : '삭제 중 오류가 발생했습니다.');
    } finally {
      setDeleteLoading(false);
    }
  }

  const changedRowCount = Object.keys(changes).length;

  return (
    <div className="space-y-6">
      {/* 헤더 */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">대시보드</h1>
        <p className="mt-1 text-sm text-gray-500">KNU SDU COSS 2026년 본예산 집행 현황</p>
      </div>

      {/* 편집 모드 안내 배너 */}
      {editMode && (
        <div className="flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-2.5 text-sm">
          <span className="font-semibold text-amber-700">편집 모드</span>
          <span className="text-amber-600">셀을 더블클릭하면 수정할 수 있습니다. 수정 완료 버튼을 눌러야 시트에 반영됩니다.</span>
        </div>
      )}

      {/* 에러 상태 */}
      {isError && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error instanceof Error ? error.message : '데이터를 불러오지 못했습니다.'}
        </div>
      )}

      {/* 예산 요약 카드 */}
      {isLoading ? (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-32 animate-pulse rounded-lg bg-gray-100" />
          ))}
        </div>
      ) : data ? (
        <SummaryCards summary={data.summary} />
      ) : null}

      {/* 프로그램별 테이블 */}
      <div>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-800">프로그램별 집행 현황</h2>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => refetch()}
              disabled={isLoading || editMode}
              className="gap-1.5 text-gray-600"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${isLoading ? 'animate-spin' : ''}`} />
              새로고침
            </Button>

            {isLoggedIn && (
              editMode ? (
                <>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleCancelEdit}
                    disabled={isSaving}
                    className="text-gray-600"
                  >
                    취소
                  </Button>
                  <Button
                    size="sm"
                    onClick={handleSave}
                    disabled={isSaving}
                    className="bg-amber-500 text-white hover:bg-amber-600"
                  >
                    {isSaving
                      ? '저장 중...'
                      : changedRowCount > 0
                        ? `수정 완료 (${changedRowCount}행)`
                        : '수정 완료'}
                  </Button>
                </>
              ) : (
                <>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setEditMode(true)}
                    className="gap-1.5 text-gray-600"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                    편집 모드
                  </Button>
                  <Button
                    size="sm"
                    onClick={handleAdd}
                    className="gap-1.5 bg-primary text-white hover:bg-primary-light"
                  >
                    <Plus className="h-4 w-4" />
                    프로그램 추가
                  </Button>
                </>
              )
            )}
          </div>
        </div>
        {isLoading ? (
          <div className="h-64 animate-pulse rounded-lg bg-gray-100" />
        ) : data ? (
          <ProgramTable
            rows={data.programRows}
            onEdit={handleEdit}
            onDelete={handleDeleteClick}
            canWrite={canWrite}
            isLoggedIn={isLoggedIn}
            editMode={editMode}
            changes={changes}
            onCellChange={handleCellChange}
            onAutoSave={handleAutoSave}
          />
        ) : null}
      </div>

      {/* 추가/수정 모달 */}
      <ProgramModal
        open={modalOpen}
        mode={modalMode}
        initialData={editTarget}
        onClose={() => setModalOpen(false)}
        existingCategories={data?.programRows.map((r) => r.category).filter(Boolean) ?? []}
        rows={data?.programRows ?? []}
      />

      {/* 삭제 확인 다이얼로그 */}
      <ConfirmDialog
        open={deleteOpen}
        title="프로그램 삭제"
        description={`"${deleteTarget?.programName || deleteTarget?.divisionCode || '해당 프로그램'}"을 삭제하시겠습니까? 이 작업은 Sheets의 해당 행을 초기화합니다.`}
        loading={deleteLoading}
        onConfirm={handleDeleteConfirm}
        onClose={() => setDeleteOpen(false)}
      />
    </div>
  );
}

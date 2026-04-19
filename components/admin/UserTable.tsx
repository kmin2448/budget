'use client';

import { useState, useRef } from 'react';
import * as XLSX from 'xlsx';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/shared/ConfirmDialog';
import { Trash2, UserPlus, X, Download, Upload, CheckCircle, AlertCircle } from 'lucide-react';
import type { UserRole } from '@/types';
import { PERMISSIONS } from '@/types';
import type { AdminUser } from '@/hooks/useAdmin';

const ROLE_LABELS: Record<UserRole, string> = {
  super_admin: '슈퍼어드민',
  admin: '어드민',
  viewer: '뷰어',
};

const ROLE_COLORS: Record<UserRole, string> = {
  super_admin: 'bg-red-100 text-red-700',
  admin: 'bg-primary-bg text-primary',
  viewer: 'bg-gray-100 text-gray-600',
};

const PERM_LABELS: Record<string, string> = {
  [PERMISSIONS.DASHBOARD_WRITE]:   '대시보드 편집',
  [PERMISSIONS.EXPENDITURE_WRITE]: '집행내역 편집',
  [PERMISSIONS.BUDGET_WRITE]:      '예산관리 편집',
  [PERMISSIONS.ADVANCE_WRITE]:     '선지원금 편집',
  [PERMISSIONS.CARD_WRITE]:        '산단카드 편집',
};

const inputCls =
  'rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary/30';

interface UserTableProps {
  users: AdminUser[];
  currentUserEmail: string;
  onAddUser: (payload: { email: string; name?: string; role?: UserRole }) => Promise<void>;
  onUpdateRole: (id: string, role: UserRole) => Promise<void>;
  onGrantPermission: (user_id: string, permission: string) => Promise<void>;
  onRevokePermission: (user_id: string, permission: string) => Promise<void>;
  onDeleteUser: (id: string) => Promise<void>;
}

export function UserTable({
  users,
  currentUserEmail,
  onAddUser,
  onUpdateRole,
  onGrantPermission,
  onRevokePermission,
  onDeleteUser,
}: UserTableProps) {
  const [deleteTarget, setDeleteTarget] = useState<AdminUser | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [roleLoading, setRoleLoading] = useState<string | null>(null);
  const [permLoading, setPermLoading] = useState<string | null>(null);

  // 엑셀 업로드 상태
  const excelInputRef = useRef<HTMLInputElement>(null);
  const [importLoading, setImportLoading] = useState(false);
  const [importResult, setImportResult] = useState<{ added: number; skipped: number; errors: string[] } | null>(null);

  // 사용자 추가 폼 상태
  const [showAddForm, setShowAddForm] = useState(false);
  const [addEmail, setAddEmail] = useState('');
  const [addName, setAddName] = useState('');
  const [addRole, setAddRole] = useState<UserRole>('viewer');
  const [addLoading, setAddLoading] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);

  async function handleAddSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!addEmail.trim()) { setAddError('이메일을 입력해주세요.'); return; }
    setAddLoading(true);
    setAddError(null);
    try {
      await onAddUser({ email: addEmail.trim(), name: addName.trim() || undefined, role: addRole });
      setAddEmail('');
      setAddName('');
      setAddRole('viewer');
      setShowAddForm(false);
    } catch (err) {
      setAddError(err instanceof Error ? err.message : '추가 실패');
    } finally {
      setAddLoading(false);
    }
  }

  function cancelAdd() {
    setShowAddForm(false);
    setAddEmail('');
    setAddName('');
    setAddRole('viewer');
    setAddError(null);
  }

  async function handleRoleChange(user: AdminUser, role: UserRole) {
    setRoleLoading(user.id);
    try { await onUpdateRole(user.id, role); }
    finally { setRoleLoading(null); }
  }

  async function handlePermToggle(user: AdminUser, permission: string) {
    const key = `${user.id}-${permission}`;
    setPermLoading(key);
    try {
      if (user.permissions.includes(permission)) {
        await onRevokePermission(user.id, permission);
      } else {
        await onGrantPermission(user.id, permission);
      }
    } finally {
      setPermLoading(null); }
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    setDeleteLoading(true);
    try { await onDeleteUser(deleteTarget.id); }
    finally { setDeleteLoading(false); setDeleteTarget(null); }
  }

  // ── 엑셀 다운로드 ────────────────────────────────────────────────
  function handleDownloadTemplate() {
    const header = ['이메일 *필수', '이름 (선택)', '역할 (뷰어/어드민/슈퍼어드민)'];
    const rows = users.map((u) => [u.email, u.name ?? '', ROLE_LABELS[u.role]]);
    const ws = XLSX.utils.aoa_to_sheet([header, ...rows]);
    ws['!cols'] = [{ wch: 32 }, { wch: 16 }, { wch: 20 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, '사용자목록');
    XLSX.writeFile(wb, 'COSS_사용자목록.xlsx');
  }

  // ── 엑셀 업로드 ─────────────────────────────────────────────────
  const ROLE_MAP: Record<string, UserRole> = {
    '뷰어': 'viewer', '어드민': 'admin', '슈퍼어드민': 'super_admin',
    viewer: 'viewer', admin: 'admin', super_admin: 'super_admin',
  };

  async function handleExcelUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (e.target) e.target.value = '';

    setImportLoading(true);
    setImportResult(null);

    try {
      const buffer = await file.arrayBuffer();
      const wb = XLSX.read(buffer, { type: 'array' });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const rawRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws);

      const existingEmails = new Set(users.map((u) => u.email.toLowerCase()));
      let added = 0, skipped = 0;
      const errors: string[] = [];

      for (const row of rawRows) {
        const email = String(row['이메일 *필수'] ?? '').trim();
        if (!email) continue;
        if (existingEmails.has(email.toLowerCase())) { skipped++; continue; }

        const name = String(row['이름 (선택)'] ?? '').trim() || undefined;
        const roleStr = String(row['역할 (뷰어/어드민/슈퍼어드민)'] ?? '').trim();
        const role: UserRole = ROLE_MAP[roleStr] ?? 'viewer';

        try {
          await onAddUser({ email, name, role });
          existingEmails.add(email.toLowerCase());
          added++;
        } catch (err) {
          errors.push(`${email}: ${err instanceof Error ? err.message : '추가 실패'}`);
        }
      }

      setImportResult({ added, skipped, errors });
    } catch {
      setImportResult({ added: 0, skipped: 0, errors: ['파일을 읽을 수 없습니다. 올바른 Excel 파일인지 확인하세요.'] });
    } finally {
      setImportLoading(false);
    }
  }

  return (
    <div className="space-y-4">
      {/* 숨김 파일 input */}
      <input
        ref={excelInputRef}
        type="file"
        accept=".xlsx,.xls"
        className="hidden"
        onChange={handleExcelUpload}
      />

      {/* 엑셀 가져오기 결과 */}
      {importResult && (
        <div className={`rounded-lg border p-3 text-sm ${importResult.errors.length > 0 ? 'border-amber-200 bg-amber-50' : 'border-green-200 bg-green-50'}`}>
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-2">
              {importResult.errors.length === 0
                ? <CheckCircle className="h-4 w-4 text-green-600 shrink-0" />
                : <AlertCircle className="h-4 w-4 text-amber-600 shrink-0" />}
              <span className="font-medium text-gray-800">
                추가 {importResult.added}명 완료
                {importResult.skipped > 0 && ` · 중복 스킵 ${importResult.skipped}명`}
                {importResult.errors.length > 0 && ` · 오류 ${importResult.errors.length}건`}
              </span>
            </div>
            <button onClick={() => setImportResult(null)} className="text-gray-400 hover:text-gray-600">
              <X className="h-4 w-4" />
            </button>
          </div>
          {importResult.errors.length > 0 && (
            <ul className="mt-2 space-y-0.5 pl-6 text-xs text-amber-700">
              {importResult.errors.map((e, i) => <li key={i}>{e}</li>)}
            </ul>
          )}
        </div>
      )}

      {/* 사용자 추가 버튼 / 폼 */}
      {!showAddForm ? (
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={handleDownloadTemplate}
              className="gap-1.5 text-gray-600"
            >
              <Download className="h-3.5 w-3.5" />
              양식 다운로드
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={importLoading}
              onClick={() => excelInputRef.current?.click()}
              className="gap-1.5 text-gray-600"
            >
              <Upload className="h-3.5 w-3.5" />
              {importLoading ? '처리 중...' : '엑셀로 일괄 추가'}
            </Button>
          </div>
          <Button
            size="sm"
            onClick={() => setShowAddForm(true)}
            className="gap-1.5 bg-primary text-white hover:bg-primary-light"
          >
            <UserPlus className="h-4 w-4" />
            사용자 추가
          </Button>
        </div>
      ) : (
        <form
          onSubmit={handleAddSubmit}
          className="rounded-lg border border-primary/30 bg-primary-bg/20 p-4 space-y-3"
        >
          <div className="flex items-center justify-between mb-1">
            <p className="text-sm font-semibold text-gray-700">새 사용자 추가</p>
            <button type="button" onClick={cancelAdd} className="text-gray-400 hover:text-gray-600">
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div className="sm:col-span-1">
              <label className="mb-1 block text-xs text-gray-500">
                이메일 <span className="text-red-500">*</span>
              </label>
              <input
                type="email"
                value={addEmail}
                onChange={(e) => { setAddEmail(e.target.value); setAddError(null); }}
                placeholder="example@email.com"
                autoFocus
                className={`${inputCls} w-full`}
              />
            </div>
            <div>
              <label className="mb-1 block text-xs text-gray-500">이름 (선택)</label>
              <input
                type="text"
                value={addName}
                onChange={(e) => setAddName(e.target.value)}
                placeholder="홍길동"
                className={`${inputCls} w-full`}
              />
            </div>
            <div>
              <label className="mb-1 block text-xs text-gray-500">역할</label>
              <select
                value={addRole}
                onChange={(e) => setAddRole(e.target.value as UserRole)}
                className={`${inputCls} w-full`}
              >
                {(Object.entries(ROLE_LABELS) as [UserRole, string][]).map(([role, label]) => (
                  <option key={role} value={role}>{label}</option>
                ))}
              </select>
            </div>
          </div>

          {addError && (
            <p className="text-xs text-red-500">{addError}</p>
          )}

          <div className="flex justify-end gap-2 pt-1">
            <Button type="button" variant="outline" size="sm" onClick={cancelAdd} disabled={addLoading}>
              취소
            </Button>
            <Button
              type="submit"
              size="sm"
              disabled={addLoading}
              className="bg-primary text-white hover:bg-primary-light"
            >
              {addLoading ? '추가 중...' : '추가'}
            </Button>
          </div>
        </form>
      )}

      {/* 사용자 테이블 */}
      {users.length === 0 ? (
        <div className="flex items-center justify-center py-16 text-gray-400 text-sm">
          등록된 사용자가 없습니다.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-gray-200">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50 text-left text-xs font-medium text-gray-500">
                <th className="px-4 py-2.5">이름</th>
                <th className="px-4 py-2.5">이메일</th>
                <th className="px-4 py-2.5">역할</th>
                <th className="px-4 py-2.5">세부 권한 (어드민 전용)</th>
                <th className="px-4 py-2.5">가입일</th>
                <th className="px-4 py-2.5 w-10" />
              </tr>
            </thead>
            <tbody>
              {users.map((user, i) => {
                const isSelf = user.email === currentUserEmail;
                const isAdmin = user.role === 'admin';
                return (
                  <tr
                    key={user.id}
                    className={`border-b border-gray-100 transition-colors hover:bg-gray-50 ${
                      i % 2 === 0 ? 'bg-white' : 'bg-row-even'
                    }`}
                  >
                    {/* 이름 */}
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        {isSelf && (
                          <span className="rounded-full bg-gray-100 px-1.5 py-0.5 text-xs text-gray-500">나</span>
                        )}
                        <span className="font-medium text-gray-900">{user.name ?? '-'}</span>
                      </div>
                    </td>

                    {/* 이메일 */}
                    <td className="px-4 py-3 text-gray-600">{user.email}</td>

                    {/* 역할 선택 */}
                    <td className="px-4 py-3">
                      {isSelf ? (
                        <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${ROLE_COLORS[user.role]}`}>
                          {ROLE_LABELS[user.role]}
                        </span>
                      ) : (
                        <select
                          value={user.role}
                          onChange={(e) => handleRoleChange(user, e.target.value as UserRole)}
                          disabled={roleLoading === user.id}
                          className={`${inputCls} h-7 py-0.5 text-xs`}
                        >
                          {(Object.entries(ROLE_LABELS) as [UserRole, string][]).map(([role, label]) => (
                            <option key={role} value={role}>{label}</option>
                          ))}
                        </select>
                      )}
                    </td>

                    {/* 세부 권한 체크박스 */}
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-3">
                        {Object.entries(PERM_LABELS).map(([perm, label]) => {
                          const key = `${user.id}-${perm}`;
                          const checked = user.permissions.includes(perm);
                          const loading = permLoading === key;
                          return (
                            <label
                              key={perm}
                              className={`flex cursor-pointer items-center gap-1.5 ${
                                !isAdmin ? 'opacity-40 cursor-not-allowed' : ''
                              }`}
                            >
                              <input
                                type="checkbox"
                                checked={checked}
                                onChange={() => handlePermToggle(user, perm)}
                                disabled={!isAdmin || loading || isSelf}
                                className="h-3.5 w-3.5 rounded border-gray-300 accent-primary"
                              />
                              <span className="text-xs text-gray-600">{label}</span>
                            </label>
                          );
                        })}
                      </div>
                    </td>

                    {/* 가입일 */}
                    <td className="px-4 py-3 text-xs text-gray-400">
                      {new Date(user.created_at).toLocaleDateString('ko-KR')}
                    </td>

                    {/* 삭제 */}
                    <td className="px-4 py-3">
                      {!isSelf && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setDeleteTarget(user)}
                          className="h-7 w-7 p-0 text-gray-400 hover:text-red-500"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <ConfirmDialog
        open={!!deleteTarget}
        title="사용자 삭제"
        description={`${deleteTarget?.name ?? deleteTarget?.email} 사용자를 삭제합니다. 모든 권한도 함께 삭제됩니다.`}
        confirmLabel="삭제"
        loading={deleteLoading}
        onConfirm={handleDelete}
        onClose={() => setDeleteTarget(null)}
      />
    </div>
  );
}

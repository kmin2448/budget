'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ConfirmDialog } from '@/components/shared/ConfirmDialog';
import { Trash2, UserPlus, X } from 'lucide-react';
import type { UserRole } from '@/types';
import { PERMISSIONS } from '@/types';
import type { AdminUser } from '@/hooks/useAdmin';

const ROLE_LABELS: Record<UserRole, string> = {
  super_admin: '슈퍼어드민',
  admin: '어드민',
  staff: '스태프',
  professor: '교수',
};

const ROLE_COLORS: Record<UserRole, string> = {
  super_admin: 'bg-red-100 text-red-700',
  admin: 'bg-primary-bg text-primary',
  staff: 'bg-green-100 text-green-700',
  professor: 'bg-yellow-100 text-yellow-700',
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

  // 사용자 추가 폼 상태
  const [showAddForm, setShowAddForm] = useState(false);
  const [addEmail, setAddEmail] = useState('');
  const [addName, setAddName] = useState('');
  const [addRole, setAddRole] = useState<UserRole>('staff');
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
      setAddRole('staff');
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
    setAddRole('staff');
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

  return (
    <div className="space-y-4">
      {/* 사용자 추가 버튼 / 폼 */}
      {!showAddForm ? (
        <div className="flex justify-end">
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
                        <Select
                          value={user.role}
                          onValueChange={(v) => handleRoleChange(user, v as UserRole)}
                          disabled={roleLoading === user.id}
                        >
                          <SelectTrigger className="h-7 w-32 text-xs">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {(Object.entries(ROLE_LABELS) as [UserRole, string][]).map(([role, label]) => (
                              <SelectItem key={role} value={role} className="text-xs">{label}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
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

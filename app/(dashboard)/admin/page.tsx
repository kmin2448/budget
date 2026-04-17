'use client';

import { useSession } from 'next-auth/react';
import { Shield } from 'lucide-react';
import {
  useAdminUsers,
  useAddUser,
  useUpdateUserRole,
  useDeleteUser,
  useGrantPermission,
  useRevokePermission,
} from '@/hooks/useAdmin';
import { UserTable } from '@/components/admin/UserTable';
import type { UserRole } from '@/types';

export default function AdminPage() {
  const { data: session } = useSession();
  const userRole = (session?.user as { role?: string } | undefined)?.role;

  const { data: users = [], isLoading, isError } = useAdminUsers();
  const addUser   = useAddUser();
  const updateRole = useUpdateUserRole();
  const deleteUser = useDeleteUser();
  const grantPerm = useGrantPermission();
  const revokePerm = useRevokePermission();

  if (userRole !== 'super_admin') {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center">
        <Shield className="mb-4 h-12 w-12 text-gray-300" />
        <h2 className="text-lg font-semibold text-gray-700">접근 권한 없음</h2>
        <p className="mt-2 text-sm text-gray-400">슈퍼어드민만 접근할 수 있습니다.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* 헤더 */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">권한 관리</h1>
        <p className="mt-1 text-sm text-gray-500">
          사용자 역할 및 세부 권한을 관리합니다. 역할을 어드민으로 설정한 후 세부 권한을 부여하세요.
        </p>
      </div>

      {/* 권한 체계 안내 */}
      <div className="rounded-lg border border-gray-200 bg-gray-50 p-4 text-sm">
        <p className="font-medium text-gray-700 mb-2">권한 체계 안내</p>
        <ul className="space-y-1 text-gray-600 text-xs">
          <li><span className="font-medium text-red-600">슈퍼어드민</span> — 모든 기능 + 권한 관리</li>
          <li><span className="font-medium text-primary">어드민</span> — 슈퍼어드민이 부여한 세부 권한 범위 내 작업 가능</li>
          <li><span className="font-medium text-green-600">스태프</span> — 기본 집행내역 입력 (집행내역 작성 권한 자동 부여)</li>
          <li><span className="font-medium text-yellow-600">교수</span> — 담당 프로그램 조회·일부 입력</li>
        </ul>
        <p className="mt-2 text-xs text-gray-500">
          세부 권한 (프로그램 작성 / 집행내역 작성 / 선지원금 관리)은 역할이 <strong>어드민</strong>인 경우에만 적용됩니다.
        </p>
      </div>

      {/* 로딩 / 에러 */}
      {isLoading && (
        <div className="flex items-center justify-center py-16 text-gray-400">
          사용자 목록을 불러오는 중...
        </div>
      )}
      {isError && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-600">
          데이터 로드에 실패했습니다. 페이지를 새로고침해 주세요.
        </div>
      )}

      {/* 사용자 테이블 */}
      {!isLoading && !isError && (
        <UserTable
          users={users}
          currentUserEmail={session?.user?.email ?? ''}
          onAddUser={(payload) => addUser.mutateAsync(payload)}
          onUpdateRole={(id, role) => updateRole.mutateAsync({ id, role: role as UserRole })}
          onGrantPermission={(user_id, permission) => grantPerm.mutateAsync({ user_id, permission })}
          onRevokePermission={(user_id, permission) => revokePerm.mutateAsync({ user_id, permission })}
          onDeleteUser={(id) => deleteUser.mutateAsync(id)}
        />
      )}
    </div>
  );
}

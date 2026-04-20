'use client';

import { useSession } from 'next-auth/react';
import { Shield } from 'lucide-react';
import { useState, useEffect } from 'react';
import {
  useAdminUsers,
  useAddUser,
  useUpdateUserRole,
  useDeleteUser,
  useGrantPermission,
  useRevokePermission,
} from '@/hooks/useAdmin';
import { UserTable } from '@/components/admin/UserTable';
import { Button } from '@/components/ui/button';
import type { UserRole } from '@/types';

function CarryoverSheetSettings() {
  const [sheetId, setSheetId] = useState('');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    fetch('/api/settings')
      .then((r) => r.json())
      .then((d: { carryoverSheetId?: string }) => setSheetId(d.carryoverSheetId ?? ''))
      .catch(() => {});
  }, []);

  async function handleSave() {
    setSaving(true);
    setMessage(null);
    try {
      const res = await fetch('/api/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ carryoverSheetId: sheetId }),
      });
      const body = await res.json() as { message?: string; error?: string };
      if (!res.ok) throw new Error(body.error ?? '저장 실패');
      setMessage({ type: 'success', text: body.message ?? '저장되었습니다.' });
    } catch (err) {
      setMessage({ type: 'error', text: err instanceof Error ? err.message : '저장 실패' });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-5 space-y-4">
      <div>
        <h2 className="text-base font-semibold text-gray-900">이월예산 설정</h2>
        <p className="mt-0.5 text-xs text-gray-500">
          이월예산 데이터가 있는 Google Spreadsheet ID를 입력하세요. 사이드바 토글로 본예산/이월예산을 전환할 수 있습니다.
        </p>
      </div>

      <div className="space-y-2">
        <label className="block text-sm font-medium text-gray-700">
          이월예산 Spreadsheet ID
        </label>
        <div className="flex gap-2">
          <input
            type="text"
            value={sheetId}
            onChange={(e) => setSheetId(e.target.value)}
            placeholder="예: 1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgVE2upms"
            className="flex-1 rounded-md border border-gray-300 bg-white px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary font-mono"
          />
          <Button
            onClick={handleSave}
            disabled={saving}
            className="bg-primary hover:bg-primary-light text-white shrink-0"
            size="sm"
          >
            {saving ? '저장 중...' : '저장'}
          </Button>
        </div>
        <p className="text-xs text-gray-400">
          Google Sheets URL에서 /d/ 뒤의 문자열입니다.
          예: https://docs.google.com/spreadsheets/d/<strong>여기가 ID</strong>/edit
        </p>
      </div>

      {message && (
        <div className={`rounded-md px-3 py-2 text-sm ${
          message.type === 'success'
            ? 'bg-green-50 text-green-700 border border-green-200'
            : 'bg-red-50 text-red-600 border border-red-200'
        }`}>
          {message.text}
          {message.type === 'error' && message.text.includes('app_settings') && (
            <details className="mt-2">
              <summary className="cursor-pointer text-xs font-medium">Supabase 테이블 생성 SQL 보기</summary>
              <pre className="mt-2 text-xs bg-gray-100 p-2 rounded overflow-auto">{`CREATE TABLE IF NOT EXISTS app_settings (
  key TEXT PRIMARY KEY,
  value TEXT,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);`}</pre>
            </details>
          )}
        </div>
      )}
    </div>
  );
}

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
          <li><span className="font-medium text-gray-600">뷰어</span> — 전체 조회 + 대시보드 추가 반영사항 작성만 가능</li>
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

      {/* 이월예산 설정 */}
      <CarryoverSheetSettings />
    </div>
  );
}

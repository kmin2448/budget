// lib/permissions.ts
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { PERMISSIONS } from '@/types';

// staff 역할의 기본 허용 권한 (DB 저장 없이 암묵적으로 허용)
const STAFF_DEFAULT_PERMISSIONS = [
  PERMISSIONS.EXPENDITURE_WRITE,
  PERMISSIONS.CARD_WRITE,
];

export async function checkPermission(email: string, permission: string): Promise<boolean> {
  const supabase = createServerSupabaseClient();
  const { data: user } = await supabase
    .from('users')
    .select('id, role')
    .eq('email', email)
    .single();
  if (!user) return false;
  if (user.role === 'super_admin') return true;
  if (user.role === 'staff') return STAFF_DEFAULT_PERMISSIONS.includes(permission as (typeof STAFF_DEFAULT_PERMISSIONS)[number]);
  if (user.role === 'admin') {
    const { data: perm } = await supabase
      .from('user_permissions')
      .select('permission')
      .eq('user_id', user.id)
      .eq('permission', permission)
      .single();
    return !!perm;
  }
  return false;
}

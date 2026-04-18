// lib/permissions.ts
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { PERMISSIONS } from '@/types';

export async function checkPermission(email: string, permission: string): Promise<boolean> {
  const supabase = createServerSupabaseClient();
  const { data: user } = await supabase
    .from('users')
    .select('id, role')
    .eq('email', email)
    .single();
  if (!user) return false;
  if (user.role === 'super_admin') return true;
  if (user.role === 'admin') {
    const { data: perm } = await supabase
      .from('user_permissions')
      .select('permission')
      .eq('user_id', user.id)
      .eq('permission', permission)
      .single();
    return !!perm;
  }
  // viewer: 모든 편집 권한 없음 (additionalReflection 작성은 API에서 별도 허용)
  return false;
}

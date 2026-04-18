// app/api/admin/permissions/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { PERMISSIONS } from '@/types';

const VALID_PERMISSIONS = Object.values(PERMISSIONS);

async function assertSuperAdmin(email: string) {
  const supabase = createServerSupabaseClient();
  const { data: user } = await supabase
    .from('users')
    .select('id, role')
    .eq('email', email)
    .single();
  if (user?.role !== 'super_admin') throw new Error('권한 없음');
  return user.id as string;
}

// 권한 부여
export async function POST(req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.email) {
      return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 });
    }
    const granterId = await assertSuperAdmin(session.user.email);

    const body = (await req.json()) as { user_id: string; permission: string };
    if (!VALID_PERMISSIONS.includes(body.permission as (typeof VALID_PERMISSIONS)[number])) {
      return NextResponse.json({ error: '유효하지 않은 권한입니다.' }, { status: 400 });
    }

    const supabase = createServerSupabaseClient();

    // 이미 부여된 권한이면 그대로 반환
    const { data: existing } = await supabase
      .from('user_permissions')
      .select('*')
      .eq('user_id', body.user_id)
      .eq('permission', body.permission)
      .maybeSingle();

    if (existing) {
      return NextResponse.json({ permission: existing }, { status: 200 });
    }

    const { data, error } = await supabase
      .from('user_permissions')
      .insert({ user_id: body.user_id, permission: body.permission, granted_by: granterId })
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json({ permission: data }, { status: 201 });
  } catch (err) {
    const msg = err instanceof Error ? err.message : '부여 실패';
    return NextResponse.json({ error: msg }, { status: msg === '권한 없음' ? 403 : 500 });
  }
}

// 권한 회수
export async function DELETE(req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.email) {
      return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 });
    }
    await assertSuperAdmin(session.user.email);

    const body = (await req.json()) as { user_id: string; permission: string };

    const supabase = createServerSupabaseClient();
    const { error } = await supabase
      .from('user_permissions')
      .delete()
      .eq('user_id', body.user_id)
      .eq('permission', body.permission);

    if (error) throw error;

    return NextResponse.json({ ok: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : '회수 실패';
    return NextResponse.json({ error: msg }, { status: msg === '권한 없음' ? 403 : 500 });
  }
}

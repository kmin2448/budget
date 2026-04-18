// app/api/admin/users/[id]/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import type { UserRole } from '@/types';

const VALID_ROLES: UserRole[] = ['super_admin', 'admin', 'viewer'];

async function assertSuperAdmin(email: string) {
  const supabase = createServerSupabaseClient();
  const { data: user } = await supabase
    .from('users')
    .select('role')
    .eq('email', email)
    .single();
  if (user?.role !== 'super_admin') throw new Error('권한 없음');
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    const session = await auth();
    if (!session?.user?.email) {
      return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 });
    }
    await assertSuperAdmin(session.user.email);

    const body = (await req.json()) as { role: UserRole };
    if (!VALID_ROLES.includes(body.role)) {
      return NextResponse.json({ error: '유효하지 않은 역할입니다.' }, { status: 400 });
    }

    const supabase = createServerSupabaseClient();
    const { data, error } = await supabase
      .from('users')
      .update({ role: body.role })
      .eq('id', params.id)
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json({ user: data });
  } catch (err) {
    const msg = err instanceof Error ? err.message : '수정 실패';
    return NextResponse.json({ error: msg }, { status: msg === '권한 없음' ? 403 : 500 });
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    const session = await auth();
    if (!session?.user?.email) {
      return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 });
    }
    await assertSuperAdmin(session.user.email);

    const supabase = createServerSupabaseClient();

    // 자기 자신 삭제 방지
    const { data: self } = await supabase
      .from('users')
      .select('id')
      .eq('email', session.user.email)
      .single();
    if (self?.id === params.id) {
      return NextResponse.json({ error: '자기 자신은 삭제할 수 없습니다.' }, { status: 400 });
    }

    const { error } = await supabase.from('users').delete().eq('id', params.id);
    if (error) throw error;

    return NextResponse.json({ ok: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : '삭제 실패';
    return NextResponse.json({ error: msg }, { status: msg === '권한 없음' ? 403 : 500 });
  }
}

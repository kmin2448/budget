// app/api/admin/users/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { createServerSupabaseClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

async function assertSuperAdmin(email: string) {
  const supabase = createServerSupabaseClient();
  const { data: user } = await supabase
    .from('users')
    .select('role')
    .eq('email', email)
    .single();
  if (user?.role !== 'super_admin') throw new Error('권한 없음');
}

export async function GET() {
  try {
    const session = await auth();
    if (!session?.user?.email) {
      return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 });
    }
    await assertSuperAdmin(session.user.email);

    const supabase = createServerSupabaseClient();
    const { data: users, error } = await supabase
      .from('users')
      .select('id, email, name, role, created_at')
      .order('created_at', { ascending: true });

    if (error) throw error;

    // 각 사용자의 세부 권한도 함께 조회
    const { data: perms } = await supabase
      .from('user_permissions')
      .select('user_id, permission');

    const permsByUser: Record<string, string[]> = {};
    for (const p of perms ?? []) {
      if (!permsByUser[p.user_id]) permsByUser[p.user_id] = [];
      permsByUser[p.user_id].push(p.permission);
    }

    const result = (users ?? []).map((u) => ({
      ...u,
      permissions: permsByUser[u.id] ?? [],
    }));

    return NextResponse.json({ users: result });
  } catch (err) {
    const msg = err instanceof Error ? err.message : '조회 실패';
    return NextResponse.json({ error: msg }, { status: msg === '권한 없음' ? 403 : 500 });
  }
}

// POST: 이메일로 사용자 추가
export async function POST(req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.email) {
      return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 });
    }
    await assertSuperAdmin(session.user.email);

    const body = (await req.json()) as { email: string; name?: string; role?: string };
    const email = body.email?.trim().toLowerCase();
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json({ error: '유효한 이메일을 입력해주세요.' }, { status: 400 });
    }

    const supabase = createServerSupabaseClient();
    const { data, error } = await supabase
      .from('users')
      .insert({ email, name: body.name?.trim() || null, role: body.role ?? 'staff' })
      .select()
      .single();

    if (error) {
      if (error.code === '23505') {
        return NextResponse.json({ error: '이미 등록된 이메일입니다.' }, { status: 409 });
      }
      throw error;
    }

    return NextResponse.json({ user: { ...data, permissions: [] } }, { status: 201 });
  } catch (err) {
    const msg = err instanceof Error ? err.message : '추가 실패';
    return NextResponse.json({ error: msg }, { status: msg === '권한 없음' ? 403 : 500 });
  }
}

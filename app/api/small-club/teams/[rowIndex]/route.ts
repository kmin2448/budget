import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { deleteSmallClubTeam } from '@/lib/google/smallclub-sheets';

async function assertCanWrite(email: string) {
  const supabase = createServerSupabaseClient();
  const { data: user } = await supabase
    .from('users')
    .select('role')
    .eq('email', email)
    .single();
  if (!user || (user.role !== 'super_admin' && user.role !== 'admin')) {
    throw new Error('권한이 없습니다.');
  }
}

export const dynamic = 'force-dynamic';

export async function DELETE(
  _req: Request,
  { params }: { params: { rowIndex: string } },
) {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 });
  }

  const rowIndex = Number(params.rowIndex);
  if (isNaN(rowIndex) || rowIndex < 3) {
    return NextResponse.json({ error: '잘못된 rowIndex' }, { status: 400 });
  }

  try {
    await assertCanWrite(session.user.email);
    await deleteSmallClubTeam(rowIndex);
    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : '소학회 삭제 실패';
    const status = message === '권한이 없습니다.' ? 403 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

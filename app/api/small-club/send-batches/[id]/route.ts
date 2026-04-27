import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { unmarkSmallClubExecutionsSent } from '@/lib/google/smallclub-sheets';

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
  { params }: { params: { id: string } },
) {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 });
  }
  try {
    await assertCanWrite(session.user.email);
    const supabase = createServerSupabaseClient();

    const { data: batch, error: fetchErr } = await supabase
      .from('smallclub_send_batches')
      .select('smallclub_row_indexes')
      .eq('id', params.id)
      .single();

    if (fetchErr || !batch) {
      return NextResponse.json({ error: '배치를 찾을 수 없습니다.' }, { status: 404 });
    }

    await unmarkSmallClubExecutionsSent(batch.smallclub_row_indexes as number[]);
    await supabase.from('smallclub_send_batches').delete().eq('id', params.id);

    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : '취소 실패';
    const status = message === '권한이 없습니다.' ? 403 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

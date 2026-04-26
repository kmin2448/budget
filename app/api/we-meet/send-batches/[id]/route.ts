import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { unmarkWeMeetExecutionsSent } from '@/lib/google/wemeet-sheets';

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

// DELETE /api/we-meet/send-batches/[id]
// 배치 취소: WE-Meet 보내기여부·청구여부 FALSE로 복원 + 배치 레코드 삭제
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

    // 배치 조회
    const { data: batch, error: fetchErr } = await supabase
      .from('wemeet_send_batches')
      .select('wemeet_row_indexes')
      .eq('id', params.id)
      .single();

    if (fetchErr || !batch) {
      return NextResponse.json({ error: '배치를 찾을 수 없습니다.' }, { status: 404 });
    }

    // WE-Meet 시트 되돌리기
    await unmarkWeMeetExecutionsSent(batch.wemeet_row_indexes as number[]);

    // 배치 레코드 삭제
    await supabase.from('wemeet_send_batches').delete().eq('id', params.id);

    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : '취소 실패';
    const status = message === '권한이 없습니다.' ? 403 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

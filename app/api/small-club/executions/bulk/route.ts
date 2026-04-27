import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { bulkAppendSmallClubExecutions } from '@/lib/google/smallclub-sheets';
import type { WeMeetExecution } from '@/types';

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

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 });
  }
  try {
    await assertCanWrite(session.user.email);
    const body = await req.json() as { executions: Array<Omit<WeMeetExecution, 'rowIndex' | 'sent'>> };
    if (!Array.isArray(body.executions) || body.executions.length === 0) {
      return NextResponse.json({ error: '추가할 항목이 없습니다.' }, { status: 400 });
    }
    await bulkAppendSmallClubExecutions(body.executions);
    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : '일괄 추가 실패';
    const status = message === '권한이 없습니다.' ? 403 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

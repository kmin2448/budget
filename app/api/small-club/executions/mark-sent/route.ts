import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { markSmallClubExecutionsSent } from '@/lib/google/smallclub-sheets';

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
    const body = await req.json() as {
      rowIndexes: number[];
      category?: string;
      budgetType?: string;
      description?: string;
      programName?: string;
      expenditureRowIndex?: number;
    };

    await markSmallClubExecutionsSent(body.rowIndexes);

    if (body.category && body.rowIndexes.length > 0) {
      const supabase = createServerSupabaseClient();
      await supabase.from('smallclub_send_batches').insert({
        category:                body.category,
        budget_type:             body.budgetType ?? 'main',
        description:             body.description ?? '',
        program_name:            body.programName ?? '',
        smallclub_row_indexes:   body.rowIndexes,
        expenditure_row_index:   body.expenditureRowIndex ?? null,
        sent_by:                 session.user.email,
      });
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : '보내기 표시 실패';
    const status = message === '권한이 없습니다.' ? 403 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

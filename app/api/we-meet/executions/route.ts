import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { getWeMeetExecutions, appendWeMeetExecution, getWeMeetTeams } from '@/lib/google/wemeet-sheets';
import { WEMEET_USAGE_TYPES } from '@/constants/wemeet';

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

export async function GET() {
  try {
    const [executions, teams] = await Promise.all([
      getWeMeetExecutions(),
      getWeMeetTeams(),
    ]);
    return NextResponse.json({
      executions,
      teams: teams.map((t) => t.teamName),
      usageTypes: [...WEMEET_USAGE_TYPES],
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : '데이터 로드 실패' },
      { status: 500 },
    );
  }
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 });
  }
  try {
    await assertCanWrite(session.user.email);
    const body = await req.json() as {
      usageType: string;
      teamName: string;
      plannedAmount: number;
      confirmed: boolean;
      confirmedAmount: number;
      description: string;
    };
    await appendWeMeetExecution(body);
    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : '추가 실패';
    const status = message === '권한이 없습니다.' ? 403 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

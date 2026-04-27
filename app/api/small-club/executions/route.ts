import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { getSmallClubExecutions, appendSmallClubExecution, getSmallClubTeams, getSmallClubUsageTypes } from '@/lib/google/smallclub-sheets';

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
    const [executions, teams, usageTypes] = await Promise.all([
      getSmallClubExecutions(),
      getSmallClubTeams(),
      getSmallClubUsageTypes(),
    ]);
    return NextResponse.json({
      executions,
      teams: teams.map((t) => t.teamName),
      usageTypes,
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
      description: string;
      teamName: string;
      draftAmount: number;
      confirmedAmount: number;
      claimed: boolean;
      remarks: string;
      evidenceSubmitted: boolean;
    };
    await appendSmallClubExecution(body);
    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : '추가 실패';
    const status = message === '권한이 없습니다.' ? 403 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

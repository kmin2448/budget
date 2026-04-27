import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { getSmallClubTeamInfos, getSmallClubTeams, upsertSmallClubTeamInfo } from '@/lib/google/smallclub-sheets';
import type { WeMeetTeamInfo } from '@/types';

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
    const [teamInfos, teams] = await Promise.all([
      getSmallClubTeamInfos(),
      getSmallClubTeams(),
    ]);
    return NextResponse.json({
      teamInfos,
      teams: teams.map((t) => t.teamName),
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : '소학회 정보 로드 실패' },
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
    const body = await req.json() as Omit<WeMeetTeamInfo, 'rowIndex'>;
    await upsertSmallClubTeamInfo(body);
    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : '소학회 정보 추가 실패';
    const status = message === '권한이 없습니다.' ? 403 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

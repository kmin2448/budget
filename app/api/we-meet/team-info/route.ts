import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import {
  getWeMeetTeamInfos,
  upsertWeMeetTeamInfo,
  getWeMeetTeams,
} from '@/lib/google/wemeet-sheets';
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

// GET: 팀정보 전체 조회 + 팀명 목록
export async function GET() {
  try {
    const [teamInfos, teams] = await Promise.all([
      getWeMeetTeamInfos(),
      getWeMeetTeams(),
    ]);
    return NextResponse.json({ teamInfos, teams });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : '팀 정보 로드 실패' },
      { status: 500 },
    );
  }
}

// POST: 팀정보 신규 추가
export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 });
  }

  try {
    await assertCanWrite(session.user.email);
    const body = await req.json() as Omit<WeMeetTeamInfo, 'rowIndex'>;
    if (!body.teamName?.trim()) {
      return NextResponse.json({ error: '팀명을 선택해주세요.' }, { status: 400 });
    }
    await upsertWeMeetTeamInfo(body);
    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : '팀 정보 추가 실패';
    const status = message === '권한이 없습니다.' ? 403 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

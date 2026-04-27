import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { getSmallClubTeams, appendSmallClubTeam } from '@/lib/google/smallclub-sheets';

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
    const teams = await getSmallClubTeams();
    return NextResponse.json({ teams });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : '소학회 목록 로드 실패' },
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
    const body = await req.json() as { teamName: string };
    if (!body.teamName?.trim()) {
      return NextResponse.json({ error: '소학회명을 입력해주세요.' }, { status: 400 });
    }
    await appendSmallClubTeam(body.teamName.trim());
    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : '소학회 추가 실패';
    const status = message === '권한이 없습니다.' ? 403 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

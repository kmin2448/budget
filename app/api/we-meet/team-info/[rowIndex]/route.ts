import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import {
  upsertWeMeetTeamInfo,
  deleteWeMeetTeamInfo,
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

// PATCH: 팀정보 수정 (rowIndex)
export async function PATCH(
  req: Request,
  { params }: { params: { rowIndex: string } },
) {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 });
  }

  const rowIndex = Number(params.rowIndex);
  if (isNaN(rowIndex)) {
    return NextResponse.json({ error: '잘못된 rowIndex입니다.' }, { status: 400 });
  }

  try {
    await assertCanWrite(session.user.email);
    const body = await req.json() as Omit<WeMeetTeamInfo, 'rowIndex'>;
    if (!body.teamName?.trim()) {
      return NextResponse.json({ error: '팀명을 선택해주세요.' }, { status: 400 });
    }
    await upsertWeMeetTeamInfo(body, rowIndex);
    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : '팀 정보 수정 실패';
    const status = message === '권한이 없습니다.' ? 403 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

// DELETE: 팀정보 삭제 (rowIndex)
export async function DELETE(
  _req: Request,
  { params }: { params: { rowIndex: string } },
) {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 });
  }

  const rowIndex = Number(params.rowIndex);
  if (isNaN(rowIndex)) {
    return NextResponse.json({ error: '잘못된 rowIndex입니다.' }, { status: 400 });
  }

  try {
    await assertCanWrite(session.user.email);
    await deleteWeMeetTeamInfo(rowIndex);
    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : '팀 정보 삭제 실패';
    const status = message === '권한이 없습니다.' ? 403 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

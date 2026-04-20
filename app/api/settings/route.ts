import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { invalidateCarryoverCache } from '@/lib/google/getSheetId';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const session = await auth();
    if (!session) {
      return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 });
    }

    const supabase = createServerSupabaseClient();
    const { data, error } = await supabase
      .from('app_settings')
      .select('value')
      .eq('key', 'carryover_sheet_id')
      .maybeSingle();

    if (error) {
      // 테이블이 없으면 환경 변수 폴백
      const envId = process.env.GOOGLE_CARRYOVER_SHEETS_ID ?? '';
      return NextResponse.json({ carryoverSheetId: envId, source: 'env' });
    }

    return NextResponse.json({
      carryoverSheetId: (data?.value as string) ?? process.env.GOOGLE_CARRYOVER_SHEETS_ID ?? '',
      source: data?.value ? 'db' : 'env',
    });
  } catch {
    return NextResponse.json({ carryoverSheetId: process.env.GOOGLE_CARRYOVER_SHEETS_ID ?? '', source: 'env' });
  }
}

export async function PUT(req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.email) {
      return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 });
    }

    const userRole = (session.user as { role?: string }).role;
    if (userRole !== 'super_admin') {
      return NextResponse.json({ error: '슈퍼어드민만 설정을 변경할 수 있습니다.' }, { status: 403 });
    }

    const body = await req.json() as { carryoverSheetId: string };
    const sheetId = (body.carryoverSheetId ?? '').trim();

    const supabase = createServerSupabaseClient();
    const { error } = await supabase.from('app_settings').upsert(
      { key: 'carryover_sheet_id', value: sheetId },
      { onConflict: 'key' },
    );

    if (error) {
      return NextResponse.json(
        { error: `저장 실패: ${error.message}. app_settings 테이블이 없으면 아래 SQL을 실행해 주세요.` },
        { status: 500 },
      );
    }

    invalidateCarryoverCache();
    return NextResponse.json({ message: '이월예산 Sheet ID가 저장되었습니다.' });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

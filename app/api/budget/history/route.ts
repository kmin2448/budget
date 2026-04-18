// app/api/budget/history/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { appendBudgetHistoryRows, mergeAdjustmentsIntoAllocations } from '@/lib/google/sheets';
import { checkPermission } from '@/lib/permissions';
import type { BudgetCategoryRow, BudgetDetailRow } from '@/types';
import { PERMISSIONS } from '@/types';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const session = await auth();
    if (!session) {
      return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 });
    }

    const supabase = createServerSupabaseClient();
    const { data, error } = await supabase
      .from('budget_change_history')
      .select('*')
      .order('changed_at', { ascending: false })
      .limit(100);

    if (error) throw error;
    return NextResponse.json(data ?? []);
  } catch (error) {
    console.error('Budget history GET error:', error);
    return NextResponse.json({ error: '이력 조회 중 오류가 발생했습니다.' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.email) {
      return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 });
    }

    const body = await req.json() as {
      changedAt: string;
      categorySnapshot: BudgetCategoryRow[];
      detailSnapshot: BudgetDetailRow[];
      pdfDriveUrl?: string;
    };

    if (!body.changedAt || !Array.isArray(body.categorySnapshot)) {
      return NextResponse.json({ error: '필수 데이터가 누락되었습니다.' }, { status: 400 });
    }

    const supabase = createServerSupabaseClient();

    // 현재 사용자 조회
    const { data: user } = await supabase
      .from('users')
      .select('id, name')
      .eq('email', session.user.email)
      .single();

    const snapshotObj = {
      categorySnapshot: body.categorySnapshot,
      detailSnapshot:   body.detailSnapshot ?? [],
    };

    // 증감액이 있는 세목 행 (비목 순증감 0인 세목 간 이동도 포착)
    const changedDetailRows = (body.detailSnapshot ?? []).filter((row) => row.adjustment !== 0);
    const changedCategoryRows = body.categorySnapshot.filter((row) => row.adjustment !== 0);

    // 세목·비목 모두 변경 없으면 건너뜀
    if (changedDetailRows.length === 0 && changedCategoryRows.length === 0) {
      return NextResponse.json({ message: '변경된 항목이 없습니다.' });
    }

    // 1. Supabase 저장 — 세션당 1건 (비목별 다건 저장 → 같은 날 중복 표시 버그 방지)
    const totalBefore = body.categorySnapshot.reduce((s, r) => s + r.allocation, 0);
    const totalAdj    = body.categorySnapshot.reduce((s, r) => s + r.adjustment, 0);
    const totalAfter  = body.categorySnapshot.reduce((s, r) => s + r.afterAllocation, 0);

    // 대표 category 문자열: 비목 순증감이 있으면 비목명, 없으면(세목 내 이동) 세목명
    const repCategory = changedCategoryRows.length > 0
      ? changedCategoryRows.map((r) => r.category).join(', ')
      : changedDetailRows
          .map((r) => r.subcategory || r.category)
          .filter((v, i, a) => a.indexOf(v) === i)
          .join(', ');

    const { error: insertError } = await supabase.from('budget_change_history').insert([{
      changed_at:    body.changedAt,
      changed_by:    user?.id ?? null,
      category:      repCategory,
      before_amount: totalBefore,
      adjustment:    totalAdj,
      after_amount:  totalAfter,
      pdf_drive_url: body.pdfDriveUrl ?? null,
      snapshot:      snapshotObj as unknown as Record<string, unknown>,
    }]);
    if (insertError) {
      console.error('Supabase insert error:', insertError);
      return NextResponse.json(
        { error: `DB 저장 오류: ${insertError.message} (code: ${insertError.code})` },
        { status: 500 },
      );
    }

    // 2. Google Sheets 예산변경이력 시트에 세목·세세목 단위로 누적 저장
    const confirmedBy = user?.name ?? session.user.email ?? '';

    await appendBudgetHistoryRows(
      changedDetailRows.map((row) => ({
        changedAt:         body.changedAt,
        category:          row.category,
        subcategory:       row.subcategory ?? '',
        subDetail:         row.subDetail ?? '',
        beforeAmount:      row.allocation,
        adjustment:        row.adjustment,
        afterAmount:       row.afterAllocation,
        executionComplete: row.executionComplete,
        executionPlanned:  row.executionPlanned,
        balance:           row.balance,
        executionRate:     row.executionRate,
        confirmedBy,
      })),
    );

    // 3. 증감액을 편성액에 반영하고 증감액을 0으로 초기화
    await mergeAdjustmentsIntoAllocations();

    return NextResponse.json({ message: '변경이력이 저장되었습니다.' });
  } catch (error) {
    console.error('Budget history POST error:', error);
    const msg = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: `이력 저장 오류: ${msg}` }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.email) {
      return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 });
    }

    const hasPermission = await checkPermission(session.user.email, PERMISSIONS.BUDGET_WRITE);
    if (!hasPermission) {
      return NextResponse.json({ error: '권한이 없습니다.' }, { status: 403 });
    }

    const { searchParams } = new URL(req.url);
    const id        = searchParams.get('id');
    const changedAt = searchParams.get('changedAt'); // 하위 호환

    if (!id && !changedAt) {
      return NextResponse.json({ error: 'id 또는 changedAt 파라미터가 필요합니다.' }, { status: 400 });
    }

    const supabase = createServerSupabaseClient();
    const { error } = id
      ? await supabase.from('budget_change_history').delete().eq('id', id)
      : await supabase.from('budget_change_history').delete().eq('changed_at', changedAt!);

    if (error) throw error;
    return NextResponse.json({ message: '이력이 삭제되었습니다.' });
  } catch (error) {
    console.error('Budget history DELETE error:', error);
    const msg = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: `이력 삭제 오류: ${msg}` }, { status: 500 });
  }
}

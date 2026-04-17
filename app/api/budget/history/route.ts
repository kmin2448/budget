// app/api/budget/history/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { appendBudgetHistoryRows, mergeAdjustmentsIntoAllocations } from '@/lib/google/sheets';
import type { BudgetCategoryRow, BudgetDetailRow } from '@/types';

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

    // 증감액이 있는 비목만 Supabase에 저장 (비목 단위)
    const changedCategoryRows = body.categorySnapshot.filter((row) => row.adjustment !== 0);

    if (changedCategoryRows.length === 0) {
      return NextResponse.json({ message: '변경된 항목이 없습니다.' });
    }

    // 1. Supabase 저장 (비목 단위)
    const records = changedCategoryRows.map((row) => ({
      changed_at:    body.changedAt,
      changed_by:    user?.id ?? null,
      category:      row.category,
      before_amount: row.allocation,
      adjustment:    row.adjustment,
      after_amount:  row.afterAllocation,
      pdf_drive_url: body.pdfDriveUrl ?? null,
      snapshot:      snapshotObj as unknown as Record<string, unknown>,
    }));

    const { error: insertError } = await supabase.from('budget_change_history').insert(records);
    if (insertError) {
      console.error('Supabase insert error:', insertError);
      return NextResponse.json(
        { error: `DB 저장 오류: ${insertError.message} (code: ${insertError.code})` },
        { status: 500 },
      );
    }

    // 2. Google Sheets 예산변경이력 시트에 세목·세세목 단위로 누적 저장
    const confirmedBy = user?.name ?? session.user.email ?? '';

    // 증감액이 있는 세목 행만 추출
    const changedDetailRows = (body.detailSnapshot ?? []).filter(
      (row) => row.adjustment !== 0,
    );

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

    return NextResponse.json({ message: `${records.length}건의 변경이력이 저장되었습니다.` });
  } catch (error) {
    console.error('Budget history POST error:', error);
    const msg = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: `이력 저장 오류: ${msg}` }, { status: 500 });
  }
}

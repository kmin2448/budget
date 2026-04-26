import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { createServerSupabaseClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

// GET /api/we-meet/send-batches
// 전체 보내기 배치 목록 반환 (WE-Meet 확장 뷰에서 그룹핑에 사용)
export async function GET() {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 });
  }
  try {
    const supabase = createServerSupabaseClient();
    const { data, error } = await supabase
      .from('wemeet_send_batches')
      .select('*')
      .order('sent_at', { ascending: false });

    if (error) throw error;

    // snake_case → camelCase 변환
    const batches = (data ?? []).map((row) => ({
      id:                   row.id as string,
      category:             row.category as string,
      budgetType:           row.budget_type as string,
      description:          row.description as string,
      programName:          row.program_name as string,
      wemeetRowIndexes:     row.wemeet_row_indexes as number[],
      expenditureRowIndex:  row.expenditure_row_index as number | null,
      sentAt:               row.sent_at as string,
      sentBy:               row.sent_by as string | null,
    }));

    return NextResponse.json({ batches });
  } catch (err) {
    const message = err instanceof Error ? err.message : '조회 실패';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

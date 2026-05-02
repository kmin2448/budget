import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getSheetsClient } from '@/lib/google/sheets';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { CATEGORY_SHEETS, CATEGORY_DATA_START_ROW, CATEGORY_DATA_END_ROW_MAP } from '@/constants/sheets';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.email) {
      return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const category = searchParams.get('category');

    if (!category || !(CATEGORY_SHEETS as readonly string[]).includes(category)) {
      return NextResponse.json({ error: '유효하지 않은 비목입니다.' }, { status: 400 });
    }

    const SPREADSHEET_ID = process.env.GOOGLE_SHEETS_ID!;
    const sheets = getSheetsClient();
    const isPersonnel = category === '인건비';
    const endRow = CATEGORY_DATA_END_ROW_MAP[category as keyof typeof CATEGORY_DATA_END_ROW_MAP];
    const endCol = isPersonnel ? 'M' : 'H';
    const range = `'${category}'!A${CATEGORY_DATA_START_ROW}:${endCol}${endRow}`;

    const res = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range,
      valueRenderOption: 'FORMATTED_VALUE',
    });

    // 이미 파일이 연결된 행 조회 → 수동 매칭 목록에서 제외
    const supabase = createServerSupabaseClient();
    const { data: uploadedFiles } = await supabase
      .from('expenditure_files')
      .select('row_index')
      .eq('sheet_name', category);

    const uploadedRowIndices = new Set(
      (uploadedFiles ?? []).map((f: { row_index: number }) => f.row_index),
    );

    const rows = (res.data.values ?? [])
      .map((row, idx) => ({
        rowIndex: CATEGORY_DATA_START_ROW + idx,
        programName: String(row[0] ?? '').trim(),
        description: isPersonnel
          ? String(row[0] ?? '').trim()
          : String(row[2] ?? '').trim(),
      }))
      .filter((r) => (r.description || r.programName) && !uploadedRowIndices.has(r.rowIndex));

    return NextResponse.json({ rows });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : '조회 실패' },
      { status: 500 },
    );
  }
}

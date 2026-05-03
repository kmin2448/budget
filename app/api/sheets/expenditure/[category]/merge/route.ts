// app/api/sheets/expenditure/[category]/merge/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getSheetsClient } from '@/lib/google/sheets';
import {
  CATEGORY_SHEETS,
  CATEGORY_DATA_START_ROW,
  CATEGORY_DATA_END_ROW_MAP,
  PERSONNEL_CATEGORY,
} from '@/constants/sheets';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { serialToDateString } from '@/lib/expenditure-utils';
import { checkPermission } from '@/lib/permissions';
import { PERMISSIONS } from '@/types';
import { getSpreadsheetId } from '@/lib/google/getSheetId';
import type { BudgetType, MergeSubItem } from '@/types';

function isCategorySheet(val: string): val is typeof CATEGORY_SHEETS[number] {
  return (CATEGORY_SHEETS as readonly string[]).includes(val);
}

function getMonthCount(sheetType: BudgetType) {
  return sheetType === 'carryover' ? 4 : 12;
}

function getGeneralEndCol(monthCount: number) {
  return String.fromCharCode('A'.charCodeAt(0) + 8 + monthCount - 1);
}

export async function POST(
  req: NextRequest,
  { params }: { params: { category: string } },
) {
  try {
    const session = await auth();
    if (!session?.user?.email) {
      return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 });
    }
    const hasPermission = await checkPermission(session.user.email, PERMISSIONS.EXPENDITURE_WRITE);
    if (!hasPermission) {
      return NextResponse.json({ error: '권한이 없습니다.' }, { status: 403 });
    }

    const category = decodeURIComponent(params.category);
    if (!isCategorySheet(category) || category === PERSONNEL_CATEGORY) {
      return NextResponse.json({ error: '유효하지 않은 비목입니다.' }, { status: 400 });
    }

    const body = await req.json() as {
      rowIndexes: number[];
      description: string;
      programName: string;
      sheetType?: string;
    };

    if (!body.rowIndexes || body.rowIndexes.length < 2) {
      return NextResponse.json({ error: '2건 이상 선택해야 합니다.' }, { status: 400 });
    }
    if (!body.description?.trim()) {
      return NextResponse.json({ error: '건명을 입력해야 합니다.' }, { status: 400 });
    }

    const sheetType = ((req.nextUrl.searchParams.get('sheetType') ?? body.sheetType ?? 'main')) as BudgetType;
    const SPREADSHEET_ID = await getSpreadsheetId(sheetType);
    const sheets = getSheetsClient();
    const supabase = createServerSupabaseClient();
    const monthCount = getMonthCount(sheetType);
    const endCol = getGeneralEndCol(monthCount);

    // 1. 선택된 행들 읽기
    const rowDataResults = await Promise.all(
      body.rowIndexes.map((rowIndex) =>
        sheets.spreadsheets.values.get({
          spreadsheetId: SPREADSHEET_ID,
          range: `'${category}'!A${rowIndex}:${endCol}${rowIndex}`,
          valueRenderOption: 'UNFORMATTED_VALUE',
        }),
      ),
    );

    const subItems: MergeSubItem[] = rowDataResults.map((res) => {
      const raw = (res.data.values?.[0] ?? []) as (string | number | null)[];
      const programName = String(raw[0] ?? '').trim();
      const description = String(raw[2] ?? '').trim();
      const monthlyAmounts: number[] = Array.from({ length: 12 }, (_, i) =>
        i < monthCount ? Number(raw[8 + i] ?? 0) : 0,
      );
      const totalAmount = monthlyAmounts.reduce((s, v) => s + v, 0);
      return { description, programName, monthlyAmounts, totalAmount };
    });

    // 2. 합산 월별 금액
    const mergedMonthly: number[] = Array.from({ length: monthCount }, (_, i) =>
      subItems.reduce((s, item) => s + item.monthlyAmounts[i], 0),
    );

    // 3. 날짜: 선택 행 중 가장 최근 날짜 (없으면 빈값)
    const dates = rowDataResults
      .map((res) => serialToDateString((res.data.values?.[0] ?? [])[1]))
      .filter((d) => !!d);
    const mergedDate = dates.length > 0 ? dates.sort().at(-1)! : '';

    // 4. 새 병합 행 추가 위치 탐색
    const colARes = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: `'${category}'!A${CATEGORY_DATA_START_ROW}:A${CATEGORY_DATA_END_ROW_MAP[category]}`,
      valueRenderOption: 'UNFORMATTED_VALUE',
    });
    const colA = (colARes.data.values ?? []) as (string | number | null)[][];
    let lastDataIdx = -1;
    for (let i = 0; i < colA.length; i++) {
      if (String(colA[i]?.[0] ?? '').trim()) lastDataIdx = i;
    }
    const newRowIndex = CATEGORY_DATA_START_ROW + lastDataIdx + 1;

    const rowValues: (string | number)[] = [
      body.programName,
      mergedDate,
      body.description.trim(),
      '', '', '', '', '',
      ...mergedMonthly,
    ];

    // 5. 새 행 쓰기
    await sheets.spreadsheets.values.update({
      spreadsheetId: SPREADSHEET_ID,
      range: `'${category}'!A${newRowIndex}:${endCol}${newRowIndex}`,
      valueInputOption: 'USER_ENTERED',
      requestBody: { values: [rowValues] },
    });

    // 6. 원본 행들 초기화
    await Promise.all(
      body.rowIndexes.map((rowIndex) =>
        sheets.spreadsheets.values.clear({
          spreadsheetId: SPREADSHEET_ID,
          range: `'${category}'!A${rowIndex}:${endCol}${rowIndex}`,
        }),
      ),
    );

    // 7. Supabase에 merge 메타데이터 저장
    await supabase.from('expenditure_merges').insert({
      sheet_name: category,
      budget_type: sheetType,
      merged_row_index: newRowIndex,
      sub_items: subItems,
      created_by: session.user.email,
    });

    return NextResponse.json({ rowIndex: newRowIndex, message: '합치기 완료' });
  } catch (error) {
    console.error('Merge error:', error);
    return NextResponse.json({ error: '합치기 중 오류가 발생했습니다.' }, { status: 500 });
  }
}

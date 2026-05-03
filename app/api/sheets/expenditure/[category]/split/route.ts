// app/api/sheets/expenditure/[category]/split/route.ts
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
      mergeId: string;
      mergedRowIndex: number;
      subItemIndexes: number[];
      sheetType?: string;
    };

    if (!body.mergeId || !body.mergedRowIndex || !body.subItemIndexes?.length) {
      return NextResponse.json({ error: '필수 파라미터가 누락되었습니다.' }, { status: 400 });
    }

    const sheetType = (
      req.nextUrl.searchParams.get('sheetType') ?? body.sheetType ?? 'main'
    ) as BudgetType;
    const SPREADSHEET_ID = await getSpreadsheetId(sheetType);
    const sheets = getSheetsClient();
    const supabase = createServerSupabaseClient();
    const monthCount = getMonthCount(sheetType);
    const endCol = getGeneralEndCol(monthCount);

    // 1. Supabase merge 레코드 조회
    const { data: mergeRecord, error: mergeErr } = await supabase
      .from('expenditure_merges')
      .select('id, sub_items')
      .eq('id', body.mergeId)
      .single();

    if (mergeErr || !mergeRecord) {
      return NextResponse.json({ error: '합치기 내역을 찾을 수 없습니다.' }, { status: 404 });
    }

    const allSubItems = mergeRecord.sub_items as MergeSubItem[];
    const extractSet = new Set<number>(body.subItemIndexes);

    for (const idx of body.subItemIndexes) {
      if (idx < 0 || idx >= allSubItems.length) {
        return NextResponse.json({ error: `유효하지 않은 항목 인덱스: ${idx}` }, { status: 400 });
      }
    }

    const extractItems = allSubItems.filter((_, i) => extractSet.has(i));
    const remainingItems = allSubItems.filter((_, i) => !extractSet.has(i));

    // 2. 병합 행의 날짜 조회 (추출 행에 재사용)
    const dateRes = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: `'${category}'!B${body.mergedRowIndex}`,
      valueRenderOption: 'UNFORMATTED_VALUE',
    });
    const mergedDate = dateRes.data.values?.[0]?.[0] ?? '';

    // 3. 마지막 데이터 행 탐색
    const colARes = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: `'${category}'!A${CATEGORY_DATA_START_ROW}:A${CATEGORY_DATA_END_ROW_MAP[category as keyof typeof CATEGORY_DATA_END_ROW_MAP]}`,
      valueRenderOption: 'UNFORMATTED_VALUE',
    });
    const colA = (colARes.data.values ?? []) as (string | number | null)[][];
    let lastDataIdx = -1;
    for (let i = 0; i < colA.length; i++) {
      if (String(colA[i]?.[0] ?? '').trim()) lastDataIdx = i;
    }

    // 4. 추출 항목 → 새 행 쓰기
    const newRowIndexes: number[] = [];
    for (let i = 0; i < extractItems.length; i++) {
      const item = extractItems[i];
      const newRowIndex = CATEGORY_DATA_START_ROW + lastDataIdx + 1 + i;
      newRowIndexes.push(newRowIndex);

      const monthlyValues = Array.from(
        { length: monthCount },
        (_, mi) => item.monthlyAmounts[mi] ?? 0,
      );
      const rowValues: (string | number)[] = [
        item.programName,
        mergedDate,
        item.description,
        '', '', '', '', '',
        ...monthlyValues,
      ];

      await sheets.spreadsheets.values.update({
        spreadsheetId: SPREADSHEET_ID,
        range: `'${category}'!A${newRowIndex}:${endCol}${newRowIndex}`,
        valueInputOption: 'USER_ENTERED',
        requestBody: { values: [rowValues] },
      });
    }

    // 5. 병합 행 업데이트 or 초기화
    if (remainingItems.length > 0) {
      const remainingMonthly = Array.from({ length: monthCount }, (_, i) =>
        remainingItems.reduce((s, item) => s + (item.monthlyAmounts[i] ?? 0), 0),
      );
      // 현재 행의 programName, description 유지
      const currentRowRes = await sheets.spreadsheets.values.get({
        spreadsheetId: SPREADSHEET_ID,
        range: `'${category}'!A${body.mergedRowIndex}:${endCol}${body.mergedRowIndex}`,
        valueRenderOption: 'UNFORMATTED_VALUE',
      });
      const currentRow = currentRowRes.data.values?.[0] ?? [];
      const updatedValues: (string | number)[] = [
        String(currentRow[0] ?? ''),
        mergedDate,
        String(currentRow[2] ?? ''),
        '', '', '', '', '',
        ...remainingMonthly,
      ];
      await sheets.spreadsheets.values.update({
        spreadsheetId: SPREADSHEET_ID,
        range: `'${category}'!A${body.mergedRowIndex}:${endCol}${body.mergedRowIndex}`,
        valueInputOption: 'USER_ENTERED',
        requestBody: { values: [updatedValues] },
      });
    } else {
      await sheets.spreadsheets.values.clear({
        spreadsheetId: SPREADSHEET_ID,
        range: `'${category}'!A${body.mergedRowIndex}:${endCol}${body.mergedRowIndex}`,
      });
    }

    // 6. Supabase 업데이트
    if (remainingItems.length > 0) {
      await supabase
        .from('expenditure_merges')
        .update({ sub_items: remainingItems })
        .eq('id', body.mergeId);
    } else {
      await supabase
        .from('expenditure_merges')
        .delete()
        .eq('id', body.mergeId);
    }

    return NextResponse.json({
      message: '별건으로 빼기 완료',
      extractedCount: extractItems.length,
      remainingCount: remainingItems.length,
      newRowIndexes,
    });
  } catch (error) {
    console.error('Split error:', error);
    return NextResponse.json({ error: '별건으로 빼기 중 오류가 발생했습니다.' }, { status: 500 });
  }
}

// app/api/sheets/expenditure/[category]/init-ids/route.ts
// 기존 집행 건에 고유 ID가 없는 경우 UUID를 일괄 생성·부여하고 Supabase 레코드도 업데이트
import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getSheetsClient } from '@/lib/google/sheets';
import { generateRowId } from '@/lib/google/sheet-row-ops';
import {
  CATEGORY_SHEETS,
  CATEGORY_DATA_START_ROW,
  CATEGORY_DATA_END_ROW_MAP,
  PERSONNEL_CATEGORY,
  ID_COL_MAIN,
  ID_COL_CARRYOVER,
} from '@/constants/sheets';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { checkPermission } from '@/lib/permissions';
import { PERMISSIONS } from '@/types';
import { getSpreadsheetId } from '@/lib/google/getSheetId';
import type { BudgetType } from '@/types';

function isCategorySheet(val: string): val is typeof CATEGORY_SHEETS[number] {
  return (CATEGORY_SHEETS as readonly string[]).includes(val);
}


function getIdCol(sheetType: BudgetType): string {
  return sheetType === 'carryover' ? ID_COL_CARRYOVER : ID_COL_MAIN;
}
function getIdColIndex(sheetType: BudgetType): number {
  return sheetType === 'carryover' ? 12 : 20;
}

/**
 * POST /api/sheets/expenditure/[category]/init-ids?sheetType=main|carryover
 *
 * 해당 비목 시트의 모든 데이터 행을 스캔하여:
 * 1. UUID 열이 비어 있는 행에 새 UUID를 생성해 시트에 기록
 * 2. Supabase expenditure_files·expenditure_merges 레코드의 row_uuid도 동시 업데이트
 */
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
    if (!isCategorySheet(category)) {
      return NextResponse.json({ error: '유효하지 않은 비목입니다.' }, { status: 400 });
    }

    // 인건비는 셀 주소(row_index + month_index) 기반 매칭 — 행 UUID 불필요
    if (category === PERSONNEL_CATEGORY) {
      return NextResponse.json({ message: '인건비는 셀 주소 기반 매칭을 사용합니다. ID 부여 불필요.', updated: 0 });
    }

    const sheetType = (req.nextUrl.searchParams.get('sheetType') ?? 'main') as BudgetType;
    const SPREADSHEET_ID = await getSpreadsheetId(sheetType);
    const sheets = getSheetsClient();
    const supabase = createServerSupabaseClient();

    const idCol      = getIdCol(sheetType);
    const idColIndex = getIdColIndex(sheetType);

    // 일반 비목: 건명(C열) 기준으로 데이터 유무 판단 (인건비는 위에서 조기 반환)
    const checkColLetter = 'C';
    const readRange = `'${category}'!${checkColLetter}${CATEGORY_DATA_START_ROW}:${idCol}${CATEGORY_DATA_END_ROW_MAP[category]}`;

    const rowsRes = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: readRange,
      valueRenderOption: 'UNFORMATTED_VALUE',
    });
    const rawRows = (rowsRes.data.values ?? []) as (string | number | null)[][];

    // 전체 열 수 (checkCol부터 idCol까지)
    const colOffset = checkColLetter.charCodeAt(0) - 'A'.charCodeAt(0); // checkCol의 0-based index
    const idRelIdx  = idColIndex - colOffset; // 읽은 배열 내에서 UUID의 상대 인덱스

    // UUID가 없는 데이터 행 수집
    const updates: { range: string; values: string[][] }[] = [];
    const rowMapping: { rowIndex: number; uuid: string }[] = [];

    for (let i = 0; i < rawRows.length; i++) {
      const row = rawRows[i];
      const cellValue = String(row[0] ?? '').trim(); // checkCol값 (A 또는 C)
      if (!cellValue) continue; // 빈 행 스킵

      const existingUuid = String(row[idRelIdx] ?? '').trim();
      if (existingUuid) continue; // 이미 UUID 있으면 스킵

      const rowIndex = CATEGORY_DATA_START_ROW + i;
      const newUuid  = generateRowId();
      updates.push({ range: `'${category}'!${idCol}${rowIndex}`, values: [[newUuid]] });
      rowMapping.push({ rowIndex, uuid: newUuid });
    }

    // 1. 시트에 UUID 일괄 기록
    if (updates.length > 0) {
      await sheets.spreadsheets.values.batchUpdate({
        spreadsheetId: SPREADSHEET_ID,
        requestBody: {
          valueInputOption: 'RAW',
          data: updates,
        },
      });
    }

    // 2. Supabase 레코드도 UUID 업데이트 (row_index → row_uuid 연결)
    if (rowMapping.length > 0) {
      await Promise.all(
        rowMapping.map(({ rowIndex, uuid }) =>
          Promise.all([
            supabase
              .from('expenditure_files')
              .update({ row_uuid: uuid })
              .eq('sheet_name', category)
              .eq('row_index', rowIndex)
              .is('row_uuid', null),
            supabase
              .from('expenditure_merges')
              .update({ row_uuid: uuid })
              .eq('sheet_name', category)
              .eq('merged_row_index', rowIndex)
              .is('row_uuid', null),
          ])
        ),
      );
    }

    return NextResponse.json({
      message: `${rowMapping.length}건에 고유 ID가 부여되었습니다.`,
      updated: rowMapping.length,
      dataCol: `${checkColLetter}열 기준`,
      idCol,
    });
  } catch (error) {
    console.error('init-ids error:', error);
    return NextResponse.json({ error: 'ID 초기화 중 오류가 발생했습니다.' }, { status: 500 });
  }
}

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getSheetsClient } from '@/lib/google/sheets';
import { PERMISSIONS } from '@/types';
import { checkPermission } from '@/lib/permissions';
import { getSpreadsheetId } from '@/lib/google/getSheetId';
import type { BudgetType } from '@/types';

const SHEET = "'집행내역 정리'";

// 프로그램 행 추가 (빈 행 찾아서 삽입)
export async function POST(req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.email) {
      return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 });
    }

    const hasPermission = await checkPermission(
      session.user.email,
      PERMISSIONS.DASHBOARD_WRITE,
    );
    if (!hasPermission) {
      return NextResponse.json({ error: '권한이 없습니다.' }, { status: 403 });
    }

    const sheetType = (req.nextUrl.searchParams.get('sheetType') ?? 'main') as BudgetType;
    const SPREADSHEET_ID = await getSpreadsheetId(sheetType);

    const body = await req.json() as {
      category: string;
      programName: string;
      budget: string;
      subCategory: string;
      subDetail: string;
      professor?: string;
      teacher?: string;
      staff?: string;
      note?: string;
      budgetPlan: number;
    };

    const sheets = getSheetsClient();
    const SENTINEL = '새로운 집행 내역 작성시 이 행 위로 작성';

    // ── 시트 메타 + 데이터 병렬 조회 ──
    const [spreadsheetInfo, rowsRes] = await Promise.all([
      sheets.spreadsheets.get({
        spreadsheetId: SPREADSHEET_ID,
        fields: 'sheets.properties.title,sheets.properties.sheetId',
      }),
      sheets.spreadsheets.values.get({
        spreadsheetId: SPREADSHEET_ID,
        range: `${SHEET}!A6:Q500`,
        valueRenderOption: 'UNFORMATTED_VALUE',
      }),
    ]);

    // 시트 ID (sheetId 가 0 일 수도 있으므로 undefined 만 체크)
    const sheetMeta = spreadsheetInfo.data.sheets?.find(
      (s) => s.properties?.title === '집행내역 정리',
    );
    const sheetId = sheetMeta?.properties?.sheetId;
    if (sheetId === undefined) {
      const available = spreadsheetInfo.data.sheets?.map((s) => s.properties?.title).join(', ');
      return NextResponse.json(
        { error: `'집행내역 정리' 시트를 찾을 수 없습니다. 현재 시트: ${available}` },
        { status: 404 },
      );
    }

    // ── sentinel 위치 ──
    const allRows = rowsRes.data.values ?? [];
    const sentinelIdx = allRows.findIndex((row) =>
      row.some((cell) => String(cell ?? '').includes(SENTINEL)),
    );

    let insertAfterRow: number;

    if (sentinelIdx === -1) {
      // sentinel 없으면 마지막 데이터 행 뒤에 삽입 (폴백)
      insertAfterRow = 5 + allRows.length; // row 6부터 시작하므로 마지막 = 5 + length
    } else {
      const sentinelRowNumber = 6 + sentinelIdx; // 1-based
      const dataRows = allRows.slice(0, sentinelIdx);

      const categoryRowNumbers = dataRows
        .map((row, idx) => ({ rowNum: 6 + idx, cat: String(row[1] ?? '').trim() }))
        .filter(({ cat }) => cat === body.category.trim())
        .map(({ rowNum }) => rowNum);

      insertAfterRow =
        categoryRowNumbers.length > 0
          ? Math.max(...categoryRowNumbers)  // 해당 구분 마지막 행 뒤
          : sentinelRowNumber - 1;           // sentinel 바로 위
    }

    // ── 행 삽입 시도 → 보호 걸려 있으면 빈 행 폴백 ──
    let newRowNumber: number;

    try {
      // 1순위: insertDimension (시트 보호가 없을 때)
      await sheets.spreadsheets.batchUpdate({
        spreadsheetId: SPREADSHEET_ID,
        requestBody: {
          requests: [{
            insertDimension: {
              range: {
                sheetId,
                dimension: 'ROWS',
                startIndex: insertAfterRow,
                endIndex: insertAfterRow + 1,
              },
              inheritFromBefore: true,
            },
          }],
        },
      });
      newRowNumber = insertAfterRow + 1;
    } catch {
      // 2순위: 시트 보호로 삽입 실패 → insertAfterRow 이후 첫 번째 빈 행 사용
      const sentinelLimit = sentinelIdx === -1 ? allRows.length : sentinelIdx;
      // insertAfterRow(1-based) → allRows 인덱스: insertAfterRow - 6 + 1 = insertAfterRow - 5
      const searchFrom = Math.max(0, insertAfterRow - 5);
      let emptyIdx = -1;
      for (let i = searchFrom; i < sentinelLimit; i++) {
        const r = allRows[i];
        const isEmpty =
          !String(r?.[1] ?? '').trim() &&  // B: 구분 없음
          !String(r?.[7] ?? '').trim();     // H: 프로그램명 없음
        if (isEmpty) { emptyIdx = i; break; }
      }
      if (emptyIdx === -1) {
        return NextResponse.json(
          { error: '빈 행이 없습니다. Google Sheets에서 데이터 → 시트 및 범위 보호를 해제하거나, 시트에 빈 행을 추가해주세요.' },
          { status: 400 },
        );
      }
      newRowNumber = emptyIdx + 6; // allRows 인덱스 → 1-based 행 번호
    }

    // ── 데이터 기록 ──
    await sheets.spreadsheets.values.update({
      spreadsheetId: SPREADSHEET_ID,
      range: `${SHEET}!A${newRowNumber}:L${newRowNumber}`,
      valueInputOption: 'USER_ENTERED',
      requestBody: {
        values: [[
          '',                        // A: 코드
          body.category,             // B: 구분
          body.budget,               // C: 비목
          body.subCategory,          // D: 보조비목
          body.subDetail,            // E: 보조세목
          body.professor ?? '',      // F: 소관
          '',                        // G: (미사용)
          body.programName,          // H: 프로그램명
          body.note ?? '',           // I: 비고
          body.teacher ?? '',        // J: 담당교원
          body.staff ?? '',          // K: 담당직원
          body.budgetPlan || 0,      // L: 예산계획
        ]],
      },
    });

    return NextResponse.json({ rowIndex: newRowNumber, message: '프로그램이 추가되었습니다.' });
  } catch (error) {
    console.error('Program POST error:', error);
    const msg = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: `추가 중 오류: ${msg}` }, { status: 500 });
  }
}

// 프로그램 행 수정
export async function PUT(req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.email) {
      return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 });
    }

    const hasPermission = await checkPermission(
      session.user.email,
      PERMISSIONS.DASHBOARD_WRITE,
    );
    if (!hasPermission) {
      return NextResponse.json({ error: '권한이 없습니다.' }, { status: 403 });
    }

    const sheetType = (req.nextUrl.searchParams.get('sheetType') ?? 'main') as BudgetType;
    const SPREADSHEET_ID = await getSpreadsheetId(sheetType);

    const body = await req.json() as {
      rowIndex: number;
      category: string;
      programName: string;
      budget: string;
      subCategory: string;
      subDetail: string;
      professor?: string;
      teacher?: string;
      staff?: string;
      note?: string;
      budgetPlan: number;
    };

    const sheets = getSheetsClient();

    await sheets.spreadsheets.values.update({
      spreadsheetId: SPREADSHEET_ID,
      range: `${SHEET}!A${body.rowIndex}:L${body.rowIndex}`,
      valueInputOption: 'USER_ENTERED',
      requestBody: {
        values: [[
          '',                        // A: 코드 (유지)
          body.category,             // B: 구분
          body.budget,               // C: 비목
          body.subCategory,          // D: 보조비목
          body.subDetail,            // E: 보조세목
          body.professor ?? '',      // F: 소관
          '',                        // G: (미사용)
          body.programName,          // H: 프로그램명
          body.note ?? '',           // I: 비고
          body.teacher ?? '',        // J: 담당교원
          body.staff ?? '',          // K: 담당직원
          body.budgetPlan || 0,      // L: 예산계획
        ]],
      },
    });

    return NextResponse.json({ message: '수정되었습니다.' });
  } catch (error) {
    console.error('Program PUT error:', error);
    return NextResponse.json({ error: '수정 중 오류가 발생했습니다.' }, { status: 500 });
  }
}

const FIELD_COLUMN: Record<string, string> = {
  divisionCode: 'A',
  category: 'B',
  budget: 'C',
  subCategory: 'D',
  subDetail: 'E',
  professor: 'F',
  programName: 'H',
  note: 'I',
  teacher: 'J',
  staff: 'K',
  budgetPlan: 'L',
  additionalReflection: 'R',
  additionalReflectionDate: 'S',
  isCompleted: 'T',
  isOnHold: 'U',
};

// 인라인 편집 일괄 저장
export async function PATCH(req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.email) {
      return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 });
    }

    const sheetType = (req.nextUrl.searchParams.get('sheetType') ?? 'main') as BudgetType;
    const SPREADSHEET_ID = await getSpreadsheetId(sheetType);

    const body = await req.json() as {
      updates: { rowIndex: number; field: string; value: string | number }[];
    };

    const { updates } = body;
    if (!updates || updates.length === 0) {
      return NextResponse.json({ message: '변경 사항이 없습니다.' });
    }

    // 아래 필드는 로그인 사용자 누구나 허용 (권한 불필요)
    const NO_PERMISSION_FIELDS = new Set(['additionalReflection', 'additionalReflectionDate', 'isCompleted', 'isOnHold']);
    const isOnlyFreeFields = updates.every((u) => NO_PERMISSION_FIELDS.has(u.field));
    if (!isOnlyFreeFields) {
      const hasPermission = await checkPermission(session.user.email, PERMISSIONS.DASHBOARD_WRITE);
      if (!hasPermission) {
        return NextResponse.json({ error: '권한이 없습니다.' }, { status: 403 });
      }
    }

    const sheets = getSheetsClient();

    // additionalReflectionDate는 RAW로 저장 (USER_ENTERED 시 Sheets가 날짜 시리얼로 변환)
    const RAW_FIELDS = new Set(['additionalReflectionDate']);

    const rawData = updates
      .filter(({ field }) => field in FIELD_COLUMN && RAW_FIELDS.has(field))
      .map(({ rowIndex, field, value }) => ({
        range: `${SHEET}!${FIELD_COLUMN[field]}${rowIndex}`,
        values: [[value]],
      }));

    const normalData = updates
      .filter(({ field }) => field in FIELD_COLUMN && !RAW_FIELDS.has(field))
      .map(({ rowIndex, field, value }) => ({
        range: `${SHEET}!${FIELD_COLUMN[field]}${rowIndex}`,
        values: [[value]],
      }));

    await Promise.all([
      rawData.length > 0 && sheets.spreadsheets.values.batchUpdate({
        spreadsheetId: SPREADSHEET_ID,
        requestBody: { valueInputOption: 'RAW', data: rawData },
      }),
      normalData.length > 0 && sheets.spreadsheets.values.batchUpdate({
        spreadsheetId: SPREADSHEET_ID,
        requestBody: { valueInputOption: 'USER_ENTERED', data: normalData },
      }),
    ]);

    return NextResponse.json({ message: `${rawData.length + normalData.length}개 셀이 수정되었습니다.` });
  } catch (error) {
    console.error('Program PATCH error:', error);
    return NextResponse.json({ error: '수정 중 오류가 발생했습니다.' }, { status: 500 });
  }
}

// 프로그램 행 삭제 (행 내용 비우기)
export async function DELETE(req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.email) {
      return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 });
    }

    const hasPermission = await checkPermission(
      session.user.email,
      PERMISSIONS.DASHBOARD_WRITE,
    );
    if (!hasPermission) {
      return NextResponse.json({ error: '권한이 없습니다.' }, { status: 403 });
    }

    const sheetType = (req.nextUrl.searchParams.get('sheetType') ?? 'main') as BudgetType;
    const SPREADSHEET_ID = await getSpreadsheetId(sheetType);

    const { rowIndex } = await req.json() as { rowIndex: number };

    const sheets = getSheetsClient();

    // 행 내용 초기화
    await sheets.spreadsheets.values.clear({
      spreadsheetId: SPREADSHEET_ID,
      range: `${SHEET}!A${rowIndex}:Q${rowIndex}`,
    });

    return NextResponse.json({ message: '삭제되었습니다.' });
  } catch (error) {
    console.error('Program DELETE error:', error);
    return NextResponse.json({ error: '삭제 중 오류가 발생했습니다.' }, { status: 500 });
  }
}

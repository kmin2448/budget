// app/api/sheets/expenditure/[category]/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getSheetsClient, readNamedRange, getCategoryDropdown } from '@/lib/google/sheets';
import {
  CATEGORY_SHEETS,
  CATEGORY_DROP_MAP,
  CATEGORY_ALLOCATION_MAP,
  CATEGORY_DATA_START_ROW,
  CATEGORY_DATA_END_ROW_MAP,
  PERSONNEL_CATEGORY,
} from '@/constants/sheets';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { serialToDateString, calcBudgetInfo } from '@/lib/expenditure-utils';
import { checkPermission } from '@/lib/permissions';
import { PERMISSIONS } from '@/types';
import { getSpreadsheetId } from '@/lib/google/getSheetId';
import type { ExpenditureDetailRow, ExpenditurePageData, BudgetType, MergeSubItem } from '@/types';

function isCategorySheet(val: string): val is typeof CATEGORY_SHEETS[number] {
  return (CATEGORY_SHEETS as readonly string[]).includes(val);
}

// 본예산: 12개월(3월~2월), 이월예산: 4개월(3월~6월)
function getMonthCount(sheetType: BudgetType) {
  return sheetType === 'carryover' ? 4 : 12;
}

// 인건비 끝 열: 본예산=M(A+12), 이월예산=E(A+4)
function getPersonnelEndCol(monthCount: number) {
  return String.fromCharCode('A'.charCodeAt(0) + monthCount); // 12→M, 4→E
}

// 일반 비목 끝 열: 본예산=T(I+11), 이월예산=L(I+3)
function getGeneralEndCol(monthCount: number) {
  return String.fromCharCode('A'.charCodeAt(0) + 8 + monthCount - 1); // 12→T, 4→L
}

// ── 인건비 전용 파싱/쓰기 ────────────────────────────────────────
function buildPersonnelWriteValues(
  body: { programName: string; monthlyAmounts: number[] },
  monthCount: number,
): (string | number)[] {
  return [
    body.programName,
    ...Array.from({ length: monthCount }, (_, i) => body.monthlyAmounts[i] ?? 0),
  ];
}

function buildPersonnelRowValues(
  raw: (string | number | null)[],
  monthCount: number,
): { programName: string; expenseDate: string; description: string; monthlyAmounts: number[]; totalAmount: number } {
  const programName = String(raw[0] ?? '').trim();
  // monthlyAmounts는 항상 length 12로 반환 (UI 호환성 유지, 이월예산은 0-3만 채워짐)
  const monthlyAmounts: number[] = Array.from({ length: 12 }, (_, i) =>
    i < monthCount ? Number(raw[1 + i] ?? 0) : 0,
  );
  const totalAmount = monthlyAmounts.reduce((s, v) => s + v, 0);
  return { programName, expenseDate: '', description: '', monthlyAmounts, totalAmount };
}

// ── 일반 비목 파싱/쓰기 ──────────────────────────────────────────
function buildWriteValues(
  body: { programName: string; expenseDate: string; description: string; monthlyAmounts: number[] },
  monthCount: number,
): (string | number)[] {
  return [
    body.programName,
    body.expenseDate || '',
    body.description,
    '', '', '', '', '',                                                    // D~H: 병합셀 빈칸
    ...Array.from({ length: monthCount }, (_, i) => body.monthlyAmounts[i] ?? 0),
  ];
}

function buildRowValues(
  raw: (string | number | null)[],
  monthCount: number,
): { programName: string; expenseDate: string; description: string; monthlyAmounts: number[]; totalAmount: number } {
  const programName = String(raw[0] ?? '').trim();
  const expenseDate = serialToDateString(raw[1]);
  const description = String(raw[2] ?? '').trim();
  // monthlyAmounts는 항상 length 12로 반환 (이월예산은 0-3만 채워짐)
  const monthlyAmounts: number[] = Array.from({ length: 12 }, (_, i) =>
    i < monthCount ? Number(raw[8 + i] ?? 0) : 0,
  );
  const totalAmount = monthlyAmounts.reduce((s, v) => s + v, 0);
  return { programName, expenseDate, description, monthlyAmounts, totalAmount };
}

export async function GET(
  req: NextRequest,
  { params }: { params: { category: string } },
) {
  try {
    const session = await auth();
    if (!session) {
      return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 });
    }

    const category = decodeURIComponent(params.category);
    if (!isCategorySheet(category)) {
      return NextResponse.json({ error: '유효하지 않은 비목입니다.' }, { status: 400 });
    }

    const sheetType = (req.nextUrl.searchParams.get('sheetType') ?? 'main') as BudgetType;
    const SPREADSHEET_ID = await getSpreadsheetId(sheetType);
    const sheets = getSheetsClient();
    const supabase = createServerSupabaseClient();

    const isPersonnel = category === PERSONNEL_CATEGORY;
    const monthCount = getMonthCount(sheetType);
    const endCol = isPersonnel
      ? getPersonnelEndCol(monthCount)
      : getGeneralEndCol(monthCount);
    const readRange = `'${category}'!A${CATEGORY_DATA_START_ROW}:${endCol}${CATEGORY_DATA_END_ROW_MAP[category]}`;

    const [rowsRes, allocationRes, b1Res, dropOptions, fileRecordsRes, mergeRecordsRes] = await Promise.all([
      sheets.spreadsheets.values.get({
        spreadsheetId: SPREADSHEET_ID,
        range: readRange,
        valueRenderOption: 'UNFORMATTED_VALUE',
      }),
      // Named Range가 없는 시트(이월예산 등)에서도 빈 배열로 폴백
      readNamedRange(CATEGORY_ALLOCATION_MAP[category], SPREADSHEET_ID).catch(() => [] as (string | number | null)[][]),
      // 이월예산 등 Named Range 미설정 시 각 비목 시트 B1에서 배정예산 직접 읽기
      sheets.spreadsheets.values.get({
        spreadsheetId: SPREADSHEET_ID,
        range: `'${category}'!B1`,
        valueRenderOption: 'UNFORMATTED_VALUE',
      }).catch(() => ({ data: { values: undefined } })),
      isPersonnel
        ? Promise.resolve([])
        : getCategoryDropdown(CATEGORY_DROP_MAP[category], SPREADSHEET_ID).catch(() => [] as string[]),
      supabase
        .from('expenditure_files')
        .select('row_index, month_index, drive_file_id, drive_url')
        .eq('sheet_name', category),
      supabase
        .from('expenditure_merges')
        .select('id, merged_row_index, sub_items')
        .eq('sheet_name', category)
        .eq('budget_type', sheetType),
    ]);

    const namedAllocation = Number(allocationRes[0]?.[0] ?? 0);
    const b1Allocation = Number(b1Res.data.values?.[0]?.[0] ?? 0);
    const allocation = namedAllocation || b1Allocation;
    const rawRows = (rowsRes.data.values ?? []) as (string | number | null)[][];

    // row-level 파일 맵 (비인건비) + 월별 파일 맵 (인건비)
    const fileRecords = (fileRecordsRes as {
      data: { row_index: number; month_index: number | null; drive_file_id: string; drive_url: string }[] | null;
    }).data ?? [];

    const fileMap = new Map<number, { fileId: string; fileUrl: string }>();
    const monthFilesMap = new Map<number, { monthIndex: number; fileId: string; fileUrl: string }[]>();

    for (const f of fileRecords) {
      if (f.month_index !== null && f.month_index !== undefined) {
        const arr = monthFilesMap.get(f.row_index) ?? [];
        arr.push({ monthIndex: f.month_index, fileId: f.drive_file_id, fileUrl: f.drive_url });
        monthFilesMap.set(f.row_index, arr);
      } else {
        fileMap.set(f.row_index, { fileId: f.drive_file_id, fileUrl: f.drive_url });
      }
    }

    const mergeMap = new Map(
      ((mergeRecordsRes as { data: { id: string; merged_row_index: number; sub_items: MergeSubItem[] }[] | null }).data ?? []).map(
        (m) => [m.merged_row_index, { id: m.id, subItems: m.sub_items }],
      ),
    );

    const rows: ExpenditureDetailRow[] = rawRows
      .map((raw, idx) => {
        const rowIndex = CATEGORY_DATA_START_ROW + idx;
        const { programName, expenseDate, description, monthlyAmounts, totalAmount } = isPersonnel
          ? buildPersonnelRowValues(raw, monthCount)
          : buildRowValues(raw, monthCount);
        const fileInfo = fileMap.get(rowIndex);
        const monthFiles = monthFilesMap.get(rowIndex);
        return {
          rowIndex,
          programName,
          expenseDate,
          description,
          monthlyAmounts,
          totalAmount,
          // 인건비는 날짜 개념 없음 → 금액이 있으면 집행완료
          status: isPersonnel
            ? (totalAmount > 0 ? 'complete' : 'planned') as 'complete' | 'planned'
            : (expenseDate ? 'complete' : 'planned') as 'complete' | 'planned',
          hasFile: isPersonnel ? (monthFiles?.length ?? 0) > 0 : !!fileInfo,
          fileUrl: isPersonnel ? undefined : fileInfo?.fileUrl,
          fileId: isPersonnel ? undefined : fileInfo?.fileId,
          mergeInfo: mergeMap.get(rowIndex) ?? null,
          monthFiles: isPersonnel ? (monthFiles ?? []) : undefined,
        };
      })
      .filter((r) => r.programName || r.description || r.totalAmount > 0);

    const budgetInfo = calcBudgetInfo(rows, allocation);
    const data: ExpenditurePageData = { rows, budgetInfo, dropdownOptions: dropOptions };
    return NextResponse.json(data);
  } catch (error) {
    console.error('Expenditure GET error:', error);
    return NextResponse.json({ error: '데이터 조회 중 오류가 발생했습니다.' }, { status: 500 });
  }
}

// POST: 새 집행내역 행 추가
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

    const sheetType = (req.nextUrl.searchParams.get('sheetType') ?? 'main') as BudgetType;
    const SPREADSHEET_ID = await getSpreadsheetId(sheetType);

    const body = await req.json() as {
      programName: string;
      expenseDate: string;
      description: string;
      monthlyAmounts: number[];
    };

    const sheets = getSheetsClient();

    // A열에서 마지막 데이터 행 탐색
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

    const isPersonnel = category === PERSONNEL_CATEGORY;
    const monthCount = getMonthCount(sheetType);
    const rowValues = isPersonnel
      ? buildPersonnelWriteValues(body, monthCount)
      : buildWriteValues(body, monthCount);
    const endCol = isPersonnel ? getPersonnelEndCol(monthCount) : getGeneralEndCol(monthCount);
    await sheets.spreadsheets.values.update({
      spreadsheetId: SPREADSHEET_ID,
      range: `'${category}'!A${newRowIndex}:${endCol}${newRowIndex}`,
      valueInputOption: 'USER_ENTERED',
      requestBody: { values: [rowValues] },
    });

    return NextResponse.json({ rowIndex: newRowIndex, message: '집행내역이 추가되었습니다.' });
  } catch (error) {
    console.error('Expenditure POST error:', error);
    return NextResponse.json({ error: '추가 중 오류가 발생했습니다.' }, { status: 500 });
  }
}

// PUT: 집행내역 행 수정
export async function PUT(
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

    const sheetType = (req.nextUrl.searchParams.get('sheetType') ?? 'main') as BudgetType;
    const SPREADSHEET_ID = await getSpreadsheetId(sheetType);

    const body = await req.json() as {
      rowIndex: number;
      programName: string;
      expenseDate: string;
      description: string;
      monthlyAmounts: number[];
    };

    const sheets = getSheetsClient();
    const isPersonnel = category === PERSONNEL_CATEGORY;
    const monthCount = getMonthCount(sheetType);
    const rowValues = isPersonnel
      ? buildPersonnelWriteValues(body, monthCount)
      : buildWriteValues(body, monthCount);
    const endCol = isPersonnel ? getPersonnelEndCol(monthCount) : getGeneralEndCol(monthCount);
    await sheets.spreadsheets.values.update({
      spreadsheetId: SPREADSHEET_ID,
      range: `'${category}'!A${body.rowIndex}:${endCol}${body.rowIndex}`,
      valueInputOption: 'USER_ENTERED',
      requestBody: { values: [rowValues] },
    });

    return NextResponse.json({ message: '수정되었습니다.' });
  } catch (error) {
    console.error('Expenditure PUT error:', error);
    return NextResponse.json({ error: '수정 중 오류가 발생했습니다.' }, { status: 500 });
  }
}

// DELETE: 집행내역 행 초기화 + WE-Meet 보내기 배치 자동 취소
export async function DELETE(
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

    const sheetType = (req.nextUrl.searchParams.get('sheetType') ?? 'main') as BudgetType;
    const SPREADSHEET_ID = await getSpreadsheetId(sheetType);

    const { rowIndex } = await req.json() as { rowIndex: number };
    const sheets = getSheetsClient();
    const monthCount = getMonthCount(sheetType);
    const isPersonnel = category === PERSONNEL_CATEGORY;
    const endCol = isPersonnel ? getPersonnelEndCol(monthCount) : getGeneralEndCol(monthCount);

    // 1. 집행내역 시트 행 초기화
    await sheets.spreadsheets.values.clear({
      spreadsheetId: SPREADSHEET_ID,
      range: `'${category}'!A${rowIndex}:${endCol}${rowIndex}`,
    });

    // 2. 동일 행에 연결된 WE-Meet 보내기 배치 자동 취소
    try {
      const { unmarkWeMeetExecutionsSent } = await import('@/lib/google/wemeet-sheets');
      const supabase = createServerSupabaseClient();
      const { data: batches } = await supabase
        .from('wemeet_send_batches')
        .select('id, wemeet_row_indexes')
        .eq('category', category)
        .eq('budget_type', sheetType)
        .eq('expenditure_row_index', rowIndex);

      if (batches && batches.length > 0) {
        const allRowIndexes = Array.from(new Set(batches.flatMap((b) => b.wemeet_row_indexes as number[])));
        await unmarkWeMeetExecutionsSent(allRowIndexes);
        await supabase
          .from('wemeet_send_batches')
          .delete()
          .eq('category', category)
          .eq('budget_type', sheetType)
          .eq('expenditure_row_index', rowIndex);
      }
    } catch {
      // 배치 취소 실패는 무시 (집행내역 삭제는 이미 완료)
    }

    return NextResponse.json({ message: '삭제되었습니다.' });
  } catch (error) {
    console.error('Expenditure DELETE error:', error);
    return NextResponse.json({ error: '삭제 중 오류가 발생했습니다.' }, { status: 500 });
  }
}

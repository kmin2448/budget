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
import type { ExpenditureDetailRow, ExpenditurePageData } from '@/types';

const SPREADSHEET_ID = process.env.GOOGLE_SHEETS_ID!;

function isCategorySheet(val: string): val is typeof CATEGORY_SHEETS[number] {
  return (CATEGORY_SHEETS as readonly string[]).includes(val);
}

// ── 인건비 전용 파싱/쓰기 ────────────────────────────────────────
// 인건비: A=내용, B~M=3월~2월 (12개월)
function buildPersonnelWriteValues(body: {
  programName: string; // 내용 (A열)
  monthlyAmounts: number[];
}): (string | number)[] {
  return [
    body.programName,                                                        // A: 내용
    ...Array.from({ length: 12 }, (_, i) => body.monthlyAmounts[i] ?? 0),   // B~M: 3월~2월
  ];
}

function buildPersonnelRowValues(raw: (string | number | null)[]): {
  programName: string;
  expenseDate: string;
  description: string;
  monthlyAmounts: number[];
  totalAmount: number;
} {
  const programName = String(raw[0] ?? '').trim();
  const monthlyAmounts: number[] = Array.from({ length: 12 }, (_, i) =>
    Number(raw[1 + i] ?? 0),
  );
  const totalAmount = monthlyAmounts.reduce((s, v) => s + v, 0);
  return { programName, expenseDate: '', description: '', monthlyAmounts, totalAmount };
}

// ── 일반 비목 파싱/쓰기 ──────────────────────────────────────────
// A=구분, B=지출일자, C~H=지출건명(병합), I~T=3월~2월
function buildWriteValues(body: {
  programName: string;
  expenseDate: string;
  description: string;
  monthlyAmounts: number[];
}): (string | number)[] {
  return [
    body.programName,                                    // A: 구분
    body.expenseDate || '',                             // B: 지출일자
    body.description,                                   // C: 지출건명 (병합셀 C:H)
    '', '', '', '', '',                                 // D~H: 병합셀 빈칸
    ...Array.from({ length: 12 }, (_, i) => body.monthlyAmounts[i] ?? 0), // I~T: 월별금액
  ];
}

function buildRowValues(raw: (string | number | null)[]): {
  programName: string;
  expenseDate: string;
  description: string;
  monthlyAmounts: number[];
  totalAmount: number;
} {
  const programName = String(raw[0] ?? '').trim();
  const expenseDate = serialToDateString(raw[1]);
  const description = String(raw[2] ?? '').trim();
  const monthlyAmounts: number[] = Array.from({ length: 12 }, (_, i) =>
    Number(raw[8 + i] ?? 0),
  );
  const totalAmount = monthlyAmounts.reduce((s, v) => s + v, 0);
  return { programName, expenseDate, description, monthlyAmounts, totalAmount };
}

export async function GET(
  _req: NextRequest,
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

    const sheets = getSheetsClient();
    const supabase = createServerSupabaseClient();

    const isPersonnel = category === PERSONNEL_CATEGORY;
    // 인건비: A~M열(13열), 일반: A~T열(20열)
    const readRange = isPersonnel
      ? `'${category}'!A${CATEGORY_DATA_START_ROW}:M${CATEGORY_DATA_END_ROW_MAP[category]}`
      : `'${category}'!A${CATEGORY_DATA_START_ROW}:T${CATEGORY_DATA_END_ROW_MAP[category]}`;

    const [rowsRes, allocationRes, dropOptions, fileRecordsRes] = await Promise.all([
      sheets.spreadsheets.values.get({
        spreadsheetId: SPREADSHEET_ID,
        range: readRange,
        valueRenderOption: 'UNFORMATTED_VALUE',
      }),
      readNamedRange(CATEGORY_ALLOCATION_MAP[category]),
      isPersonnel ? Promise.resolve([]) : getCategoryDropdown(CATEGORY_DROP_MAP[category]),
      isPersonnel
        ? Promise.resolve({ data: [] })
        : supabase
            .from('expenditure_files')
            .select('row_index, drive_file_id, drive_url')
            .eq('sheet_name', category),
    ]);

    const allocation = Number(allocationRes[0]?.[0] ?? 0);
    const rawRows = (rowsRes.data.values ?? []) as (string | number | null)[][];

    const fileMap = new Map(
      ((fileRecordsRes as { data: { row_index: number; drive_file_id: string; drive_url: string }[] | null }).data ?? []).map((f) => [
        f.row_index,
        { fileId: f.drive_file_id, fileUrl: f.drive_url },
      ]),
    );

    const rows: ExpenditureDetailRow[] = rawRows
      .map((raw, idx) => {
        const rowIndex = CATEGORY_DATA_START_ROW + idx;
        const { programName, expenseDate, description, monthlyAmounts, totalAmount } = isPersonnel
          ? buildPersonnelRowValues(raw)
          : buildRowValues(raw);
        const fileInfo = fileMap.get(rowIndex);
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
          hasFile: !!fileInfo,
          fileUrl: fileInfo?.fileUrl,
          fileId: fileInfo?.fileId,
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
    const rowValues = isPersonnel ? buildPersonnelWriteValues(body) : buildWriteValues(body);
    // 인건비: A~M(13열), 일반: A~T(20열)
    const endCol = isPersonnel ? 'M' : 'T';
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

    const body = await req.json() as {
      rowIndex: number;
      programName: string;
      expenseDate: string;
      description: string;
      monthlyAmounts: number[];
    };

    const sheets = getSheetsClient();
    const isPersonnel = category === PERSONNEL_CATEGORY;
    const rowValues = isPersonnel ? buildPersonnelWriteValues(body) : buildWriteValues(body);
    const endCol = isPersonnel ? 'M' : 'T';
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

// DELETE: 집행내역 행 초기화
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

    const { rowIndex } = await req.json() as { rowIndex: number };
    const sheets = getSheetsClient();
    const endCol = category === PERSONNEL_CATEGORY ? 'M' : 'T';
    await sheets.spreadsheets.values.clear({
      spreadsheetId: SPREADSHEET_ID,
      range: `'${category}'!A${rowIndex}:${endCol}${rowIndex}`,
    });

    return NextResponse.json({ message: '삭제되었습니다.' });
  } catch (error) {
    console.error('Expenditure DELETE error:', error);
    return NextResponse.json({ error: '삭제 중 오류가 발생했습니다.' }, { status: 500 });
  }
}

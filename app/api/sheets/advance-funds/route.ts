// app/api/sheets/advance-funds/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getSheetsClient } from '@/lib/google/sheets';
import { PERMISSIONS } from '@/types';
import { checkPermission } from '@/lib/permissions';

export const dynamic = 'force-dynamic';

const SPREADSHEET_ID = process.env.GOOGLE_SHEETS_ID!;
const SHEET = "'선지원금 현황'";
const DATA_START_ROW = 3;
const MAX_ROW = 100;

type ItemRow = { rowIndex: number; label: string; amount: number };

export async function GET() {
  try {
    const session = await auth();
    if (!session?.user?.email) {
      return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 });
    }

    const sheets = getSheetsClient();
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: `${SHEET}!A1:F${MAX_ROW}`,
      valueRenderOption: 'UNFORMATTED_VALUE',
    });

    const values = (res.data.values ?? []) as (string | number | null)[][];

    // 요약: B1, D1, F1
    const totalIncome  = Number(values[0]?.[1] ?? 0); // B1
    const totalExpense = Number(values[0]?.[3] ?? 0); // D1
    const balance      = Number(values[0]?.[5] ?? 0); // F1

    const incomeItems:  ItemRow[] = [];
    const expenseItems: ItemRow[] = [];

    for (let i = DATA_START_ROW - 1; i < values.length; i++) {
      const row = values[i];
      if (!row) continue;
      const rowIndex = i + 1; // 1-based

      const incomeLabel  = String(row[0] ?? '').trim(); // A
      const incomeAmount = Number(row[1] ?? 0);         // B
      if (incomeLabel || incomeAmount) {
        incomeItems.push({ rowIndex, label: incomeLabel, amount: incomeAmount });
      }

      const expenseLabel  = String(row[2] ?? '').trim(); // C
      const expenseAmount = Number(row[3] ?? 0);         // D
      if (expenseLabel || expenseAmount) {
        expenseItems.push({ rowIndex, label: expenseLabel, amount: expenseAmount });
      }
    }

    return NextResponse.json({ summary: { totalIncome, totalExpense, balance }, incomeItems, expenseItems });
  } catch (err) {
    console.error('[advance-funds GET]', err);
    return NextResponse.json({ error: '데이터 조회 실패' }, { status: 500 });
  }
}

// POST: 수입 또는 지출 항목 추가
export async function POST(req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.email) {
      return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 });
    }
    const hasPermission = await checkPermission(session.user.email, PERMISSIONS.ADVANCE_WRITE);
    if (!hasPermission) {
      return NextResponse.json({ error: '선지원금 관리 권한이 없습니다.' }, { status: 403 });
    }

    const body = (await req.json()) as { type: 'income' | 'expense'; label: string; amount: number };
    const sheets = getSheetsClient();

    // 해당 열에서 마지막 데이터 행 탐색
    const colRange = body.type === 'income'
      ? `${SHEET}!A${DATA_START_ROW}:A${MAX_ROW}`
      : `${SHEET}!C${DATA_START_ROW}:C${MAX_ROW}`;

    const colRes = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: colRange,
      valueRenderOption: 'UNFORMATTED_VALUE',
    });
    const colValues = (colRes.data.values ?? []) as (string | null)[][];
    let lastIdx = -1;
    for (let i = 0; i < colValues.length; i++) {
      if (String(colValues[i]?.[0] ?? '').trim()) lastIdx = i;
    }
    const newRowIndex = DATA_START_ROW + lastIdx + 1;

    if (body.type === 'income') {
      await sheets.spreadsheets.values.update({
        spreadsheetId: SPREADSHEET_ID,
        range: `${SHEET}!A${newRowIndex}:B${newRowIndex}`,
        valueInputOption: 'USER_ENTERED',
        requestBody: { values: [[body.label, body.amount]] },
      });
    } else {
      await sheets.spreadsheets.values.update({
        spreadsheetId: SPREADSHEET_ID,
        range: `${SHEET}!C${newRowIndex}:D${newRowIndex}`,
        valueInputOption: 'USER_ENTERED',
        requestBody: { values: [[body.label, body.amount]] },
      });
    }

    return NextResponse.json({ rowIndex: newRowIndex });
  } catch (err) {
    console.error('[advance-funds POST]', err);
    return NextResponse.json({ error: '추가 실패' }, { status: 500 });
  }
}

// PATCH: 항목 수정 (label + amount)
export async function PATCH(req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.email) {
      return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 });
    }
    const hasPermission = await checkPermission(session.user.email, PERMISSIONS.ADVANCE_WRITE);
    if (!hasPermission) {
      return NextResponse.json({ error: '선지원금 관리 권한이 없습니다.' }, { status: 403 });
    }

    const body = (await req.json()) as {
      type: 'income' | 'expense';
      rowIndex: number;
      label: string;
      amount: number;
    };

    if (body.rowIndex < DATA_START_ROW || body.rowIndex > MAX_ROW) {
      return NextResponse.json({ error: '유효하지 않은 행입니다.' }, { status: 400 });
    }

    const sheets = getSheetsClient();
    const range = body.type === 'income'
      ? `${SHEET}!A${body.rowIndex}:B${body.rowIndex}`
      : `${SHEET}!C${body.rowIndex}:D${body.rowIndex}`;

    await sheets.spreadsheets.values.update({
      spreadsheetId: SPREADSHEET_ID,
      range,
      valueInputOption: 'USER_ENTERED',
      requestBody: { values: [[body.label, body.amount]] },
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('[advance-funds PATCH]', err);
    return NextResponse.json({ error: '수정 실패' }, { status: 500 });
  }
}

// DELETE: 항목 삭제 (해당 열만 clear)
export async function DELETE(req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.email) {
      return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 });
    }
    const hasPermission = await checkPermission(session.user.email, PERMISSIONS.ADVANCE_WRITE);
    if (!hasPermission) {
      return NextResponse.json({ error: '선지원금 관리 권한이 없습니다.' }, { status: 403 });
    }

    const body = (await req.json()) as { type: 'income' | 'expense'; rowIndex: number };
    const sheets = getSheetsClient();
    const range = body.type === 'income'
      ? `${SHEET}!A${body.rowIndex}:B${body.rowIndex}`
      : `${SHEET}!C${body.rowIndex}:D${body.rowIndex}`;

    await sheets.spreadsheets.values.clear({
      spreadsheetId: SPREADSHEET_ID,
      range,
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('[advance-funds DELETE]', err);
    return NextResponse.json({ error: '삭제 실패' }, { status: 500 });
  }
}

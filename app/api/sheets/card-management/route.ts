// app/api/sheets/card-management/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getSheetsClient } from '@/lib/google/sheets';
import { checkPermission } from '@/lib/permissions';
import { PERMISSIONS } from '@/types';
import { serialToDateString, serialToTimeString } from '@/lib/expenditure-utils';

export const dynamic = 'force-dynamic';

const SPREADSHEET_ID = process.env.GOOGLE_SHEETS_ID!;
const SHEET = "'카드관리'";
const HEADER_ROW = 7;
const DATA_START_ROW = 8;
const MAX_ROW = 500;

export interface CardEntry {
  rowIndex: number;
  category: string;
  expenseDate: string;
  expenseTime: string;
  description: string;
  merchant: string;
  amount: number;
  note: string;
  user: string;
  cardType: string;
  cardHolder: string; // J열: 선택된 명의자
}

export type CardHolders = Record<string, string[]>;

function parseRow(raw: (string | number | null)[], rowIndex: number): CardEntry | null {
  const category    = String(raw[0] ?? '').trim(); // A
  const expenseDate = serialToDateString(raw[1]);   // B
  const expenseTime = serialToTimeString(raw[2]);   // C
  const description = String(raw[3] ?? '').trim(); // D
  const merchant    = String(raw[4] ?? '').trim(); // E
  const amount      = Number(raw[5] ?? 0);          // F
  const note        = String(raw[6] ?? '').trim(); // G
  const user        = String(raw[7] ?? '').trim(); // H
  const cardType    = String(raw[8] ?? '').trim(); // I
  const cardHolder  = String(raw[9] ?? '').trim(); // J

  if (!category && !expenseDate && !description && amount === 0) return null;
  return { rowIndex, category, expenseDate, expenseTime, description, merchant, amount, note, user, cardType, cardHolder };
}

export async function GET() {
  try {
    const session = await auth();
    if (!session?.user?.email) {
      return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 });
    }

    const sheets = getSheetsClient();
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: `${SHEET}!A${HEADER_ROW}:N${MAX_ROW}`,
      valueRenderOption: 'UNFORMATTED_VALUE',
    });

    const values = (res.data.values ?? []) as (string | number | null)[][];

    // 7행: L/M/N에 카드 구분명
    const headerRaw = values[0] ?? [];
    const typeL = String(headerRaw[11] ?? '').trim() || '산단카드';
    const typeM = String(headerRaw[12] ?? '').trim() || '이월금카드';
    const typeN = String(headerRaw[13] ?? '').trim() || '본예산카드';
    const cardTypes = [typeL, typeM, typeN];

    const entries: CardEntry[] = [];
    const holderL: string[] = [];
    const holderM: string[] = [];
    const holderN: string[] = [];

    // 8행부터 데이터 (index 1+)
    for (let i = 1; i < values.length; i++) {
      const raw = values[i];
      if (!raw) continue;
      const rowIndex = HEADER_ROW + i; // 7 + 1 = 8, 7 + 2 = 9, ...

      const entry = parseRow(raw, rowIndex);
      if (entry) entries.push(entry);

      const l = String(raw[11] ?? '').trim();
      const m = String(raw[12] ?? '').trim();
      const n = String(raw[13] ?? '').trim();
      if (l) holderL.push(l);
      if (m) holderM.push(m);
      if (n) holderN.push(n);
    }

    const cardHolders: CardHolders = {
      [typeL]: holderL,
      [typeM]: holderM,
      [typeN]: holderN,
    };

    return NextResponse.json({ entries, cardHolders, cardTypes });
  } catch (err) {
    console.error('[card-management GET]', err);
    return NextResponse.json({ error: '데이터 조회 실패' }, { status: 500 });
  }
}

// POST: 새 행 추가
export async function POST(req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.email) {
      return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 });
    }
    const hasPermission = await checkPermission(session.user.email, PERMISSIONS.CARD_WRITE);
    if (!hasPermission) {
      return NextResponse.json({ error: '카드관리 편집 권한이 없습니다.' }, { status: 403 });
    }

    const body = (await req.json()) as Omit<CardEntry, 'rowIndex'>;
    const sheets = getSheetsClient();

    // 마지막 데이터 행 탐색 (B열 기준)
    const colRes = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: `${SHEET}!B${DATA_START_ROW}:B${MAX_ROW}`,
      valueRenderOption: 'UNFORMATTED_VALUE',
    });
    const colValues = (colRes.data.values ?? []) as (string | null)[][];
    let lastIdx = -1;
    for (let i = 0; i < colValues.length; i++) {
      if (colValues[i]?.[0] !== null && colValues[i]?.[0] !== undefined && String(colValues[i]?.[0]).trim()) {
        lastIdx = i;
      }
    }
    const newRowIndex = DATA_START_ROW + lastIdx + 1;

    await sheets.spreadsheets.values.update({
      spreadsheetId: SPREADSHEET_ID,
      range: `${SHEET}!A${newRowIndex}:J${newRowIndex}`,
      valueInputOption: 'USER_ENTERED',
      requestBody: {
        values: [[
          body.category,
          body.expenseDate,
          body.expenseTime,
          body.description,
          body.merchant,
          body.amount,
          body.note,
          body.user,
          body.cardType,
          body.cardHolder,
        ]],
      },
    });

    return NextResponse.json({ rowIndex: newRowIndex }, { status: 201 });
  } catch (err) {
    console.error('[card-management POST]', err);
    return NextResponse.json({ error: '추가 실패' }, { status: 500 });
  }
}

// PATCH: 행 수정
export async function PATCH(req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.email) {
      return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 });
    }
    const hasPermission = await checkPermission(session.user.email, PERMISSIONS.CARD_WRITE);
    if (!hasPermission) {
      return NextResponse.json({ error: '카드관리 편집 권한이 없습니다.' }, { status: 403 });
    }

    const body = (await req.json()) as CardEntry;
    if (body.rowIndex < DATA_START_ROW || body.rowIndex > MAX_ROW) {
      return NextResponse.json({ error: '유효하지 않은 행입니다.' }, { status: 400 });
    }

    const sheets = getSheetsClient();
    await sheets.spreadsheets.values.update({
      spreadsheetId: SPREADSHEET_ID,
      range: `${SHEET}!A${body.rowIndex}:J${body.rowIndex}`,
      valueInputOption: 'USER_ENTERED',
      requestBody: {
        values: [[
          body.category,
          body.expenseDate,
          body.expenseTime,
          body.description,
          body.merchant,
          body.amount,
          body.note,
          body.user,
          body.cardType,
          body.cardHolder,
        ]],
      },
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('[card-management PATCH]', err);
    return NextResponse.json({ error: '수정 실패' }, { status: 500 });
  }
}

// DELETE: 행 초기화
export async function DELETE(req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.email) {
      return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 });
    }
    const hasPermission = await checkPermission(session.user.email, PERMISSIONS.CARD_WRITE);
    if (!hasPermission) {
      return NextResponse.json({ error: '카드관리 편집 권한이 없습니다.' }, { status: 403 });
    }

    const body = (await req.json()) as { rowIndex: number };
    const sheets = getSheetsClient();
    await sheets.spreadsheets.values.clear({
      spreadsheetId: SPREADSHEET_ID,
      range: `${SHEET}!A${body.rowIndex}:J${body.rowIndex}`,
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('[card-management DELETE]', err);
    return NextResponse.json({ error: '삭제 실패' }, { status: 500 });
  }
}

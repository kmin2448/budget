// app/api/sheets/card-config/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getSheetsClient } from '@/lib/google/sheets';
import { checkPermission } from '@/lib/permissions';
import { PERMISSIONS } from '@/types';

export const dynamic = 'force-dynamic';

const SPREADSHEET_ID = process.env.GOOGLE_SHEETS_ID!;
const SHEET = "'카드관리'";
const NAME_ROW = 7;       // L7:N7 — 카드 구분명
const HOLDER_START = 8;   // L8:N500 — 명의자 목록
const HOLDER_MAX = 500;

export interface CardConfigCard {
  name: string;
  holders: string[];
}

// PUT: 카드 구성 전체 저장 (이름 3개 + 명의자 목록)
export async function PUT(req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.email) {
      return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 });
    }
    const hasPermission = await checkPermission(session.user.email, PERMISSIONS.CARD_WRITE);
    if (!hasPermission) {
      return NextResponse.json({ error: '카드관리 편집 권한이 없습니다.' }, { status: 403 });
    }

    const { cards } = (await req.json()) as { cards: CardConfigCard[] };
    if (!Array.isArray(cards) || cards.length !== 3) {
      return NextResponse.json({ error: '카드 구성은 3개여야 합니다.' }, { status: 400 });
    }

    const sheets = getSheetsClient();

    // 1. 카드 구분명 업데이트 (L7:N7)
    await sheets.spreadsheets.values.update({
      spreadsheetId: SPREADSHEET_ID,
      range: `${SHEET}!L${NAME_ROW}:N${NAME_ROW}`,
      valueInputOption: 'RAW',
      requestBody: { values: [[cards[0].name, cards[1].name, cards[2].name]] },
    });

    // 2. 기존 명의자 목록 초기화
    await sheets.spreadsheets.values.clear({
      spreadsheetId: SPREADSHEET_ID,
      range: `${SHEET}!L${HOLDER_START}:N${HOLDER_MAX}`,
    });

    // 3. 새 명의자 목록 기록
    const maxLen = Math.max(
      cards[0].holders.length,
      cards[1].holders.length,
      cards[2].holders.length,
    );
    if (maxLen > 0) {
      const rows = Array.from({ length: maxLen }, (_, i) => [
        cards[0].holders[i] ?? '',
        cards[1].holders[i] ?? '',
        cards[2].holders[i] ?? '',
      ]);
      await sheets.spreadsheets.values.update({
        spreadsheetId: SPREADSHEET_ID,
        range: `${SHEET}!L${HOLDER_START}:N${HOLDER_START + maxLen - 1}`,
        valueInputOption: 'RAW',
        requestBody: { values: rows },
      });
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('[card-config PUT]', err);
    return NextResponse.json({ error: '저장 실패' }, { status: 500 });
  }
}

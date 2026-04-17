import { NextResponse } from 'next/server';
import { getSheetsClient } from '@/lib/google/sheets';

const SPREADSHEET_ID = process.env.GOOGLE_SHEETS_ID!;

export async function GET() {
  try {
    const sheets = getSheetsClient();

    // 시트 목록
    const metaRes = await sheets.spreadsheets.get({
      spreadsheetId: SPREADSHEET_ID,
      fields: 'sheets.properties.title,sheets.properties.sheetId',
    });
    const sheetNames = metaRes.data.sheets?.map((s) => s.properties?.title) ?? [];

    // 집행내역 정리 시트 1~10행 원본 데이터
    const rowRes = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: `'집행내역 정리'!A1:R10`,
      valueRenderOption: 'UNFORMATTED_VALUE',
    });

    const rows = rowRes.data.values ?? [];
    // 열 인덱스를 명시적으로 보여주기
    const labeled = rows.map((row, rowIdx) => {
      const obj: Record<string, unknown> = { 행: rowIdx + 1 };
      ['A','B','C','D','E','F','G','H','I','J','K','L','M','N','O','P','Q','R'].forEach((col, i) => {
        obj[col] = row[i] ?? '';
      });
      return obj;
    });

    return NextResponse.json({ sheetNames, rows: labeled });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}

import { NextResponse } from 'next/server';
import { getSheetsClient } from '@/lib/google/sheets';

export const dynamic = 'force-dynamic';

export async function GET() {
  const sheetId = process.env.SMALL_CLUB_SHEETS_ID ?? process.env.GOOGLE_SHEETS_ID ?? '';

  const result: Record<string, unknown> = {
    env: {
      SMALL_CLUB_SHEETS_ID: process.env.SMALL_CLUB_SHEETS_ID ? `설정됨 (${process.env.SMALL_CLUB_SHEETS_ID.slice(0, 8)}...)` : '미설정',
      GOOGLE_SHEETS_ID:     process.env.GOOGLE_SHEETS_ID ? `설정됨 (${process.env.GOOGLE_SHEETS_ID.slice(0, 8)}...)` : '미설정',
      사용중: sheetId ? `${sheetId.slice(0, 8)}...` : '없음',
    },
    sheets: {} as Record<string, string>,
  };

  if (!sheetId) {
    return NextResponse.json({ ...result, error: 'SMALL_CLUB_SHEETS_ID 환경변수가 없습니다.' }, { status: 500 });
  }

  const sheetsToCheck = ['집행현황', '팀별취합', '팀정보'];
  const sheets = getSheetsClient();

  for (const sheetName of sheetsToCheck) {
    try {
      const range = `${sheetName}!A1:A2`;
      const res = await sheets.spreadsheets.values.get({
        spreadsheetId: sheetId,
        range,
        valueRenderOption: 'UNFORMATTED_VALUE',
      });
      (result.sheets as Record<string, string>)[sheetName] = `✅ 접근 성공 (행 수: ${(res.data.values ?? []).length})`;
    } catch (err) {
      (result.sheets as Record<string, string>)[sheetName] = `❌ 실패: ${err instanceof Error ? err.message : String(err)}`;
    }
  }

  // Named Range 확인
  const namedRanges: Record<string, string> = {};
  try {
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId: sheetId,
      range: '사용구분목록',
      valueRenderOption: 'UNFORMATTED_VALUE',
    });
    namedRanges['사용구분목록'] = `✅ 존재 (${(res.data.values ?? []).length}개 값)`;
  } catch {
    namedRanges['사용구분목록'] = '❌ Named Range 없음 (기본값 사용됨: 멘토링/회의비/재료비/학생활동지원비)';
  }
  result.namedRanges = namedRanges;

  return NextResponse.json(result);
}

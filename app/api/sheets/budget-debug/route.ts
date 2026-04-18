// app/api/sheets/budget-debug/route.ts — 예산 Named Range 원본값 진단용 (개발용)
import { NextResponse } from 'next/server';
import { getSheetsClient, readNamedRange } from '@/lib/google/sheets';
import { NAMED_RANGES } from '@/constants/sheets';

const SPREADSHEET_ID = process.env.GOOGLE_SHEETS_ID!;

export async function GET() {
  try {
    const sheets = getSheetsClient();

    // ★취합 세목별 Named Range 원본값
    const [categories, subcategories, subDetails, allocations, adjustments] = await Promise.all([
      readNamedRange(NAMED_RANGES.ENAARA_CATEGORY),
      readNamedRange(NAMED_RANGES.ENAARA_SUBCATEGORY),
      readNamedRange(NAMED_RANGES.ENAARA_DETAIL),
      readNamedRange(NAMED_RANGES.ALLOCATION),
      readNamedRange(NAMED_RANGES.ADJUSTMENT),
    ]);

    // ★취합 행 병합
    const starRows = Array.from({ length: Math.max(categories.length, allocations.length) }, (_, i) => ({
      rowOffset: i,
      이나라비목: String(categories[i]?.[0] ?? ''),
      이나라세목: String(subcategories[i]?.[0] ?? ''),
      이나라보조세목: String(subDetails[i]?.[0] ?? ''),
      편성액: Number(allocations[i]?.[0] ?? 0),
      증감액: Number(adjustments[i]?.[0] ?? 0),
    }));

    // 집행내역 정리 C, D, O, P열 원본값 (처음 30행)
    const execRes = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: `'집행내역 정리'!A6:P36`,
      valueRenderOption: 'UNFORMATTED_VALUE',
    });
    const execRows = (execRes.data.values ?? []).map((row, i) => ({
      행: i + 6,
      A: row[0] ?? '',
      B: row[1] ?? '',
      C_비목: row[2] ?? '',
      D_보조비목: row[3] ?? '',
      E_보조세목: row[4] ?? '',
      O_집행완료: row[14] ?? '',
      P_집행예정: row[15] ?? '',
    }));

    // 비목별 편성액 Named Range 개별 확인
    const categoryAllocNames: Record<string, string> = {
      인건비: NAMED_RANGES.PERSONNEL_ALLOCATION,
      장학금: NAMED_RANGES.SCHOLARSHIP_ALLOCATION,
      교육연구프로그램개발운영비: NAMED_RANGES.EDU_PROGRAM_ALLOCATION,
      교육연구환경개선비: NAMED_RANGES.EDU_ENV_ALLOCATION,
      실험실습장비및기자재구입운영비: NAMED_RANGES.LAB_EQUIPMENT_ALLOCATION,
      기업지원협력활동비: NAMED_RANGES.CORPORATE_ALLOCATION,
      지역연계협업지원비: NAMED_RANGES.REGIONAL_ALLOCATION,
      성과활용확산지원비: NAMED_RANGES.PERFORMANCE_ALLOCATION,
      그밖의사업운영경비: NAMED_RANGES.OTHER_ALLOCATION,
    };
    const categoryAllocResults = await Promise.all(
      Object.entries(categoryAllocNames).map(async ([cat, rangeName]) => {
        const val = await readNamedRange(rangeName);
        return { 비목: cat, Named_Range: rangeName, 값: Number(val[0]?.[0] ?? 0) };
      }),
    );

    return NextResponse.json({
      취합_세목행: starRows,
      집행내역_정리_앞30행: execRows,
      비목별_편성액: categoryAllocResults,
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

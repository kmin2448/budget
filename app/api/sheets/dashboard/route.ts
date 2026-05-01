import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getSheetsClient } from '@/lib/google/sheets';
import { getSpreadsheetId } from '@/lib/google/getSheetId';
import { calcExecutionRate } from '@/lib/utils';
import type { BudgetType } from '@/types';

export const dynamic = 'force-dynamic';

// Google Sheets 날짜 시리얼 → YYYY-MM-DD 변환
function sheetsSerialToDateStr(raw: unknown): string {
  if (typeof raw === 'number') {
    const msPerDay = 24 * 60 * 60 * 1000;
    const epoch = new Date(1899, 11, 30).getTime();
    return new Date(epoch + raw * msPerDay).toISOString().slice(0, 10);
  }
  return String(raw ?? '').trim();
}

const SHEET = "'집행내역 정리'";

export async function GET(req: NextRequest) {
  try {
    const session = await auth();
    if (!session) {
      return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 });
    }

    const sheetType = (req.nextUrl.searchParams.get('sheetType') ?? 'main') as BudgetType;
    const SPREADSHEET_ID = await getSpreadsheetId(sheetType);
    const sheets = getSheetsClient();

    // 요약 행 읽기
    const [summaryRes, rowsRes] = await Promise.all([
      sheets.spreadsheets.values.batchGet({
        spreadsheetId: SPREADSHEET_ID,
        ranges: [
          `${SHEET}!H2`,   // 총예산 (간접비 포함)
          `${SHEET}!J2`,   // 본예산 (간접비 제외)
          `${SHEET}!I2`,   // 간접비
          `${SHEET}!L2`,   // 계획수립예산
          `${SHEET}!L5`,   // 예산계획 합계
          `${SHEET}!P5`,   // 집행완료 합계 (M열 추가로 O→P)
          `${SHEET}!Q5`,   // 집행예정 합계 (M열 추가로 P→Q)
          `${SHEET}!O5`,   // 잔액 합계 (M열 추가로 N→O)
        ],
        valueRenderOption: 'UNFORMATTED_VALUE',
      }),
      // 프로그램 행: A~V열, 6행~500행 (M열 추가로 U→V)
      sheets.spreadsheets.values.get({
        spreadsheetId: SPREADSHEET_ID,
        range: `${SHEET}!A6:V500`,
        valueRenderOption: 'UNFORMATTED_VALUE',
      }),
    ]);

    const valueRanges = summaryRes.data.valueRanges ?? [];
    const totalBudget       = Number(valueRanges[0]?.values?.[0]?.[0] ?? 0); // H2: 총예산(간접비포함)
    const mainBudget        = Number(valueRanges[1]?.values?.[0]?.[0] ?? 0); // J2: 본예산(간접비제외)
    const indirectCost      = Number(valueRanges[2]?.values?.[0]?.[0] ?? 0); // I2: 간접비
    const budgetPlanTarget  = Number(valueRanges[3]?.values?.[0]?.[0] ?? 0); // L2: 계획수립예산
    const budgetPlan        = Number(valueRanges[4]?.values?.[0]?.[0] ?? 0); // L5: 예산계획 합계
    const executionComplete = Number(valueRanges[5]?.values?.[0]?.[0] ?? 0); // O5: 집행완료 합계
    const executionPlanned  = Number(valueRanges[6]?.values?.[0]?.[0] ?? 0); // P5: 집행예정 합계
    const balance           = Number(valueRanges[7]?.values?.[0]?.[0] ?? 0); // N5: 잔액(예산계획 기준)

    const totalExecution = executionComplete + executionPlanned + indirectCost;
    const mainBudgetBalance = totalBudget - totalExecution;
    const mainBudgetExecutionRate = totalBudget > 0
      ? Math.round((totalExecution / totalBudget) * 1000) / 10
      : 0;

    const summary = {
      totalBudget,
      mainBudget,
      indirectCost,
      budgetPlanTarget,
      budgetPlan,
      executionComplete,
      executionPlanned,
      balance,
      mainBudgetBalance,
      mainBudgetExecutionRate,
      executionRate: calcExecutionRate(executionComplete, executionPlanned, budgetPlan),
    };

    // 프로그램 행 파싱
    // A: 구분(대분류), B: 프로그램명, C: 비목, D: 보조비목, E: 보조세목
    // H: 구분코드, L: 예산계획, M: 편성(공식)예산, N: 예산현액, O: 잔액, P: 집행완료, Q: 집행예정, R: 선지원금
    const SENTINEL = '새로운 집행 내역 작성시 이 행 위로 작성';
    const allRows = rowsRes.data.values ?? [];
    // sentinel 텍스트가 포함된 행 인덱스를 찾아 그 이전 행까지만 사용
    const sentinelIdx = allRows.findIndex((row) =>
      row.some((cell) => String(cell ?? '').includes(SENTINEL)),
    );
    const rawRows = sentinelIdx === -1 ? allRows : allRows.slice(0, sentinelIdx);
    const programRows = rawRows
      .map((row, idx) => {
        const divisionCode = String(row[0] ?? '').trim();   // A: 코드
        const category    = String(row[1] ?? '').trim();    // B: 구분
        const budget      = String(row[2] ?? '').trim();    // C: 비목
        const subCategory = String(row[3] ?? '').trim();    // D: 보조비목(세목)
        const subDetail   = String(row[4] ?? '').trim();    // E: 보조세목
        const professor   = String(row[5] ?? '').trim();    // F: 소관
        const programName = String(row[7] ?? '').trim();    // H: 프로그램명
        const note        = String(row[8] ?? '').trim();    // I: 비고
        const teacher     = String(row[9] ?? '').trim();    // J: 담당교원
        const staff       = String(row[10] ?? '').trim();   // K: 담당직원
        const budgetPlanRow  = Number(row[11] ?? 0);        // L: 예산계획
        const officialBudget = Number(row[12] ?? 0);        // M: 편성(공식)예산 (신규)
        const execComplete   = Number(row[15] ?? 0);        // P: 집행완료 (M열 추가로 O→P)
        const execPlanned    = Number(row[16] ?? 0);        // Q: 집행예정 (M열 추가로 P→Q)
        const advanceFunds   = Number(row[17] ?? 0);        // R: 선지원금 (M열 추가로 Q→R)
        const additionalReflection     = String(row[18] ?? '').trim(); // S: 추가 반영사항
        const additionalReflectionDate = sheetsSerialToDateStr(row[19]);         // T: 작성일
        const isCompleted = row[20] === true || String(row[20] ?? '').toUpperCase() === 'TRUE'; // U: 완료여부
        const isOnHold    = row[21] === true || String(row[21] ?? '').toUpperCase() === 'TRUE'; // V: 보류여부

        return {
          rowIndex: idx + 6,
          category,
          programName,
          budget,
          subCategory,
          subDetail,
          additionalReflection,
          additionalReflectionDate: additionalReflectionDate || undefined,
          isCompleted,
          isOnHold,
          professor,
          note,
          teacher,
          staff,
          divisionCode,
          budgetPlan: budgetPlanRow,
          officialBudget,
          executionComplete: execComplete,
          executionPlanned: execPlanned,
          advanceFunds,
          balance: budgetPlanRow - execComplete - execPlanned,
          executionRate: calcExecutionRate(execComplete, execPlanned, budgetPlanRow),
        };
      })
      .filter((row) => row.category || row.programName || row.budgetPlan > 0)
      .sort((a, b) => a.category.localeCompare(b.category, 'ko'));

    return NextResponse.json({ summary, programRows });
  } catch (error) {
    console.error('Dashboard API error:', error);
    return NextResponse.json(
      { error: '데이터를 불러오는 중 오류가 발생했습니다.' },
      { status: 500 },
    );
  }
}

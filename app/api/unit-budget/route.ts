import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getSheetsClient, readNamedRange } from '@/lib/google/sheets';
import { getSpreadsheetId } from '@/lib/google/getSheetId';
import { NAMED_RANGES } from '@/constants/sheets';
import type { BudgetType, UnitTask, UnitBudgetRow } from '@/types';

export const dynamic = 'force-dynamic';

const EXEC_SHEET = "'집행내역 정리'";
const SENTINEL = '새로운 집행 내역 작성시 이 행 위로 작성';

export async function GET(req: NextRequest) {
  try {
    const session = await auth();
    if (!session) {
      return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 });
    }

    const sheetType = (req.nextUrl.searchParams.get('sheetType') ?? 'main') as BudgetType;
    const SPREADSHEET_ID = await getSpreadsheetId(sheetType);
    const sheets = getSheetsClient();

    const safeRead = (range: string) =>
      readNamedRange(range, SPREADSHEET_ID).catch(() => [] as (string | number | null)[][]);

    // 1. 프로그램 행 + ★취합 데이터 병렬 읽기
    const [rowsRes, categories, subcategories, subDetails, allocations] = await Promise.all([
      sheets.spreadsheets.values.get({
        spreadsheetId: SPREADSHEET_ID,
        range: `${EXEC_SHEET}!A6:V500`,
        valueRenderOption: 'UNFORMATTED_VALUE',
      }),
      safeRead(NAMED_RANGES.ENAARA_CATEGORY),
      safeRead(NAMED_RANGES.ENAARA_SUBCATEGORY),
      safeRead(NAMED_RANGES.ENAARA_DETAIL),
      safeRead(NAMED_RANGES.ALLOCATION),
    ]);

    // 2. 편성액 맵 (비목||세목||보조세목 → { allocation, rowOffset })
    const allocationMap = new Map<string, { allocation: number; rowOffset: number }>();
    for (let i = 0; i < categories.length; i++) {
      const cat = String(categories[i]?.[0] ?? '').trim();
      if (!cat) continue;
      const subcat = String(subcategories[i]?.[0] ?? '').trim();
      const subdet = String(subDetails[i]?.[0] ?? '').trim();
      const alloc = Number(allocations[i]?.[0] ?? 0);
      allocationMap.set(`${cat}||${subcat}||${subdet}`, { allocation: alloc, rowOffset: i });
    }

    // 3. 프로그램 행 파싱 (sentinel 이전까지)
    const allRows = (rowsRes.data.values ?? []) as (string | number | null)[][];
    const sentinelIdx = allRows.findIndex((row) =>
      row.some((cell) => String(cell ?? '').includes(SENTINEL)),
    );
    const rawRows = sentinelIdx === -1 ? allRows : allRows.slice(0, sentinelIdx);

    // 4. 단위과제별 그룹화 (구분 B열)
    const unitTaskMap = new Map<string, Map<string, UnitBudgetRow>>();

    for (let i = 0; i < rawRows.length; i++) {
      const row = rawRows[i];
      const unitTask = String(row[1] ?? '').trim();
      if (!unitTask) continue;

      const budget             = String(row[2] ?? '').trim();
      const subCategory        = String(row[3] ?? '').trim();
      const subDetail          = String(row[4] ?? '').trim();
      const programName        = String(row[7] ?? '').trim();
      const budgetPlan         = Number(row[11] ?? 0);
      const officialBudget     = Number(row[12] ?? 0); // M열: 편성(공식)예산
      const executionAmount    = Number(row[13] ?? 0); // N열: 집행액
      const executionComplete  = Number(row[15] ?? 0); // P열: 집행완료
      const executionPlanned   = Number(row[16] ?? 0); // Q열: 집행예정
      const rowIndex           = i + 6;

      if (!unitTaskMap.has(unitTask)) {
        unitTaskMap.set(unitTask, new Map());
      }
      const rowMap = unitTaskMap.get(unitTask)!;
      const rowKey = `${budget}||${subCategory}||${subDetail}`;

      if (!rowMap.has(rowKey)) {
        const allocInfo = allocationMap.get(rowKey);
        rowMap.set(rowKey, {
          category: budget,
          subcategory: subCategory,
          subDetail,
          allocation: allocInfo?.allocation ?? 0,
          budgetPlan: 0,
          officialBudget: 0,
          executionAmount: 0,
          executionComplete: 0,
          executionPlanned: 0,
          rowOffset: allocInfo?.rowOffset ?? null,
          programs: [],
        });
      }

      const budgetRow = rowMap.get(rowKey)!;
      budgetRow.budgetPlan += budgetPlan;
      budgetRow.officialBudget += officialBudget;
      budgetRow.executionAmount += executionAmount;
      budgetRow.executionComplete += executionComplete;
      budgetRow.executionPlanned += executionPlanned;
      if (programName) {
        budgetRow.programs.push({ rowIndex, programName, budgetPlan, officialBudget, executionAmount, executionComplete, executionPlanned });
      }
    }

    // 5. UnitTask 배열 생성
    const unitTasks: UnitTask[] = Array.from(unitTaskMap.entries())
      .map(([name, rowMap]) => {
        const rows = Array.from(rowMap.values()).sort((a, b) =>
          `${a.category}${a.subcategory}${a.subDetail}`.localeCompare(
            `${b.category}${b.subcategory}${b.subDetail}`,
            'ko',
          ),
        );
        return {
          name,
          rows,
          totalAllocation: rows.reduce((s, r) => s + r.allocation, 0),
          totalBudgetPlan: rows.reduce((s, r) => s + r.budgetPlan, 0),
          totalExecutionAmount: rows.reduce((s, r) => s + r.executionAmount, 0),
          totalExecutionComplete: rows.reduce((s, r) => s + r.executionComplete, 0),
          totalExecutionPlanned: rows.reduce((s, r) => s + r.executionPlanned, 0),
        };
      })
      .sort((a, b) => a.name.localeCompare(b.name, 'ko'));

    return NextResponse.json({ unitTasks });
  } catch (error) {
    console.error('Unit budget GET error:', error);
    return NextResponse.json({ error: '데이터 조회 중 오류가 발생했습니다.' }, { status: 500 });
  }
}

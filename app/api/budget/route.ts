// app/api/budget/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getSheetsClient, readNamedRange } from '@/lib/google/sheets';
import { checkPermission } from '@/lib/permissions';
import { PERMISSIONS } from '@/types';
import { NAMED_RANGES, CATEGORY_SHEETS, CATEGORY_ALLOCATION_MAP } from '@/constants/sheets';
import { calcExecutionRate } from '@/lib/utils';
import { getSpreadsheetId } from '@/lib/google/getSheetId';
import type { BudgetDetailRow, BudgetCategoryRow, BudgetData, BudgetType } from '@/types';

export const dynamic = 'force-dynamic';

const EXEC_SHEET = "'집행내역 정리'";
const SENTINEL = '새로운 집행 내역 작성시 이 행 위로 작성';

function buildExecMaps(allExecRows: (string | number | null)[][]) {
  const sentinelIdx = allExecRows.findIndex((row) =>
    row.some((cell) => String(cell ?? '').includes(SENTINEL)),
  );
  const validExecRows = sentinelIdx === -1 ? allExecRows : allExecRows.slice(0, sentinelIdx);

  const execByCategory: Record<string, { complete: number; planned: number }> = {};
  const execBySubcategory: Record<string, { complete: number; planned: number }> = {};
  for (const row of validExecRows) {
    const cat       = String(row[2] ?? '').trim();
    const subcat    = String(row[3] ?? '').trim();
    const subdetail = String(row[4] ?? '').trim();
    if (!cat) continue;
    if (!execByCategory[cat]) execByCategory[cat] = { complete: 0, planned: 0 };
    execByCategory[cat].complete += Number(row[14] ?? 0);
    execByCategory[cat].planned  += Number(row[15] ?? 0);
    const subKey = `${cat}||${subcat}||${subdetail}`;
    if (!execBySubcategory[subKey]) execBySubcategory[subKey] = { complete: 0, planned: 0 };
    execBySubcategory[subKey].complete += Number(row[14] ?? 0);
    execBySubcategory[subKey].planned  += Number(row[15] ?? 0);
  }
  return { execByCategory, execBySubcategory };
}

export async function GET(req: NextRequest) {
  try {
    const session = await auth();
    if (!session) {
      return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 });
    }

    const sheetType = (req.nextUrl.searchParams.get('sheetType') ?? 'main') as BudgetType;
    const SPREADSHEET_ID = await getSpreadsheetId(sheetType);
    const sheets = getSheetsClient();

    // ── Named Range 기반 읽기 (본예산·이월예산 공통) ─────────────

    // 1. ★취합 세목별 Named Range 병렬 읽기
    const safeRead = (range: string) =>
      readNamedRange(range, SPREADSHEET_ID).catch((e: unknown) => {
        console.warn(`Named Range '${range}' 읽기 실패:`, e instanceof Error ? e.message : e);
        return [] as (string | number | null)[][];
      });
    const [categories, subcategories, subDetails, allocations, adjustments] = await Promise.all([
      safeRead(NAMED_RANGES.ENAARA_CATEGORY),
      safeRead(NAMED_RANGES.ENAARA_SUBCATEGORY),
      safeRead(NAMED_RANGES.ENAARA_DETAIL),
      safeRead(NAMED_RANGES.ALLOCATION),
      safeRead(NAMED_RANGES.ADJUSTMENT),
    ]);

    // 2. 비목별 편성액 합계 읽기 (Named Range 우선, 없으면 세목 행 합산)
    const categoryAllocationRanges = CATEGORY_SHEETS.map(
      (cat) => CATEGORY_ALLOCATION_MAP[cat],
    );
    const categoryAllocRes = await Promise.all(
      categoryAllocationRanges.map((rangeName) => safeRead(rangeName)),
    );


    // 3. 집행내역 정리 시트 읽기
    const execSheetRes = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: `${EXEC_SHEET}!A6:P500`,
      valueRenderOption: 'UNFORMATTED_VALUE',
    }).catch((e: unknown) => {
      console.warn('집행내역 정리 시트 읽기 실패 (집행 데이터 0으로 처리):', e instanceof Error ? e.message : e);
      return { data: { values: [] as (string | number | null)[][] } };
    });

    const { execByCategory, execBySubcategory } = buildExecMaps(
      (execSheetRes.data.values ?? []) as (string | number | null)[][],
    );

    // ── 세목별 상세 행 파싱 ─────────────────────────────────────
    const detailRows: BudgetDetailRow[] = [];
    const len = categories.length;
    for (let i = 0; i < len; i++) {
      const category = String(categories[i]?.[0] ?? '').trim();
      if (!category) continue;
      const allocation  = Number(allocations[i]?.[0] ?? 0);
      const adjustment  = Number(adjustments[i]?.[0] ?? 0);
      const subcategory = String(subcategories[i]?.[0] ?? '').trim();
      const subDetail   = String(subDetails[i]?.[0] ?? '').trim();
      const afterAllocation = allocation + adjustment;
      const execSub = execBySubcategory[`${category}||${subcategory}||${subDetail}`] ?? { complete: 0, planned: 0 };
      detailRows.push({
        rowOffset: i,
        category,
        subcategory,
        subDetail,
        allocation,
        adjustment,
        afterAllocation,
        executionComplete: execSub.complete,
        executionPlanned:  execSub.planned,
        balance: afterAllocation - execSub.complete - execSub.planned,
        executionRate: calcExecutionRate(execSub.complete, execSub.planned, afterAllocation),
      });
    }

    // ── 비목별 요약 행 생성 ────────────────────────────────────
    const categoryRows: BudgetCategoryRow[] = CATEGORY_SHEETS.map((cat, idx) => {
      const catDetailRows = detailRows.filter((r) => r.category === cat);
      // Named Range 값이 있으면 우선 사용, 없으면(0이면) 세목 행 편성액 합산
      const namedAlloc = Number(categoryAllocRes[idx]?.[0]?.[0] ?? 0);
      const allocation = namedAlloc !== 0
        ? namedAlloc
        : catDetailRows.reduce((s, r) => s + r.allocation, 0);
      const adjustment = catDetailRows.reduce((sum, r) => sum + r.adjustment, 0);
      const afterAllocation = allocation + adjustment;
      const exec = execByCategory[cat] ?? { complete: 0, planned: 0 };
      return {
        category: cat,
        allocation,
        adjustment,
        afterAllocation,
        executionComplete: exec.complete,
        executionPlanned:  exec.planned,
        balance: afterAllocation - exec.complete - exec.planned,
        executionRate: calcExecutionRate(exec.complete, exec.planned, afterAllocation),
      };
    });

    const data: BudgetData = { detailRows, categoryRows };
    return NextResponse.json(data);
  } catch (error) {
    console.error('Budget GET error:', error);
    return NextResponse.json({ error: '예산 데이터 조회 중 오류가 발생했습니다.' }, { status: 500 });
  }
}

// PATCH: 증감액 일괄 저장
export async function PATCH(req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.email) {
      return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 });
    }
    const hasPermission = await checkPermission(session.user.email, PERMISSIONS.BUDGET_WRITE);
    if (!hasPermission) {
      return NextResponse.json({ error: '예산관리 편집 권한이 없습니다.' }, { status: 403 });
    }

    const sheetType = (req.nextUrl.searchParams.get('sheetType') ?? 'main') as BudgetType;
    const SPREADSHEET_ID = await getSpreadsheetId(sheetType);

    const body = await req.json() as {
      adjustments: { rowOffset: number; value: number }[];
    };

    if (!Array.isArray(body.adjustments) || body.adjustments.length === 0) {
      return NextResponse.json({ error: '변경 데이터가 없습니다.' }, { status: 400 });
    }

    const sheets = getSheetsClient();

    // Named Range '증감액' 일괄 쓰기 (본예산·이월예산 공통)
    const currentRes = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: NAMED_RANGES.ADJUSTMENT,
      valueRenderOption: 'UNFORMATTED_VALUE',
    });
    const currentValues: (number | null)[] = Array.from({ length: 24 }, (_, i) =>
      Number((currentRes.data.values ?? [])[i]?.[0] ?? 0),
    );

    for (const { rowOffset, value } of body.adjustments) {
      if (rowOffset >= 0 && rowOffset < 24) {
        currentValues[rowOffset] = value;
      }
    }

    await sheets.spreadsheets.values.update({
      spreadsheetId: SPREADSHEET_ID,
      range: NAMED_RANGES.ADJUSTMENT,
      valueInputOption: 'RAW',
      requestBody: {
        values: currentValues.map((v) => [v ?? 0]),
      },
    });

    return NextResponse.json({ message: '증감액이 저장되었습니다.' });
  } catch (error) {
    console.error('Budget PATCH error:', error);
    const msg = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: `저장 중 오류가 발생했습니다: ${msg}` }, { status: 500 });
  }
}

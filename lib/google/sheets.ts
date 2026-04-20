import { google } from 'googleapis';
import { NAMED_RANGES } from '@/constants/sheets';
import type { ExpenditureRow, CategoryBudget } from '@/types';

function getAuth() {
  return new google.auth.GoogleAuth({
    credentials: {
      client_email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
      private_key: process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY?.replace(/\\n/g, '\n'),
    },
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });
}

export function getSheetsClient() {
  return google.sheets({ version: 'v4', auth: getAuth() });
}

const SPREADSHEET_ID = process.env.GOOGLE_SHEETS_ID!;

// Named Range 값 읽기
export async function readNamedRange(
  rangeName: string,
  spreadsheetId?: string,
): Promise<(string | number | null)[][]> {
  const sheets = getSheetsClient();
  const response = await sheets.spreadsheets.values.get({
    spreadsheetId: spreadsheetId ?? SPREADSHEET_ID,
    range: rangeName,
    valueRenderOption: 'UNFORMATTED_VALUE',
  });
  return (response.data.values ?? []) as (string | number | null)[][];
}

// Named Range 값 쓰기
export async function writeNamedRange(
  rangeName: string,
  values: (string | number | null)[][],
  spreadsheetId?: string,
): Promise<void> {
  const sheets = getSheetsClient();
  await sheets.spreadsheets.values.update({
    spreadsheetId: spreadsheetId ?? SPREADSHEET_ID,
    range: rangeName,
    valueInputOption: 'RAW',
    requestBody: { values },
  });
}

// 집행내역 정리 시트 - 전체 행 읽기 (비목/보조비목/보조세목/예산계획/집행완료/집행예정)
export async function getExpenditureRows(): Promise<ExpenditureRow[]> {
  const [categories, subCategories, subDetails, budgetPlans, completions, planned] =
    await Promise.all([
      readNamedRange(NAMED_RANGES.CATEGORY),
      readNamedRange(NAMED_RANGES.SUB_CATEGORY),
      readNamedRange(NAMED_RANGES.SUB_DETAIL),
      readNamedRange(NAMED_RANGES.BUDGET_PLAN),
      readNamedRange(NAMED_RANGES.EXECUTION_COMPLETE),
      readNamedRange(NAMED_RANGES.EXECUTION_PLANNED),
    ]);

  const rows: ExpenditureRow[] = [];
  const length = categories.length;

  for (let i = 0; i < length; i++) {
    const category = String(categories[i]?.[0] ?? '');
    if (!category) continue;

    rows.push({
      rowIndex: i + 6, // Sheets는 6행부터 시작
      category,
      subCategory: String(subCategories[i]?.[0] ?? ''),
      subDetail: String(subDetails[i]?.[0] ?? ''),
      budgetPlan: Number(budgetPlans[i]?.[0] ?? 0),
      executionComplete: Number(completions[i]?.[0] ?? 0),
      executionPlanned: Number(planned[i]?.[0] ?? 0),
    });
  }

  return rows;
}

// ★취합 시트 - 비목별 편성액 읽기
export async function getCategoryAllocations(): Promise<CategoryBudget[]> {
  const [categories, allocations, adjustments] = await Promise.all([
    readNamedRange(NAMED_RANGES.ENAARA_CATEGORY),
    readNamedRange(NAMED_RANGES.ALLOCATION),
    readNamedRange(NAMED_RANGES.ADJUSTMENT),
  ]);

  const results: CategoryBudget[] = [];
  const length = categories.length;

  for (let i = 0; i < length; i++) {
    const category = String(categories[i]?.[0] ?? '');
    if (!category) continue;

    const allocation = Number(allocations[i]?.[0] ?? 0);
    const adjustment = Number(adjustments[i]?.[0] ?? 0);
    const afterAllocation = allocation + adjustment;

    results.push({
      category,
      allocation,
      adjustment,
      afterAllocation,
      executionComplete: 0, // 집행내역 정리 시트에서 별도 집계
      executionPlanned: 0,
      balance: afterAllocation,
      executionRate: 0,
    });
  }

  return results;
}

// 특정 비목의 드롭다운 목록 읽기
export async function getCategoryDropdown(
  dropRangeName: string,
  spreadsheetId?: string,
): Promise<string[]> {
  const values = await readNamedRange(dropRangeName, spreadsheetId);
  return values
    .map((row) => String(row[0] ?? ''))
    .filter((v) => v.trim() !== '');
}

// 증감액 단일 셀 쓰기 (★취합 J열, 특수문자 시트명이므로 따옴표로 감싸야 함)
export async function writeAdjustment(
  rowOffset: number,
  adjustment: number,
): Promise<void> {
  const cellRef = `'★취합'!J${rowOffset + 3}`;
  const sheets = getSheetsClient();
  await sheets.spreadsheets.values.update({
    spreadsheetId: SPREADSHEET_ID,
    range: cellRef,
    valueInputOption: 'RAW',
    requestBody: { values: [[adjustment]] },
  });
}

// 확정 시: 증감액을 편성액에 반영하고 증감액을 0으로 초기화
export async function mergeAdjustmentsIntoAllocations(): Promise<void> {
  const sheets = getSheetsClient();

  const [allocRes, adjRes] = await Promise.all([
    sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: NAMED_RANGES.ALLOCATION,
      valueRenderOption: 'UNFORMATTED_VALUE',
    }),
    sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: NAMED_RANGES.ADJUSTMENT,
      valueRenderOption: 'UNFORMATTED_VALUE',
    }),
  ]);

  const allocValues = allocRes.data.values ?? [];
  const adjValues   = adjRes.data.values ?? [];

  const newAllocations = Array.from({ length: 24 }, (_, i) => {
    const alloc = Number(allocValues[i]?.[0] ?? 0);
    const adj   = Number(adjValues[i]?.[0] ?? 0);
    return [alloc + adj];
  });
  const zeros = Array.from({ length: 24 }, () => [0]);

  await Promise.all([
    sheets.spreadsheets.values.update({
      spreadsheetId: SPREADSHEET_ID,
      range: NAMED_RANGES.ALLOCATION,
      valueInputOption: 'RAW',
      requestBody: { values: newAllocations },
    }),
    sheets.spreadsheets.values.update({
      spreadsheetId: SPREADSHEET_ID,
      range: NAMED_RANGES.ADJUSTMENT,
      valueInputOption: 'RAW',
      requestBody: { values: zeros },
    }),
  ]);
}

// 예산변경이력 시트 헤더
const HISTORY_SHEET_NAME = '예산변경이력';
const HISTORY_HEADERS = [
  '변경일자', '비목', '세목', '세세목',
  '변경전 편성액', '증감액', '변경후 편성액',
  '집행완료', '집행예정', '잔액', '집행률(%)', '확정자',
];

export interface BudgetHistorySheetRow {
  changedAt: string;
  category: string;
  subcategory: string;
  subDetail: string;
  beforeAmount: number;
  adjustment: number;
  afterAmount: number;
  executionComplete: number;
  executionPlanned: number;
  balance: number;
  executionRate: number;
  confirmedBy: string;
}

// 예산변경이력 시트가 없으면 생성, 있으면 헤더를 최신으로 갱신
async function ensureHistorySheet(sheets: ReturnType<typeof getSheetsClient>): Promise<void> {
  const meta = await sheets.spreadsheets.get({ spreadsheetId: SPREADSHEET_ID });
  const exists = meta.data.sheets?.some(
    (s) => s.properties?.title === HISTORY_SHEET_NAME,
  );

  if (!exists) {
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId: SPREADSHEET_ID,
      requestBody: {
        requests: [{ addSheet: { properties: { title: HISTORY_SHEET_NAME } } }],
      },
    });
  }

  // 헤더 행을 항상 최신 상태로 덮어씌움 (컬럼 추가 시 자동 반영)
  await sheets.spreadsheets.values.update({
    spreadsheetId: SPREADSHEET_ID,
    range: `${HISTORY_SHEET_NAME}!A1`,
    valueInputOption: 'RAW',
    requestBody: { values: [HISTORY_HEADERS] },
  });
}

// 예산변경이력 시트에 행 추가
export async function appendBudgetHistoryRows(rows: BudgetHistorySheetRow[]): Promise<void> {
  if (rows.length === 0) return;
  const sheets = getSheetsClient();
  await ensureHistorySheet(sheets);

  const values = rows.map((r) => [
    r.changedAt,
    r.category,
    r.subcategory,
    r.subDetail,
    r.beforeAmount,
    r.adjustment,
    r.afterAmount,
    r.executionComplete,
    r.executionPlanned,
    r.balance,
    Math.round(r.executionRate * 10) / 10,
    r.confirmedBy,
  ]);

  await sheets.spreadsheets.values.append({
    spreadsheetId: SPREADSHEET_ID,
    range: `${HISTORY_SHEET_NAME}!A1`,
    valueInputOption: 'RAW',
    insertDataOption: 'INSERT_ROWS',
    requestBody: { values },
  });
}

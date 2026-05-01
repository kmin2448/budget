import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getSheetsClient } from '@/lib/google/sheets';
import { PERMISSIONS, type BudgetType } from '@/types';
import { checkPermission } from '@/lib/permissions';
import { getSpreadsheetId } from '@/lib/google/getSheetId';
import {
  CATEGORY_SHEETS,
  CATEGORY_DATA_START_ROW,
  CATEGORY_DATA_END_ROW_MAP,
} from '@/constants/sheets';

function isCategorySheet(val: string): val is typeof CATEGORY_SHEETS[number] {
  return (CATEGORY_SHEETS as readonly string[]).includes(val);
}

const SHEET = "'집행내역 정리'";

// 프로그램 행 추가 (빈 행 찾아서 삽입)
export async function POST(req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.email) {
      return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 });
    }

    const hasPermission = await checkPermission(
      session.user.email,
      PERMISSIONS.DASHBOARD_WRITE,
    );
    if (!hasPermission) {
      return NextResponse.json({ error: '권한이 없습니다.' }, { status: 403 });
    }

    const sheetType = (req.nextUrl.searchParams.get('sheetType') ?? 'main') as BudgetType;
    const SPREADSHEET_ID = await getSpreadsheetId(sheetType);

    const body = await req.json() as {
      category: string;
      programName: string;
      budget: string;
      subCategory: string;
      subDetail: string;
      professor?: string;
      teacher?: string;
      staff?: string;
      note?: string;
      budgetPlan: number;
    };

    const sheets = getSheetsClient();
    const SENTINEL = '새로운 집행 내역 작성시 이 행 위로 작성';

    // ── 시트 메타 + 데이터 병렬 조회 ──
    const [spreadsheetInfo, rowsRes] = await Promise.all([
      sheets.spreadsheets.get({
        spreadsheetId: SPREADSHEET_ID,
        fields: 'sheets.properties.title,sheets.properties.sheetId',
      }),
      sheets.spreadsheets.values.get({
        spreadsheetId: SPREADSHEET_ID,
        range: `${SHEET}!A6:R500`,
        valueRenderOption: 'UNFORMATTED_VALUE',
      }),
    ]);

    // 시트 ID (sheetId 가 0 일 수도 있으므로 undefined 만 체크)
    const sheetMeta = spreadsheetInfo.data.sheets?.find(
      (s) => s.properties?.title === '집행내역 정리',
    );
    const sheetId = sheetMeta?.properties?.sheetId;
    if (sheetId === undefined) {
      const available = spreadsheetInfo.data.sheets?.map((s) => s.properties?.title).join(', ');
      return NextResponse.json(
        { error: `'집행내역 정리' 시트를 찾을 수 없습니다. 현재 시트: ${available}` },
        { status: 404 },
      );
    }

    // ── sentinel 위치 ──
    const allRows = rowsRes.data.values ?? [];
    const sentinelIdx = allRows.findIndex((row) =>
      row.some((cell) => String(cell ?? '').includes(SENTINEL)),
    );

    let insertAfterRow: number;

    if (sentinelIdx === -1) {
      // sentinel 없으면 마지막 데이터 행 뒤에 삽입 (폴백)
      insertAfterRow = 5 + allRows.length; // row 6부터 시작하므로 마지막 = 5 + length
    } else {
      const sentinelRowNumber = 6 + sentinelIdx; // 1-based
      const dataRows = allRows.slice(0, sentinelIdx);

      const categoryRowNumbers = dataRows
        .map((row, idx) => ({ rowNum: 6 + idx, cat: String(row[1] ?? '').trim() }))
        .filter(({ cat }) => cat === body.category.trim())
        .map(({ rowNum }) => rowNum);

      insertAfterRow =
        categoryRowNumbers.length > 0
          ? Math.max(...categoryRowNumbers)  // 해당 구분 마지막 행 뒤
          : sentinelRowNumber - 1;           // sentinel 바로 위
    }

    // P, Q열(index 15, 16) 수식 복사 헬퍼 — 삽입된 새 행의 바로 윗 행에서 수식 복사
    // (M열 추가로 구 O→P, 구 P→Q)
    const buildFormulaCopyRequest = (srcRowIdx: number, destRowIdx: number) => ({
      copyPaste: {
        source: {
          sheetId,
          startRowIndex: srcRowIdx,   // 0-indexed, 복사 원본(윗 행)
          endRowIndex:   srcRowIdx + 1,
          startColumnIndex: 15,       // P열 (M열 추가로 구 O→P)
          endColumnIndex:   17,       // Q열(포함) → exclusive 끝은 17
        },
        destination: {
          sheetId,
          startRowIndex: destRowIdx,  // 0-indexed, 붙여넣을 새 행
          endRowIndex:   destRowIdx + 1,
          startColumnIndex: 15,
          endColumnIndex:   17,
        },
        pasteType: 'PASTE_FORMULA',
        pasteOrientation: 'NORMAL',
      },
    });

    // ── 행 삽입 시도 → 보호 걸려 있으면 빈 행 폴백 ──
    let newRowNumber: number;

    try {
      // 1순위: insertDimension + O,P 수식 복사를 한 번의 batchUpdate로 처리
      // insertAfterRow 는 0-indexed insert position:
      //   새 행 = index insertAfterRow → 1-based 행 번호 insertAfterRow + 1
      //   윗 행 = index insertAfterRow - 1
      const requests: object[] = [
        {
          insertDimension: {
            range: {
              sheetId,
              dimension: 'ROWS',
              startIndex: insertAfterRow,
              endIndex:   insertAfterRow + 1,
            },
            inheritFromBefore: true,
          },
        },
      ];
      // 윗 행이 존재할 때만 수식 복사 (삽입 위치가 첫 데이터 행보다 뒤인 경우)
      if (insertAfterRow > 5) {
        requests.push(buildFormulaCopyRequest(insertAfterRow - 1, insertAfterRow));
      }

      await sheets.spreadsheets.batchUpdate({
        spreadsheetId: SPREADSHEET_ID,
        requestBody: { requests },
      });
      newRowNumber = insertAfterRow + 1;
    } catch {
      // 2순위: 시트 보호로 삽입 실패 → insertAfterRow 이후 첫 번째 빈 행 사용
      const sentinelLimit = sentinelIdx === -1 ? allRows.length : sentinelIdx;
      const searchFrom = Math.max(0, insertAfterRow - 5);
      let emptyIdx = -1;
      for (let i = searchFrom; i < sentinelLimit; i++) {
        const r = allRows[i];
        const isEmpty =
          !String(r?.[1] ?? '').trim() &&  // B: 구분 없음
          !String(r?.[7] ?? '').trim();     // H: 프로그램명 없음
        if (isEmpty) { emptyIdx = i; break; }
      }
      if (emptyIdx === -1) {
        return NextResponse.json(
          { error: '빈 행이 없습니다. Google Sheets에서 데이터 → 시트 및 범위 보호를 해제하거나, 시트에 빈 행을 추가해주세요.' },
          { status: 400 },
        );
      }
      newRowNumber = emptyIdx + 6; // allRows 인덱스 → 1-based 행 번호

      // 빈 행 사용 시에도 O,P 수식 복사 시도 (실패해도 데이터 기록은 계속)
      if (emptyIdx > 0) {
        try {
          // emptyIdx(allRows 기준) → 0-indexed sheet row: emptyIdx + 5
          const destRowIdx = emptyIdx + 5;
          await sheets.spreadsheets.batchUpdate({
            spreadsheetId: SPREADSHEET_ID,
            requestBody: { requests: [buildFormulaCopyRequest(destRowIdx - 1, destRowIdx)] },
          });
        } catch {
          // 수식 복사 실패는 무시 — 데이터는 정상 기록됨
        }
      }
    }

    // ── 데이터 기록 (A~L열, M은 편성(공식)예산, N·O는 ArrayFormula, P·Q는 수식 복사로 처리) ──
    await sheets.spreadsheets.values.update({
      spreadsheetId: SPREADSHEET_ID,
      range: `${SHEET}!A${newRowNumber}:L${newRowNumber}`,
      valueInputOption: 'USER_ENTERED',
      requestBody: {
        values: [[
          '',                        // A: 코드
          body.category,             // B: 구분
          body.budget,               // C: 비목
          body.subCategory,          // D: 보조비목
          body.subDetail,            // E: 보조세목
          body.professor ?? '',      // F: 소관
          '',                        // G: (미사용)
          body.programName,          // H: 프로그램명
          body.note ?? '',           // I: 비고
          body.teacher ?? '',        // J: 담당교원
          body.staff ?? '',          // K: 담당직원
          body.budgetPlan || 0,      // L: 예산계획
          // M, N: ArrayFormula 자동 계산 — 값 미기록
          // O, P: 윗 행 수식 복사 완료 — 값 미기록
        ]],
      },
    });

    return NextResponse.json({ rowIndex: newRowNumber, message: '프로그램이 추가되었습니다.' });
  } catch (error) {
    console.error('Program POST error:', error);
    const msg = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: `추가 중 오류: ${msg}` }, { status: 500 });
  }
}

// 프로그램 행 수정
export async function PUT(req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.email) {
      return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 });
    }

    const hasPermission = await checkPermission(
      session.user.email,
      PERMISSIONS.DASHBOARD_WRITE,
    );
    if (!hasPermission) {
      return NextResponse.json({ error: '권한이 없습니다.' }, { status: 403 });
    }

    const sheetType = (req.nextUrl.searchParams.get('sheetType') ?? 'main') as BudgetType;
    const SPREADSHEET_ID = await getSpreadsheetId(sheetType);

    const body = await req.json() as {
      rowIndex: number;
      category: string;
      programName: string;
      budget: string;
      subCategory: string;
      subDetail: string;
      professor?: string;
      teacher?: string;
      staff?: string;
      note?: string;
      budgetPlan: number;
    };

    const sheets = getSheetsClient();

    await sheets.spreadsheets.values.update({
      spreadsheetId: SPREADSHEET_ID,
      range: `${SHEET}!A${body.rowIndex}:L${body.rowIndex}`,
      valueInputOption: 'USER_ENTERED',
      requestBody: {
        values: [[
          '',                        // A: 코드 (유지)
          body.category,             // B: 구분
          body.budget,               // C: 비목
          body.subCategory,          // D: 보조비목
          body.subDetail,            // E: 보조세목
          body.professor ?? '',      // F: 소관
          '',                        // G: (미사용)
          body.programName,          // H: 프로그램명
          body.note ?? '',           // I: 비고
          body.teacher ?? '',        // J: 담당교원
          body.staff ?? '',          // K: 담당직원
          body.budgetPlan || 0,      // L: 예산계획
        ]],
      },
    });

    return NextResponse.json({ message: '수정되었습니다.' });
  } catch (error) {
    console.error('Program PUT error:', error);
    return NextResponse.json({ error: '수정 중 오류가 발생했습니다.' }, { status: 500 });
  }
}

const FIELD_COLUMN: Record<string, string> = {
  divisionCode: 'A',
  category: 'B',
  budget: 'C',
  subCategory: 'D',
  subDetail: 'E',
  professor: 'F',
  programName: 'H',
  note: 'I',
  teacher: 'J',
  staff: 'K',
  budgetPlan: 'L',
  // M열: 편성(공식)예산 — 읽기 전용(수식), 인라인 편집 불가
  additionalReflection: 'S',     // M열 추가로 R→S
  additionalReflectionDate: 'T', // M열 추가로 S→T
  isCompleted: 'U',              // M열 추가로 T→U
  isOnHold: 'V',                 // M열 추가로 U→V
};

// 인라인 편집 일괄 저장
export async function PATCH(req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.email) {
      return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 });
    }

    const sheetType = (req.nextUrl.searchParams.get('sheetType') ?? 'main') as BudgetType;
    const SPREADSHEET_ID = await getSpreadsheetId(sheetType);

    const body = await req.json() as {
      updates: { rowIndex: number; field: string; value: string | number }[];
    };

    const { updates } = body;
    if (!updates || updates.length === 0) {
      return NextResponse.json({ message: '변경 사항이 없습니다.' });
    }

    // 아래 필드는 로그인 사용자 누구나 허용 (권한 불필요)
    const NO_PERMISSION_FIELDS = new Set(['additionalReflection', 'additionalReflectionDate', 'isCompleted', 'isOnHold']);
    const isOnlyFreeFields = updates.every((u) => NO_PERMISSION_FIELDS.has(u.field));
    if (!isOnlyFreeFields) {
      const hasPermission = await checkPermission(session.user.email, PERMISSIONS.DASHBOARD_WRITE);
      if (!hasPermission) {
        return NextResponse.json({ error: '권한이 없습니다.' }, { status: 403 });
      }
    }

    const sheets = getSheetsClient();

    // ── Step 1: programName 변경 건의 기존값을 업데이트 전에 미리 읽기 ──
    // (업데이트 후 읽으면 이미 새 이름으로 덮어써져 oldName 추출 불가)
    type CascadeInfo = { newName: string; budget: string; oldName: string };
    const cascadeInfos: CascadeInfo[] = [];

    const programNameUpdates = updates.filter((u) => u.field === 'programName');
    await Promise.all(
      programNameUpdates.map(async ({ rowIndex, value: newName }) => {
        // C와 H를 각각 읽어 열 인덱싱 오류 방지
        const [cRes, hRes] = await Promise.all([
          sheets.spreadsheets.values.get({
            spreadsheetId: SPREADSHEET_ID,
            range: `${SHEET}!C${rowIndex}`,
            valueRenderOption: 'UNFORMATTED_VALUE',
          }),
          sheets.spreadsheets.values.get({
            spreadsheetId: SPREADSHEET_ID,
            range: `${SHEET}!H${rowIndex}`,
            valueRenderOption: 'UNFORMATTED_VALUE',
          }),
        ]);
        const budget = String(cRes.data.values?.[0]?.[0] ?? '').trim();
        const oldName = String(hRes.data.values?.[0]?.[0] ?? '').trim();

        console.log(`[cascade] row=${rowIndex} budget="${budget}" oldName="${oldName}" newName="${String(newName)}" isCategorySheet=${isCategorySheet(budget)}`);

        if (budget && oldName && oldName !== String(newName) && isCategorySheet(budget)) {
          cascadeInfos.push({ newName: String(newName), budget, oldName });
        }
      }),
    );

    // ── Step 2: 프로그램 시트 업데이트 ───────────────────────────────
    const RAW_FIELDS = new Set(['additionalReflectionDate']);

    const rawData = updates
      .filter(({ field }) => field in FIELD_COLUMN && RAW_FIELDS.has(field))
      .map(({ rowIndex, field, value }) => ({
        range: `${SHEET}!${FIELD_COLUMN[field]}${rowIndex}`,
        values: [[value]],
      }));

    const normalData = updates
      .filter(({ field }) => field in FIELD_COLUMN && !RAW_FIELDS.has(field))
      .map(({ rowIndex, field, value }) => ({
        range: `${SHEET}!${FIELD_COLUMN[field]}${rowIndex}`,
        values: [[value]],
      }));

    await Promise.all([
      rawData.length > 0 && sheets.spreadsheets.values.batchUpdate({
        spreadsheetId: SPREADSHEET_ID,
        requestBody: { valueInputOption: 'RAW', data: rawData },
      }),
      normalData.length > 0 && sheets.spreadsheets.values.batchUpdate({
        spreadsheetId: SPREADSHEET_ID,
        requestBody: { valueInputOption: 'USER_ENTERED', data: normalData },
      }),
    ]);

    // ── Step 3: 비목 시트 cascade (미리 읽어둔 정보 사용) ────────────
    let totalCascadeCount = 0;
    for (const { newName, budget, oldName } of cascadeInfos) {
      const endRow = CATEGORY_DATA_END_ROW_MAP[budget as keyof typeof CATEGORY_DATA_END_ROW_MAP];
      console.log(`[cascade] 시트="${budget}" 검색범위=A${CATEGORY_DATA_START_ROW}:A${endRow} oldName="${oldName}" → newName="${newName}"`);

      const catRes = await sheets.spreadsheets.values.get({
        spreadsheetId: SPREADSHEET_ID,
        range: `'${budget}'!A${CATEGORY_DATA_START_ROW}:A${endRow}`,
        valueRenderOption: 'UNFORMATTED_VALUE',
      });
      const catRows = (catRes.data.values ?? []) as (string | number | null)[][];

      const cascadeData = catRows
        .map((row, idx) => ({ sheetRow: CATEGORY_DATA_START_ROW + idx, name: String(row[0] ?? '').trim() }))
        .filter(({ name }) => name === oldName)
        .map(({ sheetRow }) => ({ range: `'${budget}'!A${sheetRow}`, values: [[newName]] }));

      console.log(`[cascade] 매칭 행 수=${cascadeData.length}`, cascadeData.map((d) => d.range));

      if (cascadeData.length === 0) continue;

      await sheets.spreadsheets.values.batchUpdate({
        spreadsheetId: SPREADSHEET_ID,
        requestBody: { valueInputOption: 'USER_ENTERED', data: cascadeData },
      });
      totalCascadeCount += cascadeData.length;
    }

    console.log(`[cascade] 완료: cascadeInfos=${cascadeInfos.length}건, 업데이트=${totalCascadeCount}행`);
    return NextResponse.json({ message: `${rawData.length + normalData.length}개 셀이 수정되었습니다.` });
  } catch (error) {
    console.error('Program PATCH error:', error);
    return NextResponse.json({ error: '수정 중 오류가 발생했습니다.' }, { status: 500 });
  }
}

// 프로그램 행 삭제 (행 내용 비우기)
export async function DELETE(req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.email) {
      return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 });
    }

    const hasPermission = await checkPermission(
      session.user.email,
      PERMISSIONS.DASHBOARD_WRITE,
    );
    if (!hasPermission) {
      return NextResponse.json({ error: '권한이 없습니다.' }, { status: 403 });
    }

    const sheetType = (req.nextUrl.searchParams.get('sheetType') ?? 'main') as BudgetType;
    const SPREADSHEET_ID = await getSpreadsheetId(sheetType);

    const body = await req.json() as { rowIndex?: number; rowIndices?: number[] };
    const indices = body.rowIndices ?? (body.rowIndex !== undefined ? [body.rowIndex] : []);
    if (indices.length === 0) {
      return NextResponse.json({ error: '삭제할 행이 없습니다.' }, { status: 400 });
    }

    const sheets = getSheetsClient();
    const ranges = indices.map((idx) => `${SHEET}!A${idx}:V${idx}`);

    if (ranges.length === 1) {
      await sheets.spreadsheets.values.clear({
        spreadsheetId: SPREADSHEET_ID,
        range: ranges[0],
      });
    } else {
      await sheets.spreadsheets.values.batchClear({
        spreadsheetId: SPREADSHEET_ID,
        requestBody: { ranges },
      });
    }

    return NextResponse.json({ message: `${indices.length}건이 삭제되었습니다.` });
  } catch (error) {
    console.error('Program DELETE error:', error);
    return NextResponse.json({ error: '삭제 중 오류가 발생했습니다.' }, { status: 500 });
  }
}

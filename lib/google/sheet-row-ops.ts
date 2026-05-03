// lib/google/sheet-row-ops.ts
// 고유 ID 생성 및 시트 행 삽입/삭제 헬퍼

import { randomBytes } from 'crypto';
import { sheets_v4 } from 'googleapis';

/** 10자리 URL-safe 고유 ID 생성 (예: "R4A7F2C1B9") */
export function generateRowId(): string {
  return 'R' + randomBytes(5).toString('hex').toUpperCase();
}

/** 시트 이름으로 숫자 sheetId 조회 (insertDimension/deleteDimension에 필요) */
export async function getSheetNumericId(
  sheets: sheets_v4.Sheets,
  spreadsheetId: string,
  sheetName: string,
): Promise<number> {
  const meta = await sheets.spreadsheets.get({
    spreadsheetId,
    fields: 'sheets.properties(sheetId,title)',
  });
  const sheet = meta.data.sheets?.find((s) => s.properties?.title === sheetName);
  if (sheet?.properties?.sheetId === undefined || sheet.properties.sheetId === null) {
    throw new Error(`시트 "${sheetName}"를 찾을 수 없습니다.`);
  }
  return sheet.properties.sheetId;
}

/**
 * Named Range 내에 새 행 삽입 (행 추가 시 Named Range 자동 확장)
 * @param startIndex 0-based 삽입 위치 (= 1-based rowIndex - 1)
 */
export async function insertSheetRow(
  sheets: sheets_v4.Sheets,
  spreadsheetId: string,
  sheetId: number,
  startIndex: number,
): Promise<void> {
  await sheets.spreadsheets.batchUpdate({
    spreadsheetId,
    requestBody: {
      requests: [{
        insertDimension: {
          range: {
            sheetId,
            dimension: 'ROWS',
            startIndex,
            endIndex: startIndex + 1,
          },
          inheritFromBefore: true,
        },
      }],
    },
  });
}

/**
 * 시트에서 행 삭제 (Named Range 자동 축소)
 * @param startIndex 0-based 삭제 위치 (= 1-based rowIndex - 1)
 */
export async function deleteSheetRow(
  sheets: sheets_v4.Sheets,
  spreadsheetId: string,
  sheetId: number,
  startIndex: number,
): Promise<void> {
  await sheets.spreadsheets.batchUpdate({
    spreadsheetId,
    requestBody: {
      requests: [{
        deleteDimension: {
          range: {
            sheetId,
            dimension: 'ROWS',
            startIndex,
            endIndex: startIndex + 1,
          },
        },
      }],
    },
  });
}

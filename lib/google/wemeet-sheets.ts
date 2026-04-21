import { getSheetsClient } from './sheets';
import {
  WEMEET_EXECUTION_RANGE,
  WEMEET_SUMMARY_RANGE,
  WEMEET_TEAM_LIST_RANGE,
  WEMEET_SUMMARY_COLS,
  WEMEET_MAX_TEAMS,
  WEMEET_MAX_ROWS,
} from '@/constants/wemeet';
import type { WeMeetExecution, WeMeetTeamSummary } from '@/types';

const SHEETS_ID = () => {
  const id = process.env.WEMEET_SHEETS_ID;
  if (!id) throw new Error('WEMEET_SHEETS_ID 환경변수가 설정되지 않았습니다.');
  return id;
};

// ── 집행현황 ──────────────────────────────────────────────────────────

export async function getWeMeetExecutions(): Promise<WeMeetExecution[]> {
  const sheets = getSheetsClient();
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEETS_ID(),
    range: '집행현황!A2:G200', // G열(지출건명)까지 읽기
    valueRenderOption: 'UNFORMATTED_VALUE',
  });

  const rows = res.data.values ?? [];
  const result: WeMeetExecution[] = [];

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const usageType = String(row?.[0] ?? '').trim();
    const teamName  = String(row?.[1] ?? '').trim();
    if (!usageType && !teamName) continue;

    result.push({
      rowIndex:        i + 2,
      usageType,
      teamName,
      plannedAmount:   Number(row?.[2] ?? 0),
      confirmed:       row?.[3] === true || row?.[3] === 'TRUE' || row?.[3] === 1,
      confirmedAmount: Number(row?.[4] ?? 0),
      description:     String(row?.[6] ?? '').trim(), // G열: 지출건명 (F열 건너뜀)
    });
  }

  return result;
}

export async function appendWeMeetExecution(data: Omit<WeMeetExecution, 'rowIndex'>): Promise<void> {
  const sheets = getSheetsClient();
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEETS_ID(),
    range: WEMEET_EXECUTION_RANGE,
    valueRenderOption: 'UNFORMATTED_VALUE',
  });

  const rows = res.data.values ?? [];
  // 마지막으로 값이 있는 행 다음에 추가
  let lastFilledIdx = -1;
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    if (row?.some((c) => c !== null && c !== undefined && c !== '')) {
      lastFilledIdx = i;
    }
  }

  const nextRowNum = lastFilledIdx + 1 + 2; // 0-based → 시트 행 번호 (헤더=1, 데이터 시작=2)
  if (nextRowNum > WEMEET_MAX_ROWS + 1) {
    throw new Error(`집행현황 최대 행(${WEMEET_MAX_ROWS}행)을 초과했습니다.`);
  }

  await sheets.spreadsheets.values.update({
    spreadsheetId: SHEETS_ID(),
    range: `집행현황!A${nextRowNum}:G${nextRowNum}`,
    valueInputOption: 'RAW',
    requestBody: {
      values: [[
        data.usageType,
        data.teamName,
        data.plannedAmount,
        data.confirmed,
        data.confirmedAmount,
        '',              // F열 (빈칸)
        data.description ?? '',
      ]],
    },
  });
}

export async function updateWeMeetExecution(
  rowIndex: number,
  data: Omit<WeMeetExecution, 'rowIndex'>,
): Promise<void> {
  const sheets = getSheetsClient();
  await sheets.spreadsheets.values.update({
    spreadsheetId: SHEETS_ID(),
    range: `집행현황!A${rowIndex}:G${rowIndex}`,
    valueInputOption: 'RAW',
    requestBody: {
      values: [[
        data.usageType,
        data.teamName,
        data.plannedAmount,
        data.confirmed,
        data.confirmedAmount,
        '',
        data.description ?? '',
      ]],
    },
  });
}

export async function deleteWeMeetExecution(rowIndex: number): Promise<void> {
  const sheets = getSheetsClient();
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEETS_ID(),
    range: WEMEET_EXECUTION_RANGE,
    valueRenderOption: 'UNFORMATTED_VALUE',
  });

  const rows = res.data.values ?? [];
  // rowIndex는 시트 행 번호(2-based), 배열 인덱스로 변환
  const arrIdx = rowIndex - 2;

  // 해당 행 제거 후 아래 행 shift up
  const filtered = rows.filter((_, i) => i !== arrIdx);

  // 기존 범위 전체 클리어 후 재작성
  const clearEnd = rows.length + 1; // 원래 마지막 행
  await sheets.spreadsheets.values.clear({
    spreadsheetId: SHEETS_ID(),
    range: `집행현황!A2:E${clearEnd}`,
  });

  if (filtered.length > 0) {
    await sheets.spreadsheets.values.update({
      spreadsheetId: SHEETS_ID(),
      range: `집행현황!A2:E${filtered.length + 1}`,
      valueInputOption: 'RAW',
      requestBody: { values: filtered },
    });
  }
}

// ── 팀 관리 ───────────────────────────────────────────────────────────

export async function getWeMeetTeams(): Promise<Array<{ teamName: string; rowIndex: number }>> {
  const sheets = getSheetsClient();
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEETS_ID(),
    range: WEMEET_TEAM_LIST_RANGE,
    valueRenderOption: 'UNFORMATTED_VALUE',
  });

  const rows = res.data.values ?? [];
  return rows
    .map((row, i) => ({ teamName: String(row?.[0] ?? '').trim(), rowIndex: i + 3 }))
    .filter((t) => t.teamName !== '');
}

export async function appendWeMeetTeam(teamName: string): Promise<void> {
  const teams = await getWeMeetTeams();

  if (teams.length >= WEMEET_MAX_TEAMS) {
    throw new Error(`팀은 최대 ${WEMEET_MAX_TEAMS}개까지 추가할 수 있습니다.`);
  }

  const nextRowNum = teams.length === 0 ? 3 : teams[teams.length - 1].rowIndex + 1;

  const sheets = getSheetsClient();
  await sheets.spreadsheets.values.update({
    spreadsheetId: SHEETS_ID(),
    range: `팀별취합!A${nextRowNum}`,
    valueInputOption: 'RAW',
    requestBody: { values: [[teamName]] },
  });
}

export async function deleteWeMeetTeam(rowIndex: number): Promise<void> {
  const sheets = getSheetsClient();
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEETS_ID(),
    range: WEMEET_TEAM_LIST_RANGE,
    valueRenderOption: 'UNFORMATTED_VALUE',
  });

  const rows = res.data.values ?? [];
  const arrIdx = rowIndex - 3; // 팀별취합 A3 시작이므로 3-based

  const filtered = rows.filter((_, i) => i !== arrIdx);

  // 범위 클리어 후 재작성
  await sheets.spreadsheets.values.clear({
    spreadsheetId: SHEETS_ID(),
    range: WEMEET_TEAM_LIST_RANGE,
  });

  if (filtered.length > 0) {
    await sheets.spreadsheets.values.update({
      spreadsheetId: SHEETS_ID(),
      range: `팀별취합!A3:A${filtered.length + 2}`,
      valueInputOption: 'RAW',
      requestBody: { values: filtered },
    });
  }
}

// ── 팀별 요약 ─────────────────────────────────────────────────────────

export async function getWeMeetSummary(): Promise<WeMeetTeamSummary[]> {
  const sheets = getSheetsClient();
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEETS_ID(),
    range: WEMEET_SUMMARY_RANGE,
    valueRenderOption: 'UNFORMATTED_VALUE',
  });

  const rows = res.data.values ?? [];
  const C = WEMEET_SUMMARY_COLS;

  return rows
    .map((row) => {
      const teamName = String(row?.[C.TEAM_NAME] ?? '').trim();
      if (!teamName) return null;

      const confirmedTotal    = Number(row?.[C.CONFIRMED_TOTAL] ?? 0);
      const expectedTotal     = Number(row?.[C.EXPECTED_TOTAL]  ?? 0);
      const totalBudget       = Number(row?.[C.TOTAL_BUDGET]    ?? 0);

      return {
        teamName,
        totalBudget,
        confirmed: {
          mentoring:       Number(row?.[C.MENTORING_CONFIRMED] ?? 0),
          meeting:         Number(row?.[C.MEETING_CONFIRMED]   ?? 0),
          material:        Number(row?.[C.MATERIAL_CONFIRMED]  ?? 0),
          studentActivity: Number(row?.[C.STUDENT_CONFIRMED]   ?? 0),
          total:           confirmedTotal,
        },
        pending: {
          mentoring:       Number(row?.[C.MENTORING_PENDING] ?? 0),
          meeting:         Number(row?.[C.MEETING_PENDING]   ?? 0),
          material:        Number(row?.[C.MATERIAL_PENDING]  ?? 0),
          studentActivity: Number(row?.[C.STUDENT_PENDING]   ?? 0),
          total:           expectedTotal - confirmedTotal,
        },
        confirmedBalance: totalBudget - confirmedTotal,
        expectedBalance:  totalBudget - expectedTotal,
      } satisfies WeMeetTeamSummary;
    })
    .filter((r): r is WeMeetTeamSummary => r !== null);
}

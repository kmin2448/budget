import { getSheetsClient } from './sheets';
import {
  WEMEET_EXECUTION_RANGE,
  WEMEET_SUMMARY_RANGE,
  WEMEET_TEAM_LIST_RANGE,
  WEMEET_TEAM_INFO_RANGE,
  WEMEET_SUMMARY_COLS,
  WEMEET_MAX_TEAMS,
  WEMEET_MAX_ROWS,
} from '@/constants/wemeet';
import type { WeMeetExecution, WeMeetTeamSummary, WeMeetTeamInfo } from '@/types';

const SHEETS_ID = () => {
  const id = process.env.WEMEET_SHEETS_ID ?? process.env.GOOGLE_SHEETS_ID;
  if (!id) throw new Error('WEMEET_SHEETS_ID 또는 GOOGLE_SHEETS_ID 환경변수가 필요합니다.');
  return id;
};

// ── 집행현황 ──────────────────────────────────────────────────────────

export async function getWeMeetExecutions(): Promise<WeMeetExecution[]> {
  const sheets = getSheetsClient();
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEETS_ID(),
    range: '집행현황!A2:I200',
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
      draftAmount:     Number(row?.[2] ?? 0),   // C
      confirmed:       row?.[3] === true || row?.[3] === 'TRUE' || row?.[3] === 1, // D
      // E(idx4): 미확정금액 — 시트 수식값, 별도 저장 안 함
      confirmedAmount: Number(row?.[5] ?? 0),   // F
      usageDate:       String(row?.[6] ?? '').trim(), // G
      description:     String(row?.[7] ?? '').trim(), // H
      fileUrl:         String(row?.[8] ?? '').trim(), // I
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
  let lastFilledIdx = -1;
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    if (row?.some((c) => c !== null && c !== undefined && c !== '')) {
      lastFilledIdx = i;
    }
  }

  const nextRowNum = lastFilledIdx + 1 + 2;
  if (nextRowNum > WEMEET_MAX_ROWS + 1) {
    throw new Error(`집행현황 최대 행(${WEMEET_MAX_ROWS}행)을 초과했습니다.`);
  }

  await sheets.spreadsheets.values.update({
    spreadsheetId: SHEETS_ID(),
    range: `집행현황!A${nextRowNum}:I${nextRowNum}`,
    valueInputOption: 'RAW',
    requestBody: {
      values: [[
        data.usageType,                               // A
        data.teamName,                                // B
        data.draftAmount,                             // C: 기안금액
        data.confirmed,                               // D: 확정여부
        data.confirmed ? 0 : data.draftAmount,        // E: 미확정금액
        data.confirmed ? data.confirmedAmount : 0,    // F: 확정금액
        data.usageDate ?? '',                         // G: 사용일자
        data.description ?? '',                       // H: 지출건명
        data.fileUrl ?? '',                           // I: 증빙
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
    range: `집행현황!A${rowIndex}:I${rowIndex}`,
    valueInputOption: 'RAW',
    requestBody: {
      values: [[
        data.usageType,                            // A
        data.teamName,                             // B
        data.draftAmount,                          // C: 기안금액
        data.confirmed,                            // D: 확정여부
        data.confirmed ? 0 : data.draftAmount,     // E: 미확정금액
        data.confirmed ? data.confirmedAmount : 0, // F: 확정금액
        data.usageDate ?? '',                      // G: 사용일자
        data.description ?? '',                    // H: 지출건명
        data.fileUrl ?? '',                        // I: 증빙
      ]],
    },
  });
}

export async function updateWeMeetFileUrl(rowIndex: number, fileUrl: string): Promise<void> {
  const sheets = getSheetsClient();
  await sheets.spreadsheets.values.update({
    spreadsheetId: SHEETS_ID(),
    range: `집행현황!I${rowIndex}`,
    valueInputOption: 'RAW',
    requestBody: { values: [[fileUrl]] },
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

  const clearEnd = rows.length + 1;
  await sheets.spreadsheets.values.clear({
    spreadsheetId: SHEETS_ID(),
    range: `집행현황!A2:I${clearEnd}`,
  });

  if (filtered.length > 0) {
    const normalized = filtered.map((row) => {
      const r = [...row];
      while (r.length < 9) r.push('');
      return r.slice(0, 9);
    });
    await sheets.spreadsheets.values.update({
      spreadsheetId: SHEETS_ID(),
      range: `집행현황!A2:I${filtered.length + 1}`,
      valueInputOption: 'RAW',
      requestBody: { values: normalized },
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

// ── 팀 정보 ───────────────────────────────────────────────────────────

export async function getWeMeetTeamInfos(): Promise<WeMeetTeamInfo[]> {
  const sheets = getSheetsClient();
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEETS_ID(),
    range: WEMEET_TEAM_INFO_RANGE,
    valueRenderOption: 'UNFORMATTED_VALUE',
  });

  const rows = res.data.values ?? [];
  const result: WeMeetTeamInfo[] = [];

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const teamName = String(row?.[0] ?? '').trim();
    if (!teamName) continue;
    // K열(index 10)부터 개별 팀원 명단
    const memberList: string[] = [];
    for (let j = 10; j < (row?.length ?? 0); j++) {
      const v = String(row?.[j] ?? '').trim();
      if (v) memberList.push(v);
    }

    result.push({
      rowIndex:       i + 2,
      teamName,
      advisor:        String(row?.[1] ?? '').trim(),
      topic:          String(row?.[2] ?? '').trim(),
      mentorOrg:      String(row?.[3] ?? '').trim(),
      mentor:         String(row?.[4] ?? '').trim(),
      teamLeader:     String(row?.[5] ?? '').trim(),
      teamMembers:    String(row?.[6] ?? '').trim(),
      assistantMentor: String(row?.[7] ?? '').trim(),
      remarks:        String(row?.[9] ?? '').trim(),
      memberList,
    });
  }

  return result;
}

function colLetter(zeroIndex: number): string {
  let result = '';
  let n = zeroIndex;
  while (n >= 0) {
    result = String.fromCharCode((n % 26) + 65) + result;
    n = Math.floor(n / 26) - 1;
  }
  return result;
}

export async function upsertWeMeetTeamInfo(
  data: Omit<WeMeetTeamInfo, 'rowIndex'>,
  existingRowIndex?: number,
): Promise<void> {
  const sheets = getSheetsClient();

  let targetRow: number;

  if (existingRowIndex) {
    targetRow = existingRowIndex;
  } else {
    // 새 행: 마지막 채워진 행 다음
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId: SHEETS_ID(),
      range: WEMEET_TEAM_INFO_RANGE,
      valueRenderOption: 'UNFORMATTED_VALUE',
    });
    const rows = res.data.values ?? [];
    let lastIdx = -1;
    for (let i = 0; i < rows.length; i++) {
      if (rows[i]?.some((c) => c !== null && c !== undefined && c !== '')) {
        lastIdx = i;
      }
    }
    targetRow = lastIdx + 1 + 2;
  }

  const members = (data.memberList ?? []).filter((m) => m.trim() !== '');
  const endColIdx = members.length > 0 ? 9 + members.length : 9; // J=9, K=10, ...
  const endCol = colLetter(endColIdx);

  await sheets.spreadsheets.values.update({
    spreadsheetId: SHEETS_ID(),
    range: `팀정보!A${targetRow}:${endCol}${targetRow}`,
    valueInputOption: 'RAW',
    requestBody: {
      values: [[
        data.teamName,
        data.advisor,
        data.topic,
        data.mentorOrg,
        data.mentor,
        data.teamLeader,
        data.teamMembers,
        data.assistantMentor,
        '',           // I열 (빈칸)
        data.remarks,
        ...members,   // K열부터 팀원명단
      ]],
    },
  });
}

export async function deleteWeMeetTeamInfo(rowIndex: number): Promise<void> {
  const sheets = getSheetsClient();
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEETS_ID(),
    range: WEMEET_TEAM_INFO_RANGE,
    valueRenderOption: 'UNFORMATTED_VALUE',
  });

  const rows = res.data.values ?? [];
  const arrIdx = rowIndex - 2;
  const filtered = rows.filter((_, i) => i !== arrIdx);

  const clearEnd = rows.length + 1;
  await sheets.spreadsheets.values.clear({
    spreadsheetId: SHEETS_ID(),
    range: `팀정보!A2:Z${clearEnd}`,
  });

  if (filtered.length > 0) {
    await sheets.spreadsheets.values.update({
      spreadsheetId: SHEETS_ID(),
      range: `팀정보!A2:Z${filtered.length + 1}`,
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

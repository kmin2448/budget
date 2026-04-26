import { getSheetsClient } from './sheets';
import {
  WEMEET_EXECUTION_RANGE,
  WEMEET_SUMMARY_RANGE,
  WEMEET_TEAM_LIST_RANGE,
  WEMEET_TEAM_INFO_RANGE,
  WEMEET_SUMMARY_COLS,
  WEMEET_MAX_TEAMS,
  WEMEET_MAX_ROWS,
  WEMEET_NAMED_RANGES,
} from '@/constants/wemeet';
import type { WeMeetExecution, WeMeetTeamSummary, WeMeetTeamInfo } from '@/types';

const SHEETS_ID = () => {
  const id = process.env.WEMEET_SHEETS_ID ?? process.env.GOOGLE_SHEETS_ID;
  if (!id) throw new Error('WEMEET_SHEETS_ID 또는 GOOGLE_SHEETS_ID 환경변수가 필요합니다.');
  return id;
};

// ── 사용구분 목록 ─────────────────────────────────────────────────────

export async function getWeMeetUsageTypes(): Promise<string[]> {
  const sheets = getSheetsClient();
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEETS_ID(),
    range: WEMEET_NAMED_RANGES.USAGE_TYPE_LIST,
    valueRenderOption: 'UNFORMATTED_VALUE',
  });
  const rows = res.data.values ?? [];
  return rows
    .map((row) => String(row?.[0] ?? '').trim())
    .filter((v) => v !== '');
}

// ── 집행현황 ──────────────────────────────────────────────────────────
// 시트 컬럼: A=사용구분, B=지출건명, C=팀명, D=기안금액, E=확정금액, F=청구여부(TRUE/FALSE), G=사용일자, H=증빙제출(TRUE/FALSE)

function parseBool(v: unknown): boolean {
  return v === true || v === 'TRUE' || v === 1;
}

export async function getWeMeetExecutions(): Promise<WeMeetExecution[]> {
  const sheets = getSheetsClient();
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEETS_ID(),
    range: WEMEET_EXECUTION_RANGE,
    valueRenderOption: 'UNFORMATTED_VALUE',
  });

  const rows = res.data.values ?? [];
  const result: WeMeetExecution[] = [];

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const usageType = String(row?.[0] ?? '').trim();
    const teamName  = String(row?.[2] ?? '').trim();
    if (!usageType && !teamName) continue;

    result.push({
      rowIndex:          i + 2,
      usageType,
      description:       String(row?.[1] ?? '').trim(),  // B
      teamName,                                           // C
      draftAmount:       Number(row?.[3] ?? 0),          // D
      confirmedAmount:   Number(row?.[4] ?? 0),          // E
      claimed:           parseBool(row?.[5]),             // F
      usageDate:         String(row?.[6] ?? '').trim(),  // G
      evidenceSubmitted: parseBool(row?.[7]),             // H
      sent:              parseBool(row?.[8]),             // I
    });
  }

  return result;
}

export async function appendWeMeetExecution(data: Omit<WeMeetExecution, 'rowIndex' | 'sent'>): Promise<void> {
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
        data.usageType,          // A
        data.description,        // B
        data.teamName,           // C
        data.draftAmount,        // D
        data.confirmedAmount,    // E
        data.claimed,            // F
        data.usageDate ?? '',    // G
        data.evidenceSubmitted,  // H
        false,                   // I: 보내기여부 (신규 = false)
      ]],
    },
  });
}

export async function updateWeMeetExecution(
  rowIndex: number,
  data: Omit<WeMeetExecution, 'rowIndex' | 'sent'>,
): Promise<void> {
  const sheets = getSheetsClient();
  await sheets.spreadsheets.values.update({
    spreadsheetId: SHEETS_ID(),
    range: `집행현황!A${rowIndex}:H${rowIndex}`,
    valueInputOption: 'RAW',
    requestBody: {
      values: [[
        data.usageType,          // A
        data.description,        // B
        data.teamName,           // C
        data.draftAmount,        // D
        data.confirmedAmount,    // E
        data.claimed,            // F
        data.usageDate ?? '',    // G
        data.evidenceSubmitted,  // H
      ]],
    },
  });
}

export async function updateWeMeetEvidenceSubmitted(rowIndex: number, submitted: boolean): Promise<void> {
  const sheets = getSheetsClient();
  await sheets.spreadsheets.values.update({
    spreadsheetId: SHEETS_ID(),
    range: `집행현황!H${rowIndex}`,
    valueInputOption: 'RAW',
    requestBody: { values: [[submitted]] },
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
  const arrIdx = rowIndex - 2;
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
  const arrIdx = rowIndex - 3;
  const filtered = rows.filter((_, i) => i !== arrIdx);

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
    const memberList: string[] = [];
    for (let j = 10; j < (row?.length ?? 0); j++) {
      const v = String(row?.[j] ?? '').trim();
      if (v) memberList.push(v);
    }

    result.push({
      rowIndex:        i + 2,
      teamName,
      advisor:         String(row?.[1] ?? '').trim(),
      topic:           String(row?.[2] ?? '').trim(),
      mentorOrg:       String(row?.[3] ?? '').trim(),
      mentor:          String(row?.[4] ?? '').trim(),
      teamLeader:      String(row?.[5] ?? '').trim(),
      teamMembers:     String(row?.[6] ?? '').trim(),
      assistantMentor: String(row?.[7] ?? '').trim(),
      remarks:         String(row?.[9] ?? '').trim(),
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
  const endColIdx = members.length > 0 ? 9 + members.length : 9;
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
        '',
        data.remarks,
        ...members,
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

// ── 집행현황 전체 순서 재정렬 ─────────────────────────────────────────

export async function reorderWeMeetExecutions(
  orderedRows: WeMeetExecution[],
): Promise<void> {
  if (orderedRows.length === 0) return;

  const sheets = getSheetsClient();
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEETS_ID(),
    range: WEMEET_EXECUTION_RANGE,
    valueRenderOption: 'UNFORMATTED_VALUE',
  });

  const currentRows = res.data.values ?? [];
  const clearEnd = Math.max(currentRows.length + 1, orderedRows.length + 1);

  await sheets.spreadsheets.values.clear({
    spreadsheetId: SHEETS_ID(),
    range: `집행현황!A2:I${clearEnd}`,
  });

  const values = orderedRows.map((data) => [
    data.usageType,
    data.description,
    data.teamName,
    data.draftAmount,
    data.confirmedAmount,
    data.claimed,
    data.usageDate ?? '',
    data.evidenceSubmitted,
    data.sent ?? false,
  ]);

  await sheets.spreadsheets.values.update({
    spreadsheetId: SHEETS_ID(),
    range: `집행현황!A2:I${orderedRows.length + 1}`,
    valueInputOption: 'RAW',
    requestBody: { values },
  });
}

// ── 집행현황 보내기여부 일괄 표시 ─────────────────────────────────────

export async function markWeMeetExecutionsSent(rowIndexes: number[]): Promise<void> {
  if (rowIndexes.length === 0) return;
  const sheets = getSheetsClient();
  await sheets.spreadsheets.values.batchUpdate({
    spreadsheetId: SHEETS_ID(),
    requestBody: {
      valueInputOption: 'RAW',
      data: rowIndexes.map((ri) => ({
        range: `집행현황!I${ri}`,
        values: [[true]],
      })),
    },
  });
}

// ── 다중 행 일괄 추가 ─────────────────────────────────────────────────

export async function bulkAppendWeMeetExecutions(
  items: Array<Omit<WeMeetExecution, 'rowIndex' | 'sent'>>,
): Promise<void> {
  if (items.length === 0) return;

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
  const endRowNum  = nextRowNum + items.length - 1;

  if (endRowNum > WEMEET_MAX_ROWS + 1) {
    throw new Error(`집행현황 최대 행(${WEMEET_MAX_ROWS}행)을 초과했습니다.`);
  }

  const values = items.map((data) => [
    data.usageType,
    data.description,
    data.teamName,
    data.draftAmount,
    data.confirmedAmount,
    data.claimed,
    data.usageDate ?? '',
    data.evidenceSubmitted,
    false,  // I: 보내기여부 (신규 = false)
  ]);

  await sheets.spreadsheets.values.update({
    spreadsheetId: SHEETS_ID(),
    range: `집행현황!A${nextRowNum}:I${endRowNum}`,
    valueInputOption: 'RAW',
    requestBody: { values },
  });
}

// ── 팀별 요약 ─────────────────────────────────────────────────────────
// 팀별취합 시트: A=팀명, B=총예산, C=잔액, D~F=멘토링, G~I=회의비, J~L=재료비, M~O=학생활동지원비
// 각 3열: (기안금액, 확정금액, 미청구금액)

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

      return {
        teamName,
        totalBudget: Number(row?.[C.TOTAL_BUDGET] ?? 0),
        balance:     Number(row?.[C.BALANCE]       ?? 0),
        mentoring: {
          draft:     Number(row?.[C.MENTORING_DRAFT]      ?? 0),
          confirmed: Number(row?.[C.MENTORING_CONFIRMED]  ?? 0),
          claimed:   Number(row?.[C.MENTORING_CLAIMED]    ?? 0),
        },
        meeting: {
          draft:     Number(row?.[C.MEETING_DRAFT]        ?? 0),
          confirmed: Number(row?.[C.MEETING_CONFIRMED]    ?? 0),
          claimed:   Number(row?.[C.MEETING_CLAIMED]      ?? 0),
        },
        material: {
          draft:     Number(row?.[C.MATERIAL_DRAFT]       ?? 0),
          confirmed: Number(row?.[C.MATERIAL_CONFIRMED]   ?? 0),
          claimed:   Number(row?.[C.MATERIAL_CLAIMED]     ?? 0),
        },
        studentActivity: {
          draft:     Number(row?.[C.STUDENT_DRAFT]        ?? 0),
          confirmed: Number(row?.[C.STUDENT_CONFIRMED]    ?? 0),
          claimed:   Number(row?.[C.STUDENT_CLAIMED]      ?? 0),
        },
      } satisfies WeMeetTeamSummary;
    })
    .filter((r): r is WeMeetTeamSummary => r !== null);
}

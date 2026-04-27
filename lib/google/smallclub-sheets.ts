import { getSheetsClient } from './sheets';
import {
  SMALL_CLUB_EXECUTION_RANGE,
  SMALL_CLUB_SUMMARY_RANGE,
  SMALL_CLUB_TEAM_LIST_RANGE,
  SMALL_CLUB_TEAM_INFO_RANGE,
  SMALL_CLUB_SUMMARY_COLS,
  SMALL_CLUB_MAX_TEAMS,
  SMALL_CLUB_MAX_ROWS,
  SMALL_CLUB_NAMED_RANGES,
  SMALL_CLUB_USAGE_TYPES,
} from '@/constants/smallclub';
import type { WeMeetExecution, WeMeetTeamSummary, WeMeetTeamInfo } from '@/types';

const SHEETS_ID = () => {
  const id = process.env.SMALL_CLUB_SHEETS_ID ?? process.env.GOOGLE_SHEETS_ID;
  if (!id) throw new Error('SMALL_CLUB_SHEETS_ID 또는 GOOGLE_SHEETS_ID 환경변수가 필요합니다.');
  return id;
};

// ── 사용구분 목록 ─────────────────────────────────────────────────────

export async function getSmallClubUsageTypes(): Promise<string[]> {
  try {
    const sheets = getSheetsClient();
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId: SHEETS_ID(),
      range: SMALL_CLUB_NAMED_RANGES.USAGE_TYPE_LIST,
      valueRenderOption: 'UNFORMATTED_VALUE',
    });
    const rows = res.data.values ?? [];
    const values = rows
      .map((row) => String(row?.[0] ?? '').trim())
      .filter((v) => v !== '');
    return values.length > 0 ? values : [...SMALL_CLUB_USAGE_TYPES];
  } catch {
    return [...SMALL_CLUB_USAGE_TYPES];
  }
}

// ── 집행현황 ──────────────────────────────────────────────────────────

function parseBool(v: unknown): boolean {
  return v === true || v === 'TRUE' || v === 1;
}

export async function getSmallClubExecutions(): Promise<WeMeetExecution[]> {
  const sheets = getSheetsClient();
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEETS_ID(),
    range: SMALL_CLUB_EXECUTION_RANGE,
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
      description:       String(row?.[1] ?? '').trim(),
      teamName,
      draftAmount:       Number(row?.[3] ?? 0),
      confirmedAmount:   Number(row?.[4] ?? 0),
      claimed:           parseBool(row?.[5]),
      remarks:           String(row?.[6] ?? '').trim(),
      evidenceSubmitted: parseBool(row?.[7]),
      sent:              parseBool(row?.[8]),
    });
  }

  return result;
}

export async function appendSmallClubExecution(data: Omit<WeMeetExecution, 'rowIndex' | 'sent'>): Promise<void> {
  const sheets = getSheetsClient();
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEETS_ID(),
    range: SMALL_CLUB_EXECUTION_RANGE,
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
  if (nextRowNum > SMALL_CLUB_MAX_ROWS + 1) {
    throw new Error(`집행현황 최대 행(${SMALL_CLUB_MAX_ROWS}행)을 초과했습니다.`);
  }

  await sheets.spreadsheets.values.update({
    spreadsheetId: SHEETS_ID(),
    range: `집행현황!A${nextRowNum}:I${nextRowNum}`,
    valueInputOption: 'RAW',
    requestBody: {
      values: [[
        data.usageType,
        data.description,
        data.teamName,
        data.draftAmount,
        data.confirmedAmount,
        data.claimed,
        data.remarks ?? '',
        data.evidenceSubmitted,
        false,
      ]],
    },
  });
}

export async function updateSmallClubExecution(
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
        data.usageType,
        data.description,
        data.teamName,
        data.draftAmount,
        data.confirmedAmount,
        data.claimed,
        data.remarks ?? '',
        data.evidenceSubmitted,
      ]],
    },
  });
}

export async function deleteSmallClubExecution(rowIndex: number): Promise<void> {
  const sheets = getSheetsClient();
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEETS_ID(),
    range: SMALL_CLUB_EXECUTION_RANGE,
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

export async function getSmallClubTeams(): Promise<Array<{ teamName: string; rowIndex: number }>> {
  const sheets = getSheetsClient();
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEETS_ID(),
    range: SMALL_CLUB_TEAM_LIST_RANGE,
    valueRenderOption: 'UNFORMATTED_VALUE',
  });

  const rows = res.data.values ?? [];
  return rows
    .map((row, i) => ({ teamName: String(row?.[0] ?? '').trim(), rowIndex: i + 3 }))
    .filter((t) => t.teamName !== '');
}

// 상대참조 행 번호만 rowDelta만큼 조정 (절대참조 $는 유지)
function adjustFormulaRow(formula: string, rowDelta: number): string {
  if (!formula.startsWith('=')) return formula;
  let out = '';
  let inStr = false;
  for (let i = 0; i < formula.length; ) {
    const ch = formula[i] as string;
    if (ch === '"') {
      inStr = !inStr;
      out += ch;
      i++;
    } else if (inStr) {
      out += ch;
      i++;
    } else {
      const m = /^(\$?[A-Z]+)(\$?)(\d+)/.exec(formula.slice(i));
      if (m) {
        const full = m[0]!;
        const col  = m[1]!;
        const rowAbsMarker = m[2]!;
        const rowNum = m[3]!;
        out += rowAbsMarker === '$'
          ? full
          : `${col}${parseInt(rowNum, 10) + rowDelta}`;
        i += full.length;
      } else {
        out += ch;
        i++;
      }
    }
  }
  return out;
}

export async function appendSmallClubTeam(teamName: string): Promise<void> {
  const teams = await getSmallClubTeams();

  if (teams.length >= SMALL_CLUB_MAX_TEAMS) {
    throw new Error(`소학회는 최대 ${SMALL_CLUB_MAX_TEAMS}개까지 추가할 수 있습니다.`);
  }

  const sheets = getSheetsClient();

  if (teams.length === 0) {
    await sheets.spreadsheets.values.update({
      spreadsheetId: SHEETS_ID(),
      range: `팀별취합!A3`,
      valueInputOption: 'RAW',
      requestBody: { values: [[teamName]] },
    });
    return;
  }

  const lastTeam = teams[teams.length - 1]!;
  const sourceRow = lastTeam.rowIndex;
  const targetRow = sourceRow + 1;

  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEETS_ID(),
    range: `팀별취합!A${sourceRow}:Z${sourceRow}`,
    valueRenderOption: 'FORMULA',
  });

  const sourceValues = res.data.values?.[0] ?? [];

  const newRow: (string | number | boolean)[] = sourceValues.map((cell, colIdx) => {
    if (colIdx === 0) return teamName;
    const s = String(cell ?? '');
    return s.startsWith('=') ? adjustFormulaRow(s, 1) : '';
  });
  if (newRow.length === 0) newRow.push(teamName);

  await sheets.spreadsheets.values.update({
    spreadsheetId: SHEETS_ID(),
    range: `팀별취합!A${targetRow}`,
    valueInputOption: 'USER_ENTERED',
    requestBody: { values: [newRow] },
  });
}

export async function deleteSmallClubTeam(rowIndex: number): Promise<void> {
  const sheets = getSheetsClient();
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEETS_ID(),
    range: SMALL_CLUB_TEAM_LIST_RANGE,
    valueRenderOption: 'UNFORMATTED_VALUE',
  });

  const rows = res.data.values ?? [];
  const arrIdx = rowIndex - 3;
  const filtered = rows.filter((_, i) => i !== arrIdx);

  await sheets.spreadsheets.values.clear({
    spreadsheetId: SHEETS_ID(),
    range: SMALL_CLUB_TEAM_LIST_RANGE,
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

export async function getSmallClubTeamInfos(): Promise<WeMeetTeamInfo[]> {
  const sheets = getSheetsClient();
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEETS_ID(),
    range: SMALL_CLUB_TEAM_INFO_RANGE,
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

export async function upsertSmallClubTeamInfo(
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
      range: SMALL_CLUB_TEAM_INFO_RANGE,
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

export async function deleteSmallClubTeamInfo(rowIndex: number): Promise<void> {
  const sheets = getSheetsClient();
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEETS_ID(),
    range: SMALL_CLUB_TEAM_INFO_RANGE,
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

export async function reorderSmallClubExecutions(
  orderedRows: WeMeetExecution[],
): Promise<void> {
  if (orderedRows.length === 0) return;

  const sheets = getSheetsClient();
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEETS_ID(),
    range: SMALL_CLUB_EXECUTION_RANGE,
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
    data.remarks ?? '',
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

export async function markSmallClubExecutionsSent(rowIndexes: number[]): Promise<void> {
  if (rowIndexes.length === 0) return;
  const sheets = getSheetsClient();
  await sheets.spreadsheets.values.batchUpdate({
    spreadsheetId: SHEETS_ID(),
    requestBody: {
      valueInputOption: 'RAW',
      data: rowIndexes.flatMap((ri) => [
        { range: `집행현황!F${ri}`, values: [[true]] },
        { range: `집행현황!I${ri}`, values: [[true]] },
      ]),
    },
  });
}

// ── 집행현황 보내기여부·청구여부 일괄 취소 ────────────────────────────

export async function unmarkSmallClubExecutionsSent(rowIndexes: number[]): Promise<void> {
  if (rowIndexes.length === 0) return;
  const sheets = getSheetsClient();
  await sheets.spreadsheets.values.batchUpdate({
    spreadsheetId: SHEETS_ID(),
    requestBody: {
      valueInputOption: 'RAW',
      data: rowIndexes.flatMap((ri) => [
        { range: `집행현황!F${ri}`, values: [[false]] },
        { range: `집행현황!I${ri}`, values: [[false]] },
      ]),
    },
  });
}

// ── 다중 행 일괄 추가 ─────────────────────────────────────────────────

export async function bulkAppendSmallClubExecutions(
  items: Array<Omit<WeMeetExecution, 'rowIndex' | 'sent'>>,
): Promise<void> {
  if (items.length === 0) return;

  const sheets = getSheetsClient();
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEETS_ID(),
    range: SMALL_CLUB_EXECUTION_RANGE,
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

  if (endRowNum > SMALL_CLUB_MAX_ROWS + 1) {
    throw new Error(`집행현황 최대 행(${SMALL_CLUB_MAX_ROWS}행)을 초과했습니다.`);
  }

  const values = items.map((data) => [
    data.usageType,
    data.description,
    data.teamName,
    data.draftAmount,
    data.confirmedAmount,
    data.claimed,
    data.remarks ?? '',
    data.evidenceSubmitted,
    false,
  ]);

  await sheets.spreadsheets.values.update({
    spreadsheetId: SHEETS_ID(),
    range: `집행현황!A${nextRowNum}:I${endRowNum}`,
    valueInputOption: 'RAW',
    requestBody: { values },
  });
}

// ── 팀별 요약 ─────────────────────────────────────────────────────────

export async function getSmallClubSummary(): Promise<WeMeetTeamSummary[]> {
  const sheets = getSheetsClient();
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEETS_ID(),
    range: SMALL_CLUB_SUMMARY_RANGE,
    valueRenderOption: 'UNFORMATTED_VALUE',
  });

  const rows = res.data.values ?? [];
  const C = SMALL_CLUB_SUMMARY_COLS;

  return rows
    .map((row) => {
      const teamName = String(row?.[C.TEAM_NAME] ?? '').trim();
      if (!teamName) return null;

      return {
        teamName,
        totalBudget: Number(row?.[C.TOTAL_BUDGET] ?? 0),
        balance:     Number(row?.[C.BALANCE]       ?? 0),
        mentoring: {
          draft:     Number(row?.[C.MENTORING_DRAFT]     ?? 0),
          confirmed: Number(row?.[C.MENTORING_CONFIRMED] ?? 0),
          claimed:   Number(row?.[C.MENTORING_CLAIMED]   ?? 0),
        },
        meeting: {
          draft:     Number(row?.[C.MEETING_DRAFT]       ?? 0),
          confirmed: Number(row?.[C.MEETING_CONFIRMED]   ?? 0),
          claimed:   Number(row?.[C.MEETING_CLAIMED]     ?? 0),
        },
        material: {
          draft:     Number(row?.[C.MATERIAL_DRAFT]      ?? 0),
          confirmed: Number(row?.[C.MATERIAL_CONFIRMED]  ?? 0),
          claimed:   Number(row?.[C.MATERIAL_CLAIMED]    ?? 0),
        },
        studentActivity: {
          draft:     Number(row?.[C.STUDENT_DRAFT]       ?? 0),
          confirmed: Number(row?.[C.STUDENT_CONFIRMED]   ?? 0),
          claimed:   Number(row?.[C.STUDENT_CLAIMED]     ?? 0),
        },
      } satisfies WeMeetTeamSummary;
    })
    .filter((r): r is WeMeetTeamSummary => r !== null);
}

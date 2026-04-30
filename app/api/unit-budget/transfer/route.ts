import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getSheetsClient, readNamedRange, appendBudgetHistoryRows } from '@/lib/google/sheets';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { checkPermission } from '@/lib/permissions';
import { getSpreadsheetId } from '@/lib/google/getSheetId';
import { NAMED_RANGES } from '@/constants/sheets';
import { PERMISSIONS } from '@/types';
import type { BudgetType, TransferItem, BudgetDetailRow, BudgetCategoryRow } from '@/types';

export const dynamic = 'force-dynamic';

const EXEC_SHEET = "'집행내역 정리'";
const STAR_SHEET = "'★취합'";

interface TransferRequestBody {
  transfers: TransferItem[];
  changedAt: string;
  sheetType?: BudgetType;
}

// ★취합 시트의 현재 allocation 상태 읽기 (rowOffset 기준)
async function readAllocationState(spreadsheetId: string): Promise<{
  categories: string[];
  subcategories: string[];
  subDetails: string[];
  allocations: number[];
}> {
  const [catRes, subcatRes, subdetRes, allocRes] = await Promise.all([
    readNamedRange(NAMED_RANGES.ENAARA_CATEGORY, spreadsheetId),
    readNamedRange(NAMED_RANGES.ENAARA_SUBCATEGORY, spreadsheetId),
    readNamedRange(NAMED_RANGES.ENAARA_DETAIL, spreadsheetId),
    readNamedRange(NAMED_RANGES.ALLOCATION, spreadsheetId),
  ]);

  const len = Math.max(catRes.length, allocRes.length, 24);
  return {
    categories:   Array.from({ length: len }, (_, i) => String(catRes[i]?.[0] ?? '').trim()),
    subcategories: Array.from({ length: len }, (_, i) => String(subcatRes[i]?.[0] ?? '').trim()),
    subDetails:   Array.from({ length: len }, (_, i) => String(subdetRes[i]?.[0] ?? '').trim()),
    allocations:  Array.from({ length: len }, (_, i) => Number(allocRes[i]?.[0] ?? 0)),
  };
}

export async function POST(req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.email) {
      return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 });
    }

    const hasPermission = await checkPermission(session.user.email, PERMISSIONS.BUDGET_WRITE);
    if (!hasPermission) {
      return NextResponse.json({ error: '예산관리 편집 권한이 없습니다.' }, { status: 403 });
    }

    const body = await req.json() as TransferRequestBody;
    const { transfers, changedAt } = body;
    const sheetType: BudgetType = body.sheetType ?? 'main';

    if (!Array.isArray(transfers) || transfers.length === 0) {
      return NextResponse.json({ error: '이체 데이터가 없습니다.' }, { status: 400 });
    }
    if (!changedAt) {
      return NextResponse.json({ error: 'changedAt이 필요합니다.' }, { status: 400 });
    }

    const SPREADSHEET_ID = await getSpreadsheetId(sheetType);
    const sheets = getSheetsClient();

    // ── 1. ★취합 현재 상태 읽기 ──────────────────────────────────
    const state = await readAllocationState(SPREADSHEET_ID);
    const { categories, subcategories, subDetails } = state;
    const allocations = [...state.allocations]; // 변경 전 복사본

    // rowOffset 조회 맵
    const offsetMap = new Map<string, number>();
    for (let i = 0; i < categories.length; i++) {
      if (!categories[i]) continue;
      offsetMap.set(`${categories[i]}||${subcategories[i]}||${subDetails[i]}`, i);
    }

    // ── 2. 유효성 검사 ────────────────────────────────────────────
    for (const t of transfers) {
      if (t.amount <= 0) {
        return NextResponse.json({ error: `이체 금액은 0보다 커야 합니다.` }, { status: 400 });
      }

      const fromKey = `${t.fromCategory}||${t.fromSubcategory}||${t.fromSubDetail}`;
      const fromOffset = offsetMap.get(fromKey);
      if (fromOffset === undefined) {
        return NextResponse.json(
          { error: `출발 항목을 ★취합 시트에서 찾을 수 없습니다: ${t.fromCategory} > ${t.fromSubcategory} > ${t.fromSubDetail}` },
          { status: 400 },
        );
      }
      if (allocations[fromOffset] < t.amount) {
        return NextResponse.json(
          { error: `출발 편성액(${allocations[fromOffset].toLocaleString('ko-KR')}원)이 이체 금액(${t.amount.toLocaleString('ko-KR')}원)보다 적습니다.` },
          { status: 400 },
        );
      }

      const deductSum = t.sourceProgramAllocations.reduce((s, p) => s + p.deductAmount, 0);
      if (deductSum !== t.amount) {
        return NextResponse.json(
          { error: `출발 프로그램 차감 합계(${deductSum.toLocaleString('ko-KR')}원)가 이체 금액(${t.amount.toLocaleString('ko-KR')}원)과 일치하지 않습니다.` },
          { status: 400 },
        );
      }
    }

    // ── 3. 할당량 변경 계획 수립 ──────────────────────────────────
    // 누적 변경 맵 (rowOffset → delta)
    const allocationDeltas = new Map<number, number>();
    // 신규 행 추가 목록 (key → { cat, subcat, subdet, amount })
    const newRows: { key: string; cat: string; subcat: string; subdet: string; amount: number }[] = [];

    for (const t of transfers) {
      const fromKey = `${t.fromCategory}||${t.fromSubcategory}||${t.fromSubDetail}`;
      const fromOffset = offsetMap.get(fromKey)!;
      allocationDeltas.set(fromOffset, (allocationDeltas.get(fromOffset) ?? 0) - t.amount);

      const toKey = `${t.toCategory}||${t.toSubcategory}||${t.toSubDetail}`;
      const toOffset = offsetMap.get(toKey);

      if (toOffset !== undefined) {
        allocationDeltas.set(toOffset, (allocationDeltas.get(toOffset) ?? 0) + t.amount);
      } else {
        // 신규 행 (기존 newRows에 같은 key가 있으면 합산)
        const existing = newRows.find((r) => r.key === toKey);
        if (existing) {
          existing.amount += t.amount;
        } else {
          newRows.push({
            key: toKey,
            cat: t.toCategory,
            subcat: t.toSubcategory,
            subdet: t.toSubDetail,
            amount: t.amount,
          });
        }
      }
    }

    // ── 4. ★취합 편성액 업데이트 ─────────────────────────────────
    // 기존 행 업데이트
    const allocationUpdateData: { range: string; values: (number | null)[][] }[] = [];
    Array.from(allocationDeltas.entries()).forEach(([offset, delta]) => {
      const newValue = allocations[offset] + delta;
      allocationUpdateData.push({
        range: `${STAR_SHEET}!F${offset + 3}`,
        values: [[newValue]],
      });
    });

    if (allocationUpdateData.length > 0) {
      await sheets.spreadsheets.values.batchUpdate({
        spreadsheetId: SPREADSHEET_ID,
        requestBody: {
          valueInputOption: 'RAW',
          data: allocationUpdateData,
        },
      });
    }

    // 신규 행 추가 (빈 rowOffset 찾아서 비목/세목/보조세목 + 편성액 기록)
    if (newRows.length > 0) {
      // 현재 상태에서 빈 rowOffset 목록
      const emptyOffsets: number[] = [];
      for (let i = 0; i < categories.length; i++) {
        if (!categories[i]) emptyOffsets.push(i);
      }

      if (emptyOffsets.length < newRows.length) {
        return NextResponse.json(
          { error: '★취합 시트에 신규 항목을 추가할 빈 행이 부족합니다. 관리자에게 문의하세요.' },
          { status: 500 },
        );
      }

      const newRowData: { range: string; values: (string | number | null)[][] }[] = [];
      newRows.forEach((nr, i) => {
        const emptyOffset = emptyOffsets[i];
        const sheetRow = emptyOffset + 3;
        newRowData.push(
          { range: `${STAR_SHEET}!B${sheetRow}`, values: [[nr.cat]] },
          { range: `${STAR_SHEET}!C${sheetRow}`, values: [[nr.subcat]] },
          { range: `${STAR_SHEET}!D${sheetRow}`, values: [[nr.subdet]] },
          { range: `${STAR_SHEET}!F${sheetRow}`, values: [[nr.amount]] },
        );
        // 맵에 추가 (이후 snapshot 생성에 사용)
        offsetMap.set(nr.key, emptyOffset);
        categories[emptyOffset] = nr.cat;
        subcategories[emptyOffset] = nr.subcat;
        subDetails[emptyOffset] = nr.subdet;
        allocations[emptyOffset] = nr.amount;
      });

      await sheets.spreadsheets.values.batchUpdate({
        spreadsheetId: SPREADSHEET_ID,
        requestBody: { valueInputOption: 'USER_ENTERED', data: newRowData },
      });
    }

    // ── 5. 프로그램 budgetPlan 업데이트 (집행내역 정리 L열) ─────────
    const programUpdateData: { range: string; values: (number | null)[][] }[] = [];
    for (const t of transfers) {
      for (const prog of t.sourceProgramAllocations) {
        if (prog.deductAmount === 0) continue;
        // L열 = 12번째 열 (A=1)
        programUpdateData.push({
          range: `${EXEC_SHEET}!L${prog.rowIndex}`,
          values: [[prog.deductAmount * -1]], // 차감값으로 변환 (읽어서 빼야 하므로 별도 처리)
        });
      }
    }

    // 프로그램 차감: 현재값 읽기 후 차감
    if (programUpdateData.length > 0) {
      const progRanges = transfers.flatMap((t) =>
        t.sourceProgramAllocations
          .filter((p) => p.deductAmount > 0)
          .map((p) => `${EXEC_SHEET}!L${p.rowIndex}`),
      );

      const progRes = await sheets.spreadsheets.values.batchGet({
        spreadsheetId: SPREADSHEET_ID,
        ranges: progRanges,
        valueRenderOption: 'UNFORMATTED_VALUE',
      });

      const progCurrentValues = progRes.data.valueRanges ?? [];
      const progWriteData: { range: string; values: (number | null)[][] }[] = [];

      let rangeIdx = 0;
      for (const t of transfers) {
        for (const prog of t.sourceProgramAllocations) {
          if (prog.deductAmount <= 0) continue;
          const current = Number(progCurrentValues[rangeIdx]?.values?.[0]?.[0] ?? 0);
          const newVal = Math.max(0, current - prog.deductAmount);
          progWriteData.push({
            range: `${EXEC_SHEET}!L${prog.rowIndex}`,
            values: [[newVal]],
          });
          rangeIdx++;
        }
      }

      if (progWriteData.length > 0) {
        await sheets.spreadsheets.values.batchUpdate({
          spreadsheetId: SPREADSHEET_ID,
          requestBody: { valueInputOption: 'RAW', data: progWriteData },
        });
      }
    }

    // ── 6. 변경이력 저장 ──────────────────────────────────────────
    const supabase = createServerSupabaseClient();
    const { data: user } = await supabase
      .from('users')
      .select('id, name')
      .eq('email', session.user.email)
      .single();

    // 변경 전/후 snapshot 구성 (영향 받은 rowOffset 기준)
    const affectedOffsets = new Set<number>();
    for (const t of transfers) {
      const fromOff = offsetMap.get(`${t.fromCategory}||${t.fromSubcategory}||${t.fromSubDetail}`);
      const toOff   = offsetMap.get(`${t.toCategory}||${t.toSubcategory}||${t.toSubDetail}`);
      if (fromOff !== undefined) affectedOffsets.add(fromOff);
      if (toOff   !== undefined) affectedOffsets.add(toOff);
    }

    // 업데이트된 편성액 계산
    const updatedAllocations = [...allocations];
    Array.from(allocationDeltas.entries()).forEach(([offset, delta]) => {
      updatedAllocations[offset] = allocations[offset] + delta;
    });
    newRows.forEach((nr) => {
      const off = offsetMap.get(nr.key);
      if (off !== undefined) updatedAllocations[off] = nr.amount;
    });

    const detailSnapshot: BudgetDetailRow[] = Array.from(affectedOffsets)
      .map((offset) => {
        const beforeAlloc = allocations[offset];
        const delta = allocationDeltas.get(offset) ?? (newRows.some((r) => offsetMap.get(r.key) === offset) ? updatedAllocations[offset] : 0);
        return {
          rowOffset: offset,
          category: categories[offset],
          subcategory: subcategories[offset],
          subDetail: subDetails[offset],
          allocation: beforeAlloc,
          adjustment: delta,
          afterAllocation: beforeAlloc + delta,
          executionComplete: 0,
          executionPlanned: 0,
          balance: beforeAlloc + delta,
          executionRate: 0,
        };
      });

    // 비목별 요약 (categorySnapshot)
    const catMap = new Map<string, { before: number; delta: number }>();
    Array.from(affectedOffsets).forEach((offset) => {
      const cat = categories[offset];
      if (!catMap.has(cat)) catMap.set(cat, { before: 0, delta: 0 });
      const entry = catMap.get(cat)!;
      entry.before += allocations[offset];
      entry.delta += allocationDeltas.get(offset) ?? 0;
    });
    const categorySnapshot: BudgetCategoryRow[] = Array.from(catMap.entries()).map(
      ([category, { before, delta }]) => ({
        category,
        allocation: before,
        adjustment: delta,
        afterAllocation: before + delta,
        executionComplete: 0,
        executionPlanned: 0,
        balance: before + delta,
        executionRate: 0,
      }),
    );

    const totalBefore = categorySnapshot.reduce((s, r) => s + r.allocation, 0);
    const totalAdj    = categorySnapshot.reduce((s, r) => s + r.adjustment, 0);
    const totalAfter  = categorySnapshot.reduce((s, r) => s + r.afterAllocation, 0);

    const repCategory = Array.from(new Set(transfers.flatMap((t) => [t.fromCategory, t.toCategory]))).join(', ');

    const snapshotObj = {
      categorySnapshot,
      detailSnapshot,
      transfers,
      type: 'unit-task-transfer',
    };

    const { error: insertError } = await supabase.from('budget_change_history').insert([{
      changed_at:    changedAt,
      changed_by:    user?.id ?? null,
      category:      repCategory,
      before_amount: totalBefore,
      adjustment:    totalAdj,
      after_amount:  totalAfter,
      pdf_drive_url: null,
      snapshot:      snapshotObj as unknown as Record<string, unknown>,
    }]);

    if (insertError) {
      console.error('Supabase insert error:', insertError);
      return NextResponse.json(
        { error: `DB 저장 오류: ${insertError.message}` },
        { status: 500 },
      );
    }

    // Google Sheets 예산변경이력 시트 누적 저장
    const confirmedBy = user?.name ?? session.user.email;
    await appendBudgetHistoryRows(
      detailSnapshot
        .filter((r) => r.adjustment !== 0)
        .map((row) => ({
          changedAt,
          category:          row.category,
          subcategory:       row.subcategory,
          subDetail:         row.subDetail,
          beforeAmount:      row.allocation,
          adjustment:        row.adjustment,
          afterAmount:       row.afterAllocation,
          executionComplete: 0,
          executionPlanned:  0,
          balance:           row.afterAllocation,
          executionRate:     0,
          confirmedBy,
        })),
    );

    return NextResponse.json({ message: '단위과제 예산 이체가 완료되었습니다.' });
  } catch (error) {
    console.error('Unit budget transfer POST error:', error);
    const msg = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: `이체 처리 오류: ${msg}` }, { status: 500 });
  }
}

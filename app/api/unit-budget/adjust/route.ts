import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getSheetsClient, appendBudgetHistoryRows } from '@/lib/google/sheets';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { checkPermission } from '@/lib/permissions';
import { getSpreadsheetId } from '@/lib/google/getSheetId';
import { PERMISSIONS } from '@/types';
import type { BudgetType } from '@/types';

export const dynamic = 'force-dynamic';

const EXEC_SHEET = "'집행내역 정리'";

interface AdjustItem {
  rowIndex: number;
  programName: string;
  unitName: string;
  category: string;
  subcategory: string;
  subDetail: string;
  before: number;
  adjustment: number;
}

interface AdjustRequestBody {
  items: AdjustItem[];
  changedAt: string;
  sheetType?: BudgetType;
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

    const body = await req.json() as AdjustRequestBody;
    const { items, changedAt } = body;
    const sheetType: BudgetType = body.sheetType ?? 'main';

    if (!Array.isArray(items) || items.length === 0) {
      return NextResponse.json({ error: '증감 데이터가 없습니다.' }, { status: 400 });
    }
    if (!changedAt) {
      return NextResponse.json({ error: 'changedAt이 필요합니다.' }, { status: 400 });
    }

    const validItems = items.filter((i) => i.adjustment !== 0);
    if (validItems.length === 0) {
      return NextResponse.json({ error: '0이 아닌 증감 항목이 없습니다.' }, { status: 400 });
    }

    const SPREADSHEET_ID = await getSpreadsheetId(sheetType);
    const sheets = getSheetsClient();

    // 1. 현재 L열 값 일괄 읽기
    const ranges = validItems.map((item) => `${EXEC_SHEET}!L${item.rowIndex}`);
    const readRes = await sheets.spreadsheets.values.batchGet({
      spreadsheetId: SPREADSHEET_ID,
      ranges,
      valueRenderOption: 'UNFORMATTED_VALUE',
    });
    const currentValues = readRes.data.valueRanges ?? [];

    // 2. 새 값 계산 및 업데이트 데이터 구성
    const writeData = validItems.map((item, i) => {
      const current = Number(currentValues[i]?.values?.[0]?.[0] ?? item.before);
      return {
        range: `${EXEC_SHEET}!L${item.rowIndex}`,
        values: [[current + item.adjustment]],
      };
    });

    await sheets.spreadsheets.values.batchUpdate({
      spreadsheetId: SPREADSHEET_ID,
      requestBody: {
        valueInputOption: 'RAW',
        data: writeData,
      },
    });

    // 3. Supabase 변경이력 저장
    const supabase = createServerSupabaseClient();
    const { data: user } = await supabase
      .from('users')
      .select('id, name')
      .eq('email', session.user.email)
      .single();

    const seen = new Set<string>();
    const repCategory = validItems
      .map((i) => i.category)
      .filter((c) => { if (seen.has(c)) return false; seen.add(c); return true; })
      .join(', ');
    const totalAdj = validItems.reduce((s, i) => s + i.adjustment, 0);
    const totalBefore = validItems.reduce((s, i) => s + i.before, 0);

    const snapshotObj = {
      type: 'program-adjustment',
      items: validItems.map((item, i) => ({
        unitName: item.unitName,
        programName: item.programName,
        category: item.category,
        subcategory: item.subcategory,
        subDetail: item.subDetail,
        before: Number(currentValues[i]?.values?.[0]?.[0] ?? item.before),
        adjustment: item.adjustment,
        after: Number(currentValues[i]?.values?.[0]?.[0] ?? item.before) + item.adjustment,
      })),
    };

    const { error: insertError } = await supabase.from('budget_change_history').insert([{
      changed_at: changedAt,
      changed_by: user?.id ?? null,
      category: repCategory,
      before_amount: totalBefore,
      adjustment: totalAdj,
      after_amount: totalBefore + totalAdj,
      pdf_drive_url: null,
      snapshot: snapshotObj as unknown as Record<string, unknown>,
    }]);

    if (insertError) {
      console.error('Supabase insert error:', insertError);
      return NextResponse.json({ error: `DB 저장 오류: ${insertError.message}` }, { status: 500 });
    }

    // 4. Google Sheets 예산변경이력 누적 저장
    const confirmedBy = user?.name ?? session.user.email;
    await appendBudgetHistoryRows(
      validItems.map((item, i) => {
        const before = Number(currentValues[i]?.values?.[0]?.[0] ?? item.before);
        const after = before + item.adjustment;
        return {
          changedAt,
          category: item.category,
          subcategory: item.subcategory,
          subDetail: item.subDetail,
          beforeAmount: before,
          adjustment: item.adjustment,
          afterAmount: after,
          executionComplete: 0,
          executionPlanned: 0,
          balance: after,
          executionRate: 0,
          confirmedBy: `${confirmedBy} (${item.unitName}:${item.programName})`,
        };
      }),
    );

    return NextResponse.json({ message: `${validItems.length}건의 예산계획 증감이 완료되었습니다.` });
  } catch (error) {
    console.error('Unit budget adjust POST error:', error);
    const msg = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: `증감 처리 오류: ${msg}` }, { status: 500 });
  }
}

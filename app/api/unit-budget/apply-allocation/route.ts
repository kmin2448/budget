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

interface ApplyItem {
  rowIndex: number;
  programName: string;
  category: string;
  subcategory: string;
  subDetail: string;
  before: number;
  after: number;
}

interface ApplyAllocationBody {
  items: ApplyItem[];
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

    const body = await req.json() as ApplyAllocationBody;
    const { items, changedAt } = body;
    const sheetType: BudgetType = body.sheetType ?? 'main';

    if (!Array.isArray(items) || items.length === 0) {
      return NextResponse.json({ error: '변경 항목이 없습니다.' }, { status: 400 });
    }
    if (!changedAt) {
      return NextResponse.json({ error: 'changedAt이 필요합니다.' }, { status: 400 });
    }

    const validItems = items.filter((i) => i.before !== i.after);
    if (validItems.length === 0) {
      return NextResponse.json({ error: '변동이 있는 항목이 없습니다.' }, { status: 400 });
    }

    const SPREADSHEET_ID = await getSpreadsheetId(sheetType);
    const sheets = getSheetsClient();

    // 집행내역 정리 M열 일괄 업데이트 (rowIndex = 실제 행 번호)
    const writeData = validItems.map((item) => ({
      range: `${EXEC_SHEET}!M${item.rowIndex}`,
      values: [[item.after]],
    }));

    await sheets.spreadsheets.values.batchUpdate({
      spreadsheetId: SPREADSHEET_ID,
      requestBody: { valueInputOption: 'RAW', data: writeData },
    });

    // Supabase 변경이력 저장
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

    const totalBefore = validItems.reduce((s, i) => s + i.before, 0);
    const totalAfter  = validItems.reduce((s, i) => s + i.after,  0);
    const totalAdj    = totalAfter - totalBefore;

    const snapshotObj = {
      type: 'official-budget-sync',
      items: validItems,
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
      return NextResponse.json({ error: `DB 저장 오류: ${insertError.message}` }, { status: 500 });
    }

    // Google Sheets 예산변경이력 누적 저장
    const confirmedBy = user?.name ?? session.user.email;
    await appendBudgetHistoryRows(
      validItems.map((item) => ({
        changedAt,
        category:          item.category,
        subcategory:       item.subcategory,
        subDetail:         item.subDetail,
        beforeAmount:      item.before,
        adjustment:        item.after - item.before,
        afterAmount:       item.after,
        executionComplete: 0,
        executionPlanned:  0,
        balance:           item.after,
        executionRate:     0,
        confirmedBy,
      })),
    );

    return NextResponse.json({ message: `${validItems.length}건의 배정금액이 업데이트되었습니다.` });
  } catch (error) {
    console.error('apply-allocation POST error:', error);
    const msg = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: `배정금액 반영 오류: ${msg}` }, { status: 500 });
  }
}

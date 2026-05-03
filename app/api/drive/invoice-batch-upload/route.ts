// 파일은 클라이언트가 Drive에 직접 업로드 → 여기서는 Sheets + Supabase 메타데이터만 처리
import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { checkPermission } from '@/lib/permissions';
import { PERMISSIONS } from '@/types';
import type { BudgetType } from '@/types';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { getSheetsClient } from '@/lib/google/sheets';
import { getSpreadsheetId } from '@/lib/google/getSheetId';

// 본예산: 12개월, 이월예산: 4개월
function getMonthCount(budgetType: BudgetType) {
  return budgetType === 'carryover' ? 4 : 12;
}
// 일반 비목 끝 열: 본예산=T, 이월예산=L
function getGeneralEndCol(monthCount: number) {
  return String.fromCharCode('A'.charCodeAt(0) + 8 + monthCount - 1);
}

export async function POST(req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.email) {
      return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 });
    }

    const hasPermission = await checkPermission(session.user.email, PERMISSIONS.EXPENDITURE_WRITE);
    if (!hasPermission) {
      return NextResponse.json({ error: '권한이 없습니다.' }, { status: 403 });
    }

    const body = await req.json() as {
      fileId: string;
      webViewLink: string;
      fileName: string;
      category: string;
      rowIndex: number;
      rowUuid?: string;
      expenseDate?: string;
      sourceMonthIndex?: number;
      fileAmount?: number;
      budgetType?: string;
    };

    const { fileId, webViewLink, fileName, category, rowIndex, rowUuid, expenseDate, sourceMonthIndex, fileAmount } = body;
    const budgetType = (body.budgetType ?? 'main') as BudgetType;

    if (!fileId || !webViewLink || !category || rowIndex === undefined) {
      return NextResponse.json({ error: '필수 파라미터 누락 (fileId, webViewLink, category, rowIndex)' }, { status: 400 });
    }

    const SPREADSHEET_ID = await getSpreadsheetId(budgetType);
    const monthCount = getMonthCount(budgetType);
    const supabase = createServerSupabaseClient();
    const sheets = getSheetsClient();

    // 사용자 UUID 조회
    const { data: userRecord } = await supabase
      .from('users')
      .select('id')
      .eq('email', session.user.email)
      .single();
    const uploadedById = userRecord?.id ?? null;

    // Google Sheets B열(집행일자) 기록 + 집행월에 맞게 금액 열 이동 (일반 비목만)
    if (category !== '인건비' && expenseDate) {
      const dateFormatted =
        expenseDate.length >= 6
          ? `20${expenseDate.substring(0, 2)}-${expenseDate.substring(2, 4)}-${expenseDate.substring(4, 6)}`
          : expenseDate;

      const calMonth = parseInt(expenseDate.substring(2, 4), 10);
      const targetFiscalIdx =
        !isNaN(calMonth) && calMonth >= 1 && calMonth <= 12
          ? (calMonth - 3 + 12) % 12
          : -1;

      const batchData: { range: string; values: (string | number)[][] }[] = [
        { range: `'${category}'!B${rowIndex}`, values: [[dateFormatted]] },
      ];

      if (targetFiscalIdx >= 0) {
        const endCol = getGeneralEndCol(monthCount);
        const rowRes = await sheets.spreadsheets.values.get({
          spreadsheetId: SPREADSHEET_ID,
          range: `'${category}'!I${rowIndex}:${endCol}${rowIndex}`,
          valueRenderOption: 'UNFORMATTED_VALUE',
        });
        // monthlyAmounts는 항상 length 12 — 이월예산은 0~(monthCount-1)만 채워짐
        const monthlyAmounts = Array.from({ length: 12 }, (_, i) =>
          i < monthCount ? Number(rowRes.data.values?.[0]?.[i] ?? 0) : 0,
        );

        if (monthlyAmounts[targetFiscalIdx] === 0) {
          const hintIdx   = sourceMonthIndex ?? -1;
          const fileAmt   = fileAmount ?? 0;
          let sourceFiscalIdx = -1;

          if (hintIdx >= 0 && hintIdx < 12 && monthlyAmounts[hintIdx] > 0) {
            sourceFiscalIdx = hintIdx;
          } else if (fileAmt > 0) {
            sourceFiscalIdx = monthlyAmounts.findIndex((v) => v === fileAmt);
          }
          if (sourceFiscalIdx < 0) {
            sourceFiscalIdx = monthlyAmounts.findIndex((v) => v > 0);
          }

          if (sourceFiscalIdx >= 0 && sourceFiscalIdx !== targetFiscalIdx) {
            const amountToMove = monthlyAmounts[sourceFiscalIdx];
            const srcCol = String.fromCharCode('I'.charCodeAt(0) + sourceFiscalIdx);
            const tgtCol = String.fromCharCode('I'.charCodeAt(0) + targetFiscalIdx);
            batchData.push({ range: `'${category}'!${srcCol}${rowIndex}`, values: [['']] });
            batchData.push({ range: `'${category}'!${tgtCol}${rowIndex}`, values: [[amountToMove]] });
          }
        }
      }

      await sheets.spreadsheets.values.batchUpdate({
        spreadsheetId: SPREADSHEET_ID,
        requestBody: { valueInputOption: 'USER_ENTERED', data: batchData },
      });
    }

    // 기존 파일 레코드 제거 후 새 레코드 저장 (UUID 우선, row_index 폴백)
    let delQ = supabase.from('expenditure_files').delete().eq('sheet_name', category);
    delQ = rowUuid ? delQ.eq('row_uuid', rowUuid) : delQ.eq('row_index', rowIndex);
    await delQ.is('month_index', null);

    await supabase.from('expenditure_files').insert({
      sheet_name: category,
      row_index: rowIndex,
      row_uuid: rowUuid ?? null,
      drive_file_id: fileId,
      drive_url: webViewLink,
      uploaded_by: uploadedById,
    });

    return NextResponse.json({
      results: [{
        originalName: fileName,
        newName: fileName,
        category,
        status: 'success',
        fileId,
        url: webViewLink,
      }],
    });
  } catch (error) {
    console.error('invoice-batch-upload metadata error:', error);
    return NextResponse.json({ error: '메타데이터 저장 중 오류 발생' }, { status: 500 });
  }
}

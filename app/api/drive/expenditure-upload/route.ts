// app/api/drive/expenditure-upload/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { checkPermission } from '@/lib/permissions';
import { PERMISSIONS } from '@/types';
import { CATEGORY_SHEETS, PERSONNEL_CATEGORY } from '@/constants/sheets';
import { uploadToUserDrive, deleteFromUserDrive } from '@/lib/google/drive';
import { getSheetsClient } from '@/lib/google/sheets';
import { getSpreadsheetId } from '@/lib/google/getSheetId';
import type { BudgetType } from '@/types';

/** UUID 또는 row_index로 Supabase 파일 레코드를 조회 */
function buildFileQuery(
  supabase: ReturnType<typeof createServerSupabaseClient>,
  category: string,
  rowIndex: number,
  rowUuid: string | undefined,
  monthIndex: number | null | undefined,
) {
  const hasMonth = monthIndex !== undefined && monthIndex !== null;
  let q = supabase
    .from('expenditure_files')
    .select('drive_file_id')
    .eq('sheet_name', category);

  // UUID 우선, 없으면 row_index 사용
  q = rowUuid ? q.eq('row_uuid', rowUuid) : q.eq('row_index', rowIndex);

  return (hasMonth ? q.eq('month_index', monthIndex) : q.is('month_index', null)).maybeSingle();
}

export async function DELETE(req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.email) {
      return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 });
    }
    if (!session.accessToken) {
      return NextResponse.json(
        { error: 'Google Drive 접근 권한이 없습니다. 로그아웃 후 다시 로그인해 주세요.' },
        { status: 401 },
      );
    }

    const hasPermission = await checkPermission(session.user.email, PERMISSIONS.EXPENDITURE_WRITE);
    if (!hasPermission) {
      return NextResponse.json({ error: '권한이 없습니다.' }, { status: 403 });
    }

    const body = await req.json() as {
      category?: string;
      rowIndex?: number;
      rowUuid?: string;
      sheetType?: string;
      monthIndex?: number;
    };
    const { category, rowIndex, rowUuid, sheetType = 'main', monthIndex } = body;

    if (!category || rowIndex === undefined) {
      return NextResponse.json({ error: '필수 파라미터 누락 (category, rowIndex)' }, { status: 400 });
    }

    const supabase = createServerSupabaseClient();
    const { data: existing } = await buildFileQuery(supabase, category, rowIndex, rowUuid, monthIndex);

    if (!existing?.drive_file_id) {
      return NextResponse.json({ error: '파일 정보를 찾을 수 없습니다.' }, { status: 404 });
    }

    // Drive 파일 삭제
    try {
      await deleteFromUserDrive({ accessToken: session.accessToken, fileId: existing.drive_file_id });
    } catch {
      // Drive에 파일이 이미 없어도 DB 레코드는 삭제
    }

    // Supabase 레코드 삭제 (UUID 우선, row_index 폴백)
    const hasMonth = monthIndex !== undefined && monthIndex !== null;
    let delQ = supabase
      .from('expenditure_files')
      .delete()
      .eq('sheet_name', category);
    delQ = rowUuid ? delQ.eq('row_uuid', rowUuid) : delQ.eq('row_index', rowIndex);
    await (hasMonth ? delQ.eq('month_index', monthIndex) : delQ.is('month_index', null));

    // 인건비가 아닌 경우 Sheets B열(집행일자) 초기화
    if (category !== PERSONNEL_CATEGORY) {
      try {
        const spreadsheetId = await getSpreadsheetId(sheetType as BudgetType);
        const sheets = getSheetsClient();
        await sheets.spreadsheets.values.clear({
          spreadsheetId,
          range: `'${category}'!B${rowIndex}`,
        });
      } catch {
        // 시트 초기화 실패는 무시
      }
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Delete file error:', error);
    const msg = error instanceof Error ? error.message : '';
    return NextResponse.json({ error: `삭제 중 오류가 발생했습니다: ${msg}` }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.email) {
      return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 });
    }
    if (!session.accessToken) {
      return NextResponse.json(
        { error: 'Google Drive 접근 권한이 없습니다. 로그아웃 후 다시 로그인해 주세요.' },
        { status: 401 },
      );
    }

    const hasPermission = await checkPermission(session.user.email, PERMISSIONS.EXPENDITURE_WRITE);
    if (!hasPermission) {
      return NextResponse.json({ error: '권한이 없습니다.' }, { status: 403 });
    }

    const formData = await req.formData();
    const file         = formData.get('file') as File | null;
    const category     = formData.get('category') as string | null;
    const rowIndexStr  = formData.get('rowIndex') as string | null;
    const rowUuid      = (formData.get('rowUuid') as string | null) ?? undefined;
    const sheetType    = (formData.get('sheetType') as string | null) ?? 'main';
    const monthIndexStr = formData.get('monthIndex') as string | null;
    const monthIndex    = monthIndexStr !== null && monthIndexStr !== '' ? Number(monthIndexStr) : null;

    if (!file || !category || !rowIndexStr) {
      return NextResponse.json({ error: '필수 파라미터 누락 (file, category, rowIndex)' }, { status: 400 });
    }
    if (!(CATEGORY_SHEETS as readonly string[]).includes(category)) {
      return NextResponse.json({ error: '유효하지 않은 비목입니다.' }, { status: 400 });
    }
    if (file.type !== 'application/pdf') {
      return NextResponse.json({ error: 'PDF 파일만 업로드 가능합니다.' }, { status: 400 });
    }

    const rowIndex = Number(rowIndexStr);
    if (isNaN(rowIndex) || rowIndex < 8) {
      return NextResponse.json({ error: '유효하지 않은 행 번호입니다.' }, { status: 400 });
    }

    const supabase = createServerSupabaseClient();
    const buffer   = Buffer.from(await file.arrayBuffer());
    const safeName = file.name.replace(/[/\\:*?"<>|]/g, '_') || 'upload.pdf';

    // 기존 파일 덮어쓰기: Drive 삭제 + DB 제거
    const hasMonthIndex = monthIndex !== null;
    const { data: existing } = await buildFileQuery(supabase, category, rowIndex, rowUuid, monthIndex);

    if (existing?.drive_file_id) {
      try {
        await deleteFromUserDrive({ accessToken: session.accessToken, fileId: existing.drive_file_id });
      } catch { /* 이미 없어도 계속 */ }
      let delQ = supabase.from('expenditure_files').delete().eq('sheet_name', category);
      delQ = rowUuid ? delQ.eq('row_uuid', rowUuid) : delQ.eq('row_index', rowIndex);
      await (hasMonthIndex ? delQ.eq('month_index', monthIndex) : delQ.is('month_index', null));
    }

    // Drive 업로드
    const { fileId, webViewLink } = await uploadToUserDrive({
      accessToken: session.accessToken,
      categoryName: category,
      fileName: safeName,
      buffer,
      subFolderName: sheetType === 'carryover' ? '이월금' : undefined,
    });

    // Supabase 메타데이터 저장 (UUID 포함)
    const { data: userRecord } = await supabase
      .from('users').select('id').eq('email', session.user.email).single();

    await supabase.from('expenditure_files').insert({
      sheet_name: category,
      row_index: rowIndex,
      row_uuid: rowUuid ?? null,
      drive_file_id: fileId,
      drive_url: webViewLink,
      uploaded_by: userRecord?.id ?? null,
      ...(hasMonthIndex ? { month_index: monthIndex } : {}),
    });

    let usagePercent = 0;
    try {
      const usageResult = await supabase.rpc('get_storage_usage').single();
      usagePercent = (usageResult?.data as { usage_percent?: number } | null)?.usage_percent ?? 0;
    } catch { /* 사용량 조회 실패 무시 */ }
    const storageWarning = usagePercent > 80;

    return NextResponse.json({ fileId, driveUrl: webViewLink, usagePercent, storageWarning });
  } catch (error) {
    console.error('Upload error:', error);
    const msg = error instanceof Error ? error.message : '';
    if (msg.includes('invalid_grant') || msg.includes('Invalid Credentials')) {
      return NextResponse.json(
        { error: '로그인 세션이 만료되었습니다. 로그아웃 후 다시 로그인해 주세요.' },
        { status: 401 },
      );
    }
    return NextResponse.json({ error: `업로드 중 오류가 발생했습니다: ${msg}` }, { status: 500 });
  }
}

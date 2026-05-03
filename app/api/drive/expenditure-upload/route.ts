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

    const body = await req.json() as { category?: string; rowIndex?: number; sheetType?: string; monthIndex?: number };
    const { category, rowIndex, sheetType = 'main', monthIndex } = body;

    if (!category || rowIndex === undefined) {
      return NextResponse.json({ error: '필수 파라미터 누락 (category, rowIndex)' }, { status: 400 });
    }

    const supabase = createServerSupabaseClient();

    // month_index 유무에 따라 필터 분기
    const hasMonthIndex = monthIndex !== undefined && monthIndex !== null;
    const existingQuery = supabase
      .from('expenditure_files')
      .select('drive_file_id')
      .eq('sheet_name', category)
      .eq('row_index', rowIndex);
    const { data: existing } = await (hasMonthIndex
      ? existingQuery.eq('month_index', monthIndex)
      : existingQuery.is('month_index', null)
    ).maybeSingle();

    if (!existing?.drive_file_id) {
      return NextResponse.json({ error: '파일 정보를 찾을 수 없습니다.' }, { status: 404 });
    }

    // Drive 파일 삭제 (이미 없어도 무시)
    try {
      await deleteFromUserDrive({ accessToken: session.accessToken, fileId: existing.drive_file_id });
    } catch {
      // Drive에 파일이 이미 없어도 DB 레코드는 삭제
    }

    // Supabase 레코드 삭제
    const deleteQuery = supabase
      .from('expenditure_files')
      .delete()
      .eq('sheet_name', category)
      .eq('row_index', rowIndex);
    await (hasMonthIndex
      ? deleteQuery.eq('month_index', monthIndex)
      : deleteQuery.is('month_index', null));

    // 인건비가 아닌 경우 Google Sheets B열(집행일자) 초기화
    if (category !== PERSONNEL_CATEGORY) {
      try {
        const spreadsheetId = await getSpreadsheetId(sheetType as BudgetType);
        const sheets = getSheetsClient();
        await sheets.spreadsheets.values.clear({
          spreadsheetId,
          range: `'${category}'!B${rowIndex}`,
        });
      } catch {
        // 시트 초기화 실패는 무시 (파일 삭제는 이미 완료)
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

    const hasPermission = await checkPermission(
      session.user.email,
      PERMISSIONS.EXPENDITURE_WRITE,
    );
    if (!hasPermission) {
      return NextResponse.json({ error: '권한이 없습니다.' }, { status: 403 });
    }

    const formData = await req.formData();
    const file = formData.get('file') as File | null;
    const category = formData.get('category') as string | null;
    const rowIndexStr = formData.get('rowIndex') as string | null;
    const sheetType = (formData.get('sheetType') as string | null) ?? 'main';
    const monthIndexStr = formData.get('monthIndex') as string | null;
    const monthIndex = monthIndexStr !== null && monthIndexStr !== '' ? Number(monthIndexStr) : null;

    if (!file || !category || !rowIndexStr) {
      return NextResponse.json(
        { error: '필수 파라미터 누락 (file, category, rowIndex)' },
        { status: 400 },
      );
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
    const buffer = Buffer.from(await file.arrayBuffer());
    const safeName = file.name.replace(/[/\\:*?"<>|]/g, '_') || 'upload.pdf';

    // 기존 파일이 있으면 Drive에서 삭제 후 DB 레코드 제거
    const hasMonthIndex = monthIndex !== null;
    const existCheckQuery = supabase
      .from('expenditure_files')
      .select('drive_file_id')
      .eq('sheet_name', category)
      .eq('row_index', rowIndex);
    const { data: existing } = await (hasMonthIndex
      ? existCheckQuery.eq('month_index', monthIndex)
      : existCheckQuery.is('month_index', null)
    ).maybeSingle();

    if (existing?.drive_file_id) {
      try {
        await deleteFromUserDrive({
          accessToken: session.accessToken,
          fileId: existing.drive_file_id,
        });
      } catch {
        // 파일이 이미 없어도 계속 진행
      }
      const delQuery = supabase.from('expenditure_files').delete().eq('sheet_name', category).eq('row_index', rowIndex);
      await (hasMonthIndex ? delQuery.eq('month_index', monthIndex) : delQuery.is('month_index', null));
    }

    // 사용자 Google Drive에 업로드
    // 이월예산: COSS_지출부/이월금/{비목명}/, 본예산: COSS_지출부/{비목명}/
    const { fileId, webViewLink } = await uploadToUserDrive({
      accessToken: session.accessToken,
      categoryName: category,
      fileName: safeName,
      buffer,
      subFolderName: sheetType === 'carryover' ? '이월금' : undefined,
    });

    // Supabase에 메타데이터 저장
    const { data: userRecord } = await supabase
      .from('users').select('id').eq('email', session.user.email).single();

    await supabase.from('expenditure_files').insert({
      sheet_name: category,
      row_index: rowIndex,
      drive_file_id: fileId,
      drive_url: webViewLink,
      uploaded_by: userRecord?.id ?? null,
      ...(hasMonthIndex ? { month_index: monthIndex } : {}),
    });

    return NextResponse.json({ fileId, driveUrl: webViewLink });
  } catch (error) {
    console.error('Upload error:', error);
    const msg = error instanceof Error ? error.message : '';
    if (msg.includes('invalid_grant') || msg.includes('Invalid Credentials')) {
      return NextResponse.json(
        { error: '로그인 세션이 만료되었습니다. 로그아웃 후 다시 로그인해 주세요.' },
        { status: 401 },
      );
    }
    return NextResponse.json(
      { error: `업로드 중 오류가 발생했습니다: ${msg}` },
      { status: 500 },
    );
  }
}

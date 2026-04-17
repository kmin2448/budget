// app/api/drive/expenditure-upload/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { checkPermission } from '@/lib/permissions';
import { PERMISSIONS } from '@/types';
import { CATEGORY_SHEETS } from '@/constants/sheets';
import { uploadToUserDrive, deleteFromUserDrive } from '@/lib/google/drive';

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

    const body = await req.json() as { category?: string; rowIndex?: number };
    const { category, rowIndex } = body;

    if (!category || rowIndex === undefined) {
      return NextResponse.json({ error: '필수 파라미터 누락 (category, rowIndex)' }, { status: 400 });
    }

    const supabase = createServerSupabaseClient();
    const { data: existing } = await supabase
      .from('expenditure_files')
      .select('drive_file_id')
      .eq('sheet_name', category)
      .eq('row_index', rowIndex)
      .maybeSingle();

    if (!existing?.drive_file_id) {
      return NextResponse.json({ error: '파일 정보를 찾을 수 없습니다.' }, { status: 404 });
    }

    try {
      await deleteFromUserDrive({ accessToken: session.accessToken, fileId: existing.drive_file_id });
    } catch {
      // Drive에 파일이 이미 없어도 DB 레코드는 삭제
    }

    await supabase
      .from('expenditure_files')
      .delete()
      .eq('sheet_name', category)
      .eq('row_index', rowIndex);

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
    const { data: existing } = await supabase
      .from('expenditure_files')
      .select('drive_file_id')
      .eq('sheet_name', category)
      .eq('row_index', rowIndex)
      .maybeSingle();

    if (existing?.drive_file_id) {
      try {
        await deleteFromUserDrive({
          accessToken: session.accessToken,
          fileId: existing.drive_file_id,
        });
      } catch {
        // 파일이 이미 없어도 계속 진행
      }
      await supabase
        .from('expenditure_files')
        .delete()
        .eq('sheet_name', category)
        .eq('row_index', rowIndex);
    }

    // 사용자 Google Drive에 업로드
    const { fileId, webViewLink } = await uploadToUserDrive({
      accessToken: session.accessToken,
      categoryName: category,
      fileName: safeName,
      buffer,
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

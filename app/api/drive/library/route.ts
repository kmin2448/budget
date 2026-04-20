import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { checkPermission } from '@/lib/permissions';
import { PERMISSIONS } from '@/types';
import { uploadToLibraryDrive, deleteFromUserDrive } from '@/lib/google/drive';

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

    const hasPermission = await checkPermission(session.user.email, PERMISSIONS.LIBRARY_WRITE);
    if (!hasPermission) {
      return NextResponse.json({ error: '자료실 업로드 권한이 없습니다.' }, { status: 403 });
    }

    const formData = await req.formData();
    const file = formData.get('file') as File | null;
    const title = formData.get('title') as string | null;
    const description = (formData.get('description') as string | null) ?? null;

    if (!file || !title?.trim()) {
      return NextResponse.json({ error: '파일과 제목은 필수입니다.' }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const safeName = file.name.replace(/[/\\:*?"<>|]/g, '_') || 'upload';
    const mimeType = file.type || 'application/octet-stream';

    const { fileId, webViewLink } = await uploadToLibraryDrive({
      accessToken: session.accessToken,
      fileName: safeName,
      buffer,
      mimeType,
    });

    const supabase = createServerSupabaseClient();
    const { data: userRecord } = await supabase
      .from('users').select('id').eq('email', session.user.email).single();

    const { data, error } = await supabase.from('library_files').insert({
      title: title.trim(),
      description: description?.trim() || null,
      file_name: safeName,
      file_size: file.size,
      mime_type: mimeType,
      drive_file_id: fileId,
      drive_url: webViewLink,
      uploaded_by: userRecord?.id ?? null,
      uploader_name: session.user.name ?? session.user.email,
    }).select().single();

    if (error) throw error;
    return NextResponse.json(data);
  } catch (error) {
    console.error('Library upload error:', error);
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

    const hasPermission = await checkPermission(session.user.email, PERMISSIONS.LIBRARY_WRITE);
    if (!hasPermission) {
      return NextResponse.json({ error: '자료실 삭제 권한이 없습니다.' }, { status: 403 });
    }

    const body = await req.json() as { id?: string };
    if (!body.id) {
      return NextResponse.json({ error: '파일 ID가 필요합니다.' }, { status: 400 });
    }

    const supabase = createServerSupabaseClient();
    const { data: file, error: fetchError } = await supabase
      .from('library_files')
      .select('drive_file_id')
      .eq('id', body.id)
      .single();

    if (fetchError || !file) {
      return NextResponse.json({ error: '파일 정보를 찾을 수 없습니다.' }, { status: 404 });
    }

    try {
      await deleteFromUserDrive({ accessToken: session.accessToken, fileId: file.drive_file_id });
    } catch {
      // Drive에 이미 없어도 DB 레코드는 삭제
    }

    await supabase.from('library_files').delete().eq('id', body.id);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Library delete error:', error);
    const msg = error instanceof Error ? error.message : '';
    return NextResponse.json({ error: `삭제 중 오류가 발생했습니다: ${msg}` }, { status: 500 });
  }
}

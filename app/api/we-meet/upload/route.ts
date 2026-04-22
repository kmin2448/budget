import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { uploadToWeMeetDrive, deleteFromUserDrive } from '@/lib/google/drive';
import { updateWeMeetFileUrl } from '@/lib/google/wemeet-sheets';

export const dynamic = 'force-dynamic';

const ALLOWED_MIME_TYPES = new Set([
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  'image/heic',
  'image/heif',
]);

function extFromMime(mime: string): string {
  const map: Record<string, string> = {
    'application/pdf': 'pdf',
    'image/jpeg': 'jpg',
    'image/png': 'png',
    'image/gif': 'gif',
    'image/webp': 'webp',
    'image/heic': 'heic',
    'image/heif': 'heif',
  };
  return map[mime] ?? 'bin';
}

function extractFileId(url: string): string | null {
  const m = url.match(/\/d\/([^/]+)\//);
  return m?.[1] ?? null;
}

async function assertCanWrite(email: string) {
  const supabase = createServerSupabaseClient();
  const { data: user } = await supabase
    .from('users')
    .select('role')
    .eq('email', email)
    .single();
  if (!user || (user.role !== 'super_admin' && user.role !== 'admin')) {
    throw new Error('권한이 없습니다.');
  }
}

// ── 업로드 ────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.email) {
      return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 });
    }
    if (!session.accessToken) {
      return NextResponse.json(
        { error: 'Google Drive 권한이 없습니다. 로그아웃 후 다시 로그인해 주세요.' },
        { status: 401 },
      );
    }

    await assertCanWrite(session.user.email);

    const formData       = await req.formData();
    const file           = formData.get('file')           as File   | null;
    const rowIndexStr    = formData.get('rowIndex')        as string | null;
    const teamName       = formData.get('teamName')        as string | null;
    const description    = formData.get('description')     as string | null;
    const amountStr      = formData.get('confirmedAmount') as string | null;
    const usageDate      = formData.get('usageDate')       as string | null;
    const currentFileUrl = (formData.get('currentFileUrl') as string | null) ?? '';

    if (!file || !rowIndexStr || !teamName) {
      return NextResponse.json({ error: '필수 파라미터 누락 (file, rowIndex, teamName)' }, { status: 400 });
    }
    if (!ALLOWED_MIME_TYPES.has(file.type)) {
      return NextResponse.json({ error: 'PDF 또는 이미지 파일만 업로드 가능합니다.' }, { status: 400 });
    }

    const rowIndex       = Number(rowIndexStr);
    const confirmedAmount = Number(amountStr ?? 0);
    const ext            = extFromMime(file.type);
    const buffer         = Buffer.from(await file.arrayBuffer());

    const { webViewLink } = await uploadToWeMeetDrive({
      accessToken: session.accessToken,
      teamName,
      description:     description ?? '',
      confirmedAmount,
      usageDate:       usageDate ?? '',
      buffer,
      mimeType:        file.type,
      ext,
    });

    // I열: 기존 URL 목록에 신규 URL 추가 (\n 구분)
    const newFileUrl = currentFileUrl
      ? `${currentFileUrl}\n${webViewLink}`
      : webViewLink;

    await updateWeMeetFileUrl(rowIndex, newFileUrl);

    return NextResponse.json({ newFileUrl });
  } catch (err) {
    const message = err instanceof Error ? err.message : '업로드 실패';
    const status  = message === '권한이 없습니다.' ? 403 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

// ── 파일 삭제 ─────────────────────────────────────────────────────────

export async function DELETE(req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.email) {
      return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 });
    }
    if (!session.accessToken) {
      return NextResponse.json(
        { error: 'Google Drive 권한이 없습니다. 로그아웃 후 다시 로그인해 주세요.' },
        { status: 401 },
      );
    }

    await assertCanWrite(session.user.email);

    const body = await req.json() as { rowIndex: number; targetUrl: string; currentFileUrl: string };
    const { rowIndex, targetUrl, currentFileUrl } = body;

    if (!rowIndex || !targetUrl) {
      return NextResponse.json({ error: '필수 파라미터 누락 (rowIndex, targetUrl)' }, { status: 400 });
    }

    // Drive에서 삭제 (실패해도 시트 업데이트는 진행)
    const fileId = extractFileId(targetUrl);
    if (fileId) {
      try {
        await deleteFromUserDrive({ accessToken: session.accessToken, fileId });
      } catch {
        // 이미 삭제됐거나 권한 없어도 계속 진행
      }
    }

    // I열에서 해당 URL 제거
    const remaining = currentFileUrl
      .split('\n')
      .map((u) => u.trim())
      .filter((u) => u && u !== targetUrl)
      .join('\n');

    await updateWeMeetFileUrl(rowIndex, remaining);

    return NextResponse.json({ newFileUrl: remaining });
  } catch (err) {
    const message = err instanceof Error ? err.message : '삭제 실패';
    const status  = message === '권한이 없습니다.' ? 403 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

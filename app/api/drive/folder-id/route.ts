import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getCategoryFolderId } from '@/lib/google/drive';
import { CATEGORY_SHEETS } from '@/constants/sheets';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.email || !session.accessToken) {
      return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 });
    }

    const category = req.nextUrl.searchParams.get('category');
    const sheetType = req.nextUrl.searchParams.get('sheetType') ?? 'main';

    if (!category || !(CATEGORY_SHEETS as readonly string[]).includes(category)) {
      return NextResponse.json({ error: '유효하지 않은 비목입니다.' }, { status: 400 });
    }

    const folderId = await getCategoryFolderId({
      accessToken: session.accessToken,
      categoryName: category,
      subFolderName: sheetType === 'carryover' ? '이월금' : undefined,
    });

    return NextResponse.json({ folderId });
  } catch (error) {
    console.error('folder-id error:', error);
    return NextResponse.json({ error: '폴더 조회 중 오류가 발생했습니다.' }, { status: 500 });
  }
}

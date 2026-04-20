import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import type { LibraryFile } from '@/types';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const session = await auth();
    if (!session) {
      return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 });
    }

    const supabase = createServerSupabaseClient();
    const { data, error } = await supabase
      .from('library_files')
      .select('*')
      .order('uploaded_at', { ascending: false });

    if (error) throw error;
    return NextResponse.json((data ?? []) as LibraryFile[]);
  } catch (error) {
    console.error('Library GET error:', error);
    return NextResponse.json({ error: '자료 목록 조회 중 오류가 발생했습니다.' }, { status: 500 });
  }
}

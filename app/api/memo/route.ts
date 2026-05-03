import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { createServerSupabaseClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export async function GET() {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ content: '' });
  }

  const supabase = createServerSupabaseClient();
  const { data } = await supabase
    .from('user_memos')
    .select('content')
    .eq('user_email', session.user.email)
    .maybeSingle();

  return NextResponse.json({ content: data?.content ?? '' });
}

export async function PUT(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 });
  }

  const { content } = (await req.json()) as { content: string };

  const supabase = createServerSupabaseClient();
  await supabase.from('user_memos').upsert(
    { user_email: session.user.email, content, updated_at: new Date().toISOString() },
    { onConflict: 'user_email' },
  );

  return NextResponse.json({ ok: true });
}

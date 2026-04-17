// app/api/card/[id]/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { checkPermission } from '@/lib/permissions';
import { PERMISSIONS } from '@/types';

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    const session = await auth();
    if (!session?.user?.email) {
      return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 });
    }

    const hasPermission = await checkPermission(session.user.email, PERMISSIONS.CARD_WRITE);
    if (!hasPermission) {
      return NextResponse.json({ error: '집행내역 작성 권한이 없습니다.' }, { status: 403 });
    }

    const body = (await req.json()) as Partial<{
      expense_date: string;
      category: string;
      merchant: string;
      description: string;
      amount: number;
      erp_registered: boolean;
    }>;

    const supabase = createServerSupabaseClient();
    const { data, error } = await supabase
      .from('card_expenditures')
      .update(body)
      .eq('id', params.id)
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json({ item: data });
  } catch (err) {
    console.error('[card PATCH]', err);
    return NextResponse.json({ error: '수정 실패' }, { status: 500 });
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    const session = await auth();
    if (!session?.user?.email) {
      return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 });
    }

    const hasPermission = await checkPermission(session.user.email, PERMISSIONS.CARD_WRITE);
    if (!hasPermission) {
      return NextResponse.json({ error: '집행내역 작성 권한이 없습니다.' }, { status: 403 });
    }

    const supabase = createServerSupabaseClient();
    const { error } = await supabase
      .from('card_expenditures')
      .delete()
      .eq('id', params.id);

    if (error) throw error;

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('[card DELETE]', err);
    return NextResponse.json({ error: '삭제 실패' }, { status: 500 });
  }
}

// app/api/card/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { CATEGORY_SHEETS } from '@/constants/sheets';
import { checkPermission } from '@/lib/permissions';
import { PERMISSIONS } from '@/types';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.email) {
      return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const year = searchParams.get('year') ?? new Date().getFullYear().toString();

    const supabase = createServerSupabaseClient();
    const { data, error } = await supabase
      .from('card_expenditures')
      .select('*')
      .gte('expense_date', `${year}-01-01`)
      .lte('expense_date', `${year}-12-31`)
      .order('expense_date', { ascending: false });

    if (error) throw error;

    return NextResponse.json({ items: data ?? [] });
  } catch (err) {
    console.error('[card GET]', err);
    return NextResponse.json({ error: '데이터 조회 실패' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
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

    // 로그인 사용자 조회 (created_by 기록용)
    const { data: user } = await supabase
      .from('users')
      .select('id')
      .eq('email', session.user.email)
      .single();

    if (!user) {
      return NextResponse.json({ error: '사용자를 찾을 수 없습니다.' }, { status: 403 });
    }

    const body = (await req.json()) as {
      expense_date: string;
      category: string;
      merchant?: string;
      description?: string;
      amount: number;
      erp_registered?: boolean;
    };

    if (!body.expense_date || !body.category || body.amount === undefined) {
      return NextResponse.json({ error: '필수 항목이 누락되었습니다.' }, { status: 400 });
    }

    if (!CATEGORY_SHEETS.includes(body.category as (typeof CATEGORY_SHEETS)[number])) {
      return NextResponse.json({ error: '유효하지 않은 비목입니다.' }, { status: 400 });
    }

    const { data, error } = await supabase
      .from('card_expenditures')
      .insert({
        expense_date: body.expense_date,
        category: body.category,
        merchant: body.merchant ?? null,
        description: body.description ?? null,
        amount: body.amount,
        erp_registered: body.erp_registered ?? false,
        created_by: user.id,
      })
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json({ item: data }, { status: 201 });
  } catch (err) {
    console.error('[card POST]', err);
    return NextResponse.json({ error: '저장 실패' }, { status: 500 });
  }
}

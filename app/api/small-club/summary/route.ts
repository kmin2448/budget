import { NextResponse } from 'next/server';
import { getSmallClubSummary } from '@/lib/google/smallclub-sheets';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const summary = await getSmallClubSummary();
    return NextResponse.json({ summary });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : '요약 로드 실패' },
      { status: 500 },
    );
  }
}

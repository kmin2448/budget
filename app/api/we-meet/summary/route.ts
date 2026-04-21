import { NextResponse } from 'next/server';
import { getWeMeetSummary } from '@/lib/google/wemeet-sheets';

export async function GET() {
  try {
    const summary = await getWeMeetSummary();
    return NextResponse.json({ summary });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : '데이터 로드 실패' },
      { status: 500 },
    );
  }
}

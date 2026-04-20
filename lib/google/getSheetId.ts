import { createServerSupabaseClient } from '@/lib/supabase/server';
import type { BudgetType } from '@/types';

let _cachedCarryoverId: string | null = null;
let _cachedAt = 0;
const CACHE_TTL = 5 * 60 * 1000; // 5분

export async function getSpreadsheetId(sheetType: BudgetType): Promise<string> {
  if (sheetType === 'main') {
    return process.env.GOOGLE_SHEETS_ID!;
  }

  // 인메모리 캐시
  if (_cachedCarryoverId && Date.now() - _cachedAt < CACHE_TTL) {
    return _cachedCarryoverId;
  }

  // Supabase app_settings 조회
  try {
    const supabase = createServerSupabaseClient();
    const { data, error } = await supabase
      .from('app_settings')
      .select('value')
      .eq('key', 'carryover_sheet_id')
      .maybeSingle();
    if (!error && data?.value) {
      _cachedCarryoverId = data.value as string;
      _cachedAt = Date.now();
      return _cachedCarryoverId;
    }
  } catch {
    // 테이블 미존재 시 폴백
  }

  // 환경 변수 폴백
  const envId = process.env.GOOGLE_CARRYOVER_SHEETS_ID;
  if (envId) return envId;

  throw new Error(
    '이월예산 Sheet ID가 설정되지 않았습니다. 관리자 설정에서 이월예산 Sheet ID를 입력해주세요.',
  );
}

export function invalidateCarryoverCache() {
  _cachedCarryoverId = null;
  _cachedAt = 0;
}

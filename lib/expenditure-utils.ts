// lib/expenditure-utils.ts

/** Google Sheets 시간 직렬번호(0~1 소수) → HH:MM 문자열 */
export function serialToTimeString(raw: unknown): string {
  if (typeof raw === 'number' && raw >= 0 && raw < 1) {
    const totalSec = Math.round(raw * 86400);
    const h = Math.floor(totalSec / 3600);
    const m = Math.floor((totalSec % 3600) / 60);
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  }
  if (typeof raw === 'string') return raw.trim();
  return '';
}

/**
 * Google Sheets 날짜 직렬번호 → YYYY-MM-DD 문자열
 * Sheets serial: 1900-01-01 = 1 (단, 1900-02-29 버그 포함)
 * Unix epoch offset: 25569 (1970-01-01 = 25569)
 */
export function serialToDateString(raw: unknown): string {
  if (typeof raw === 'number' && raw > 0) {
    const ms = Math.round((raw - 25569) * 86400 * 1000);
    const date = new Date(ms);
    if (!isNaN(date.getTime())) {
      return date.toISOString().split('T')[0]; // YYYY-MM-DD
    }
  }
  if (typeof raw === 'string') return raw.trim();
  return '';
}

/**
 * 월별 금액 배열(12개) → 집행상태 도출
 * expenseDate 가 비어 있으면 '집행예정', 있으면 '집행완료'
 */
export function deriveStatus(expenseDate: string): 'complete' | 'planned' {
  return expenseDate.trim() ? 'complete' : 'planned';
}

/**
 * 집행 행 목록 → 예산 집계 계산
 * status 필드를 우선 사용하고, 없으면 expenseDate로 fallback
 */
export function calcBudgetInfo(
  rows: { totalAmount: number; expenseDate: string; status?: 'complete' | 'planned' }[],
  allocation: number,
) {
  const isComplete = (r: { expenseDate: string; status?: 'complete' | 'planned' }) =>
    r.status !== undefined ? r.status === 'complete' : !!r.expenseDate;

  const executionComplete = rows
    .filter(isComplete)
    .reduce((s, r) => s + r.totalAmount, 0);
  const executionPlanned = rows
    .filter((r) => !isComplete(r))
    .reduce((s, r) => s + r.totalAmount, 0);
  const balance = allocation - executionComplete - executionPlanned;
  const executionRate =
    allocation > 0
      ? Math.round(((executionComplete + executionPlanned) / allocation) * 1000) / 10
      : 0;
  return { allocation, executionComplete, executionPlanned, balance, executionRate };
}

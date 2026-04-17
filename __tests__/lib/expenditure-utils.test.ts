// __tests__/lib/expenditure-utils.test.ts
import { serialToDateString, deriveStatus, calcBudgetInfo } from '@/lib/expenditure-utils';

describe('serialToDateString', () => {
  it('Google Sheets 날짜 직렬번호(46091)를 YYYY-MM-DD로 변환한다', () => {
    // 46091 = 2026-03-10 (Sheets serial: 25569 + Unix days)
    const result = serialToDateString(46091);
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(result).toBe('2026-03-10');
  });

  it('이미 문자열인 날짜는 그대로 반환한다', () => {
    expect(serialToDateString('2026-01-15')).toBe('2026-01-15');
  });

  it('빈 값(0, undefined, null)은 빈 문자열을 반환한다', () => {
    expect(serialToDateString(0)).toBe('');
    expect(serialToDateString(undefined)).toBe('');
    expect(serialToDateString(null)).toBe('');
  });
});

describe('deriveStatus', () => {
  it('지출일자가 있으면 complete를 반환한다', () => {
    expect(deriveStatus('2026-03-10')).toBe('complete');
  });

  it('지출일자가 빈 문자열이면 planned를 반환한다', () => {
    expect(deriveStatus('')).toBe('planned');
  });

  it('지출일자가 공백만 있어도 planned를 반환한다', () => {
    expect(deriveStatus('   ')).toBe('planned');
  });
});

describe('calcBudgetInfo', () => {
  const rows = [
    { totalAmount: 1000000, expenseDate: '2026-03-10' }, // 집행완료
    { totalAmount: 2000000, expenseDate: '2026-04-01' }, // 집행완료
    { totalAmount: 500000,  expenseDate: '' },           // 집행예정
  ];
  const allocation = 5000000;

  it('집행완료 합계를 계산한다', () => {
    const result = calcBudgetInfo(rows, allocation);
    expect(result.executionComplete).toBe(3000000);
  });

  it('집행예정 합계를 계산한다', () => {
    const result = calcBudgetInfo(rows, allocation);
    expect(result.executionPlanned).toBe(500000);
  });

  it('잔액을 계산한다 (배정예산 - 완료 - 예정)', () => {
    const result = calcBudgetInfo(rows, allocation);
    expect(result.balance).toBe(1500000);
  });

  it('집행률을 소수점 1자리로 계산한다', () => {
    const result = calcBudgetInfo(rows, allocation);
    // (3000000 + 500000) / 5000000 * 100 = 70.0
    expect(result.executionRate).toBe(70.0);
  });

  it('배정예산이 0이면 집행률은 0이다', () => {
    const result = calcBudgetInfo(rows, 0);
    expect(result.executionRate).toBe(0);
  });
});

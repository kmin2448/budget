import { formatKRW, parseKRW, calcExecutionRate, calcBalance } from '@/lib/utils';

describe('formatKRW', () => {
  it('정수를 천 단위 구분기호 문자열로 변환한다', () => {
    expect(formatKRW(1000000)).toBe('1,000,000');
    expect(formatKRW(123456789)).toBe('123,456,789');
    expect(formatKRW(0)).toBe('0');
  });

  it('쉼표 포함 문자열도 올바르게 변환한다', () => {
    expect(formatKRW('1,000,000')).toBe('1,000,000');
    expect(formatKRW('500000')).toBe('500,000');
  });

  it('NaN이나 빈 문자열이면 빈 문자열을 반환한다', () => {
    expect(formatKRW('abc')).toBe('');
  });

  it('음수도 처리한다', () => {
    expect(formatKRW(-500000)).toBe('-500,000');
  });
});

describe('parseKRW', () => {
  it('쉼표 포함 문자열을 숫자로 변환한다', () => {
    expect(parseKRW('1,000,000')).toBe(1000000);
    expect(parseKRW('123,456,789')).toBe(123456789);
  });

  it('쉼표 없는 문자열도 처리한다', () => {
    expect(parseKRW('500000')).toBe(500000);
  });

  it('빈 문자열이나 숫자 아닌 값은 0을 반환한다', () => {
    expect(parseKRW('')).toBe(0);
    expect(parseKRW('abc')).toBe(0);
  });
});

describe('calcExecutionRate', () => {
  it('집행완료 + 집행예정 / 예산계획 × 100 을 소수 첫째자리로 반환한다', () => {
    expect(calcExecutionRate(500000, 300000, 1000000)).toBe(80.0);
    expect(calcExecutionRate(333333, 0, 1000000)).toBe(33.3);
  });

  it('예산계획이 0이면 0을 반환한다', () => {
    expect(calcExecutionRate(100, 100, 0)).toBe(0);
  });

  it('집행이 없으면 0을 반환한다', () => {
    expect(calcExecutionRate(0, 0, 1000000)).toBe(0);
  });
});

describe('calcBalance', () => {
  it('예산계획에서 집행완료와 집행예정을 뺀 잔액을 반환한다', () => {
    expect(calcBalance(1000000, 300000, 200000)).toBe(500000);
    expect(calcBalance(500000, 500000, 0)).toBe(0);
  });

  it('집행액이 예산을 초과하면 음수를 반환한다', () => {
    expect(calcBalance(1000000, 800000, 300000)).toBe(-100000);
  });
});

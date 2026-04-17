import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

// 금액을 한국 원화 형식으로 표시 (천 단위 구분기호)
export const formatKRW = (value: number | string | null | undefined): string => {
  if (value === null || value === undefined) return '';
  const num = typeof value === 'string' ? Number(value.replace(/,/g, '')) : value;
  return isNaN(num) ? '' : num.toLocaleString('ko-KR');
};

// 쉼표가 있는 문자열을 숫자로 변환
export const parseKRW = (value: string): number => {
  return Number(value.replace(/,/g, '')) || 0;
};

// 집행률 계산 (소수 첫째자리 반올림)
export const calcExecutionRate = (
  executionComplete: number,
  executionPlanned: number,
  budgetPlan: number,
): number => {
  if (budgetPlan === 0) return 0;
  return Math.round(((executionComplete + executionPlanned) / budgetPlan) * 1000) / 10;
};

// 잔액 계산
export const calcBalance = (
  budgetPlan: number,
  executionComplete: number,
  executionPlanned: number,
): number => {
  return budgetPlan - executionComplete - executionPlanned;
};

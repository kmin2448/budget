// components/ui/krw-input.tsx
// 천단위 쉼표 포맷을 유지하면서 커서 위치를 보존하는 금액 입력 컴포넌트
'use client';

import { useRef, useCallback, type InputHTMLAttributes } from 'react';

interface KRWInputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'onChange' | 'value' | 'type' | 'inputMode'> {
  value: string;
  onChange: (formatted: string) => void;
  // 예산 증감액처럼 음수 입력이 필요한 경우 true
  allowNegative?: boolean;
}

/**
 * 천단위 쉼표 포맷을 실시간으로 적용하면서 커서 위치를 보존하는 입력 컴포넌트.
 *
 * 동작 원리:
 * 1. 입력 직후 커서 앞 숫자 개수를 기억
 * 2. 숫자만 추출해 toLocaleString('ko-KR')으로 재포맷
 * 3. requestAnimationFrame에서 재포맷된 문자열 안 같은 숫자 위치로 커서 복원
 */
export function KRWInput({ value, onChange, allowNegative = false, ...props }: KRWInputProps) {
  const ref = useRef<HTMLInputElement>(null);

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const raw = e.target.value;
      const cursorPos = e.target.selectionStart ?? 0;

      // 커서 앞에 있는 숫자 개수 기억 (쉼표 제외)
      const digitsBeforeCursor = (raw.slice(0, cursorPos).match(/\d/g) ?? []).length;

      // 음수 부호 감지 (맨 앞 '-'만 인정)
      const isNeg = allowNegative && raw.replace(/[^0-9\-]/g, '').startsWith('-');

      // 순수 숫자만 추출
      const digits = raw.replace(/\D/g, '');

      // 재포맷
      let formatted: string;
      if (!digits) {
        formatted = isNeg ? '-' : '';
      } else {
        formatted = (isNeg ? '-' : '') + Number(digits).toLocaleString('ko-KR');
      }

      onChange(formatted);

      // React가 DOM을 업데이트한 뒤 커서 복원
      requestAnimationFrame(() => {
        const el = ref.current;
        if (!el) return;

        const startIdx = isNeg ? 1 : 0; // 음수 부호 다음부터 탐색
        let digitCount = 0;
        let newPos = formatted.length; // 기본값: 끝

        if (digitsBeforeCursor === 0) {
          newPos = startIdx;
        } else {
          for (let i = startIdx; i < formatted.length; i++) {
            if (/\d/.test(formatted[i])) {
              digitCount++;
              if (digitCount === digitsBeforeCursor) {
                newPos = i + 1;
                break;
              }
            }
          }
        }

        el.setSelectionRange(newPos, newPos);
      });
    },
    [onChange, allowNegative],
  );

  return (
    <input
      {...props}
      ref={ref}
      type="text"
      inputMode={allowNegative ? 'text' : 'numeric'}
      value={value}
      onChange={handleChange}
    />
  );
}

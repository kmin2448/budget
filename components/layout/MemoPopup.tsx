'use client';

import { useState, useEffect } from 'react';
import { X, Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';

const MEMO_KEY = 'coss_memo';

interface CalcState {
  display: string;
  prev: string;
  operator: string | null;
  waitingForOperand: boolean;
}

const CALC_INIT: CalcState = {
  display: '0',
  prev: '',
  operator: null,
  waitingForOperand: false,
};

function compute(a: number, b: number, op: string): number {
  switch (op) {
    case '+': return a + b;
    case '-': return a - b;
    case '×': return a * b;
    case '÷': return b !== 0 ? a / b : 0;
    default: return b;
  }
}

function fmtNum(n: number): string {
  if (!isFinite(n)) return '오류';
  const s = parseFloat(n.toPrecision(10)).toString();
  return s.length > 14 ? n.toExponential(3) : s;
}

const CALC_KEYS = [
  'C', '⌫', '%', '÷',
  '7', '8', '9', '×',
  '4', '5', '6', '-',
  '1', '2', '3', '+',
  '±', '0', '.', '=',
] as const;

interface MemoPopupProps {
  isOpen: boolean;
  onClose: () => void;
  leftOffset: number;
}

export function MemoPopup({ isOpen, onClose, leftOffset }: MemoPopupProps) {
  const [memo, setMemo] = useState('');
  const [calc, setCalc] = useState<CalcState>(CALC_INIT);

  useEffect(() => {
    setMemo(localStorage.getItem(MEMO_KEY) ?? '');
  }, []);

  const handleMemoChange = (val: string) => {
    setMemo(val);
    localStorage.setItem(MEMO_KEY, val);
  };

  const handleClear = () => {
    setMemo('');
    localStorage.removeItem(MEMO_KEY);
  };

  const handleKey = (key: string) => {
    setCalc(prev => {
      if (key === 'C') return CALC_INIT;

      if (key === '⌫') {
        if (prev.waitingForOperand) return prev;
        const d = prev.display.length > 1 ? prev.display.slice(0, -1) : '0';
        return { ...prev, display: d };
      }

      if (key === '±') {
        const num = parseFloat(prev.display);
        return { ...prev, display: fmtNum(-num) };
      }

      if (key === '%') {
        const num = parseFloat(prev.display);
        return { ...prev, display: fmtNum(num / 100) };
      }

      if (key === '=') {
        if (!prev.operator || prev.prev === '') return prev;
        const result = compute(parseFloat(prev.prev), parseFloat(prev.display), prev.operator);
        return { display: fmtNum(result), prev: '', operator: null, waitingForOperand: true };
      }

      if (['+', '-', '×', '÷'].includes(key)) {
        const cur = parseFloat(prev.display);
        if (prev.operator && !prev.waitingForOperand) {
          const result = compute(parseFloat(prev.prev), cur, prev.operator);
          const rs = fmtNum(result);
          return { display: rs, prev: rs, operator: key, waitingForOperand: true };
        }
        return { ...prev, prev: prev.display, operator: key, waitingForOperand: true };
      }

      if (key === '.') {
        if (prev.waitingForOperand) return { ...prev, display: '0.', waitingForOperand: false };
        if (prev.display.includes('.')) return prev;
        return { ...prev, display: prev.display + '.', waitingForOperand: false };
      }

      // digit
      if (prev.waitingForOperand) {
        return { ...prev, display: key, waitingForOperand: false };
      }
      const newDisplay = prev.display === '0' ? key : prev.display + key;
      if (newDisplay.replace('-', '').replace('.', '').length > 12) return prev;
      return { ...prev, display: newDisplay };
    });
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed z-50 w-72 rounded-lg border border-[#E3E3E0] shadow-lg overflow-hidden"
      style={{ backgroundColor: '#F8FAFC', bottom: '100px', left: `${leftOffset}px` }}
    >
      {/* Header */}
      <div className="flex items-center justify-between border-b border-[#E3E3E0] px-3 py-2">
        <span className="text-xs font-semibold text-[#131310]">메모장 &amp; 계산기</span>
        <button
          onClick={onClose}
          className="rounded p-0.5 text-text-secondary hover:bg-[#E3E3E0] transition-colors"
          aria-label="닫기"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* Memo */}
      <div className="p-2.5 border-b border-[#E3E3E0]">
        <textarea
          value={memo}
          onChange={e => handleMemoChange(e.target.value)}
          placeholder="메모를 입력하세요..."
          className="w-full h-28 resize-none rounded border border-[#E3E3E0] bg-white px-2 py-1.5 text-xs text-[#131310] placeholder:text-gray-400 focus:outline-none focus:ring-1 focus:ring-primary/30"
        />
        <button
          onClick={handleClear}
          className="mt-1 flex items-center gap-1 text-[10px] text-text-secondary hover:text-red-500 transition-colors"
        >
          <Trash2 className="h-3 w-3" />
          지우기
        </button>
      </div>

      {/* Calculator */}
      <div className="p-2.5">
        {/* Display */}
        <div className="mb-2 rounded border border-[#E3E3E0] bg-white px-2.5 py-1 min-h-[40px] flex flex-col justify-center overflow-hidden">
          {calc.operator && (
            <div className="text-right text-[10px] text-text-secondary tabular-nums leading-none">
              {calc.prev} {calc.operator}
            </div>
          )}
          <div className="text-right font-mono text-sm tabular-nums text-[#131310] leading-tight">
            {calc.display}
          </div>
        </div>

        {/* Buttons */}
        <div className="grid grid-cols-4 gap-1">
          {CALC_KEYS.map(key => (
            <button
              key={key}
              onClick={() => handleKey(key)}
              className={cn(
                'rounded py-2 text-xs font-medium transition-colors select-none',
                key === '='
                  ? 'bg-primary text-white hover:bg-primary-light'
                  : key === 'C'
                  ? 'bg-red-100 text-red-600 hover:bg-red-200'
                  : ['+', '-', '×', '÷'].includes(key)
                  ? 'bg-[#D6E4F0] text-primary hover:bg-primary-bg'
                  : ['⌫', '%', '±'].includes(key)
                  ? 'bg-[#E3E3E0] text-[#131310] hover:bg-[#D0D0CC]'
                  : 'bg-white border border-[#E3E3E0] text-[#131310] hover:bg-divider',
              )}
            >
              {key}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

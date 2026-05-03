'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { X, Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatKRW, parseKRW } from '@/lib/utils';

// ── Calculator ────────────────────────────────────────────────
interface CalcState {
  display: string;
  prev: string;
  operator: string | null;
  waiting: boolean; // waitingForOperand
}
const CALC_INIT: CalcState = { display: '0', prev: '', operator: null, waiting: false };

function compute(a: number, b: number, op: string): number {
  switch (op) {
    case '+': return a + b;
    case '-': return a - b;
    case '×': return a * b;
    case '÷': return b !== 0 ? a / b : NaN;
    default:  return b;
  }
}
function fmtNum(n: number): string {
  if (!isFinite(n)) return '오류';
  const s = parseFloat(n.toPrecision(10)).toString();
  return s.length > 14 ? n.toExponential(3) : s;
}

const CALC_KEYS = [
  'C',  '⌫', '%', '÷',
  '7',  '8',  '9', '×',
  '4',  '5',  '6', '-',
  '1',  '2',  '3', '+',
  '±',  '0',  '.', '=',
] as const;

const KEY_MAP: Record<string, string> = {
  '0':'0','1':'1','2':'2','3':'3','4':'4',
  '5':'5','6':'6','7':'7','8':'8','9':'9',
  '+':'+', '-':'-', '*':'×', '/':'÷',
  'Enter':'=', '=':'=', 'Escape':'C', 'Backspace':'⌫',
  '.':'.', ',':'.', '%':'%',
};

// ── Layout defaults ────────────────────────────────────────────
const TAB_SIZE = {
  memo: { w: 300, h: 280 },
  calc: { w: 300, h: 570 },
};

// ── Component ─────────────────────────────────────────────────
interface MemoPopupProps {
  isOpen: boolean;
  onClose: () => void;
  leftOffset: number;
}

export function MemoPopup({ isOpen, onClose, leftOffset }: MemoPopupProps) {
  // tab
  const [tab, setTab] = useState<'memo' | 'calc'>('memo');

  // memo
  const [memo, setMemo]           = useState('');
  const [loading, setLoading]     = useState(false);
  const [saveStatus, setSave]     = useState<'idle' | 'saving' | 'saved'>('idle');

  // calc
  const [calc, setCalc]           = useState<CalcState>(CALC_INIT);

  // vat
  const [vatInput, setVatInput]   = useState('');
  const [vatMode, setVatMode]     = useState<'supply' | 'total'>('supply');
  const [vatResult, setVatResult] = useState<{ supply: number; vat: number; total: number } | null>(null);

  // position / size
  const popupRef                  = useRef<HTMLDivElement>(null);
  const [pos, setPos]             = useState<{ x: number; y: number } | null>(null);
  const [size, setSize]           = useState(TAB_SIZE.memo);
  const userResized               = useRef(false);
  const [dragging, setDragging]   = useState(false);
  const dragRef                   = useRef<{ sx: number; sy: number; ox: number; oy: number } | null>(null);
  const resizeRef                 = useRef<{ sx: number; sy: number; ow: number; oh: number } | null>(null);

  // fetch
  const fetched                   = useRef(false);
  const saveTimer                 = useRef<ReturnType<typeof setTimeout>>();

  // ── fetch memo once on first open ──────────────────────────
  useEffect(() => {
    if (!isOpen || fetched.current) return;
    fetched.current = true;
    setLoading(true);
    fetch('/api/memo')
      .then(r => r.json())
      .then((d: { content?: string }) => { setMemo(d.content ?? ''); setLoading(false); })
      .catch(() => setLoading(false));
  }, [isOpen]);

  useEffect(() => () => clearTimeout(saveTimer.current), []);

  // ── memo handlers ──────────────────────────────────────────
  const saveApi = (content: string) => {
    clearTimeout(saveTimer.current);
    setSave('saving');
    saveTimer.current = setTimeout(() => {
      fetch('/api/memo', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content }),
      }).then(() => setSave('saved'));
    }, 1500);
  };
  const handleMemoChange = (v: string) => { setMemo(v); saveApi(v); };
  const handleClear = () => {
    setMemo('');
    clearTimeout(saveTimer.current);
    setSave('saving');
    fetch('/api/memo', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: '' }),
    }).then(() => setSave('saved'));
  };

  // ── calculator ─────────────────────────────────────────────
  const handleKey = useCallback((key: string) => {
    setCalc(p => {
      if (key === 'C') return CALC_INIT;
      if (key === '⌫') {
        if (p.waiting) return p;
        return { ...p, display: p.display.length > 1 ? p.display.slice(0, -1) : '0' };
      }
      if (key === '±') return { ...p, display: fmtNum(-parseFloat(p.display)) };
      if (key === '%')  return { ...p, display: fmtNum(parseFloat(p.display) / 100) };
      if (key === '=') {
        if (!p.operator || p.prev === '') return p;
        const r = compute(parseFloat(p.prev), parseFloat(p.display), p.operator);
        return { display: fmtNum(r), prev: '', operator: null, waiting: true };
      }
      if (['+', '-', '×', '÷'].includes(key)) {
        const cur = parseFloat(p.display);
        if (p.operator && !p.waiting) {
          const r = compute(parseFloat(p.prev), cur, p.operator);
          const rs = fmtNum(r);
          return { display: rs, prev: rs, operator: key, waiting: true };
        }
        return { ...p, prev: p.display, operator: key, waiting: true };
      }
      if (key === '.') {
        if (p.waiting) return { ...p, display: '0.', waiting: false };
        if (p.display.includes('.')) return p;
        return { ...p, display: p.display + '.', waiting: false };
      }
      // digit
      if (p.waiting) return { ...p, display: key, waiting: false };
      const nd = p.display === '0' ? key : p.display + key;
      if (nd.replace('-', '').replace('.', '').length > 12) return p;
      return { ...p, display: nd };
    });
  }, []);

  // keyboard listener (calc tab only)
  useEffect(() => {
    if (!isOpen || tab !== 'calc') return;
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA') return;
      const k = KEY_MAP[e.key];
      if (k) { e.preventDefault(); handleKey(k); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, tab, handleKey]);

  // ── tab switch ─────────────────────────────────────────────
  const switchTab = (t: 'memo' | 'calc') => {
    setTab(t);
    if (!userResized.current) setSize(TAB_SIZE[t]);
  };

  // ── VAT ────────────────────────────────────────────────────
  const calcVat = () => {
    const amt = parseKRW(vatInput);
    if (!amt) return;
    if (vatMode === 'supply') {
      const supply = amt;
      const vat    = Math.round(supply * 0.1);
      setVatResult({ supply, vat, total: supply + vat });
    } else {
      const total  = amt;
      const supply = Math.round(total / 1.1);
      setVatResult({ supply, vat: total - supply, total });
    }
  };

  // ── drag ───────────────────────────────────────────────────
  const onDragDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    const rect = popupRef.current!.getBoundingClientRect();
    dragRef.current = { sx: e.clientX, sy: e.clientY, ox: rect.left, oy: rect.top };
    setDragging(true);
  };
  const onDragMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragRef.current) return;
    setPos({ x: dragRef.current.ox + e.clientX - dragRef.current.sx,
              y: dragRef.current.oy + e.clientY - dragRef.current.sy });
  };
  const onDragUp = () => { dragRef.current = null; setDragging(false); };

  // ── resize ─────────────────────────────────────────────────
  const onResizeDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    resizeRef.current = { sx: e.clientX, sy: e.clientY, ow: size.w, oh: size.h };
  };
  const onResizeMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!resizeRef.current) return;
    setSize({
      w: Math.max(240, resizeRef.current.ow + e.clientX - resizeRef.current.sx),
      h: Math.max(220, resizeRef.current.oh + e.clientY - resizeRef.current.sy),
    });
    userResized.current = true;
  };
  const onResizeUp = () => { resizeRef.current = null; };

  if (!isOpen) return null;

  const posStyle: React.CSSProperties = pos
    ? { left: pos.x, top: pos.y }
    : { bottom: 100, left: leftOffset };

  return (
    <div
      ref={popupRef}
      className="fixed z-50 flex flex-col rounded-lg border border-[#E3E3E0] shadow-lg overflow-hidden"
      style={{ backgroundColor: '#F8FAFC', width: size.w, height: size.h, ...posStyle }}
    >
      {/* ── Header (drag handle) ── */}
      <div
        className={cn(
          'flex shrink-0 items-center justify-between border-b border-[#E3E3E0] px-3 py-2 select-none',
          dragging ? 'cursor-grabbing' : 'cursor-grab',
        )}
        onPointerDown={onDragDown}
        onPointerMove={onDragMove}
        onPointerUp={onDragUp}
      >
        <span className="text-xs font-semibold text-[#131310]">메모 &amp; 계산기</span>
        <button
          onPointerDown={e => e.stopPropagation()}
          onClick={onClose}
          className="rounded p-0.5 text-text-secondary hover:bg-[#E3E3E0] transition-colors"
          aria-label="닫기"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* ── Tabs ── */}
      <div className="flex shrink-0 border-b border-[#E3E3E0]">
        {(['memo', 'calc'] as const).map(t => (
          <button
            key={t}
            onClick={() => switchTab(t)}
            className={cn(
              'flex-1 py-1.5 text-xs font-medium transition-colors',
              tab === t
                ? 'border-b-2 border-primary text-primary bg-white'
                : 'text-text-secondary hover:text-[#131310]',
            )}
          >
            {t === 'memo' ? '메모장' : '계산기'}
          </button>
        ))}
      </div>

      {/* ── Content ── */}
      <div className="flex-1 min-h-0 overflow-y-auto">

        {/* ── MEMO TAB ── */}
        {tab === 'memo' && (
          <div className="flex flex-col h-full p-2.5">
            {loading ? (
              <div className="flex-1 flex items-center justify-center text-xs text-text-secondary">
                불러오는 중...
              </div>
            ) : (
              <textarea
                value={memo}
                onChange={e => handleMemoChange(e.target.value)}
                placeholder="메모를 입력하세요..."
                className="flex-1 w-full resize-none rounded border border-[#E3E3E0] bg-white px-2 py-1.5 text-xs text-[#131310] placeholder:text-gray-400 focus:outline-none focus:ring-1 focus:ring-primary/30"
              />
            )}
            <div className="mt-2 flex shrink-0 items-center justify-between">
              <button
                onClick={handleClear}
                disabled={loading}
                className="flex items-center gap-1 text-[10px] text-text-secondary hover:text-red-500 transition-colors disabled:opacity-40"
              >
                <Trash2 className="h-3 w-3" />지우기
              </button>
              <span className="text-[10px] text-text-secondary">
                {saveStatus === 'saving' && '저장 중...'}
                {saveStatus === 'saved'  && '저장됨'}
              </span>
            </div>
          </div>
        )}

        {/* ── CALC TAB ── */}
        {tab === 'calc' && (
          <div className="p-2.5 space-y-2.5">

            {/* display */}
            <div className="rounded border border-[#E3E3E0] bg-white px-2.5 py-1 min-h-[44px] flex flex-col justify-center overflow-hidden">
              {calc.operator && (
                <div className="text-right text-[10px] text-text-secondary tabular-nums leading-none">
                  {calc.prev} {calc.operator}
                </div>
              )}
              <div className="text-right font-mono text-base tabular-nums text-[#131310]">
                {calc.display}
              </div>
            </div>

            {/* buttons */}
            <div className="grid grid-cols-4 gap-1">
              {CALC_KEYS.map(k => (
                <button
                  key={k}
                  onClick={() => handleKey(k)}
                  className={cn(
                    'rounded py-2 text-xs font-medium transition-colors select-none',
                    k === '=' ? 'bg-primary text-white hover:bg-primary-light'
                    : k === 'C' ? 'bg-red-100 text-red-600 hover:bg-red-200'
                    : ['+','-','×','÷'].includes(k) ? 'bg-primary-bg text-primary hover:opacity-80'
                    : ['⌫','%','±'].includes(k) ? 'bg-[#E3E3E0] text-[#131310] hover:bg-[#D0D0CC]'
                    : 'bg-white border border-[#E3E3E0] text-[#131310] hover:bg-divider',
                  )}
                >
                  {k}
                </button>
              ))}
            </div>

            {/* ── VAT section ── */}
            <div className="rounded border border-[#E3E3E0] bg-white p-2.5">
              <p className="text-[11px] font-semibold text-[#131310] mb-2">부가세 계산 (10%)</p>

              {/* mode toggle */}
              <div className="flex rounded bg-[#ECECEA] p-0.5 mb-2">
                {([['supply', '공급가액 입력'], ['total', '합계금액 입력']] as const).map(([m, label]) => (
                  <button
                    key={m}
                    onClick={() => { setVatMode(m); setVatResult(null); }}
                    className={cn(
                      'flex-1 rounded py-1 text-[10px] font-medium transition-all',
                      vatMode === m ? 'bg-white text-primary shadow-sm' : 'text-text-secondary',
                    )}
                  >
                    {label}
                  </button>
                ))}
              </div>

              {/* input row */}
              <div className="flex items-center gap-1 mb-2">
                <input
                  type="text"
                  inputMode="numeric"
                  value={vatInput}
                  onChange={e => {
                    const raw = e.target.value.replace(/,/g, '');
                    if (/^\d*$/.test(raw)) {
                      setVatInput(raw ? Number(raw).toLocaleString('ko-KR') : '');
                      setVatResult(null);
                    }
                  }}
                  onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); calcVat(); } }}
                  placeholder="금액 입력"
                  className="flex-1 rounded border border-[#E3E3E0] px-2 py-1 text-xs text-right tabular-nums focus:outline-none focus:ring-1 focus:ring-primary/30"
                />
                <span className="text-[10px] text-text-secondary shrink-0">원</span>
                <button
                  onClick={calcVat}
                  className="shrink-0 rounded bg-primary px-2.5 py-1 text-[10px] font-medium text-white hover:bg-primary-light transition-colors"
                >
                  계산
                </button>
              </div>

              {/* result */}
              {vatResult && (
                <div className="space-y-1 border-t border-[#E3E3E0] pt-2">
                  {([
                    { label: '공급가액', val: vatResult.supply, bold: false },
                    { label: '부가세',   val: vatResult.vat,    bold: false },
                    { label: '합계',     val: vatResult.total,  bold: true  },
                  ] as const).map(({ label, val, bold }) => (
                    <div key={label} className="flex items-center justify-between">
                      <span className={cn('text-[10px]', bold ? 'font-semibold text-[#131310]' : 'text-text-secondary')}>
                        {label}
                      </span>
                      <span className={cn('text-xs tabular-nums', bold ? 'font-semibold text-primary' : 'text-[#131310]')}>
                        {formatKRW(val)}원
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* ── Resize handle ── */}
      <div
        className="absolute bottom-0 right-0 w-5 h-5 cursor-se-resize flex items-end justify-end p-1"
        style={{ touchAction: 'none' }}
        onPointerDown={onResizeDown}
        onPointerMove={onResizeMove}
        onPointerUp={onResizeUp}
      >
        <svg viewBox="0 0 9 9" className="w-3 h-3 text-gray-400">
          <path d="M8 1L1 8M8 4.5L4.5 8M8 8" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
        </svg>
      </div>
    </div>
  );
}

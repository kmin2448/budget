'use client';

import { useState, useRef } from 'react';
import { cn } from '@/lib/utils';

interface TooltipProps {
  text: string;
  children: React.ReactNode;
  className?: string;
}

export function Tooltip({ text, children, className }: TooltipProps) {
  const [visible, setVisible] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  return (
    <div
      ref={ref}
      className={cn('relative inline-flex', className)}
      onMouseEnter={() => setVisible(true)}
      onMouseLeave={() => setVisible(false)}
    >
      {children}
      {visible && (
        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 z-50 pointer-events-none">
          <div className="whitespace-nowrap rounded-[2px] bg-[#1F2937] px-2.5 py-1.5 text-xs text-white shadow-md">
            {text}
          </div>
          {/* 말풍선 꼬리 */}
          <div className="mx-auto w-0 h-0 border-l-4 border-r-4 border-t-4 border-l-transparent border-r-transparent border-t-[#1F2937]" />
        </div>
      )}
    </div>
  );
}

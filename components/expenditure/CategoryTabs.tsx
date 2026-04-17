// components/expenditure/CategoryTabs.tsx
'use client';

import React from 'react';
import Link from 'next/link';
import { cn } from '@/lib/utils';
import { CATEGORY_SHEETS } from '@/constants/sheets';
import {
  Users, GraduationCap, BookOpen, Building2,
  FlaskConical, Briefcase, Network, TrendingUp, MoreHorizontal,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

interface CategoryTabsProps {
  activeCategory: string;
}

const CATEGORY_ICON: Record<string, LucideIcon> = {
  '인건비':                           Users,
  '장학금':                           GraduationCap,
  '교육연구프로그램개발운영비':        BookOpen,
  '교육연구환경개선비':               Building2,
  '실험실습장비및기자재구입운영비':    FlaskConical,
  '기업지원협력활동비':               Briefcase,
  '지역연계협업지원비':               Network,
  '성과활용확산지원비':               TrendingUp,
  '그밖의사업운영경비':               MoreHorizontal,
};

const CATEGORY_LABEL: Record<string, React.ReactNode> = {
  '교육연구프로그램개발운영비': <><span>교육연구프로그램</span><span>개발운영비</span></>,
  '실험실습장비및기자재구입운영비': <><span>실험실습장비및</span><span>기자재구입운영비</span></>,
};

export function CategoryTabs({ activeCategory }: CategoryTabsProps) {
  return (
    <nav className="flex w-full gap-1">
      {CATEGORY_SHEETS.map((cat) => {
        const isActive = cat === activeCategory;
        const Icon = CATEGORY_ICON[cat] ?? MoreHorizontal;

        return (
          <Link
            key={cat}
            href={`/expenditure/${encodeURIComponent(cat)}`}
            title={cat}
            className={cn(
              'flex flex-1 flex-col items-center gap-0.5 rounded-md px-1 py-1.5 text-center text-[10px] font-medium leading-tight transition-colors',
              isActive
                ? 'bg-primary text-white shadow-sm'
                : 'bg-white border border-gray-200 text-gray-500 hover:border-primary hover:text-primary',
            )}
          >
            <Icon className="h-3 w-3 shrink-0" />
            {CATEGORY_LABEL[cat] ? (
              <span className="flex flex-col items-center leading-tight">{CATEGORY_LABEL[cat]}</span>
            ) : (
              <span>{cat}</span>
            )}
          </Link>
        );
      })}
    </nav>
  );
}

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
              'flex flex-1 flex-row items-center gap-1.5 rounded-lg px-2 py-2 text-[10px] font-medium leading-tight transition-all duration-150',
              isActive
                ? 'bg-primary text-white shadow-soft'
                : 'bg-white border border-[#E3E3E0] text-text-secondary hover:border-primary hover:text-primary hover:bg-primary-bg',
            )}
          >
            <Icon className="h-4 w-4 shrink-0" />
            {CATEGORY_LABEL[cat] ? (
              <span className="flex flex-col leading-tight">{CATEGORY_LABEL[cat]}</span>
            ) : (
              <span className="leading-tight">{cat}</span>
            )}
          </Link>
        );
      })}
    </nav>
  );
}

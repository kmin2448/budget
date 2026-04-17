'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import {
  LayoutDashboard,
  FileText,
  BarChart2,
  Wallet,
  CreditCard,
  Settings,
  ChevronLeft,
  ChevronRight,
  X,
} from 'lucide-react';
import { useSidebar } from './SidebarContext';

const navItems = [
  { label: '대시보드',       href: '/dashboard',          icon: LayoutDashboard },
  { label: '비목별 집행내역', href: '/expenditure/인건비',  icon: FileText },
  { label: '예산관리',       href: '/budget',              icon: BarChart2 },
  { label: '선지원금',       href: '/advance-funds',       icon: Wallet },
  { label: '카드관리',       href: '/card',                icon: CreditCard },
  { label: '권한관리',       href: '/admin',               icon: Settings },
];

function SidebarContent({ collapsed, onClose }: { collapsed?: boolean; onClose?: () => void }) {
  const pathname = usePathname();

  return (
    <div className="flex h-full flex-col">
      {/* 로고 */}
      <div className="flex h-16 items-center justify-between border-b border-gray-200 px-4">
        {!collapsed && (
          <span className="truncate text-lg font-bold text-primary">COSS 예산관리</span>
        )}
        {collapsed && !onClose && (
          <span className="mx-auto text-lg font-bold text-primary">C</span>
        )}
        {onClose && (
          <>
            <span className="truncate text-lg font-bold text-primary">COSS 예산관리</span>
            <button
              onClick={onClose}
              className="rounded-lg p-1 text-gray-500 hover:bg-gray-100"
              aria-label="메뉴 닫기"
            >
              <X className="h-5 w-5" />
            </button>
          </>
        )}
      </div>

      {/* 네비게이션 */}
      <nav className="flex-1 overflow-y-auto px-2 py-4">
        <ul className="space-y-1">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive =
              item.href === '/dashboard'
                ? pathname === '/dashboard'
                : pathname.startsWith(item.href.split('/').slice(0, 2).join('/'));

            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  title={collapsed ? item.label : undefined}
                  onClick={onClose}
                  className={cn(
                    'flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors',
                    collapsed && !onClose ? 'justify-center px-0' : '',
                    isActive
                      ? 'bg-primary-bg text-primary'
                      : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900',
                  )}
                >
                  <Icon className="h-4 w-4 shrink-0" />
                  {(!collapsed || onClose) && <span className="truncate">{item.label}</span>}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      {/* 하단 */}
      <div className="border-t border-gray-200 px-4 py-3">
        {(!collapsed || onClose) && <p className="text-xs text-gray-400">KNU SDU COSS 2026</p>}
      </div>
    </div>
  );
}

export function Sidebar() {
  const { collapsed, toggle, mobileOpen, closeMobile } = useSidebar();

  return (
    <>
      {/* 모바일 오버레이 배경 */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-20 bg-black/40 md:hidden"
          onClick={closeMobile}
          aria-hidden="true"
        />
      )}

      {/* 모바일 드로어 */}
      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-30 w-64 border-r border-gray-200 bg-white transition-transform duration-200 md:hidden',
          mobileOpen ? 'translate-x-0' : '-translate-x-full',
        )}
      >
        <SidebarContent onClose={closeMobile} />
      </aside>

      {/* 데스크탑 사이드바 */}
      <aside
        className={cn(
          'relative hidden h-screen flex-col border-r border-gray-200 bg-white transition-all duration-200 md:flex',
          collapsed ? 'w-16' : 'w-60',
        )}
      >
        <SidebarContent collapsed={collapsed} />

        {/* 접기/펼치기 버튼 */}
        <button
          onClick={toggle}
          className="absolute -right-3 top-[4.5rem] z-10 flex h-6 w-6 items-center justify-center rounded-full border border-gray-200 bg-white shadow-sm hover:bg-gray-50 transition-colors"
          aria-label={collapsed ? '사이드바 펼치기' : '사이드바 접기'}
        >
          {collapsed ? (
            <ChevronRight className="h-3.5 w-3.5 text-gray-500" />
          ) : (
            <ChevronLeft className="h-3.5 w-3.5 text-gray-500" />
          )}
        </button>
      </aside>
    </>
  );
}

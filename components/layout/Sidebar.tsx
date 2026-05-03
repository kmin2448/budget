'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import { signOut, useSession } from 'next-auth/react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  LayoutDashboard,
  FileText,
  BarChart2,
  Wallet,
  CreditCard,
  Settings,
  FolderOpen,
  ChevronLeft,
  ChevronRight,
  X,
  LogOut,
  User,
  HandCoins,
  Users,
  GitCompare,
} from 'lucide-react';
import { useSidebar } from './SidebarContext';
import { useBudgetType } from '@/contexts/BudgetTypeContext';
import { APP_VERSION } from '@/constants/version';

const navItemsMain = [
  { label: '대시보드',        href: '/dashboard',         icon: LayoutDashboard },
  { label: '비목별 집행내역', href: '/expenditure/인건비', icon: FileText },
  { label: '선지원금',        href: '/advance-funds',     icon: Wallet },
  { label: '카드관리',        href: '/card',              icon: CreditCard },
  { label: 'WE-Meet 지원',   href: '/we-meet',           icon: HandCoins },
  { label: '소학회 지원',     href: '/small-club',        icon: Users },
  { label: '자료실',          href: '/library',           icon: FolderOpen },
];

const navItemsAdmin = [
  { label: '예산관리',        href: '/budget',      icon: BarChart2 },
  { label: '단위과제 예산관리', href: '/unit-budget', icon: GitCompare },
  { label: '권한관리',        href: '/admin',       icon: Settings },
];

function UserSection({ collapsed, onClose }: { collapsed?: boolean; onClose?: () => void }) {
  const { data: session } = useSession();

  const initials = session?.user?.name
    ? session.user.name.split(' ').map((n) => n[0]).join('').toUpperCase().slice(0, 2)
    : 'U';

  const isExpanded = !collapsed || !!onClose;

  return (
    <div className="border-t border-divider px-3 py-3">
      {isExpanded && (
        <p className="mb-1.5 text-center text-[9px] text-gray-400 tracking-tight">
          {APP_VERSION}
        </p>
      )}
      <DropdownMenu>
        <DropdownMenuTrigger
          className={cn(
            'flex w-full items-center gap-2.5 rounded-lg p-2 text-left transition-colors hover:bg-divider focus:outline-none',
            !isExpanded && 'justify-center',
          )}
        >
          <Avatar className="h-7 w-7 shrink-0">
            <AvatarImage src={session?.user?.image ?? undefined} alt={session?.user?.name ?? '사용자'} />
            <AvatarFallback className="bg-primary text-white text-[10px] font-medium">
              {initials}
            </AvatarFallback>
          </Avatar>
          {isExpanded && (
            <div className="flex-1 overflow-hidden">
              <p className="truncate text-xs font-medium text-[#131310]">
                {session?.user?.name ?? '사용자'}
              </p>
              <p className="truncate text-[10px] text-text-secondary">
                {session?.user?.email ?? ''}
              </p>
            </div>
          )}
        </DropdownMenuTrigger>
        <DropdownMenuContent side="top" align="start" className="w-48 border-[#E3E3E0] shadow-card">
          <DropdownMenuGroup>
            <DropdownMenuLabel>
              <div className="flex flex-col gap-0.5">
                <span className="text-sm font-medium text-[#131310]">{session?.user?.name}</span>
                <span className="text-xs text-text-secondary">{session?.user?.email}</span>
              </div>
            </DropdownMenuLabel>
          </DropdownMenuGroup>
          <DropdownMenuSeparator className="bg-divider" />
          <DropdownMenuGroup>
            <DropdownMenuItem className="gap-2 text-text-secondary cursor-pointer">
              <User className="h-4 w-4" />
              내 프로필
            </DropdownMenuItem>
          </DropdownMenuGroup>
          <DropdownMenuSeparator className="bg-divider" />
          <DropdownMenuGroup>
            <DropdownMenuItem
              className="gap-2 text-red-500 focus:text-red-500 cursor-pointer"
              onClick={() => signOut({ callbackUrl: '/login' })}
            >
              <LogOut className="h-4 w-4" />
              로그아웃
            </DropdownMenuItem>
          </DropdownMenuGroup>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

function BudgetTypeToggle({ collapsed }: { collapsed?: boolean }) {
  const { budgetType, setBudgetType } = useBudgetType();
  const isCarryover = budgetType === 'carryover';

  if (collapsed) {
    return (
      <div className="border-b border-divider px-2 py-2 flex justify-center">
        <button
          onClick={() => setBudgetType(isCarryover ? 'main' : 'carryover')}
          title={isCarryover ? '이월예산 (클릭 시 본예산 전환)' : '본예산 (클릭 시 이월예산 전환)'}
          className={cn(
            'flex h-6 w-6 items-center justify-center rounded-md text-[10px] font-bold transition-colors',
            isCarryover
              ? 'bg-amber-100 text-amber-700'
              : 'bg-primary-bg text-primary',
          )}
        >
          {isCarryover ? '이' : '본'}
        </button>
      </div>
    );
  }

  return (
    <div className="border-b border-divider px-3 py-2">
      <div className="flex rounded-lg bg-divider p-0.5">
        <button
          onClick={() => setBudgetType('main')}
          className={cn(
            'flex-1 rounded-md py-1 text-center text-xs font-medium transition-all',
            !isCarryover
              ? 'bg-white text-primary shadow-sm'
              : 'text-text-secondary hover:text-[#131310]',
          )}
        >
          본예산
        </button>
        <button
          onClick={() => setBudgetType('carryover')}
          className={cn(
            'flex-1 rounded-md py-1 text-center text-xs font-medium transition-all',
            isCarryover
              ? 'bg-white text-amber-600 shadow-sm'
              : 'text-text-secondary hover:text-[#131310]',
          )}
        >
          이월예산
        </button>
      </div>
    </div>
  );
}

function SidebarContent({ collapsed, onClose }: { collapsed?: boolean; onClose?: () => void }) {
  const pathname = usePathname();

  return (
    <div className="flex h-full flex-col bg-sidebar">
      {/* 로고 */}
      <div className="flex h-14 items-center justify-between border-b border-divider px-4">
        {!collapsed && (
          <span className="truncate text-[15px] font-semibold text-primary tracking-tight">
            COSS 예산관리
          </span>
        )}
        {collapsed && !onClose && (
          <span className="mx-auto text-[15px] font-semibold text-primary">C</span>
        )}
        {onClose && (
          <>
            <span className="truncate text-[15px] font-semibold text-primary tracking-tight">
              COSS 예산관리
            </span>
            <button
              onClick={onClose}
              className="rounded-lg p-1 text-text-secondary hover:bg-divider transition-colors"
              aria-label="메뉴 닫기"
            >
              <X className="h-4 w-4" />
            </button>
          </>
        )}
      </div>

      {/* 예산 유형 토글 */}
      <BudgetTypeToggle collapsed={collapsed && !onClose} />

      {/* 네비게이션 */}
      <nav className="flex-1 overflow-y-auto px-2 py-3">
        {[navItemsMain, navItemsAdmin].map((group, gi) => (
          <div key={gi}>
            {gi > 0 && <div className="my-2 border-t border-[#C8C8C5]" />}
            <ul className="space-y-0.5">
              {group.map((item) => {
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
                        'flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all duration-150',
                        collapsed && !onClose ? 'justify-center px-0' : '',
                        isActive
                          ? 'bg-primary-bg text-primary'
                          : 'text-text-secondary hover:bg-divider hover:text-[#131310]',
                      )}
                    >
                      <Icon
                        className={cn(
                          'h-4 w-4 shrink-0 transition-colors',
                          isActive ? 'text-primary' : 'text-text-secondary',
                        )}
                      />
                      {(!collapsed || onClose) && <span className="truncate">{item.label}</span>}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>

      {/* 하단 유저 섹션 */}
      <UserSection collapsed={collapsed} onClose={onClose} />
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
          className="fixed inset-0 z-20 bg-black/30 md:hidden"
          onClick={closeMobile}
          aria-hidden="true"
        />
      )}

      {/* 모바일 드로어 */}
      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-30 w-48 border-r border-divider bg-sidebar transition-transform duration-200 md:hidden',
          mobileOpen ? 'translate-x-0' : '-translate-x-full',
        )}
      >
        <SidebarContent onClose={closeMobile} />
      </aside>

      {/* 데스크탑 사이드바 */}
      <aside
        className={cn(
          'relative hidden h-screen flex-col border-r border-divider bg-sidebar transition-all duration-200 md:flex',
          collapsed ? 'w-16' : 'w-[180px]',
        )}
      >
        <SidebarContent collapsed={collapsed} />

        {/* 접기/펼치기 버튼 */}
        <button
          onClick={toggle}
          className="absolute -right-3 top-[4rem] z-10 flex h-6 w-6 items-center justify-center rounded-full border border-divider bg-sidebar shadow-soft hover:bg-primary-bg transition-colors"
          aria-label={collapsed ? '사이드바 펼치기' : '사이드바 접기'}
        >
          {collapsed ? (
            <ChevronRight className="h-3.5 w-3.5 text-text-secondary" />
          ) : (
            <ChevronLeft className="h-3.5 w-3.5 text-text-secondary" />
          )}
        </button>
      </aside>
    </>
  );
}

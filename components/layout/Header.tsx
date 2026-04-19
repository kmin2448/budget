'use client';

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
import { LogOut, User, Menu } from 'lucide-react';
import { useSidebar } from './SidebarContext';

export function Header() {
  const { data: session } = useSession();
  const { toggle, openMobile } = useSidebar();

  const initials = session?.user?.name
    ? session.user.name
        .split(' ')
        .map((n) => n[0])
        .join('')
        .toUpperCase()
        .slice(0, 2)
    : 'U';

  return (
    <header className="flex h-16 items-center justify-between border-b border-divider bg-background px-6">
      <button
        onClick={() => {
          if (window.innerWidth < 768) openMobile();
          else toggle();
        }}
        className="rounded-lg p-1.5 text-text-secondary hover:bg-sidebar hover:text-[#131310] transition-colors"
        aria-label="사이드바 토글"
      >
        <Menu className="h-5 w-5" />
      </button>

      <DropdownMenu>
        <DropdownMenuTrigger className="flex items-center gap-2.5 rounded-full focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2">
          <Avatar className="h-8 w-8">
            <AvatarImage src={session?.user?.image ?? undefined} alt={session?.user?.name ?? '사용자'} />
            <AvatarFallback className="bg-primary text-white text-xs font-medium">
              {initials}
            </AvatarFallback>
          </Avatar>
          <span className="text-sm font-medium text-[#131310]">
            {session?.user?.name ?? '사용자'}
          </span>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-48 border-[#E3E3E0] shadow-card">
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
    </header>
  );
}

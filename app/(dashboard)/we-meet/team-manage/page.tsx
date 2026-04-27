'use client';

import Link from 'next/link';
import { useSession } from 'next-auth/react';
import { ArrowLeft } from 'lucide-react';
import { WeMeetTeamManageSection } from '@/components/we-meet/WeMeetTeamManageSection';

export default function WeMeetTeamManagePage() {
  const { data: session } = useSession();
  const userRole = (session?.user as { role?: string } | undefined)?.role;
  const userPermissions = (session?.user as { permissions?: string[] } | undefined)?.permissions ?? [];
  const canWrite = userRole === 'super_admin' || userPermissions.includes('wemeet:write');

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-2">
        <Link
          href="/we-meet"
          className="flex items-center gap-1 rounded-md px-2 py-1 text-sm text-gray-400 hover:bg-[#F3F3EE] hover:text-primary transition-colors"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          WE-Meet 지원
        </Link>
        <span className="text-gray-300">/</span>
        <div className="flex items-baseline gap-2">
          <h1 className="text-xl font-semibold text-[#131310] tracking-tight">팀 관리</h1>
        </div>
      </div>

      <WeMeetTeamManageSection canWrite={canWrite} />
    </div>
  );
}

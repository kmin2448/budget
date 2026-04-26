'use client';

import Link from 'next/link';
import { useSession } from 'next-auth/react';
import { ArrowLeft } from 'lucide-react';
import { WeMeetExecutionsSection } from '@/components/we-meet/WeMeetExecutionsSection';

export default function WeMeetExecutionsPage() {
  const { data: session } = useSession();
  const userRole = (session?.user as { role?: string } | undefined)?.role;
  const canWrite = userRole === 'super_admin' || userRole === 'admin';

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Link
          href="/we-meet"
          className="flex items-center gap-1 rounded-md px-2 py-1 text-sm text-gray-400 hover:bg-[#F3F3EE] hover:text-primary transition-colors"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          WE-Meet 지원
        </Link>
        <span className="text-gray-300">/</span>
        <h1 className="text-xl font-semibold text-[#131310] tracking-tight">집행현황 관리</h1>
        <span className="text-sm text-gray-400">건별·팀별 집행 내역 입력 및 관리</span>
      </div>

      <WeMeetExecutionsSection canWrite={canWrite} />
    </div>
  );
}

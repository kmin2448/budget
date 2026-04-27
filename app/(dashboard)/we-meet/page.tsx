'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useSession } from 'next-auth/react';
import { BarChart3, ClipboardList, Users, ExternalLink, Pencil, Check, X } from 'lucide-react';
import { WeMeetTeamsSection } from '@/components/we-meet/WeMeetTeamsSection';
import { WeMeetTeamManageSection } from '@/components/we-meet/WeMeetTeamManageSection';
import { WeMeetExecutionsSection } from '@/components/we-meet/WeMeetExecutionsSection';

type TabId = 'teams' | 'executions' | 'team-manage';

const TABS: { id: TabId; label: string; icon: React.ElementType; adminOnly?: boolean }[] = [
  { id: 'executions',  label: '집행현황',     icon: ClipboardList, adminOnly: true },
  { id: 'teams',       label: '팀별 현황',    icon: BarChart3 },
  { id: 'team-manage', label: '팀 관리',      icon: Users,         adminOnly: true },
];

const DEFAULT_REF_URL = 'https://docs.google.com/spreadsheets/d/1Z1TuM4Z8AlKdhiPUicWOG90OFHe317EyQ4WXQaJuaHQ/edit?gid=603218452#gid=603218452';
const STORAGE_KEY = 'wemeet-reference-url';

export default function WeMeetPage() {
  const { data: session } = useSession();
  const userRole = (session?.user as { role?: string } | undefined)?.role;
  const userPermissions = (session?.user as { permissions?: string[] } | undefined)?.permissions ?? [];
  const canWrite = userRole === 'super_admin' || userPermissions.includes('wemeet:write');

  const [activeTab, setActiveTab] = useState<TabId>('executions');
  const [sharedAdvisorOrder, setSharedAdvisorOrder] = useState<string[]>([]);
  const handleAdvisorOrderChange = useCallback((order: string[]) => setSharedAdvisorOrder(order), []);

  const [referenceUrl, setReferenceUrl] = useState(DEFAULT_REF_URL);
  const [isEditingUrl, setIsEditingUrl] = useState(false);
  const [urlInput, setUrlInput]         = useState('');
  const urlInputRef                     = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) setReferenceUrl(saved);
  }, []);

  function openUrlEdit() {
    setUrlInput(referenceUrl);
    setIsEditingUrl(true);
    setTimeout(() => urlInputRef.current?.select(), 0);
  }

  function saveUrl() {
    const trimmed = urlInput.trim();
    if (trimmed) {
      setReferenceUrl(trimmed);
      localStorage.setItem(STORAGE_KEY, trimmed);
    }
    setIsEditingUrl(false);
  }

  return (
    <div className="space-y-5">
      {/* 페이지 헤더 */}
      <div className="flex items-baseline gap-2">
        <h1 className="text-2xl font-semibold text-[#131310] tracking-tight">WE-Meet 지원</h1>
        <span className="text-sm text-gray-400">프로젝트 수행팀 예산 지원관리</span>
      </div>

      {/* 탭 + 참고링크 (같은 행) */}
      <div className="flex items-end justify-between border-b border-[#E3E3E0]">
        {/* 탭 버튼 */}
        <div className="flex items-center gap-1">
          {TABS.map(({ id, label, icon: Icon, adminOnly }) => {
            const disabled = adminOnly && !canWrite;
            const isActive = activeTab === id;
            return (
              <button
                key={id}
                disabled={disabled}
                onClick={() => !disabled && setActiveTab(id)}
                className={[
                  'flex items-center gap-1.5 rounded-t-md px-4 py-2 text-sm font-medium transition-colors',
                  isActive
                    ? 'border border-b-white border-[#E3E3E0] -mb-px bg-white text-primary'
                    : disabled
                      ? 'cursor-not-allowed text-gray-300'
                      : 'text-gray-500 hover:bg-[#F3F3EE] hover:text-[#131310]',
                ].join(' ')}
                title={disabled ? '관리자 전용' : undefined}
              >
                <Icon className="h-3.5 w-3.5" />
                {label}
                {disabled && (
                  <span className="ml-1 rounded bg-gray-100 px-1 py-px text-[10px] text-gray-400">관리자</span>
                )}
              </button>
            );
          })}
        </div>

        {/* 참고링크 */}
        <div className="flex items-center gap-1 pb-1.5">
          {isEditingUrl ? (
            <>
              <input
                ref={urlInputRef}
                value={urlInput}
                onChange={(e) => setUrlInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') saveUrl();
                  if (e.key === 'Escape') setIsEditingUrl(false);
                }}
                placeholder="URL 입력"
                className="h-7 w-64 rounded border border-[#E3E3E0] px-2 text-xs text-[#131310] focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
              />
              <button
                onClick={saveUrl}
                title="저장"
                className="flex h-7 w-7 items-center justify-center rounded bg-primary text-white hover:bg-primary-light transition-colors"
              >
                <Check className="h-3.5 w-3.5" />
              </button>
              <button
                onClick={() => setIsEditingUrl(false)}
                title="취소"
                className="flex h-7 w-7 items-center justify-center rounded border border-[#E3E3E0] bg-white text-gray-500 hover:bg-gray-50 transition-colors"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </>
          ) : (
            <>
              <a
                href={referenceUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1.5 rounded-md border border-[#D6E4F0] bg-[#EEF3F8] px-2.5 py-1 text-xs font-medium text-[#1F5C99] hover:bg-[#D6E4F0] transition-colors"
              >
                <ExternalLink className="h-3 w-3" />
                참고링크 바로가기
              </a>
              {canWrite && (
                <button
                  onClick={openUrlEdit}
                  title="링크 주소 수정"
                  className="flex h-7 w-7 items-center justify-center rounded border border-[#E3E3E0] bg-white text-gray-400 hover:border-primary hover:text-primary transition-colors"
                >
                  <Pencil className="h-3 w-3" />
                </button>
              )}
            </>
          )}
        </div>
      </div>

      {/* 탭 콘텐츠 */}
      {activeTab === 'teams' && (
        <WeMeetTeamsSection canWrite={canWrite} onAdvisorOrderChange={handleAdvisorOrderChange} />
      )}
      {activeTab === 'executions' && (
        <WeMeetExecutionsSection canWrite={canWrite} />
      )}
      {activeTab === 'team-manage' && (
        <WeMeetTeamManageSection canWrite={canWrite} advisorOrder={sharedAdvisorOrder} />
      )}
    </div>
  );
}

'use client';

import { useState, useEffect } from 'react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { CATEGORY_SHEETS } from '@/constants/sheets';

export const SEND_SETTINGS_KEY = 'wemeet_send_settings_v2';

export interface WeMeetSendSettings {
  budgetType: 'main' | 'carryover';
  category: string;
  subCat: string;    // 구분/프로그램 (보조비목)
  subDetail: string; // 세목 (선택)
}

const DEFAULT_SETTINGS: WeMeetSendSettings = {
  budgetType: 'main',
  category: CATEGORY_SHEETS[2] ?? CATEGORY_SHEETS[0],
  subCat: '',
  subDetail: '',
};

export function loadSendSettings(): WeMeetSendSettings {
  if (typeof window === 'undefined') return DEFAULT_SETTINGS;
  try {
    const raw = localStorage.getItem(SEND_SETTINGS_KEY);
    if (!raw) return DEFAULT_SETTINGS;
    return { ...DEFAULT_SETTINGS, ...(JSON.parse(raw) as Partial<WeMeetSendSettings>) };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export function saveSendSettings(s: WeMeetSendSettings) {
  localStorage.setItem(SEND_SETTINGS_KEY, JSON.stringify(s));
}

interface Props {
  open: boolean;
  onClose: () => void;
}

const fi = 'w-full rounded-md border border-[#E3E3E0] bg-white px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary';

export function WeMeetSendSettingsModal({ open, onClose }: Props) {
  const [settings, setSettings] = useState<WeMeetSendSettings>(DEFAULT_SETTINGS);

  useEffect(() => {
    if (open) setSettings(loadSendSettings());
  }, [open]);

  function set<K extends keyof WeMeetSendSettings>(key: K, val: WeMeetSendSettings[K]) {
    setSettings((s) => ({ ...s, [key]: val }));
  }

  function handleSave() {
    saveSendSettings(settings);
    onClose();
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-w-md rounded-[2px]" showCloseButton={false}>
        <DialogHeader>
          <DialogTitle>보내기 기본 설정</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-1">
          <p className="text-xs text-gray-400">
            집행현황 → 비목별 집행내역 전송 시 기본으로 사용할 값을 설정합니다. 보낼 때 수정 가능합니다.
          </p>

          {/* 예산구분 */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-[#131310]">예산구분</label>
            <div className="flex gap-3">
              {(['main', 'carryover'] as const).map((t) => (
                <label key={t} className="flex items-center gap-1.5 cursor-pointer">
                  <input
                    type="radio"
                    name="budgetType"
                    value={t}
                    checked={settings.budgetType === t}
                    onChange={() => set('budgetType', t)}
                    className="accent-primary"
                  />
                  <span className="text-sm">{t === 'main' ? '본예산' : '이월예산'}</span>
                </label>
              ))}
            </div>
          </div>

          {/* 비목 */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-[#131310]">비목</label>
            <select value={settings.category} onChange={(e) => set('category', e.target.value)} className={fi}>
              {CATEGORY_SHEETS.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>

          {/* 구분/프로그램 (보조비목) */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-[#131310]">
              구분/프로그램 <span className="text-[11px] text-gray-400 font-normal">(비목별 집행내역 A열)</span>
            </label>
            <input
              type="text"
              value={settings.subCat}
              onChange={(e) => set('subCat', e.target.value)}
              placeholder="예: WE-Meet 지원비"
              className={fi}
            />
          </div>

          {/* 세목 */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-[#131310]">
              세목 <span className="text-[11px] text-gray-400 font-normal">(선택 — 구분/프로그램 뒤에 '/ 세목' 형태로 붙음)</span>
            </label>
            <input
              type="text"
              value={settings.subDetail}
              onChange={(e) => set('subDetail', e.target.value)}
              placeholder="예: WE-Meet"
              className={fi}
            />
          </div>

          {/* 미리보기 */}
          {settings.subCat && (
            <div className="rounded-md bg-[#F5F9FC] px-3 py-2 text-xs text-[#6F6F6B]">
              <span className="font-medium text-primary">구분/프로그램 미리보기: </span>
              {settings.subDetail ? `${settings.subCat} / ${settings.subDetail}` : settings.subCat}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>취소</Button>
          <Button onClick={handleSave}>저장</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

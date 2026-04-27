'use client';

import { useState, useEffect } from 'react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { CATEGORY_SHEETS } from '@/constants/sheets';

export const SMALL_CLUB_SEND_SETTINGS_KEY = 'smallclub_send_settings_v1';

export interface SmallClubSendSettings {
  budgetType: 'main' | 'carryover';
  category: string;
}

const DEFAULT_SETTINGS: SmallClubSendSettings = {
  budgetType: 'main',
  category: CATEGORY_SHEETS[2] ?? CATEGORY_SHEETS[0],
};

export function loadSmallClubSendSettings(): SmallClubSendSettings {
  if (typeof window === 'undefined') return DEFAULT_SETTINGS;
  try {
    const raw = localStorage.getItem(SMALL_CLUB_SEND_SETTINGS_KEY);
    if (!raw) return DEFAULT_SETTINGS;
    return { ...DEFAULT_SETTINGS, ...(JSON.parse(raw) as Partial<SmallClubSendSettings>) };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export function saveSmallClubSendSettings(s: SmallClubSendSettings) {
  localStorage.setItem(SMALL_CLUB_SEND_SETTINGS_KEY, JSON.stringify(s));
}

interface Props {
  open: boolean;
  onClose: () => void;
}

const fi = 'w-full rounded-md border border-[#E3E3E0] bg-white px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary';

export function SmallClubSendSettingsModal({ open, onClose }: Props) {
  const [settings, setSettings] = useState<SmallClubSendSettings>(DEFAULT_SETTINGS);

  useEffect(() => {
    if (open) setSettings(loadSmallClubSendSettings());
  }, [open]);

  function set<K extends keyof SmallClubSendSettings>(key: K, val: SmallClubSendSettings[K]) {
    setSettings((s) => ({ ...s, [key]: val }));
  }

  function handleSave() {
    saveSmallClubSendSettings(settings);
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
            집행현황 → 비목별 집행내역 전송 시 기본으로 사용할 예산구분과 비목을 설정합니다.
            보낼 때 변경 가능합니다.
          </p>

          <div className="space-y-1.5">
            <label className="text-sm font-medium text-[#131310]">예산구분</label>
            <div className="flex gap-4">
              {(['main', 'carryover'] as const).map((t) => (
                <label key={t} className="flex items-center gap-1.5 cursor-pointer">
                  <input
                    type="radio"
                    name="sc-budgetType"
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

          <div className="space-y-1.5">
            <label className="text-sm font-medium text-[#131310]">비목</label>
            <select value={settings.category} onChange={(e) => set('category', e.target.value)} className={fi}>
              {CATEGORY_SHEETS.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
            <p className="text-[11px] text-gray-400">
              보낼 때 이 비목의 구분/프로그램 목록을 불러옵니다.
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>취소</Button>
          <Button onClick={handleSave}>저장</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

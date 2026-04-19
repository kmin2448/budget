'use client';

import { useState, useEffect } from 'react';
import { X, Plus, Trash2, Pencil, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { CardConfigCard } from '@/hooks/useCardManagement';

interface Props {
  open: boolean;
  cardTypes: string[];
  cardHolders: Record<string, string[]>;
  onClose: () => void;
  onSave: (cards: CardConfigCard[]) => Promise<void>;
}

const inputCls =
  'rounded-md border border-gray-300 bg-white px-2.5 py-1.5 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary/30';

export function CardConfigModal({ open, cardTypes, cardHolders, onClose, onSave }: Props) {
  const [cards, setCards] = useState<CardConfigCard[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 편집 상태: { slotIdx, holderIdx } — holderIdx=-1 이면 새 명의자 추가
  const [editingHolder, setEditingHolder] = useState<{ slotIdx: number; holderIdx: number } | null>(null);
  const [editValue, setEditValue] = useState('');

  useEffect(() => {
    if (!open) return;
    // cardTypes는 항상 3개 (L/M/N)
    const initial: CardConfigCard[] = [0, 1, 2].map((i) => {
      const name = cardTypes[i] ?? '';
      return { name, holders: [...(cardHolders[name] ?? [])] };
    });
    setCards(initial);
    setEditingHolder(null);
    setEditValue('');
    setError(null);
  }, [open, cardTypes, cardHolders]);

  if (!open) return null;

  function updateName(slotIdx: number, name: string) {
    setCards((prev) => prev.map((c, i) => (i === slotIdx ? { ...c, name } : c)));
  }

  function deleteCard(slotIdx: number) {
    setCards((prev) =>
      prev.map((c, i) => (i === slotIdx ? { name: '', holders: [] } : c)),
    );
  }

  function startAddHolder(slotIdx: number) {
    setEditingHolder({ slotIdx, holderIdx: -1 });
    setEditValue('');
  }

  function startEditHolder(slotIdx: number, holderIdx: number) {
    setEditingHolder({ slotIdx, holderIdx });
    setEditValue(cards[slotIdx].holders[holderIdx]);
  }

  function commitHolder() {
    if (!editingHolder) return;
    const { slotIdx, holderIdx } = editingHolder;
    const val = editValue.trim();
    if (!val) { setEditingHolder(null); return; }

    setCards((prev) =>
      prev.map((c, i) => {
        if (i !== slotIdx) return c;
        const holders = [...c.holders];
        if (holderIdx === -1) holders.push(val);
        else holders[holderIdx] = val;
        return { ...c, holders };
      }),
    );
    setEditingHolder(null);
    setEditValue('');
  }

  function deleteHolder(slotIdx: number, holderIdx: number) {
    setCards((prev) =>
      prev.map((c, i) => {
        if (i !== slotIdx) return c;
        return { ...c, holders: c.holders.filter((_, hi) => hi !== holderIdx) };
      }),
    );
  }

  async function handleSave() {
    setSaving(true);
    setError(null);
    try {
      await onSave(cards);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : '저장 실패');
    } finally {
      setSaving(false);
    }
  }

  const SLOT_LABELS = ['카드 1 (L열)', '카드 2 (M열)', '카드 3 (N열)'];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-2xl rounded-xl bg-white shadow-xl flex flex-col max-h-[90vh]">
        {/* 헤더 */}
        <div className="flex items-center justify-between border-b px-6 py-4">
          <h2 className="text-base font-semibold text-gray-900">카드 관리</h2>
          <button onClick={onClose} className="rounded p-1 text-gray-400 hover:text-gray-600">
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* 본문 */}
        <div className="overflow-y-auto px-6 py-4 space-y-5">
          {cards.map((card, slotIdx) => (
            <div key={slotIdx} className="rounded-lg border border-gray-200 p-4 space-y-3">
              {/* 카드 이름 행 */}
              <div className="flex items-center gap-2">
                <span className="w-24 shrink-0 text-xs text-gray-400">{SLOT_LABELS[slotIdx]}</span>
                <input
                  type="text"
                  value={card.name}
                  onChange={(e) => updateName(slotIdx, e.target.value)}
                  placeholder="카드 구분명 (예: 산단카드)"
                  className={cn(inputCls, 'flex-1')}
                />
                <button
                  onClick={() => deleteCard(slotIdx)}
                  className="rounded p-1.5 text-gray-300 hover:bg-red-50 hover:text-red-400"
                  title="카드 삭제 (이름·명의자 초기화)"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>

              {/* 명의자 목록 */}
              <div className="pl-[6.5rem] space-y-1.5">
                <p className="text-xs font-medium text-gray-500">명의자</p>

                {card.holders.length === 0 && (
                  <p className="text-xs text-gray-300">등록된 명의자가 없습니다.</p>
                )}

                {card.holders.map((holder, holderIdx) => {
                  const isEditing =
                    editingHolder?.slotIdx === slotIdx &&
                    editingHolder?.holderIdx === holderIdx;
                  return (
                    <div key={holderIdx} className="flex items-center gap-1.5">
                      {isEditing ? (
                        <>
                          <input
                            autoFocus
                            type="text"
                            value={editValue}
                            onChange={(e) => setEditValue(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') commitHolder();
                              if (e.key === 'Escape') setEditingHolder(null);
                            }}
                            className={cn(inputCls, 'flex-1 py-1 text-xs')}
                          />
                          <button
                            onClick={commitHolder}
                            className="rounded p-1 text-complete hover:bg-green-50"
                          >
                            <Check className="h-3.5 w-3.5" />
                          </button>
                          <button
                            onClick={() => setEditingHolder(null)}
                            className="rounded p-1 text-gray-400 hover:bg-gray-100"
                          >
                            <X className="h-3.5 w-3.5" />
                          </button>
                        </>
                      ) : (
                        <>
                          <span className="flex-1 rounded border border-transparent px-2.5 py-1 text-xs text-gray-700 bg-gray-50">
                            {holder}
                          </span>
                          <button
                            onClick={() => startEditHolder(slotIdx, holderIdx)}
                            className="rounded p-1 text-gray-300 hover:bg-gray-100 hover:text-primary"
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </button>
                          <button
                            onClick={() => deleteHolder(slotIdx, holderIdx)}
                            className="rounded p-1 text-gray-300 hover:bg-red-50 hover:text-red-400"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </>
                      )}
                    </div>
                  );
                })}

                {/* 새 명의자 추가 */}
                {editingHolder?.slotIdx === slotIdx && editingHolder?.holderIdx === -1 ? (
                  <div className="flex items-center gap-1.5">
                    <input
                      autoFocus
                      type="text"
                      value={editValue}
                      onChange={(e) => setEditValue(e.target.value)}
                      placeholder="명의자 이름"
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') commitHolder();
                        if (e.key === 'Escape') setEditingHolder(null);
                      }}
                      className={cn(inputCls, 'flex-1 py-1 text-xs')}
                    />
                    <button
                      onClick={commitHolder}
                      className="rounded p-1 text-complete hover:bg-green-50"
                    >
                      <Check className="h-3.5 w-3.5" />
                    </button>
                    <button
                      onClick={() => setEditingHolder(null)}
                      className="rounded p-1 text-gray-400 hover:bg-gray-100"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => startAddHolder(slotIdx)}
                    className="flex items-center gap-1 rounded border border-dashed border-gray-200 px-2.5 py-1 text-xs text-gray-400 hover:border-primary hover:text-primary"
                  >
                    <Plus className="h-3 w-3" />
                    명의자 추가
                  </button>
                )}
              </div>
            </div>
          ))}

          {error && <p className="text-sm text-red-500">{error}</p>}
        </div>

        {/* 푸터 */}
        <div className="flex justify-end gap-2 border-t px-6 py-4">
          <Button variant="outline" size="sm" onClick={onClose} disabled={saving}>
            취소
          </Button>
          <Button
            size="sm"
            disabled={saving}
            onClick={() => void handleSave()}
            className="bg-primary text-white hover:bg-primary-light"
          >
            {saving ? '저장 중...' : '저장'}
          </Button>
        </div>
      </div>
    </div>
  );
}

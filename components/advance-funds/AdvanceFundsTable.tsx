'use client';

import { useState } from 'react';
import { formatKRW, parseKRW } from '@/lib/utils';
import { Plus, Trash2, Check, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { AdvanceFundItem } from '@/hooks/useAdvanceFunds';

type ItemType = 'income' | 'expense';

interface EditState {
  rowIndex: number;
  type: ItemType;
  label: string;
  amount: string;
}

interface AddState {
  type: ItemType;
  label: string;
  amount: string;
}

interface Props {
  incomeItems: AdvanceFundItem[];
  expenseItems: AdvanceFundItem[];
  canWrite: boolean;
  onAdd: (type: ItemType, label: string, amount: number) => Promise<void>;
  onUpdate: (type: ItemType, rowIndex: number, label: string, amount: number) => Promise<void>;
  onDelete: (type: ItemType, rowIndex: number) => Promise<void>;
}

const inputCls =
  'w-full rounded border border-primary/50 bg-white px-1.5 py-0.5 text-sm outline-none focus:border-primary focus:ring-1 focus:ring-primary/30';

export function AdvanceFundsTable({
  incomeItems, expenseItems, canWrite, onAdd, onUpdate, onDelete,
}: Props) {
  const [editState, setEditState] = useState<EditState | null>(null);
  const [addState, setAddState] = useState<AddState | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // ── 인라인 편집 시작 ──────────────────────────────────────────
  function startEdit(type: ItemType, item: AdvanceFundItem, e: React.MouseEvent) {
    if (!canWrite) return;
    e.stopPropagation();
    setEditState({
      rowIndex: item.rowIndex,
      type,
      label: item.label,
      amount: item.amount > 0 ? formatKRW(item.amount) : '',
    });
    setAddState(null);
    setError(null);
  }

  function cancelEdit() {
    setEditState(null);
    setError(null);
  }

  async function commitEdit() {
    if (!editState || saving) return;
    const amount = parseKRW(editState.amount);
    if (!editState.label.trim()) { setError('내역을 입력해주세요.'); return; }
    setSaving(true);
    setError(null);
    try {
      await onUpdate(editState.type, editState.rowIndex, editState.label.trim(), amount);
      setEditState(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : '저장 실패');
    } finally {
      setSaving(false);
    }
  }

  // ── 행 추가 ──────────────────────────────────────────────────
  function startAdd(type: ItemType) {
    setAddState({ type, label: '', amount: '' });
    setEditState(null);
    setError(null);
  }

  function cancelAdd() {
    setAddState(null);
    setError(null);
  }

  async function commitAdd() {
    if (!addState || saving) return;
    if (!addState.label.trim()) { setError('내역을 입력해주세요.'); return; }
    const amount = parseKRW(addState.amount);
    setSaving(true);
    setError(null);
    try {
      await onAdd(addState.type, addState.label.trim(), amount);
      setAddState(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : '추가 실패');
    } finally {
      setSaving(false);
    }
  }

  // ── 삭제 ─────────────────────────────────────────────────────
  async function handleDelete(type: ItemType, rowIndex: number) {
    if (!canWrite || saving) return;
    if (!confirm('이 항목을 삭제하시겠습니까?')) return;
    setSaving(true);
    setError(null);
    try {
      await onDelete(type, rowIndex);
    } catch (err) {
      setError(err instanceof Error ? err.message : '삭제 실패');
    } finally {
      setSaving(false);
    }
  }

  // ── 항목 테이블 렌더 ─────────────────────────────────────────
  function renderTable(type: ItemType, items: AdvanceFundItem[], title: string, colorCls: string) {
    const isAddingThis = addState?.type === type;
    const total = items.reduce((s, i) => s + i.amount, 0);

    return (
      <div className="flex-1 min-w-0">
        {/* 테이블 헤더 */}
        <div className="flex items-center justify-between mb-2">
          <h3 className={cn('text-sm font-semibold', colorCls)}>{title}</h3>
          {canWrite && !isAddingThis && (
            <button
              onClick={() => startAdd(type)}
              className="flex items-center gap-1 rounded px-2 py-1 text-xs text-gray-500 hover:bg-gray-100 hover:text-gray-700"
            >
              <Plus className="h-3.5 w-3.5" />
              항목 추가
            </button>
          )}
        </div>

        <div className="rounded-[2px] border border-gray-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50 text-left text-xs font-medium text-gray-500">
                <th className="px-3 py-2">{type === 'income' ? '수입내역' : '지출내역'}</th>
                <th className="px-3 py-2 text-right w-32">{type === 'income' ? '수입금액' : '지출금액'}</th>
                {canWrite && <th className="w-14" />}
              </tr>
            </thead>
            <tbody>
              {items.length === 0 && !isAddingThis && (
                <tr>
                  <td colSpan={canWrite ? 3 : 2} className="px-3 py-6 text-center text-xs text-gray-400">
                    항목이 없습니다.
                  </td>
                </tr>
              )}

              {items.map((item, idx) => {
                const isEditing = editState?.type === type && editState?.rowIndex === item.rowIndex;
                return (
                  <tr
                    key={item.rowIndex}
                    className={cn(
                      'border-b border-gray-100 transition-colors',
                      idx % 2 === 0 ? 'bg-white' : 'bg-gray-50/40',
                      canWrite && !isEditing && 'cursor-pointer hover:bg-primary-bg/30',
                    )}
                    onDoubleClick={canWrite && !isEditing ? (e) => startEdit(type, item, e) : undefined}
                    title={canWrite && !isEditing ? '더블클릭하여 수정' : undefined}
                  >
                    {isEditing ? (
                      <>
                        <td className="px-2 py-1.5">
                          <input
                            autoFocus
                            value={editState.label}
                            onChange={(e) => setEditState((p) => p ? { ...p, label: e.target.value } : p)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') void commitEdit();
                              if (e.key === 'Escape') cancelEdit();
                            }}
                            className={inputCls}
                          />
                        </td>
                        <td className="px-2 py-1.5">
                          <input
                            value={editState.amount}
                            onChange={(e) => {
                              const digits = e.target.value.replace(/[^0-9]/g, '');
                              setEditState((p) => p ? { ...p, amount: digits ? formatKRW(Number(digits)) : '' } : p);
                            }}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') void commitEdit();
                              if (e.key === 'Escape') cancelEdit();
                            }}
                            placeholder="0"
                            className={cn(inputCls, 'text-right tabular-nums')}
                          />
                        </td>
                        <td className="px-1 py-1.5">
                          <div className="flex items-center justify-center gap-0.5">
                            <button
                              onClick={() => void commitEdit()}
                              disabled={saving}
                              className="rounded p-1 text-complete hover:bg-green-50"
                              title="저장"
                            >
                              <Check className="h-3.5 w-3.5" />
                            </button>
                            <button
                              onClick={cancelEdit}
                              className="rounded p-1 text-gray-400 hover:bg-gray-100"
                              title="취소"
                            >
                              <X className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </td>
                      </>
                    ) : (
                      <>
                        <td className="px-3 py-2 text-gray-700">{item.label || '-'}</td>
                        <td className="px-3 py-2 text-right tabular-nums font-medium text-gray-800">
                          {formatKRW(item.amount)}
                        </td>
                        {canWrite && (
                          <td className="px-1 py-2">
                            <div className="flex items-center justify-center">
                              <button
                                onClick={(e) => { e.stopPropagation(); void handleDelete(type, item.rowIndex); }}
                                disabled={saving}
                                className="rounded p-1 text-gray-300 hover:bg-red-50 hover:text-red-400"
                                title="삭제"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          </td>
                        )}
                      </>
                    )}
                  </tr>
                );
              })}

              {/* 행 추가 입력 폼 */}
              {isAddingThis && (
                <tr className="border-b border-primary/20 bg-blue-50/30">
                  <td className="px-2 py-1.5">
                    <input
                      autoFocus
                      value={addState.label}
                      onChange={(e) => setAddState((p) => p ? { ...p, label: e.target.value } : p)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') void commitAdd();
                        if (e.key === 'Escape') cancelAdd();
                      }}
                      placeholder={type === 'income' ? '수입내역 입력' : '지출내역 입력'}
                      className={inputCls}
                    />
                  </td>
                  <td className="px-2 py-1.5">
                    <input
                      value={addState.amount}
                      onChange={(e) => {
                        const digits = e.target.value.replace(/[^0-9]/g, '');
                        setAddState((p) => p ? { ...p, amount: digits ? formatKRW(Number(digits)) : '' } : p);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') void commitAdd();
                        if (e.key === 'Escape') cancelAdd();
                      }}
                      placeholder="0"
                      className={cn(inputCls, 'text-right tabular-nums')}
                    />
                  </td>
                  <td className="px-1 py-1.5">
                    <div className="flex items-center justify-center gap-0.5">
                      <button
                        onClick={() => void commitAdd()}
                        disabled={saving}
                        className="rounded p-1 text-complete hover:bg-green-50"
                        title="추가"
                      >
                        <Check className="h-3.5 w-3.5" />
                      </button>
                      <button
                        onClick={cancelAdd}
                        className="rounded p-1 text-gray-400 hover:bg-gray-100"
                        title="취소"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>

            {/* 합계 행 */}
            <tfoot>
              <tr className="border-t-2 border-gray-200 bg-gray-50">
                <td className="px-3 py-2 text-xs font-semibold text-gray-600">합계</td>
                <td className={cn('px-3 py-2 text-right tabular-nums font-bold text-sm', colorCls)}>
                  {formatKRW(total)}
                </td>
                {canWrite && <td />}
              </tr>
            </tfoot>
          </table>
        </div>

        {/* 안내 */}
        {canWrite && (
          <p className="mt-1.5 text-xs text-gray-400">더블클릭하여 수정 · 행 추가 버튼으로 항목 추가</p>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-600">
          {error}
        </div>
      )}
      <div className="flex gap-4 items-start flex-col md:flex-row">
        {renderTable('income', incomeItems, '수입 내역', 'text-complete')}
        <div className="hidden md:block w-px bg-gray-200 self-stretch" />
        {renderTable('expense', expenseItems, '지출 내역', 'text-planned')}
      </div>
    </div>
  );
}

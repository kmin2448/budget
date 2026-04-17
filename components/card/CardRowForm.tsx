'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { formatKRW, parseKRW } from '@/lib/utils';
import { CATEGORY_SHEETS } from '@/constants/sheets';

interface CardRowFormProps {
  onSubmit: (data: {
    expense_date: string;
    category: string;
    merchant: string;
    description: string;
    amount: number;
    erp_registered: boolean;
  }) => Promise<void>;
  onCancel: () => void;
  loading?: boolean;
}

export function CardRowForm({ onSubmit, onCancel, loading }: CardRowFormProps) {
  const [expenseDate, setExpenseDate] = useState('');
  const [category, setCategory] = useState('');
  const [merchant, setMerchant] = useState('');
  const [description, setDescription] = useState('');
  const [amountStr, setAmountStr] = useState('');
  const [erpRegistered, setErpRegistered] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    if (!expenseDate || !category || !amountStr) {
      setError('지출일자, 비목, 금액은 필수입니다.');
      return;
    }
    const amount = parseKRW(amountStr);
    if (amount <= 0) {
      setError('금액은 0보다 커야 합니다.');
      return;
    }
    try {
      await onSubmit({ expense_date: expenseDate, category, merchant, description, amount, erp_registered: erpRegistered });
    } catch (err) {
      setError(err instanceof Error ? err.message : '저장 실패');
    }
  }

  return (
    <form onSubmit={handleSubmit} className="rounded-lg border border-primary bg-primary-bg p-4 space-y-3">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {/* 지출일자 */}
        <div className="space-y-1">
          <label className="text-xs font-medium text-gray-600">지출일자 *</label>
          <Input
            type="date"
            value={expenseDate}
            onChange={(e) => setExpenseDate(e.target.value)}
            className="h-8 text-sm"
          />
        </div>

        {/* 비목 */}
        <div className="space-y-1">
          <label className="text-xs font-medium text-gray-600">비목 *</label>
          <Select value={category} onValueChange={(v) => setCategory(v ?? '')}>
            <SelectTrigger className="h-8 text-sm">
              <SelectValue placeholder="선택" />
            </SelectTrigger>
            <SelectContent>
              {CATEGORY_SHEETS.map((cat) => (
                <SelectItem key={cat} value={cat}>{cat}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* 거래처 */}
        <div className="space-y-1">
          <label className="text-xs font-medium text-gray-600">거래처</label>
          <Input
            placeholder="거래처명"
            value={merchant}
            onChange={(e) => setMerchant(e.target.value)}
            className="h-8 text-sm"
          />
        </div>

        {/* 건명 */}
        <div className="space-y-1 sm:col-span-2">
          <label className="text-xs font-medium text-gray-600">건명</label>
          <Input
            placeholder="지출 건명"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="h-8 text-sm"
          />
        </div>

        {/* 금액 */}
        <div className="space-y-1">
          <label className="text-xs font-medium text-gray-600">금액 *</label>
          <Input
            placeholder="0"
            value={amountStr}
            onChange={(e) => setAmountStr(formatKRW(parseKRW(e.target.value)))}
            className="h-8 text-right text-sm"
          />
        </div>
      </div>

      {/* ERP 등록 여부 */}
      <div className="flex items-center gap-2">
        <input
          type="checkbox"
          id="erp-registered"
          checked={erpRegistered}
          onChange={(e) => setErpRegistered(e.target.checked)}
          className="h-4 w-4 rounded border-gray-300"
        />
        <label htmlFor="erp-registered" className="text-sm text-gray-600">ERP 등록 완료</label>
      </div>

      {error && <p className="text-xs text-red-500">{error}</p>}

      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" size="sm" onClick={onCancel} disabled={loading}>
          취소
        </Button>
        <Button type="submit" size="sm" disabled={loading} className="bg-primary text-white hover:bg-primary-light">
          {loading ? '저장 중...' : '저장'}
        </Button>
      </div>
    </form>
  );
}

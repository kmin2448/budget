'use client';

import { useState, useMemo, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { formatKRW, parseKRW } from '@/lib/utils';
import { CATEGORY_SHEETS } from '@/constants/sheets';
import type { ProgramRow } from '@/hooks/useDashboard';
import { useQueryClient } from '@tanstack/react-query';

interface ProgramModalProps {
  open: boolean;
  mode: 'add' | 'edit';
  initialData?: ProgramRow;
  onClose: () => void;
  existingCategories?: string[];
  rows?: ProgramRow[];
}

interface FormData {
  category: string;
  programName: string;
  budget: string;
  subCategory: string;
  subDetail: string;
  professor: string;
  teacher: string;
  staff: string;
  note: string;
  budgetPlan: string;
}

const emptyForm: FormData = {
  category: '', programName: '', budget: '',
  subCategory: '', subDetail: '', professor: '',
  teacher: '', staff: '', note: '', budgetPlan: '',
};

const inputCls =
  'w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary disabled:bg-gray-50 disabled:text-gray-400';

const selectCls =
  'w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary disabled:bg-gray-50 disabled:text-gray-400';

function Field({ label, required, children }: {
  label: string; required?: boolean; children: React.ReactNode;
}) {
  return (
    <div>
      <label className="mb-1 block text-sm font-medium text-gray-700">
        {label}
        {required
          ? <span className="ml-1 text-red-500">*</span>
          : <span className="ml-1 text-xs font-normal text-gray-400">(선택)</span>}
      </label>
      {children}
    </div>
  );
}

export function ProgramModal({
  open, mode, initialData, onClose,
  existingCategories = [], rows = [],
}: ProgramModalProps) {
  const [form, setForm] = useState<FormData>(emptyForm);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const queryClient = useQueryClient();

  // 구분 → 가장 많이 쓰인 비목
  const categoryDefaultBudget = useMemo(() => {
    const counts: Record<string, Record<string, number>> = {};
    for (const row of rows) {
      if (row.category && row.budget) {
        counts[row.category] ??= {};
        counts[row.category][row.budget] = (counts[row.category][row.budget] ?? 0) + 1;
      }
    }
    const result: Record<string, string> = {};
    for (const [cat, budgets] of Object.entries(counts)) {
      result[cat] = Object.entries(budgets).sort((a, b) => b[1] - a[1])[0]?.[0] ?? '';
    }
    return result;
  }, [rows]);

  // 전체 세목 목록 (비목 무관)
  const allSubCategories = useMemo(() => {
    const set = new Set<string>();
    for (const row of rows) {
      if (row.subCategory) {
        set.add(row.subCategory);
      }
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'ko'));
  }, [rows]);

  // 세목 → 보조세목 목록
  const subCategoryToSubDetails = useMemo(() => {
    const map: Record<string, Set<string>> = {};
    for (const row of rows) {
      if (row.subCategory && row.subDetail) {
        map[row.subCategory] ??= new Set();
        map[row.subCategory].add(row.subDetail);
      }
    }
    return map;
  }, [rows]);

  const categoryOptions = useMemo(() =>
    Array.from(new Set(existingCategories)).filter(Boolean).sort((a, b) => a.localeCompare(b, 'ko')),
    [existingCategories],
  );



  const availableSubDetails = useMemo(() =>
    Array.from(subCategoryToSubDetails[form.subCategory] ?? []).sort((a, b) => a.localeCompare(b, 'ko')),
    [form.subCategory, subCategoryToSubDetails],
  );

  useEffect(() => {
    if (!open) return;
    if (initialData && mode === 'edit') {
      setForm({
        category: initialData.category,
        programName: initialData.programName,
        budget: initialData.budget,
        subCategory: initialData.subCategory,
        subDetail: initialData.subDetail,
        professor: initialData.professor,
        teacher: initialData.teacher,
        staff: initialData.staff,
        note: initialData.note,
        budgetPlan: initialData.budgetPlan ? formatKRW(initialData.budgetPlan) : '',
      });
    } else {
      setForm(emptyForm);
    }
    setError(null);
  }, [open, initialData, mode]);

  function set(field: keyof FormData, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  function handleCategoryChange(value: string) {
    const defaultBudget = categoryDefaultBudget[value] ?? '';
    setForm((prev) => ({
      ...prev,
      category: value,
      budget: defaultBudget || prev.budget,
      subCategory: '',
      subDetail: '',
    }));
  }

  function handleBudgetChange(value: string) {
    setForm((prev) => ({ ...prev, budget: value, subCategory: '', subDetail: '' }));
  }

  function handleSubCategoryChange(value: string) {
    setForm((prev) => ({ ...prev, subCategory: value, subDetail: '' }));
  }

  function handleBudgetInput(value: string) {
    const raw = value.replace(/[^0-9]/g, '');
    set('budgetPlan', raw ? formatKRW(Number(raw)) : '');
  }

  async function handleSubmit() {
    const missing: string[] = [];
    if (!form.category.trim()) missing.push('구분');
    if (!form.programName.trim()) missing.push('프로그램명');
    if (missing.length > 0) {
      setError(`필수 항목을 입력해주세요: ${missing.join(', ')}`);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const payload = {
        ...(mode === 'edit' && initialData ? { rowIndex: initialData.rowIndex } : {}),
        category: form.category.trim(),
        programName: form.programName.trim(),
        budget: form.budget,
        subCategory: form.subCategory.trim(),
        subDetail: form.subDetail.trim(),
        professor: form.professor.trim(),
        teacher: form.teacher.trim(),
        staff: form.staff.trim(),
        note: form.note.trim(),
        budgetPlan: form.budgetPlan ? parseKRW(form.budgetPlan) : 0,
      };

      const res = await fetch('/api/sheets/program', {
        method: mode === 'add' ? 'POST' : 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const body = await res.json() as { error?: string };
        throw new Error(body.error ?? '저장 실패');
      }
      await queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : '저장 중 오류가 발생했습니다.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-primary">
            {mode === 'add' ? '프로그램 추가' : '프로그램 수정'}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">

          {/* 구분 — datalist로 기존값 제안 + 직접 입력 모두 가능 */}
          <Field label="구분" required>
            <input
              list="category-options"
              value={form.category}
              onChange={(e) => handleCategoryChange(e.target.value)}
              onClick={() => handleCategoryChange('')}
              placeholder="구분 선택 또는 직접 입력"
              className={inputCls}
              autoComplete="off"
            />
            <datalist id="category-options">
              {categoryOptions.map((cat) => (
                <option key={cat} value={cat} />
              ))}
            </datalist>
          </Field>

          {/* 프로그램명 */}
          <Field label="프로그램명" required>
            <input
              type="text"
              value={form.programName}
              onChange={(e) => set('programName', e.target.value)}
              placeholder="프로그램명 입력"
              className={inputCls}
            />
          </Field>

          {/* 비목 — native select */}
          <Field label="비목">
            <select
              value={form.budget}
              onChange={(e) => handleBudgetChange(e.target.value)}
              className={selectCls}
            >
              <option value="">비목 선택</option>
              {CATEGORY_SHEETS.map((cat) => (
                <option key={cat} value={cat}>{cat}</option>
              ))}
            </select>
          </Field>

          {/* 세목 / 보조세목 — datalist (비목 연동) */}
          <div className="grid grid-cols-2 gap-3">
            <Field label="세목">
              <input
                list="subcategory-options"
                value={form.subCategory}
                onChange={(e) => handleSubCategoryChange(e.target.value)}
                onClick={() => handleSubCategoryChange('')}
                placeholder="세목 선택 또는 직접 입력"
                className={inputCls}
                autoComplete="off"
              />
              <datalist id="subcategory-options">
                {allSubCategories.map((sc) => (
                  <option key={sc} value={sc} />
                ))}
              </datalist>
            </Field>
            <Field label="보조세목">
              <input
                list="subdetail-options"
                value={form.subDetail}
                onChange={(e) => set('subDetail', e.target.value)}
                onClick={() => set('subDetail', '')}
                placeholder="보조세목 선택 또는 직접 입력"
                className={inputCls}
                autoComplete="off"
              />
              <datalist id="subdetail-options">
                {availableSubDetails.map((sd) => (
                  <option key={sd} value={sd} />
                ))}
              </datalist>
            </Field>
          </div>

          {/* 소관 / 담당교원 / 담당직원 */}
          <div className="grid grid-cols-3 gap-3">
            <Field label="소관">
              <input type="text" value={form.professor}
                onChange={(e) => set('professor', e.target.value)}
                placeholder="소관" className={inputCls} />
            </Field>
            <Field label="담당교원">
              <input type="text" value={form.teacher}
                onChange={(e) => set('teacher', e.target.value)}
                placeholder="담당교원" className={inputCls} />
            </Field>
            <Field label="담당직원">
              <input type="text" value={form.staff}
                onChange={(e) => set('staff', e.target.value)}
                placeholder="담당직원" className={inputCls} />
            </Field>
          </div>

          {/* 예산계획 */}
          <Field label="예산계획 (원)">
            <input
              type="text"
              value={form.budgetPlan}
              onChange={(e) => handleBudgetInput(e.target.value)}
              placeholder="0"
              inputMode="numeric"
              className={`${inputCls} text-right tabular-nums`}
            />
          </Field>

          {/* 비고 */}
          <Field label="비고">
            <textarea
              value={form.note}
              onChange={(e) => set('note', e.target.value)}
              placeholder="비고 입력"
              rows={3}
              className={`${inputCls} resize-none`}
            />
          </Field>

          {error && (
            <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={loading}>취소</Button>
          <Button
            onClick={handleSubmit}
            disabled={loading}
            className="bg-primary hover:bg-primary-light text-white"
          >
            {loading ? '저장 중...' : mode === 'add' ? '추가' : '수정'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

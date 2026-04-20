'use client';

import { createContext, useContext, useState, useEffect, type ReactNode } from 'react';
import type { BudgetType } from '@/types';

interface BudgetTypeContextValue {
  budgetType: BudgetType;
  setBudgetType: (type: BudgetType) => void;
}

const BudgetTypeContext = createContext<BudgetTypeContextValue | null>(null);

export function BudgetTypeProvider({ children }: { children: ReactNode }) {
  const [budgetType, setBudgetTypeState] = useState<BudgetType>('main');

  useEffect(() => {
    const stored = localStorage.getItem('budgetType') as BudgetType | null;
    if (stored === 'main' || stored === 'carryover') {
      setBudgetTypeState(stored);
    }
  }, []);

  function setBudgetType(type: BudgetType) {
    setBudgetTypeState(type);
    localStorage.setItem('budgetType', type);
  }

  return (
    <BudgetTypeContext.Provider value={{ budgetType, setBudgetType }}>
      {children}
    </BudgetTypeContext.Provider>
  );
}

export function useBudgetType() {
  const ctx = useContext(BudgetTypeContext);
  if (!ctx) throw new Error('useBudgetType must be used within BudgetTypeProvider');
  return ctx;
}

# Phase 3 비목별 집행내역 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 비목별 집행내역 페이지에 9개 비목 탭 전환, 집행내역 행 CRUD(세목 드롭다운 Named Range 연동), 지출일자 유무 기반 집행완료/집행예정 자동 분류, 지출부 PDF → Google Drive 업로드 + Supabase 메타데이터 관리를 구현한다.

**Architecture:** Next.js 14 Client Component + React Query v5. 각 비목 시트 구조 (A=구분, B=지출일자 직렬번호, C=지출건명 병합셀 C:H, I-T=월별금액 12개월)를 Google Sheets API로 직접 읽고 씀. PDF 업로드는 Google Drive + Supabase `expenditure_files` 테이블로 관리.

**Tech Stack:** Next.js 14 App Router, TypeScript strict, React Query v5, Supabase, Google Sheets API v4, Google Drive API v3, Tailwind CSS, shadcn/ui

---

## 각 비목 시트 컬럼 구조 (확정)

| 열 | 내용 | Named Range |
|----|------|-------------|
| A | 구분(프로그램명) | `*구분` (A8:A*) |
| B | 지출일자 (날짜 직렬번호, 빈값=집행예정) | `*지출` (B8:B*) |
| C~H | 지출건명 (병합셀, C열에 값 기록) | — |
| I~T | 월별 집행금액 (3월~2월, 12개) | `*집행` (I8:T*) |

데이터 시작 행: **8행**. 드롭다운 옵션: `CATEGORY_DROP_MAP[category]` Named Range.

---

## File Map

| 상태 | 파일 | 역할 |
|------|------|------|
| **신규** | `lib/permissions.ts` | checkPermission 공유 유틸 (program/route.ts에서 추출) |
| **신규** | `lib/expenditure-utils.ts` | 날짜 직렬번호 변환, 예산 계산 순수 함수 |
| 수정 | `lib/utils.ts` | (변경 없음, 이미 formatKRW/parseKRW 있음) |
| 수정 | `types/index.ts` | ExpenditureDetailRow, ExpenditureBudgetInfo, ExpenditurePageData 추가 |
| 수정 | `constants/sheets.ts` | CATEGORY_EXEC_MAP 추가 |
| **신규** | `app/api/sheets/expenditure/[category]/route.ts` | GET/POST/PUT/DELETE |
| **신규** | `app/api/drive/expenditure-upload/route.ts` | PDF 업로드 + Supabase 메타데이터 |
| **신규** | `hooks/useExpenditure.ts` | React Query 훅 5개 |
| **신규** | `components/expenditure/CategoryTabs.tsx` | 9개 비목 탭 네비게이션 |
| **신규** | `components/expenditure/ExpenditureSummary.tsx` | 예산 요약 카드 |
| **신규** | `components/expenditure/ExpenditureTable.tsx` | 집행내역 테이블 + 행 펼침(월별 상세) |
| **신규** | `components/expenditure/ExpenditureRowForm.tsx` | 추가/수정 모달 |
| 수정 | `app/(dashboard)/expenditure/[category]/page.tsx` | 전면 재작성 |
| 수정 | `app/api/sheets/program/route.ts` | checkPermission → lib/permissions.ts import로 교체 |
| **신규** | `__tests__/lib/expenditure-utils.test.ts` | 순수 함수 단위 테스트 |

---

## Task 1: 공유 권한 유틸 추출

**Files:**
- Create: `lib/permissions.ts`
- Modify: `app/api/sheets/program/route.ts` (inline checkPermission 삭제, import로 교체)

- [ ] **Step 1: `lib/permissions.ts` 작성**

```typescript
// lib/permissions.ts
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { PERMISSIONS } from '@/types';

export async function checkPermission(email: string, permission: string): Promise<boolean> {
  const supabase = createServerSupabaseClient();
  const { data: user } = await supabase
    .from('users')
    .select('id, role')
    .eq('email', email)
    .single();
  if (!user) return false;
  if (user.role === 'super_admin') return true;
  // staff는 expenditure:write 기본 허용
  if (user.role === 'staff' && permission === PERMISSIONS.EXPENDITURE_WRITE) return true;
  if (user.role === 'admin') {
    const { data: perm } = await supabase
      .from('user_permissions')
      .select('permission')
      .eq('user_id', user.id)
      .eq('permission', permission)
      .single();
    return !!perm;
  }
  return false;
}
```

- [ ] **Step 2: `app/api/sheets/program/route.ts` 상단 수정**

파일 상단에서 inline `checkPermission` 함수 전체를 삭제하고 아래 import로 교체:

```typescript
// 파일 최상단 imports에 추가
import { checkPermission } from '@/lib/permissions';
```

삭제할 범위: `async function checkPermission(email: string, permission: string)...` 함수 전체 (약 line 10~32).

- [ ] **Step 3: 빌드 확인**

```bash
cd coss-budget && npx tsc --noEmit 2>&1 | head -30
```

TypeScript 에러 없으면 다음으로.

---

## Task 2: 집행내역 유틸 함수 + 타입 추가

**Files:**
- Create: `lib/expenditure-utils.ts`
- Modify: `types/index.ts`
- Modify: `constants/sheets.ts`

- [ ] **Step 1: `lib/expenditure-utils.ts` 작성**

```typescript
// lib/expenditure-utils.ts

/**
 * Google Sheets 날짜 직렬번호 → YYYY-MM-DD 문자열
 * Sheets serial: 1900-01-01 = 1 (단, 1900-02-29 버그 포함)
 * Unix epoch offset: 25569 (1970-01-01 = 25569)
 */
export function serialToDateString(raw: unknown): string {
  if (typeof raw === 'number' && raw > 0) {
    const ms = Math.round((raw - 25569) * 86400 * 1000);
    const date = new Date(ms);
    if (!isNaN(date.getTime())) {
      return date.toISOString().split('T')[0]; // YYYY-MM-DD
    }
  }
  if (typeof raw === 'string') return raw.trim();
  return '';
}

/**
 * 월별 금액 배열(12개) → 집행상태 도출
 * expenseDate 가 비어 있으면 '집행예정', 있으면 '집행완료'
 */
export function deriveStatus(expenseDate: string): 'complete' | 'planned' {
  return expenseDate.trim() ? 'complete' : 'planned';
}

/**
 * 집행 행 목록 → 예산 집계 계산
 */
export function calcBudgetInfo(
  rows: { totalAmount: number; expenseDate: string }[],
  allocation: number,
) {
  const executionComplete = rows
    .filter((r) => r.expenseDate)
    .reduce((s, r) => s + r.totalAmount, 0);
  const executionPlanned = rows
    .filter((r) => !r.expenseDate)
    .reduce((s, r) => s + r.totalAmount, 0);
  const balance = allocation - executionComplete - executionPlanned;
  const executionRate =
    allocation > 0
      ? Math.round(((executionComplete + executionPlanned) / allocation) * 1000) / 10
      : 0;
  return { allocation, executionComplete, executionPlanned, balance, executionRate };
}
```

- [ ] **Step 2: `types/index.ts`에 타입 추가**

파일 끝에 추가:

```typescript
// 비목별 집행내역 행 (각 비목 시트의 row)
export interface ExpenditureDetailRow {
  rowIndex: number;
  programName: string;      // A열: 구분
  expenseDate: string;      // B열: 지출일자 YYYY-MM-DD (빈값 = 집행예정)
  description: string;      // C열: 지출건명 (병합셀 C:H)
  monthlyAmounts: number[]; // I~T열 (index 0=3월 … 11=2월), 길이 12
  totalAmount: number;      // monthlyAmounts 합계
  status: 'complete' | 'planned';
  hasFile: boolean;
  fileUrl?: string;
  fileId?: string;
}

export interface ExpenditureBudgetInfo {
  allocation: number;
  executionComplete: number;
  executionPlanned: number;
  balance: number;
  executionRate: number;
}

export interface ExpenditurePageData {
  rows: ExpenditureDetailRow[];
  budgetInfo: ExpenditureBudgetInfo;
  dropdownOptions: string[];
}
```

- [ ] **Step 3: `constants/sheets.ts`에 CATEGORY_EXEC_MAP 추가**

파일 끝 (CATEGORY_ALLOCATION_MAP 아래)에 추가:

```typescript
// 비목 → 집행 Named Range 매핑 (I8:T* 월별 금액)
export const CATEGORY_EXEC_MAP: Record<CategorySheet, string> = {
  '인건비': NAMED_RANGES.PERSONNEL_EXEC,
  '장학금': NAMED_RANGES.SCHOLARSHIP_EXEC,
  '교육연구프로그램개발운영비': NAMED_RANGES.EDU_PROGRAM_EXEC,
  '교육연구환경개선비': NAMED_RANGES.EDU_ENV_EXEC,
  '실험실습장비및기자재구입운영비': NAMED_RANGES.LAB_EQUIPMENT_EXEC,
  '기업지원협력활동비': NAMED_RANGES.CORPORATE_EXEC,
  '지역연계협업지원비': NAMED_RANGES.REGIONAL_EXEC,
  '성과활용확산지원비': NAMED_RANGES.PERFORMANCE_EXEC,
  '그밖의사업운영경비': NAMED_RANGES.OTHER_EXEC,
};

// 비목 시트 데이터 시작 행 (전 비목 공통)
export const CATEGORY_DATA_START_ROW = 8;
```

- [ ] **Step 4: TypeScript 확인**

```bash
cd coss-budget && npx tsc --noEmit 2>&1 | head -30
```

---

## Task 3: 유틸 단위 테스트 작성

**Files:**
- Create: `__tests__/lib/expenditure-utils.test.ts`

- [ ] **Step 1: 테스트 파일 작성**

```typescript
// __tests__/lib/expenditure-utils.test.ts
import { serialToDateString, deriveStatus, calcBudgetInfo } from '@/lib/expenditure-utils';

describe('serialToDateString', () => {
  it('Google Sheets 날짜 직렬번호(46100)를 YYYY-MM-DD로 변환한다', () => {
    // 46100 = 2026-03-10
    const result = serialToDateString(46100);
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(result).toBe('2026-03-10');
  });

  it('이미 문자열인 날짜는 그대로 반환한다', () => {
    expect(serialToDateString('2026-01-15')).toBe('2026-01-15');
  });

  it('빈 값(0, undefined, null)은 빈 문자열을 반환한다', () => {
    expect(serialToDateString(0)).toBe('');
    expect(serialToDateString(undefined)).toBe('');
    expect(serialToDateString(null)).toBe('');
  });
});

describe('deriveStatus', () => {
  it('지출일자가 있으면 complete를 반환한다', () => {
    expect(deriveStatus('2026-03-10')).toBe('complete');
  });

  it('지출일자가 빈 문자열이면 planned를 반환한다', () => {
    expect(deriveStatus('')).toBe('planned');
  });

  it('지출일자가 공백만 있어도 planned를 반환한다', () => {
    expect(deriveStatus('   ')).toBe('planned');
  });
});

describe('calcBudgetInfo', () => {
  const rows = [
    { totalAmount: 1000000, expenseDate: '2026-03-10' }, // 집행완료
    { totalAmount: 2000000, expenseDate: '2026-04-01' }, // 집행완료
    { totalAmount: 500000,  expenseDate: '' },           // 집행예정
  ];
  const allocation = 5000000;

  it('집행완료 합계를 계산한다', () => {
    const result = calcBudgetInfo(rows, allocation);
    expect(result.executionComplete).toBe(3000000);
  });

  it('집행예정 합계를 계산한다', () => {
    const result = calcBudgetInfo(rows, allocation);
    expect(result.executionPlanned).toBe(500000);
  });

  it('잔액을 계산한다 (배정예산 - 완료 - 예정)', () => {
    const result = calcBudgetInfo(rows, allocation);
    expect(result.balance).toBe(1500000);
  });

  it('집행률을 소수점 1자리로 계산한다', () => {
    const result = calcBudgetInfo(rows, allocation);
    // (3000000 + 500000) / 5000000 * 100 = 70.0
    expect(result.executionRate).toBe(70.0);
  });

  it('배정예산이 0이면 집행률은 0이다', () => {
    const result = calcBudgetInfo(rows, 0);
    expect(result.executionRate).toBe(0);
  });
});
```

- [ ] **Step 2: 테스트 실행 (RED 확인)**

```bash
cd coss-budget && npx jest __tests__/lib/expenditure-utils.test.ts --no-coverage 2>&1 | tail -20
```

유틸 파일이 아직 완성되어 있으므로 PASS가 나와야 정상.

---

## Task 4: Sheets 집행내역 API (GET)

**Files:**
- Create: `app/api/sheets/expenditure/[category]/route.ts`

- [ ] **Step 1: GET 핸들러 작성**

```typescript
// app/api/sheets/expenditure/[category]/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getSheetsClient, readNamedRange, getCategoryDropdown } from '@/lib/google/sheets';
import {
  CATEGORY_SHEETS,
  CATEGORY_DROP_MAP,
  CATEGORY_ALLOCATION_MAP,
  CATEGORY_DATA_START_ROW,
} from '@/constants/sheets';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { serialToDateString, calcBudgetInfo } from '@/lib/expenditure-utils';
import type { ExpenditureDetailRow, ExpenditurePageData } from '@/types';

const SPREADSHEET_ID = process.env.GOOGLE_SHEETS_ID!;

function isCategorySheet(val: string): val is typeof CATEGORY_SHEETS[number] {
  return (CATEGORY_SHEETS as readonly string[]).includes(val);
}

function buildRowValues(raw: (string | number | null)[]): {
  programName: string;
  expenseDate: string;
  description: string;
  monthlyAmounts: number[];
  totalAmount: number;
} {
  const programName = String(raw[0] ?? '').trim();
  const expenseDate = serialToDateString(raw[1]);
  const description = String(raw[2] ?? '').trim();
  const monthlyAmounts: number[] = Array.from({ length: 12 }, (_, i) =>
    Number(raw[8 + i] ?? 0),
  );
  const totalAmount = monthlyAmounts.reduce((s, v) => s + v, 0);
  return { programName, expenseDate, description, monthlyAmounts, totalAmount };
}

export async function GET(
  _req: NextRequest,
  { params }: { params: { category: string } },
) {
  try {
    const session = await auth();
    if (!session) {
      return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 });
    }

    const category = decodeURIComponent(params.category);
    if (!isCategorySheet(category)) {
      return NextResponse.json({ error: '유효하지 않은 비목입니다.' }, { status: 400 });
    }

    const sheets = getSheetsClient();
    const supabase = createServerSupabaseClient();

    const [rowsRes, allocationRes, dropOptions, fileRecordsRes] = await Promise.all([
      sheets.spreadsheets.values.get({
        spreadsheetId: SPREADSHEET_ID,
        range: `'${category}'!A${CATEGORY_DATA_START_ROW}:T500`,
        valueRenderOption: 'UNFORMATTED_VALUE',
      }),
      readNamedRange(CATEGORY_ALLOCATION_MAP[category]),
      getCategoryDropdown(CATEGORY_DROP_MAP[category]),
      supabase
        .from('expenditure_files')
        .select('row_index, drive_file_id, drive_url')
        .eq('sheet_name', category),
    ]);

    const allocation = Number(allocationRes[0]?.[0] ?? 0);
    const rawRows = (rowsRes.data.values ?? []) as (string | number | null)[][];

    const fileMap = new Map(
      (fileRecordsRes.data ?? []).map((f) => [
        f.row_index,
        { fileId: f.drive_file_id as string, fileUrl: f.drive_url as string },
      ]),
    );

    const rows: ExpenditureDetailRow[] = rawRows
      .map((raw, idx) => {
        const rowIndex = CATEGORY_DATA_START_ROW + idx;
        const { programName, expenseDate, description, monthlyAmounts, totalAmount } =
          buildRowValues(raw);
        const fileInfo = fileMap.get(rowIndex);
        return {
          rowIndex,
          programName,
          expenseDate,
          description,
          monthlyAmounts,
          totalAmount,
          status: (expenseDate ? 'complete' : 'planned') as 'complete' | 'planned',
          hasFile: !!fileInfo,
          fileUrl: fileInfo?.fileUrl,
          fileId: fileInfo?.fileId,
        };
      })
      .filter((r) => r.programName || r.description || r.totalAmount > 0);

    const budgetInfo = calcBudgetInfo(rows, allocation);
    const data: ExpenditurePageData = { rows, budgetInfo, dropdownOptions: dropOptions };
    return NextResponse.json(data);
  } catch (error) {
    console.error('Expenditure GET error:', error);
    return NextResponse.json({ error: '데이터 조회 중 오류가 발생했습니다.' }, { status: 500 });
  }
}
```

---

## Task 5: Sheets 집행내역 API (POST/PUT/DELETE)

**Files:**
- Modify: `app/api/sheets/expenditure/[category]/route.ts` (POST, PUT, DELETE 추가)

- [ ] **Step 1: POST (행 추가) 핸들러 추가**

아래 코드를 GET 함수 아래에 추가:

```typescript
// POST: 새 집행내역 행 추가
export async function POST(
  req: NextRequest,
  { params }: { params: { category: string } },
) {
  try {
    const session = await auth();
    if (!session?.user?.email) {
      return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 });
    }
    const { checkPermission } = await import('@/lib/permissions');
    const { PERMISSIONS } = await import('@/types');
    const hasPermission = await checkPermission(session.user.email, PERMISSIONS.EXPENDITURE_WRITE);
    if (!hasPermission) {
      return NextResponse.json({ error: '권한이 없습니다.' }, { status: 403 });
    }

    const category = decodeURIComponent(params.category);
    if (!isCategorySheet(category)) {
      return NextResponse.json({ error: '유효하지 않은 비목입니다.' }, { status: 400 });
    }

    const body = await req.json() as {
      programName: string;
      expenseDate: string;
      description: string;
      monthlyAmounts: number[];
    };

    const sheets = getSheetsClient();

    // A열에서 마지막 데이터 행 탐색
    const colARes = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: `'${category}'!A${CATEGORY_DATA_START_ROW}:A500`,
      valueRenderOption: 'UNFORMATTED_VALUE',
    });
    const colA = (colARes.data.values ?? []) as (string | number | null)[][];
    let lastDataIdx = -1;
    for (let i = 0; i < colA.length; i++) {
      if (String(colA[i]?.[0] ?? '').trim()) lastDataIdx = i;
    }
    const newRowIndex = CATEGORY_DATA_START_ROW + lastDataIdx + 1;

    const rowValues = buildWriteValues(body);
    await sheets.spreadsheets.values.update({
      spreadsheetId: SPREADSHEET_ID,
      range: `'${category}'!A${newRowIndex}:T${newRowIndex}`,
      valueInputOption: 'USER_ENTERED',
      requestBody: { values: [rowValues] },
    });

    return NextResponse.json({ rowIndex: newRowIndex, message: '집행내역이 추가되었습니다.' });
  } catch (error) {
    console.error('Expenditure POST error:', error);
    return NextResponse.json({ error: '추가 중 오류가 발생했습니다.' }, { status: 500 });
  }
}

// PUT: 집행내역 행 수정
export async function PUT(
  req: NextRequest,
  { params }: { params: { category: string } },
) {
  try {
    const session = await auth();
    if (!session?.user?.email) {
      return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 });
    }
    const { checkPermission } = await import('@/lib/permissions');
    const { PERMISSIONS } = await import('@/types');
    const hasPermission = await checkPermission(session.user.email, PERMISSIONS.EXPENDITURE_WRITE);
    if (!hasPermission) {
      return NextResponse.json({ error: '권한이 없습니다.' }, { status: 403 });
    }

    const category = decodeURIComponent(params.category);
    if (!isCategorySheet(category)) {
      return NextResponse.json({ error: '유효하지 않은 비목입니다.' }, { status: 400 });
    }

    const body = await req.json() as {
      rowIndex: number;
      programName: string;
      expenseDate: string;
      description: string;
      monthlyAmounts: number[];
    };

    const sheets = getSheetsClient();
    const rowValues = buildWriteValues(body);
    await sheets.spreadsheets.values.update({
      spreadsheetId: SPREADSHEET_ID,
      range: `'${category}'!A${body.rowIndex}:T${body.rowIndex}`,
      valueInputOption: 'USER_ENTERED',
      requestBody: { values: [rowValues] },
    });

    return NextResponse.json({ message: '수정되었습니다.' });
  } catch (error) {
    console.error('Expenditure PUT error:', error);
    return NextResponse.json({ error: '수정 중 오류가 발생했습니다.' }, { status: 500 });
  }
}

// DELETE: 집행내역 행 초기화
export async function DELETE(
  req: NextRequest,
  { params }: { params: { category: string } },
) {
  try {
    const session = await auth();
    if (!session?.user?.email) {
      return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 });
    }
    const { checkPermission } = await import('@/lib/permissions');
    const { PERMISSIONS } = await import('@/types');
    const hasPermission = await checkPermission(session.user.email, PERMISSIONS.EXPENDITURE_WRITE);
    if (!hasPermission) {
      return NextResponse.json({ error: '권한이 없습니다.' }, { status: 403 });
    }

    const category = decodeURIComponent(params.category);
    if (!isCategorySheet(category)) {
      return NextResponse.json({ error: '유효하지 않은 비목입니다.' }, { status: 400 });
    }

    const { rowIndex } = await req.json() as { rowIndex: number };
    const sheets = getSheetsClient();
    await sheets.spreadsheets.values.clear({
      spreadsheetId: SPREADSHEET_ID,
      range: `'${category}'!A${rowIndex}:T${rowIndex}`,
    });

    return NextResponse.json({ message: '삭제되었습니다.' });
  } catch (error) {
    console.error('Expenditure DELETE error:', error);
    return NextResponse.json({ error: '삭제 중 오류가 발생했습니다.' }, { status: 500 });
  }
}

// 공통: Sheets 쓰기용 20-element 배열 생성
function buildWriteValues(body: {
  programName: string;
  expenseDate: string;
  description: string;
  monthlyAmounts: number[];
}): (string | number)[] {
  return [
    body.programName,                                    // A: 구분
    body.expenseDate || '',                             // B: 지출일자
    body.description,                                   // C: 지출건명 (병합셀 C:H)
    '', '', '', '', '',                                 // D~H: 병합셀 빈칸
    ...Array.from({ length: 12 }, (_, i) => body.monthlyAmounts[i] ?? 0), // I~T: 월별금액
  ];
}
```

**주의:** `buildWriteValues` 함수는 GET 핸들러보다 위에 (파일 최상단) 두거나, GET 함수 이전에 선언해야 합니다. POST/PUT/DELETE에서 사용하므로 파일 상단에 위치시키세요.

- [ ] **Step 2: TypeScript 확인**

```bash
cd coss-budget && npx tsc --noEmit 2>&1 | head -30
```

---

## Task 6: Drive PDF 업로드 API

**Files:**
- Create: `app/api/drive/expenditure-upload/route.ts`

- [ ] **Step 1: 업로드 API 작성**

```typescript
// app/api/drive/expenditure-upload/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { uploadExpenditurePdf } from '@/lib/google/drive';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { checkPermission } from '@/lib/permissions';
import { PERMISSIONS, CATEGORY_SHEETS } from '@/types';

// CATEGORY_SHEETS는 types가 아닌 constants에서 import
import { CATEGORY_SHEETS as SHEETS } from '@/constants/sheets';

export async function POST(req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.email) {
      return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 });
    }

    const hasPermission = await checkPermission(
      session.user.email,
      PERMISSIONS.EXPENDITURE_WRITE,
    );
    if (!hasPermission) {
      return NextResponse.json({ error: '권한이 없습니다.' }, { status: 403 });
    }

    const formData = await req.formData();
    const file = formData.get('file') as File | null;
    const category = formData.get('category') as string | null;
    const rowIndexStr = formData.get('rowIndex') as string | null;

    if (!file || !category || !rowIndexStr) {
      return NextResponse.json({ error: '필수 파라미터 누락 (file, category, rowIndex)' }, { status: 400 });
    }
    if (!(SHEETS as readonly string[]).includes(category)) {
      return NextResponse.json({ error: '유효하지 않은 비목입니다.' }, { status: 400 });
    }
    if (file.type !== 'application/pdf') {
      return NextResponse.json({ error: 'PDF 파일만 업로드 가능합니다.' }, { status: 400 });
    }

    const rowIndex = Number(rowIndexStr);
    if (isNaN(rowIndex) || rowIndex < 8) {
      return NextResponse.json({ error: '유효하지 않은 행 번호입니다.' }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const safeName = file.name.replace(/[^a-zA-Z0-9가-힣._-]/g, '_');
    const fileName = `${category}_row${rowIndex}_${safeName}`;

    const { fileId, webViewLink } = await uploadExpenditurePdf({
      categoryName: category,
      fileName,
      buffer,
    });

    const supabase = createServerSupabaseClient();
    const { data: userRecord } = await supabase
      .from('users')
      .select('id')
      .eq('email', session.user.email)
      .single();

    // 동일 행에 기존 파일이 있으면 교체
    await supabase
      .from('expenditure_files')
      .delete()
      .eq('sheet_name', category)
      .eq('row_index', rowIndex);

    await supabase.from('expenditure_files').insert({
      sheet_name: category,
      row_index: rowIndex,
      drive_file_id: fileId,
      drive_url: webViewLink,
      uploaded_by: userRecord?.id ?? null,
    });

    return NextResponse.json({ fileId, driveUrl: webViewLink });
  } catch (error) {
    console.error('Drive upload error:', error);
    return NextResponse.json({ error: '업로드 중 오류가 발생했습니다.' }, { status: 500 });
  }
}
```

- [ ] **Step 2: TypeScript 확인**

```bash
cd coss-budget && npx tsc --noEmit 2>&1 | head -30
```

---

## Task 7: React Query 훅

**Files:**
- Create: `hooks/useExpenditure.ts`

- [ ] **Step 1: 훅 파일 작성**

```typescript
// hooks/useExpenditure.ts
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { ExpenditurePageData } from '@/types';

// ── 조회 ──────────────────────────────────────────────────────────

async function fetchExpenditure(category: string): Promise<ExpenditurePageData> {
  const res = await fetch(`/api/sheets/expenditure/${encodeURIComponent(category)}`);
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error((body as { error?: string }).error ?? '데이터 로드 실패');
  }
  return res.json() as Promise<ExpenditurePageData>;
}

export function useExpenditure(category: string) {
  return useQuery({
    queryKey: ['expenditure', category],
    queryFn: () => fetchExpenditure(category),
    staleTime: 3 * 60 * 1000,
    enabled: !!category,
  });
}

// ── 추가 ──────────────────────────────────────────────────────────

export interface RowPayload {
  programName: string;
  expenseDate: string;
  description: string;
  monthlyAmounts: number[];
}

export function useAddExpenditureRow(category: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (payload: RowPayload) => {
      const res = await fetch(`/api/sheets/expenditure/${encodeURIComponent(category)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const body = await res.json() as { error?: string };
        throw new Error(body.error ?? '추가 실패');
      }
      return res.json();
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['expenditure', category] }),
  });
}

// ── 수정 ──────────────────────────────────────────────────────────

export function useUpdateExpenditureRow(category: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (payload: RowPayload & { rowIndex: number }) => {
      const res = await fetch(`/api/sheets/expenditure/${encodeURIComponent(category)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const body = await res.json() as { error?: string };
        throw new Error(body.error ?? '수정 실패');
      }
      return res.json();
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['expenditure', category] }),
  });
}

// ── 삭제 ──────────────────────────────────────────────────────────

export function useDeleteExpenditureRow(category: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (rowIndex: number) => {
      const res = await fetch(`/api/sheets/expenditure/${encodeURIComponent(category)}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rowIndex }),
      });
      if (!res.ok) {
        const body = await res.json() as { error?: string };
        throw new Error(body.error ?? '삭제 실패');
      }
      return res.json();
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['expenditure', category] }),
  });
}

// ── PDF 업로드 ────────────────────────────────────────────────────

export function useUploadPdf(category: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ file, rowIndex }: { file: File; rowIndex: number }) => {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('category', category);
      formData.append('rowIndex', String(rowIndex));
      const res = await fetch('/api/drive/expenditure-upload', {
        method: 'POST',
        body: formData,
      });
      if (!res.ok) {
        const body = await res.json() as { error?: string };
        throw new Error(body.error ?? '업로드 실패');
      }
      return res.json() as Promise<{ fileId: string; driveUrl: string }>;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['expenditure', category] }),
  });
}
```

---

## Task 8: CategoryTabs 컴포넌트

**Files:**
- Create: `components/expenditure/CategoryTabs.tsx`

- [ ] **Step 1: 탭 컴포넌트 작성**

```typescript
// components/expenditure/CategoryTabs.tsx
'use client';

import Link from 'next/link';
import { cn } from '@/lib/utils';
import { CATEGORY_SHEETS } from '@/constants/sheets';

interface CategoryTabsProps {
  activeCategory: string;
}

export function CategoryTabs({ activeCategory }: CategoryTabsProps) {
  return (
    <div className="overflow-x-auto border-b border-gray-200 bg-white">
      <nav className="flex min-w-max">
        {CATEGORY_SHEETS.map((cat) => {
          const isActive = cat === activeCategory;
          return (
            <Link
              key={cat}
              href={`/expenditure/${encodeURIComponent(cat)}`}
              className={cn(
                'whitespace-nowrap border-b-2 px-4 py-2.5 text-sm font-medium transition-colors',
                isActive
                  ? 'border-primary text-primary'
                  : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700',
              )}
            >
              {cat}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
```

---

## Task 9: ExpenditureSummary 컴포넌트

**Files:**
- Create: `components/expenditure/ExpenditureSummary.tsx`

- [ ] **Step 1: 예산 요약 카드 작성**

```typescript
// components/expenditure/ExpenditureSummary.tsx
import { Card, CardContent } from '@/components/ui/card';
import { formatKRW } from '@/lib/utils';
import { cn } from '@/lib/utils';
import type { ExpenditureBudgetInfo } from '@/types';

interface ExpenditureSummaryProps {
  budgetInfo: ExpenditureBudgetInfo;
}

export function ExpenditureSummary({ budgetInfo }: ExpenditureSummaryProps) {
  const { allocation, executionComplete, executionPlanned, balance, executionRate } = budgetInfo;

  const cards = [
    { label: '배정예산',  value: allocation,        cls: 'text-gray-800' },
    { label: '집행완료',  value: executionComplete, cls: 'text-complete' },
    { label: '집행예정',  value: executionPlanned,  cls: 'text-planned' },
    { label: '잔액',      value: balance,           cls: cn(balance < 0 ? 'text-red-500' : 'text-gray-700') },
  ];

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
      {cards.map(({ label, value, cls }) => (
        <Card key={label} className="border-gray-200">
          <CardContent className="p-4">
            <p className="text-xs text-gray-500">{label}</p>
            <p className={cn('mt-1 text-lg font-bold tabular-nums', cls)}>
              {formatKRW(value)}
            </p>
          </CardContent>
        </Card>
      ))}
      <Card className="border-gray-200">
        <CardContent className="p-4">
          <p className="text-xs text-gray-500">집행률</p>
          <p className={cn(
            'mt-1 text-lg font-bold tabular-nums',
            executionRate > 100 ? 'text-red-500' : 'text-primary',
          )}>
            {executionRate.toFixed(1)}%
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
```

---

## Task 10: ExpenditureTable 컴포넌트

**Files:**
- Create: `components/expenditure/ExpenditureTable.tsx`

- [ ] **Step 1: 집행내역 테이블 작성**

```typescript
// components/expenditure/ExpenditureTable.tsx
'use client';

import { useState } from 'react';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { formatKRW, cn } from '@/lib/utils';
import { Pencil, Trash2, Upload, ExternalLink, Plus, ChevronDown, ChevronRight } from 'lucide-react';
import { MONTH_COLUMNS } from '@/constants/sheets';
import type { ExpenditureDetailRow } from '@/types';

interface ExpenditureTableProps {
  rows: ExpenditureDetailRow[];
  canWrite: boolean;
  onAdd: () => void;
  onEdit: (row: ExpenditureDetailRow) => void;
  onDelete: (row: ExpenditureDetailRow) => void;
  onUpload: (row: ExpenditureDetailRow) => void;
}

export function ExpenditureTable({
  rows, canWrite, onAdd, onEdit, onDelete, onUpload,
}: ExpenditureTableProps) {
  const [expandedRow, setExpandedRow] = useState<number | null>(null);
  const colCount = canWrite ? 6 : 5;

  return (
    <div className="overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm">
      {/* 헤더 */}
      <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3">
        <span className="text-sm font-medium text-gray-700">
          집행내역{' '}
          <span className="font-normal text-gray-400">({rows.length}건)</span>
        </span>
        {canWrite && (
          <Button
            size="sm"
            onClick={onAdd}
            className="gap-1.5 bg-primary text-white hover:bg-primary-light"
          >
            <Plus className="h-3.5 w-3.5" />
            행 추가
          </Button>
        )}
      </div>

      <Table>
        <TableHeader>
          <TableRow className="bg-gray-50 hover:bg-gray-50">
            <TableHead className="w-6" />
            <TableHead className="w-44">구분(프로그램명)</TableHead>
            <TableHead className="w-28 text-center">지출일자 / 상태</TableHead>
            <TableHead>지출건명</TableHead>
            <TableHead className="w-28 text-right">집행금액</TableHead>
            <TableHead className="w-20 text-center">지출부</TableHead>
            {canWrite && <TableHead className="w-20 text-center">관리</TableHead>}
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.length === 0 ? (
            <TableRow>
              <TableCell
                colSpan={colCount}
                className="h-32 text-center text-sm text-gray-400"
              >
                집행내역이 없습니다.
              </TableCell>
            </TableRow>
          ) : (
            rows.flatMap((row) => {
              const isExpanded = expandedRow === row.rowIndex;
              return [
                // 메인 행
                <TableRow
                  key={`row-${row.rowIndex}`}
                  className={cn(
                    'cursor-pointer transition-colors hover:bg-gray-50',
                    isExpanded && 'bg-gray-50',
                  )}
                  onClick={() =>
                    setExpandedRow(isExpanded ? null : row.rowIndex)
                  }
                >
                  <TableCell className="py-2 pl-3 text-gray-400">
                    {isExpanded
                      ? <ChevronDown className="h-3.5 w-3.5" />
                      : <ChevronRight className="h-3.5 w-3.5" />}
                  </TableCell>
                  <TableCell className="max-w-0 overflow-hidden py-2 text-sm text-gray-700">
                    <span
                      className="block truncate"
                      title={row.programName}
                    >
                      {row.programName || '-'}
                    </span>
                  </TableCell>
                  <TableCell className="py-2 text-center">
                    <div className="flex flex-col items-center gap-0.5">
                      {row.expenseDate && (
                        <span className="text-xs text-gray-400">{row.expenseDate}</span>
                      )}
                      <Badge
                        className={cn(
                          'text-xs font-normal',
                          row.status === 'complete'
                            ? 'bg-green-100 text-complete hover:bg-green-100'
                            : 'bg-amber-100 text-planned hover:bg-amber-100',
                        )}
                      >
                        {row.status === 'complete' ? '집행완료' : '집행예정'}
                      </Badge>
                    </div>
                  </TableCell>
                  <TableCell className="max-w-0 overflow-hidden py-2 text-sm text-gray-600">
                    <span className="block truncate" title={row.description}>
                      {row.description || '-'}
                    </span>
                  </TableCell>
                  <TableCell className="py-2 text-right text-sm font-medium tabular-nums text-gray-800">
                    {formatKRW(row.totalAmount)}
                  </TableCell>
                  <TableCell
                    className="py-2 text-center"
                    onClick={(e) => e.stopPropagation()}
                  >
                    {row.hasFile ? (
                      <a
                        href={row.fileUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-0.5 text-xs text-primary hover:underline"
                      >
                        <ExternalLink className="h-3 w-3" />
                        열기
                      </a>
                    ) : canWrite ? (
                      <button
                        onClick={() => onUpload(row)}
                        className="inline-flex items-center gap-0.5 rounded px-1.5 py-1 text-xs text-gray-400 hover:bg-gray-100 hover:text-gray-600"
                      >
                        <Upload className="h-3 w-3" />
                        업로드
                      </button>
                    ) : (
                      <span className="text-xs text-gray-300">-</span>
                    )}
                  </TableCell>
                  {canWrite && (
                    <TableCell
                      className="py-2 text-center"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <div className="flex justify-center gap-1">
                        <button
                          onClick={() => onEdit(row)}
                          className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-primary"
                          title="수정"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                        <button
                          onClick={() => onDelete(row)}
                          className="rounded p-1 text-gray-400 hover:bg-red-50 hover:text-red-500"
                          title="삭제"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </TableCell>
                  )}
                </TableRow>,

                // 펼침 행 (월별 금액)
                ...(isExpanded
                  ? [
                      <TableRow
                        key={`detail-${row.rowIndex}`}
                        className="bg-row-even"
                        onClick={() => setExpandedRow(null)}
                      >
                        <TableCell colSpan={colCount} className="px-6 py-3">
                          <div className="grid grid-cols-6 gap-2 text-xs">
                            {MONTH_COLUMNS.map((month, i) => (
                              <div key={month} className="text-center">
                                <div className="mb-0.5 text-gray-400">{month}</div>
                                <div
                                  className={cn(
                                    'tabular-nums font-medium',
                                    row.monthlyAmounts[i] > 0
                                      ? 'text-gray-800'
                                      : 'text-gray-300',
                                  )}
                                >
                                  {formatKRW(row.monthlyAmounts[i])}
                                </div>
                              </div>
                            ))}
                          </div>
                        </TableCell>
                      </TableRow>,
                    ]
                  : []),
              ];
            })
          )}
        </TableBody>
      </Table>
    </div>
  );
}
```

---

## Task 11: ExpenditureRowForm 모달

**Files:**
- Create: `components/expenditure/ExpenditureRowForm.tsx`

- [ ] **Step 1: 추가/수정 모달 작성**

```typescript
// components/expenditure/ExpenditureRowForm.tsx
'use client';

import { useState, useEffect } from 'react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { formatKRW, parseKRW } from '@/lib/utils';
import { MONTH_COLUMNS } from '@/constants/sheets';
import type { ExpenditureDetailRow } from '@/types';
import type { RowPayload } from '@/hooks/useExpenditure';

interface ExpenditureRowFormProps {
  open: boolean;
  mode: 'add' | 'edit';
  initialData?: ExpenditureDetailRow;
  dropdownOptions: string[];
  onClose: () => void;
  onSubmit: (data: RowPayload) => Promise<void>;
}

interface FormState {
  programName: string;
  expenseDate: string;
  description: string;
  monthlyAmounts: string[]; // 천단위 포맷 문자열
}

const emptyForm: FormState = {
  programName: '',
  expenseDate: '',
  description: '',
  monthlyAmounts: Array<string>(12).fill(''),
};

const inputCls =
  'w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary disabled:bg-gray-50';

export function ExpenditureRowForm({
  open, mode, initialData, dropdownOptions, onClose, onSubmit,
}: ExpenditureRowFormProps) {
  const [form, setForm] = useState<FormState>(emptyForm);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    if (initialData && mode === 'edit') {
      setForm({
        programName: initialData.programName,
        expenseDate: initialData.expenseDate,
        description: initialData.description,
        monthlyAmounts: initialData.monthlyAmounts.map((v) =>
          v > 0 ? formatKRW(v) : '',
        ),
      });
    } else {
      setForm(emptyForm);
    }
    setError(null);
  }, [open, initialData, mode]);

  function setMonthAmount(idx: number, raw: string) {
    const digits = raw.replace(/[^0-9]/g, '');
    const formatted = digits ? formatKRW(Number(digits)) : '';
    setForm((prev) => {
      const next = [...prev.monthlyAmounts];
      next[idx] = formatted;
      return { ...prev, monthlyAmounts: next };
    });
  }

  async function handleSubmit() {
    if (!form.programName.trim()) {
      setError('구분(프로그램명)을 선택해주세요.');
      return;
    }
    if (!form.description.trim()) {
      setError('지출건명을 입력해주세요.');
      return;
    }
    const monthlyAmounts = form.monthlyAmounts.map((v) => parseKRW(v));
    if (monthlyAmounts.every((v) => v === 0)) {
      setError('월별 집행금액을 최소 하나 이상 입력해주세요.');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      await onSubmit({
        programName: form.programName.trim(),
        expenseDate: form.expenseDate,
        description: form.description.trim(),
        monthlyAmounts,
      });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : '저장 중 오류가 발생했습니다.');
    } finally {
      setLoading(false);
    }
  }

  const totalAmount = form.monthlyAmounts.reduce((s, v) => s + parseKRW(v), 0);

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="text-primary">
            {mode === 'add' ? '집행내역 추가' : '집행내역 수정'}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* 구분 */}
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">
              구분(프로그램명) <span className="text-red-500">*</span>
            </label>
            <select
              value={form.programName}
              onChange={(e) => setForm((p) => ({ ...p, programName: e.target.value }))}
              className={inputCls}
            >
              <option value="">프로그램 선택</option>
              {dropdownOptions.map((opt) => (
                <option key={opt} value={opt}>{opt}</option>
              ))}
            </select>
          </div>

          {/* 지출일자 */}
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">
              지출일자
              <span className="ml-1 text-xs font-normal text-gray-400">
                (입력 시 집행완료 / 미입력 시 집행예정)
              </span>
            </label>
            <input
              type="date"
              value={form.expenseDate}
              onChange={(e) => setForm((p) => ({ ...p, expenseDate: e.target.value }))}
              className={inputCls}
            />
          </div>

          {/* 지출건명 */}
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">
              지출건명 <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={form.description}
              onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))}
              placeholder="지출건명 입력"
              className={inputCls}
            />
          </div>

          {/* 월별 집행금액 */}
          <div>
            <div className="mb-2 flex items-center justify-between">
              <label className="text-sm font-medium text-gray-700">
                월별 집행금액 (원)
                <span className="ml-1 text-xs font-normal text-gray-400">*</span>
              </label>
              <span className="text-xs text-gray-500">
                합계:{' '}
                <strong className="tabular-nums text-gray-800">
                  {formatKRW(totalAmount)}
                </strong>
                원
              </span>
            </div>
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
              {MONTH_COLUMNS.map((month, idx) => (
                <div key={month}>
                  <label className="mb-0.5 block text-xs text-gray-500">{month}</label>
                  <input
                    type="text"
                    inputMode="numeric"
                    value={form.monthlyAmounts[idx]}
                    onChange={(e) => setMonthAmount(idx, e.target.value)}
                    placeholder="0"
                    className={`${inputCls} text-right tabular-nums`}
                  />
                </div>
              ))}
            </div>
          </div>

          {error && (
            <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={loading}>
            취소
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={loading}
            className="bg-primary text-white hover:bg-primary-light"
          >
            {loading ? '저장 중...' : mode === 'add' ? '추가' : '수정'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

---

## Task 12: 메인 페이지 재작성

**Files:**
- Modify (rewrite): `app/(dashboard)/expenditure/[category]/page.tsx`

- [ ] **Step 1: 메인 페이지 전면 재작성**

```typescript
// app/(dashboard)/expenditure/[category]/page.tsx
'use client';

import { useState, useRef } from 'react';
import { useSession } from 'next-auth/react';
import { Button } from '@/components/ui/button';
import { RefreshCw } from 'lucide-react';
import { CategoryTabs } from '@/components/expenditure/CategoryTabs';
import { ExpenditureSummary } from '@/components/expenditure/ExpenditureSummary';
import { ExpenditureTable } from '@/components/expenditure/ExpenditureTable';
import { ExpenditureRowForm } from '@/components/expenditure/ExpenditureRowForm';
import { ConfirmDialog } from '@/components/shared/ConfirmDialog';
import {
  useExpenditure,
  useAddExpenditureRow,
  useUpdateExpenditureRow,
  useDeleteExpenditureRow,
  useUploadPdf,
  type RowPayload,
} from '@/hooks/useExpenditure';
import type { ExpenditureDetailRow } from '@/types';

export default function ExpenditurePage({
  params,
}: {
  params: { category: string };
}) {
  const category = decodeURIComponent(params.category);
  const { data: session } = useSession();
  const { data, isLoading, isError, error, refetch } = useExpenditure(category);

  const addMutation    = useAddExpenditureRow(category);
  const updateMutation = useUpdateExpenditureRow(category);
  const deleteMutation = useDeleteExpenditureRow(category);
  const uploadMutation = useUploadPdf(category);

  // 폼 상태
  const [formOpen, setFormOpen]   = useState(false);
  const [formMode, setFormMode]   = useState<'add' | 'edit'>('add');
  const [editTarget, setEditTarget] = useState<ExpenditureDetailRow | undefined>();

  // 삭제 확인 상태
  const [deleteOpen, setDeleteOpen]     = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<ExpenditureDetailRow | undefined>();

  // 파일 업로드 상태
  const fileInputRef                      = useRef<HTMLInputElement>(null);
  const [uploadTarget, setUploadTarget]   = useState<ExpenditureDetailRow | undefined>();
  const [uploadError, setUploadError]     = useState<string | null>(null);

  // 권한
  const userRole = (session?.user as { role?: string } | undefined)?.role;
  const canWrite = userRole === 'super_admin' || userRole === 'admin' || userRole === 'staff';

  // ── 핸들러 ──────────────────────────────────────────────────────

  function handleAdd() {
    setFormMode('add');
    setEditTarget(undefined);
    setFormOpen(true);
  }

  function handleEdit(row: ExpenditureDetailRow) {
    setFormMode('edit');
    setEditTarget(row);
    setFormOpen(true);
  }

  function handleDeleteClick(row: ExpenditureDetailRow) {
    setDeleteTarget(row);
    setDeleteOpen(true);
  }

  function handleUploadClick(row: ExpenditureDetailRow) {
    setUploadError(null);
    setUploadTarget(row);
    fileInputRef.current?.click();
  }

  async function handleFileSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !uploadTarget) return;
    try {
      await uploadMutation.mutateAsync({ file, rowIndex: uploadTarget.rowIndex });
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : '업로드 실패');
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = '';
      setUploadTarget(undefined);
    }
  }

  async function handleFormSubmit(payload: RowPayload) {
    if (formMode === 'add') {
      await addMutation.mutateAsync(payload);
    } else if (editTarget) {
      await updateMutation.mutateAsync({ ...payload, rowIndex: editTarget.rowIndex });
    }
  }

  async function handleDeleteConfirm() {
    if (!deleteTarget) return;
    try {
      await deleteMutation.mutateAsync(deleteTarget.rowIndex);
      setDeleteOpen(false);
    } catch (err) {
      alert(err instanceof Error ? err.message : '삭제 중 오류가 발생했습니다.');
    }
  }

  // ── 렌더 ────────────────────────────────────────────────────────

  return (
    <div className="space-y-5">
      {/* 페이지 헤더 */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">비목별 집행내역</h1>
          <p className="mt-1 text-sm text-gray-500">
            비목을 선택하여 집행내역을 조회하고 입력합니다.
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => refetch()}
          disabled={isLoading}
          className="gap-1.5 text-gray-600"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${isLoading ? 'animate-spin' : ''}`} />
          새로고침
        </Button>
      </div>

      {/* 비목 탭 */}
      <CategoryTabs activeCategory={category} />

      {/* 에러 */}
      {isError && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error instanceof Error ? error.message : '데이터를 불러오지 못했습니다.'}
        </div>
      )}

      {uploadError && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          업로드 오류: {uploadError}
        </div>
      )}

      {/* 예산 요약 */}
      {isLoading ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-20 animate-pulse rounded-lg bg-gray-100" />
          ))}
        </div>
      ) : (
        data && <ExpenditureSummary budgetInfo={data.budgetInfo} />
      )}

      {/* 집행내역 테이블 */}
      {isLoading ? (
        <div className="h-64 animate-pulse rounded-lg bg-gray-100" />
      ) : (
        <ExpenditureTable
          rows={data?.rows ?? []}
          canWrite={canWrite}
          onAdd={handleAdd}
          onEdit={handleEdit}
          onDelete={handleDeleteClick}
          onUpload={handleUploadClick}
        />
      )}

      {/* 숨겨진 파일 input */}
      <input
        ref={fileInputRef}
        type="file"
        accept="application/pdf"
        className="hidden"
        onChange={handleFileSelected}
      />

      {/* 추가/수정 모달 */}
      <ExpenditureRowForm
        open={formOpen}
        mode={formMode}
        initialData={editTarget}
        dropdownOptions={data?.dropdownOptions ?? []}
        onClose={() => setFormOpen(false)}
        onSubmit={handleFormSubmit}
      />

      {/* 삭제 확인 */}
      <ConfirmDialog
        open={deleteOpen}
        title="집행내역 삭제"
        description={`"${deleteTarget?.description || '해당 집행내역'}"을 삭제하시겠습니까? Sheets의 해당 행이 초기화됩니다.`}
        loading={deleteMutation.isPending}
        onConfirm={handleDeleteConfirm}
        onClose={() => setDeleteOpen(false)}
      />
    </div>
  );
}
```

---

## Task 13: 빌드 검증 및 테스트 실행

- [ ] **Step 1: 전체 테스트 실행**

```bash
cd coss-budget && npx jest --passWithNoTests --no-coverage 2>&1 | tail -30
```

Expected: 모든 테스트 PASS

- [ ] **Step 2: TypeScript 전체 검증**

```bash
cd coss-budget && npx tsc --noEmit 2>&1 | head -40
```

Expected: 에러 없음

- [ ] **Step 3: Next.js 빌드**

```bash
cd coss-budget && npx next build 2>&1 | tail -30
```

Expected: 빌드 성공

- [ ] **Step 4: Commit**

```bash
cd coss-budget && git add -A && git commit -m "feat: Phase 3 비목별 집행내역 구현 (탭, CRUD, PDF 업로드)"
```

---

## 주의사항

1. **인건비 시트 구조 차이**: 인건비 시트는 월별 금액 컬럼이 B-M일 수 있음 (I-T 아님). 실제 시트 확인 후 필요 시 `app/api/sheets/expenditure/[category]/route.ts` GET 핸들러에 비목별 분기 추가.

2. **Supabase expenditure_files 테이블**: CLAUDE.md 스키마에 (sheet_name, row_index) 유니크 제약이 없음. 업로드 API에서 delete → insert 방식으로 처리.

3. **Named Range 존재 여부**: `인건비집행`, `인건비구분`, `인건비지출`이 실제 스프레드시트에 없다면 GET API에서 배정예산 조회만 실패. 시트 직접 읽기(A8:T500)는 정상 동작.

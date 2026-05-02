import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { checkPermission } from '@/lib/permissions';
import { PERMISSIONS } from '@/types';
import { getSheetsClient } from '@/lib/google/sheets';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { CATEGORY_SHEETS, CATEGORY_DATA_START_ROW, CATEGORY_DATA_END_ROW_MAP } from '@/constants/sheets';

const SPREADSHEET_ID = process.env.GOOGLE_SHEETS_ID!;

interface ExpRow {
  category: string;
  rowIndex: number;
  programName: string;
  description: string;
  monthlyAmounts: number[];
  totalAmount: number;
}

interface MatchCandidate {
  category: string;
  rowIndex: number;
  description: string;
  programName: string;
  sourceMonthIndex: number;
}

// 파일명 파싱: (yymmdd)건명_집행처_(금액).pdf
// 공백/하이픈도 구분자로 허용 (유연한 정규화)
function parseInvoiceFilename(fileName: string): {
  date: string;
  description: string;
  vendor: string;
  amount: number;
} | null {
  const name = fileName.trim();

  // 전체 형식: (yymmdd)건명_집행처_(금액).pdf
  // (.+) greedy → 마지막 [_-]집행처[_-] 패턴을 기준으로 분리
  const fullMatch = name.match(
    /^\(\s*(\d{6})\s*\)\s*(.+)[_\s-]([^_\s-]+)[_\s-]\(\s*([\d,]+)\s*\)\.pdf$/i,
  );

  if (fullMatch) {
    return {
      date: fullMatch[1].trim(),
      description: fullMatch[2].trim().replace(/[_\-\s]+$/, ''),
      vendor: fullMatch[3].trim(),
      amount: Number(fullMatch[4].replace(/,/g, '')),
    };
  }

  // Fallback: 날짜 + 금액만 추출 (집행처 구분자 없는 경우)
  const dateM = name.match(/^\((\d{2,8})\)/);
  const amtM  = name.match(/\(([\d,]+)\)\.pdf$/i);

  if (dateM && amtM) {
    const middle = name
      .replace(/^\(\d{2,8}\)\s*/, '')
      .replace(/\s*\([\d,]+\)\.pdf$/i, '')
      .trim();
    return {
      date: dateM[1].trim(),
      description: middle,
      vendor: '',
      amount: Number(amtM[1].replace(/,/g, '')),
    };
  }

  return null;
}

export async function POST(req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.email) {
      return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 });
    }

    const hasPermission = await checkPermission(session.user.email, PERMISSIONS.EXPENDITURE_WRITE);
    if (!hasPermission) {
      return NextResponse.json({ error: '권한이 없습니다.' }, { status: 403 });
    }

    const formData = await req.formData();
    const files = formData.getAll('files') as File[];
    const currentCategory = formData.get('currentCategory') as string | null;

    if (!files || files.length === 0) {
      return NextResponse.json({ error: '파일이 없습니다.' }, { status: 400 });
    }

    // ── 1. Google Sheets 집행내역 로드 ───────────────────────────────
    const sheets = getSheetsClient();
    const targetCategories: readonly string[] =
      currentCategory && (CATEGORY_SHEETS as readonly string[]).includes(currentCategory)
        ? [currentCategory]
        : CATEGORY_SHEETS;

    const ranges = targetCategories.map((cat) => {
      const endCol = cat === '인건비' ? 'M' : 'T';
      return `'${cat}'!A${CATEGORY_DATA_START_ROW}:${endCol}${CATEGORY_DATA_END_ROW_MAP[cat as keyof typeof CATEGORY_DATA_END_ROW_MAP]}`;
    });

    const sheetRes = await sheets.spreadsheets.values.batchGet({
      spreadsheetId: SPREADSHEET_ID,
      ranges,
      valueRenderOption: 'UNFORMATTED_VALUE',
    });

    // ── 2. 집행내역 목록 구축 ─────────────────────────────────────────
    const expRows: ExpRow[] = [];
    targetCategories.forEach((cat, idx) => {
      const rows = sheetRes.data.valueRanges?.[idx]?.values ?? [];
      rows.forEach((row, rowIdx) => {
        const isPersonnel = cat === '인건비';
        const programName = String(row[0] ?? '').trim();
        const description = isPersonnel
          ? String(row[0] ?? '').trim()
          : String(row[2] ?? '').trim();
        const monthlyAmounts = isPersonnel
          ? Array.from({ length: 12 }, (_, i) => Number(row[1 + i] ?? 0))
          : Array.from({ length: 12 }, (_, i) => Number(row[8 + i] ?? 0));
        const totalAmount = monthlyAmounts.reduce((s, v) => s + v, 0);

        if (description || programName) {
          expRows.push({
            category: cat,
            rowIndex: CATEGORY_DATA_START_ROW + rowIdx,
            programName,
            description,
            monthlyAmounts,
            totalAmount,
          });
        }
      });
    });

    // ── 3. 이미 파일이 연결된 행 조회 → 매칭 제외 ───────────────────
    const supabase = createServerSupabaseClient();
    const { data: uploadedFiles } = await supabase
      .from('expenditure_files')
      .select('sheet_name, row_index');

    const uploadedSet = new Set(
      (uploadedFiles ?? []).map(
        (f: { sheet_name: string; row_index: number }) => `${f.sheet_name}:${f.row_index}`,
      ),
    );

    const availableRows = expRows.filter(
      (r) => !uploadedSet.has(`${r.category}:${r.rowIndex}`),
    );

    // ── 4. 파일별 파싱 및 금액 기반 매칭 ────────────────────────────
    const results = [];

    for (const file of files) {
      const fileName = file.name;
      const parsed = parseInvoiceFilename(fileName);

      if (!parsed || parsed.amount === 0) {
        results.push({
          originalName: fileName,
          status: 'error',
          error: '파일명에서 금액을 인식하지 못했습니다. 형식: (yymmdd)건명_집행처_(금액).pdf',
        });
        continue;
      }

      const { date: expenseDateRaw, amount: fileAmount, vendor } = parsed;

      // 집행월 인덱스 (3월=0 … 2월=11)
      let monthIndex = -1;
      if (expenseDateRaw.length >= 4) {
        const m = parseInt(expenseDateRaw.substring(2, 4), 10);
        if (!isNaN(m) && m >= 1 && m <= 12) monthIndex = (m - 3 + 12) % 12;
      }

      // 금액 일치 후보 수집 (이미 업로드된 행 제외)
      const amountMatched: MatchCandidate[] = [];

      for (const exp of availableRows) {
        const amtMatch =
          fileAmount > 0 &&
          (exp.totalAmount === fileAmount ||
            (monthIndex !== -1 && exp.monthlyAmounts[monthIndex] === fileAmount) ||
            exp.monthlyAmounts.some((v) => v === fileAmount));

        if (amtMatch) {
          let srcIdx = -1;
          if (monthIndex !== -1 && exp.monthlyAmounts[monthIndex] === fileAmount) {
            srcIdx = monthIndex;
          } else {
            srcIdx = exp.monthlyAmounts.findIndex((v) => v === fileAmount);
          }

          amountMatched.push({
            category: exp.category,
            rowIndex: exp.rowIndex,
            description: exp.description,
            programName: exp.programName,
            sourceMonthIndex: srcIdx,
          });
        }
      }

      if (amountMatched.length === 1) {
        // 1:1 자동 매칭
        const best = amountMatched[0];
        results.push({
          originalName: fileName,
          status: 'success',
          autoMatched: true,
          matched: {
            category: best.category,
            rowIndex: best.rowIndex,
            description: best.description,
            programName: best.programName,
            sourceMonthIndex: best.sourceMonthIndex,
          },
          expenseDate: expenseDateRaw,
          fileAmount,
          vendor,
        });
      } else if (amountMatched.length > 1) {
        // 다중 매칭 → 후보 목록 제시
        results.push({
          originalName: fileName,
          status: 'candidates',
          autoMatched: false,
          candidates: amountMatched,
          expenseDate: expenseDateRaw,
          fileAmount,
          vendor,
        });
      } else {
        // 매칭 실패 → 수동 매칭 필요
        results.push({
          originalName: fileName,
          status: 'error',
          autoMatched: false,
          candidates: [],
          expenseDate: expenseDateRaw,
          fileAmount,
          vendor,
          error: '금액이 일치하는 항목이 없습니다. 수동 매칭을 통해 직접 선택해 주세요.',
        });
      }
    }

    return NextResponse.json({ results });
  } catch (error) {
    console.error('Invoice match error:', error);
    return NextResponse.json({ error: '매칭 처리 중 오류 발생' }, { status: 500 });
  }
}

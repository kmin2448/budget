import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { checkPermission } from '@/lib/permissions';
import { PERMISSIONS } from '@/types';
import { getSheetsClient } from '@/lib/google/sheets';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { CATEGORY_SHEETS, CATEGORY_DATA_START_ROW, CATEGORY_DATA_END_ROW_MAP } from '@/constants/sheets';

export const dynamic = 'force-dynamic';

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

/**
 * 파일명 파싱 — (yymmdd)건명_집행처_(금액).pdf
 *
 * 단일 복잡 정규식 대신 3단계 stepwise 방식으로 파싱하여
 * [], (), 콤마, 공백 등 복합 특수문자 파일명에서도 안정적으로 동작.
 *
 * 1단계: 날짜  — 시작의 (yymmdd) 추출
 * 2단계: 금액  — 끝의 _(금액).pdf 추출 (구분자 포함 패턴)
 * 3단계: 중간  — lastIndexOf('_') 로 건명/집행처 분리
 */
function parseInvoiceFilename(fileName: string): {
  date: string;
  description: string;
  vendor: string;
  amount: number;
} | null {
  const name = fileName.trim();

  // 1단계: 날짜 추출 — (yymmdd) 시작 패턴
  const dateM = name.match(/^\((\d{6})\)\s*/);
  if (!dateM) return null;

  // 2단계: 금액 추출 — _(숫자,숫자).pdf 끝 패턴
  // 구분자( _ | 공백 | - ) + (금액).pdf 형식
  const amtM = name.match(/([_\s-])\(([\d,]+)\)\.pdf$/i);
  if (!amtM) return null;

  const amount = parseInt(amtM[2].replace(/[^0-9]/g, ''), 10);
  if (!amount || isNaN(amount) || amount <= 0) return null;

  // 3단계: 중간 구간 추출 (날짜 이후, 구분자+금액+.pdf 이전)
  const afterDate = name.slice(dateM[0].length);
  // amtM[0] = "[_또는공백](금액).pdf" → 앞의 구분자까지 제거
  const middle = afterDate.slice(0, afterDate.length - amtM[0].length);

  // 마지막 _ 를 기준으로 건명 / 집행처 분리
  const lastUnderscoreIdx = middle.lastIndexOf('_');
  let description: string;
  let vendor: string;

  if (lastUnderscoreIdx !== -1) {
    description = middle.slice(0, lastUnderscoreIdx).trim();
    vendor      = middle.slice(lastUnderscoreIdx + 1).trim();
  } else {
    description = middle.trim();
    vendor      = '';
  }

  return { date: dateM[1], description, vendor, amount };
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

    // ── 3. 이미 파일이 연결된 행 조회 → 매칭 제외 ────────────────────
    // Supabase 오류 시 필터 없이 전체 행 사용 (안전장치)
    let uploadedSet = new Set<string>();
    try {
      const supabase = createServerSupabaseClient();
      const { data: uploadedFiles } = await supabase
        .from('expenditure_files')
        .select('sheet_name, row_index');

      uploadedSet = new Set(
        (uploadedFiles ?? []).map(
          (f: { sheet_name: string; row_index: number }) => `${f.sheet_name}:${f.row_index}`,
        ),
      );
    } catch (supabaseErr) {
      console.warn('[invoice-parse] Supabase 조회 실패 — 전체 행으로 매칭 진행:', supabaseErr);
    }

    const availableRows = expRows.filter(
      (r) => !uploadedSet.has(`${r.category}:${r.rowIndex}`),
    );

    // ── 4. 파일별 파싱 및 금액 기반 매칭 ────────────────────────────
    const results = [];

    for (const file of files) {
      const fileName = file.name;
      console.log(`[invoice-parse] 처리 중: "${fileName}"`);

      try {
        const parsed = parseInvoiceFilename(fileName);
        console.log(`[invoice-parse] 파싱 결과:`, parsed);

        if (!parsed) {
          results.push({
            originalName: fileName,
            status: 'error',
            error: '파일명 형식을 인식하지 못했습니다. 형식: (yymmdd)건명_집행처_(금액).pdf',
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

        console.log(`[invoice-parse] 금액: ${fileAmount}, 월인덱스: ${monthIndex}, 검색대상: ${availableRows.length}건`);

        // 금액 일치 후보 수집 (이미 업로드된 행 제외)
        const amountMatched: MatchCandidate[] = [];

        for (const exp of availableRows) {
          // 정수 반올림 비교 — Google Sheets 부동소수점 오차 방어
          const roundedTotal = Math.round(exp.totalAmount);
          const roundedFile  = Math.round(fileAmount);

          const amtMatch =
            roundedFile > 0 &&
            (roundedTotal === roundedFile ||
              (monthIndex !== -1 && Math.round(exp.monthlyAmounts[monthIndex]) === roundedFile) ||
              exp.monthlyAmounts.some((v) => Math.round(v) === roundedFile));

          if (amtMatch) {
            let srcIdx = -1;
            if (monthIndex !== -1 && Math.round(exp.monthlyAmounts[monthIndex]) === roundedFile) {
              srcIdx = monthIndex;
            } else {
              srcIdx = exp.monthlyAmounts.findIndex((v) => Math.round(v) === roundedFile);
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

        console.log(`[invoice-parse] 금액 일치 후보: ${amountMatched.length}건`);

        if (amountMatched.length === 1) {
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
      } catch (fileErr) {
        // 특정 파일 처리 실패가 전체 배치를 중단시키지 않도록 처리
        console.error(`[invoice-parse] 파일 처리 오류 "${fileName}":`, fileErr);
        results.push({
          originalName: fileName,
          status: 'error',
          error: '파일 처리 중 오류가 발생했습니다.',
        });
      }
    }

    return NextResponse.json({ results });
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error);
    console.error('[invoice-parse] 전체 오류:', error);
    return new NextResponse(
      JSON.stringify({ error: '매칭 처리 중 오류 발생', details: errMsg }),
      { status: 500, headers: { 'Content-Type': 'application/json; charset=utf-8' } },
    );
  }
}

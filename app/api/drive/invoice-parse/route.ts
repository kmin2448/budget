import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { checkPermission } from '@/lib/permissions';
import { PERMISSIONS } from '@/types';
import { getSheetsClient } from '@/lib/google/sheets';
import { CATEGORY_SHEETS, CATEGORY_DATA_START_ROW, CATEGORY_DATA_END_ROW_MAP } from '@/constants/sheets';
import { parseInvoicePdf } from '@/lib/pdf-invoice-parser';

const SPREADSHEET_ID = process.env.GOOGLE_SHEETS_ID!;

// ── 타입 ──────────────────────────────────────────────────────────────
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
  score: number;
  sourceMonthIndex: number; // 금액이 현재 위치한 월 인덱스 (-1: 합계 매칭 또는 미확인)
}

// ── 설명 유사도 (0~100) ───────────────────────────────────────────────
function descScore(target: string, exp: string): number {
  if (!target || !exp) return 0;
  if (exp.includes(target) || target.includes(exp)) return 100;
  const tg = target.replace(/\s/g, '');
  const ex = exp.replace(/\s/g, '');
  let hit = 0;
  const exSet = new Set(ex);
  new Set(tg).forEach((c) => { if (exSet.has(c)) hit++; });
  return Math.floor((hit / Math.max(tg.length, ex.length)) * 100);
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

    // ── 1. 구글 시트에서 집행내역 로드 ───────────────────────────────
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

    // ── 3. 파일별 매칭 ───────────────────────────────────────────────
    const results = [];

    for (const file of files) {
      const fileName = file.name;

      // ── 1단계: 파일명 파싱 ────────────────────────────────────────────
      // 지원 형식:
      //   신) (yymmdd) 건명 (거래처(성명))(금액).pdf
      //   구) (yymmdd) 건명_거래처_(금액).pdf
      const dateMatch   = fileName.match(/^\((\d{2,8})\)/);
      const amountMatch = fileName.match(/\(([\d,]+)\)\.pdf$/i);

      let expenseDateRaw: string;
      let fileAmount: number;
      let targetDesc: string;

      if (dateMatch && amountMatch) {
        // 파일명 형식이 맞으면 파일명에서 추출
        expenseDateRaw = dateMatch[1].trim();
        fileAmount     = Number(amountMatch[1].replace(/,/g, ''));

        const inner = fileName
          .replace(/^\(\d{2,8}\)\s*/, '')
          .replace(/\s*\([\d,]+\)\.pdf$/i, '')
          .replace(/\s*\([^)]{1,30}\)\s*$/, '')
          .replace(/[\s_]+[^\s_]{2,20}[_\s]*$/, '')
          .trim();
        targetDesc = inner || fileName.replace(/\.pdf$/i, '');
      } else {
        // ── 2단계: PDF 내용 파싱으로 fallback ──────────────────────────
        try {
          const arrayBuf = await file.arrayBuffer();
          const buf = Buffer.from(arrayBuf);
          const parsed = await parseInvoicePdf(buf);

          if (parsed.amountStr === '금액미상') {
            results.push({
              originalName: fileName,
              status: 'error',
              error: `PDF 내용에서 금액을 인식하지 못했습니다. 파일명 형식(날짜)(금액).pdf으로도 확인해 주세요.`,
            });
            continue;
          }

          expenseDateRaw = parsed.dateStr !== '일자미상' ? parsed.dateStr : '';
          fileAmount     = Number(parsed.amountStr.replace(/,/g, ''));
          targetDesc     = parsed.descStr !== '건명미상' ? parsed.descStr : fileName.replace(/\.pdf$/i, '');
        } catch {
          results.push({
            originalName: fileName,
            status: 'error',
            error: 'PDF 파싱에 실패했습니다. 파일이 손상되었거나 스캔 이미지일 수 있습니다.',
          });
          continue;
        }
      }

      // 월 인덱스 (3월=0 ... 2월=11)
      let monthIndex = -1;
      if (expenseDateRaw.length >= 4) {
        const m = parseInt(expenseDateRaw.substring(2, 4), 10);
        if (!isNaN(m) && m >= 1 && m <= 12) monthIndex = (m - 3 + 12) % 12;
      }

      // ── 금액 일치 후보 ────────────────────────────────────────────
      const amountMatched: MatchCandidate[] = [];
      // ── 금액 불일치이지만 설명 유사 후보 ─────────────────────────
      const descOnly: MatchCandidate[] = [];

      for (const exp of expRows) {
        const amtMatch =
          fileAmount > 0 &&
          (exp.totalAmount === fileAmount ||
            (monthIndex !== -1 && exp.monthlyAmounts[monthIndex] === fileAmount) ||
            exp.monthlyAmounts.some((v) => v === fileAmount));

        const ds = descScore(targetDesc, exp.description);

        if (amtMatch) {
          // 금액이 현재 위치한 월 인덱스 추적
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
            score: 1000 + ds + (monthIndex !== -1 && exp.monthlyAmounts[monthIndex] === fileAmount ? 100 : 0),
            sourceMonthIndex: srcIdx,
          });
        } else if (ds >= 40) {
          // 금액 불일치이지만 설명이 40% 이상 유사
          descOnly.push({ category: exp.category, rowIndex: exp.rowIndex, description: exp.description, score: ds, sourceMonthIndex: -1 });
        }
      }

      amountMatched.sort((a, b) => b.score - a.score);
      descOnly.sort((a, b) => b.score - a.score);

      if (amountMatched.length > 0) {
        // ── 금액 일치 → 자동 매칭 ──────────────────────────────────
        const best = amountMatched[0];
        results.push({
          originalName: fileName,
          status: 'success',
          autoMatched: true,
          matched: {
            category: best.category,
            rowIndex: best.rowIndex,
            description: best.description,
            sourceMonthIndex: best.sourceMonthIndex,
          },
          expenseDate: expenseDateRaw,
          fileAmount,
        });
      } else {
        // ── 금액 불일치 → 후보군 제시 (최대 5개) ──────────────────
        results.push({
          originalName: fileName,
          status: descOnly.length > 0 ? 'candidates' : 'error',
          autoMatched: false,
          candidates: descOnly.slice(0, 5).map(({ category, rowIndex, description, score }) => ({
            category,
            rowIndex,
            description,
            score,
          })),
          expenseDate: expenseDateRaw,
          error: descOnly.length === 0 ? '금액이 일치하는 항목 없음. 수동 매칭이 필요합니다.' : undefined,
        });
      }
    }

    return NextResponse.json({ results });
  } catch (error) {
    console.error('Invoice match error:', error);
    return NextResponse.json({ error: '매칭 처리 중 오류 발생' }, { status: 500 });
  }
}

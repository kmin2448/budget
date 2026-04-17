/**
 * 지출부 PDF 파싱 유틸리티
 *
 * 파일명 형식: (yymmdd) 건명 (거래처명(성명))(금회청구액).pdf
 *
 * 추출 위치:
 *  - 이체일자, 건명(=적요), 금회청구액, 비목 → 1페이지
 *  - 거래처명(성명)                           → 3~10페이지
 *    · 인건비·장학금: 3번째 열
 *    · 그 외 비목  : 4번째 열
 *    (첫 행은 열 제목)
 */

import { CATEGORY_SHEETS } from '@/constants/sheets';

export interface ParsedInvoice {
  dateStr: string;
  descStr: string;
  categoryStr: string;
  amountStr: string;
  merchantStr: string;
  fileName: string;
}

export interface ParsedInvoiceDebug extends ParsedInvoice {
  debugInfo: string;
  page1Raw: string;
  merchantRaw: string;
  pageCount: number;
}

// ────────────────────────────────────────────────────────────────────
// 내부 파싱 함수
// ────────────────────────────────────────────────────────────────────

function mapToStandardCategory(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return '미분류';
  const exact = CATEGORY_SHEETS.find((c) => c === trimmed);
  if (exact) return exact;
  const partial = CATEGORY_SHEETS.find(
    (c) => c.startsWith(trimmed) || trimmed.startsWith(c) || c.includes(trimmed),
  );
  return partial ?? trimmed;
}

/** 1페이지: 이체일자 → yymmdd */
function parseDateFromPage1(page1: string): string {
  const m = page1.match(
    /이체일자\s*[:|]?\s*(\d{2,4})[년\s\-.\/]+(\d{1,2})[월\s\-.\/]+(\d{1,2})/,
  );
  if (!m) return '일자미상';
  let y = m[1];
  if (y.length >= 4) y = y.slice(2);
  else y = y.padStart(2, '0');
  return `${y}${m[2].padStart(2, '0')}${m[3].padStart(2, '0')}`;
}

/**
 * 1페이지: 건명 = "적요" 레이블 오른쪽 칸
 *
 * PDF 테이블 추출 시 가능한 형태:
 *   A) 같은 줄 한 줄: "적요  ABC연구재료구입  작성일  ..."
 *   B) 같은 줄 + 이어지는 줄: "적요  ABC연구재료\n구입 및 설치"
 *   C) 레이블만 있고 다음 줄(들)에 값: "적요\nABC연구재료구입\n및 설치"
 *
 * → 첫 번째 유효 줄부터 종료 조건이 나올 때까지 이어 붙임
 * "건명" 도 fallback으로 처리
 */
function parseDescFromPage1(page1: string): string {
  const STOP_PATTERN =
    /^(이체일자|비목|세목|합계|총계|금회청구액|청구|작성일|작성자|담당|승인|결재|사업명|집행|지출)/;

  const lines = page1.split(/[\n\r]+/);

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // "적요" 또는 "건명" 레이블이 있는 줄만
    if (!/적\s*요/.test(line) && !/건\s*명/.test(line)) continue;

    const parts: string[] = [];

    // ── 같은 줄의 레이블 이후 내용 ──────────────────────────────
    const afterLabel = line
      .replace(/^.*(?:적\s*요|건\s*명)\s*[:|]?\s*/, '')
      .split(/(?:카드연계구분|작성일|구분|이체|담당|승인|결재|사업명|작성자|담당자|프로그램|기관|기안)/)[0] // 옆칸 제목이 나오면 그 이전까지만 취득
      .trim();

    if (afterLabel.length >= 2) {
      // 2칸 이상 공백 또는 탭으로 분리해 첫 번째 셀만 사용
      const firstCell = afterLabel.split(/\s{2,}|\t/)[0].trim();
      if (firstCell.length >= 2) parts.push(firstCell);
    }

    // ── 이어지는 줄 수집 (최대 4줄, 두 줄 건명 대응) ───────────
    for (let j = i + 1; j <= i + 4 && j < lines.length; j++) {
      const nextRaw = lines[j].trim();

      // 빈 줄: 이미 값이 있으면 종료, 없으면 건너뜀
      if (!nextRaw) {
        if (parts.length > 0) break;
        continue;
      }

      // 다른 필드 레이블이나 숫자만 있는 줄이면 종료
      if (STOP_PATTERN.test(nextRaw)) break;
      if (/^[\d,\s]+$/.test(nextRaw)) break;

      // 한글·영문·숫자로 시작하는 줄이면 건명 내용으로 판단
      if (/^[가-힣a-zA-Z0-9]/.test(nextRaw) && nextRaw.length <= 60) {
        // 아랫줄에서도 우측 열(카드연계구분 데이터 등)이 섞여있다면 2칸 이상의 공백으로 분리
        const nextCleaned = nextRaw.split(/(?:카드연계구분|\(구LG\)|RND|신한카드)/)[0].split(/\s{2,}|\t/)[0].trim();
        if (nextCleaned && nextCleaned !== '카드연계구분') {
           parts.push(nextCleaned);
        }
      } else if (parts.length > 0) {
        // 이미 값이 수집됐는데 조건 불충족 → 종료
        break;
      }
    }

    if (parts.length > 0) {
      let combined = parts.join(' ').trim().replace(/[/\\:*?"<>|]/g, '_');
      // 혹시라도 섞여 들어간 카드연계구분 관련 데이터 다시 한번 소거 방어코드
      combined = combined.split(/(?:카드연계구분|RND)/)[0].trim();
      
      if (combined.length >= 2) return combined;
    }
  }

  return '건명미상';
}

/** 1페이지 테이블: 비목 + 금회청구액 */
function parseCategoryAndAmountFromPage1(
  page1: string,
): { category: string; amount: string } {
  const lines = page1.split(/[\n\r]+/).map((l) => l.trim()).filter(Boolean);
  let foundHeader = false;

  for (let i = 0; i < lines.length; i++) {
    const noSpc = lines[i].replace(/\s/g, '');

    if (noSpc.includes('금회청구액') || noSpc.includes('집행금액')) {
      foundHeader = true;
      continue;
    }
    if (!foundHeader) continue;
    if (/^(계|합계|소계|총계|누계)/.test(noSpc)) continue;

    // 패턴 A: "비목 ... 1,234,567"
    const rowMatchA = lines[i].match(
      /^([가-힣]{2,15})[\s\S]*?([1-9]\d{0,2}(?:,\d{3})+)\s*$/,
    );
    if (rowMatchA) {
      return { category: mapToStandardCategory(rowMatchA[1]), amount: rowMatchA[2] };
    }

    // 패턴 B: 비목 한 줄 + 다음 줄 금액
    if (/^[가-힣]{2,15}$/.test(noSpc) && i + 1 < lines.length) {
      const amtMatch = lines[i + 1].match(/([1-9]\d{0,2}(?:,\d{3})+)/);
      if (amtMatch) {
        return { category: mapToStandardCategory(lines[i]), amount: amtMatch[1] };
      }
    }
  }

  return { category: '미분류', amount: '금액미상' };
}

/**
 * 3~10페이지: 헤더 키워드로 열 위치를 동적으로 찾아 거래처명 추출
 *
 * - 인건비·장학금 → 3번째 열
 * - 그 외 비목   → 4번째 열
 */
function parseMerchantsFromPages(text: string, category: string): string[] {
  const isPersonnelOrScholarship =
    category === '인건비' || category === '장학금' || text.includes('인건비 지급명세서') || text.includes('장학금 지급명세서');

  const lines = text.split(/[\n\r]+/).map((l) => l.trim()).filter(Boolean);
  if (lines.length === 0) return [];

  const results: string[] = [];
  let foundHeader = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const noSpc = line.replace(/\s/g, '');

    // 헤더 진입 확인
    if (noSpc.includes('거래처명') || noSpc.includes('성명')) {
      foundHeader = true;
      continue;
    }

    if (foundHeader) {
      // 합계, 계 행 나오면 종료
      if (/^(계|합계|소계|총계|총액|합계금액|Total)/.test(noSpc)) break;

      // 표 데이터 행은 항상 '순번(숫자)' 로 시작함
      const dataRowMatch = line.match(/^(\d+)\s+(.+)/);
      if (dataRowMatch) {
        let foundName = '';
        const cols = line.split(/\s+/).filter(c => c.length > 0);

        // 전략 1: 비목(category)의 우측 단어 매칭 (정확도 가장 높음)
        if (category !== '미분류' && line.includes(category)) {
          const afterCategory = line.split(category)[1].trim();
          const personMatch = afterCategory.match(/^([가-힣a-zA-Z\(\)주]{2,15})/);
          if (personMatch) foundName = personMatch[1];
        }

        // 전략 2: 이미지 열 구조 기반 (인건비 3열, 기타 4열)
        if (!foundName) {
          if (isPersonnelOrScholarship && cols.length >= 3) {
            foundName = cols[2]; // 3번째 열 (0-indexed 2)
          } else if (!isPersonnelOrScholarship && cols.length >= 4) {
            foundName = cols[3]; // 4번째 열 (0-indexed 3)
          }
        }

        if (foundName) {
          // (성명) 형식일 경우 괄호 제거
          foundName = foundName.replace(/^\(/, '').replace(/\)$/, '');
          
          if (/[가-힣a-zA-Z]{2,}/.test(foundName) && !['은행', '계좌', '금액', '농협', '신한', '국민'].includes(foundName)) {
             results.push(foundName);
          }
        }
      }
    }
  }

  return Array.from(new Set(results));
}

/** 거래처 배열 → 파일명용 문자열 (최대 3개 + "등 N명") */
function formatMerchantStr(merchants: string[]): string {
  if (merchants.length === 0) return '거래처미상';
  if (merchants.length <= 3) return merchants.join(', ');
  const remaining = merchants.length - 3;
  return `${merchants.slice(0, 3).join(', ')} 등 ${remaining}명`;
}

// ────────────────────────────────────────────────────────────────────
// 공개 API
// ────────────────────────────────────────────────────────────────────

export async function parseInvoicePdf(buffer: Buffer): Promise<ParsedInvoiceDebug> {
  let fullText = '';
  let debugInfo = '';

  // 1차: pdf-parse (최대 10페이지)
  try {
    const pdfParseMod = await import('pdf-parse');
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const pdfParse: (buf: Buffer, opts?: Record<string, unknown>) => Promise<{ text: string }> =
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      (pdfParseMod as { default?: unknown }).default as typeof pdfParse ?? require('pdf-parse');
    const data = await pdfParse(buffer, { max: 7 }); // 요청에 따라 7페이지까지 스캔
    fullText = data.text ?? '';
    debugInfo = `pdf-parse ok, len=${fullText.length}`;
  } catch (e: unknown) {
    debugInfo = `pdf-parse err: ${e instanceof Error ? e.message : e}; `;
  }

  // 2차: pdf2json fallback
  if (fullText.trim().length < 20) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const pdf2jsonMod = await import('pdf2json');
      // eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-explicit-any
      const PDFParser: new (ctx: null, mode: number) => {
        on(event: string, cb: (data?: unknown) => void): void;
        parseBuffer(buf: Buffer): void;
        getRawTextContent(): { toString(): string };
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      } = (pdf2jsonMod as { default?: unknown }).default as typeof PDFParser ?? require('pdf2json');
      const parser = new PDFParser(null, 1);
      const raw = await new Promise<string>((resolve, reject) => {
        parser.on('pdfParser_dataError', (err: unknown) => reject(err));
        parser.on('pdfParser_dataReady', () => {
          let t: string = parser.getRawTextContent().toString();
          try { t = decodeURIComponent(t); } catch { /* ignore */ }
          resolve(t);
        });
        parser.parseBuffer(buffer);
      });
      if (raw.length > fullText.length) {
        fullText = raw.replace(/\r\n/g, '\n');
        debugInfo += ` pdf2json ok, len=${fullText.length}`;
      }
    } catch (e: unknown) {
      debugInfo += ` pdf2json err: ${e instanceof Error ? e.message : e}`;
    }
  }

  // 페이지 분리 (form-feed \x0C)
  const pages = fullText.split('\x0C');
  const page1 = pages[0] ?? '';

  // 거래처: 3~7페이지 (0-indexed: 2~6)
  const merchantText =
    pages.length >= 3
      ? pages.slice(2, 7).join('\n')
      : fullText.substring(Math.floor(fullText.length * 0.4));

  // 1페이지 파싱 (비목을 먼저 파악해야 거래처 열 위치 결정 가능)
  const dateStr = parseDateFromPage1(page1);
  const descStr = parseDescFromPage1(page1);
  const { category, amount } = parseCategoryAndAmountFromPage1(page1);

  // 거래처 파싱 (비목 정보 전달)
  const merchants = parseMerchantsFromPages(merchantText, category);
  const merchantStr = formatMerchantStr(merchants);

  // 파일명: (yymmdd) 건명 (거래처명(성명))(금회청구액).pdf
  const rawName = `(${dateStr}) ${descStr} (${merchantStr})(${amount}).pdf`;
  const fileName = rawName.replace(/[/\\:*?"<>|]/g, '_');

  return {
    dateStr,
    descStr,
    categoryStr: category,
    amountStr:   amount,
    merchantStr,
    fileName,
    debugInfo,
    page1Raw:    page1.substring(0, 800).replace(/\x0C/g, '[FF]'),
    merchantRaw: merchantText.substring(0, 1000).replace(/\x0C/g, '[FF]'),
    pageCount:   pages.length,
  };
}

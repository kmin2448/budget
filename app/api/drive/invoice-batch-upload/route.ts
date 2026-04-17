import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { checkPermission } from '@/lib/permissions';
import { PERMISSIONS } from '@/types';
import { uploadToUserDrive } from '@/lib/google/drive';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { getSheetsClient } from '@/lib/google/sheets';

export async function POST(req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.email || !session.accessToken) {
      return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 });
    }

    const hasPermission = await checkPermission(session.user.email, PERMISSIONS.EXPENDITURE_WRITE);
    if (!hasPermission) {
      return NextResponse.json({ error: '권한이 없습니다.' }, { status: 403 });
    }

    const formData = await req.formData();
    const files = formData.getAll('files') as File[];
    const payloadStr = formData.get('payload') as string;

    if (!files || files.length === 0 || !payloadStr) {
      return NextResponse.json({ error: '파일 또는 매칭 정보가 전송되지 않았습니다.' }, { status: 400 });
    }

    const payloadInfo = JSON.parse(payloadStr) as Record<string, {
      category: string;
      rowIndex: number;
      expenseDate?: string;
      sourceMonthIndex?: number; // 현재 금액이 있는 월 인덱스 (0=3월 ... 11=2월)
      fileAmount?: number;       // 매칭된 금액
    }>;
    const results = [];
    const supabase = createServerSupabaseClient();
    const sheets = getSheetsClient();

    // 사용자 UUID 조회 (FK 제약용 — 단일 업로드와 동일 방식)
    const { data: userRecord } = await supabase
      .from('users')
      .select('id')
      .eq('email', session.user.email)
      .single();
    const uploadedById = userRecord?.id ?? null;

    for (const file of files) {
      try {
        const buffer = Buffer.from(await file.arrayBuffer());
        const fileMatchInfo = payloadInfo[file.name];

        if (!fileMatchInfo || !fileMatchInfo.category || fileMatchInfo.rowIndex === undefined || fileMatchInfo.category === '미분류') {
           throw new Error('해당 파일에 매칭된 지출 내역(비목/행) 정보가 올바르지 않습니다.');
        }

        const categoryName = fileMatchInfo.category;
        const fileName = file.name;

        // 1. 구글 드라이브에 매칭된 비목 폴더로 원본 파일 업로드
        const { fileId, webViewLink } = await uploadToUserDrive({
          accessToken: session.accessToken,
          categoryName,
          fileName,
          buffer,
        });

        // 2. 구글 시트 B열(집행일자) 기록 + 집행월에 맞게 금액 열 이동 (일반 비목일 때만)
        if (categoryName !== '인건비' && fileMatchInfo.expenseDate) {
          const SPREADSHEET_ID = process.env.GOOGLE_SHEETS_ID!;
          const rawDate = fileMatchInfo.expenseDate; // yymmdd

          // yymmdd → 20YY-MM-DD
          const dateFormatted =
            rawDate.length >= 6
              ? `20${rawDate.substring(0, 2)}-${rawDate.substring(2, 4)}-${rawDate.substring(4, 6)}`
              : rawDate;

          // 집행일자의 회계 월 인덱스 (3월=0 … 2월=11)
          const calMonth = parseInt(rawDate.substring(2, 4), 10);
          const targetFiscalIdx =
            !isNaN(calMonth) && calMonth >= 1 && calMonth <= 12
              ? (calMonth - 3 + 12) % 12
              : -1;

          const batchData: { range: string; values: (string | number)[][] }[] = [
            {
              range: `'${categoryName}'!B${fileMatchInfo.rowIndex}`,
              values: [[dateFormatted]],
            },
          ];

          // 대상 월이 확인된 경우: 시트에서 현재 행의 I~T열(월별 금액) 직접 읽어 이동 처리
          if (targetFiscalIdx >= 0) {
            const rowRes = await sheets.spreadsheets.values.get({
              spreadsheetId: SPREADSHEET_ID,
              range: `'${categoryName}'!I${fileMatchInfo.rowIndex}:T${fileMatchInfo.rowIndex}`,
              valueRenderOption: 'UNFORMATTED_VALUE',
            });
            const monthlyAmounts = Array.from({ length: 12 }, (_, i) =>
              Number(rowRes.data.values?.[0]?.[i] ?? 0),
            );

            // 이미 대상 월에 금액이 있으면 이동 불필요
            if (monthlyAmounts[targetFiscalIdx] === 0) {
              // 현재 금액이 있는 열 탐색: 클라이언트 힌트 → 파일 금액 일치 → 첫 번째 non-zero
              const hintIdx    = fileMatchInfo.sourceMonthIndex ?? -1;
              const fileAmt    = fileMatchInfo.fileAmount ?? 0;

              let sourceFiscalIdx = -1;
              if (hintIdx >= 0 && hintIdx < 12 && monthlyAmounts[hintIdx] > 0) {
                sourceFiscalIdx = hintIdx;                          // 1순위: 클라이언트 힌트
              } else if (fileAmt > 0) {
                sourceFiscalIdx = monthlyAmounts.findIndex(v => v === fileAmt); // 2순위: 금액 일치
              }
              if (sourceFiscalIdx < 0) {
                sourceFiscalIdx = monthlyAmounts.findIndex(v => v > 0);         // 3순위: 첫 non-zero
              }

              if (sourceFiscalIdx >= 0 && sourceFiscalIdx !== targetFiscalIdx) {
                const amountToMove = monthlyAmounts[sourceFiscalIdx];
                const srcCol = String.fromCharCode('I'.charCodeAt(0) + sourceFiscalIdx);
                const tgtCol = String.fromCharCode('I'.charCodeAt(0) + targetFiscalIdx);

                batchData.push({
                  range: `'${categoryName}'!${srcCol}${fileMatchInfo.rowIndex}`,
                  values: [['']],
                });
                batchData.push({
                  range: `'${categoryName}'!${tgtCol}${fileMatchInfo.rowIndex}`,
                  values: [[amountToMove]],
                });
              }
            }
          }

          await sheets.spreadsheets.values.batchUpdate({
            spreadsheetId: SPREADSHEET_ID,
            requestBody: {
              valueInputOption: 'USER_ENTERED',
              data: batchData,
            },
          });
        }

        // 3. 기존 해당 행에 연결된 파일이 있다면 삭제 처리 (안전장치)
        await supabase
          .from('expenditure_files')
          .delete()
          .match({ sheet_name: categoryName, row_index: fileMatchInfo.rowIndex });

        // 4. Supabase expenditure_files DB 저장 (화면에 업로드 상태 확정을 위함)
        const { error: dbError } = await supabase
          .from('expenditure_files')
          .insert({
             sheet_name: categoryName,
             row_index: fileMatchInfo.rowIndex,
             drive_file_id: fileId,
             drive_url: webViewLink,
             uploaded_by: uploadedById,
          });

        if (dbError) {
          console.error(`Supabase DB Insert Error for ${fileName}:`, dbError);
        }

        results.push({
          originalName: file.name,
          newName: fileName,
          category: categoryName,
          status: 'success',
          fileId,
          url: webViewLink,
        });
      } catch (err) {
         console.error('File Upload Error:', err);
         results.push({
          originalName: file.name,
          status: 'error',
          error: err instanceof Error ? err.message : '처리 실패',
        });
      }
    }

    return NextResponse.json({ results });
  } catch (error) {
    console.error('Batch upload error:', error);
    return NextResponse.json({ error: '일괄 업로드 처리 중 오류 발생' }, { status: 500 });
  }
}

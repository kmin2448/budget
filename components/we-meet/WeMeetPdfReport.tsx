'use client';

import { useRef } from 'react';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';
import { formatKRW } from '@/lib/utils';
import type { WeMeetExecution, WeMeetTeamSummary } from '@/types';
import { WEMEET_USAGE_TYPES } from '@/constants/wemeet';

// ── 팀별 개별 보고서 ─────────────────────────────────────────────────

interface TeamReportProps {
  teamName: string;
  summary: WeMeetTeamSummary | undefined;
  executions: WeMeetExecution[];
}

export function WeMeetTeamPdfReport({ teamName, summary, executions }: TeamReportProps) {
  const reportRef = useRef<HTMLDivElement>(null);

  async function handleDownload() {
    if (!reportRef.current) return;
    const canvas = await html2canvas(reportRef.current, { scale: 2, useCORS: true });
    const imgData = canvas.toDataURL('image/png');
    const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    const pageWidth  = pdf.internal.pageSize.getWidth();
    const imgWidth   = pageWidth - 20;
    const imgHeight  = (canvas.height * imgWidth) / canvas.width;
    pdf.addImage(imgData, 'PNG', 10, 10, imgWidth, imgHeight);
    pdf.save(`WE-Meet_정산보고서_${teamName}.pdf`);
  }

  const teamExecs = executions.filter((e) => e.teamName === teamName);

  return (
    <>
      <button
        onClick={handleDownload}
        className="text-xs text-primary hover:underline"
      >
        PDF 다운로드
      </button>

      {/* 숨겨진 렌더 영역 */}
      <div className="fixed left-[-9999px] top-0">
        <div ref={reportRef} className="w-[794px] bg-white p-10 font-sans text-[#131310]">
          <div className="mb-6 border-b-2 border-primary pb-3">
            <h1 className="text-xl font-bold text-primary">WE-Meet 정산 보고서</h1>
            <p className="mt-1 text-sm text-gray-500">팀명: {teamName}</p>
          </div>

          {/* 요약 */}
          {summary && (
            <div className="mb-6 grid grid-cols-3 gap-3">
              {[
                { label: '배정 예산', value: summary.totalBudget },
                { label: '확정 지출', value: summary.confirmed.total },
                { label: '확정 잔액', value: summary.confirmedBalance },
              ].map((item) => (
                <div key={item.label} className="rounded-lg border border-[#E3E3E0] p-3 text-center">
                  <p className="text-xs text-gray-500">{item.label}</p>
                  <p className={`mt-0.5 text-base font-semibold ${item.value < 0 ? 'text-red-500' : 'text-[#131310]'}`}>
                    {formatKRW(item.value)}
                  </p>
                </div>
              ))}
            </div>
          )}

          {/* 사용구분별 소계 */}
          {summary && (
            <div className="mb-6">
              <h2 className="mb-2 text-sm font-semibold text-[#131310]">사용구분별 집계</h2>
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr className="bg-[#F3F3EE]">
                    <th className="border border-[#E3E3E0] px-3 py-2 text-left text-[#6F6F6B]">사용구분</th>
                    <th className="border border-[#E3E3E0] px-3 py-2 text-right text-[#6F6F6B]">확정금액</th>
                    <th className="border border-[#E3E3E0] px-3 py-2 text-right text-[#6F6F6B]">기안금액</th>
                  </tr>
                </thead>
                <tbody>
                  {[
                    { label: '멘토링',          conf: summary.confirmed.mentoring,       pend: summary.pending.mentoring },
                    { label: '회의비',           conf: summary.confirmed.meeting,         pend: summary.pending.meeting },
                    { label: '재료비',           conf: summary.confirmed.material,        pend: summary.pending.material },
                    { label: '학생활동지원비',   conf: summary.confirmed.studentActivity, pend: summary.pending.studentActivity },
                  ].map((row) => (
                    <tr key={row.label}>
                      <td className="border border-[#E3E3E0] px-3 py-1.5">{row.label}</td>
                      <td className="border border-[#E3E3E0] px-3 py-1.5 text-right">{formatKRW(row.conf)}</td>
                      <td className="border border-[#E3E3E0] px-3 py-1.5 text-right">{formatKRW(row.pend)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* 집행내역 전체 */}
          <div>
            <h2 className="mb-2 text-sm font-semibold text-[#131310]">집행내역</h2>
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="bg-[#F3F3EE]">
                  <th className="border border-[#E3E3E0] px-3 py-2 text-left text-[#6F6F6B]">사용구분</th>
                  <th className="border border-[#E3E3E0] px-3 py-2 text-right text-[#6F6F6B]">기안금액</th>
                  <th className="border border-[#E3E3E0] px-3 py-2 text-center text-[#6F6F6B]">확정</th>
                  <th className="border border-[#E3E3E0] px-3 py-2 text-right text-[#6F6F6B]">확정금액</th>
                </tr>
              </thead>
              <tbody>
                {teamExecs.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="border border-[#E3E3E0] px-3 py-3 text-center text-gray-400">
                      집행내역 없음
                    </td>
                  </tr>
                ) : (
                  teamExecs.map((e) => (
                    <tr key={e.rowIndex}>
                      <td className="border border-[#E3E3E0] px-3 py-1.5">{e.usageType}</td>
                      <td className="border border-[#E3E3E0] px-3 py-1.5 text-right">{formatKRW(e.draftAmount)}</td>
                      <td className="border border-[#E3E3E0] px-3 py-1.5 text-center">{e.confirmed ? '●' : '○'}</td>
                      <td className="border border-[#E3E3E0] px-3 py-1.5 text-right">{formatKRW(e.confirmedAmount)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          <p className="mt-6 text-right text-xs text-gray-400">
            출력일: {new Date().toLocaleDateString('ko-KR')}
          </p>
        </div>
      </div>
    </>
  );
}

// ── 전체 요약 보고서 ─────────────────────────────────────────────────

interface AllReportProps {
  summaries: WeMeetTeamSummary[];
}

export function WeMeetAllPdfReport({ summaries }: AllReportProps) {
  const reportRef = useRef<HTMLDivElement>(null);

  async function handleDownload() {
    if (!reportRef.current) return;
    const canvas = await html2canvas(reportRef.current, { scale: 2, useCORS: true });
    const imgData = canvas.toDataURL('image/png');
    const pdf = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
    const pageWidth  = pdf.internal.pageSize.getWidth();
    const imgWidth   = pageWidth - 20;
    const imgHeight  = (canvas.height * imgWidth) / canvas.width;

    const yPos = 10;
    const pageHeight = pdf.internal.pageSize.getHeight() - 20;

    if (imgHeight <= pageHeight) {
      pdf.addImage(imgData, 'PNG', 10, yPos, imgWidth, imgHeight);
    } else {
      // 여러 페이지로 분할
      let remaining = imgHeight;
      let srcY = 0;
      while (remaining > 0) {
        const sliceHeight = Math.min(pageHeight, remaining);
        const sliceCanvas = document.createElement('canvas');
        sliceCanvas.width  = canvas.width;
        sliceCanvas.height = (sliceHeight / imgHeight) * canvas.height;
        const ctx = sliceCanvas.getContext('2d')!;
        ctx.drawImage(canvas, 0, srcY * (canvas.height / imgHeight), canvas.width, sliceCanvas.height, 0, 0, sliceCanvas.width, sliceCanvas.height);
        pdf.addImage(sliceCanvas.toDataURL('image/png'), 'PNG', 10, yPos, imgWidth, sliceHeight);
        remaining -= sliceHeight;
        srcY += sliceHeight;
        if (remaining > 0) pdf.addPage();
      }
    }

    pdf.save(`WE-Meet_전체요약_${new Date().toLocaleDateString('ko-KR').replace(/\./g, '').replace(/ /g, '')}.pdf`);
  }

  const grandTotal = summaries.reduce((acc, s) => ({
    totalBudget:       acc.totalBudget + s.totalBudget,
    confirmedTotal:    acc.confirmedTotal + s.confirmed.total,
    confirmedBalance:  acc.confirmedBalance + s.confirmedBalance,
    expectedBalance:   acc.expectedBalance + s.expectedBalance,
  }), { totalBudget: 0, confirmedTotal: 0, confirmedBalance: 0, expectedBalance: 0 });

  return (
    <>
      <button
        onClick={handleDownload}
        className="inline-flex items-center gap-1.5 rounded-lg border border-[#E3E3E0] bg-white px-3 py-1.5 text-sm text-[#6F6F6B] hover:bg-[#F3F3EE] transition-colors"
      >
        전체 요약 PDF
      </button>

      <div className="fixed left-[-9999px] top-0">
        <div ref={reportRef} className="w-[1122px] bg-white p-10 font-sans text-[#131310]">
          <div className="mb-6 border-b-2 border-primary pb-3">
            <h1 className="text-xl font-bold text-primary">WE-Meet 전체 정산 요약</h1>
            <p className="mt-1 text-sm text-gray-500">출력일: {new Date().toLocaleDateString('ko-KR')}</p>
          </div>

          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="bg-[#F3F3EE]">
                <th className="border border-[#E3E3E0] px-3 py-2 text-left text-[#6F6F6B]">팀명</th>
                <th className="border border-[#E3E3E0] px-3 py-2 text-right text-[#6F6F6B]">배정예산</th>
                {WEMEET_USAGE_TYPES.map((u) => (
                  <th key={u} className="border border-[#E3E3E0] px-3 py-2 text-right text-[#6F6F6B]">{u}</th>
                ))}
                <th className="border border-[#E3E3E0] px-3 py-2 text-right text-[#6F6F6B]">확정합계</th>
                <th className="border border-[#E3E3E0] px-3 py-2 text-right text-[#6F6F6B]">확정잔액</th>
                <th className="border border-[#E3E3E0] px-3 py-2 text-right text-[#6F6F6B]">예정잔액</th>
              </tr>
            </thead>
            <tbody>
              {summaries.map((s) => (
                <tr key={s.teamName}>
                  <td className="border border-[#E3E3E0] px-3 py-1.5 font-medium">{s.teamName}</td>
                  <td className="border border-[#E3E3E0] px-3 py-1.5 text-right">{formatKRW(s.totalBudget)}</td>
                  <td className="border border-[#E3E3E0] px-3 py-1.5 text-right">{formatKRW(s.confirmed.mentoring)}</td>
                  <td className="border border-[#E3E3E0] px-3 py-1.5 text-right">{formatKRW(s.confirmed.meeting)}</td>
                  <td className="border border-[#E3E3E0] px-3 py-1.5 text-right">{formatKRW(s.confirmed.material)}</td>
                  <td className="border border-[#E3E3E0] px-3 py-1.5 text-right">{formatKRW(s.confirmed.studentActivity)}</td>
                  <td className="border border-[#E3E3E0] px-3 py-1.5 text-right font-medium">{formatKRW(s.confirmed.total)}</td>
                  <td className={`border border-[#E3E3E0] px-3 py-1.5 text-right font-medium ${s.confirmedBalance < 0 ? 'text-red-500' : ''}`}>
                    {formatKRW(s.confirmedBalance)}
                  </td>
                  <td className={`border border-[#E3E3E0] px-3 py-1.5 text-right ${s.expectedBalance < 0 ? 'text-amber-500' : ''}`}>
                    {formatKRW(s.expectedBalance)}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="bg-[#F3F3EE] font-semibold">
                <td className="border border-[#E3E3E0] px-3 py-2">합계</td>
                <td className="border border-[#E3E3E0] px-3 py-2 text-right">{formatKRW(grandTotal.totalBudget)}</td>
                <td colSpan={4} className="border border-[#E3E3E0] px-3 py-2" />
                <td className="border border-[#E3E3E0] px-3 py-2 text-right">{formatKRW(grandTotal.confirmedTotal)}</td>
                <td className="border border-[#E3E3E0] px-3 py-2 text-right">{formatKRW(grandTotal.confirmedBalance)}</td>
                <td className="border border-[#E3E3E0] px-3 py-2 text-right">{formatKRW(grandTotal.expectedBalance)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    </>
  );
}

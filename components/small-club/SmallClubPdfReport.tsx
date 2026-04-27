'use client';

import { useRef } from 'react';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';
import { formatKRW } from '@/lib/utils';
import type { SmallClubExecution, SmallClubTeamSummary, SmallClubTeamInfo } from '@/types';
import { SMALL_CLUB_USAGE_TYPES } from '@/constants/smallclub';

function confirmedTotal(s: SmallClubTeamSummary): number {
  return s.mentoring.confirmed + s.meeting.confirmed + s.material.confirmed + s.studentActivity.confirmed;
}

const USAGE_LABELS: Record<string, keyof Omit<SmallClubTeamSummary, 'teamName' | 'totalBudget' | 'balance'>> = {
  '멘토링':        'mentoring',
  '회의비':        'meeting',
  '재료비':        'material',
  '학생활동지원비': 'studentActivity',
};

interface TeamReportProps {
  teamName: string;
  summary: SmallClubTeamSummary | undefined;
  executions: SmallClubExecution[];
  teamInfo?: SmallClubTeamInfo;
}

export function SmallClubTeamPdfReport({ teamName, summary, executions, teamInfo }: TeamReportProps) {
  const reportRef = useRef<HTMLDivElement>(null);

  async function handleDownload() {
    if (!reportRef.current) return;
    const canvas = await html2canvas(reportRef.current, { scale: 2, useCORS: true });
    const imgData = canvas.toDataURL('image/png');
    const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    const pageWidth = pdf.internal.pageSize.getWidth();
    const imgWidth  = pageWidth - 20;
    const imgHeight = (canvas.height * imgWidth) / canvas.width;
    pdf.addImage(imgData, 'PNG', 10, 10, imgWidth, imgHeight);
    pdf.save(`소학회_정산보고서_${teamName}.pdf`);
  }

  const teamExecs = executions.filter((e) => e.teamName === teamName);
  const confTotal = summary ? confirmedTotal(summary) : 0;

  return (
    <>
      <button onClick={handleDownload} className="text-xs text-primary hover:underline">
        PDF 다운로드
      </button>

      <div className="fixed left-[-9999px] top-0">
        <div ref={reportRef} className="w-[794px] bg-white p-10 font-sans text-[#131310]">
          <div className="mb-6 border-b-2 border-primary pb-3">
            <h1 className="text-xl font-bold text-primary">소학회 정산 보고서</h1>
            <p className="mt-1 text-sm text-gray-500">소학회명: {teamName}</p>
          </div>

          {teamInfo && (
            <div className="mb-6 rounded-lg border border-[#E3E3E0] p-4">
              <h2 className="mb-3 text-sm font-semibold text-[#131310]">소학회 정보</h2>
              <div className="grid grid-cols-3 gap-x-6 gap-y-2 text-sm">
                {(
                  [
                    ['지도교수', teamInfo.advisor],
                    ['팀장',     teamInfo.teamLeader],
                    ['팀원(합산)', teamInfo.teamMembers],
                  ] as [string, string][]
                )
                  .filter(([, v]) => v)
                  .map(([label, val]) => (
                    <div key={label} className="flex gap-1.5">
                      <span className="shrink-0 text-gray-500">{label}</span>
                      <span className="font-medium text-[#131310]">{val}</span>
                    </div>
                  ))}
              </div>
              {teamInfo.topic && (
                <div className="mt-2 flex gap-1.5 text-sm">
                  <span className="shrink-0 text-gray-500">주제</span>
                  <span className="font-medium text-[#131310]">{teamInfo.topic}</span>
                </div>
              )}
              {teamInfo.memberList && teamInfo.memberList.length > 0 && (
                <div className="mt-2 flex flex-wrap items-start gap-1.5 text-sm">
                  <span className="shrink-0 text-gray-500">팀원명단</span>
                  <span className="text-[#131310]">{teamInfo.memberList.join(', ')}</span>
                </div>
              )}
            </div>
          )}

          {summary && (
            <div className="mb-6 grid grid-cols-3 gap-3">
              {[
                { label: '배정 예산', value: summary.totalBudget },
                { label: '확정 합계', value: confTotal },
                { label: '잔액',      value: summary.balance },
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

          {summary && (
            <div className="mb-6">
              <h2 className="mb-2 text-sm font-semibold text-[#131310]">사용구분별 집계</h2>
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr className="bg-[#F3F3EE]">
                    <th className="border border-[#E3E3E0] px-3 py-2 text-left text-[#6F6F6B]">사용구분</th>
                    <th className="border border-[#E3E3E0] px-3 py-2 text-right text-[#6F6F6B]">기안금액</th>
                    <th className="border border-[#E3E3E0] px-3 py-2 text-right text-[#6F6F6B]">확정금액</th>
                    <th className="border border-[#E3E3E0] px-3 py-2 text-right text-[#6F6F6B]">미청구금액</th>
                  </tr>
                </thead>
                <tbody>
                  {SMALL_CLUB_USAGE_TYPES.map((u) => {
                    const key = USAGE_LABELS[u];
                    const g   = summary[key];
                    return (
                      <tr key={u}>
                        <td className="border border-[#E3E3E0] px-3 py-1.5">{u}</td>
                        <td className="border border-[#E3E3E0] px-3 py-1.5 text-right">{formatKRW(g.draft)}</td>
                        <td className="border border-[#E3E3E0] px-3 py-1.5 text-right">{formatKRW(g.confirmed)}</td>
                        <td className="border border-[#E3E3E0] px-3 py-1.5 text-right">{formatKRW(g.claimed)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          <div>
            <h2 className="mb-2 text-sm font-semibold text-[#131310]">집행내역</h2>
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="bg-[#F3F3EE]">
                  <th className="border border-[#E3E3E0] px-3 py-2 text-left text-[#6F6F6B]">사용구분</th>
                  <th className="border border-[#E3E3E0] px-3 py-2 text-left text-[#6F6F6B]">지출건명</th>
                  <th className="border border-[#E3E3E0] px-3 py-2 text-right text-[#6F6F6B]">기안금액</th>
                  <th className="border border-[#E3E3E0] px-3 py-2 text-right text-[#6F6F6B]">확정금액</th>
                  <th className="border border-[#E3E3E0] px-3 py-2 text-center text-[#6F6F6B]">청구</th>
                  <th className="border border-[#E3E3E0] px-3 py-2 text-center text-[#6F6F6B]">증빙</th>
                </tr>
              </thead>
              <tbody>
                {teamExecs.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="border border-[#E3E3E0] px-3 py-3 text-center text-gray-400">
                      집행내역 없음
                    </td>
                  </tr>
                ) : (
                  teamExecs.map((e) => (
                    <tr key={e.rowIndex}>
                      <td className="border border-[#E3E3E0] px-3 py-1.5">{e.usageType}</td>
                      <td className="border border-[#E3E3E0] px-3 py-1.5">{e.description}</td>
                      <td className="border border-[#E3E3E0] px-3 py-1.5 text-right">{formatKRW(e.draftAmount)}</td>
                      <td className="border border-[#E3E3E0] px-3 py-1.5 text-right">
                        {e.confirmedAmount > 0 ? formatKRW(e.confirmedAmount) : '—'}
                      </td>
                      <td className="border border-[#E3E3E0] px-3 py-1.5 text-center">{e.claimed ? '●' : '○'}</td>
                      <td className="border border-[#E3E3E0] px-3 py-1.5 text-center">{e.evidenceSubmitted ? '●' : '○'}</td>
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

interface AllReportProps {
  summaries: SmallClubTeamSummary[];
}

export function SmallClubAllPdfReport({ summaries }: AllReportProps) {
  const reportRef = useRef<HTMLDivElement>(null);

  async function handleDownload() {
    if (!reportRef.current) return;
    const canvas = await html2canvas(reportRef.current, { scale: 2, useCORS: true });
    const imgData = canvas.toDataURL('image/png');
    const pdf = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
    const pageWidth  = pdf.internal.pageSize.getWidth();
    const imgWidth   = pageWidth - 20;
    const imgHeight  = (canvas.height * imgWidth) / canvas.width;
    const pageHeight = pdf.internal.pageSize.getHeight() - 20;

    if (imgHeight <= pageHeight) {
      pdf.addImage(imgData, 'PNG', 10, 10, imgWidth, imgHeight);
    } else {
      let remaining = imgHeight;
      let srcY = 0;
      while (remaining > 0) {
        const sliceHeight = Math.min(pageHeight, remaining);
        const sliceCanvas = document.createElement('canvas');
        sliceCanvas.width  = canvas.width;
        sliceCanvas.height = (sliceHeight / imgHeight) * canvas.height;
        const ctx = sliceCanvas.getContext('2d')!;
        ctx.drawImage(canvas, 0, srcY * (canvas.height / imgHeight), canvas.width, sliceCanvas.height, 0, 0, sliceCanvas.width, sliceCanvas.height);
        pdf.addImage(sliceCanvas.toDataURL('image/png'), 'PNG', 10, 10, imgWidth, sliceHeight);
        remaining -= sliceHeight;
        srcY += sliceHeight;
        if (remaining > 0) pdf.addPage();
      }
    }

    pdf.save(`소학회_전체요약_${new Date().toLocaleDateString('ko-KR').replace(/\./g, '').replace(/ /g, '')}.pdf`);
  }

  const grandTotal = summaries.reduce(
    (acc, s) => ({
      totalBudget:    acc.totalBudget    + s.totalBudget,
      confirmedTotal: acc.confirmedTotal + confirmedTotal(s),
      balance:        acc.balance        + s.balance,
    }),
    { totalBudget: 0, confirmedTotal: 0, balance: 0 },
  );

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
            <h1 className="text-xl font-bold text-primary">소학회 전체 정산 요약</h1>
            <p className="mt-1 text-sm text-gray-500">출력일: {new Date().toLocaleDateString('ko-KR')}</p>
          </div>

          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="bg-[#F3F3EE]">
                <th className="border border-[#E3E3E0] px-3 py-2 text-left text-[#6F6F6B]">소학회명</th>
                <th className="border border-[#E3E3E0] px-3 py-2 text-right text-[#6F6F6B]">배정예산</th>
                {SMALL_CLUB_USAGE_TYPES.map((u) => (
                  <th key={u} className="border border-[#E3E3E0] px-3 py-2 text-right text-[#6F6F6B]">{u}(확정)</th>
                ))}
                <th className="border border-[#E3E3E0] px-3 py-2 text-right text-[#6F6F6B]">확정합계</th>
                <th className="border border-[#E3E3E0] px-3 py-2 text-right text-[#6F6F6B]">잔액</th>
              </tr>
            </thead>
            <tbody>
              {summaries.map((s) => (
                <tr key={s.teamName}>
                  <td className="border border-[#E3E3E0] px-3 py-1.5 font-medium">{s.teamName}</td>
                  <td className="border border-[#E3E3E0] px-3 py-1.5 text-right">{formatKRW(s.totalBudget)}</td>
                  <td className="border border-[#E3E3E0] px-3 py-1.5 text-right">{formatKRW(s.mentoring.confirmed)}</td>
                  <td className="border border-[#E3E3E0] px-3 py-1.5 text-right">{formatKRW(s.meeting.confirmed)}</td>
                  <td className="border border-[#E3E3E0] px-3 py-1.5 text-right">{formatKRW(s.material.confirmed)}</td>
                  <td className="border border-[#E3E3E0] px-3 py-1.5 text-right">{formatKRW(s.studentActivity.confirmed)}</td>
                  <td className="border border-[#E3E3E0] px-3 py-1.5 text-right font-medium">{formatKRW(confirmedTotal(s))}</td>
                  <td className={`border border-[#E3E3E0] px-3 py-1.5 text-right font-medium ${s.balance < 0 ? 'text-red-500' : ''}`}>
                    {formatKRW(s.balance)}
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
                <td className="border border-[#E3E3E0] px-3 py-2 text-right">{formatKRW(grandTotal.balance)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    </>
  );
}

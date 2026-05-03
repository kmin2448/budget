'use client';

import React, { useState, useRef } from 'react';
import {
  UploadCloud, CheckCircle, XCircle, Loader2,
  ChevronDown, ChevronUp, AlertCircle, Zap, ListFilter, Edit2, RefreshCw,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { CATEGORY_SHEETS } from '@/constants/sheets';
import { useSession } from 'next-auth/react';
import { useBudgetType } from '@/contexts/BudgetTypeContext';

// ── 타입 ──────────────────────────────────────────────────────────────

export interface BatchUploadResult {
  originalName: string;
  newName?: string;
  category?: string;
  status: 'success' | 'error';
  error?: string;
  fileId?: string;
  url?: string;
}

interface MatchCandidate {
  category: string;
  rowIndex: number;
  description: string;
  programName: string;
  sourceMonthIndex: number;
}

export interface FileItem {
  file: File;
  parsing: boolean;
  // 확정된 매칭 정보
  category?: string;
  matchedRowIndex?: number;
  matchedDesc?: string;
  expenseDate?: string;
  sourceMonthIndex?: number;
  fileAmount?: number;
  vendor?: string;
  // 매칭 결과
  autoMatched?: boolean;
  candidates?: MatchCandidate[];
  error?: string;
  // 덮어쓰기 매칭
  isOverwriteMatch?: boolean;
  overwrite?: boolean;
}

// 수동 매칭 UI 상태
interface ManualMatchState {
  loading: boolean;
  category: string;
  rows: { rowIndex: number; description: string; programName: string }[];
  selectedRowIndex: number;
  expenseDate: string;
}

// ── 컴포넌트 ─────────────────────────────────────────────────────────

export function InvoiceBatchUploader({
  onUploadComplete,
  onUploadSuccess,
  onResultsClear,
  currentCategory,
}: {
  onUploadComplete?: () => void;
  onUploadSuccess?: (uploadedRows: { category: string; rowIndex: number }[]) => void;
  onResultsClear?: () => void;
  currentCategory?: string;
}) {
  const { data: session } = useSession();
  const { budgetType } = useBudgetType();
  const [isOpen, setIsOpen] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [fileItems, setFileItems] = useState<FileItem[]>([]);
  const [uploading, setUploading] = useState(false);
  const [results, setResults] = useState<BatchUploadResult[]>([]);
  const [manualUI, setManualUI] = useState<Record<number, ManualMatchState>>({});
  const inputRef = useRef<HTMLInputElement>(null);

  // ── 파싱 + 매칭 API 호출 ────────────────────────────────────────────
  const fetchParsedNames = async (addedFiles: File[]) => {
    setFileItems((prev) => [...prev, ...addedFiles.map((file) => ({ file, parsing: true }))]);

    try {
      const res = await fetch('/api/drive/invoice-parse', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fileNames: addedFiles.map((f) => f.name),
          currentCategory: currentCategory || undefined,
          budgetType,
        }),
      });

      if (!res.ok) {
        const text = await res.text().catch(() => '(응답 본문 없음)');
        console.error('[invoice-parse] 서버 오류:', res.status, res.statusText, '\n', text.substring(0, 1000));
        const errMsg = `서버 오류 (${res.status}) — 개발자 도구 콘솔을 확인해 주세요`;
        setFileItems((prev) =>
          prev.map((item) => ({ ...item, parsing: false, error: errMsg })),
        );
        return;
      }

      const data = await res.json().catch((jsonErr: Error) => {
        console.error('[invoice-parse] JSON 파싱 실패:', jsonErr);
        return { error: 'JSON 파싱 에러' };
      });

      if (data.results) {
        setFileItems((prev) =>
          prev.map((item) => {
            const r = data.results.find((x: Record<string, unknown>) => x.originalName === item.file.name);
            if (!r) return { ...item, parsing: false, error: '응답 매칭 실패' };

            if (r.autoMatched && r.matched && r.status !== 'overwrite') {
              return {
                ...item,
                parsing: false,
                autoMatched: true,
                expenseDate: r.expenseDate as string | undefined,
                vendor: r.vendor as string | undefined,
                category: r.matched.category as string,
                matchedRowIndex: r.matched.rowIndex as number,
                matchedDesc: r.matched.description as string,
                sourceMonthIndex: (r.matched.sourceMonthIndex as number) ?? -1,
                fileAmount: r.fileAmount as number | undefined,
              };
            } else if (r.status === 'overwrite') {
              if (r.autoMatched && r.matched) {
                return {
                  ...item,
                  parsing: false,
                  autoMatched: true,
                  isOverwriteMatch: true,
                  overwrite: true,
                  expenseDate: r.expenseDate as string | undefined,
                  vendor: r.vendor as string | undefined,
                  category: r.matched.category as string,
                  matchedRowIndex: r.matched.rowIndex as number,
                  matchedDesc: r.matched.description as string,
                  sourceMonthIndex: (r.matched.sourceMonthIndex as number) ?? -1,
                  fileAmount: r.fileAmount as number | undefined,
                };
              } else if (Array.isArray(r.overwriteCandidates) && r.overwriteCandidates.length > 0) {
                const first = r.overwriteCandidates[0] as MatchCandidate;
                return {
                  ...item,
                  parsing: false,
                  autoMatched: false,
                  isOverwriteMatch: true,
                  overwrite: true,
                  expenseDate: r.expenseDate as string | undefined,
                  vendor: r.vendor as string | undefined,
                  fileAmount: r.fileAmount as number | undefined,
                  candidates: r.overwriteCandidates as MatchCandidate[],
                  category: first.category,
                  matchedRowIndex: first.rowIndex,
                  matchedDesc: first.description,
                  sourceMonthIndex: first.sourceMonthIndex,
                };
              }
              return { ...item, parsing: false, error: '덮어쓰기 후보 처리 오류' };
            } else if (r.status === 'candidates' && Array.isArray(r.candidates) && r.candidates.length > 0) {
              const first = r.candidates[0] as MatchCandidate;
              return {
                ...item,
                parsing: false,
                autoMatched: false,
                expenseDate: r.expenseDate as string | undefined,
                vendor: r.vendor as string | undefined,
                fileAmount: r.fileAmount as number | undefined,
                candidates: r.candidates as MatchCandidate[],
                category: first.category,
                matchedRowIndex: first.rowIndex,
                matchedDesc: first.description,
                sourceMonthIndex: first.sourceMonthIndex,
              };
            } else {
              return {
                ...item,
                parsing: false,
                autoMatched: false,
                candidates: [],
                expenseDate: r.expenseDate as string | undefined,
                vendor: r.vendor as string | undefined,
                fileAmount: r.fileAmount as number | undefined,
                error: (r.error as string) || '금액이 일치하는 항목 없음. 수동 매칭이 필요합니다.',
              };
            }
          }),
        );
      } else {
        const msg = (data.error as string) || 'API 응답 형식 오류';
        setFileItems((prev) =>
          prev.map((item) => ({ ...item, parsing: false, error: msg })),
        );
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : '네트워크 에러';
      setFileItems((prev) =>
        prev.map((item) => ({ ...item, parsing: false, error: msg })),
      );
    }
  };

  // ── 수동 매칭 ──────────────────────────────────────────────────────

  async function openManualMatch(fileIndex: number) {
    const defaultCat = currentCategory || '';
    const defaultDate = fileItems[fileIndex]?.expenseDate ?? '';
    setManualUI((prev) => ({
      ...prev,
      [fileIndex]: { loading: false, category: defaultCat, rows: [], selectedRowIndex: -1, expenseDate: defaultDate },
    }));
    if (defaultCat) {
      await fetchManualRows(fileIndex, defaultCat);
    }
  }

  function closeManualMatch(fileIndex: number) {
    setManualUI((prev) => {
      const next = { ...prev };
      delete next[fileIndex];
      return next;
    });
  }

  async function fetchManualRows(fileIndex: number, category: string) {
    setManualUI((prev) => ({
      ...prev,
      [fileIndex]: { ...prev[fileIndex], loading: true, category, rows: [], selectedRowIndex: -1 },
    }));
    try {
      const res = await fetch(`/api/sheets/expenditure-rows?category=${encodeURIComponent(category)}`);
      const data = await res.json() as { rows?: ManualMatchState['rows'] };
      const rows = data.rows ?? [];
      setManualUI((prev) => ({
        ...prev,
        [fileIndex]: {
          ...prev[fileIndex],
          loading: false,
          rows,
          selectedRowIndex: rows[0]?.rowIndex ?? -1,
        },
      }));
    } catch {
      setManualUI((prev) => ({
        ...prev,
        [fileIndex]: { ...prev[fileIndex], loading: false, rows: [] },
      }));
    }
  }

  function confirmManualMatch(fileIndex: number) {
    const ui = manualUI[fileIndex];
    if (!ui || ui.selectedRowIndex < 0 || !ui.category) return;
    const selectedRow = ui.rows.find((r) => r.rowIndex === ui.selectedRowIndex);
    if (!selectedRow) return;

    setFileItems((prev) =>
      prev.map((item, i) => {
        if (i !== fileIndex) return item;
        return {
          ...item,
          error: undefined,
          autoMatched: false,
          candidates: [],
          isOverwriteMatch: undefined,
          overwrite: undefined,
          category: ui.category,
          matchedRowIndex: ui.selectedRowIndex,
          matchedDesc: selectedRow.description || selectedRow.programName,
          expenseDate: ui.expenseDate || undefined,
          sourceMonthIndex: -1,
          fileAmount: undefined,
        };
      }),
    );
    closeManualMatch(fileIndex);
  }

  // ── 드래그 앤 드롭 / 파일 선택 ──────────────────────────────────────
  const handleDragOver  = (e: React.DragEvent) => { e.preventDefault(); setIsDragging(true); };
  const handleDragLeave = (e: React.DragEvent) => { e.preventDefault(); setIsDragging(false); };
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const pdfs = Array.from(e.dataTransfer.files).filter((f) => f.type === 'application/pdf');
    if (pdfs.length > 0) fetchParsedNames(pdfs);
  };
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const pdfs = Array.from(e.target.files ?? []).filter((f) => f.type === 'application/pdf');
    if (pdfs.length > 0) fetchParsedNames(pdfs);
    if (e.target) e.target.value = '';
  };

  const removeFile = (index: number) => {
    setFileItems((prev) => prev.filter((_, i) => i !== index));
    closeManualMatch(index);
  };

  // 후보군 드롭다운 변경 (index 기반, sourceMonthIndex 포함)
  const handleCandidateSelect = (
    fileIndex: number,
    category: string,
    rowIndex: number,
    description: string,
    sourceMonthIndex: number,
  ) => {
    setFileItems((prev) =>
      prev.map((item, i) =>
        i === fileIndex
          ? { ...item, category, matchedRowIndex: rowIndex, matchedDesc: description, sourceMonthIndex }
          : item,
      ),
    );
  };

  const handleOverwriteToggle = (fileIndex: number) => {
    setFileItems((prev) =>
      prev.map((item, i) =>
        i === fileIndex ? { ...item, overwrite: !item.overwrite } : item,
      ),
    );
  };

  // ── 업로드 (브라우저 → Drive 직접 전송, 서버는 메타데이터만 처리) ────
  const handleUpload = async () => {
    if (fileItems.length === 0) return;

    const accessToken = (session as { accessToken?: string } | null)?.accessToken;
    if (!accessToken) {
      alert('로그인 세션이 만료되었습니다. 다시 로그인해 주세요.');
      return;
    }

    setUploading(true);
    setResults([]);

    const uploadable = fileItems.filter(
      (item) =>
        !item.error &&
        item.category &&
        item.matchedRowIndex !== undefined &&
        (!item.isOverwriteMatch || item.overwrite !== false),
    );

    if (uploadable.length === 0) {
      alert('업로드할 수 있는 매칭된 파일이 없습니다.');
      setUploading(false);
      return;
    }

    const allResults: BatchUploadResult[] = [];
    const successfulRows: { category: string; rowIndex: number }[] = [];

    for (const item of uploadable) {
      try {
        // 1. 서버에서 Drive 폴더 ID 조회 (없으면 생성)
        const folderRes = await fetch(
          `/api/drive/folder-id?category=${encodeURIComponent(item.category!)}&sheetType=${budgetType}`,
        );
        if (!folderRes.ok) throw new Error('Drive 폴더 조회 실패');
        const { folderId } = await folderRes.json() as { folderId: string };

        // 2. Google Drive Resumable Upload 세션 시작
        const initRes = await fetch(
          `https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&fields=id,webViewLink`,
          {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${accessToken}`,
              'Content-Type': 'application/json',
              'X-Upload-Content-Type': 'application/pdf',
            },
            body: JSON.stringify({
              name: item.file.name,
              parents: [folderId],
              mimeType: 'application/pdf',
            }),
          },
        );
        if (!initRes.ok) throw new Error('Drive 업로드 세션 시작 실패');
        const sessionUri = initRes.headers.get('Location');
        if (!sessionUri) throw new Error('Drive 업로드 세션 URI 없음');

        // 3. 파일 본문 직접 전송 (크기 제한 없음)
        const uploadRes = await fetch(sessionUri, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/pdf' },
          body: item.file,
        });
        if (!uploadRes.ok) throw new Error(`Drive 파일 업로드 실패 (${uploadRes.status})`);
        const uploaded = await uploadRes.json() as { id?: string; webViewLink?: string };
        const fileId = uploaded.id;
        if (!fileId) throw new Error('Drive 파일 ID 없음');

        // 4. 링크 공개 읽기 권한 설정
        await fetch(
          `https://www.googleapis.com/drive/v3/files/${fileId}/permissions`,
          {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${accessToken}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ role: 'reader', type: 'anyone' }),
          },
        );

        const webViewLink =
          uploaded.webViewLink ?? `https://drive.google.com/file/d/${fileId}/view`;

        // 5. 서버에 메타데이터 저장 (Supabase + Google Sheets)
        const metaRes = await fetch('/api/drive/invoice-batch-upload', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            fileId,
            webViewLink,
            fileName: item.file.name,
            category: item.category,
            rowIndex: item.matchedRowIndex,
            expenseDate: item.expenseDate,
            sourceMonthIndex: item.sourceMonthIndex,
            fileAmount: item.fileAmount,
            budgetType,
          }),
        });
        const text = await metaRes.text();
        let data: { results?: BatchUploadResult[]; error?: string };
        try { data = JSON.parse(text) as typeof data; }
        catch { data = { error: `서버 응답 오류 (${metaRes.status})` }; }

        if (metaRes.ok && data.results) {
          allResults.push(...data.results);
          successfulRows.push({ category: item.category!, rowIndex: item.matchedRowIndex! });
        } else {
          allResults.push({
            originalName: item.file.name,
            status: 'error',
            error: data.error ?? `메타데이터 저장 실패 (${metaRes.status})`,
          });
        }
      } catch (err) {
        allResults.push({
          originalName: item.file.name,
          status: 'error',
          error: err instanceof Error ? err.message : '업로드 오류',
        });
      }
    }

    setResults(allResults);
    if (onUploadComplete) onUploadComplete();
    if (successfulRows.length > 0) onUploadSuccess?.(successfulRows);
    setFileItems((prev) => prev.filter((item) => !!item.error));
    setUploading(false);
  };

  const hasUploadable = fileItems.some(
    (f) =>
      !f.parsing &&
      !f.error &&
      f.category &&
      f.matchedRowIndex !== undefined &&
      (!f.isOverwriteMatch || f.overwrite !== false),
  );

  // ── 수동 매칭 UI 렌더 ────────────────────────────────────────────────
  function renderManualMatchUI(fileIndex: number) {
    const ui = manualUI[fileIndex];
    if (!ui) return null;

    return (
      <div
        className="mt-2 space-y-2 rounded border border-gray-200 bg-white p-2 text-xs"
        onClick={(e) => e.stopPropagation()}
      >
        <p className="font-medium text-gray-700">수동 매칭 — 비목과 지출 행을 직접 선택하세요</p>

        <select
          value={ui.category}
          onChange={(e) => fetchManualRows(fileIndex, e.target.value)}
          className="w-full rounded border border-gray-200 p-1 text-xs outline-none focus:ring-1 focus:ring-primary"
        >
          <option value="">비목 선택</option>
          {CATEGORY_SHEETS.map((cat) => (
            <option key={cat} value={cat}>{cat}</option>
          ))}
        </select>

        {ui.loading ? (
          <div className="flex items-center gap-1 text-gray-400">
            <Loader2 className="h-3 w-3 animate-spin" />
            <span>행 목록 불러오는 중…</span>
          </div>
        ) : ui.rows.length > 0 ? (
          <select
            value={ui.selectedRowIndex}
            onChange={(e) =>
              setManualUI((prev) => ({
                ...prev,
                [fileIndex]: { ...prev[fileIndex], selectedRowIndex: Number(e.target.value) },
              }))
            }
            className="w-full rounded border border-gray-200 p-1 text-xs outline-none focus:ring-1 focus:ring-primary"
          >
            {ui.rows.map((row) => (
              <option key={row.rowIndex} value={row.rowIndex}>
                {row.programName ? `[${row.programName}] ` : ''}{row.description} (행 {row.rowIndex})
              </option>
            ))}
          </select>
        ) : ui.category ? (
          <span className="text-gray-400">청구서 미연결 행이 없습니다.</span>
        ) : null}

        <div className="space-y-0.5">
          <label className="text-xs text-gray-500">집행일자 (yymmdd)</label>
          <input
            type="text"
            placeholder="예: 260415"
            maxLength={6}
            value={ui.expenseDate}
            onChange={(e) =>
              setManualUI((prev) => ({
                ...prev,
                [fileIndex]: { ...prev[fileIndex], expenseDate: e.target.value.replace(/\D/g, '') },
              }))
            }
            className="w-full rounded border border-gray-200 p-1 text-xs outline-none focus:ring-1 focus:ring-primary"
          />
        </div>

        <div className="flex justify-end gap-1">
          <button
            onClick={() => closeManualMatch(fileIndex)}
            className="rounded border border-gray-200 px-2 py-1 text-xs text-gray-500 hover:bg-gray-50"
          >
            취소
          </button>
          <button
            onClick={() => confirmManualMatch(fileIndex)}
            disabled={ui.selectedRowIndex < 0 || !ui.category}
            className="rounded bg-primary px-2 py-1 text-xs text-white hover:bg-primary-light disabled:opacity-40"
          >
            매칭 확정
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-[2px] border shadow-sm overflow-hidden">
      {/* 헤더 */}
      <div
        className="flex items-center justify-between p-4 cursor-pointer hover:bg-gray-50 transition-colors"
        onClick={() => setIsOpen(!isOpen)}
      >
        <div className="flex items-baseline gap-2">
          <h2 className="text-sm font-semibold text-gray-900 flex items-center gap-1.5">
            <span className="text-primary shrink-0">■</span>
            다중 청구서 매칭 및 업로드
          </h2>
          <span className="text-xs text-gray-400 whitespace-nowrap">
            파일명 분석으로 집행 건과 금액 매칭합니다. 형식: (yymmdd)건명_집행처_(금액).pdf
          </span>
        </div>
        {isOpen ? <ChevronUp className="h-5 w-5 text-gray-500" /> : <ChevronDown className="h-5 w-5 text-gray-500" />}
      </div>

      {isOpen && (
        <div className="p-5 border-t space-y-4">
          {/* 드롭존 */}
          <div
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            onClick={() => inputRef.current?.click()}
            className={`border-2 border-dashed rounded-lg p-6 flex flex-col items-center justify-center cursor-pointer transition-colors ${
              isDragging ? 'border-primary bg-primary/5' : 'border-gray-300 hover:bg-gray-50'
            }`}
          >
            <UploadCloud className="h-8 w-8 text-gray-400 mb-2" />
            <p className="text-sm font-medium text-gray-700">클릭하거나 PDF 파일을 이곳으로 드래그</p>
            <p className="text-xs text-gray-500 mt-1">파일명: (yymmdd)건명_집행처_(금액).pdf — 금액 기준 자동 매칭</p>
            <input
              type="file" multiple accept="application/pdf" ref={inputRef}
              className="hidden" onChange={handleFileChange} value=""
            />
          </div>
          <div className="flex justify-end">
            <a
              href="https://drive.google.com/file/d/1I3H3_N_kt2vBIPXu_YVkaQkQ-OKXXawh/view?usp=drive_link"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 text-xs text-gray-400 hover:text-primary transition-colors"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" />
              </svg>
              청구서정리프로그램 다운받기
            </a>
          </div>

          {/* 파일 목록 */}
          {fileItems.length > 0 && (
            <div className="space-y-2">
              <ul className="max-h-[32rem] overflow-y-auto space-y-2 pr-1">
                {fileItems.map((item, i) => {
                  const isManualOpen = !!manualUI[i];
                  const isOverwriteItem = !!item.isOverwriteMatch;
                  const hasMultipleCandidates = !item.error && !item.autoMatched && item.candidates && item.candidates.length > 0 && !isOverwriteItem;
                  const hasMultipleOverwriteCandidates = !item.error && !item.autoMatched && item.candidates && item.candidates.length > 0 && isOverwriteItem;
                  const isManuallyMatched = !item.error && !item.autoMatched && item.category && item.matchedRowIndex !== undefined && !hasMultipleCandidates && !hasMultipleOverwriteCandidates && !isOverwriteItem;

                  return (
                    <li
                      key={i}
                      className={`flex items-start justify-between px-3 py-2.5 rounded border text-sm ${
                        item.parsing
                          ? 'bg-gray-50 border-gray-200'
                          : item.error
                          ? 'bg-red-50 border-red-200'
                          : isOverwriteItem
                          ? (item.overwrite !== false ? 'bg-orange-50 border-orange-300' : 'bg-gray-100 border-gray-300')
                          : item.autoMatched
                          ? 'bg-green-50 border-green-200'
                          : isManuallyMatched
                          ? 'bg-blue-50 border-blue-200'
                          : 'bg-amber-50 border-amber-200'
                      }`}
                    >
                      <div className="flex flex-col min-w-0 flex-1 pr-3">
                        {/* 파일명 */}
                        <div className="flex items-center gap-1.5 font-medium text-gray-800">
                          {item.parsing ? (
                            <Loader2 className="w-4 h-4 animate-spin text-gray-400 shrink-0" />
                          ) : item.error ? (
                            <AlertCircle className="w-4 h-4 text-red-500 shrink-0" />
                          ) : isOverwriteItem ? (
                            <RefreshCw className={`w-4 h-4 shrink-0 ${item.overwrite !== false ? 'text-orange-500' : 'text-gray-400'}`} />
                          ) : item.autoMatched ? (
                            <Zap className="w-4 h-4 text-green-600 shrink-0" />
                          ) : isManuallyMatched ? (
                            <Edit2 className="w-4 h-4 text-blue-600 shrink-0" />
                          ) : (
                            <ListFilter className="w-4 h-4 text-amber-600 shrink-0" />
                          )}
                          <span className="truncate text-xs" title={item.file.name}>{item.file.name}</span>
                        </div>

                        {/* 파싱 중 */}
                        {item.parsing && (
                          <span className="text-xs text-gray-500 mt-1 pl-5">시트에서 매칭 중…</span>
                        )}

                        {/* 오류 + 수동 매칭 */}
                        {!item.parsing && item.error && (
                          <div className="mt-1 pl-5 space-y-1">
                            <span className="text-xs text-red-600">{item.error}</span>
                            {item.vendor && (
                              <p className="text-xs text-gray-500">집행처(파일명): {item.vendor}</p>
                            )}
                            {!isManualOpen ? (
                              <button
                                type="button"
                                onClick={(e) => { e.stopPropagation(); openManualMatch(i); }}
                                className="flex items-center gap-1 text-xs text-primary hover:underline"
                              >
                                <Edit2 className="h-3 w-3" />
                                수동 매칭
                              </button>
                            ) : (
                              renderManualMatchUI(i)
                            )}
                          </div>
                        )}

                        {/* 자동 매칭 성공 */}
                        {!item.parsing && !item.error && item.autoMatched && !isOverwriteItem && (
                          <div className="mt-1 pl-5 text-xs space-y-0.5">
                            <span className="inline-block bg-green-100 text-green-800 rounded px-1.5 py-0.5 font-medium">
                              ⚡ 금액 자동 매칭
                            </span>
                            <p className="text-gray-600">
                              <span className="font-semibold text-gray-800">[{item.category}]</span>{' '}
                              {item.matchedDesc}{' '}
                              <span className="text-gray-400">(행 {item.matchedRowIndex})</span>
                            </p>
                            {item.expenseDate && (
                              <p className="text-blue-600">집행일자: {item.expenseDate}</p>
                            )}
                            {item.vendor && (
                              <p className="text-gray-500">집행처(파일명): {item.vendor}</p>
                            )}
                            {!isManualOpen && (
                              <button
                                type="button"
                                onClick={(e) => { e.stopPropagation(); openManualMatch(i); }}
                                className="flex items-center gap-1 text-xs text-gray-400 hover:text-primary hover:underline"
                              >
                                <Edit2 className="h-3 w-3" />
                                수동으로 변경
                              </button>
                            )}
                            {isManualOpen && renderManualMatchUI(i)}
                          </div>
                        )}

                        {/* 수동 확정 완료 */}
                        {!item.parsing && !item.error && isManuallyMatched && (
                          <div className="mt-1 pl-5 text-xs space-y-0.5">
                            <span className="inline-block bg-blue-100 text-blue-800 rounded px-1.5 py-0.5 font-medium">
                              ✏️ 수동 매칭 완료
                            </span>
                            <p className="text-gray-600">
                              <span className="font-semibold text-gray-800">[{item.category}]</span>{' '}
                              {item.matchedDesc}{' '}
                              <span className="text-gray-400">(행 {item.matchedRowIndex})</span>
                            </p>
                            {item.expenseDate && (
                              <p className="text-blue-600">집행일자: {item.expenseDate}</p>
                            )}
                            {!isManualOpen && (
                              <button
                                type="button"
                                onClick={(e) => { e.stopPropagation(); openManualMatch(i); }}
                                className="flex items-center gap-1 text-xs text-gray-400 hover:text-primary hover:underline"
                              >
                                <Edit2 className="h-3 w-3" />
                                다시 선택
                              </button>
                            )}
                            {isManualOpen && renderManualMatchUI(i)}
                          </div>
                        )}

                        {/* 덮어쓰기 자동 매칭 */}
                        {!item.parsing && !item.error && isOverwriteItem && item.autoMatched && (
                          <div className="mt-1 pl-5 text-xs space-y-1">
                            <div className="flex items-center gap-2">
                              <span className="inline-block bg-orange-100 text-orange-800 rounded px-1.5 py-0.5 font-medium">
                                🔄 덮어쓰기 매칭
                              </span>
                              <label className="flex items-center gap-1 cursor-pointer select-none">
                                <input
                                  type="checkbox"
                                  checked={item.overwrite !== false}
                                  onChange={() => handleOverwriteToggle(i)}
                                  className="accent-orange-500"
                                />
                                <span className={item.overwrite !== false ? 'text-orange-700 font-medium' : 'text-gray-400'}>
                                  덮어쓰기
                                </span>
                              </label>
                            </div>
                            <p className="text-gray-500">이미 청구서가 연결된 건입니다. 새 파일로 교체됩니다.</p>
                            <p className="text-gray-600">
                              <span className="font-semibold text-gray-800">[{item.category}]</span>{' '}
                              {item.matchedDesc}{' '}
                              <span className="text-gray-400">(행 {item.matchedRowIndex})</span>
                            </p>
                            {item.expenseDate && (
                              <p className="text-blue-600">집행일자: {item.expenseDate}</p>
                            )}
                            {item.vendor && (
                              <p className="text-gray-500">집행처(파일명): {item.vendor}</p>
                            )}
                            {!isManualOpen && (
                              <button
                                type="button"
                                onClick={(e) => { e.stopPropagation(); openManualMatch(i); }}
                                className="flex items-center gap-1 text-xs text-gray-400 hover:text-primary hover:underline"
                              >
                                <Edit2 className="h-3 w-3" />
                                수동으로 변경
                              </button>
                            )}
                            {isManualOpen && renderManualMatchUI(i)}
                          </div>
                        )}

                        {/* 덮어쓰기 후보 선택 (여러 건) */}
                        {!item.parsing && !item.error && hasMultipleOverwriteCandidates && (
                          <div className="mt-1 pl-5 text-xs space-y-1">
                            <div className="flex items-center gap-2">
                              <span className="inline-block bg-orange-100 text-orange-800 rounded px-1.5 py-0.5 font-medium">
                                🔄 덮어쓰기 후보 — 해당 건을 선택하세요
                              </span>
                              <label className="flex items-center gap-1 cursor-pointer select-none">
                                <input
                                  type="checkbox"
                                  checked={item.overwrite !== false}
                                  onChange={() => handleOverwriteToggle(i)}
                                  className="accent-orange-500"
                                />
                                <span className={item.overwrite !== false ? 'text-orange-700 font-medium' : 'text-gray-400'}>
                                  덮어쓰기
                                </span>
                              </label>
                            </div>
                            <p className="text-gray-500">이미 청구서가 연결된 건입니다. 새 파일로 교체됩니다.</p>
                            {item.expenseDate && (
                              <p className="text-blue-600">집행일자: {item.expenseDate}</p>
                            )}
                            {item.vendor && (
                              <p className="text-gray-500">집행처(파일명): {item.vendor}</p>
                            )}
                            <select
                              className="w-full border border-orange-300 p-1.5 rounded bg-white text-gray-800 text-xs focus:ring-2 focus:ring-orange-400 outline-none"
                              value={String(
                                Math.max(
                                  0,
                                  item.candidates!.findIndex(
                                    (c) => c.rowIndex === item.matchedRowIndex && c.category === item.category,
                                  ),
                                ),
                              )}
                              onChange={(e) => {
                                const idx = Number(e.target.value);
                                const c = item.candidates![idx];
                                handleCandidateSelect(i, c.category, c.rowIndex, c.description, c.sourceMonthIndex);
                              }}
                            >
                              {item.candidates!.map((c, ci) => (
                                <option key={`${c.category}-${c.rowIndex}`} value={String(ci)}>
                                  [{c.category}]{c.programName ? ` [${c.programName}]` : ''} {c.description} (행 {c.rowIndex})
                                </option>
                              ))}
                            </select>
                            {!isManualOpen ? (
                              <button
                                type="button"
                                onClick={(e) => { e.stopPropagation(); openManualMatch(i); }}
                                className="flex items-center gap-1 text-xs text-gray-400 hover:text-primary hover:underline"
                              >
                                <Edit2 className="h-3 w-3" />
                                목록에 없으면 수동 매칭
                              </button>
                            ) : (
                              renderManualMatchUI(i)
                            )}
                          </div>
                        )}

                        {/* 후보군 선택 (금액 일치 건이 여러 개) */}
                        {!item.parsing && !item.error && hasMultipleCandidates && (
                          <div className="mt-1 pl-5 text-xs space-y-1">
                            <span className="inline-block bg-amber-100 text-amber-800 rounded px-1.5 py-0.5 font-medium">
                              금액 일치 건이 여러 개입니다 — 해당 건을 선택하세요
                            </span>
                            {item.expenseDate && (
                              <p className="text-blue-600">집행일자: {item.expenseDate}</p>
                            )}
                            {item.vendor && (
                              <p className="text-gray-500">집행처(파일명): {item.vendor}</p>
                            )}
                            <select
                              className="w-full border border-amber-300 p-1.5 rounded bg-white text-gray-800 text-xs focus:ring-2 focus:ring-amber-400 outline-none"
                              value={String(
                                Math.max(
                                  0,
                                  item.candidates!.findIndex(
                                    (c) => c.rowIndex === item.matchedRowIndex && c.category === item.category,
                                  ),
                                ),
                              )}
                              onChange={(e) => {
                                const idx = Number(e.target.value);
                                const c = item.candidates![idx];
                                handleCandidateSelect(i, c.category, c.rowIndex, c.description, c.sourceMonthIndex);
                              }}
                            >
                              {item.candidates!.map((c, ci) => (
                                <option key={`${c.category}-${c.rowIndex}`} value={String(ci)}>
                                  [{c.category}]{c.programName ? ` [${c.programName}]` : ''} {c.description} (행 {c.rowIndex})
                                </option>
                              ))}
                            </select>
                            {!isManualOpen ? (
                              <button
                                type="button"
                                onClick={(e) => { e.stopPropagation(); openManualMatch(i); }}
                                className="flex items-center gap-1 text-xs text-gray-400 hover:text-primary hover:underline"
                              >
                                <Edit2 className="h-3 w-3" />
                                목록에 없으면 수동 매칭
                              </button>
                            ) : (
                              renderManualMatchUI(i)
                            )}
                          </div>
                        )}
                      </div>

                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); removeFile(i); }}
                        className="text-gray-400 hover:text-red-600 p-1 rounded shrink-0"
                      >
                        ✕
                      </button>
                    </li>
                  );
                })}
              </ul>

              <div className="flex justify-end pt-2">
                <Button
                  onClick={handleUpload}
                  disabled={uploading || fileItems.some((f) => f.parsing) || !hasUploadable}
                >
                  {uploading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  {uploading ? '업로드 중…' : '매칭된 파일 모두 업로드'}
                </Button>
              </div>
            </div>
          )}

          {/* 업로드 결과 */}
          {results.length > 0 && (
            <div className="mt-4 border-t pt-4">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-sm font-semibold">업로드 결과</h3>
                <button
                  type="button"
                  onClick={() => { setResults([]); onResultsClear?.(); }}
                  className="text-xs text-gray-400 hover:text-red-500 transition-colors"
                >
                  지우기
                </button>
              </div>
              <ul className="space-y-2 max-h-60 overflow-y-auto">
                {results.map((res, i) => (
                  <li
                    key={i}
                    className={`flex flex-col gap-1 p-3 rounded-lg border text-sm ${
                      res.status === 'success'
                        ? 'bg-green-50 border-green-200'
                        : 'bg-red-50 border-red-200'
                    }`}
                  >
                    <div className="flex items-start justify-between">
                      <div className="font-medium truncate max-w-[85%]">{res.newName || res.originalName}</div>
                      {res.status === 'success' ? (
                        <CheckCircle className="h-4 w-4 text-green-600 shrink-0" />
                      ) : (
                        <XCircle className="h-4 w-4 text-red-600 shrink-0" />
                      )}
                    </div>
                    {res.status === 'success' && (
                      <div className="text-xs text-gray-600 mt-1 space-y-0.5">
                        <p><span className="font-semibold">저장 위치:</span> {res.category}</p>
                        <p>
                          <span className="font-semibold">링크:</span>{' '}
                          <a href={res.url} target="_blank" rel="noreferrer" className="text-blue-600 hover:underline">
                            드라이브로 열기
                          </a>
                        </p>
                      </div>
                    )}
                    {res.status === 'error' && (
                      <div className="text-xs text-red-600 mt-1">{res.error}</div>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

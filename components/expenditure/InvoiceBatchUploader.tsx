'use client';

import React, { useState, useRef } from 'react';
import {
  UploadCloud, CheckCircle, XCircle, Loader2,
  ChevronDown, ChevronUp, AlertCircle, Zap, ListFilter, Edit2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { CATEGORY_SHEETS } from '@/constants/sheets';

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
  score: number;
}

export interface FileItem {
  file: File;
  parsing: boolean;
  // 확정된 매칭 정보 (자동 or 수동 선택 후)
  category?: string;
  matchedRowIndex?: number;
  matchedDesc?: string;
  expenseDate?: string;
  sourceMonthIndex?: number; // 금액이 현재 위치한 월 인덱스 (I~T열, 0=3월)
  fileAmount?: number;       // 매칭된 금액
  // 매칭 결과
  autoMatched?: boolean;         // true: 금액 일치 자동 매칭
  candidates?: MatchCandidate[]; // false: 후보군 선택 필요
  error?: string;
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
  currentCategory,
}: {
  onUploadComplete?: () => void;
  currentCategory?: string;
}) {
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

    const formData = new FormData();
    addedFiles.forEach((f) => formData.append('files', f));
    if (currentCategory) formData.append('currentCategory', currentCategory);

    try {
      const res = await fetch('/api/drive/invoice-parse', { method: 'POST', body: formData });
      const data = await res.json().catch(() => ({ error: 'JSON 파싱 에러' }));

      if (res.ok && data.results) {
        setFileItems((prev) =>
          prev.map((item) => {
            const r = data.results.find((x: Record<string, unknown>) => x.originalName === item.file.name);
            if (!r) return { ...item, parsing: false, error: '응답 매칭 실패' };

            if (r.autoMatched && r.matched) {
              return {
                ...item,
                parsing: false,
                autoMatched: true,
                expenseDate: r.expenseDate,
                category: r.matched.category,
                matchedRowIndex: r.matched.rowIndex,
                matchedDesc: r.matched.description,
                sourceMonthIndex: r.matched.sourceMonthIndex ?? -1,
                fileAmount: r.fileAmount,
              };
            } else if (r.status === 'candidates' && Array.isArray(r.candidates) && r.candidates.length > 0) {
              const first = r.candidates[0] as MatchCandidate;
              return {
                ...item,
                parsing: false,
                autoMatched: false,
                expenseDate: r.expenseDate,
                candidates: r.candidates as MatchCandidate[],
                category: first.category,
                matchedRowIndex: first.rowIndex,
                matchedDesc: first.description,
              };
            } else {
              return {
                ...item,
                parsing: false,
                autoMatched: false,
                candidates: [],
                error: r.error || '금액이 일치하는 항목 없음. 수동 매칭이 필요합니다.',
              };
            }
          }),
        );
      } else {
        const msg = data.error || `서버 에러 (${res.status})`;
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
    // 파일에서 파싱된 집행일자를 기본값으로 사용
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
      const data = await res.json();
      const rows: ManualMatchState['rows'] = data.rows ?? [];
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

  // 후보군 드롭다운 변경
  const handleCandidateSelect = (
    index: number, category: string, rowIndex: number, description: string,
  ) => {
    setFileItems((prev) =>
      prev.map((item, i) =>
        i === index ? { ...item, category, matchedRowIndex: rowIndex, matchedDesc: description } : item,
      ),
    );
  };

  // ── 업로드 ──────────────────────────────────────────────────────────
  const handleUpload = async () => {
    if (fileItems.length === 0) return;
    setUploading(true);
    setResults([]);

    const formData = new FormData();
    const payloadInfo: Record<string, { category: string; rowIndex: number; expenseDate?: string; sourceMonthIndex?: number; fileAmount?: number }> = {};
    let validCount = 0;

    fileItems.forEach((item) => {
      if (!item.error && item.category && item.matchedRowIndex !== undefined) {
        formData.append('files', item.file);
        payloadInfo[item.file.name] = {
          category: item.category,
          rowIndex: item.matchedRowIndex,
          expenseDate: item.expenseDate,
          sourceMonthIndex: item.sourceMonthIndex,
          fileAmount: item.fileAmount,
        };
        validCount++;
      }
    });

    if (validCount === 0) {
      alert('업로드할 수 있는 매칭된 파일이 없습니다.');
      setUploading(false);
      return;
    }

    formData.append('payload', JSON.stringify(payloadInfo));

    try {
      const res = await fetch('/api/drive/invoice-batch-upload', { method: 'POST', body: formData });
      const data = await res.json();
      if (res.ok) {
        setResults(data.results ?? []);
        if (onUploadComplete) onUploadComplete();
        setFileItems((prev) => prev.filter((item) => !!item.error));
      } else {
        alert(`업로드 실패: ${data.error}`);
      }
    } catch {
      alert('일괄 업로드 중 오류가 발생했습니다.');
    } finally {
      setUploading(false);
    }
  };

  // ── 파일 아이템 상태 분류 ────────────────────────────────────────────
  const hasUploadable = fileItems.some((f) => !f.parsing && !f.error && f.category && f.matchedRowIndex !== undefined);

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

        {/* 비목 선택 */}
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

        {/* 행 선택 */}
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
          <span className="text-gray-400">해당 비목에 행이 없습니다.</span>
        ) : null}

        {/* 집행일자 (선택) */}
        <div className="space-y-0.5">
          <label className="text-xs text-gray-500">집행일자 (yymmdd, 수정 가능)</label>
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

        {/* 확인 / 취소 */}
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
    <div className="bg-white rounded-lg border shadow-sm overflow-hidden">
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
          <span className="text-xs text-gray-400 whitespace-nowrap">PDF를 올리면 집행금액 기준으로 시트 행에 자동 연결합니다. 금액 불일치 시 후보군에서 직접 선택합니다.</span>
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
            <p className="text-xs text-gray-500 mt-1">파일명 형식 무관 — 내용에서 자동 파싱 후 금액 매칭</p>
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
                  const isManuallyMatched = !item.error && !item.autoMatched && item.category && item.matchedRowIndex !== undefined && (!item.candidates || item.candidates.length === 0);

                  return (
                    <li
                      key={i}
                      className={`flex items-start justify-between px-3 py-2.5 rounded border text-sm ${
                        item.parsing
                          ? 'bg-gray-50 border-gray-200'
                          : item.error
                          ? 'bg-red-50 border-red-200'
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

                        {/* 오류 + 수동 매칭 버튼 */}
                        {!item.parsing && item.error && (
                          <div className="mt-1 pl-5 space-y-1">
                            <span className="text-xs text-red-600">{item.error}</span>
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
                        {!item.parsing && !item.error && item.autoMatched && (
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
                            {/* 자동 매칭도 수동 재매칭 가능 */}
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

                        {/* 후보군 선택 (금액 불일치) */}
                        {!item.parsing && !item.error && !item.autoMatched && item.candidates && item.candidates.length > 0 && (
                          <div className="mt-1 pl-5 text-xs space-y-1">
                            <span className="inline-block bg-amber-100 text-amber-800 rounded px-1.5 py-0.5 font-medium">
                              금액 불일치 — 항목을 직접 선택하세요
                            </span>
                            {item.expenseDate && (
                              <p className="text-blue-600">집행일자: {item.expenseDate}</p>
                            )}
                            <select
                              className="w-full border border-amber-300 p-1.5 rounded bg-white text-gray-800 text-xs focus:ring-2 focus:ring-amber-400 outline-none"
                              value={`${item.category}|${item.matchedRowIndex}|${item.matchedDesc}`}
                              onChange={(e) => {
                                const [c, r, d] = e.target.value.split('|');
                                handleCandidateSelect(i, c, Number(r), d);
                              }}
                            >
                              {item.candidates.map((c) => (
                                <option
                                  key={`${c.category}-${c.rowIndex}`}
                                  value={`${c.category}|${c.rowIndex}|${c.description}`}
                                >
                                  [{c.category}] {c.description} (행 {c.rowIndex}, 유사도 {c.score}%)
                                </option>
                              ))}
                            </select>
                            {/* 후보군에 없는 경우 수동 매칭으로 전환 */}
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
              <h3 className="text-sm font-semibold mb-2">업로드 결과</h3>
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

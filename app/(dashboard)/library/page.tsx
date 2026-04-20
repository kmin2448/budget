'use client';

import { useState, useRef, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { Button } from '@/components/ui/button';
import { Upload, Download, Eye, Trash2, RefreshCw, FileText, X, File, Search } from 'lucide-react';
import { useLibraryFiles, useUploadLibraryFile, useDeleteLibraryFile } from '@/hooks/useLibrary';
import { ConfirmDialog } from '@/components/shared/ConfirmDialog';
import { cn } from '@/lib/utils';
import type { LibraryFile } from '@/types';

function formatFileSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('ko-KR', { year: 'numeric', month: '2-digit', day: '2-digit' });
}

function getFileIcon(mimeType: string) {
  if (mimeType === 'application/pdf') return '📄';
  if (mimeType.includes('word')) return '📝';
  if (mimeType.includes('sheet') || mimeType.includes('excel')) return '📊';
  if (mimeType.includes('presentation') || mimeType.includes('powerpoint')) return '📋';
  if (mimeType.startsWith('image/')) return '🖼️';
  return '📎';
}

function isPdf(mimeType: string) {
  return mimeType === 'application/pdf';
}

// ── 업로드 모달 ──────────────────────────────────────────────────────
interface UploadModalProps {
  open: boolean;
  onClose: () => void;
}

function UploadModal({ open, onClose }: UploadModalProps) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const upload = useUploadLibraryFile();

  function reset() {
    setTitle('');
    setDescription('');
    setFile(null);
    setIsDragging(false);
  }

  function handleClose() {
    reset();
    onClose();
  }

  function applyFile(f: File) {
    setFile(f);
    if (!title) setTitle(f.name.replace(/\.[^.]+$/, ''));
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0] ?? null;
    if (f) applyFile(f);
  }

  function handleDragOver(e: React.DragEvent) {
    e.preventDefault();
    setIsDragging(true);
  }

  function handleDragLeave(e: React.DragEvent) {
    if (!e.currentTarget.contains(e.relatedTarget as Node)) {
      setIsDragging(false);
    }
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setIsDragging(false);
    const f = e.dataTransfer.files[0];
    if (f) applyFile(f);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!file || !title.trim()) return;

    const formData = new FormData();
    formData.append('file', file);
    formData.append('title', title.trim());
    if (description.trim()) formData.append('description', description.trim());

    try {
      await upload.mutateAsync(formData);
      handleClose();
    } catch (err) {
      alert(err instanceof Error ? err.message : '업로드 중 오류가 발생했습니다.');
    }
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="w-full max-w-md rounded-xl border border-[#E3E3E0] bg-white shadow-xl mx-4">
        <div className="flex items-center justify-between border-b border-[#E3E3E0] px-5 py-4">
          <h2 className="text-base font-semibold text-[#131310]">자료 업로드</h2>
          <button onClick={handleClose} className="rounded p-1 text-text-secondary hover:bg-[#F3F3EE]">
            <X className="h-4 w-4" />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4 p-5">
          {/* 파일 선택 */}
          <div>
            <label className="mb-1.5 block text-xs font-medium text-text-secondary">파일 *</label>
            <div
              className={cn(
                'flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed p-6 transition-colors',
                isDragging
                  ? 'border-primary bg-primary-bg/40 scale-[1.01]'
                  : file
                  ? 'border-primary bg-primary-bg/20'
                  : 'border-[#E3E3E0] hover:border-primary/50',
              )}
              onClick={() => fileInputRef.current?.click()}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
            >
              <input
                ref={fileInputRef}
                type="file"
                className="hidden"
                onChange={handleFileChange}
              />
              {file ? (
                <div className="text-center">
                  <div className="text-2xl mb-1">{getFileIcon(file.type)}</div>
                  <p className="text-sm font-medium text-[#131310]">{file.name}</p>
                  <p className="text-xs text-text-secondary mt-0.5">{formatFileSize(file.size)}</p>
                </div>
              ) : isDragging ? (
                <div className="text-center pointer-events-none">
                  <Upload className="mx-auto mb-2 h-8 w-8 text-primary" />
                  <p className="text-sm font-medium text-primary">여기에 놓으세요</p>
                </div>
              ) : (
                <div className="text-center">
                  <File className="mx-auto mb-2 h-8 w-8 text-text-secondary" />
                  <p className="text-sm text-text-secondary">클릭하거나 파일을 드래그하세요</p>
                  <p className="text-xs text-text-secondary mt-0.5">PDF, Word, Excel, 이미지 등</p>
                </div>
              )}
            </div>
          </div>

          {/* 제목 */}
          <div>
            <label className="mb-1.5 block text-xs font-medium text-text-secondary">제목 *</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="자료 제목을 입력하세요"
              className="w-full rounded border border-[#E3E3E0] px-3 py-2 text-sm text-[#131310] outline-none focus:border-primary focus:ring-1 focus:ring-primary/30"
              required
            />
          </div>

          {/* 설명 */}
          <div>
            <label className="mb-1.5 block text-xs font-medium text-text-secondary">설명 (선택)</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="자료에 대한 간단한 설명을 입력하세요"
              rows={2}
              className="w-full rounded border border-[#E3E3E0] px-3 py-2 text-sm text-[#131310] outline-none focus:border-primary focus:ring-1 focus:ring-primary/30 resize-none"
            />
          </div>

          <div className="flex justify-end gap-2 pt-1">
            <Button type="button" variant="outline" size="sm" onClick={handleClose}
              className="border-[#E3E3E0] text-text-secondary hover:bg-[#F3F3EE]">
              취소
            </Button>
            <Button type="submit" size="sm" disabled={!file || !title.trim() || upload.isPending}
              className="bg-primary text-white hover:bg-primary-light gap-1.5">
              <Upload className="h-3.5 w-3.5" />
              {upload.isPending ? '업로드 중...' : '업로드'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── 리사이즈 방향 정의 ──────────────────────────────────────────────
type ResizeDir = 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw';
const RESIZE_COEFFS: Record<ResizeDir, { wX: number; wY: number }> = {
  e:  { wX:  1, wY:  0 }, w:  { wX: -1, wY:  0 },
  s:  { wX:  0, wY:  1 }, n:  { wX:  0, wY: -1 },
  ne: { wX:  1, wY: -1 }, nw: { wX: -1, wY: -1 },
  se: { wX:  1, wY:  1 }, sw: { wX: -1, wY:  1 },
};
const RESIZE_CURSORS: Record<ResizeDir, string> = {
  n: 'n-resize', s: 's-resize', e: 'e-resize', w: 'w-resize',
  ne: 'ne-resize', nw: 'nw-resize', se: 'se-resize', sw: 'sw-resize',
};
const MIN_W = 400;
const MIN_H = 300;

// ── 미리보기 모달 ────────────────────────────────────────────────────
interface PreviewModalProps {
  file: LibraryFile | null;
  onClose: () => void;
}

function PreviewModal({ file, onClose }: PreviewModalProps) {
  const [searchInput, setSearchInput] = useState('');
  const [appliedSearch, setAppliedSearch] = useState('');
  const searchInputRef = useRef<HTMLInputElement>(null);

  // ── 위치 & 크기 ──
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);

  // 초기 크기를 마운트 시점에 픽셀로 설정
  useEffect(() => {
    setSize({
      w: Math.min(Math.round(window.innerWidth * 0.9), 1024),
      h: Math.round(window.innerHeight * 0.9),
    });
  }, []);

  // ── 드래그 / 리사이즈 통합 interaction ref ──
  const ia = useRef<{
    type: 'drag' | 'resize';
    mx: number; my: number;
    px: number; py: number;
    w: number;  h: number;
    dir?: ResizeDir;
  } | null>(null);

  useEffect(() => {
    function onMove(e: MouseEvent) {
      if (!ia.current) return;
      const dx = e.clientX - ia.current.mx;
      const dy = e.clientY - ia.current.my;

      if (ia.current.type === 'drag') {
        setPos({ x: ia.current.px + dx, y: ia.current.py + dy });
      } else if (ia.current.dir) {
        const c = RESIZE_COEFFS[ia.current.dir];
        const newW = Math.max(MIN_W, ia.current.w + c.wX * dx);
        const newH = Math.max(MIN_H, ia.current.h + c.wY * dy);
        const dw = newW - ia.current.w;
        const dh = newH - ia.current.h;
        setSize({ w: newW, h: newH });
        setPos({
          x: ia.current.px + (c.wX !== 0 ? dw * c.wX / 2 : 0),
          y: ia.current.py + (c.wY !== 0 ? dh * c.wY / 2 : 0),
        });
      }
    }
    function onUp() { ia.current = null; }
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, []);

  // ── 파일 변경 시 초기화 ──
  useEffect(() => {
    setSearchInput('');
    setAppliedSearch('');
    setPos({ x: 0, y: 0 });
    setSize({
      w: Math.min(Math.round(window.innerWidth * 0.9), 1024),
      h: Math.round(window.innerHeight * 0.9),
    });
  }, [file?.drive_file_id]);

  function startDrag(e: React.MouseEvent) {
    if ((e.target as HTMLElement).closest('button, a')) return;
    ia.current = { type: 'drag', mx: e.clientX, my: e.clientY, px: pos.x, py: pos.y, w: size?.w ?? 0, h: size?.h ?? 0 };
    e.preventDefault();
  }

  function startResize(dir: ResizeDir, e: React.MouseEvent) {
    e.stopPropagation();
    e.preventDefault();
    ia.current = {
      type: 'resize', dir,
      mx: e.clientX, my: e.clientY,
      px: pos.x, py: pos.y,
      w: size?.w ?? MIN_W, h: size?.h ?? MIN_H,
    };
  }

  function handleSearchSubmit(e: React.FormEvent) {
    e.preventDefault();
    setAppliedSearch(searchInput.trim());
  }

  function handleSearchClear() {
    setSearchInput('');
    setAppliedSearch('');
    searchInputRef.current?.focus();
  }

  if (!file) return null;

  const isPdfFile = file.mime_type === 'application/pdf';
  const previewUrl = (appliedSearch && !isPdfFile)
    ? `https://drive.google.com/file/d/${file.drive_file_id}/preview?q=${encodeURIComponent(appliedSearch)}`
    : `https://drive.google.com/file/d/${file.drive_file_id}/preview`;

  const modalStyle: React.CSSProperties = {
    position: 'fixed',
    top: '50%',
    left: '50%',
    transform: `translate(calc(-50% + ${pos.x}px), calc(-50% + ${pos.y}px))`,
    width: size ? `${size.w}px` : '90vw',
    maxWidth: size ? 'none' : '1024px',
    height: size ? `${size.h}px` : '90vh',
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/50" onClick={onClose}>
      <div
        style={modalStyle}
        className="flex flex-col rounded-xl border border-[#E3E3E0] bg-white shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* ── 리사이즈 핸들 ── */}
        {/* 모서리 */}
        {(['nw','ne','sw','se'] as ResizeDir[]).map((dir) => (
          <div
            key={dir}
            style={{
              position: 'absolute',
              width: 14, height: 14,
              top:    dir.includes('n') ? -4 : undefined,
              bottom: dir.includes('s') ? -4 : undefined,
              left:   dir.includes('w') ? -4 : undefined,
              right:  dir.includes('e') ? -4 : undefined,
              cursor: RESIZE_CURSORS[dir],
              zIndex: 30,
            }}
            onMouseDown={(e) => startResize(dir, e)}
          />
        ))}
        {/* 가장자리 */}
        {(['n','s','e','w'] as ResizeDir[]).map((dir) => (
          <div
            key={dir}
            style={{
              position: 'absolute',
              cursor: RESIZE_CURSORS[dir],
              zIndex: 20,
              top:    dir === 'n' ? -3 : dir === 's' ? undefined : 14,
              bottom: dir === 's' ? -3 : dir === 'n' ? undefined : 14,
              left:   dir === 'w' ? -3 : dir === 'e' ? undefined : 14,
              right:  dir === 'e' ? -3 : dir === 'w' ? undefined : 14,
              height: (dir === 'n' || dir === 's') ? 6 : undefined,
              width:  (dir === 'e' || dir === 'w') ? 6 : undefined,
            }}
            onMouseDown={(e) => startResize(dir, e)}
          />
        ))}

        {/* 헤더 — 드래그 핸들 */}
        <div
          className="flex items-center justify-between border-b border-[#E3E3E0] px-5 py-3 cursor-grab active:cursor-grabbing select-none rounded-t-xl"
          onMouseDown={startDrag}
        >
          <div className="flex items-center gap-2 overflow-hidden pointer-events-none">
            <span className="text-xl">{getFileIcon(file.mime_type)}</span>
            <div className="overflow-hidden">
              <p className="truncate text-sm font-semibold text-[#131310]">{file.title}</p>
              <p className="truncate text-xs text-text-secondary">{file.file_name}</p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0 ml-4 pointer-events-auto">
            <a
              href={`https://drive.google.com/uc?export=download&id=${file.drive_file_id}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 rounded border border-[#E3E3E0] px-3 py-1.5 text-xs text-text-secondary hover:bg-[#F3F3EE] transition-colors"
            >
              <Download className="h-3.5 w-3.5" />
              다운로드
            </a>
            <button onClick={onClose} className="rounded p-1.5 text-text-secondary hover:bg-[#F3F3EE]">
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* 검색 바 */}
        <div className="border-b border-[#E3E3E0] px-5 py-2">
          <form onSubmit={handleSearchSubmit} className="flex items-center gap-2">
            <div className="relative flex flex-1 items-center">
              <Search className="absolute left-2.5 h-3.5 w-3.5 text-text-secondary pointer-events-none" />
              <input
                ref={searchInputRef}
                type="text"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                placeholder={isPdfFile ? 'PDF는 미리보기 클릭 후 Ctrl+F 사용' : '키워드 입력 후 Enter (Google Docs 지원)'}
                className="w-full rounded border border-[#E3E3E0] py-1.5 pl-8 pr-8 text-sm text-[#131310] outline-none focus:border-primary focus:ring-1 focus:ring-primary/30"
                disabled={isPdfFile}
              />
              {searchInput && !isPdfFile && (
                <button type="button" onClick={handleSearchClear}
                  className="absolute right-2 text-text-secondary hover:text-[#131310]">
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
            {!isPdfFile && (
              <Button type="submit" size="sm" className="bg-primary text-white hover:bg-primary-light shrink-0">
                검색
              </Button>
            )}
            {appliedSearch && !isPdfFile && (
              <span className="shrink-0 text-xs text-primary font-medium whitespace-nowrap">
                &quot;{appliedSearch}&quot; 검색 중
              </span>
            )}
          </form>
        </div>

        {/* 미리보기 */}
        <div className="flex-1 overflow-hidden rounded-b-xl">
          <iframe
            key={previewUrl}
            src={previewUrl}
            className="h-full w-full border-0"
            title={file.title}
            allow="autoplay"
          />
        </div>
      </div>
    </div>
  );
}

// ── 메인 페이지 ──────────────────────────────────────────────────────
export default function LibraryPage() {
  const { data: session } = useSession();
  const { data: files, isLoading, isError, error, refetch } = useLibraryFiles();
  const deleteFile = useDeleteLibraryFile();

  const [uploadOpen, setUploadOpen] = useState(false);
  const [previewFile, setPreviewFile] = useState<LibraryFile | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<LibraryFile | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  const userRole = (session?.user as { role?: string } | undefined)?.role;
  const userPermissions = (session?.user as { permissions?: string[] } | undefined)?.permissions ?? [];
  const canWrite = userRole === 'super_admin' || userPermissions.includes('library:write');

  const filteredFiles = files?.filter((f) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.trim().toLowerCase();
    return (
      f.title.toLowerCase().includes(q) ||
      (f.description ?? '').toLowerCase().includes(q) ||
      (f.uploader_name ?? '').toLowerCase().includes(q)
    );
  });

  async function handleDelete() {
    if (!deleteTarget) return;
    try {
      await deleteFile.mutateAsync(deleteTarget.id);
      setDeleteTarget(null);
    } catch (err) {
      alert(err instanceof Error ? err.message : '삭제 중 오류가 발생했습니다.');
    }
  }

  return (
    <div className="space-y-6">
      {/* 헤더 */}
      <div className="flex items-center justify-between">
        <div className="flex items-baseline gap-3">
          <h1 className="text-2xl font-semibold text-[#131310] tracking-tight">자료실</h1>
          <span className="text-sm text-text-secondary">지침 및 참고자료를 공유하는 공간입니다.</span>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline" size="sm"
            onClick={() => refetch()}
            disabled={isLoading}
            className="gap-1.5 text-text-secondary border-[#E3E3E0] hover:bg-sidebar"
          >
            <RefreshCw className={cn('h-3.5 w-3.5', isLoading && 'animate-spin')} />
            새로고침
          </Button>
          {canWrite && (
            <Button size="sm" onClick={() => setUploadOpen(true)}
              className="gap-1.5 bg-primary text-white hover:bg-primary-light">
              <Upload className="h-3.5 w-3.5" />
              자료 업로드
            </Button>
          )}
        </div>
      </div>

      {/* 검색 */}
      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-text-secondary pointer-events-none" />
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="제목, 설명, 등록자 검색"
          className="w-full rounded-lg border border-[#E3E3E0] bg-white py-2 pl-9 pr-8 text-sm text-[#131310] outline-none focus:border-primary focus:ring-1 focus:ring-primary/30"
        />
        {searchQuery && (
          <button
            type="button"
            onClick={() => setSearchQuery('')}
            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-text-secondary hover:text-[#131310]"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      {/* 에러 */}
      {isError && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error instanceof Error ? error.message : '데이터를 불러오지 못했습니다.'}
        </div>
      )}

      {/* 파일 목록 */}
      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-14 animate-pulse rounded-lg bg-[#F3F3EE]" />
          ))}
        </div>
      ) : (
        <div className="overflow-x-auto rounded-[2px] border border-[#E3E3E0] shadow-soft">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b border-[#E3E3E0] bg-[#F3F3EE]">
                <th className="w-16 px-4 py-3 text-center font-medium text-text-secondary whitespace-nowrap">번호</th>
                <th className="px-4 py-3 text-left font-medium text-text-secondary whitespace-nowrap">제목</th>
                <th className="w-24 px-4 py-3 text-center font-medium text-text-secondary whitespace-nowrap">크기</th>
                <th className="w-28 px-4 py-3 text-center font-medium text-text-secondary whitespace-nowrap">등록자</th>
                <th className="w-28 px-4 py-3 text-center font-medium text-text-secondary whitespace-nowrap">등록일</th>
                <th className="w-32 px-4 py-3 text-center font-medium text-text-secondary whitespace-nowrap">관리</th>
              </tr>
            </thead>
            <tbody>
              {!filteredFiles || filteredFiles.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-16 text-center text-text-secondary">
                    <FileText className="mx-auto mb-2 h-8 w-8 text-[#E3E3E0]" />
                    {searchQuery.trim() ? `"${searchQuery.trim()}"에 해당하는 자료가 없습니다.` : '등록된 자료가 없습니다.'}
                  </td>
                </tr>
              ) : (
                filteredFiles.map((file, i) => (
                  <tr
                    key={file.id}
                    className={cn(
                      'border-b border-[#F0F0EE] transition-colors hover:bg-primary-bg/10',
                      i % 2 === 0 ? 'bg-white' : 'bg-[#FAFAF8]',
                    )}
                  >
                    <td className="px-4 py-3 text-center text-text-secondary tabular-nums whitespace-nowrap">
                      {(files?.length ?? 0) - (files?.indexOf(file) ?? i)}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <span className="text-base leading-none">{getFileIcon(file.mime_type)}</span>
                        <div>
                          <button
                            onClick={() => setPreviewFile(file)}
                            className="text-left font-medium text-[#131310] hover:text-primary hover:underline"
                          >
                            {file.title}
                          </button>
                          {file.description && (
                            <p className="mt-0.5 text-xs text-text-secondary">{file.description}</p>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-center tabular-nums text-text-secondary whitespace-nowrap">
                      {formatFileSize(file.file_size)}
                    </td>
                    <td className="px-4 py-3 text-center text-text-secondary whitespace-nowrap">
                      {file.uploader_name ?? '-'}
                    </td>
                    <td className="px-4 py-3 text-center text-text-secondary whitespace-nowrap">
                      {formatDate(file.uploaded_at)}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-center gap-1">
                        <button
                          onClick={() => setPreviewFile(file)}
                          title="미리보기"
                          className="rounded p-1.5 text-text-secondary hover:bg-primary-bg hover:text-primary transition-colors"
                        >
                          <Eye className="h-3.5 w-3.5" />
                        </button>
                        <a
                          href={`https://drive.google.com/uc?export=download&id=${file.drive_file_id}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          title="다운로드"
                          className="rounded p-1.5 text-text-secondary hover:bg-primary-bg hover:text-primary transition-colors"
                        >
                          <Download className="h-3.5 w-3.5" />
                        </a>
                        {canWrite && (
                          <button
                            onClick={() => setDeleteTarget(file)}
                            title="삭제"
                            className="rounded p-1.5 text-text-secondary hover:bg-red-50 hover:text-red-500 transition-colors"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* 파일 개수 */}
      {files && files.length > 0 && (
        <p className="text-xs text-text-secondary">
          {searchQuery.trim()
            ? `${filteredFiles?.length ?? 0}개 검색됨 (전체 ${files.length}개)`
            : `총 ${files.length}개의 자료`}
        </p>
      )}

      {/* 모달 */}
      <UploadModal open={uploadOpen} onClose={() => setUploadOpen(false)} />
      <PreviewModal file={previewFile} onClose={() => setPreviewFile(null)} />
      <ConfirmDialog
        open={!!deleteTarget}
        title="자료 삭제"
        description={`"${deleteTarget?.title ?? ''}" 파일을 삭제하시겠습니까? Google Drive에서도 함께 삭제됩니다.`}
        loading={deleteFile.isPending}
        onConfirm={handleDelete}
        onClose={() => setDeleteTarget(null)}
      />
    </div>
  );
}

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { LibraryFile } from '@/types';

export function useLibraryFiles() {
  return useQuery<LibraryFile[]>({
    queryKey: ['library'],
    queryFn: async () => {
      const res = await fetch('/api/library');
      if (!res.ok) throw new Error('자료 목록 조회 실패');
      return res.json() as Promise<LibraryFile[]>;
    },
  });
}

export function useUploadLibraryFile() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (formData: FormData) => {
      const res = await fetch('/api/drive/library', { method: 'POST', body: formData });
      if (!res.ok) {
        const body = await res.json() as { error?: string };
        throw new Error(body.error ?? '업로드 실패');
      }
      return res.json() as Promise<LibraryFile>;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['library'] }),
  });
}

export function useDeleteLibraryFile() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch('/api/drive/library', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      });
      if (!res.ok) {
        const body = await res.json() as { error?: string };
        throw new Error(body.error ?? '삭제 실패');
      }
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['library'] }),
  });
}

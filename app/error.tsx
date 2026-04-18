'use client';

import { useEffect } from 'react';
import { Button } from '@/components/ui/button';

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 p-8">
      <h2 className="text-xl font-bold text-gray-900">오류가 발생했습니다</h2>
      <p className="text-sm text-gray-500">{error.message || '알 수 없는 오류입니다.'}</p>
      <Button onClick={reset} size="sm">다시 시도</Button>
    </div>
  );
}

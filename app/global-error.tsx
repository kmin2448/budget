'use client';

import { useEffect } from 'react';

export default function GlobalError({
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
    <html>
      <body>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', gap: '16px', padding: '32px' }}>
          <h2 style={{ fontSize: '20px', fontWeight: 'bold' }}>심각한 오류가 발생했습니다</h2>
          <p style={{ fontSize: '14px', color: '#6b7280' }}>{error.message || '알 수 없는 오류입니다.'}</p>
          <button onClick={reset} style={{ padding: '8px 16px', borderRadius: '6px', background: '#1F5C99', color: 'white', cursor: 'pointer', border: 'none' }}>
            다시 시도
          </button>
        </div>
      </body>
    </html>
  );
}

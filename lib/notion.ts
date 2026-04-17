// lib/notion.ts
// Notion API를 사용한 지출부 파일 업로드

const NOTION_API_KEY = process.env.NOTION_API_KEY!;
const NOTION_VERSION = '2022-06-28';

function notionHeaders(contentType?: string) {
  const h: Record<string, string> = {
    Authorization: `Bearer ${NOTION_API_KEY}`,
    'Notion-Version': NOTION_VERSION,
  };
  if (contentType) h['Content-Type'] = contentType;
  return h;
}

async function notionFetch(url: string, init: RequestInit) {
  const res = await fetch(url, init);
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Notion API 오류 (${res.status}): ${body}`);
  }
  return res.json();
}

// ── Step 1: 파일 업로드 세션 생성 ──────────────────────────────────
async function createFileUpload(filename: string): Promise<{ id: string }> {
  return notionFetch('https://api.notion.com/v1/file-uploads', {
    method: 'POST',
    headers: notionHeaders('application/json'),
    body: JSON.stringify({ filename }),
  });
}

// ── Step 2: 파일 내용 업로드 ────────────────────────────────────────
async function sendFileContent(
  fileUploadId: string,
  buffer: Buffer,
  filename: string,
): Promise<void> {
  const form = new FormData();
  form.append('file', new Blob([new Uint8Array(buffer)], { type: 'application/pdf' }), filename);

  const res = await fetch(
    `https://api.notion.com/v1/file-uploads/${fileUploadId}`,
    {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${NOTION_API_KEY}`,
        'Notion-Version': NOTION_VERSION,
      },
      body: form,
    },
  );
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Notion 파일 전송 오류 (${res.status}): ${body}`);
  }
}

// ── Step 3: 데이터베이스 페이지 생성 (파일 첨부) ───────────────────
async function createDatabasePage(params: {
  databaseId: string;
  category: string;
  rowIndex: number;
  filename: string;
  fileUploadId: string;
}): Promise<{ id: string; url: string }> {
  const today = new Date().toISOString().split('T')[0];
  return notionFetch('https://api.notion.com/v1/pages', {
    method: 'POST',
    headers: notionHeaders('application/json'),
    body: JSON.stringify({
      parent: { database_id: params.databaseId },
      properties: {
        파일명: { title: [{ text: { content: params.filename } }] },
        비목:  { rich_text: [{ text: { content: params.category } }] },
        행번호: { number: params.rowIndex },
        업로드일: { date: { start: today } },
      },
      children: [
        {
          object: 'block',
          type: 'file',
          file: {
            type: 'file_upload',
            file_upload: { id: params.fileUploadId },
          },
        },
      ],
    }),
  });
}

// ── 기존 페이지 삭제(아카이브) ──────────────────────────────────────
export async function archiveNotionPage(pageId: string): Promise<void> {
  await notionFetch(`https://api.notion.com/v1/pages/${pageId}`, {
    method: 'PATCH',
    headers: notionHeaders('application/json'),
    body: JSON.stringify({ archived: true }),
  });
}

// ── 통합 함수: 업로드 → 페이지 생성 ───────────────────────────────
export async function uploadToNotion(params: {
  databaseId: string;
  category: string;
  rowIndex: number;
  filename: string;
  buffer: Buffer;
}): Promise<{ pageId: string; pageUrl: string }> {
  // 1. 파일 업로드 세션 생성
  const { id: fileUploadId } = await createFileUpload(params.filename);

  // 2. 파일 내용 전송
  await sendFileContent(fileUploadId, params.buffer, params.filename);

  // 3. 데이터베이스에 페이지 추가
  const page = await createDatabasePage({
    databaseId: params.databaseId,
    category: params.category,
    rowIndex: params.rowIndex,
    filename: params.filename,
    fileUploadId,
  });

  return { pageId: page.id, pageUrl: page.url };
}

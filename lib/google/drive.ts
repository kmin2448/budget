import { google } from 'googleapis';
import { Readable } from 'stream';

const ROOT_FOLDER_NAME = 'COSS_지출부';

/** 사용자 OAuth 액세스 토큰으로 Drive 클라이언트 생성 */
function getDriveClient(accessToken: string) {
  const oauth2 = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID!,
    process.env.GOOGLE_CLIENT_SECRET!,
  );
  oauth2.setCredentials({ access_token: accessToken });
  return google.drive({ version: 'v3', auth: oauth2 });
}

/** 이름으로 폴더 검색, 없으면 생성 */
async function getOrCreateFolder(
  drive: ReturnType<typeof google.drive>,
  name: string,
  parentId?: string,
): Promise<string> {
  const q = parentId
    ? `name='${name}' and '${parentId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`
    : `name='${name}' and mimeType='application/vnd.google-apps.folder' and trashed=false`;

  const res = await drive.files.list({ q, fields: 'files(id)', pageSize: 1 });
  if (res.data.files?.[0]?.id) return res.data.files[0].id;

  const folder = await drive.files.create({
    requestBody: {
      name,
      mimeType: 'application/vnd.google-apps.folder',
      ...(parentId ? { parents: [parentId] } : {}),
    },
    fields: 'id',
  });
  if (!folder.data.id) throw new Error(`폴더 생성 실패: ${name}`);
  return folder.data.id;
}

/** 사용자 개인 Google Drive에 PDF 업로드 */
export async function uploadToUserDrive(params: {
  accessToken: string;
  categoryName: string;
  fileName: string;
  buffer: Buffer;
  subFolderName?: string; // 지정 시: COSS_지출부/{subFolderName}/{비목명}/
}): Promise<{ fileId: string; webViewLink: string }> {
  const drive = getDriveClient(params.accessToken);

  // 루트 폴더(COSS_지출부) → (서브폴더) → 비목 폴더 순서로 생성
  const rootFolderId = await getOrCreateFolder(drive, ROOT_FOLDER_NAME);
  const parentFolderId = params.subFolderName
    ? await getOrCreateFolder(drive, params.subFolderName, rootFolderId)
    : rootFolderId;
  const categoryFolderId = await getOrCreateFolder(drive, params.categoryName, parentFolderId);

  // 파일 업로드
  const stream = Readable.from(params.buffer);
  const uploadRes = await drive.files.create({
    requestBody: {
      name: params.fileName,
      parents: [categoryFolderId],
      mimeType: 'application/pdf',
    },
    media: { mimeType: 'application/pdf', body: stream },
    fields: 'id, webViewLink',
  });

  if (!uploadRes.data.id) throw new Error('파일 업로드 실패');

  // 링크 공유 설정 (링크 있는 누구나 읽기)
  await drive.permissions.create({
    fileId: uploadRes.data.id,
    requestBody: { role: 'reader', type: 'anyone' },
  });

  return {
    fileId: uploadRes.data.id,
    webViewLink:
      uploadRes.data.webViewLink ??
      `https://drive.google.com/file/d/${uploadRes.data.id}/view`,
  };
}

/** 자료실 파일 업로드 (COSS_지출부/지침/ 폴더) */
export async function uploadToLibraryDrive(params: {
  accessToken: string;
  fileName: string;
  buffer: Buffer;
  mimeType: string;
}): Promise<{ fileId: string; webViewLink: string }> {
  const drive = getDriveClient(params.accessToken);
  const rootFolderId = await getOrCreateFolder(drive, ROOT_FOLDER_NAME);
  const libraryFolderId = await getOrCreateFolder(drive, '지침', rootFolderId);

  const stream = Readable.from(params.buffer);
  const uploadRes = await drive.files.create({
    requestBody: { name: params.fileName, parents: [libraryFolderId], mimeType: params.mimeType },
    media: { mimeType: params.mimeType, body: stream },
    fields: 'id, webViewLink',
  });

  if (!uploadRes.data.id) throw new Error('파일 업로드 실패');

  await drive.permissions.create({
    fileId: uploadRes.data.id,
    requestBody: { role: 'reader', type: 'anyone' },
  });

  return {
    fileId: uploadRes.data.id,
    webViewLink:
      uploadRes.data.webViewLink ??
      `https://drive.google.com/file/d/${uploadRes.data.id}/view`,
  };
}

/** Drive 파일 삭제 */
export async function deleteFromUserDrive(params: {
  accessToken: string;
  fileId: string;
}): Promise<void> {
  const drive = getDriveClient(params.accessToken);
  await drive.files.delete({ fileId: params.fileId });
}

/** WE-Meet 증빙 파일 업로드
 *  폴더: COSS_지출부 / WE-Meet / {teamName} /
 *  파일명: {지출건명}({확정금액})_{사용일자}[.(1)].{ext}
 */
export async function uploadToWeMeetDrive(params: {
  accessToken: string;
  teamName: string;
  description: string;
  confirmedAmount: number;
  remarks: string;
  buffer: Buffer;
  mimeType: string;
  ext: string;
}): Promise<{ fileId: string; webViewLink: string; fileName: string }> {
  const drive = getDriveClient(params.accessToken);

  const rootId    = await getOrCreateFolder(drive, ROOT_FOLDER_NAME);
  const wemeetId  = await getOrCreateFolder(drive, 'WE-Meet', rootId);
  const teamId    = await getOrCreateFolder(drive, params.teamName, wemeetId);

  const sanitize = (s: string) => s.replace(/[/\\:*?"<>|]/g, '_').trim() || 'file';
  const amtStr   = params.confirmedAmount.toLocaleString('ko-KR');
  const suffix   = params.remarks ? `_${sanitize(params.remarks)}` : '';
  const baseName = `${sanitize(params.description)}(${amtStr})${suffix}`;
  const ext      = params.ext.toLowerCase().replace(/^\./, '');

  // 동일 폴더 내 파일명 목록 조회 → 중복 시 (1),(2)... 부여
  const listRes = await drive.files.list({
    q: `'${teamId}' in parents and trashed=false`,
    fields: 'files(name)',
    pageSize: 200,
  });
  const existingNames = new Set((listRes.data.files ?? []).map((f) => f.name ?? ''));

  let fileName = `${baseName}.${ext}`;
  if (existingNames.has(fileName)) {
    let n = 1;
    while (existingNames.has(`${baseName}(${n}).${ext}`)) n++;
    fileName = `${baseName}(${n}).${ext}`;
  }

  const stream = Readable.from(params.buffer);
  const uploadRes = await drive.files.create({
    requestBody: { name: fileName, parents: [teamId], mimeType: params.mimeType },
    media: { mimeType: params.mimeType, body: stream },
    fields: 'id, webViewLink',
  });

  if (!uploadRes.data.id) throw new Error('파일 업로드 실패');

  await drive.permissions.create({
    fileId: uploadRes.data.id,
    requestBody: { role: 'reader', type: 'anyone' },
  });

  return {
    fileId:      uploadRes.data.id,
    webViewLink: uploadRes.data.webViewLink ?? `https://drive.google.com/file/d/${uploadRes.data.id}/view`,
    fileName,
  };
}

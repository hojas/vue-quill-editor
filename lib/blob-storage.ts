import { put, del, head } from '@vercel/blob';

/** 文件元数据 */
export interface StoredFile {
  id: string;
  originalName: string;
  mimeType: string;
  size: number;
  url: string;
  createdAt: string;
}

/**
 * 保存文件到 Vercel Blob。
 */
export async function saveFile(
  buffer: Buffer,
  originalName: string,
  mimeType: string,
): Promise<StoredFile> {
  const id = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  const pathname = `${id}/${encodeURIComponent(originalName)}`;

  const blob = await put(pathname, buffer, {
    access: 'public',
    contentType: mimeType,
  });

  return {
    id,
    originalName,
    mimeType,
    size: buffer.length,
    url: blob.url,
    createdAt: new Date().toISOString(),
  };
}

/**
 * 根据 ID 获取 Blob 元数据。
 */
export async function getFile(id: string): Promise<StoredFile | null> {
  const { blobs } = await head({ prefix: `${id}/` });
  if (blobs.length === 0) return null;

  const blob = blobs[0];
  const namePart = blob.pathname.split('/').pop() || 'download';

  return {
    id,
    originalName: decodeURIComponent(namePart),
    mimeType: blob.contentType || 'application/octet-stream',
    size: blob.size,
    url: blob.url,
    createdAt: blob.uploadedAt.toISOString(),
  };
}

/**
 * 删除文件。
 */
export async function deleteFile(id: string): Promise<void> {
  await del(`${id}/`);
}

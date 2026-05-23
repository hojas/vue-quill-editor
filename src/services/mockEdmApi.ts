import type { EdmUploadKind, EdmUploadResult } from '../types/edm';

interface StoredEdmAsset {
  file: File;
  kind: EdmUploadKind;
  objectUrl: string;
  uploadedAt: string;
}

const edmAssets = new Map<string, StoredEdmAsset>();

function createEdmId(kind: EdmUploadKind): string {
  return `${kind}_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

export async function uploadToMockEdm(
  file: File,
  kind: EdmUploadKind,
): Promise<EdmUploadResult> {
  await new Promise((resolve) => window.setTimeout(resolve, 400));

  const edmId = createEdmId(kind);
  // 本地 blob URL 直接指向文件二进制内容，用于模拟「已下载的内容」
  const objectUrl = URL.createObjectURL(file);
  const attachmentId = Date.now();

  const asset: StoredEdmAsset = {
    file,
    kind,
    objectUrl,
    uploadedAt: new Date().toISOString(),
  };

  edmAssets.set(edmId, asset);
  edmAssets.set(String(attachmentId), asset);

  return {
    edmId,
    attachmentId,
    fileName: file.name,
    mimeType: file.type,
    size: file.size,
  };
}

/**
 * 模拟通过 attachmentId 从后端下载图片/视频二进制内容，返回 blob URL。
 *
 * 真实环境下这里会执行：
 * 1. fetch(`/api/edm/${attachmentId}/download`)
 * 2. const blob = await res.blob()
 * 3. return URL.createObjectURL(blob)
 */
export async function resolveMockEdmUrl(attachmentId: string): Promise<string> {
  await new Promise((resolve) => window.setTimeout(resolve, 200));

  const cached = edmAssets.get(attachmentId);
  if (cached) {
    return cached.objectUrl;
  }

  // 缓存未命中时尝试从后端下载（仅 demo fallback）
  const fallbackUrl = `/api/edm/${encodeURIComponent(attachmentId)}/download`;
  try {
    const res = await fetch(fallbackUrl);
    if (res.ok) {
      const blob = await res.blob();
      return URL.createObjectURL(blob);
    }
  } catch {
    // 忽略，返回原始 URL
  }

  return fallbackUrl;
}

export function listMockEdmAssets(): Array<StoredEdmAsset & { edmId: string }> {
  return Array.from(edmAssets, ([edmId, asset]) => ({ edmId, ...asset }))
    .sort((a, b) => b.uploadedAt.localeCompare(a.uploadedAt));
}

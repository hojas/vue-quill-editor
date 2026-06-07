import type { EdmUploadKind, EdmUploadResult, EdmUrlResolver } from '../types/edm';

// ---- Type helpers ----

export function inferUploadKind(file: File): EdmUploadKind {
  if (file.type.startsWith('image/')) return 'image';
  if (file.type.startsWith('video/')) return 'video';
  return 'file';
}

export function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : '上传失败';
}

export function getBlotName(kind: EdmUploadKind): string {
  if (kind === 'image') return 'edmImage';
  if (kind === 'video') return 'edmVideo';
  return 'edmFile';
}

// ---- URL helpers ----

export function isUnresolvedUrl(url: string): boolean {
  return url.startsWith('/api/edm/');
}

export function defaultEdmUrl(edmId: string, attachmentId?: number, action = 'download'): string {
  const id = attachmentId ?? edmId;
  return `/api/edm/${encodeURIComponent(String(id))}/${action}`;
}

export async function downloadFile(url: string, fileName: string): Promise<void> {
  try {
    const res = await fetch(url);
    const blob = await res.blob();
    const blobUrl = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = blobUrl;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(blobUrl);
  } catch {
    window.open(url, '_blank');
  }
}

export async function resolveEdmUrl(
  resolver: EdmUrlResolver | undefined,
  edmId: string,
  kind: EdmUploadKind,
  result?: EdmUploadResult,
  action: 'preview' | 'download' = 'download',
): Promise<string> {
  if (resolver) {
    const attachmentId = result?.attachmentId != null ? String(result.attachmentId) : '';
    return resolver(attachmentId, edmId, kind, result);
  }
  const id = result?.attachmentId ?? edmId;
  return defaultEdmUrl(String(id), undefined, action);
}

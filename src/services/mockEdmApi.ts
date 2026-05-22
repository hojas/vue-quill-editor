import type { EdmUploadKind, EdmUploadResult } from '../types/edm';

interface StoredEdmAsset {
  file: File;
  kind: EdmUploadKind;
  objectUrl: string;
  uploadedAt: string;
}

const edmAssets = new Map<string, StoredEdmAsset>();

function createEdmId(kind: EdmUploadKind): string {
  const randomPart = Math.random().toString(36).slice(2, 10);

  return `${kind}_${Date.now()}_${randomPart}`;
}

export async function uploadToMockEdm(
  file: File,
  kind: EdmUploadKind,
): Promise<EdmUploadResult> {
  await new Promise((resolve) => window.setTimeout(resolve, 400));

  const edmId = createEdmId(kind);
  const objectUrl = URL.createObjectURL(file);

  edmAssets.set(edmId, {
    file,
    kind,
    objectUrl,
    uploadedAt: new Date().toISOString(),
  });

  const attachmentId = Date.now();

  return {
    edmId,
    attachmentId,
    previewUrl: objectUrl,
    downloadUrl: objectUrl,
    fileName: file.name,
    mimeType: file.type,
    size: file.size,
  };
}

export function resolveMockEdmUrl(edmId: string): string {
  return edmAssets.get(edmId)?.objectUrl || `/api/edm/${encodeURIComponent(edmId)}/download`;
}

export function listMockEdmAssets(): Array<StoredEdmAsset & { edmId: string }> {
  return Array.from(edmAssets, ([edmId, asset]) => ({
    edmId,
    ...asset,
  })).sort((left, right) => right.uploadedAt.localeCompare(left.uploadedAt));
}

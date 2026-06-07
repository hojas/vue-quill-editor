import type { EdmUploadKind, EdmUploadResult } from '../shared/types';

/**
 * 上传文件到 EDM 服务。
 *
 * 向后端 `POST /api/edm/upload` 发送 multipart 请求，
 * 返回包含 edmId / attachmentId 等字段的 EdmUploadResult。
 *
 * @param file - 用户选择的文件
 * @param kind - 资源类型（image / video / file）
 */
/** EDM 配置 */
export interface EdmConfig {
  maxCount: number;
}

/**
 * 获取 EDM 上传配置（如最大上传数量）。
 */
export async function fetchEdmConfig(): Promise<EdmConfig> {
  const res = await fetch('/api/edm/config');
  if (!res.ok) return { maxCount: 5 };
  return res.json();
}

export async function uploadToEdm(
  file: File,
  _kind: EdmUploadKind,
): Promise<EdmUploadResult> {
  const form = new FormData();
  form.append('file', file);

  const res = await fetch('/api/edm/upload', {
    method: 'POST',
    body: form,
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error((body as { error?: string }).error || '上传失败');
  }

  return res.json();
}

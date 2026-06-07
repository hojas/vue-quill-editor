import type { EdmUploadKind, EdmUploadResult } from '../types/edm';

/**
 * 上传文件到 EDM 服务。
 *
 * 向后端 `POST /api/edm/upload` 发送 multipart 请求，
 * 返回包含 edmId / attachmentId 等字段的 EdmUploadResult。
 *
 * @param file - 用户选择的文件
 * @param kind - 资源类型（image / video / file）
 */
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

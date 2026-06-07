import type { EdmUploadKind, EdmUploadResult, EdmUrlResolver } from '../types/edm';

// ============================================================
// 类型与 Blot 工具函数
// ============================================================

/**
 * 根据文件 MIME 类型推断上传资源类型。
 *
 * @param file - 用户选择的文件
 * @returns `image` / `video` / `file`
 */
export function inferUploadKind(file: File): EdmUploadKind {
  if (file.type.startsWith('image/')) return 'image';
  if (file.type.startsWith('video/')) return 'video';
  return 'file';
}

/**
 * 将任意错误值转为用户可读的中文消息。
 *
 * @param error - 捕获到的错误对象
 */
export function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : '上传失败';
}

/**
 * 将资源类型映射为对应的 Quill blot 名称。
 *
 * @param kind - 资源类型
 * @returns 如 `edmImage`、`edmVideo`、`edmFile`
 */
export function getBlotName(kind: EdmUploadKind): string {
  if (kind === 'image') return 'edmImage';
  if (kind === 'video') return 'edmVideo';
  return 'edmFile';
}

// ============================================================
// URL 构建与解析
// ============================================================

/**
 * 判断 URL 是否为尚未解析的默认 EDM 路径。
 *
 * 以 `/api/edm/` 开头的 URL 需要通过 `resolveEdmUrl` 解析后才可用。
 */
export function isUnresolvedUrl(url: string): boolean {
  return url.startsWith('/api/edm/');
}

/**
 * 根据 EDM ID 拼装默认的 API URL。
 *
 * @param edmId         - EDM 资源 ID
 * @param attachmentId  - 可选的附件 ID，优先使用
 * @param action        - 操作类型：`download` / `preview`
 */
export function defaultEdmUrl(edmId: string, attachmentId?: number, action = 'download'): string {
  const id = attachmentId ?? edmId;
  return `/api/edm/${encodeURIComponent(String(id))}/${action}`;
}

/**
 * 通过 fetch → blob → 创建临时链接的方式触发浏览器下载。
 *
 * 下载失败时降级为在新窗口打开原始 URL。
 *
 * @param url      - 文件的下载地址
 * @param fileName - 保存到本地的文件名
 */
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
    // fetch 跨域或网络异常时，降级为直接打开
    window.open(url, '_blank');
  }
}

/**
 * 解析 EDM 资源的真实 URL。
 *
 * 优先调用外部传入的 `resolver`，无 resolver 时回退到 `defaultEdmUrl`。
 *
 * @param resolver - 外部注入的解析函数
 * @param edmId    - EDM 资源 ID
 * @param kind     - 资源类型
 * @param result   - 上传结果（含 attachmentId 等信息）
 * @param action   - 解析目标：`preview` 或 `download`
 */
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

import type { EdmUploadKind, EdmUploadResult, EdmUrlResolver } from './types';

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
// 下载工具
// ============================================================

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

// ============================================================
// URL 解析
// ============================================================

/**
 * 通过外部注入的 resolver 解析 EDM 资源的展示/下载 URL。
 *
 * 组件自身不拼接 URL，完全由消费方控制。无 resolver 时返回空字符串。
 *
 * @param resolver - 外部注入的解析函数
 * @param edmId    - EDM 资源 ID
 * @param kind     - 资源类型
 * @param result   - 上传结果（含 attachmentId 等信息）
 */
export async function resolveEdmUrl(
  resolver: EdmUrlResolver | undefined,
  edmId: string,
  kind: EdmUploadKind,
  result?: EdmUploadResult,
): Promise<string> {
  if (resolver) {
    const attachmentId = result?.attachmentId != null ? String(result.attachmentId) : '';
    return resolver(attachmentId, edmId, kind, result);
  }
  return '';
}

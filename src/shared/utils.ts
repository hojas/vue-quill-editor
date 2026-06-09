import type { EdmUploadKind } from './types'

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
  if (file.type.startsWith('image/'))
    return 'image'
  if (file.type.startsWith('video/'))
    return 'video'
  return 'file'
}

/**
 * 将任意错误值转为用户可读的中文消息。
 *
 * @param error - 捕获到的错误对象
 */
export function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : '上传失败'
}

/**
 * 将资源类型映射为对应的 Quill blot 名称。
 *
 * @param kind - 资源类型
 * @returns 如 `edmImage`、`edmVideo`、`edmFile`
 */
export function getBlotName(kind: EdmUploadKind): string {
  if (kind === 'image')
    return 'edmImage'
  if (kind === 'video')
    return 'edmVideo'
  return 'edmFile'
}

// ============================================================
// 下载工具
// ============================================================

/**
 * 将 resolver 返回值转为 URL 字符串。
 *
 * Blob 通过 URL.createObjectURL 转为 blob URL。
 * kind === 'file' 时强制 `application/octet-stream` 以触发浏览器下载而非内联打开。
 */
export function toUrl(resolved: string | Blob | undefined, kind?: EdmUploadKind): string {
  if (resolved instanceof Blob) {
    const blob = kind === 'file'
      ? new Blob([resolved], { type: 'application/octet-stream' })
      : resolved
    return URL.createObjectURL(blob)
  }
  return resolved || ''
}

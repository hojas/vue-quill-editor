/**
 * EDM 资源类型。
 *
 * - `image` — 图片（上传后内联预览）
 * - `video` — 视频（上传后播放器预览）
 * - `file`  — 文件（以下载链接形式展示）
 */
export type EdmUploadKind = 'image' | 'video' | 'file';

/**
 * 上传完成后后端返回的结果。
 *
 * 需至少返回 `edmId`。
 * `previewUrl` / `downloadUrl` 可由组件通过 `EdmUrlResolver` 二次解析，
 * 因此即使后端不直接返回 URL，也能正常工作。
 */
export interface EdmUploadResult {
  /** 后端分配的 EDM 资源 ID，会写入 `data-edm-id` 属性 */
  edmId: string;
  /** 后端分配的数字附件 ID，会写入 `data-attachment-id` 属性 */
  attachmentId?: number;
  /** 预览地址（图片/视频） */
  previewUrl?: string;
  /** 下载地址 */
  downloadUrl?: string;
  /** 通用 URL，在 preview/download 均未提供时作为兜底 */
  url?: string;
  /** 文件名 */
  fileName?: string;
  /** MIME 类型 */
  mimeType?: string;
  /** 文件大小（字节） */
  size?: number;
}

/**
 * 存储在 blot 中的嵌入值。
 *
 * 经过组件内 `buildEmbedValue` 构建后写入 Quill delta，
 * 包含足以渲染元素和回填 `data-*` 属性的全部信息。
 */
export interface EdmEmbedValue {
  /** EDM 资源 ID */
  edmId: string;
  /** 数字附件 ID */
  attachmentId?: number;
  /** 当前有效的资源 URL（preview 或 download） */
  url: string;
  /** 文件名 */
  name?: string;
  /** MIME 类型 */
  mimeType?: string;
  /** 文件大小（字节） */
  size?: number;
}

/**
 * 上传处理函数签名。
 *
 * 组件在用户选择文件后调用此函数，将文件上传至后端。
 *
 * @param file - 用户选择的文件
 * @param kind - 资源类型（由组件根据 MIME 或按钮类型推断）
 * @returns 包含 `edmId` 的上传结果
 */
export type EdmUploadHandler = (
  file: File,
  kind: EdmUploadKind,
) => Promise<EdmUploadResult>;

/**
 * URL 解析函数签名。
 *
 * 当 `EdmUploadResult` 中未提供 `previewUrl` / `downloadUrl` 时，
 * 组件通过此函数根据 `attachmentId` 和 `edmId` 动态解析 URL。
 *
 * @param attachmentId - 数字附件 ID（转为字符串），可能为空字符串
 * @param edmId        - EDM 资源 ID
 * @param kind         - 资源类型
 * @param result       - 上传结果（可能仅含 `edmId`）
 */
export type EdmUrlResolver = (
  attachmentId: string,
  edmId: string,
  kind: EdmUploadKind,
  result?: EdmUploadResult,
) => string | Promise<string>;

/** `upload-start` / `upload-error` 事件的 payload */
export interface EdmUploadEventPayload {
  file: File;
  kind: EdmUploadKind;
}

/** `upload-success` 事件的 payload */
export interface EdmUploadSuccessPayload extends EdmUploadEventPayload {
  result: EdmUploadResult;
}

/** `upload-error` 事件的 payload */
export interface EdmUploadErrorPayload extends EdmUploadEventPayload {
  error: unknown;
}

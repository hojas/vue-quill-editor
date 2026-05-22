import Quill from 'quill';
import type { EdmEmbedValue, EdmUploadKind } from '../types/edm';

// ============================================================
// URL helpers
// ============================================================

/**
 * 默认的 EDM 下载 URL 模板。
 *
 * 当使用者未提供 `resolvePreviewUrl` / `resolveDownloadUrl` 时，
 * 图片/视频/文件均通过此地址访问。
 */
function defaultEdmDownloadUrl(edmId: string): string {
  return `/api/edm/${encodeURIComponent(edmId)}/download`;
}

/**
 * 白名单校验资源 URL，防止 XSS via `javascript:` 等危险协议。
 * 仅放行 `http:`、`https:`、`blob:`、`data:` 及相对路径。
 */
function sanitizeResourceUrl(url: string): string {
  if (!url) return '';

  if (url.startsWith('/') || url.startsWith('./') || url.startsWith('../')) {
    return url;
  }

  try {
    const base = globalThis.location?.origin || 'http://localhost';
    const parsedUrl = new URL(url, base);
    const allowedProtocols = new Set(['http:', 'https:', 'blob:', 'data:']);
    return allowedProtocols.has(parsedUrl.protocol) ? url : '';
  } catch {
    return '';
  }
}

/**
 * 将原始值或字符串规范化为完整的 `EdmEmbedValue`。
 *
 * 当 delta 中存储的是纯 `edmId` 字符串时，自动补全 `url` 字段。
 */
function normalizeValue(value: EdmEmbedValue | string): EdmEmbedValue {
  if (typeof value === 'string') {
    return { edmId: value, url: defaultEdmDownloadUrl(value) };
  }
  return {
    edmId: value.edmId,
    attachmentId: value.attachmentId,
    url: value.url || defaultEdmDownloadUrl(value.edmId),
    name: value.name,
    mimeType: value.mimeType,
    size: value.size,
  };
}

// ============================================================
// DOM attribute helpers
// ============================================================

/**
 * 将 EDM 元数据写入 DOM 元素的 `data-*` 属性。
 *
 * 在 blot 的 `create` 阶段调用，确保序列化后的 HTML 携带完整的
 * `data-edm-id` / `data-edm-type` / `data-file-name` 等信息。
 */
function setCommonAttributes(
  node: HTMLElement,
  value: EdmEmbedValue,
  kind: EdmUploadKind,
): void {
  node.setAttribute('data-edm-id', value.edmId);
  node.setAttribute('data-edm-type', kind);
  if (typeof value.attachmentId === 'number') {
    node.setAttribute('data-attachment-id', String(value.attachmentId));
  }
  if (value.name) {
    node.setAttribute('data-file-name', value.name);
    node.setAttribute('title', value.name);
  }
  if (value.mimeType) {
    node.setAttribute('data-mime-type', value.mimeType);
  }
  if (typeof value.size === 'number') {
    node.setAttribute('data-file-size', String(value.size));
  }
}

/**
 * 从 DOM 元素反向读取 EDM 元数据。
 *
 * 在 blot 的 `value` 阶段调用，用于从已渲染的 HTML 还原 delta 值。
 * 优先从内部携带 `data-edm-id` 的子元素（如 `<img>` / `<video>` / `<a>`）读取，
 * 回退到容器元素自身。
 */
function readCommonValue(root: HTMLElement, urlAttribute: 'src' | 'href'): EdmEmbedValue {
  const target = findEdmTarget(root) || root;
  const edmId = target.getAttribute('data-edm-id') || root.getAttribute('data-edm-id') || '';
  const fallbackUrl = edmId ? defaultEdmDownloadUrl(edmId) : '';

  const attachmentIdRaw = target.getAttribute('data-attachment-id') || root.getAttribute('data-attachment-id');

  return {
    edmId,
    attachmentId: attachmentIdRaw ? Number(attachmentIdRaw) : undefined,
    url: target.getAttribute(urlAttribute) || fallbackUrl,
    name: target.getAttribute('data-file-name') || root.getAttribute('data-file-name') || target.getAttribute('title') || undefined,
    mimeType: target.getAttribute('data-mime-type') || root.getAttribute('data-mime-type') || undefined,
    size: Number(target.getAttribute('data-file-size') || root.getAttribute('data-file-size')) || undefined,
  };
}

/** 在容器元素内查找第一个携带 `data-edm-id` 的子元素 */
function findEdmTarget(root: HTMLElement): HTMLElement | null {
  return root.querySelector('[data-edm-id]');
}

// ============================================================
// Custom blots
// ============================================================

const BlockEmbed = Quill.import('blots/block/embed') as any;

/**
 * EDM 图片 Blot。
 *
 * 渲染为 `<edm-image>` 包裹 `<img>`，支持内联预览。
 * 携带 `data-edm-id` 等元数据用于序列化/反序列化。
 */
export class EdmImageBlot extends BlockEmbed {
  static blotName = 'edmImage';
  static tagName = 'edm-image';
  static className = 'ql-edm-image';

  static create(value: EdmEmbedValue | string): HTMLElement {
    const normalizedValue = normalizeValue(value);
    const node = super.create() as HTMLElement;
    const img = document.createElement('img');

    setCommonAttributes(node, normalizedValue, 'image');
    img.setAttribute('src', sanitizeResourceUrl(normalizedValue.url));
    img.setAttribute('alt', normalizedValue.name || 'uploaded image');
    setCommonAttributes(img, normalizedValue, 'image');
    node.append(img);

    return node;
  }

  static value(node: HTMLElement): EdmEmbedValue {
    return readCommonValue(node, 'src');
  }
}

/**
 * EDM 视频 Blot。
 *
 * 渲染为 `<edm-video>` 包裹 `<video>`（带 `controls`），支持播放预览。
 */
export class EdmVideoBlot extends BlockEmbed {
  static blotName = 'edmVideo';
  static tagName = 'edm-video';
  static className = 'ql-edm-video';

  static create(value: EdmEmbedValue | string): HTMLElement {
    const normalizedValue = normalizeValue(value);
    const node = super.create() as HTMLElement;
    const video = document.createElement('video');

    setCommonAttributes(node, normalizedValue, 'video');
    video.setAttribute('src', sanitizeResourceUrl(normalizedValue.url));
    video.setAttribute('controls', 'controls');
    video.setAttribute('preload', 'metadata');
    video.setAttribute('playsinline', 'true');
    setCommonAttributes(video, normalizedValue, 'video');
    node.append(video);

    return node;
  }

  static value(node: HTMLElement): EdmEmbedValue {
    return readCommonValue(node, 'src');
  }
}

/**
 * EDM 文件 Blot。
 *
 * 渲染为 `<edm-file>` 包裹 `<a>` 下载链接，不进行内联预览。
 */
export class EdmFileBlot extends BlockEmbed {
  static blotName = 'edmFile';
  static tagName = 'edm-file';
  static className = 'ql-edm-file';

  static create(value: EdmEmbedValue | string): HTMLElement {
    const normalizedValue = normalizeValue(value);
    const node = super.create() as HTMLElement;
    const link = document.createElement('a');
    const fileName = normalizedValue.name || `edm-file-${normalizedValue.edmId}`;

    setCommonAttributes(node, normalizedValue, 'file');
    link.setAttribute('href', sanitizeResourceUrl(normalizedValue.url));
    link.setAttribute('target', '_blank');
    link.setAttribute('rel', 'noopener noreferrer');
    link.setAttribute('download', fileName);
    link.textContent = fileName;
    setCommonAttributes(link, normalizedValue, 'file');
    node.append(link);

    return node;
  }

  static value(node: HTMLElement): EdmEmbedValue {
    return readCommonValue(node, 'href');
  }
}

// ============================================================
// Registration
// ============================================================

let registered = false;

/**
 * 向 Quill 注册三个自定义 EDM Blot 及其工具栏图标。
 *
 * - `edmImage` — 复用 Quill 内置 `image` 图标
 * - `edmVideo` — 复用 Quill 内置 `video` 图标
 * - `edmFile`  — 复用 Quill 内置 `link` 图标
 *
 * 调用是幂等的，重复调用不会重复注册。
 *
 * @example
 * ```ts
 * import { registerEdmBlots } from 'vue-quill-editor-edm';
 * registerEdmBlots();
 * ```
 */
export function registerEdmBlots(): void {
  if (registered) return;

  Quill.register(
    {
      'formats/edmImage': EdmImageBlot,
      'formats/edmVideo': EdmVideoBlot,
      'formats/edmFile': EdmFileBlot,
    },
    true,
  );

  const icons = Quill.import('ui/icons') as Record<string, string>;
  if (!icons['edmImage'] && icons['image']) {
    icons['edmImage'] = icons['image'];
  }
  if (!icons['edmVideo'] && icons['video']) {
    icons['edmVideo'] = icons['video'];
  }
  if (!icons['edmFile'] && icons['link']) {
    icons['edmFile'] = icons['link'];
  }

  registered = true;
}

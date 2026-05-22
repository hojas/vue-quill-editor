import Quill from 'quill';
import type { EdmEmbedValue, EdmUploadKind } from '../types/edm';

const BlockEmbed = Quill.import('blots/block/embed') as any;

let registered = false;

function normalizeValue(value: EdmEmbedValue | string): EdmEmbedValue {
  if (typeof value === 'string') {
    return {
      edmId: value,
      url: defaultEdmDownloadUrl(value),
    };
  }

  return {
    edmId: value.edmId,
    url: value.url || defaultEdmDownloadUrl(value.edmId),
    name: value.name,
    mimeType: value.mimeType,
    size: value.size,
  };
}

function defaultEdmDownloadUrl(edmId: string): string {
  return `/api/edm/${encodeURIComponent(edmId)}/download`;
}

function sanitizeResourceUrl(url: string): string {
  if (!url) {
    return '';
  }

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

function setCommonAttributes(
  node: HTMLElement,
  value: EdmEmbedValue,
  kind: EdmUploadKind,
): void {
  node.setAttribute('data-edm-id', value.edmId);
  node.setAttribute('data-edm-type', kind);

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

function readCommonValue(root: HTMLElement, urlAttribute: 'src' | 'href'): EdmEmbedValue {
  const target = findEdmTarget(root) || root;
  const edmId = target.getAttribute('data-edm-id') || root.getAttribute('data-edm-id') || '';
  const fallbackUrl = edmId ? defaultEdmDownloadUrl(edmId) : '';

  return {
    edmId,
    url: target.getAttribute(urlAttribute) || fallbackUrl,
    name:
      target.getAttribute('data-file-name') ||
      root.getAttribute('data-file-name') ||
      target.getAttribute('title') ||
      undefined,
    mimeType:
      target.getAttribute('data-mime-type') ||
      root.getAttribute('data-mime-type') ||
      undefined,
    size: Number(target.getAttribute('data-file-size') || root.getAttribute('data-file-size')) || undefined,
  };
}

function findEdmTarget(root: HTMLElement): HTMLElement | null {
  return root.querySelector('[data-edm-id]');
}

export class EdmImageBlot extends BlockEmbed {
  static blotName = 'edmImage';
  static tagName = 'edm-image';
  static className = 'ql-edm-image';

  static create(value: EdmEmbedValue | string): HTMLElement {
    const normalizedValue = normalizeValue(value);
    const node = super.create() as HTMLElement;
    const image = document.createElement('img');

    setCommonAttributes(node, normalizedValue, 'image');
    image.setAttribute('src', sanitizeResourceUrl(normalizedValue.url));
    image.setAttribute('alt', normalizedValue.name || 'uploaded image');
    setCommonAttributes(image, normalizedValue, 'image');
    node.append(image);

    return node;
  }

  static value(node: HTMLElement): EdmEmbedValue {
    return readCommonValue(node, 'src');
  }
}

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

export function registerEdmBlots(): void {
  if (registered) {
    return;
  }

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

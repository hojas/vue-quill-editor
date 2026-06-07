import Quill from 'quill';
import type { EdmEmbedValue, EdmUploadKind, EdmUrlResolver } from '../types/edm';
import { defaultEdmUrl, downloadFile, isUnresolvedUrl } from '../utils/helpers';
import { attachResizeHandles } from './imageResize';

// ============================================================
// Lazy loading — IntersectionObserver + resolver
// ============================================================

let lazyObserver: IntersectionObserver | null = null;
let resolvePreviewUrlResolver: EdmUrlResolver | undefined;

export function setEdmUrlResolvers(resolver?: EdmUrlResolver): void {
  resolvePreviewUrlResolver = resolver;
}

function getLazyObserver(): IntersectionObserver {
  if (!lazyObserver) {
    lazyObserver = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          const el = entry.target as HTMLElement;
          lazyObserver!.unobserve(el);
          const media = el.querySelector<HTMLImageElement | HTMLVideoElement>('img, video');
          if (media) void loadMedia(el, media);
        }
      },
      { rootMargin: '200px' },
    );
  }
  return lazyObserver;
}

async function loadMedia(
  el: HTMLElement,
  media: HTMLImageElement | HTMLVideoElement,
): Promise<void> {
  const edmId = media.dataset.edmId || el.getAttribute('data-edm-id') || '';
  const kind = (el.getAttribute('data-edm-type') as EdmUploadKind) || 'image';

  if (!resolvePreviewUrlResolver || !edmId) {
    el.classList.remove('ql-edm-loading');
    el.classList.add('ql-edm-error');
    return;
  }

  try {
    const attachmentId =
      media.dataset.attachmentId || el.getAttribute('data-attachment-id') || '';
    const src = await resolvePreviewUrlResolver(attachmentId, edmId, kind);
    if (!src) throw new Error('empty url');
    media.onload = media.onloadedmetadata = () => {
      el.classList.remove('ql-edm-loading');
      el.classList.add('ql-edm-loaded');
    };
    media.onerror = () => {
      el.classList.remove('ql-edm-loading');
      el.classList.add('ql-edm-error');
    };
    media.src = src;
  } catch {
    el.classList.remove('ql-edm-loading');
    el.classList.add('ql-edm-error');
  }
}

// ============================================================
// URL & attribute helpers
// ============================================================

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

function normalizeValue(value: EdmEmbedValue | string): EdmEmbedValue {
  if (typeof value === 'string') {
    return { edmId: value, url: defaultEdmUrl(value) };
  }
  return {
    edmId: value.edmId,
    attachmentId: value.attachmentId,
    url: value.url || defaultEdmUrl(value.edmId, value.attachmentId),
    name: value.name,
    mimeType: value.mimeType,
    size: value.size,
  };
}

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

function findEdmTarget(root: HTMLElement): HTMLElement | null {
  return root.querySelector('[data-edm-id]');
}

function readCommonValue(root: HTMLElement, urlAttribute: 'src' | 'href'): EdmEmbedValue {
  const target = findEdmTarget(root) || root;
  const edmId = target.getAttribute('data-edm-id') || root.getAttribute('data-edm-id') || '';
  const attachmentIdRaw =
    target.getAttribute('data-attachment-id') || root.getAttribute('data-attachment-id');
  const fallbackUrl = edmId
    ? defaultEdmUrl(edmId, attachmentIdRaw ? Number(attachmentIdRaw) : undefined)
    : '';

  return {
    edmId,
    attachmentId: attachmentIdRaw ? Number(attachmentIdRaw) : undefined,
    url: target.getAttribute(urlAttribute) || fallbackUrl,
    name:
      target.getAttribute('data-file-name') ||
      root.getAttribute('data-file-name') ||
      target.getAttribute('title') ||
      undefined,
    mimeType:
      target.getAttribute('data-mime-type') || root.getAttribute('data-mime-type') || undefined,
    size:
      Number(target.getAttribute('data-file-size') || root.getAttribute('data-file-size')) ||
      undefined,
  };
}

// ============================================================
// Custom blots
// ============================================================

const BlockEmbed = Quill.import('blots/block/embed') as any;

function mediaBlotValue(node: HTMLElement): EdmEmbedValue {
  const val = readCommonValue(node, 'src');
  if (!val.url || isUnresolvedUrl(val.url)) {
    const target = findEdmTarget(node) || node;
    const dataSrc = target.dataset.src;
    if (dataSrc) val.url = dataSrc;
  }
  // Read image dimensions from inline styles.
  const media = node.querySelector<HTMLImageElement | HTMLVideoElement>('img, video');
  if (media) {
    const w = parseInt(media.style.width, 10);
    const h = parseInt(media.style.height, 10);
    if (Number.isFinite(w)) val.width = w;
    if (Number.isFinite(h)) val.height = h;
  }
  return val;
}

function createMediaBlot(
  value: EdmEmbedValue | string,
  kind: 'image' | 'video',
  tagName: string,
  className: string,
): HTMLElement {
  const normalizedValue = normalizeValue(value);
  const node = document.createElement(tagName);
  node.classList.add(className);
  const media = document.createElement(kind === 'image' ? 'img' : 'video');

  setCommonAttributes(node, normalizedValue, kind);
  media.dataset.src = sanitizeResourceUrl(normalizedValue.url);
  if (kind === 'image') {
    media.setAttribute('alt', normalizedValue.name || 'uploaded image');
    if (normalizedValue.width) {
      media.style.width = `${normalizedValue.width}px`;
      media.style.maxWidth = 'none';
    }
    if (normalizedValue.height) {
      media.style.height = `${normalizedValue.height}px`;
    }
  } else {
    media.setAttribute('controls', 'controls');
    media.setAttribute('preload', 'metadata');
    media.setAttribute('playsinline', 'true');
  }
  setCommonAttributes(media, normalizedValue, kind);
  node.classList.add('ql-edm-loading');
  node.append(media);

  if (kind === 'image') {
    attachResizeHandles(node);
  }

  getLazyObserver().observe(node);
  return node;
}


export class EdmImageBlot extends BlockEmbed {
  static blotName = 'edmImage';
  static tagName = 'edm-image';
  static className = 'ql-edm-image';

  static create = (value: EdmEmbedValue | string) =>
    createMediaBlot(value, 'image', 'edm-image', 'ql-edm-image');

  static value = mediaBlotValue;
}

export class EdmVideoBlot extends BlockEmbed {
  static blotName = 'edmVideo';
  static tagName = 'edm-video';
  static className = 'ql-edm-video';

  static create = (value: EdmEmbedValue | string) =>
    createMediaBlot(value, 'video', 'edm-video', 'ql-edm-video');

  static value = mediaBlotValue;
}

export class EdmFileBlot extends BlockEmbed {
  static blotName = 'edmFile';
  static tagName = 'edm-file';
  static className = 'ql-edm-file';

  static create(value: EdmEmbedValue | string): HTMLElement {
    const normalizedValue = normalizeValue(value);
    const node = document.createElement('edm-file');
    node.classList.add('ql-edm-file');
    const link = document.createElement('a');
    const fileName = normalizedValue.name || `edm-file-${normalizedValue.edmId}`;

    setCommonAttributes(node, normalizedValue, 'file');
    link.setAttribute('href', sanitizeResourceUrl(normalizedValue.url));
    link.setAttribute('rel', 'noopener noreferrer');
    link.setAttribute('download', fileName);
    link.textContent = fileName;
    link.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      const url = link.getAttribute('href');
      if (url) void downloadFile(url, fileName);
    });
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
  if (!icons['edmFile']) {
    icons['edmFile'] = `<svg viewBox="0 0 18 18" xmlns="http://www.w3.org/2000/svg">
  <path d="M9.5 11V3.5m0 0L7 6m2.5-2.5L12 6" stroke="currentColor" fill="none" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>
  <path d="M3.5 8.5v4a2 2 0 0 0 2 2h7a2 2 0 0 0 2-2v-4" stroke="currentColor" fill="none" stroke-width="1.6" stroke-linecap="round"/>
</svg>`;
  }

  registered = true;
}

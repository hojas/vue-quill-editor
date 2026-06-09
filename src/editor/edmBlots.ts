import type { EdmEmbedValue, EdmUploadKind, EdmUrlResolver } from '../shared/types'
import Quill from 'quill'
import { toUrl } from '../shared/utils'
import { attachResizeHandles } from './imageResize'

// ============================================================
// 懒加载 — IntersectionObserver + URL 解析器
// ============================================================

/** 编辑器内的懒加载观察器（单例） */
let lazyObserver: IntersectionObserver | null = null
/** 外部注入的预览 URL 解析器，在图片/视频进入视口时调用 */
let resolveUrlResolver: EdmUrlResolver | undefined
/** 外部注入的文件下载解析器，在点击文件时调用 */
let resolveDownloadResolver: EdmUrlResolver | undefined

/**
 * 注入 URL 解析器，供懒加载和文件下载时调用。
 *
 * 由 `useEdmEditor` 在 onMounted 中调用一次。
 */
export function setEdmUrlResolvers(
  previewResolver?: EdmUrlResolver,
  downloadResolver?: EdmUrlResolver,
): void {
  resolveUrlResolver = previewResolver
  resolveDownloadResolver = downloadResolver
}

/**
 * 获取/创建懒加载 IntersectionObserver（单例）。
 *
 * 元素进入视口（提前 200px）时取消观察，并触发 loadMedia 获取真实 URL。
 */
function getLazyObserver(): IntersectionObserver {
  if (!lazyObserver) {
    lazyObserver = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting)
            continue
          const el = entry.target as HTMLElement
          lazyObserver!.unobserve(el)
          const media = el.querySelector<HTMLImageElement | HTMLVideoElement>('img, video')
          if (media)
            void loadMedia(el, media)
        }
      },
      { rootMargin: '200px' },
    )
  }
  return lazyObserver
}

/**
 * 为图片/视频元素加载展示 URL。
 *
 * data-src 已有 CDN URL（由 upload 返回）时直接使用，避免冗余 API 调用。
 * 否则通过外部注入的 resolveUrlResolver 获取。
 */
async function loadMedia(
  el: HTMLElement,
  media: HTMLImageElement | HTMLVideoElement,
): Promise<void> {
  // 上传时已返回 CDN URL → 直接使用，不调 resolver
  if (media.dataset.src && !media.dataset.src.startsWith('/api/')) {
    setMediaHandlers(el, media)
    media.src = media.dataset.src
    return
  }

  const edmId = media.dataset.edmId || el.getAttribute('data-edm-id') || ''
  const kind = (el.getAttribute('data-edm-type') as EdmUploadKind) || 'image'

  if (!resolveUrlResolver || !edmId) {
    el.classList.remove('ql-edm-loading')
    el.classList.add('ql-edm-error')
    return
  }

  try {
    const attachmentId
      = media.dataset.attachmentId || el.getAttribute('data-attachment-id') || ''
    const src = toUrl(await resolveUrlResolver(attachmentId, edmId, kind), kind)
    if (!src)
      throw new Error('empty url')
    setMediaHandlers(el, media)
    media.src = src
  }
  catch {
    el.classList.remove('ql-edm-loading')
    el.classList.add('ql-edm-error')
  }
}

/** 绑定媒体加载成功/失败的状态切换 */
function setMediaHandlers(
  el: HTMLElement,
  media: HTMLImageElement | HTMLVideoElement,
): void {
  media.onload = media.onloadedmetadata = () => {
    el.classList.remove('ql-edm-loading')
    el.classList.add('ql-edm-loaded')
  }
  media.onerror = () => {
    el.classList.remove('ql-edm-loading')
    el.classList.add('ql-edm-error')
  }
}

// ============================================================
// URL 安全校验 & 属性读写
// ============================================================

/**
 * 校验并返回安全的资源 URL。
 *
 * 允许相对路径和已知安全协议（http/https/blob/data），
 * 拒绝 javascript: 等危险协议。
 */
function sanitizeResourceUrl(url: string): string {
  if (!url)
    return ''
  if (url.startsWith('/') || url.startsWith('./') || url.startsWith('../')) {
    return url
  }
  try {
    const base = globalThis.location?.origin || 'http://localhost'
    const parsedUrl = new URL(url, base)
    const allowedProtocols = new Set(['http:', 'https:', 'blob:', 'data:'])
    return allowedProtocols.has(parsedUrl.protocol) ? url : ''
  }
  catch {
    return ''
  }
}

/**
 * 将存储值归一化为完整的 EdmEmbedValue 对象。
 *
 * 支持从旧版纯字符串 edmId 反序列化。
 */
function normalizeValue(value: EdmEmbedValue | string): EdmEmbedValue {
  if (typeof value === 'string') {
    return { edmId: value, url: '' }
  }
  return {
    edmId: value.edmId,
    attachmentId: value.attachmentId,
    url: value.url || '',
    name: value.name,
    mimeType: value.mimeType,
    size: value.size,
  }
}

/**
 * 将 EDM 元数据写入 DOM 元素的 data-* 属性。
 */
function setCommonAttributes(
  node: HTMLElement,
  value: EdmEmbedValue,
  kind: EdmUploadKind,
): void {
  node.setAttribute('data-edm-id', value.edmId)
  node.setAttribute('data-edm-type', kind)
  if (typeof value.attachmentId === 'number') {
    node.setAttribute('data-attachment-id', String(value.attachmentId))
  }
  if (value.name) {
    node.setAttribute('data-file-name', value.name)
    node.setAttribute('title', value.name)
  }
  if (value.mimeType) {
    node.setAttribute('data-mime-type', value.mimeType)
  }
  if (typeof value.size === 'number') {
    node.setAttribute('data-file-size', String(value.size))
  }
}

/**
 * 在 Quill blot 根节点中查找第一个包含 data-edm-id 的子元素。
 */
function findEdmTarget(root: HTMLElement): HTMLElement | null {
  return root.querySelector('[data-edm-id]')
}

/**
 * 从 DOM 元素回读 EDM 元数据，构建 EdmEmbedValue。
 *
 * 用于 Quill blot 的 `static value()` 方法（编辑器 → delta 序列化）。
 *
 * @param root         - blot 根节点
 * @param urlAttribute - 读取 URL 的属性名：image/video 用 `src`，file 用 `href`
 */
function readCommonValue(root: HTMLElement, urlAttribute: 'src' | 'href'): EdmEmbedValue {
  const target = findEdmTarget(root) || root
  const edmId = target.getAttribute('data-edm-id') || root.getAttribute('data-edm-id') || ''
  const attachmentIdRaw
    = target.getAttribute('data-attachment-id') || root.getAttribute('data-attachment-id')
  return {
    edmId,
    attachmentId: attachmentIdRaw ? Number(attachmentIdRaw) : undefined,
    url: target.getAttribute(urlAttribute) || '',
    name:
      target.getAttribute('data-file-name')
      || root.getAttribute('data-file-name')
      || target.getAttribute('title')
      || undefined,
    mimeType:
      target.getAttribute('data-mime-type') || root.getAttribute('data-mime-type') || undefined,
    size:
      Number(target.getAttribute('data-file-size') || root.getAttribute('data-file-size'))
      || undefined,
  }
}

// ============================================================
// 自定义 Blot 定义
// ============================================================

const BlockEmbed = Quill.import('blots/block/embed') as any

/**
 * 从图片/视频 blot 的 DOM 读取 EdmEmbedValue。
 *
 * URL 未解析时优先取 media.dataset.src（真实 URL 在懒加载后才写入）。
 * 同时读取 inline style 中的 width/height 用于图片尺寸回写。
 */
function mediaBlotValue(node: HTMLElement): EdmEmbedValue {
  const val = readCommonValue(node, 'src')
  if (!val.url) {
    // URL 未存储时，尝试从 data-src 读取
    const target = findEdmTarget(node) || node
    const dataSrc = target.dataset.src
    if (dataSrc)
      val.url = dataSrc
  }
  // 从 inline style 读取图片缩放尺寸
  const media = node.querySelector<HTMLImageElement | HTMLVideoElement>('img, video')
  if (media) {
    const w = Number.parseInt(media.style.width, 10)
    const h = Number.parseInt(media.style.height, 10)
    if (Number.isFinite(w))
      val.width = w
    if (Number.isFinite(h))
      val.height = h
  }
  return val
}

/**
 * 创建图片/视频 blot 的 DOM 结构。
 *
 * 结构：`<edm-image/video> → <img/video>`，外层容器负责状态类，内层媒体元素持有 data-src。
 * 创建后注册到懒加载观察器。
 */
function createMediaBlot(
  value: EdmEmbedValue | string,
  kind: 'image' | 'video',
  tagName: string,
  className: string,
): HTMLElement {
  const normalizedValue = normalizeValue(value)
  const node = document.createElement(tagName)
  node.classList.add(className)
  const media = document.createElement(kind === 'image' ? 'img' : 'video')

  setCommonAttributes(node, normalizedValue, kind)
  media.dataset.src = sanitizeResourceUrl(normalizedValue.url)
  if (kind === 'image') {
    media.setAttribute('alt', normalizedValue.name || 'uploaded image')
    if (normalizedValue.width) {
      media.style.width = `${normalizedValue.width}px`
      media.style.maxWidth = 'none'
    }
    if (normalizedValue.height) {
      media.style.height = `${normalizedValue.height}px`
    }
  }
  else {
    media.setAttribute('controls', 'controls')
    media.setAttribute('preload', 'metadata')
    media.setAttribute('playsinline', 'true')
  }
  setCommonAttributes(media, normalizedValue, kind)
  node.classList.add('ql-edm-loading')
  node.append(media)

  // 图片附加缩放把手
  if (kind === 'image') {
    attachResizeHandles(node)
  }

  // 注册到懒加载观察器
  getLazyObserver().observe(node)
  return node
}

/** 图片嵌入 Blot。使用自定义 `<edm-image>` 标签，支持懒加载和拖拽缩放。 */
export class EdmImageBlot extends BlockEmbed {
  static blotName = 'edmImage'
  static tagName = 'edm-image'
  static className = 'ql-edm-image'

  static create = (value: EdmEmbedValue | string): HTMLElement =>
    createMediaBlot(value, 'image', 'edm-image', 'ql-edm-image')

  static value = mediaBlotValue
}

/** 视频嵌入 Blot。使用自定义 `<edm-video>` 标签，支持懒加载和控制条。 */
export class EdmVideoBlot extends BlockEmbed {
  static blotName = 'edmVideo'
  static tagName = 'edm-video'
  static className = 'ql-edm-video'

  static create = (value: EdmEmbedValue | string): HTMLElement =>
    createMediaBlot(value, 'video', 'edm-video', 'ql-edm-video')

  static value = mediaBlotValue
}

/** 文件嵌入 Blot。使用自定义 `<edm-file>` 标签，渲染为可下载的链接。 */
export class EdmFileBlot extends BlockEmbed {
  static blotName = 'edmFile'
  static tagName = 'edm-file'
  static className = 'ql-edm-file'

  /**
   * 创建文件下载链接 DOM。
   *
   * 点击时通过 `downloadFile` 以 blob 方式下载，失败降级为新窗口打开。
   */
  static create(value: EdmEmbedValue | string): HTMLElement {
    const normalizedValue = normalizeValue(value)
    const node = document.createElement('edm-file')
    node.classList.add('ql-edm-file')
    const link = document.createElement('a')
    const fileName = normalizedValue.name || `edm-file-${normalizedValue.edmId}`

    setCommonAttributes(node, normalizedValue, 'file')
    link.setAttribute('href', sanitizeResourceUrl(normalizedValue.url))
    link.setAttribute('rel', 'noopener noreferrer')
    link.setAttribute('download', fileName)
    link.textContent = fileName
    link.addEventListener('click', (event) => {
      event.preventDefault()
      event.stopPropagation()
      void resolveDownloadResolver?.(
        link.getAttribute('data-attachment-id') || '',
        normalizedValue.edmId,
        'file',
      )
    })
    setCommonAttributes(link, normalizedValue, 'file')
    node.append(link)

    return node
  }

  static value(node: HTMLElement): EdmEmbedValue {
    return readCommonValue(node, 'href')
  }
}

// ============================================================
// 注册
// ============================================================

/** 防止重复注册的标记 */
let registered = false

/**
 * 向 Quill 注册所有 EDM 自定义 Blot 及工具栏图标。
 *
 * 仅首次调用生效，重复调用会被跳过。
 */
export function registerEdmBlots(): void {
  if (registered)
    return

  Quill.register(
    {
      'formats/edmImage': EdmImageBlot,
      'formats/edmVideo': EdmVideoBlot,
      'formats/edmFile': EdmFileBlot,
    },
    true,
  )

  // 复用 Quill 内置图标作为自定义按钮的图标
  const icons = Quill.import('ui/icons') as Record<string, string>
  if (!icons.edmImage && icons.image) {
    icons.edmImage = icons.image
  }
  if (!icons.edmVideo && icons.video) {
    icons.edmVideo = icons.video
  }
  if (!icons.edmFile) {
    icons.edmFile = `<svg viewBox="0 0 18 18" xmlns="http://www.w3.org/2000/svg">
  <path d="M9.5 11V3.5m0 0L7 6m2.5-2.5L12 6" stroke="currentColor" fill="none" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>
  <path d="M3.5 8.5v4a2 2 0 0 0 2 2h7a2 2 0 0 0 2-2v-4" stroke="currentColor" fill="none" stroke-width="1.6" stroke-linecap="round"/>
</svg>`
  }

  registered = true
}

import { Node } from '@tiptap/core'

/**
 * 构建 EDM 嵌入元素的公共 data-* 属性。
 *
 * 保持与 Quill version（edmBlots.ts → setCommonAttributes）一致的属性名和结构。
 */
function commonAttrs(attrs: Record<string, any>): Record<string, string> {
  const out: Record<string, string> = {
    'data-edm-id': String(attrs.edmId || ''),
    'data-edm-type': attrs.edmType,
  }
  if (attrs.attachmentId != null) {
    out['data-attachment-id'] = String(attrs.attachmentId)
  }
  if (attrs.name) {
    out['data-file-name'] = attrs.name
    out.title = attrs.name
  }
  if (attrs.mimeType) {
    out['data-mime-type'] = attrs.mimeType
  }
  if (attrs.size != null) {
    out['data-file-size'] = String(attrs.size)
  }
  return out
}

/** 所有 EDM 节点共用的属性定义 */
const edmAttributes = {
  edmId: { default: '' },
  attachmentId: { default: null },
  url: { default: '' },
  name: { default: '' },
  mimeType: { default: '' },
  size: { default: null },
}

// ============================================================
// EdmImage — 对应 Quill EdmImageBlot
// ============================================================

export const EdmImage = Node.create({
  name: 'edmImage',
  group: 'block',
  atom: true,

  addAttributes() {
    return {
      ...edmAttributes,
      width: { default: null },
      height: { default: null },
    }
  },

  parseHTML() {
    return [{ tag: 'edm-image' }]
  },

  renderHTML({ node }) {
    const a = node.attrs as Record<string, any>
    const outerAttrs = { ...commonAttrs({ ...a, edmType: 'image' }) }
    const imgAttrs: Record<string, string> = {
      'src': a.url || '',
      'alt': a.name || 'uploaded image',
      'data-edm-id': String(a.edmId || ''),
      'data-edm-type': 'image',
      'data-src': a.url || '',
    }
    if (a.attachmentId != null)
      imgAttrs['data-attachment-id'] = String(a.attachmentId)
    const style: string[] = []
    if (a.width != null)
      style.push(`width:${a.width}px`, 'max-width:none')
    if (a.height != null)
      style.push(`height:${a.height}px`)
    if (style.length)
      imgAttrs.style = style.join(';')

    return [
      'edm-image',
      { ...outerAttrs, class: 'ql-edm-image ql-edm-loaded' },
      ['img', imgAttrs],
    ]
  },
})

// ============================================================
// EdmVideo — 对应 Quill EdmVideoBlot
// ============================================================

export const EdmVideo = Node.create({
  name: 'edmVideo',
  group: 'block',
  atom: true,

  addAttributes() {
    return edmAttributes
  },

  parseHTML() {
    return [{ tag: 'edm-video' }]
  },

  renderHTML({ node }) {
    const a = node.attrs as Record<string, any>
    const outerAttrs = { ...commonAttrs({ ...a, edmType: 'video' }) }
    const videoAttrs: Record<string, string> = {
      'src': a.url || '',
      'controls': 'controls',
      'preload': 'metadata',
      'playsinline': 'true',
      'data-edm-id': String(a.edmId || ''),
      'data-edm-type': 'video',
      'data-src': a.url || '',
    }
    if (a.attachmentId != null)
      videoAttrs['data-attachment-id'] = String(a.attachmentId)

    return [
      'edm-video',
      { ...outerAttrs, class: 'ql-edm-video ql-edm-loaded' },
      ['video', videoAttrs],
    ]
  },
})

// ============================================================
// EdmFile — 对应 Quill EdmFileBlot
// ============================================================

export const EdmFile = Node.create({
  name: 'edmFile',
  group: 'block',
  atom: true,

  addAttributes() {
    return edmAttributes
  },

  parseHTML() {
    return [{ tag: 'edm-file' }]
  },

  renderHTML({ node }) {
    const a = node.attrs as Record<string, any>
    const outerAttrs = { ...commonAttrs({ ...a, edmType: 'file' }) }
    const fileName = a.name || `edm-file-${a.edmId}`
    const linkAttrs: Record<string, string> = {
      'href': a.url || '#',
      'rel': 'noopener noreferrer',
      'download': fileName,
      'data-edm-id': String(a.edmId || ''),
      'data-edm-type': 'file',
    }
    if (a.attachmentId != null)
      linkAttrs['data-attachment-id'] = String(a.attachmentId)
    if (a.name)
      linkAttrs['data-file-name'] = a.name
    if (a.mimeType)
      linkAttrs['data-mime-type'] = a.mimeType
    if (a.size != null)
      linkAttrs['data-file-size'] = String(a.size)

    return [
      'edm-file',
      { ...outerAttrs, class: 'ql-edm-file' },
      ['a', linkAttrs, fileName],
    ]
  },
})

/** 所有 EDM 自定义节点，用于编辑器 extensions 注册 */
export const edmNodes = [EdmImage, EdmVideo, EdmFile]

/**
 * 从编辑器 DOM 中提取 EDM 附件列表。
 *
 * 遍历所有包含 `data-edm-id` 的元素，去重后返回。
 * 保持与 useEdmEditor.ts → extractAttachments 一致的逻辑。
 */
export function extractAttachments(root: HTMLElement): { edmId: string, attachmentId?: number, kind: string }[] {
  const els = root.querySelectorAll<HTMLElement>('[data-edm-id]')
  const seen = new Set<string>()
  const list: { edmId: string, attachmentId?: number, kind: string }[] = []
  els.forEach((el) => {
    const edmId = el.getAttribute('data-edm-id')
    if (!edmId || seen.has(edmId))
      return
    seen.add(edmId)
    const raw = el.getAttribute('data-attachment-id')
    list.push({
      edmId,
      attachmentId: raw ? Number(raw) : undefined,
      kind: el.getAttribute('data-edm-type') || 'file',
    })
  })
  return list
}

/**
 * 根据 EdmEmbedValue 构建插入 TipTap 的节点数据。
 *
 * Node type 命名与 Quill blotName 一致，保持内部一致性。
 */
export function buildNodeInsert(kind: string, value: {
  edmId: string
  attachmentId?: number
  url: string
  name?: string
  mimeType?: string
  size?: number
  width?: number
  height?: number
}): { type: string, attrs: Record<string, any> } {
  const name = kind === 'image' ? 'edmImage' : kind === 'video' ? 'edmVideo' : 'edmFile'
  return {
    type: name,
    attrs: {
      edmId: value.edmId,
      attachmentId: value.attachmentId,
      url: value.url,
      name: value.name,
      mimeType: value.mimeType,
      size: value.size,
      width: value.width,
      height: value.height,
    },
  }
}

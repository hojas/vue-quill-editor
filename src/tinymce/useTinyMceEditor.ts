import type { Editor } from 'tinymce'
import type { ComputedRef, Ref } from 'vue'
import type {
  EdmAttachment,
  EdmEmbedValue,
  EdmUploadHandler,
  EdmUploadKind,
  EdmUploadResult,
  EdmUploadSuccessPayload,
  EdmUrlResolver,
} from '../shared/types'
import { computed, onBeforeUnmount, ref, shallowRef, watch } from 'vue'
import {
  getErrorMessage,
  inferUploadKind,
  toUrl,
} from '../shared/utils'

/** 编辑器配置 */
export interface EdmConfig {
  maxCount: number
}

export interface UseTinyMceEditorProps {
  modelValue: string
  placeholder: string
  readOnly: boolean
  upload: EdmUploadHandler
  fetchConfig?: () => Promise<EdmConfig>
  resolvePreviewUrl?: EdmUrlResolver
  resolveDownloadUrl?: EdmUrlResolver
  imageAccept: string
  videoAccept: string
  fileAccept: string
}

export interface UseTinyMceEditorReturn {
  editorRef: Ref<Editor | null>
  imageInputRef: Ref<HTMLInputElement | null>
  videoInputRef: Ref<HTMLInputElement | null>
  fileInputRef: Ref<HTMLInputElement | null>
  errorMessage: Ref<string>
  isBusy: ComputedRef<boolean>
  uploadingLabel: ComputedRef<string>
  isUploadLimitReached: ComputedRef<boolean>
  maxCount: Ref<number>
  uploadedCount: ComputedRef<number>
  handleFileInputChange: (kind: EdmUploadKind, e: Event) => void
  openFilePicker: (kind: EdmUploadKind) => void
  editorInit: ComputedRef<Record<string, any>>
}

export interface UseTinyMceEditorEmit {
  (event: 'update:modelValue', value: string): void
  (event: 'change', value: string): void
  (event: 'upload-start', payload: { file: File, kind: EdmUploadKind }): void
  (event: 'upload-success', payload: EdmUploadSuccessPayload): void
  (event: 'upload-error', payload: { file: File, kind: EdmUploadKind, error: unknown }): void
  (event: 'update:attachmentList', value: EdmAttachment[]): void
}

/**
 * TinyMCE 富文本编辑器 composable。
 *
 * 封装 TinyMCE 实例的 init 配置、文件上传管线（选择 → 上传 → 插入 HTML）、
 * HTML 同步、粘贴/拖拽拦截、文件下载点击处理。
 *
 * 保持与 `useEdmEditor` 相同的 props/emits 签名。
 */
export function useTinyMceEditor(
  props: UseTinyMceEditorProps,
  emit: UseTinyMceEditorEmit,
): UseTinyMceEditorReturn {
  // ---- DOM refs ----
  const imageInputRef = ref<HTMLInputElement | null>(null)
  const videoInputRef = ref<HTMLInputElement | null>(null)
  const fileInputRef = ref<HTMLInputElement | null>(null)

  // ---- TinyMCE instance ----
  const editorRef = shallowRef<Editor | null>(null)

  // ---- state ----
  const uploadingKind = shallowRef<EdmUploadKind | null>(null)
  const errorMessage = shallowRef('')
  const maxCount = ref(5)
  const committedCount = ref(0)
  let pendingCount = 0
  const totalUploaded = (): number => committedCount.value + pendingCount
  const lastHtml = shallowRef('')

  const UPLOAD_LABEL: Record<EdmUploadKind, string> = {
    image: '图片上传中',
    video: '视频上传中',
    file: '文件上传中',
  }

  // ---- computed ----
  const isBusy = computed(() => uploadingKind.value !== null)
  const uploadingLabel = computed(() => UPLOAD_LABEL[uploadingKind.value || 'file'])
  const isUploadLimitReached = computed(() => totalUploaded() >= maxCount.value)
  const uploadedCount = computed(totalUploaded)

  // ---- HTML helpers ----
  function escapeAttr(value: string): string {
    return value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  }

  function escapeHtml(value: string): string {
    return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  }

  // ---- HTML sync ----
  function getEditorHtml(): string {
    return editorRef.value?.getContent() ?? ''
  }

  function extractAttachments(html: string): EdmAttachment[] {
    const parser = new DOMParser()
    const doc = parser.parseFromString(html, 'text/html')
    const els = doc.querySelectorAll<HTMLElement>('[data-edm-id]')
    const seen = new Set<string>()
    const list: EdmAttachment[] = []
    els.forEach((el) => {
      const edmId = el.getAttribute('data-edm-id')
      if (!edmId || seen.has(edmId))
        return
      seen.add(edmId)
      const raw = el.getAttribute('data-attachment-id')
      list.push({
        edmId,
        attachmentId: raw ? Number(raw) : undefined,
        kind: (el.getAttribute('data-edm-type') as EdmUploadKind) || 'file',
      })
    })
    return list
  }

  function syncHtmlFromEditor(): void {
    const html = getEditorHtml()
    if (html === lastHtml.value)
      return
    lastHtml.value = html
    const attachments = extractAttachments(html)
    committedCount.value = attachments.length
    emit('update:modelValue', html)
    emit('change', html)
    emit('update:attachmentList', attachments)
  }

  // ---- modelValue watcher ----
  watch(
    () => props.modelValue,
    (nextValue) => {
      const ed = editorRef.value
      if (!ed || nextValue === lastHtml.value)
        return
      ed.setContent(nextValue)
      bootstrapMedia()
      syncHtmlFromEditor()
    },
  )

  // ---- readOnly watcher ----
  watch(
    () => props.readOnly,
    (nextReadOnly) => {
      editorRef.value?.mode.set(nextReadOnly ? 'readonly' : 'design')
    },
  )

  // ---- File picker ----
  function openFilePicker(kind: EdmUploadKind): void {
    if (props.readOnly || isBusy.value)
      return
    if (totalUploaded() >= maxCount.value) {
      errorMessage.value = `最多上传 ${maxCount.value} 个文件`
      return
    }
    const target = kind === 'image' ? imageInputRef : kind === 'video' ? videoInputRef : fileInputRef
    target.value?.click()
  }

  async function handleFileInputChange(kind: EdmUploadKind, event: Event): Promise<void> {
    const input = event.target as HTMLInputElement
    const files = Array.from(input.files || [])
    input.value = ''
    if (!files.length)
      return
    await insertFiles(files, kind)
  }

  // ---- File insertion ----
  async function insertFiles(files: File[], forcedKind?: EdmUploadKind): Promise<void> {
    if (!editorRef.value || props.readOnly)
      return
    const remaining = maxCount.value - totalUploaded()
    if (remaining <= 0)
      return
    const toUpload = files.slice(0, remaining)
    pendingCount += toUpload.length
    for (const file of toUpload) {
      const kind = forcedKind || inferUploadKind(file)
      try {
        await uploadAndInsert(file, kind)
      }
      catch {
        pendingCount--
      }
    }
  }

  // ---- Upload & embed ----
  async function uploadAndInsert(file: File, kind: EdmUploadKind): Promise<void> {
    const ed = editorRef.value
    if (!ed)
      return

    errorMessage.value = ''
    uploadingKind.value = kind
    emit('upload-start', { file, kind })

    try {
      const result = await props.upload(file, kind)
      if (!result.edmId)
        throw new Error('上传接口未返回 edmId')

      const embedValue = await buildEmbedValue(file, kind, result)
      const html = buildEmbedHtml(kind, embedValue)

      ed.insertContent(html)
      pendingCount--
      syncHtmlFromEditor()
      emit('upload-success', { file, kind, result })
    }
    catch (error) {
      errorMessage.value = getErrorMessage(error)
      emit('upload-error', { file, kind, error })
      throw error
    }
    finally {
      uploadingKind.value = null
    }
  }

  async function buildEmbedValue(
    file: File,
    kind: EdmUploadKind,
    result: EdmUploadResult,
  ): Promise<EdmEmbedValue> {
    const baseUrl = result.downloadUrl || result.url
    const resolved = kind !== 'file'
      ? (baseUrl || (await props.resolvePreviewUrl?.('', result.edmId, kind, result)))
      : (baseUrl || '')
    const url = toUrl(resolved, kind)

    return {
      edmId: result.edmId,
      attachmentId: result.attachmentId,
      url,
      name: result.fileName || file.name,
      mimeType: result.mimeType || file.type,
      size: result.size ?? file.size,
    }
  }

  /** 构建与 Quill blot 输出一致的 EDM HTML */
  function buildEmbedHtml(kind: EdmUploadKind, value: EdmEmbedValue): string {
    const aid = value.attachmentId != null ? ` data-attachment-id="${value.attachmentId}"` : ''
    const name = value.name ? ` data-file-name="${escapeAttr(value.name)}" title="${escapeAttr(value.name)}"` : ''
    const mime = value.mimeType ? ` data-mime-type="${escapeAttr(value.mimeType)}"` : ''
    const size = value.size != null ? ` data-file-size="${value.size}"` : ''
    const edmId = escapeAttr(value.edmId)
    const url = escapeAttr(value.url)

    if (kind === 'image') {
      const w = (value as any).width ? `width:${(value as any).width}px;max-width:none;` : ''
      const h = (value as any).height ? `height:${(value as any).height}px;` : ''
      const style = w || h ? ` style="${w}${h}"` : ''
      return `<edm-image class="ql-edm-image ql-edm-loaded" data-edm-id="${edmId}" data-edm-type="image"${aid}${name}${mime}${size}><img src="${url}" alt="${escapeAttr(value.name || 'uploaded image')}" data-src="${url}" data-edm-id="${edmId}" data-edm-type="image"${aid}${style}></edm-image>`
    }

    if (kind === 'video') {
      return `<edm-video class="ql-edm-video ql-edm-loaded" data-edm-id="${edmId}" data-edm-type="video"${aid}${name}${mime}${size}><video src="${url}" controls preload="metadata" playsinline data-src="${url}" data-edm-id="${edmId}" data-edm-type="video"${aid}></video></edm-video>`
    }

    const fileName = escapeAttr(value.name || `edm-file-${value.edmId}`)
    return `<edm-file class="ql-edm-file" data-edm-id="${edmId}" data-edm-type="file"${aid}${name}${mime}${size}><a href="${url}" rel="noopener noreferrer" download="${fileName}" data-edm-id="${edmId}" data-edm-type="file"${aid}${name}>${escapeHtml(value.name || fileName)}</a></edm-file>`
  }

  // ---- Paste & drop handler ----
  function handleEditorPaste(evt: ClipboardEvent): void {
    const files = Array.from(evt.clipboardData?.files || [])
    if (!files.length)
      return
    evt.preventDefault()
    evt.stopImmediatePropagation()

    const remaining = maxCount.value - totalUploaded()
    if (remaining <= 0) {
      errorMessage.value = `最多上传 ${maxCount.value} 个文件`
      return
    }
    void insertFiles(files.slice(0, remaining))
  }

  function handleEditorDrop(event: DragEvent): void {
    const files = Array.from(event.dataTransfer?.files || [])
    if (!files.length)
      return
    event.preventDefault()
    event.stopImmediatePropagation()

    const remaining = maxCount.value - totalUploaded()
    if (remaining <= 0) {
      errorMessage.value = `最多上传 ${maxCount.value} 个文件`
      return
    }
    void insertFiles(files.slice(0, remaining))
  }

  // ---- File download click handler ----
  function handleFileDownloadClick(event: MouseEvent): void {
    const target = event.target as HTMLElement
    const link = target.closest('a')
    if (!link)
      return
    const edmFile = link.closest('edm-file') as HTMLElement | null
    if (!edmFile)
      return
    event.preventDefault()
    event.stopPropagation()
    const edmId = edmFile.getAttribute('data-edm-id') || ''
    const attachmentId = edmFile.getAttribute('data-attachment-id') || ''
    void props.resolveDownloadUrl?.(attachmentId, edmId, 'file')
  }

  // ---- Bootstrap media on content load ----
  function bootstrapMedia(): void {
    const ed = editorRef.value
    if (!ed)
      return
    const root = ed.getBody()
    if (!root)
      return
    root.querySelectorAll<HTMLElement>('edm-image, edm-video').forEach((el) => {
      const media = el.querySelector<HTMLImageElement | HTMLVideoElement>('img, video')
      if (media && media.dataset.src && !media.src) {
        media.src = media.dataset.src
      }
    })
  }

  // ---- editorInit ----
  const editorInit = computed<Record<string, any>>(() => ({
    license_key: 'gpl',
    branding: false,
    promotion: false,
    statusbar: false,
    menubar: false,
    contextmenu: false,
    resize: true,

    // Allow EDM custom elements
    extended_valid_elements: 'edm-image[*],edm-video[*],edm-file[*]',
    valid_children: '+body[edm-image],+body[edm-video],+body[edm-file]',

    // Disable built-in image/media handling
    paste_data_images: false,
    smart_paste: false,
    automatic_uploads: false,

    toolbar: 'undo redo | styles | bold italic underline strikethrough | forecolor backcolor | alignleft aligncenter alignright alignjustify | bullist numlist outdent indent | blockquote code | link | edmimage edmvideo edmfile | removeformat',
    toolbar_mode: 'wrap' as const,

    content_style: `
      body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; font-size: 15px; line-height: 1.7; color: #1f2a37; }
      edm-image { display: block; margin: 8px 0; }
      edm-image img { max-width: 100%; border-radius: 6px; }
      edm-video { display: block; margin: 8px 0; }
      edm-video video { max-width: 100%; border-radius: 6px; }
      edm-file { display: block; margin: 8px 0; }
      edm-file a { display: inline-flex; align-items: center; gap: 6px; padding: 8px 14px; border: 1px solid #d7dee8; border-radius: 6px; background: #f8fbff; color: #205493; font-size: 13px; text-decoration: none; cursor: pointer; }
      edm-file a:hover { border-color: #89aed8; background: #eef6ff; }
    `,

    placeholder: props.placeholder,
    readonly: props.readOnly,

    setup: (editor: Editor) => {
      editorRef.value = editor

      // Register custom toolbar buttons
      editor.ui.registry.addButton('edmimage', {
        icon: 'image',
        tooltip: '图片',
        onAction: () => openFilePicker('image'),
      })
      editor.ui.registry.addButton('edmvideo', {
        icon: 'embed',
        tooltip: '视频',
        onAction: () => openFilePicker('video'),
      })
      editor.ui.registry.addButton('edmfile', {
        icon: 'new-document',
        tooltip: '文件',
        onAction: () => openFilePicker('file'),
      })

      // Intercept paste for file upload
      editor.on('paste', (evt) => {
        handleEditorPaste((evt as any).originalEvent || evt)
      })

      // Intercept drop for file upload
      editor.on('drop', (evt) => {
        handleEditorDrop(evt as any)
      })

      // File download click handling
      editor.on('click', (evt) => {
        handleFileDownloadClick(evt as any)
      })

      // HTML sync on change
      editor.on('change', () => {
        syncHtmlFromEditor()
      })

      // Initial content — defer to 'init' event (editor fully ready)
      editor.on('init', () => {
        if (props.modelValue) {
          editor.setContent(props.modelValue)
          bootstrapMedia()
          syncHtmlFromEditor()
        }
      })
    },
  }))

  // ---- Init ----
  void (async () => {
    if (props.fetchConfig) {
      try {
        const config = await props.fetchConfig()
        maxCount.value = config.maxCount
      }
      catch { /* 降级使用默认值 5 */ }
    }
  })()

  onBeforeUnmount(() => {
    editorRef.value?.destroy()
    editorRef.value = null
  })

  return {
    editorRef,
    imageInputRef,
    videoInputRef,
    fileInputRef,
    errorMessage,
    isBusy,
    uploadingLabel,
    isUploadLimitReached,
    maxCount,
    uploadedCount,
    handleFileInputChange,
    openFilePicker,
    editorInit,
  }
}

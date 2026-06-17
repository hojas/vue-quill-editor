import type { StarterKitOptions } from '@tiptap/starter-kit'
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
import StarterKit from '@tiptap/starter-kit'
import { useEditor } from '@tiptap/vue-3'
import { computed, onBeforeUnmount, ref, shallowRef, watch } from 'vue'
import {
  getErrorMessage,
  inferUploadKind,
  toUrl,
} from '../shared/utils'
import { buildNodeInsert, edmNodes, extractAttachments } from './edmNodes'

/** 编辑器配置 */
export interface EdmConfig {
  maxCount: number
}

export interface UseTiptapEditorProps {
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

export interface UseTiptapEditorReturn {
  editor: Ref<ReturnType<typeof useEditor>['value']>
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
  handlePaste: (event: ClipboardEvent) => void
  handleFileDownloadClick: (e: MouseEvent) => void
}

export interface UseTiptapEditorEmit {
  (event: 'update:modelValue', value: string): void
  (event: 'change', value: string): void
  (event: 'upload-start', payload: { file: File, kind: EdmUploadKind }): void
  (event: 'upload-success', payload: EdmUploadSuccessPayload): void
  (event: 'upload-error', payload: { file: File, kind: EdmUploadKind, error: unknown }): void
  (event: 'update:attachmentList', value: EdmAttachment[]): void
}

/**
 * TipTap 富文本编辑器 composable。
 *
 * 封装 TipTap 实例的创建/销毁、文件上传管线（选择 → 上传 → 插入节点）、
 * HTML 同步、粘贴拦截、文件下载点击处理。
 *
 * 保持与 `useEdmEditor` 相同的 props/emits 签名。
 */
export function useTiptapEditor(
  props: UseTiptapEditorProps,
  emit: UseTiptapEditorEmit,
): UseTiptapEditorReturn {
  // ---- DOM refs ----
  const imageInputRef = ref<HTMLInputElement | null>(null)
  const videoInputRef = ref<HTMLInputElement | null>(null)
  const fileInputRef = ref<HTMLInputElement | null>(null)

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

  // ---- TipTap editor ----
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2] },
      } as StarterKitOptions),
      ...edmNodes,
    ],
    content: props.modelValue,
    editable: !props.readOnly,
    onUpdate: () => {
      syncHtmlFromEditor()
    },
  })

  // ---- computed ----
  const isBusy = computed(() => uploadingKind.value !== null)
  const uploadingLabel = computed(() => UPLOAD_LABEL[uploadingKind.value || 'file'])
  const isUploadLimitReached = computed(() => totalUploaded() >= maxCount.value)
  const uploadedCount = computed(totalUploaded)

  // ---- HTML sync ----
  function getEditorHtml(): string {
    return editor.value?.getHTML() ?? ''
  }

  function syncHtmlFromEditor(): void {
    if (!editor.value)
      return
    const html = getEditorHtml()
    if (html === lastHtml.value)
      return
    lastHtml.value = html
    const attachments = extractAttachments(editor.value.view.dom).map(a => ({
      edmId: a.edmId,
      attachmentId: a.attachmentId,
      kind: a.kind as EdmUploadKind,
    }))
    committedCount.value = attachments.length
    emit('update:modelValue', html)
    emit('change', html)
    emit('update:attachmentList', attachments)
  }

  // ---- modelValue watcher ----
  watch(
    () => props.modelValue,
    (nextValue) => {
      if (!editor.value || nextValue === lastHtml.value)
        return
      editor.value.commands.setContent(nextValue, { emitUpdate: false })
      syncHtmlFromEditor()
    },
  )

  // ---- readOnly watcher ----
  watch(
    () => props.readOnly,
    (nextReadOnly) => {
      editor.value?.setEditable(!nextReadOnly)
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
    const target
      = kind === 'image' ? imageInputRef : kind === 'video' ? videoInputRef : fileInputRef
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
    if (!editor.value || props.readOnly)
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
    if (!editor.value)
      return

    errorMessage.value = ''
    uploadingKind.value = kind
    emit('upload-start', { file, kind })

    try {
      const result = await props.upload(file, kind)
      if (!result.edmId)
        throw new Error('上传接口未返回 edmId')

      const embedValue = await buildEmbedValue(file, kind, result)
      const nodeInsert = buildNodeInsert(kind, embedValue)

      editor.value.commands.insertContent({
        type: nodeInsert.type as any,
        attrs: nodeInsert.attrs,
      })

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

  /**
   * 根据上传结果构建 EdmEmbedValue。
   *
   * URL 优先级：result 中直接携带的 URL → 通过 resolver 解析。
   * 保持与 useEdmEditor.ts → buildEmbedValue 一致的逻辑。
   */
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

  // ---- Paste handler ----
  function handlePaste(event: ClipboardEvent): void {
    const files = Array.from(event.clipboardData?.files || [])
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

  // ---- File download click handler (event delegation) ----
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

  // 初始同步
  watch(
    () => editor.value,
    (ed) => {
      if (ed) {
        lastHtml.value = getEditorHtml()
        // 设置 placeholder
        if (props.placeholder) {
          ed.view.dom.setAttribute('data-placeholder', props.placeholder)
        }
      }
    },
    { immediate: true },
  )

  onBeforeUnmount(() => {
    editor.value?.destroy()
  })

  return {
    editor,
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
    handlePaste,
    handleFileDownloadClick,
  }
}

import type { ComputedRef, Ref } from 'vue'
import type {
  EdmAttachment,
  EdmEmbedValue,
  EdmUploadErrorPayload,
  EdmUploadHandler,
  EdmUploadKind,
  EdmUploadResult,
  EdmUploadSuccessPayload,
  EdmUrlResolver,
} from '../shared/types'
import Quill from 'quill'
import { computed, onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue'
import {
  getBlotName,
  getErrorMessage,
  inferUploadKind,
  isEdmBlot,
  toUrl,
} from '../shared/utils'
import { registerEdmBlots, setEdmUrlResolvers } from './edmBlots'
import { CUSTOM_FONTS, registerFonts } from './fonts'
import { destroyImageResize, initImageResize, removeAllResizeHandles } from './imageResize'

/**
 * `useEdmEditor` 的 props 入参。
 *
 * 由 `RichTextEditor` 组件通过 `withDefaults` 注入默认值后传入。
 */
/** 编辑器配置 */
export interface EdmConfig {
  maxCount: number
}

export interface UseEdmEditorProps {
  modelValue: string
  placeholder: string
  readOnly: boolean
  upload: EdmUploadHandler
  /** 获取编辑器配置（如最大上传数量） */
  fetchConfig?: () => Promise<EdmConfig>
  /** 图片/视频预览 URL 解析器 */
  resolvePreviewUrl?: EdmUrlResolver
  /** 文件下载解析器（点击文件时调用） */
  resolveDownloadUrl?: EdmUrlResolver
  imageAccept: string
  videoAccept: string
  fileAccept: string
}

/** `useEdmEditor` 返回值 */
export interface UseEdmEditorReturn {
  editorRef: Ref<HTMLDivElement | null>
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
}

/**
 * `useEdmEditor` 的事件签名。
 *
 * 与 `RichTextEditor` 的 `defineEmits` 一一对应。
 */
export interface UseEdmEditorEmit {
  (event: 'update:modelValue', value: string): void
  (event: 'change', value: string): void
  (event: 'upload-start', payload: { file: File, kind: EdmUploadKind }): void
  (event: 'upload-success', payload: EdmUploadSuccessPayload): void
  (event: 'upload-error', payload: EdmUploadErrorPayload): void
  (event: 'update:attachmentList', value: EdmAttachment[]): void
}

/** Quill 工具栏配置，包含自定义的 EDM 插入按钮 */
const toolbarConfig = [
  [{ header: [1, 2, false] }, { size: ['small', false, 'large', 'huge'] }, { font: Object.keys(CUSTOM_FONTS) }],
  ['bold', 'italic', 'underline', 'strike'],
  [{ align: [] }, { list: 'ordered' }, { list: 'bullet' }, 'blockquote', 'code-block'],
  ['link', 'edmImage', 'edmVideo', 'edmFile'],
  ['clean'],
]

/**
 * EDM 富文本编辑器核心 composable。
 *
 * 封装了 Quill 实例的创建/销毁、文件上传管线（选择 → 上传 → 插入 blot）、
 * HTML 同步、粘贴拦截、拖拽拦截、编辑器内容与 attachmentList 的双向绑定。
 *
 * @returns 模板所需的 ref 和事件处理函数
 */
export function useEdmEditor(props: UseEdmEditorProps, emit: UseEdmEditorEmit): UseEdmEditorReturn {
  // ---- DOM refs ----
  const editorRef = ref<HTMLDivElement | null>(null)
  const imageInputRef = ref<HTMLInputElement | null>(null)
  const videoInputRef = ref<HTMLInputElement | null>(null)
  const fileInputRef = ref<HTMLInputElement | null>(null)

  // ---- state ----
  /** 当前正在上传的资源类型，为 null 表示空闲 */
  const uploadingKind = shallowRef<EdmUploadKind | null>(null)
  /** 上传或解析过程中的错误消息 */
  const errorMessage = shallowRef('')
  /** 最大上传数量（从后端 API 获取） */
  const maxCount = ref(5)
  /** 已完成上传数量（由 syncHtmlFromEditor 更新） */
  const committedCount = ref(0)
  /** 正在上传中的数量（同步预占位，防止快速粘贴绕过限制） */
  let pendingCount = 0
  /** 当前有效上传总数 = 已提交 + 进行中 */
  const totalUploaded = (): number => committedCount.value + pendingCount
  /** 最近一次同步后的编辑器 HTML，用于和 modelValue 比较避免循环更新 */
  const lastHtml = shallowRef('')

  /** Quill 实例 */
  let quill: Quill | null = null

  /** 阻止编辑器内的原生拖拽行为（避免图片/文件拖入时浏览器导航） */
  const blockDragStart = (e: DragEvent): void => e.preventDefault()
  const blockDragOver = (e: DragEvent): void => {
    e.preventDefault()
    e.stopImmediatePropagation()
  }
  const blockDrop = (e: DragEvent): void => {
    e.preventDefault()
    e.stopImmediatePropagation()
  }

  /**
   * 拦截 Backspace / Delete 按键，处理 EDM 嵌入元素的删除。
   *
   * Quill 默认的 Backspace 处理器不认识自定义 BlockEmbed，
   * 当光标在 embed 之后时会将 embed 所在的 Block 与上一个 Block 合并，而不是删除 embed。
   * 这里在 capture 阶段拦截，直接用 deleteText 删除 embed。
   *
   * Backspace 同时检查 getLeaf(I-1) 和 getLeaf(I)，后者作为 Quill 的
   * normalizedToRange() 缺陷（将 rightGuard 的 offset=0 映射到位置 I 而非 I+1）的兜底。
   */
  const handleEdmKeyboard = (evt: KeyboardEvent): void => {
    if (evt.key !== 'Backspace' && evt.key !== 'Delete' && evt.key !== 'Enter')
      return
    if (!quill)
      return

    // Enter: 如果光标落在 EDM embed 上（位置 I），则先修正到 I+1，
    // 让 Quill 的原生 Enter 处理器在正确的位置插入换行（embed 下方）。
    // 不调用 preventDefault，让 Quill 自己处理 Enter。
    if (evt.key === 'Enter') {
      const enterRange = quill.getSelection()
      if (enterRange && enterRange.length === 0) {
        const [leaf] = quill.getLeaf(enterRange.index)
        if (leaf && isEdmBlot(leaf)) {
          quill.setSelection(enterRange.index + 1, 0, 'silent')
        }
      }
      return
    }

    const range = quill.getSelection()
    if (!range || range.length > 0)
      return

    const candidates: number[] = evt.key === 'Backspace' && range.index > 0
      ? [range.index - 1, range.index]
      : evt.key === 'Delete' && range.index < quill.getLength() - 1
        ? [range.index]
        : []

    for (const idx of candidates) {
      const [leaf] = quill.getLeaf(idx)
      if (leaf && isEdmBlot(leaf)) {
        evt.preventDefault()
        evt.stopImmediatePropagation()
        quill.deleteText(idx, 1, Quill.sources.USER)
        ensureLeadingParagraph()
        return
      }
    }
  }

  /**
   * 当用户点击 BlockEmbed 右侧空白区域时，浏览器将光标放在 Quill 在 embed 内部
   * 插入的 rightGuard（U+FEFF）文本节点上。Quill 的 normalizedToRange() 在 offset=0
   * 时走捷径直接返回 embed 位置 I，而非调用 Embed.index() 得到正确的 I+1。
   *
   * 此处理器检测 user 来源的选区变更，若光标落在 EDM embed 上，则通过原生 DOM
   * 选区判断用户是否点击在 embed 右侧，仅在该情况下将光标修正到 I+1。
   */
  const handleSelectionChange = (range: unknown, _oldRange: unknown, source: string): void => {
    if (!quill || source !== 'user')
      return
    const sel = range as { index: number, length: number } | null
    if (!sel || sel.length > 0)
      return

    const [leaf] = quill.getLeaf(sel.index)
    if (!leaf || !isEdmBlot(leaf))
      return

    const embedDom = (leaf as any).domNode as HTMLElement | null
    if (!embedDom)
      return

    const nativeSel = window.getSelection()
    if (!nativeSel || nativeSel.rangeCount === 0)
      return

    const nativeContainer = nativeSel.getRangeAt(0).startContainer
    const pos = embedDom.compareDocumentPosition(nativeContainer)

    // FOLLOWING (4): 光标在 embed 之后
    // CONTAINED_BY (16): 光标在 embed 内部的 rightGuard 上 → 需要进一步判断
    const isRightSide
      = (pos & Node.DOCUMENT_POSITION_FOLLOWING) !== 0
        || (
          (pos & Node.DOCUMENT_POSITION_CONTAINED_BY) !== 0
          && (embedDom.querySelector('[contenteditable="false"]')
            ?.compareDocumentPosition(nativeContainer) ?? 0) & Node.DOCUMENT_POSITION_FOLLOWING
        )

    if (isRightSide) {
      quill.setSelection(sel.index + 1, 0, 'silent')
      return
    }

    // 光标落在 embed 的左侧：仅在 embed 位于编辑器最开头（position 0）时需要处理。
    // 此时 embed 前方无文本节点，浏览器无法将光标落在 embed 之前，
    // 需要插入一个前导段落来创建可输入文本的位置。
    if (sel.index === 0) {
      quill.insertText(0, '\n', 'silent')
      quill.setSelection(0, 0, 'silent')
    }
  }

  // ---- computed ----
  /** 是否有上传正在进行 */
  const isBusy = computed(() => uploadingKind.value !== null)

  /** 上传类型 → 中文提示文案 */
  const UPLOAD_LABEL: Record<EdmUploadKind, string> = {
    image: '图片上传中',
    video: '视频上传中',
    file: '文件上传中',
  }

  const uploadingLabel = computed(() => UPLOAD_LABEL[uploadingKind.value || 'file'])

  /** 是否已达上传上限 */
  const isUploadLimitReached = computed(() => totalUploaded() >= maxCount.value)

  // ---- lifecycle ----
  onMounted(async () => {
    registerEdmBlots()
    registerFonts()
    setEdmUrlResolvers(props.resolvePreviewUrl, props.resolveDownloadUrl)

    // 获取上传限制配置（由外部注入）
    if (props.fetchConfig) {
      try {
        const config = await props.fetchConfig()
        maxCount.value = config.maxCount
      }
      catch { /* 降级使用默认值 5 */ }
    }

    if (!editorRef.value)
      return

    // 初始化 Quill 实例
    quill = new Quill(editorRef.value, {
      theme: 'snow',
      placeholder: props.placeholder,
      readOnly: props.readOnly,
      modules: {
        toolbar: {
          container: toolbarConfig,
          handlers: {
            edmImage: () => openFilePicker('image'),
            edmVideo: () => openFilePicker('video'),
            edmFile: () => openFilePicker('file'),
          },
        },
      },
    })

    addToolbarTitles()
    initImageResize(quill.root)
    quill.on('text-change', syncHtmlFromEditor)
    quill.on('selection-change', handleSelectionChange)
    quill.root.addEventListener('keydown', handleEdmKeyboard, true)
    quill.root.addEventListener('paste', handlePaste, true)
    quill.root.addEventListener('dragstart', blockDragStart)
    quill.root.addEventListener('dragover', blockDragOver, true)
    quill.root.addEventListener('drop', blockDrop, true)

    // 有初始内容时先解析 EDM URL 再写入编辑器
    if (props.modelValue) {
      await setEditorHtml(props.modelValue)
    }
    else {
      lastHtml.value = getEditorHtml()
    }
  })

  onBeforeUnmount(() => {
    if (!quill)
      return
    quill.off('text-change', syncHtmlFromEditor)
    quill.off('selection-change', handleSelectionChange)
    quill.root.removeEventListener('keydown', handleEdmKeyboard, true)
    quill.root.removeEventListener('paste', handlePaste, true)
    quill.root.removeEventListener('dragstart', blockDragStart)
    quill.root.removeEventListener('dragover', blockDragOver, true)
    quill.root.removeEventListener('drop', blockDrop, true)
    destroyImageResize()
    quill = null
  })

  // ---- watchers ----
  /**
   * 监听外部 modelValue 变化，同步到编辑器。
   *
   * 通过 `lastHtml` 比对避免自身编辑触发的循环更新。
   */
  watch(
    () => props.modelValue,
    async (nextValue) => {
      if (!quill || nextValue === lastHtml.value)
        return
      const selection = quill.getSelection()
      quill.setText('', 'silent')
      if (nextValue)
        await setEditorHtml(nextValue)
      const nextIndex = Math.min(selection?.index || 0, quill.getLength() - 1)
      quill.setSelection(nextIndex, selection?.length || 0, 'silent')
      syncHtmlFromEditor()
    },
  )

  /** 监听 readOnly 切换，启用/禁用编辑器 */
  watch(
    () => props.readOnly,
    nextReadOnly => quill?.enable(!nextReadOnly),
  )

  // ---- toolbar titles ----
  /**
   * 为 Quill 工具栏按钮添加中文 title 提示。
   *
   * 遍历工具栏 DOM 容器，为匹配的按钮设置 `title` 属性。
   */
  function addToolbarTitles(): void {
    if (!quill)
      return
    const tb = quill.getModule('toolbar') as { container?: HTMLElement } | undefined
    const container = tb?.container
    if (!(container instanceof HTMLElement))
      return

    const titles: Record<string, string> = {
      'ql-size': '字号',
      'ql-header': '标题',
      'ql-bold': '加粗',
      'ql-italic': '倾斜',
      'ql-underline': '下划线',
      'ql-strike': '删除线',
      'ql-list[value="ordered"]': '有序列表',
      'ql-list[value="bullet"]': '无序列表',
      'ql-blockquote': '引用',
      'ql-code-block': '代码块',
      'ql-link': '链接',
      'ql-edmImage': '图片',
      'ql-edmVideo': '视频',
      'ql-edmFile': '文件',
      'ql-align[value=""]': '左对齐',
      'ql-align[value="center"]': '居中',
      'ql-align[value="right"]': '右对齐',
      'ql-align[value="justify"]': '两端对齐',
      'ql-clean': '清除格式',
    }

    // 为字体选择器和每个字体选项添加中文 title
    const fontPicker = container.querySelector('.ql-picker.ql-font')
    if (fontPicker && !fontPicker.hasAttribute('title')) {
      fontPicker.setAttribute('title', '字体')
    }
    for (const [fontKey, fontName] of Object.entries(CUSTOM_FONTS)) {
      const item = container.querySelector(`.ql-picker-item[data-value="${fontKey}"]`)
      if (item && !item.hasAttribute('title')) {
        item.setAttribute('title', fontName)
      }
    }

    for (const selector of Object.keys(titles)) {
      const el = container.querySelector(`.${selector}`)
      if (el && !el.hasAttribute('title')) {
        el.setAttribute('title', titles[selector])
      }
    }
  }

  // ---- file picker ----
  /**
   * 根据资源类型打开对应的隐藏 file input。
   *
   * 只读或上传进行中时忽略点击。
   */
  function openFilePicker(kind: EdmUploadKind): void {
    if (props.readOnly || isBusy.value)
      return
    if (totalUploaded() >= maxCount.value) {
      errorMessage.value = `最多上传 ${maxCount.value} 个文件`
      return
    }
    const ref
      = kind === 'image' ? imageInputRef : kind === 'video' ? videoInputRef : fileInputRef
    ref.value?.click()
  }

  /**
   * file input 的 change 事件处理：读取选中文件并触发插入流程。
   *
   * 处理后清空 input.value，确保重复选择同一文件也能再次触发 change。
   */
  async function handleFileInputChange(kind: EdmUploadKind, event: Event): Promise<void> {
    const input = event.target as HTMLInputElement
    const files = Array.from(input.files || [])
    input.value = ''
    if (!files.length)
      return
    await insertFiles(files, kind)
  }

  // ---- file insertion ----
  /**
   * 将一批文件依次上传并插入编辑器。
   *
   * @param files       - 待插入的文件列表
   * @param forcedKind  - 强制指定类型；不传则根据 MIME 自动推断
   */
  async function insertFiles(files: File[], forcedKind?: EdmUploadKind): Promise<void> {
    if (!quill || props.readOnly)
      return
    // 同步预占位，防止快速连续粘贴绕过限制
    const remaining = maxCount.value - totalUploaded()
    if (remaining <= 0)
      return
    const toUpload = files.slice(0, remaining)
    pendingCount += toUpload.length
    // 在光标位置处插入；无选区时插入到文档末尾
    let insertIndex = quill.getSelection(true)?.index ?? Math.max(quill.getLength() - 1, 0)
    for (const file of toUpload) {
      const kind = forcedKind || inferUploadKind(file)
      try {
        insertIndex = await uploadAndInsert(file, kind, insertIndex)
      }
      catch {
        pendingCount-- // 失败则释放占位
        continue
      }
    }
    ensureLeadingParagraph()
    ensureTrailingParagraph()
  }

  // ---- upload & embed ----
  /**
   * 上传单个文件并将其以自定义 blot 形式插入编辑器。
   *
   * @returns 下一个可用的插入位置（当前索引 + 1）
   */
  async function uploadAndInsert(
    file: File,
    kind: EdmUploadKind,
    insertIndex: number,
  ): Promise<number> {
    if (!quill)
      return insertIndex

    errorMessage.value = ''
    uploadingKind.value = kind
    emit('upload-start', { file, kind })

    try {
      const result = await props.upload(file, kind)
      if (!result.edmId)
        throw new Error('上传接口未返回 edmId')

      const embedValue = await buildEmbedValue(file, kind, result)
      quill.insertEmbed(insertIndex, getBlotName(kind), embedValue, 'user')
      quill.setSelection(insertIndex + 1, 0, 'silent')
      pendingCount--
      syncHtmlFromEditor()
      emit('upload-success', { file, kind, result })
      return insertIndex + 1
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
   * 根据上传结果构建写入 blot 的 EdmEmbedValue。
   *
   * URL 优先级：result 中直接携带的 URL → 通过 resolver 解析。
   */
  async function buildEmbedValue(
    file: File,
    kind: EdmUploadKind,
    result: EdmUploadResult,
  ): Promise<EdmEmbedValue> {
    const baseUrl = result.downloadUrl || result.url
    // 图片/视频：通过 resolvePreviewUrl 获取预览 URL；文件：无需预解析（点击时调 resolveDownloadUrl）
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

  // ---- embed refresh (loaded content) ----
  /**
   * 预处理 HTML 中的 EDM 嵌入元素。
   *
   * 文件类型清除旧的 href（下载由 resolveDownloadUrl 在点击时处理），
   * 图片/视频清除旧的 data-src，交由 IntersectionObserver 懒加载。
   */
  async function resolveHtmlEmbeds(html: string): Promise<string> {
    const parser = new DOMParser()
    const doc = parser.parseFromString(html, 'text/html')
    const containers = doc.querySelectorAll<HTMLElement>('[data-edm-type]')

    await Promise.allSettled(
      Array.from(containers).map(async (el) => {
        const edmId = el.getAttribute('data-edm-id')
        const kind = el.getAttribute('data-edm-type') as EdmUploadKind
        if (!edmId || !kind)
          return

        if (kind === 'file') {
          // 文件类型：清除旧的 href（下载由 resolveDownloadUrl 在点击时处理）
          const link = el.querySelector('a')
          if (link)
            link.setAttribute('href', '#')
        }
        else {
          // 图片/视频：清除旧的 data-src，触发 IntersectionObserver 重新懒加载
          const media = el.querySelector<HTMLImageElement | HTMLVideoElement>('img, video')
          if (media)
            delete media.dataset.src
        }
      }),
    )

    return doc.body.innerHTML
  }

  /**
   * 检查文本节点是否位于受保护的子树中（不应修改其空白字符）。
   *
   * - `<pre>` — Quill 已通过 `isPre` 保留其空白（clipboard.js:455）
   * - `<code>` — 内联代码中的空格可能具有意义
   * - `[data-edm-type]` — EDM 自定义元素有内部结构，不应修改
   */
  function isProtectedTextNode(node: Text): boolean {
    let parent = node.parentElement
    while (parent) {
      const tag = parent.tagName
      if (tag === 'PRE' || tag === 'CODE')
        return true
      if (parent.hasAttribute('data-edm-type'))
        return true
      parent = parent.parentElement
    }
    return false
  }

  /**
   * 保留 HTML 文本节点中的连续空白字符。
   *
   * Quill 的 clipboard 模块在 `dangerouslyPasteHTML` 时会将 2 个以上连续空格折叠为 1 个。
   * 这里将连续空白替换为交替 ` `（U+00A0）和 ` ` 的模式，
   * 利用 Quill 先折叠空格、后转换 ` ` 为空格的处理顺序来保留原始空白数量。
   *
   * 受 `isProtectedTextNode` 保护的子树不会被修改。
   *
   * @param html - 原始 HTML 字符串
   * @returns 连续空白已被保留的 HTML
   */
  function preserveConsecutiveSpaces(html: string): string {
    const parser = new DOMParser()
    const doc = parser.parseFromString(html, 'text/html')

    const walker = doc.createTreeWalker(doc.body, NodeFilter.SHOW_TEXT)
    const textNodes: Text[] = []

    // 先收集所有符合条件的文本节点，避免遍历中修改导致节点跳过
    while (walker.nextNode()) {
      const node = walker.currentNode as Text
      if (!isProtectedTextNode(node)) {
        textNodes.push(node)
      }
    }

    for (const node of textNodes) {
      node.nodeValue = node.nodeValue!.replace(
        /\s{2,}/g,
        (run: string) =>
          run.replace(/./g, (_ch: string, i: number) =>
            i % 2 === 0 ? ' ' : ' '),
      )
    }

    return doc.body.innerHTML
  }

  // ---- paste ----
  /**
   * 粘贴事件处理：提取剪贴板中的文件并插入编辑器。
   *
   * 无文件时走 Quill 默认粘贴行为。
   */
  function handlePaste(event: ClipboardEvent): void {
    const files = Array.from(event.clipboardData?.files || [])
    if (!files.length)
      return
    event.preventDefault()
    event.stopImmediatePropagation()

    // 限制粘贴数量不超过上传上限
    const remaining = maxCount.value - totalUploaded()
    if (remaining <= 0) {
      errorMessage.value = `最多上传 ${maxCount.value} 个文件`
      return
    }
    void insertFiles(files.slice(0, remaining))
  }

  /**
   * 将 HTML 写入编辑器。
   *
   * 写入前会先解析 EDM 嵌入的 URL，写入期间暂时解除 text-change 监听避免误触发同步。
   */
  async function setEditorHtml(html: string): Promise<void> {
    if (!quill)
      return
    const resolvedHtml = await resolveHtmlEmbeds(html)
    const preservedHtml = preserveConsecutiveSpaces(resolvedHtml)
    quill.off('text-change', syncHtmlFromEditor)
    quill.clipboard.dangerouslyPasteHTML(preservedHtml, 'silent')
    quill.on('text-change', syncHtmlFromEditor)
    ensureLeadingParagraph()
    ensureTrailingParagraph()
    syncHtmlFromEditor()
  }

  /**
   * 确保编辑器开头存在一个换行段落。
   *
   * 仅在第一个内容元素是 EDM embed 时才在位置 0 插入换行，
   * 避免 embed 之前无文本节点导致光标无法定位到 embed 前方。
   */
  function ensureLeadingParagraph(): void {
    if (!quill)
      return
    const [leaf] = quill.getLeaf(0)
    if (leaf && isEdmBlot(leaf)) {
      quill.insertText(0, '\n', 'silent')
    }
  }

  /**
   * 确保编辑器末尾存在一个换行段落。
   *
   * 仅在最后一个内容元素是 EDM embed 时才插入额外换行，
   * 避免 embed 之后无文本节点导致光标无法正确定位和删除。
   */
  function ensureTrailingParagraph(): void {
    if (!quill)
      return
    // Quill 末尾始终有一个保留换行符，实际内容的最后位置在 length - 2
    const lastContentIndex = quill.getLength() - 2
    if (lastContentIndex < 0)
      return
    const [leaf] = quill.getLeaf(lastContentIndex)
    if (leaf && isEdmBlot(leaf)) {
      quill.insertText(quill.getLength() - 1, '\n', 'silent')
    }
  }

  // ---- HTML sync ----
  /**
   * 从编辑器 DOM 中提取所有 EDM 附件列表（去重）。
   *
   * 用于同步 `update:attachmentList` 事件，供父组件追踪已使用的 EDM 资源。
   */
  function extractAttachments(): EdmAttachment[] {
    if (!quill)
      return []
    const els = quill.root.querySelectorAll<HTMLElement>('[data-edm-id]')
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

  /**
   * 从编辑器取出 HTML 并触发 modelValue / change / attachmentList 事件。
   */
  function syncHtmlFromEditor(): void {
    const html = getEditorHtml()
    lastHtml.value = html
    const attachments = extractAttachments()
    committedCount.value = attachments.length
    emit('update:modelValue', html)
    emit('change', html)
    emit('update:attachmentList', attachments)
  }

  /**
   * 获取编辑器当前 HTML。
   *
   * 克隆 DOM 后先移除缩放把手（防止泄漏到输出），
   * 若末尾以 EDM embed 结尾则补一个空段落确保重新加载时结构完整。
   */
  function getEditorHtml(): string {
    if (!quill)
      return ''
    // 克隆根节点，移除缩放把手避免污染 HTML 输出
    const clone = quill.root.cloneNode(true) as HTMLElement
    removeAllResizeHandles(clone)
    const html = clone.innerHTML
    // 末尾如果是 EDM embed，多补一个 <p><br></p>，
    // 防止保存后重新加载时唯一一个末尾段落被 Quill 当结构换行符合并
    if (/<\/edm-(?:image|video|file)>(?:<\/p>)?\s*$/.test(html.trimEnd())) {
      return `${html}<p><br></p>`
    }
    return html
  }

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
    uploadedCount: computed(totalUploaded),
    handleFileInputChange,
  }
}

import { computed, onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue';
import Quill from 'quill';
import { registerEdmBlots, setEdmUrlResolvers } from './edmBlots';
import { initImageResize, removeAllResizeHandles } from './imageResize';
import {
  getBlotName,
  getErrorMessage,
  inferUploadKind,
} from '../shared/utils';
import type {
  EdmAttachment,
  EdmEmbedValue,
  EdmUploadErrorPayload,
  EdmUploadHandler,
  EdmUploadKind,
  EdmUploadResult,
  EdmUploadSuccessPayload,
  EdmUrlResolver,
} from '../shared/types';

/**
 * `useEdmEditor` 的 props 入参。
 *
 * 由 `RichTextEditor` 组件通过 `withDefaults` 注入默认值后传入。
 */
/** 编辑器配置 */
export interface EdmConfig {
  maxCount: number;
}

export interface UseEdmEditorProps {
  modelValue: string;
  placeholder: string;
  readOnly: boolean;
  upload: EdmUploadHandler;
  /** 获取编辑器配置（如最大上传数量） */
  fetchConfig?: () => Promise<EdmConfig>;
  resolveDownloadUrl?: EdmUrlResolver;
  imageAccept: string;
  videoAccept: string;
  fileAccept: string;
}

/**
 * `useEdmEditor` 的事件签名。
 *
 * 与 `RichTextEditor` 的 `defineEmits` 一一对应。
 */
export interface UseEdmEditorEmit {
  (event: 'update:modelValue', value: string): void;
  (event: 'change', value: string): void;
  (event: 'upload-start', payload: { file: File; kind: EdmUploadKind }): void;
  (event: 'upload-success', payload: EdmUploadSuccessPayload): void;
  (event: 'upload-error', payload: EdmUploadErrorPayload): void;
  (event: 'update:attachmentList', value: EdmAttachment[]): void;
}

/** Quill 工具栏配置，包含自定义的 EDM 插入按钮 */
const toolbarConfig = [
  [{ header: [1, 2, false] }],
  ['bold', 'italic', 'underline', 'strike'],
  [{ list: 'ordered' }, { list: 'bullet' }, 'blockquote', 'code-block'],
  ['link', 'edmImage', 'edmVideo', 'edmFile'],
  ['clean'],
];

/**
 * EDM 富文本编辑器核心 composable。
 *
 * 封装了 Quill 实例的创建/销毁、文件上传管线（选择 → 上传 → 插入 blot）、
 * HTML 同步、粘贴拦截、拖拽拦截、编辑器内容与 attachmentList 的双向绑定。
 *
 * @returns 模板所需的 ref 和事件处理函数
 */
export function useEdmEditor(props: UseEdmEditorProps, emit: UseEdmEditorEmit) {
  // ---- DOM refs ----
  const editorRef = ref<HTMLDivElement | null>(null);
  const imageInputRef = ref<HTMLInputElement | null>(null);
  const videoInputRef = ref<HTMLInputElement | null>(null);
  const fileInputRef = ref<HTMLInputElement | null>(null);

  // ---- state ----
  /** 当前正在上传的资源类型，为 null 表示空闲 */
  const uploadingKind = shallowRef<EdmUploadKind | null>(null);
  /** 上传或解析过程中的错误消息 */
  const errorMessage = shallowRef('');
  /** 最大上传数量（从后端 API 获取） */
  const maxCount = ref(5);
  /** 当前已上传数量 */
  const uploadedCount = ref(0);
  /** 最近一次同步后的编辑器 HTML，用于和 modelValue 比较避免循环更新 */
  const lastHtml = shallowRef('');

  /** Quill 实例 */
  let quill: Quill | null = null;

  /** 阻止编辑器内的原生拖拽行为（避免图片/文件拖入时浏览器导航） */
  const blockDragStart = (e: DragEvent) => e.preventDefault();
  const blockDragOver = (e: DragEvent) => {
    e.preventDefault();
    e.stopImmediatePropagation();
  };
  const blockDrop = (e: DragEvent) => {
    e.preventDefault();
    e.stopImmediatePropagation();
  };

  // ---- computed ----
  /** 是否有上传正在进行 */
  const isBusy = computed(() => uploadingKind.value !== null);

  /** 上传类型 → 中文提示文案 */
  const UPLOAD_LABEL: Record<EdmUploadKind, string> = {
    image: '图片上传中',
    video: '视频上传中',
    file: '文件上传中',
  };

  const uploadingLabel = computed(() => UPLOAD_LABEL[uploadingKind.value || 'file']);

  /** 是否已达上传上限 */
  const isUploadLimitReached = computed(() => uploadedCount.value >= maxCount.value);

  // ---- lifecycle ----
  onMounted(async () => {
    registerEdmBlots();
    setEdmUrlResolvers(props.resolveDownloadUrl);

    // 获取上传限制配置（由外部注入）
    if (props.fetchConfig) {
      try {
        const config = await props.fetchConfig();
        maxCount.value = config.maxCount;
      } catch { /* 降级使用默认值 5 */ }
    }

    if (!editorRef.value) return;

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
    });

    addToolbarTitles();
    initImageResize(quill.root);
    quill.on('text-change', syncHtmlFromEditor);
    quill.root.addEventListener('paste', handlePaste, true);
    quill.root.addEventListener('dragstart', blockDragStart);
    quill.root.addEventListener('dragover', blockDragOver, true);
    quill.root.addEventListener('drop', blockDrop, true);

    // 有初始内容时先解析 EDM URL 再写入编辑器
    if (props.modelValue) {
      await setEditorHtml(props.modelValue);
    } else {
      lastHtml.value = getEditorHtml();
    }
  });

  onBeforeUnmount(() => {
    if (!quill) return;
    quill.off('text-change', syncHtmlFromEditor);
    quill.root.removeEventListener('paste', handlePaste, true);
    quill.root.removeEventListener('dragstart', blockDragStart);
    quill.root.removeEventListener('dragover', blockDragOver, true);
    quill.root.removeEventListener('drop', blockDrop, true);
    quill = null;
  });

  // ---- watchers ----
  /**
   * 监听外部 modelValue 变化，同步到编辑器。
   *
   * 通过 `lastHtml` 比对避免自身编辑触发的循环更新。
   */
  watch(
    () => props.modelValue,
    async (nextValue) => {
      if (!quill || nextValue === lastHtml.value) return;
      const selection = quill.getSelection();
      quill.setText('', 'silent');
      if (nextValue) await setEditorHtml(nextValue);
      const nextIndex = Math.min(selection?.index || 0, quill.getLength() - 1);
      quill.setSelection(nextIndex, selection?.length || 0, 'silent');
      syncHtmlFromEditor();
    },
  );

  /** 监听 readOnly 切换，启用/禁用编辑器 */
  watch(
    () => props.readOnly,
    (nextReadOnly) => quill?.enable(!nextReadOnly),
  );

  // ---- toolbar titles ----
  /**
   * 为 Quill 工具栏按钮添加中文 title 提示。
   *
   * 遍历工具栏 DOM 容器，为匹配的按钮设置 `title` 属性。
   */
  function addToolbarTitles(): void {
    if (!quill) return;
    const tb = quill.getModule('toolbar') as { container?: HTMLElement } | undefined;
    const container = tb?.container;
    if (!(container instanceof HTMLElement)) return;

    const titles: Record<string, string> = {
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
      'ql-clean': '清除格式',
    };

    for (const selector of Object.keys(titles)) {
      const el = container.querySelector(`.${selector}`);
      if (el && !el.hasAttribute('title')) {
        el.setAttribute('title', titles[selector]);
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
    if (props.readOnly || isBusy.value) return;
    if (uploadedCount.value >= maxCount.value) {
      errorMessage.value = `最多上传 ${maxCount.value} 个文件`;
      return;
    }
    const ref =
      kind === 'image' ? imageInputRef : kind === 'video' ? videoInputRef : fileInputRef;
    ref.value?.click();
  }

  /**
   * file input 的 change 事件处理：读取选中文件并触发插入流程。
   *
   * 处理后清空 input.value，确保重复选择同一文件也能再次触发 change。
   */
  async function handleFileInputChange(kind: EdmUploadKind, event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const files = Array.from(input.files || []);
    input.value = '';
    if (!files.length) return;
    await insertFiles(files, kind);
  }

  // ---- file insertion ----
  /**
   * 将一批文件依次上传并插入编辑器。
   *
   * @param files       - 待插入的文件列表
   * @param forcedKind  - 强制指定类型；不传则根据 MIME 自动推断
   */
  async function insertFiles(files: File[], forcedKind?: EdmUploadKind): Promise<void> {
    if (!quill || props.readOnly) return;
    // 同步预占位，防止快速连续粘贴绕过限制
    const remaining = maxCount.value - uploadedCount.value;
    if (remaining <= 0) return;
    const toUpload = files.slice(0, remaining);
    uploadedCount.value += toUpload.length;
    // 在光标位置处插入；无选区时插入到文档末尾
    let insertIndex = quill.getSelection(true)?.index ?? Math.max(quill.getLength() - 1, 0);
    for (const file of toUpload) {
      const kind = forcedKind || inferUploadKind(file);
      try {
        insertIndex = await uploadAndInsert(file, kind, insertIndex);
      } catch {
        uploadedCount.value--; // 失败则释放占位
        continue;
      }
    }
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
    if (!quill) return insertIndex;

    errorMessage.value = '';
    uploadingKind.value = kind;
    emit('upload-start', { file, kind });

    try {
      const result = await props.upload(file, kind);
      if (!result.edmId) throw new Error('上传接口未返回 edmId');

      const embedValue = await buildEmbedValue(file, kind, result);
      quill.insertEmbed(insertIndex, getBlotName(kind), embedValue, 'user');
      quill.setSelection(insertIndex + 1, 0, 'silent');
      syncHtmlFromEditor();
      emit('upload-success', { file, kind, result });
      return insertIndex + 1;
    } catch (error) {
      errorMessage.value = getErrorMessage(error);
      emit('upload-error', { file, kind, error });
      throw error;
    } finally {
      uploadingKind.value = null;
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
    const url =
      result.downloadUrl
      || result.url
      || (await props.resolveDownloadUrl?.('', result.edmId, kind, result))
      || '';

    return {
      edmId: result.edmId,
      attachmentId: result.attachmentId,
      url,
      name: result.fileName || file.name,
      mimeType: result.mimeType || file.type,
      size: result.size ?? file.size,
    };
  }

  // ---- embed refresh (loaded content) ----
  /**
   * 预处理 HTML 中的 EDM 嵌入元素。
   *
   * 文件类型预解析下载 URL，图片/视频仅清除旧的 data-src，
   * 交由 IntersectionObserver 在元素进入视口时懒解析预览 URL。
   */
  async function resolveHtmlEmbeds(html: string): Promise<string> {
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');
    const containers = doc.querySelectorAll<HTMLElement>('[data-edm-type]');

    await Promise.allSettled(
      Array.from(containers).map(async (el) => {
        const edmId = el.getAttribute('data-edm-id');
        const kind = el.getAttribute('data-edm-type') as EdmUploadKind;
        if (!edmId || !kind) return;

        if (kind === 'file') {
          // 文件类型：解析下载 URL 并更新链接
          const attachmentIdRaw = el.getAttribute('data-attachment-id');
          const url = (await props.resolveDownloadUrl?.(
            attachmentIdRaw || '',
            edmId,
            kind,
          )) || '';
          const link = el.querySelector('a');
          if (link) link.setAttribute('href', url);
        } else {
          // 图片/视频：清除旧的 data-src，触发 IntersectionObserver 重新懒加载
          const media = el.querySelector<HTMLImageElement | HTMLVideoElement>('img, video');
          if (media) delete media.dataset.src;
        }
      }),
    );

    return doc.body.innerHTML;
  }

  // ---- paste ----
  /**
   * 粘贴事件处理：提取剪贴板中的文件并插入编辑器。
   *
   * 无文件时走 Quill 默认粘贴行为。
   */
  function handlePaste(event: ClipboardEvent): void {
    const files = Array.from(event.clipboardData?.files || []);
    if (!files.length) return;
    event.preventDefault();
    event.stopImmediatePropagation();

    // 限制粘贴数量不超过上传上限
    const remaining = maxCount.value - uploadedCount.value;
    if (remaining <= 0) {
      errorMessage.value = `最多上传 ${maxCount.value} 个文件`;
      return;
    }
    void insertFiles(files.slice(0, remaining));
  }

  /**
   * 将 HTML 写入编辑器。
   *
   * 写入前会先解析 EDM 嵌入的 URL，写入期间暂时解除 text-change 监听避免误触发同步。
   */
  async function setEditorHtml(html: string): Promise<void> {
    if (!quill) return;
    const resolvedHtml = await resolveHtmlEmbeds(html);
    quill.off('text-change', syncHtmlFromEditor);
    quill.clipboard.dangerouslyPasteHTML(resolvedHtml, 'silent');
    quill.on('text-change', syncHtmlFromEditor);
    ensureTrailingParagraph();
    syncHtmlFromEditor();
  }

  /**
   * 确保编辑器末尾存在一个换行段落。
   *
   * 如果编辑器以 EDM embed 结尾，缺少换行会导致光标无法定位到 embed 之后。
   */
  function ensureTrailingParagraph(): void {
    if (!quill) return;
    quill.insertText(quill.getLength(), '\n', 'api');
  }

  // ---- HTML sync ----
  /**
   * 从编辑器 DOM 中提取所有 EDM 附件列表（去重）。
   *
   * 用于同步 `update:attachmentList` 事件，供父组件追踪已使用的 EDM 资源。
   */
  function extractAttachments(): EdmAttachment[] {
    if (!quill) return [];
    const els = quill.root.querySelectorAll<HTMLElement>('[data-edm-id]');
    const seen = new Set<string>();
    const list: EdmAttachment[] = [];
    els.forEach((el) => {
      const edmId = el.getAttribute('data-edm-id');
      if (!edmId || seen.has(edmId)) return;
      seen.add(edmId);
      const raw = el.getAttribute('data-attachment-id');
      list.push({
        edmId,
        attachmentId: raw ? Number(raw) : undefined,
        kind: (el.getAttribute('data-edm-type') as EdmUploadKind) || 'file',
      });
    });
    return list;
  }

  /**
   * 从编辑器取出 HTML 并触发 modelValue / change / attachmentList 事件。
   */
  function syncHtmlFromEditor(): void {
    const html = getEditorHtml();
    lastHtml.value = html;
    emit('update:modelValue', html);
    emit('change', html);
    emit('update:attachmentList', extractAttachments());
  }

  /**
   * 获取编辑器当前 HTML。
   *
   * 克隆 DOM 后先移除缩放把手（防止泄漏到输出），
   * 若末尾以 EDM embed 结尾则补一个空段落确保重新加载时结构完整。
   */
  function getEditorHtml(): string {
    if (!quill) return '';
    // 克隆根节点，移除缩放把手避免污染 HTML 输出
    const clone = quill.root.cloneNode(true) as HTMLElement;
    removeAllResizeHandles(clone);
    const html = clone.innerHTML;
    // 末尾如果是 EDM embed，多补一个 <p><br></p>，
    // 防止保存后重新加载时唯一一个末尾段落被 Quill 当结构换行符合并
    if (/<\/edm-(?:image|video|file)>(?:<\/p>)?\s*$/.test(html.trimEnd())) {
      return html + '<p><br></p>';
    }
    return html;
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
    uploadedCount,
    handleFileInputChange,
  };
}

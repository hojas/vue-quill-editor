import { computed, onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue';
import Quill from 'quill';
import { registerEdmBlots, setEdmUrlResolvers } from '../quill/edmBlots';
import { initImageResize, removeAllResizeHandles } from '../quill/imageResize';
import {
  getBlotName,
  getErrorMessage,
  inferUploadKind,
  resolveEdmUrl,
} from '../utils/helpers';
import type {
  EdmAttachment,
  EdmEmbedValue,
  EdmUploadErrorPayload,
  EdmUploadHandler,
  EdmUploadKind,
  EdmUploadResult,
  EdmUploadSuccessPayload,
  EdmUrlResolver,
} from '../types/edm';

export interface UseEdmEditorProps {
  modelValue: string;
  placeholder: string;
  readOnly: boolean;
  upload: EdmUploadHandler;
  resolvePreviewUrl?: EdmUrlResolver;
  resolveDownloadUrl?: EdmUrlResolver;
  imageAccept: string;
  videoAccept: string;
  fileAccept: string;
}

export interface UseEdmEditorEmit {
  (event: 'update:modelValue', value: string): void;
  (event: 'change', value: string): void;
  (event: 'upload-start', payload: { file: File; kind: EdmUploadKind }): void;
  (event: 'upload-success', payload: EdmUploadSuccessPayload): void;
  (event: 'upload-error', payload: EdmUploadErrorPayload): void;
  (event: 'update:attachmentList', value: EdmAttachment[]): void;
}

const toolbarConfig = [
  [{ header: [1, 2, false] }],
  ['bold', 'italic', 'underline', 'strike'],
  [{ list: 'ordered' }, { list: 'bullet' }, 'blockquote', 'code-block'],
  ['link', 'edmImage', 'edmVideo', 'edmFile'],
  ['clean'],
];

export function useEdmEditor(props: UseEdmEditorProps, emit: UseEdmEditorEmit) {
  // ---- DOM refs ----
  const editorRef = ref<HTMLDivElement | null>(null);
  const imageInputRef = ref<HTMLInputElement | null>(null);
  const videoInputRef = ref<HTMLInputElement | null>(null);
  const fileInputRef = ref<HTMLInputElement | null>(null);

  // ---- state ----
  const uploadingKind = shallowRef<EdmUploadKind | null>(null);
  const errorMessage = shallowRef('');
  const lastHtml = shallowRef('');

  let quill: Quill | null = null;
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
  const isBusy = computed(() => uploadingKind.value !== null);

  const UPLOAD_LABEL: Record<EdmUploadKind, string> = {
    image: '图片上传中',
    video: '视频上传中',
    file: '文件上传中',
  };

  const uploadingLabel = computed(() => UPLOAD_LABEL[uploadingKind.value || 'file']);

  // ---- lifecycle ----
  onMounted(async () => {
    registerEdmBlots();
    setEdmUrlResolvers(props.resolvePreviewUrl);
    if (!editorRef.value) return;

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
    quill.root.addEventListener('paste', handlePaste);
    quill.root.addEventListener('dragstart', blockDragStart);
    quill.root.addEventListener('dragover', blockDragOver, true);
    quill.root.addEventListener('drop', blockDrop, true);

    if (props.modelValue) {
      await setEditorHtml(props.modelValue);
    } else {
      lastHtml.value = getEditorHtml();
    }
  });

  onBeforeUnmount(() => {
    if (!quill) return;
    quill.off('text-change', syncHtmlFromEditor);
    quill.root.removeEventListener('paste', handlePaste);
    quill.root.removeEventListener('dragstart', blockDragStart);
    quill.root.removeEventListener('dragover', blockDragOver, true);
    quill.root.removeEventListener('drop', blockDrop, true);
    quill = null;
  });

  // ---- watchers ----
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

  watch(
    () => props.readOnly,
    (nextReadOnly) => quill?.enable(!nextReadOnly),
  );

  // ---- toolbar titles ----
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
  function openFilePicker(kind: EdmUploadKind): void {
    if (props.readOnly || isBusy.value) return;
    const ref =
      kind === 'image' ? imageInputRef : kind === 'video' ? videoInputRef : fileInputRef;
    ref.value?.click();
  }

  async function handleFileInputChange(kind: EdmUploadKind, event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const files = Array.from(input.files || []);
    input.value = '';
    if (!files.length) return;
    await insertFiles(files, kind);
  }

  // ---- file insertion ----
  async function insertFiles(files: File[], forcedKind?: EdmUploadKind): Promise<void> {
    if (!quill || props.readOnly) return;
    let insertIndex = quill.getSelection(true)?.index ?? Math.max(quill.getLength() - 1, 0);
    for (const file of files) {
      const kind = forcedKind || inferUploadKind(file);
      try {
        insertIndex = await uploadAndInsert(file, kind, insertIndex);
      } catch {
        continue;
      }
    }
  }

  // ---- upload & embed ----
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

  async function buildEmbedValue(
    file: File,
    kind: EdmUploadKind,
    result: EdmUploadResult,
  ): Promise<EdmEmbedValue> {
    const downloadUrl =
      result.downloadUrl
      || result.url
      || (await resolveEdmUrl(props.resolveDownloadUrl, result.edmId, kind, result));

    const previewUrl =
      kind === 'file'
        ? downloadUrl
        : result.previewUrl
          || result.url
          || (await resolveEdmUrl(props.resolvePreviewUrl, result.edmId, kind, result));

    return {
      edmId: result.edmId,
      attachmentId: result.attachmentId,
      url: kind === 'file' ? downloadUrl : previewUrl || downloadUrl,
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
          const attachmentIdRaw = el.getAttribute('data-attachment-id');
          const url = await resolveEdmUrl(
            props.resolveDownloadUrl,
            edmId,
            kind,
            { edmId, attachmentId: attachmentIdRaw ? Number(attachmentIdRaw) : undefined },
          );
          const link = el.querySelector('a');
          if (link) link.setAttribute('href', url);
        } else {
          const media = el.querySelector<HTMLImageElement | HTMLVideoElement>('img, video');
          if (media) delete media.dataset.src;
        }
      }),
    );

    return doc.body.innerHTML;
  }

  // ---- paste ----
  function handlePaste(event: ClipboardEvent): void {
    const files = Array.from(event.clipboardData?.files || []);
    if (!files.length) return;
    event.preventDefault();
    void insertFiles(files);
  }

  async function setEditorHtml(html: string): Promise<void> {
    if (!quill) return;
    const resolvedHtml = await resolveHtmlEmbeds(html);
    quill.off('text-change', syncHtmlFromEditor);
    quill.clipboard.dangerouslyPasteHTML(resolvedHtml, 'silent');
    quill.on('text-change', syncHtmlFromEditor);
    ensureTrailingParagraph();
    syncHtmlFromEditor();
  }

  function ensureTrailingParagraph(): void {
    if (!quill) return;
    quill.insertText(quill.getLength(), '\n', 'api');
  }

  // ---- HTML sync ----
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

  function syncHtmlFromEditor(): void {
    const html = getEditorHtml();
    lastHtml.value = html;
    emit('update:modelValue', html);
    emit('change', html);
    emit('update:attachmentList', extractAttachments());
  }

  function getEditorHtml(): string {
    if (!quill) return '';
    // Clone the root and remove resize handles so they don't leak into HTML output.
    const clone = quill.root.cloneNode(true) as HTMLElement;
    removeAllResizeHandles(clone);
    const html = clone.innerHTML;
    // 末尾如果是 EDM embed，多补一个 <p><br></p>，
    // 防止保存后重新加载时唯一一个末尾段落被 Quill 当结构换行符合并。
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
    handleFileInputChange,
  };
}

import { computed, onBeforeUnmount, onMounted, ref, watch, type Ref } from 'vue';
import Quill from 'quill';
import { registerEdmBlots, setEdmUrlResolvers } from '../quill/edmBlots';
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
  const uploadingKind = ref<EdmUploadKind | null>(null);
  const errorMessage = ref('');
  const lastHtml = ref('');

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

  const uploadingLabel = computed(() => {
    if (uploadingKind.value === 'image') return '图片上传中';
    if (uploadingKind.value === 'video') return '视频上传中';
    return '文件上传中';
  });

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

  // ---- file picker ----
  function openFilePicker(kind: EdmUploadKind): void {
    if (props.readOnly || isBusy.value) return;
    getInputRef(kind).value?.click();
  }

  function getInputRef(kind: EdmUploadKind): Ref<HTMLInputElement | null> {
    if (kind === 'image') return imageInputRef;
    if (kind === 'video') return videoInputRef;
    return fileInputRef;
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

  function inferUploadKind(file: File): EdmUploadKind {
    if (file.type.startsWith('image/')) return 'image';
    if (file.type.startsWith('video/')) return 'video';
    return 'file';
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
      || (await resolveUrl(props.resolveDownloadUrl, result.edmId, kind, result));

    const previewUrl =
      kind === 'file'
        ? downloadUrl
        : result.previewUrl
          || result.url
          || (await resolveUrl(props.resolvePreviewUrl, result.edmId, kind, result));

    return {
      edmId: result.edmId,
      attachmentId: result.attachmentId,
      url: kind === 'file' ? downloadUrl : previewUrl || downloadUrl,
      name: result.fileName || file.name,
      mimeType: result.mimeType || file.type,
      size: result.size ?? file.size,
    };
  }

  function getBlotName(kind: EdmUploadKind): string {
    if (kind === 'image') return 'edmImage';
    if (kind === 'video') return 'edmVideo';
    return 'edmFile';
  }

  // ---- URL resolution ----
  async function resolveUrl(
    resolver: EdmUrlResolver | undefined,
    edmId: string,
    kind: EdmUploadKind,
    result: EdmUploadResult,
  ): Promise<string> {
    if (resolver) {
      const attachmentId = result.attachmentId != null ? String(result.attachmentId) : '';
      return resolver(attachmentId, edmId, kind, result);
    }
    const id = result.attachmentId ?? edmId;
    return `/api/edm/${encodeURIComponent(String(id))}/download`;
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
          const url = await resolveUrl(
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
    const html = quill?.root.innerHTML || '';
    // 末尾如果是 EDM embed，多补一个 <p><br></p>，
    // 防止保存后重新加载时唯一一个末尾段落被 Quill 当结构换行符合并。
    if (/<\/edm-(?:image|video|file)>(?:<\/p>)?\s*$/.test(html.trimEnd())) {
      return html + '<p><br></p>';
    }
    return html;
  }

  function getErrorMessage(error: unknown): string {
    return error instanceof Error ? error.message : '上传失败';
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

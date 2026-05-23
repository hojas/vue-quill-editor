import { computed, onBeforeUnmount, onMounted, ref, watch, type Ref } from 'vue';
import Quill from 'quill';
import { registerEdmBlots } from '../quill/edmBlots';
import type {
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
    quill.root.addEventListener('drop', handleDrop);
    quill.root.addEventListener('dragover', handleDragOver);

    if (props.modelValue) {
      quill.clipboard.dangerouslyPasteHTML(props.modelValue, 'silent');
      await refreshEdmEmbeds();
      syncHtmlFromEditor();
    } else {
      lastHtml.value = getEditorHtml();
    }
  });

  onBeforeUnmount(() => {
    if (!quill) return;
    quill.off('text-change', syncHtmlFromEditor);
    quill.root.removeEventListener('paste', handlePaste);
    quill.root.removeEventListener('drop', handleDrop);
    quill.root.removeEventListener('dragover', handleDragOver);
    quill = null;
  });

  // ---- watchers ----
  watch(
    () => props.modelValue,
    async (nextValue) => {
      if (!quill || nextValue === lastHtml.value) return;
      const selection = quill.getSelection();
      quill.setText('', 'silent');
      if (nextValue) {
        quill.clipboard.dangerouslyPasteHTML(nextValue, 'silent');
        await refreshEdmEmbeds();
      }
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
      const id = result.attachmentId != null ? String(result.attachmentId) : edmId;
      return resolver(id, kind, result);
    }
    const id = result.attachmentId ?? edmId;
    return `/api/edm/${encodeURIComponent(String(id))}/download`;
  }

  // ---- embed refresh (loaded content) ----
  async function refreshEdmEmbeds(): Promise<void> {
    if (!quill) return;
    const containers = quill.root.querySelectorAll<HTMLElement>('[data-edm-type]');

    await Promise.allSettled(
      Array.from(containers).map(async (container) => {
        const edmId = container.getAttribute('data-edm-id');
        const kind = container.getAttribute('data-edm-type') as EdmUploadKind;
        if (!edmId || !kind) return;

        const attachmentIdRaw = container.getAttribute('data-attachment-id');
        const dummyResult: EdmUploadResult = {
          edmId,
          attachmentId: attachmentIdRaw ? Number(attachmentIdRaw) : undefined,
        };

        if (kind === 'file') {
          const url = await resolveUrl(props.resolveDownloadUrl, edmId, kind, dummyResult);
          const link = container.querySelector('a');
          if (link) link.setAttribute('href', url);
        } else {
          const downloadUrl = await resolveUrl(props.resolveDownloadUrl, edmId, kind, dummyResult);
          const previewUrl = await resolveUrl(props.resolvePreviewUrl, edmId, kind, dummyResult);
          const url = previewUrl || downloadUrl;
          const media = container.querySelector('img, video');
          if (media) media.setAttribute('src', url);
        }
      }),
    );
  }

  // ---- drag & drop, paste ----
  function handlePaste(event: ClipboardEvent): void {
    const files = Array.from(event.clipboardData?.files || []);
    if (!files.length) return;
    event.preventDefault();
    void insertFiles(files);
  }

  function handleDrop(event: DragEvent): void {
    const files = Array.from(event.dataTransfer?.files || []);
    if (!files.length) return;
    event.preventDefault();
    void insertFiles(files);
  }

  function handleDragOver(event: DragEvent): void {
    const hasFile = Array.from(event.dataTransfer?.items || []).some(
      (item) => item.kind === 'file',
    );
    if (hasFile) event.preventDefault();
  }

  // ---- HTML sync ----
  function syncHtmlFromEditor(): void {
    const html = getEditorHtml();
    lastHtml.value = html;
    emit('update:modelValue', html);
    emit('change', html);
  }

  function getEditorHtml(): string {
    return quill?.root.innerHTML || '';
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

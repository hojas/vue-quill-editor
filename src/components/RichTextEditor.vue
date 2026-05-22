<template>
  <div class="rich-editor" :class="{ 'rich-editor--readonly': readOnly }">
    <div ref="toolbarRef" class="rich-editor__toolbar">
      <span class="ql-formats">
        <select class="ql-header">
          <option value="1"></option>
          <option value="2"></option>
          <option value="" selected></option>
        </select>
      </span>

      <span class="ql-formats">
        <button class="ql-bold" type="button"></button>
        <button class="ql-italic" type="button"></button>
        <button class="ql-underline" type="button"></button>
        <button class="ql-strike" type="button"></button>
      </span>

      <span class="ql-formats">
        <button class="ql-list" type="button" value="ordered"></button>
        <button class="ql-list" type="button" value="bullet"></button>
        <button class="ql-blockquote" type="button"></button>
        <button class="ql-code-block" type="button"></button>
      </span>

      <span class="ql-formats">
        <button class="ql-link" type="button"></button>
        <button
          class="ql-edmImage"
          type="button"
          :disabled="isBusy"
          title="上传图片"
          aria-label="上传图片"
        ></button>
        <button
          class="ql-edmVideo"
          type="button"
          :disabled="isBusy"
          title="上传视频"
          aria-label="上传视频"
        ></button>
        <button
          class="ql-edmFile"
          type="button"
          :disabled="isBusy"
          title="上传文件"
          aria-label="上传文件"
        ></button>
      </span>

      <span class="ql-formats">
        <button class="ql-clean" type="button"></button>
      </span>
    </div>

    <div class="rich-editor__canvas">
      <div ref="editorRef" class="rich-editor__body"></div>
      <div v-if="isBusy" class="rich-editor__uploading" role="status">
        <span class="rich-editor__spinner" aria-hidden="true"></span>
        <span>{{ uploadingLabel }}</span>
      </div>
    </div>

    <p v-if="errorMessage" class="rich-editor__error">{{ errorMessage }}</p>

    <input
      ref="imageInputRef"
      class="rich-editor__input"
      type="file"
      :accept="imageAccept"
      multiple
      @change="handleFileInputChange('image', $event)"
    />
    <input
      ref="videoInputRef"
      class="rich-editor__input"
      type="file"
      :accept="videoAccept"
      multiple
      @change="handleFileInputChange('video', $event)"
    />
    <input
      ref="fileInputRef"
      class="rich-editor__input"
      type="file"
      :accept="fileAccept"
      multiple
      @change="handleFileInputChange('file', $event)"
    />
  </div>
</template>

<script setup lang="ts">
import 'quill/dist/quill.snow.css';

import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
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

const props = withDefaults(
  defineProps<{
    modelValue?: string;
    placeholder?: string;
    readOnly?: boolean;
    upload: EdmUploadHandler;
    resolvePreviewUrl?: EdmUrlResolver;
    resolveDownloadUrl?: EdmUrlResolver;
    imageAccept?: string;
    videoAccept?: string;
    fileAccept?: string;
  }>(),
  {
    modelValue: '',
    placeholder: '请输入内容',
    readOnly: false,
    imageAccept: 'image/*',
    videoAccept: 'video/*',
    fileAccept: '',
  },
);

const emit = defineEmits<{
  'update:modelValue': [value: string];
  change: [value: string];
  'upload-start': [{ file: File; kind: EdmUploadKind }];
  'upload-success': [EdmUploadSuccessPayload];
  'upload-error': [EdmUploadErrorPayload];
}>();

const toolbarRef = ref<HTMLDivElement | null>(null);
const editorRef = ref<HTMLDivElement | null>(null);
const imageInputRef = ref<HTMLInputElement | null>(null);
const videoInputRef = ref<HTMLInputElement | null>(null);
const fileInputRef = ref<HTMLInputElement | null>(null);
const uploadingKind = ref<EdmUploadKind | null>(null);
const errorMessage = ref('');
const lastHtml = ref('');

let quill: Quill | null = null;

const isBusy = computed(() => uploadingKind.value !== null);

const uploadingLabel = computed(() => {
  if (uploadingKind.value === 'image') {
    return '图片上传中';
  }

  if (uploadingKind.value === 'video') {
    return '视频上传中';
  }

  return '文件上传中';
});

onMounted(() => {
  registerEdmBlots();

  if (!editorRef.value || !toolbarRef.value) {
    return;
  }

  quill = new Quill(editorRef.value, {
    theme: 'snow',
    placeholder: props.placeholder,
    readOnly: props.readOnly,
    modules: {
      toolbar: {
        container: toolbarRef.value,
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
  }

  lastHtml.value = getEditorHtml();
});

onBeforeUnmount(() => {
  if (!quill) {
    return;
  }

  quill.off('text-change', syncHtmlFromEditor);
  quill.root.removeEventListener('paste', handlePaste);
  quill.root.removeEventListener('drop', handleDrop);
  quill.root.removeEventListener('dragover', handleDragOver);
  quill = null;
});

watch(
  () => props.modelValue,
  (nextValue) => {
    if (!quill || nextValue === lastHtml.value) {
      return;
    }

    const selection = quill.getSelection();
    quill.setText('', 'silent');

    if (nextValue) {
      quill.clipboard.dangerouslyPasteHTML(nextValue, 'silent');
    }

    const nextIndex = Math.min(selection?.index || 0, quill.getLength() - 1);
    quill.setSelection(nextIndex, selection?.length || 0, 'silent');
    lastHtml.value = getEditorHtml();
  },
);

watch(
  () => props.readOnly,
  (nextReadOnly) => {
    quill?.enable(!nextReadOnly);
  },
);

function openFilePicker(kind: EdmUploadKind): void {
  if (props.readOnly || isBusy.value) {
    return;
  }

  const input = getInputRef(kind).value;
  input?.click();
}

function getInputRef(kind: EdmUploadKind) {
  if (kind === 'image') {
    return imageInputRef;
  }

  if (kind === 'video') {
    return videoInputRef;
  }

  return fileInputRef;
}

async function handleFileInputChange(kind: EdmUploadKind, event: Event): Promise<void> {
  const input = event.target as HTMLInputElement;
  const files = Array.from(input.files || []);
  input.value = '';

  if (!files.length) {
    return;
  }

  await insertFiles(files, kind);
}

async function insertFiles(files: File[], forcedKind?: EdmUploadKind): Promise<void> {
  if (!quill || props.readOnly) {
    return;
  }

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

async function uploadAndInsert(
  file: File,
  kind: EdmUploadKind,
  insertIndex: number,
): Promise<number> {
  if (!quill) {
    return insertIndex;
  }

  errorMessage.value = '';
  uploadingKind.value = kind;
  emit('upload-start', { file, kind });

  try {
    const result = await props.upload(file, kind);

    if (!result.edmId) {
      throw new Error('上传接口未返回 edmId');
    }

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
    result.downloadUrl ||
    result.url ||
    (await resolveUrl(props.resolveDownloadUrl, result.edmId, kind, result));
  const previewUrl =
    kind === 'file'
      ? downloadUrl
      : result.previewUrl ||
        result.url ||
        (await resolveUrl(props.resolvePreviewUrl, result.edmId, kind, result));

  return {
    edmId: result.edmId,
    url: kind === 'file' ? downloadUrl : previewUrl || downloadUrl,
    name: result.fileName || file.name,
    mimeType: result.mimeType || file.type,
    size: result.size ?? file.size,
  };
}

async function resolveUrl(
  resolver: EdmUrlResolver | undefined,
  edmId: string,
  kind: EdmUploadKind,
  result: EdmUploadResult,
): Promise<string> {
  if (resolver) {
    return resolver(edmId, kind, result);
  }

  return `/api/edm/${encodeURIComponent(edmId)}/download`;
}

function getBlotName(kind: EdmUploadKind): string {
  if (kind === 'image') {
    return 'edmImage';
  }

  if (kind === 'video') {
    return 'edmVideo';
  }

  return 'edmFile';
}

function inferUploadKind(file: File): EdmUploadKind {
  if (file.type.startsWith('image/')) {
    return 'image';
  }

  if (file.type.startsWith('video/')) {
    return 'video';
  }

  return 'file';
}

function handlePaste(event: ClipboardEvent): void {
  const files = Array.from(event.clipboardData?.files || []);

  if (!files.length) {
    return;
  }

  event.preventDefault();
  void insertFiles(files);
}

function handleDrop(event: DragEvent): void {
  const files = Array.from(event.dataTransfer?.files || []);

  if (!files.length) {
    return;
  }

  event.preventDefault();
  void insertFiles(files);
}

function handleDragOver(event: DragEvent): void {
  const hasFile = Array.from(event.dataTransfer?.items || []).some(
    (item) => item.kind === 'file',
  );

  if (hasFile) {
    event.preventDefault();
  }
}

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
  if (error instanceof Error) {
    return error.message;
  }

  return '上传失败';
}
</script>

<style scoped>
.rich-editor {
  position: relative;
  overflow: hidden;
  border: 1px solid #d7dee8;
  border-radius: 8px;
  background: #ffffff;
  box-shadow: 0 18px 42px rgba(28, 42, 61, 0.08);
}

.rich-editor--readonly {
  background: #f8fafc;
}

.rich-editor__toolbar {
  border: 0;
  border-bottom: 1px solid #d7dee8;
  background: #fbfcfe;
}

.rich-editor__canvas {
  position: relative;
}

.rich-editor__body {
  min-height: 380px;
}

.rich-editor__input {
  display: none;
}

.rich-editor__uploading {
  position: absolute;
  inset: 12px 12px auto auto;
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 7px 10px;
  border: 1px solid #b7d6cb;
  border-radius: 8px;
  background: rgba(240, 253, 248, 0.94);
  color: #176c56;
  font-size: 13px;
  font-weight: 600;
  box-shadow: 0 8px 24px rgba(23, 108, 86, 0.12);
}

.rich-editor__spinner {
  width: 16px;
  height: 16px;
  border: 2px solid #b7d6cb;
  border-top-color: #176c56;
  border-radius: 50%;
  animation: rich-editor-spin 0.7s linear infinite;
}

.rich-editor__error {
  margin: 0;
  padding: 10px 14px;
  border-top: 1px solid #f2c6c6;
  background: #fff5f5;
  color: #b42318;
  font-size: 13px;
}

:deep(.ql-toolbar.ql-snow) {
  border: 0;
}

:deep(.ql-toolbar button svg) {
  width: 18px;
  height: 18px;
}

:deep(.ql-container.ql-snow) {
  border: 0;
  font-size: 15px;
}

:deep(.ql-editor) {
  min-height: 380px;
  padding: 18px;
  color: #1f2a37;
  line-height: 1.7;
}

:deep(.ql-editor.ql-blank::before) {
  left: 18px;
  color: #8a97a8;
  font-style: normal;
}

:deep(.ql-edm-image) {
  display: block;
  max-width: 100%;
  height: auto;
  margin: 14px 0;
  border: 1px solid #e1e7ef;
  border-radius: 8px;
  background: #f7fafc;
}

:deep(.ql-edm-video) {
  display: block;
  width: min(100%, 760px);
  max-width: 100%;
  min-height: 220px;
  margin: 14px 0;
  border: 1px solid #dbe4ee;
  border-radius: 8px;
  background: #111827;
}

:deep(.ql-edm-file) {
  display: inline-flex;
  max-width: 100%;
  align-items: center;
  gap: 8px;
  margin: 8px 0;
  padding: 8px 10px;
  border: 1px solid #cdd9e8;
  border-radius: 8px;
  background: #f8fbff;
  color: #205493;
  font-weight: 600;
  text-decoration: none;
  vertical-align: middle;
}

:deep(.ql-edm-file::before) {
  display: inline-flex;
  width: 24px;
  height: 24px;
  flex: 0 0 24px;
  align-items: center;
  justify-content: center;
  border-radius: 6px;
  background: #e6f0fb;
  color: #205493;
  content: 'F';
  font-size: 12px;
  font-weight: 700;
}

:deep(.ql-edm-file:hover) {
  border-color: #89aed8;
  background: #eef6ff;
}

@keyframes rich-editor-spin {
  to {
    transform: rotate(360deg);
  }
}
</style>

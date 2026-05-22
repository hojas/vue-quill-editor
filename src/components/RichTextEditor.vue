<template>
  <div class="rich-editor" :class="{ 'rich-editor--readonly': readOnly }">
    <div class="rich-editor__canvas">
      <div ref="editorRef" class="rich-editor__body"></div>

      <!-- Uploading overlay -->
      <div v-if="isBusy" class="rich-editor__uploading" role="status">
        <span class="rich-editor__spinner" aria-hidden="true"></span>
        <span>{{ uploadingLabel }}</span>
      </div>
    </div>

    <!-- Error message -->
    <p v-if="errorMessage" class="rich-editor__error">{{ errorMessage }}</p>

    <!-- Hidden file inputs -->
    <input ref="imageInputRef" class="rich-editor__input" type="file" :accept="imageAccept" multiple
      @change="handleFileInputChange('image', $event)" />
    <input ref="videoInputRef" class="rich-editor__input" type="file" :accept="videoAccept" multiple
      @change="handleFileInputChange('video', $event)" />
    <input ref="fileInputRef" class="rich-editor__input" type="file" :accept="fileAccept" multiple
      @change="handleFileInputChange('file', $event)" />
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

// ============================================================
// Component definition
// ============================================================

defineOptions({ name: 'RichTextEditor' });

// ============================================================
// Props & emits
// ============================================================

const props = withDefaults(
  defineProps<{
    /** 编辑器的 HTML 内容（v-model） */
    modelValue?: string;
    /** Quill 编辑器的 placeholder */
    placeholder?: string;
    /** 是否只读模式 */
    readOnly?: boolean;
    /**
     * 上传处理函数。
     *
     * 接收用户选择的文件和资源类型，返回包含 `edmId` 的结果。
     * 使用者在此处对接自己的后端上传接口。
     */
    upload: EdmUploadHandler;
    /**
     * 预览 URL 解析函数。
     *
     * 当上传结果未提供 `previewUrl` 时，编辑器通过此函数
     * 根据 `edmId` 动态解析图片/视频的预览地址。
     */
    resolvePreviewUrl?: EdmUrlResolver;
    /**
     * 下载 URL 解析函数。
     *
     * 当上传结果未提供 `downloadUrl` 时，编辑器通过此函数
     * 根据 `edmId` 动态解析所有资源的下载地址。
     */
    resolveDownloadUrl?: EdmUrlResolver;
    /** 图片上传 accept 属性，默认 `image/*` */
    imageAccept?: string;
    /** 视频上传 accept 属性，默认 `video/*` */
    videoAccept?: string;
    /** 文件上传 accept 属性，默认不限制 */
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
  /** v-model 双向绑定事件 */
  'update:modelValue': [value: string];
  /** 编辑器内容变更事件（与 update:modelValue 同时触发） */
  change: [value: string];
  /** 单个文件开始上传 */
  'upload-start': [{ file: File; kind: EdmUploadKind }];
  /** 单个文件上传成功 */
  'upload-success': [EdmUploadSuccessPayload];
  /** 单个文件上传失败 */
  'upload-error': [EdmUploadErrorPayload];
}>();

// ============================================================
// Refs & reactive state
// ============================================================

const editorRef = ref<HTMLDivElement | null>(null);
const imageInputRef = ref<HTMLInputElement | null>(null);
const videoInputRef = ref<HTMLInputElement | null>(null);
const fileInputRef = ref<HTMLInputElement | null>(null);
const uploadingKind = ref<EdmUploadKind | null>(null);
const errorMessage = ref('');
const lastHtml = ref('');

let quill: Quill | null = null;

// ============================================================
// Toolbar config
// ============================================================

/** Quill 工具栏配置（容器数组形式，由 Quill 自动渲染 DOM） */
const toolbarConfig = [
  [{ header: [1, 2, false] }],
  ['bold', 'italic', 'underline', 'strike'],
  [{ list: 'ordered' }, { list: 'bullet' }, 'blockquote', 'code-block'],
  ['link', 'edmImage', 'edmVideo', 'edmFile'],
  ['clean'],
];

// ============================================================
// Computed
// ============================================================

const isBusy = computed(() => uploadingKind.value !== null);

const uploadingLabel = computed(() => {
  if (uploadingKind.value === 'image') return '图片上传中';
  if (uploadingKind.value === 'video') return '视频上传中';
  return '文件上传中';
});

// ============================================================
// Lifecycle
// ============================================================

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

  // 加载初始内容并刷新嵌入元素的预览 URL
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

// ============================================================
// Watchers
// ============================================================

/** 外部变更 modelValue 时同步编辑器内容 */
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

/** 只读状态变更 */
watch(
  () => props.readOnly,
  (nextReadOnly) => quill?.enable(!nextReadOnly),
);

// ============================================================
// File picker
// ============================================================

function openFilePicker(kind: EdmUploadKind): void {
  if (props.readOnly || isBusy.value) return;
  getInputRef(kind).value?.click();
}

function getInputRef(kind: EdmUploadKind) {
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

// ============================================================
// File insertion
// ============================================================

/** 将一批文件依次上传并插入编辑器 */
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

/** 根据 MIME 类型推断 EDM 资源类型 */
function inferUploadKind(file: File): EdmUploadKind {
  if (file.type.startsWith('image/')) return 'image';
  if (file.type.startsWith('video/')) return 'video';
  return 'file';
}

// ============================================================
// Upload & embed
// ============================================================

/** 上传单个文件并根据返回的 edmId 构建嵌入元素 */
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

/**
 * 根据上传结果构建 `EdmEmbedValue`。
 *
 * 优先使用结果中已返回的 URL，
 * 否则通过 `resolvePreviewUrl` / `resolveDownloadUrl` 动态解析。
 * 文件类型不设独立预览 URL，直接使用下载地址。
 */
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
    url: kind === 'file' ? downloadUrl : previewUrl || downloadUrl,
    name: result.fileName || file.name,
    mimeType: result.mimeType || file.type,
    size: result.size ?? file.size,
  };
}

/** 将 EdmUploadKind 映射到对应的 blot 名称 */
function getBlotName(kind: EdmUploadKind): string {
  if (kind === 'image') return 'edmImage';
  if (kind === 'video') return 'edmVideo';
  return 'edmFile';
}

// ============================================================
// URL resolution
// ============================================================

/**
 * 解析资源 URL。
 *
 * 优先使用使用者提供的 `resolver` 函数，否则回退到
 * `/api/edm/{edmId}/download` 默认路径。
 */
async function resolveUrl(
  resolver: EdmUrlResolver | undefined,
  edmId: string,
  kind: EdmUploadKind,
  result: EdmUploadResult,
): Promise<string> {
  if (resolver) return resolver(edmId, kind, result);
  return `/api/edm/${encodeURIComponent(edmId)}/download`;
}

// ============================================================
// Embed refresh (loaded content)
// ============================================================

/**
 * 刷新编辑器中已有 EDM 嵌入元素的 URL。
 *
 * 在加载已保存的 HTML 内容后调用，根据元素的 `data-edm-id`
 * 重新解析下载/预览地址，并更新对应 DOM 元素的 `src` / `href`。
 * 图片/视频优先使用预览地址，文件直接使用下载地址。
 */
async function refreshEdmEmbeds(): Promise<void> {
  if (!quill) return;

  const containers = quill.root.querySelectorAll<HTMLElement>('[data-edm-type]');

  await Promise.allSettled(
    Array.from(containers).map(async (container) => {
      const edmId = container.getAttribute('data-edm-id');
      const kind = container.getAttribute('data-edm-type') as EdmUploadKind;
      if (!edmId || !kind) return;

      const dummyResult: EdmUploadResult = { edmId };

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

// ============================================================
// Drag & drop, paste
// ============================================================

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

// ============================================================
// HTML sync
// ============================================================

/** 将编辑器 HTML 同步到 v-model 并触发 change 事件 */
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
</script>

<style scoped>
/* ---- Container ---- */
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

.rich-editor__canvas {
  position: relative;
}

.rich-editor__body {
  min-height: 380px;
}

.rich-editor__input {
  display: none;
}

/* ---- Uploading overlay ---- */
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

/* ---- Error ---- */
.rich-editor__error {
  margin: 0;
  padding: 10px 14px;
  border-top: 1px solid #f2c6c6;
  background: #fff5f5;
  color: #b42318;
  font-size: 13px;
}

/* ---- Quill toolbar overrides ---- */
:deep(.ql-toolbar.ql-snow) {
  border: 0;
  border-bottom: 1px solid #d7dee8;
  background: #fbfcfe;
}

:deep(.ql-toolbar button svg) {
  width: 18px;
  height: 18px;
}

/* ---- Quill editor overrides ---- */
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

/* ---- EDM image embed ---- */
:deep(.ql-edm-image) {
  display: block;
  max-width: 100%;
  height: auto;
  margin: 14px 0;
  border: 1px solid #e1e7ef;
  border-radius: 8px;
  background: #f7fafc;
}

/* ---- EDM video embed ---- */
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

/* ---- EDM file embed ---- */
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

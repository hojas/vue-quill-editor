<template>
  <div class="rich-editor" :class="{ 'rich-editor--readonly': readOnly }">
    <div class="rich-editor__canvas">
      <div ref="editorRef" class="rich-editor__body"></div>

      <div v-if="isBusy" class="rich-editor__uploading" role="status">
        <span class="rich-editor__spinner" aria-hidden="true"></span>
        <span>{{ uploadingLabel }}</span>
      </div>
    </div>

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

import type {
  EdmAttachment,
  EdmUploadErrorPayload,
  EdmUploadHandler,
  EdmUploadKind,
  EdmUploadSuccessPayload,
  EdmUrlResolver,
} from '../types/edm';
import { useEdmEditor } from '../composables/useEdmEditor';
import type { UseEdmEditorProps, UseEdmEditorEmit } from '../composables/useEdmEditor';

defineOptions({ name: 'RichTextEditor' });

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
    attachmentList?: EdmAttachment[];
  }>(),
  {
    modelValue: '',
    placeholder: '请输入内容',
    readOnly: false,
    imageAccept: 'image/*',
    videoAccept: 'video/*',
    fileAccept: '',
    attachmentList: () => [],
  },
);

const emit = defineEmits<{
  'update:modelValue': [value: string];
  'update:attachmentList': [value: EdmAttachment[]];
  change: [value: string];
  'upload-start': [{ file: File; kind: EdmUploadKind }];
  'upload-success': [EdmUploadSuccessPayload];
  'upload-error': [EdmUploadErrorPayload];
}>();

const {
  editorRef,
  imageInputRef,
  videoInputRef,
  fileInputRef,
  isBusy,
  uploadingLabel,
  handleFileInputChange,
} = useEdmEditor(props as UseEdmEditorProps, emit as UseEdmEditorEmit);
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

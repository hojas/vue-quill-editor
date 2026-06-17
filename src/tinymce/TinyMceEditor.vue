<script setup lang="ts">
import type {
  EdmAttachment,
  EdmUploadErrorPayload,
  EdmUploadHandler,
  EdmUploadKind,
  EdmUploadSuccessPayload,
  EdmUrlResolver,
} from '../shared/types'
import type { EdmConfig, UseTinyMceEditorEmit, UseTinyMceEditorProps } from './useTinyMceEditor'
import Editor from '@tinymce/tinymce-vue'
import { useTinyMceEditor } from './useTinyMceEditor'

defineOptions({ name: 'TinyMceEditor' })

// ---- Props & Emits ----

const props = withDefaults(
  defineProps<{
    modelValue?: string
    placeholder?: string
    readOnly?: boolean
    upload: EdmUploadHandler
    fetchConfig?: () => Promise<EdmConfig>
    resolvePreviewUrl?: EdmUrlResolver
    resolveDownloadUrl?: EdmUrlResolver
    imageAccept?: string
    videoAccept?: string
    fileAccept?: string
    attachmentList?: EdmAttachment[]
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
)

const emit = defineEmits<{
  'update:modelValue': [value: string]
  'update:attachmentList': [value: EdmAttachment[]]
  'change': [value: string]
  'upload-start': [{ file: File, kind: EdmUploadKind }]
  'upload-success': [EdmUploadSuccessPayload]
  'upload-error': [EdmUploadErrorPayload]
}>()

const {
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
  editorInit,
} = useTinyMceEditor(props as UseTinyMceEditorProps, emit as UseTinyMceEditorEmit)
</script>

<template>
  <div class="tinymce-editor" :class="{ 'tinymce-editor--readonly': readOnly }">
    <div class="tinymce-editor__canvas">
      <Editor
        :init="editorInit"
        class="tinymce-editor__body"
      />

      <div v-if="isBusy" class="tinymce-editor__uploading" role="status">
        <span class="tinymce-editor__spinner" aria-hidden="true" />
        <span>{{ uploadingLabel }}</span>
      </div>

      <div
        v-if="isUploadLimitReached && !isBusy"
        class="tinymce-editor__uploading tinymce-editor__uploading--limit"
        role="status"
      >
        <span>已达上传上限（{{ uploadedCount }}/{{ maxCount }}）</span>
      </div>
    </div>

    <!-- Hidden file inputs (outside TinyMCE iframe) -->
    <input
      ref="imageInputRef"
      class="tinymce-editor__input"
      type="file"
      :accept="imageAccept"
      multiple
      @change="handleFileInputChange('image', $event)"
    >
    <input
      ref="videoInputRef"
      class="tinymce-editor__input"
      type="file"
      :accept="videoAccept"
      multiple
      @change="handleFileInputChange('video', $event)"
    >
    <input
      ref="fileInputRef"
      class="tinymce-editor__input"
      type="file"
      :accept="fileAccept"
      multiple
      @change="handleFileInputChange('file', $event)"
    >

    <div v-if="errorMessage" class="tinymce-editor__error" role="alert">
      {{ errorMessage }}
    </div>
  </div>
</template>

<style scoped>
/* ---- Container ---- */
.tinymce-editor {
  position: relative;
  overflow: hidden;
  border: 1px solid #d7dee8;
  border-radius: 8px;
  background: #ffffff;
  box-shadow: 0 18px 42px rgba(28, 42, 61, 0.08);
}

.tinymce-editor--readonly {
  background: #f8fafc;
}

.tinymce-editor__canvas {
  position: relative;
}

.tinymce-editor__input {
  display: none;
}

/* ---- Uploading overlay ---- */
.tinymce-editor__uploading {
  position: absolute;
  inset: 52px 12px auto auto;
  z-index: 10;
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

.tinymce-editor__spinner {
  width: 16px;
  height: 16px;
  border: 2px solid #b7d6cb;
  border-top-color: #176c56;
  border-radius: 50%;
  animation: tinymce-spin 0.7s linear infinite;
}

/* ---- Error message ---- */
.tinymce-editor__error {
  margin: 0;
  padding: 8px 18px;
  border-top: 1px solid #fecaca;
  background: #fef2f2;
  color: #b91c1c;
  font-size: 13px;
}

@keyframes tinymce-spin {
  to {
    transform: rotate(360deg);
  }
}
</style>

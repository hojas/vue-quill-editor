<script setup lang="ts">
import 'quill/dist/quill.snow.css';

import { useEdmEditor } from './useEdmEditor';
import type { EdmConfig, UseEdmEditorEmit, UseEdmEditorProps } from './useEdmEditor';
import type {
  EdmAttachment,
  EdmUploadErrorPayload,
  EdmUploadHandler,
  EdmUploadKind,
  EdmUploadSuccessPayload,
  EdmUrlResolver,
} from '../shared/types';

defineOptions({ name: 'RichTextEditor' });

// ---- Props & Emits ----

const props = withDefaults(
  defineProps<{
    /** 编辑器 HTML 内容（v-model） */
    modelValue?: string;
    /** 占位符文本 */
    placeholder?: string;
    /** 是否只读 */
    readOnly?: boolean;
    /** 文件上传函数，接受 File + kind 返回 EdmUploadResult */
    upload: EdmUploadHandler;
    /** 获取编辑器配置（如最大上传数量，返回 { maxCount }） */
    fetchConfig?: () => Promise<EdmConfig>;
    /** 下载/展示 URL 解析器（图片/视频/文件） */
    resolveDownloadUrl?: EdmUrlResolver;
    /** 图片上传 accept 属性 */
    imageAccept?: string;
    /** 视频上传 accept 属性 */
    videoAccept?: string;
    /** 文件上传 accept 属性 */
    fileAccept?: string;
    /** 当前内容中的 EDM 附件列表 */
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
  /** 内容变更事件 */
  change: [value: string];
  /** 上传开始 */
  'upload-start': [{ file: File; kind: EdmUploadKind }];
  /** 上传成功 */
  'upload-success': [EdmUploadSuccessPayload];
  /** 上传失败 */
  'upload-error': [EdmUploadErrorPayload];
}>();

// 将核心逻辑委托给 useEdmEditor composable
const {
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
} = useEdmEditor(props as UseEdmEditorProps, emit as UseEdmEditorEmit);
</script>

<template>
  <div class="rich-editor" :class="{ 'rich-editor--readonly': readOnly }">
    <div class="rich-editor__canvas">
      <div ref="editorRef" class="rich-editor__body"></div>

      <div v-if="isBusy" class="rich-editor__uploading" role="status">
        <span class="rich-editor__spinner" aria-hidden="true"></span>
        <span>{{ uploadingLabel }}</span>
      </div>

      <div v-if="isUploadLimitReached && !isBusy" class="rich-editor__uploading rich-editor__uploading--limit" role="status">
        <span>已达上传上限（{{ uploadedCount }}/{{ maxCount }}）</span>
      </div>
    </div>

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

    <div v-if="errorMessage" class="rich-editor__error" role="alert">
      {{ errorMessage }}
    </div>
  </div>
</template>

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

/* ---- Error message ---- */
.rich-editor__error {
  margin: 0;
  padding: 8px 18px;
  border-top: 1px solid #fecaca;
  background: #fef2f2;
  color: #b91c1c;
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

@keyframes rich-editor-spin {
  to {
    transform: rotate(360deg);
  }
}
</style>

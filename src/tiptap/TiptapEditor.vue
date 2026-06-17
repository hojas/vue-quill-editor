<script setup lang="ts">
import type {
  EdmAttachment,
  EdmUploadErrorPayload,
  EdmUploadHandler,
  EdmUploadKind,
  EdmUploadSuccessPayload,
  EdmUrlResolver,
} from '../shared/types'
import type { EdmConfig, UseTiptapEditorEmit, UseTiptapEditorProps } from './useTiptapEditor'
import { EditorContent } from '@tiptap/vue-3'
import { computed } from 'vue'
import { useTiptapEditor } from './useTiptapEditor'

defineOptions({ name: 'TiptapEditor' })

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
  editor,
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
  openFilePicker,
  handlePaste,
  handleFileDownloadClick,
} = useTiptapEditor(props as UseTiptapEditorProps, emit as UseTiptapEditorEmit)

// ---- Toolbar helpers ----

interface ToolbarAction {
  key: string
  label: string
  title: string
  active: boolean
  action: () => void
}

const toolbarActions = computed<ToolbarAction[]>(() => {
  const ed = editor.value
  return [
    {
      key: 'h1',
      label: 'H1',
      title: '标题 1',
      active: ed?.isActive('heading', { level: 1 }) ?? false,
      action: () => ed?.chain().focus().toggleHeading({ level: 1 }).run(),
    },
    {
      key: 'h2',
      label: 'H2',
      title: '标题 2',
      active: ed?.isActive('heading', { level: 2 }) ?? false,
      action: () => ed?.chain().focus().toggleHeading({ level: 2 }).run(),
    },
    {
      key: 'bold',
      label: 'B',
      title: '加粗',
      active: ed?.isActive('bold') ?? false,
      action: () => ed?.chain().focus().toggleBold().run(),
    },
    {
      key: 'italic',
      label: 'I',
      title: '倾斜',
      active: ed?.isActive('italic') ?? false,
      action: () => ed?.chain().focus().toggleItalic().run(),
    },
    {
      key: 'underline',
      label: 'U',
      title: '下划线',
      active: ed?.isActive('underline') ?? false,
      action: () => ed?.chain().focus().toggleUnderline().run(),
    },
    {
      key: 'strike',
      label: 'S',
      title: '删除线',
      active: ed?.isActive('strike') ?? false,
      action: () => ed?.chain().focus().toggleStrike().run(),
    },
    {
      key: 'orderedList',
      label: 'OL',
      title: '有序列表',
      active: ed?.isActive('orderedList') ?? false,
      action: () => ed?.chain().focus().toggleOrderedList().run(),
    },
    {
      key: 'bulletList',
      label: 'UL',
      title: '无序列表',
      active: ed?.isActive('bulletList') ?? false,
      action: () => ed?.chain().focus().toggleBulletList().run(),
    },
    {
      key: 'blockquote',
      label: '"',
      title: '引用',
      active: ed?.isActive('blockquote') ?? false,
      action: () => ed?.chain().focus().toggleBlockquote().run(),
    },
    {
      key: 'codeBlock',
      label: '</>',
      title: '代码块',
      active: ed?.isActive('codeBlock') ?? false,
      action: () => ed?.chain().focus().toggleCodeBlock().run(),
    },
  ]
})
</script>

<template>
  <div class="tiptap-editor" :class="{ 'tiptap-editor--readonly': readOnly }">
    <!-- Toolbar -->
    <div v-if="!readOnly" class="tiptap-toolbar" role="toolbar" aria-label="编辑工具栏">
      <div class="tiptap-toolbar__group">
        <button
          v-for="btn in toolbarActions"
          :key="btn.key"
          type="button"
          class="tiptap-toolbar__btn"
          :class="{ 'tiptap-toolbar__btn--active': btn.active }"
          :title="btn.title"
          @click="btn.action"
        >
          {{ btn.label }}
        </button>
      </div>
      <div class="tiptap-toolbar__group">
        <button
          type="button"
          class="tiptap-toolbar__btn"
          title="链接"
          @click="editor?.chain().focus().toggleLink({ href: '' }).run()"
        >
          🔗
        </button>
        <button
          type="button"
          class="tiptap-toolbar__btn"
          title="图片"
          @click="openFilePicker('image')"
        >
          🖼
        </button>
        <button
          type="button"
          class="tiptap-toolbar__btn"
          title="视频"
          @click="openFilePicker('video')"
        >
          🎬
        </button>
        <button
          type="button"
          class="tiptap-toolbar__btn"
          title="文件"
          @click="openFilePicker('file')"
        >
          📎
        </button>
        <button
          type="button"
          class="tiptap-toolbar__btn"
          title="清除格式"
          @click="editor?.chain().focus().clearNodes().unsetAllMarks().run()"
        >
          ✕
        </button>
      </div>
    </div>

    <!-- Editor content -->
    <div class="tiptap-editor__canvas">
      <EditorContent
        :editor="editor"
        class="tiptap-editor__body"
        @paste="handlePaste"
        @click="handleFileDownloadClick"
      />

      <div v-if="isBusy" class="tiptap-editor__uploading" role="status">
        <span class="tiptap-editor__spinner" aria-hidden="true" />
        <span>{{ uploadingLabel }}</span>
      </div>

      <div
        v-if="isUploadLimitReached && !isBusy"
        class="tiptap-editor__uploading tiptap-editor__uploading--limit"
        role="status"
      >
        <span>已达上传上限（{{ uploadedCount }}/{{ maxCount }}）</span>
      </div>
    </div>

    <!-- Hidden file inputs -->
    <input
      ref="imageInputRef"
      class="tiptap-editor__input"
      type="file"
      :accept="imageAccept"
      multiple
      @change="handleFileInputChange('image', $event)"
    >
    <input
      ref="videoInputRef"
      class="tiptap-editor__input"
      type="file"
      :accept="videoAccept"
      multiple
      @change="handleFileInputChange('video', $event)"
    >
    <input
      ref="fileInputRef"
      class="tiptap-editor__input"
      type="file"
      :accept="fileAccept"
      multiple
      @change="handleFileInputChange('file', $event)"
    >

    <div v-if="errorMessage" class="tiptap-editor__error" role="alert">
      {{ errorMessage }}
    </div>
  </div>
</template>

<style scoped>
/* ---- Container ---- */
.tiptap-editor {
  position: relative;
  overflow: hidden;
  border: 1px solid #d7dee8;
  border-radius: 8px;
  background: #ffffff;
  box-shadow: 0 18px 42px rgba(28, 42, 61, 0.08);
}

.tiptap-editor--readonly {
  background: #f8fafc;
}

.tiptap-editor__canvas {
  position: relative;
}

.tiptap-editor__input {
  display: none;
}

/* ---- Toolbar ---- */
.tiptap-toolbar {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  padding: 6px 10px;
  border-bottom: 1px solid #d7dee8;
  background: #fbfcfe;
}

.tiptap-toolbar__group {
  display: flex;
  align-items: center;
  gap: 2px;
}

.tiptap-toolbar__group + .tiptap-toolbar__group {
  margin-left: 8px;
  padding-left: 8px;
  border-left: 1px solid #e2e8f0;
}

.tiptap-toolbar__btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 28px;
  height: 28px;
  padding: 0 6px;
  border: 0;
  border-radius: 4px;
  background: transparent;
  color: #4a5b6e;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  white-space: nowrap;
}

.tiptap-toolbar__btn:hover {
  background: #eef2f7;
  color: #1f2a37;
}

.tiptap-toolbar__btn--active {
  background: #dde7f5;
  color: #1a56db;
}

/* ---- Editor body ---- */
:deep(.tiptap-editor__body .tiptap) {
  min-height: 380px;
  padding: 18px;
  color: #1f2a37;
  font-size: 15px;
  line-height: 1.7;
  outline: none;
}

:deep(.tiptap-editor__body .tiptap p.is-editor-empty:first-child::before) {
  color: #8a97a8;
  content: attr(data-placeholder);
  float: left;
  height: 0;
  pointer-events: none;
}

/* ---- Content styles (mirror Quill snow) ---- */
:deep(.tiptap h1) {
  font-size: 2em;
  line-height: 1.3;
  margin: 0.67em 0;
}

:deep(.tiptap h2) {
  font-size: 1.5em;
  line-height: 1.3;
  margin: 0.75em 0;
}

:deep(.tiptap blockquote) {
  margin: 0;
  padding-left: 16px;
  border-left: 4px solid #ccc;
}

:deep(.tiptap pre) {
  padding: 12px;
  border-radius: 6px;
  background: #23241f;
  color: #f8f8f2;
  font-family: 'SFMono-Regular', Consolas, 'Liberation Mono', monospace;
  font-size: 13px;
  overflow-x: auto;
}

:deep(.tiptap code) {
  padding: 2px 4px;
  border-radius: 3px;
  background: #f0f0f0;
  font-family: 'SFMono-Regular', Consolas, 'Liberation Mono', monospace;
  font-size: 0.9em;
}

:deep(.tiptap pre code) {
  padding: 0;
  background: none;
}

:deep(.tiptap ul),
:deep(.tiptap ol) {
  padding-left: 24px;
}

/* ---- EDM embed styles ---- */
:deep(edm-image) {
  display: block;
  margin: 8px 0;
}

:deep(edm-image img) {
  max-width: 100%;
  border-radius: 6px;
}

:deep(edm-video) {
  display: block;
  margin: 8px 0;
}

:deep(edm-video video) {
  max-width: 100%;
  border-radius: 6px;
}

:deep(edm-file) {
  display: block;
  margin: 8px 0;
}

:deep(edm-file a) {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 8px 14px;
  border: 1px solid #d7dee8;
  border-radius: 6px;
  background: #f8fbff;
  color: #205493;
  font-size: 13px;
  text-decoration: none;
  cursor: pointer;
}

:deep(edm-file a:hover) {
  border-color: #89aed8;
  background: #eef6ff;
}

/* ---- Uploading overlay ---- */
.tiptap-editor__uploading {
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

.tiptap-editor__spinner {
  width: 16px;
  height: 16px;
  border: 2px solid #b7d6cb;
  border-top-color: #176c56;
  border-radius: 50%;
  animation: tiptap-spin 0.7s linear infinite;
}

/* ---- Error message ---- */
.tiptap-editor__error {
  margin: 0;
  padding: 8px 18px;
  border-top: 1px solid #fecaca;
  background: #fef2f2;
  color: #b91c1c;
  font-size: 13px;
}

@keyframes tiptap-spin {
  to {
    transform: rotate(360deg);
  }
}
</style>

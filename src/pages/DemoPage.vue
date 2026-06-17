<script setup lang="ts">
import type { EdmAttachment, EdmUploadKind, EdmUploadResult } from '../shared/types'
import { ref } from 'vue'
import RichTextEditor from '../editor/RichTextEditor.vue'
import TinyMceEditor from '../tinymce/TinyMceEditor.vue'
import EdmContentViewer from '../viewer/EdmContentViewer.vue'

/** Quill 编辑器内容（HTML） */
const content = ref()

/** TinyMCE 编辑器内容（HTML） */
const tinymceContent = ref()

/** 控制编辑器显示/隐藏 */
const showEditor = ref(true)

setTimeout(() => {
  content.value = '<p>         欢迎编辑 EDM 内容。</p><edm-image class="ql-edm-image ql-edm-loaded" data-edm-id="1781291720721-noh7xqza" data-edm-type="image" data-attachment-id="1781291720721" data-file-name="a.png" title="a.png" data-mime-type="image/png" data-file-size="4565"><img data-src="https://c8mqsr1j97cqhcch.public.blob.vercel-storage.com/1781291720721-noh7xqza" alt="a.png" data-edm-id="1781291720721-noh7xqza" data-edm-type="image" data-attachment-id="1781291720721" data-file-name="a.png" title="a.png" data-mime-type="image/png" data-file-size="4565" src="https://c8mqsr1j97cqhcch.public.blob.vercel-storage.com/1781291720721-noh7xqza"></edm-image><p><br></p><edm-image class="ql-edm-image ql-edm-loaded" data-edm-id="1781193873184-3ufx39xl" data-edm-type="image" data-attachment-id="1781193873184" data-file-name="a.png" title="a.png" data-mime-type="image/png" data-file-size="252"><img data-src="https://c8mqsr1j97cqhcch.public.blob.vercel-storage.com/1781193873184-3ufx39xl" alt="a.png" data-edm-id="1781193873184-3ufx39xl" data-edm-type="image" data-attachment-id="1781193873184" data-file-name="a.png" title="a.png" data-mime-type="image/png" data-file-size="252" style="width: 213px; max-width: none; height: 258px;" src="https://c8mqsr1j97cqhcch.public.blob.vercel-storage.com/1781193873184-3ufx39xl"></edm-image><p><br></p>'
}, 1000)

/** 编辑器中已使用的 EDM 附件列表 */
const attachments = ref<EdmAttachment[]>([])

/** 对接后端上传接口 POST /api/edm/upload */
async function uploadEdm(file: File, _kind: EdmUploadKind): Promise<EdmUploadResult> {
  const form = new FormData()
  form.append('file', file)
  const res = await fetch('/api/edm/upload', { method: 'POST', body: form })
  if (!res.ok)
    throw new Error('上传失败')
  return res.json()
}

/** 获取编辑器配置 */
async function fetchEdmConfig() {
  const res = await fetch('/api/edm/config')
  return res.ok ? res.json() : { maxCount: 5 }
}

/** 对接后端下载接口，通过 fetch 获取文件并返回 Blob（供图片/视频预览使用） */
async function resolvePreviewUrl(_attachmentId: string, edmId: string): Promise<Blob> {
  const res = await fetch(`/api/edm/${encodeURIComponent(edmId)}/download`)
  if (!res.ok)
    throw new Error(`预览加载失败: ${res.status}`)
  return res.blob()
}

/** 对接后端下载接口，fetch 文件后通过 showSaveFilePicker 触发浏览器下载 */
async function resolveDownloadUrl(_attachmentId: string, edmId: string): Promise<string> {
  const res = await fetch(`/api/edm/${encodeURIComponent(edmId)}/download`)
  if (!res.ok)
    throw new Error(`下载失败: ${res.status}`)
  const blob = await res.blob()

  // 提取文件名
  const disposition = res.headers.get('Content-Disposition') || ''
  const match = disposition.match(/filename\*=UTF-8''(.+)/)
  const fileName = match ? decodeURIComponent(match[1]) : `file-${edmId}`

  // File System Access API — 弹出系统"另存为"对话框
  if ('showSaveFilePicker' in window) {
    try {
      const handle = await window.showSaveFilePicker({ suggestedName: fileName })
      const writable = await handle.createWritable()
      await writable.write(blob)
      await writable.close()
      return ''
    }
    catch { /* 用户取消 */ return '' }
  }

  // 回退：<a download>（Firefox 等）
  const blobUrl = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = blobUrl
  a.download = fileName
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  setTimeout(() => URL.revokeObjectURL(blobUrl), 1000)
  return ''
}
</script>

<template>
  <main class="app-shell">
    <header class="app-header">
      <p class="app-header__eyebrow">
        Vue 3 · TypeScript · Quill 2.0.3 + TinyMCE 8
      </p>
      <h1>EDM 富文本编辑器</h1>
    </header>

    <div class="app-panes">
      <section class="app-pane" aria-label="Quill 编辑器">
        <h2 class="app-pane__title">
          Quill 编辑
          <button class="app-pane__toggle" @click="showEditor = !showEditor">
            {{ showEditor ? '隐藏编辑器' : '显示编辑器' }}
          </button>
        </h2>
        <RichTextEditor
          v-if="showEditor"
          v-model="content"
          v-model:attachment-list="attachments"
          :upload="uploadEdm"
          :fetch-config="fetchEdmConfig"
          :resolve-preview-url="resolvePreviewUrl"
          :resolve-download-url="resolveDownloadUrl"
        />
      </section>

      <section class="app-pane" aria-label="TinyMCE 编辑器">
        <h2 class="app-pane__title">
          TinyMCE 编辑
        </h2>
        <TinyMceEditor
          v-model="tinymceContent"
          :upload="uploadEdm"
          :fetch-config="fetchEdmConfig"
          :resolve-preview-url="resolvePreviewUrl"
          :resolve-download-url="resolveDownloadUrl"
        />
      </section>

      <section class="app-pane" aria-label="预览">
        <h2 class="app-pane__title">
          预览（Quill）
        </h2>
        <EdmContentViewer
          class="app-preview"
          :content="content"
          :resolve-preview-url="resolvePreviewUrl"
          :resolve-download-url="resolveDownloadUrl"
        />
      </section>
    </div>

    <details class="app-html-dump">
      <summary>Quill HTML 输出</summary>
      <pre>{{ content }}</pre>
    </details>

    <details class="app-html-dump">
      <summary>TinyMCE HTML 输出</summary>
      <pre>{{ tinymceContent }}</pre>
    </details>
  </main>
</template>

<style scoped>
.app-shell {
  margin: 0 auto;
  padding: 32px 24px 64px;
}

.app-header {
  margin-bottom: 28px;
}

.app-header__eyebrow {
  margin: 0 0 4px;
  font-size: 12px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: #6a7b91;
}

.app-header h1 {
  margin: 0;
  font-size: 24px;
}

.app-panes {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 24px;
}

.app-pane {
  min-width: 0;
}

.app-pane__title {
  display: flex;
  align-items: center;
  gap: 12px;
  margin: 0 0 12px;
  font-size: 14px;
  font-weight: 600;
  color: #4a5b6e;
}

.app-pane__toggle {
  padding: 4px 10px;
  border: 1px solid #cdd9e8;
  border-radius: 6px;
  background: #f8fbff;
  color: #205493;
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
}

.app-pane__toggle:hover {
  border-color: #89aed8;
  background: #eef6ff;
}

.app-preview {
  min-height: 200px;
  padding: 18px;
  border: 1px solid #d7dee8;
  border-radius: 8px;
  background: #ffffff;
}

.app-html-dump {
  margin-top: 32px;
  padding: 14px 18px;
  border: 1px solid #d7dee8;
  border-radius: 8px;
  background: #ffffff;
}

.app-html-dump summary {
  font-size: 13px;
  font-weight: 600;
  color: #6a7b91;
  cursor: pointer;
}

.app-html-dump pre {
  margin: 12px 0 0;
  max-height: 260px;
  overflow: auto;
  font-size: 12px;
  line-height: 1.5;
  color: #4a5b6e;
  white-space: pre-wrap;
  word-break: break-all;
}
</style>

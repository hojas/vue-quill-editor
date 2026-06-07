<script setup lang="ts">
import { ref } from 'vue';
import type { EdmAttachment, EdmUploadKind } from '../types/edm';
import RichTextEditor from '../components/RichTextEditor.vue';
import EdmContentViewer from '../components/EdmContentViewer.vue';
import { resolveMockEdmUrl, uploadToMockEdm } from '../services/mockEdmApi';

/** 编辑器内容（HTML） */
const content = ref('<p>欢迎编辑 EDM 内容。</p>');
/** 编辑器中已使用的 EDM 附件列表 */
const attachments = ref<EdmAttachment[]>([]);

/** 对接 mock 上传接口 */
async function uploadEdm(file: File, kind: EdmUploadKind) {
  return uploadToMockEdm(file, kind);
}

/** 对接 mock URL 解析接口 */
async function resolveEdmUrl(attachmentId: string, edmId: string): Promise<string> {
  return resolveMockEdmUrl(attachmentId || edmId);
}
</script>

<template>
  <main class="app-shell">
    <header class="app-header">
      <p class="app-header__eyebrow">Vue 3 · TypeScript · Quill 2.0.3</p>
      <h1>EDM 富文本编辑器</h1>
    </header>

    <div class="app-panes">
      <section class="app-pane" aria-label="编辑器">
        <h2 class="app-pane__title">编辑</h2>
        <RichTextEditor
          v-model="content"
          v-model:attachment-list="attachments"
          :upload="uploadEdm"
          :resolve-preview-url="resolveEdmUrl"
          :resolve-download-url="resolveEdmUrl"
        />
      </section>

      <section class="app-pane" aria-label="预览">
        <h2 class="app-pane__title">预览</h2>
        <EdmContentViewer
          class="app-preview"
          :content="content"
          :resolve-preview-url="resolveEdmUrl"
          :resolve-download-url="resolveEdmUrl"
        />
      </section>
    </div>

    <details class="app-html-dump">
      <summary>HTML 输出</summary>
      <pre>{{ content }}</pre>
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
  margin: 0 0 12px;
  font-size: 14px;
  font-weight: 600;
  color: #4a5b6e;
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

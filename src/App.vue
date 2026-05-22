<template>
  <main class="app-shell">
    <section class="editor-workspace" aria-labelledby="page-title">
      <header class="workspace-header">
        <div>
          <p class="eyebrow">Vue 3 · TypeScript · Quill 2.0.3</p>
          <h1 id="page-title">EDM 富文本编辑器</h1>
        </div>
        <div class="status-pill">data-edm-id</div>
      </header>

      <RichTextEditor
        v-model="content"
        :upload="uploadEdm"
        :resolve-preview-url="resolveEdmUrl"
        :resolve-download-url="resolveEdmUrl"
        @upload-success="refreshUploadedAssets"
      />
    </section>

    <aside class="inspector" aria-label="编辑器输出">
      <section class="inspector-section">
        <h2>最近上传</h2>
        <ul v-if="uploadedAssets.length" class="upload-list">
          <li v-for="asset in uploadedAssets" :key="asset.edmId">
            <span>{{ asset.file.name }}</span>
            <code>{{ asset.edmId }}</code>
          </li>
        </ul>
        <p v-else class="empty-state">暂无上传记录</p>
      </section>

      <section class="inspector-section">
        <h2>HTML</h2>
        <pre>{{ content }}</pre>
      </section>
    </aside>
  </main>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import RichTextEditor from './components/RichTextEditor.vue';
import {
  listMockEdmAssets,
  resolveMockEdmUrl,
  uploadToMockEdm,
} from './services/mockEdmApi';
import type { EdmUploadKind } from './types/edm';

const content = ref('<p>欢迎编辑 EDM 内容。</p>');
const uploadedAssets = ref(listMockEdmAssets());

async function uploadEdm(file: File, kind: EdmUploadKind) {
  return uploadToMockEdm(file, kind);
}

function resolveEdmUrl(edmId: string) {
  return resolveMockEdmUrl(edmId);
}

function refreshUploadedAssets() {
  uploadedAssets.value = listMockEdmAssets();
}
</script>

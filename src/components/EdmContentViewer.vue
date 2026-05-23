<template>
  <div ref="containerRef" class="edm-content" v-html="content" @click="handleFileDownload"></div>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import type { EdmUrlResolver } from '../types/edm';

defineProps<{
  content: string;
  resolvePreviewUrl?: EdmUrlResolver;
  resolveDownloadUrl?: EdmUrlResolver;
}>();

const containerRef = ref<HTMLDivElement | null>(null);

/** 拦截文件点击，fetch 二进制内容后触发浏览器下载 */
async function handleFileDownload(event: MouseEvent): Promise<void> {
  const target = event.target as HTMLElement;
  const fileEl = target.closest<HTMLElement>('[data-edm-type="file"]');
  if (!fileEl) return;

  const link = fileEl.querySelector('a');
  if (!link) return;

  event.preventDefault();
  event.stopPropagation();
  const url = link.getAttribute('href');
  const fileName = fileEl.getAttribute('data-file-name') || 'download';
  if (!url) return;

  try {
    const res = await fetch(url);
    const blob = await res.blob();
    const blobUrl = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = blobUrl;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(blobUrl);
  } catch {
    window.open(url, '_blank');
  }
}
</script>

<style scoped>
.edm-content {
  line-height: 1.7;
  color: #1f2a37;
  word-break: break-word;
}

:deep(.ql-edm-image) {
  display: block;
  max-width: 100%;
  height: auto;
  margin: 14px 0;
  border-radius: 8px;
}

:deep(.ql-edm-image img) {
  display: block;
  max-width: 100%;
  height: auto;
  border-radius: 8px;
}

:deep(.ql-edm-video) {
  display: block;
  width: min(100%, 760px);
  max-width: 100%;
  margin: 14px 0;
  border-radius: 8px;
  background: #000;
}

:deep(.ql-edm-video video) {
  display: block;
  width: 100%;
  border-radius: 8px;
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
</style>

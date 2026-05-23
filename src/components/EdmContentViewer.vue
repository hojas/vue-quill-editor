<template>
  <div ref="containerRef" class="edm-content" v-html="content"></div>
</template>

<script setup lang="ts">
import { onMounted, ref, watch } from 'vue';
import type { EdmUploadKind, EdmUploadResult, EdmUrlResolver } from '../types/edm';

const props = withDefaults(
  defineProps<{
    /** 富文本编辑器生成的 HTML 内容 */
    content: string;
    /**
     * 预览 URL 解析函数（图片/视频）。
     * 用于根据 `data-edm-id` 动态解析预览地址。
     */
    resolvePreviewUrl?: EdmUrlResolver;
    /**
     * 下载 URL 解析函数。
     * 用于根据 `data-edm-id` 动态解析下载地址。
     * 文件类型直接使用下载地址。
     */
    resolveDownloadUrl?: EdmUrlResolver;
  }>(),
  { content: '' },
);

const containerRef = ref<HTMLDivElement | null>(null);

onMounted(() => refreshEmbeds());
watch(() => props.content, () => refreshEmbeds());

/** 渲染 HTML 后扫描 EDM 嵌入元素并刷新其 URL */
async function refreshEmbeds(): Promise<void> {
  await new Promise((resolve) => requestAnimationFrame(resolve));
  if (!containerRef.value) return;

  const containers = containerRef.value.querySelectorAll<HTMLElement>('[data-edm-type]');

  await Promise.allSettled(
    Array.from(containers).map(async (el) => {
      const edmId = el.getAttribute('data-edm-id');
      const kind = el.getAttribute('data-edm-type') as EdmUploadKind;
      if (!edmId || !kind) return;

      const attachmentIdRaw = el.getAttribute('data-attachment-id');
      const dummyResult: EdmUploadResult = {
        edmId,
        attachmentId: attachmentIdRaw ? Number(attachmentIdRaw) : undefined,
      };

      if (kind === 'file') {
        const url = await resolveUrl(props.resolveDownloadUrl, edmId, kind, dummyResult);
        const link = el.querySelector('a');
        if (link) link.setAttribute('href', url);
      } else {
        const downloadUrl = await resolveUrl(props.resolveDownloadUrl, edmId, kind, dummyResult);
        const previewUrl = await resolveUrl(props.resolvePreviewUrl, edmId, kind, dummyResult);
        const url = previewUrl || downloadUrl;
        const media = el.querySelector('img, video');
        if (media) media.setAttribute('src', url);
      }
    }),
  );
}

async function resolveUrl(
  resolver: EdmUrlResolver | undefined,
  edmId: string,
  kind: EdmUploadKind,
  result: EdmUploadResult,
): Promise<string> {
  if (resolver) {
    const id = result.attachmentId != null ? String(result.attachmentId) : edmId;
    return resolver(id, kind, result);
  }
  const id = result.attachmentId ?? edmId;
  return `/api/edm/${encodeURIComponent(String(id))}/download`;
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

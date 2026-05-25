<template>
  <div ref="containerRef" class="edm-content" v-html="content" @click="handleFileDownload"></div>
</template>

<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import type { EdmUploadKind, EdmUploadResult, EdmUrlResolver } from '../types/edm';

const props = defineProps<{
  content: string;
  resolvePreviewUrl?: EdmUrlResolver;
  resolveDownloadUrl?: EdmUrlResolver;
}>();

const containerRef = ref<HTMLDivElement | null>(null);

let viewObserver: IntersectionObserver | null = null;

function getViewObserver(): IntersectionObserver {
  if (!viewObserver) {
    viewObserver = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          const el = entry.target as HTMLElement;
          viewObserver!.unobserve(el);

          const media = el.querySelector<HTMLImageElement | HTMLVideoElement>('img, video');
          if (!media) continue;

          const src = media.dataset.src;
          if (!src) continue;

          media.src = src;
          if (media instanceof HTMLVideoElement) {
            media.onloadedmetadata = () => {
              el.classList.remove('ql-edm-loading');
              el.classList.add('ql-edm-loaded');
            };
          } else {
            media.onload = () => {
              el.classList.remove('ql-edm-loading');
              el.classList.add('ql-edm-loaded');
            };
          }
          media.onerror = () => {
            el.classList.remove('ql-edm-loading');
            el.classList.add('ql-edm-error');
          };
        }
      },
      { rootMargin: '200px' },
    );
  }
  return viewObserver;
}

onMounted(() => {
  refreshEmbeds();
});
watch(() => props.content, () => nextTick(refreshEmbeds));

onBeforeUnmount(() => {
  viewObserver?.disconnect();
  viewObserver = null;
});

/** 只刷新 src/href 为空或默认 /api/edm/... 格式的嵌入元素 */
async function refreshEmbeds(): Promise<void> {
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
        const link = el.querySelector('a');
        if (link && link.getAttribute('href') && !isUnresolvedUrl(link.getAttribute('href')!)) return;
        const url = await resolveUrl(props.resolveDownloadUrl, edmId, kind, dummyResult, 'download');
        if (link) link.setAttribute('href', url);
      } else {
        const media = el.querySelector<HTMLImageElement | HTMLVideoElement>('img, video');
        if (!media) return;

        // 已有已解析 URL，直接懒加载
        if (media.dataset.src && !isUnresolvedUrl(media.dataset.src)) {
          el.classList.add('ql-edm-loading');
          getViewObserver().observe(el);
          return;
        }

        const previewUrl = await resolveUrl(props.resolvePreviewUrl, edmId, kind, dummyResult, 'preview');
        const url = previewUrl || (await resolveUrl(props.resolveDownloadUrl, edmId, kind, dummyResult, 'download'));
        media.dataset.src = url;
        el.classList.add('ql-edm-loading');
        getViewObserver().observe(el);
      }
    }),
  );
}

function isUnresolvedUrl(url: string): boolean {
  return url.startsWith('/api/edm/');
}

async function resolveUrl(
  resolver: EdmUrlResolver | undefined,
  edmId: string,
  kind: EdmUploadKind,
  result: EdmUploadResult,
  action: 'preview' | 'download',
): Promise<string> {
  if (resolver) {
    const attachmentId = result.attachmentId != null ? String(result.attachmentId) : '';
    return resolver(attachmentId, edmId, kind, result);
  }
  const id = result.attachmentId ?? edmId;
  return `/api/edm/${encodeURIComponent(String(id))}/${action}`;
}

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

/* ---- Lazy loading states ---- */
:deep(.ql-edm-loading) {
  position: relative;
  overflow: hidden;
}

:deep(.ql-edm-image.ql-edm-loading) {
  min-height: 200px;
  background: #f0f4f8;
}

:deep(.ql-edm-video.ql-edm-loading) {
  min-height: 220px;
  background: #1a1f2e;
}

:deep(.ql-edm-loading::after) {
  content: '';
  position: absolute;
  inset: 0;
  background: linear-gradient(
    90deg,
    transparent 0%,
    rgba(255, 255, 255, 0.3) 50%,
    transparent 100%
  );
  animation: edm-view-shimmer 1.5s ease-in-out infinite;
}

:deep(.ql-edm-video.ql-edm-loading::after) {
  background: linear-gradient(
    90deg,
    transparent 0%,
    rgba(255, 255, 255, 0.08) 50%,
    transparent 100%
  );
}

:deep(.ql-edm-loaded img),
:deep(.ql-edm-loaded video) {
  opacity: 1;
}

:deep(.ql-edm-loading img),
:deep(.ql-edm-loading video) {
  opacity: 0;
}

:deep(.ql-edm-error) {
  border-color: #fca5a5;
  background: #fef2f2;
}

:deep(.ql-edm-error::before) {
  content: '⚠';
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  font-size: 24px;
  color: #dc2626;
}

@keyframes edm-view-shimmer {
  0% { transform: translateX(-100%); }
  100% { transform: translateX(100%); }
}
</style>

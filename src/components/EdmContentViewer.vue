<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, useTemplateRef, watch } from 'vue';
import { isUnresolvedUrl, resolveEdmUrl } from '../utils/helpers';
import type { EdmUploadKind, EdmUploadResult, EdmUrlResolver } from '../types/edm';

const props = defineProps<{
  content: string;
  resolvePreviewUrl?: EdmUrlResolver;
  resolveDownloadUrl?: EdmUrlResolver;
}>();

const containerRef = useTemplateRef<HTMLDivElement>('containerRef');

let viewObserver: IntersectionObserver | null = null;

// ---- Lazy loading observer ----
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

// ---- Lifecycle ----
onMounted(() => refreshEmbeds());
watch(() => props.content, () => nextTick(refreshEmbeds));

onBeforeUnmount(() => {
  viewObserver?.disconnect();
  viewObserver = null;
});

// ---- Embed refresh ----
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
        const url = await resolveEdmUrl(props.resolveDownloadUrl, edmId, kind, dummyResult, 'download');
        if (link) link.setAttribute('href', url);
      } else {
        const media = el.querySelector<HTMLImageElement | HTMLVideoElement>('img, video');
        if (!media) return;

        // Already resolved URL — observe for lazy load
        if (media.dataset.src && !isUnresolvedUrl(media.dataset.src)) {
          el.classList.add('ql-edm-loading');
          getViewObserver().observe(el);
          return;
        }

        const previewUrl = await resolveEdmUrl(props.resolvePreviewUrl, edmId, kind, dummyResult, 'preview');
        const url = previewUrl || (await resolveEdmUrl(props.resolveDownloadUrl, edmId, kind, dummyResult, 'download'));
        media.dataset.src = url;
        el.classList.add('ql-edm-loading');
        getViewObserver().observe(el);
      }
    }),
  );
}

// ---- File download ----
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

<template>
  <div ref="containerRef" class="edm-content" v-html="content" @click="handleFileDownload"></div>
</template>

<style scoped>
.edm-content {
  line-height: 1.7;
  color: #1f2a37;
  word-break: break-word;
}
</style>

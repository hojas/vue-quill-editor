<script setup lang="ts">
import type { EdmUploadKind, EdmUrlResolver } from '../shared/types'

import { nextTick, onBeforeUnmount, onMounted, useTemplateRef, watch } from 'vue'
import { toUrl } from '../shared/utils'
import '../shared/edm-embeds.css'

defineOptions({ name: 'TinyMceContentViewer' })

const props = defineProps<{
  content: string
  resolvePreviewUrl?: EdmUrlResolver
  resolveDownloadUrl?: EdmUrlResolver
}>()

const containerRef = useTemplateRef<HTMLDivElement>('containerRef')

/** 懒加载观察器（单例） */
let viewObserver: IntersectionObserver | null = null

function getViewObserver(): IntersectionObserver {
  if (!viewObserver) {
    viewObserver = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting)
            continue
          const el = entry.target as HTMLElement
          viewObserver!.unobserve(el)

          const media = el.querySelector<HTMLImageElement | HTMLVideoElement>('img, video')
          if (!media)
            continue

          const src = media.dataset.src
          if (!src)
            continue

          media.src = src
          if (media instanceof HTMLVideoElement) {
            media.onloadedmetadata = () => {
              el.classList.remove('ql-edm-loading')
              el.classList.add('ql-edm-loaded')
            }
          }
          else {
            media.onload = () => {
              el.classList.remove('ql-edm-loading')
              el.classList.add('ql-edm-loaded')
            }
          }
          media.onerror = () => {
            el.classList.remove('ql-edm-loading')
            el.classList.add('ql-edm-error')
          }
        }
      },
      { rootMargin: '200px' },
    )
  }
  return viewObserver
}

// ---- lifecycle ----
onMounted(() => refreshEmbeds())

watch(() => props.content, () => {
  void nextTick(refreshEmbeds)
})

onBeforeUnmount(() => {
  viewObserver?.disconnect()
  viewObserver = null
})

// ---- embed refresh ----
async function refreshEmbeds(): Promise<void> {
  if (!containerRef.value)
    return

  const containers = containerRef.value.querySelectorAll<HTMLElement>('[data-edm-type]')

  await Promise.allSettled(
    Array.from(containers).map(async (el) => {
      const edmId = el.getAttribute('data-edm-id')
      const kind = el.getAttribute('data-edm-type') as EdmUploadKind
      if (!edmId || !kind)
        return

      const attachmentIdRaw = el.getAttribute('data-attachment-id') || ''

      if (kind === 'file') {
        const link = el.querySelector('a')
        if (link)
          link.setAttribute('href', '#')
      }
      else {
        const media = el.querySelector<HTMLImageElement | HTMLVideoElement>('img, video')
        if (!media)
          return

        if (media.dataset.src && !media.dataset.src.startsWith('blob:')) {
          el.classList.add('ql-edm-loading')
          getViewObserver().observe(el)
          return
        }

        const url = toUrl(await props.resolvePreviewUrl?.(
          attachmentIdRaw || '',
          edmId,
          kind,
        ), kind)
        if (!url)
          return
        media.dataset.src = url
        el.classList.add('ql-edm-loading')
        getViewObserver().observe(el)
      }
    }),
  )
}

// ---- file download ----
function handleFileDownload(event: MouseEvent): void {
  const target = event.target as HTMLElement
  const fileEl = target.closest<HTMLElement>('[data-edm-type="file"]')
  if (!fileEl)
    return

  event.preventDefault()
  event.stopPropagation()

  const edmId = fileEl.getAttribute('data-edm-id')
  const attachmentId = fileEl.getAttribute('data-attachment-id') || ''
  if (edmId)
    void props.resolveDownloadUrl?.(attachmentId, edmId, 'file')
}
</script>

<template>
  <div ref="containerRef" class="tinymce-viewer" @click="handleFileDownload">
    <div class="tinymce-viewer__body" v-html="content" />
  </div>
</template>

<style scoped>
.tinymce-viewer {
  line-height: 1.7;
  color: #1f2a37;
  word-break: break-word;
  white-space: pre-wrap;
}

.tinymce-viewer__body {
  font-size: 15px;
}

/* ---- Rich text element reset — 隔离外部样式对 v-html 内容的影响 ---- */
.tinymce-viewer__body :deep(p) {
  margin: 0 0 8px;
}

.tinymce-viewer__body :deep(h1) {
  font-size: 2em;
  margin: 0.67em 0;
  font-weight: bold;
}

.tinymce-viewer__body :deep(h2) {
  font-size: 1.5em;
  margin: 0.75em 0;
  font-weight: bold;
}

.tinymce-viewer__body :deep(h3) {
  font-size: 1.17em;
  margin: 0.83em 0;
  font-weight: bold;
}

.tinymce-viewer__body :deep(ul) {
  padding-left: 24px;
  list-style: disc;
}

.tinymce-viewer__body :deep(ol) {
  padding-left: 24px;
  list-style: decimal;
}

.tinymce-viewer__body :deep(li) {
  margin: 4px 0;
}

.tinymce-viewer__body :deep(blockquote) {
  margin: 0;
  padding-left: 16px;
  border-left: 4px solid #ccc;
}

.tinymce-viewer__body :deep(pre) {
  padding: 12px;
  border-radius: 6px;
  background: #1e293b;
  color: #e2e8f0;
  overflow-x: auto;
  white-space: pre-wrap;
}

.tinymce-viewer__body :deep(code) {
  padding: 2px 6px;
  border-radius: 4px;
  background: #f1f5f9;
  color: #d63384;
  font-size: 0.9em;
}

.tinymce-viewer__body :deep(pre code) {
  padding: 0;
  background: none;
  color: inherit;
}

.tinymce-viewer__body :deep(a) {
  color: #1a56db;
  text-decoration: underline;
}

.tinymce-viewer__body :deep(img) {
  max-width: 100%;
  height: auto;
}

.tinymce-viewer__body :deep(table) {
  border-collapse: collapse;
  width: 100%;
}

.tinymce-viewer__body :deep(th) {
  border: 1px solid #d7dee8;
  padding: 8px 12px;
  background: #f8fafc;
  font-weight: 600;
}

.tinymce-viewer__body :deep(td) {
  border: 1px solid #d7dee8;
  padding: 8px 12px;
}

/* ---- EDM lazy-loading / loaded / error states ---- */
.tinymce-viewer__body :deep(.ql-edm-loading) {
  position: relative;
  overflow: hidden;
}

.tinymce-viewer__body :deep(.ql-edm-image.ql-edm-loading) {
  min-height: 200px;
  background: #f0f4f8;
}

.tinymce-viewer__body :deep(.ql-edm-video.ql-edm-loading) {
  min-height: 220px;
  background: #1a1f2e;
}

.tinymce-viewer__body :deep(.ql-edm-loading::after) {
  content: '';
  position: absolute;
  top: 50%;
  left: 50%;
  width: 24px;
  height: 24px;
  margin: -12px 0 0 -12px;
  border: 2px solid #d7dee8;
  border-top-color: #205493;
  border-radius: 50%;
  animation: tinymce-viewer-spin 0.7s linear infinite;
}

.tinymce-viewer__body :deep(.ql-edm-loading img),
.tinymce-viewer__body :deep(.ql-edm-loading video) {
  opacity: 0;
}

.tinymce-viewer__body :deep(.ql-edm-loaded img),
.tinymce-viewer__body :deep(.ql-edm-loaded video) {
  opacity: 1;
}

.tinymce-viewer__body :deep(.ql-edm-error) {
  border-color: #fca5a5;
  background: #fef2f2;
}

@keyframes tinymce-viewer-spin {
  to {
    transform: rotate(360deg);
  }
}
</style>

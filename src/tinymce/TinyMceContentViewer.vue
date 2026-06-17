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
</style>

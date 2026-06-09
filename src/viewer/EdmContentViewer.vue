<script setup lang="ts">
import type { EdmUploadKind, EdmUrlResolver } from '../shared/types'

import { nextTick, onBeforeUnmount, onMounted, useTemplateRef, watch } from 'vue'
import { toUrl } from '../shared/utils'
import 'quill/dist/quill.snow.css'

const props = defineProps<{
  content: string
  resolvePreviewUrl?: EdmUrlResolver
  resolveDownloadUrl?: EdmUrlResolver
}>()

const containerRef = useTemplateRef<HTMLDivElement>('containerRef')

/** 懒加载观察器（单例） */
let viewObserver: IntersectionObserver | null = null

// ---- 懒加载观察器 ----
/**
 * 获取/创建 IntersectionObserver 单例。
 *
 * 图片/视频进入视口（提前 200px）时将 data-src 写入 src 并切换状态类。
 */
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

// ---- 生命周期 ----
onMounted(() => refreshEmbeds())
/** 监听 content 变化，等 DOM 更新后刷新嵌入 */
watch(() => props.content, () => nextTick(refreshEmbeds))

onBeforeUnmount(() => {
  viewObserver?.disconnect()
  viewObserver = null
})

// ---- 嵌入刷新 ----
/**
 * 遍历容器中所有 EDM 嵌入元素。
 *
 * 文件类型不预解析 URL（下载由 resolveDownloadUrl 在点击时处理）；
 * 图片/视频通过 resolvePreviewUrl 获取 URL 写入 data-src，等待进入视口懒加载。
 */
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
        // 文件不预解析 URL —— 下载由 resolveDownloadUrl 在点击时处理
        const link = el.querySelector('a')
        if (link)
          link.setAttribute('href', '#')
      }
      else {
        const media = el.querySelector<HTMLImageElement | HTMLVideoElement>('img, video')
        if (!media)
          return

        // 已有 data-src 则跳过重复解析（blob: URL 是会话级的，需重新解析）
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

// ---- 文件下载 ----
/**
 * 文件嵌入的点击事件处理（事件委托）。
 *
 * 拦截 `[data-edm-type="file"]` 上的点击，调用外部注入的
 * resolveDownloadUrl 处理下载（如 showSaveFilePicker）。
 */
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
  <div ref="containerRef" class="edm-content ql-snow" @click="handleFileDownload">
    <div class="ql-editor" v-html="content" />
  </div>
</template>

<style scoped>
.edm-content {
  line-height: 1.7;
  color: #1f2a37;
  word-break: break-word;
  white-space: pre-wrap;
}
</style>

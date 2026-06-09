<script setup lang="ts">
import type { EdmUploadKind, EdmUrlResolver } from '../shared/types'

import { nextTick, onBeforeUnmount, onMounted, useTemplateRef, watch } from 'vue'
import { downloadFile } from '../shared/utils'
import 'quill/dist/quill.snow.css'

const props = defineProps<{
  content: string
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
 * 遍历容器中所有 EDM 嵌入元素，解析 URL 并注册到懒加载观察器。
 *
 * 文件类型直接解析下载 URL；图片/视频写入 data-src 后等待进入视口。
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
        const link = el.querySelector('a')
        if (!link)
          return
        // 已有有效 href 则跳过（blob: URL 是会话级的，需重新解析）
        const currentHref = link.getAttribute('href')
        if (currentHref && currentHref !== '#' && !currentHref.startsWith('blob:'))
          return
        const url = (await props.resolveDownloadUrl?.(
          attachmentIdRaw || '',
          edmId,
          kind,
        )) || ''
        if (url)
          link.setAttribute('href', url)
      }
      else {
        const media = el.querySelector<HTMLImageElement | HTMLVideoElement>('img, video')
        if (!media)
          return

        // 已有 data-src 则跳过重复解析
        if (media.dataset.src) {
          el.classList.add('ql-edm-loading')
          getViewObserver().observe(el)
          return
        }

        const url = (await props.resolveDownloadUrl?.(
          attachmentIdRaw || '',
          edmId,
          kind,
        )) || ''
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
 * 拦截 `[data-edm-type="file"]` 上的点击，以 blob 方式触发下载，
 * 失败时降级为新窗口打开。
 */
async function handleFileDownload(event: MouseEvent): Promise<void> {
  const target = event.target as HTMLElement
  const fileEl = target.closest<HTMLElement>('[data-edm-type="file"]')
  if (!fileEl)
    return

  const link = fileEl.querySelector('a')
  if (!link)
    return

  event.preventDefault()
  event.stopPropagation()

  const url = link.getAttribute('href')
  const fileName = fileEl.getAttribute('data-file-name') || 'download'
  if (url)
    await downloadFile(url, fileName)
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

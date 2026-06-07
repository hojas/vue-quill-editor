# Vue Quill EDM Editor

Vue 3 + TypeScript + Quill 2.0 富文本编辑器，内置图片、视频、文件上传扩展。提供独立的编辑器组件和预览组件，可分别复制到其他项目使用。

## 项目结构

```
src/
├── editor/        ← 编辑器包（RichTextEditor）
├── viewer/        ← 预览包（EdmContentViewer）
├── shared/        ← 公共代码（类型、工具、样式）
├── pages/         ← demo 页面
└── main.ts        ← demo 入口

server/            ← Fastify 后端（文件存储服务）
```

## 特性

- **图片上传** — 上传后内联展示，支持拖拽缩放
- **视频上传** — 上传后 `<video controls>` 播放
- **文件上传** — 上传后以"附件"链接展示，点击触发 blob 下载
- **EDM 元数据** — 嵌入元素携带 `data-edm-id`、`data-edm-type` 等属性
- **懒加载** — 图片/视频仅进入视口时才加载真实 URL
- **拖拽/粘贴** — 支持拖拽文件到编辑器或粘贴剪贴板中的文件
- **配置式工具栏** — 通过 Quill 原生配置数组定义
- **不侵入 Quill** — 自定义 blot 使用独立名称，不影响默认格式

## 安装

```bash
npm install vue-quill-editor-edm
```

本库将 `vue` 和 `quill` 声明为 peer dependencies：

```bash
npm install vue quill
```

## 快速开始

### 启动后端

```bash
cd server && pnpm install && pnpm dev
# → http://127.0.0.1:3001
```

API 端点：

- `POST /api/edm/upload` — 上传文件（multipart/form-data，字段 `file`）
- `GET /api/edm/:id/download` — 下载/展示文件

### 使用编辑器

```vue
<script setup lang="ts">
import type { EdmUploadKind, EdmUploadResult } from 'vue-quill-editor-edm'
import { RichTextEditor } from 'vue-quill-editor-edm'
import 'vue-quill-editor-edm/dist/vue-quill-editor-edm.css'
import 'quill/dist/quill.snow.css'

const content = ref('')

async function handleUpload(file: File, kind: EdmUploadKind): Promise<EdmUploadResult> {
  const form = new FormData()
  form.append('file', file)

  const res = await fetch('/api/edm/upload', { method: 'POST', body: form })
  if (!res.ok)
    throw new Error('上传失败')
  return res.json()
}

function resolveDownloadUrl(_attachmentId: string, edmId: string): string {
  return `/api/edm/${encodeURIComponent(edmId)}/download`
}
</script>

<template>
  <RichTextEditor
    v-model="content"
    :upload="handleUpload"
    :resolve-download-url="resolveDownloadUrl"
  />
</template>
```

### 使用预览组件

```vue
<script setup lang="ts">
import { EdmContentViewer } from 'vue-quill-editor-edm'

function resolveDownloadUrl(_attachmentId: string, edmId: string): string {
  return `/api/edm/${encodeURIComponent(edmId)}/download`
}
</script>

<template>
  <EdmContentViewer
    :content="html"
    :resolve-download-url="resolveDownloadUrl"
  />
</template>
```

## API

### RichTextEditor Props

| 属性 | 类型 | 必填 | 默认值 | 说明 |
|------|------|------|--------|------|
| `modelValue` | `string` | 否 | `''` | 编辑器 HTML 内容（v-model） |
| `upload` | `EdmUploadHandler` | **是** | — | 上传处理函数 |
| `resolveDownloadUrl` | `EdmUrlResolver` | 否 | — | 下载/展示 URL 解析函数 |
| `readOnly` | `boolean` | 否 | `false` | 只读模式 |
| `placeholder` | `string` | 否 | `'请输入内容'` | 编辑器 placeholder |
| `imageAccept` | `string` | 否 | `'image/*'` | 图片上传 accept |
| `videoAccept` | `string` | 否 | `'video/*'` | 视频上传 accept |
| `fileAccept` | `string` | 否 | `''` | 文件上传 accept |

### RichTextEditor Events

| 事件 | Payload | 说明 |
|------|---------|------|
| `update:modelValue` | `string` | v-model 双向绑定 |
| `update:attachmentList` | `EdmAttachment[]` | 附件列表变更 |
| `change` | `string` | 内容变更 |
| `upload-start` | `{ file, kind }` | 文件开始上传 |
| `upload-success` | `{ file, kind, result }` | 上传成功 |
| `upload-error` | `{ file, kind, error }` | 上传失败 |

### EdmContentViewer Props

| 属性 | 类型 | 必填 | 默认值 | 说明 |
|------|------|------|--------|------|
| `content` | `string` | 否 | — | 编辑器生成的 HTML |
| `resolveDownloadUrl` | `EdmUrlResolver` | 否 | — | 下载/展示 URL 解析函数 |

### 类型

```ts
type EdmUploadKind = 'image' | 'video' | 'file'

interface EdmUploadResult {
  edmId: string
  attachmentId?: number
  downloadUrl?: string
  url?: string
  fileName?: string
  mimeType?: string
  size?: number
}

type EdmUploadHandler = (
  file: File,
  kind: EdmUploadKind,
) => Promise<EdmUploadResult>

type EdmUrlResolver = (
  attachmentId: string,
  edmId: string,
  kind: EdmUploadKind,
  result?: EdmUploadResult,
) => string | Promise<string>

interface EdmAttachment {
  edmId: string
  attachmentId?: number
  kind: EdmUploadKind
}
```

### 序列化 HTML 中的 data 属性

```html
<edm-image data-edm-id="550e84..." data-edm-type="image">
  <img data-src="/api/edm/550e84.../download" ...>
</edm-image>
```

| 属性 | 类型 | 说明 |
|------|------|------|
| `data-edm-id` | `string` | EDM 资源 ID |
| `data-attachment-id` | `number` | 数字附件 ID |
| `data-edm-type` | `'image' \| 'video' \| 'file'` | 资源类型 |
| `data-file-name` | `string` | 文件名 |
| `data-mime-type` | `string` | MIME 类型 |
| `data-file-size` | `number` | 文件大小（字节） |

## 手动注册 Blot

```ts
import { registerEdmBlots } from 'vue-quill-editor-edm'

registerEdmBlots()
```

## 复制到其他项目

编辑器、预览组件和共享代码已分离，可按需复制：

- **只要编辑器**：复制 `src/editor/` + `src/shared/`
- **只要预览**：复制 `src/viewer/` + `src/shared/`
- **两者都要**：全部三个目录

## 本地开发

```bash
# 前端
pnpm install && pnpm dev          # → http://127.0.0.1:5173

# 后端
cd server && pnpm install && pnpm dev  # → http://127.0.0.1:3001
```

前端通过 vite proxy 将 `/api` 转发到后端。

## License

MIT

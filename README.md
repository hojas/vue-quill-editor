# Vue Quill EDM Editor

Vue 3 + TypeScript + Quill 2.0.3 富文本编辑器，内置图片、视频、文件上传扩展。

## 特性

- **图片上传** — 上传后插入自定义 `edmImage` blot，内联预览
- **视频上传** — 上传后插入自定义 `edmVideo` blot，`<video controls>` 播放
- **文件上传** — 上传后插入自定义 `edmFile` blot，以下载链接展示
- **EDM ID 存储** — 所有嵌入元素携带 `data-edm-id`、`data-attachment-id`、`data-edm-type` 等元数据属性，序列化到 HTML 中
- **加载自动刷新 URL** — 加载已保存的 HTML 内容后，根据 `data-edm-id` 自动重新解析预览/下载地址
- **拖拽/粘贴上传** — 支持拖拽文件到编辑器或粘贴剪贴板中的文件
- **配置式工具栏** — 工具栏通过 Quill 原生配置数组定义，无需手写模板
- **Quill 内置图标** — 自定义按钮复用 Quill 原生 image/video/link 图标
- **HTML 查看器** — 提供 `EdmContentViewer` 组件，渲染编辑器输出的 HTML，自动解析图片/视频预览地址和文件下载链接
- **不侵入 Quill** — 自定义 blot 使用独立名称，不影响 Quill 默认的 `image`、`video`、`link` 格式

## 安装

```bash
npm install vue-quill-editor-edm
```

本库将 `vue` 和 `quill` 声明为 peer dependencies，使用前确保项目中已安装：

```bash
npm install vue quill
```

## 快速开始

```vue
<template>
  <RichTextEditor
    v-model="content"
    :upload="handleUpload"
    :resolve-preview-url="resolvePreviewUrl"
    :resolve-download-url="resolveDownloadUrl"
    @upload-success="onUploadSuccess"
    @upload-error="onUploadError"
  />
</template>

<script setup lang="ts">
import { RichTextEditor } from 'vue-quill-editor-edm';
import 'vue-quill-editor-edm/dist/vue-quill-editor-edm.css';
import 'quill/dist/quill.snow.css';
import type { EdmUploadKind, EdmUploadResult } from 'vue-quill-editor-edm';

const content = ref('');

async function handleUpload(file: File, kind: EdmUploadKind): Promise<EdmUploadResult> {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('kind', kind);

  const res = await fetch('/api/edm/upload', { method: 'POST', body: formData });
  const data = await res.json();

  // 后端需至少返回 edmId
  return {
    edmId: data.edmId,
    attachmentId: data.attachmentId,  // 可选，数字类型
    fileName: file.name,
    mimeType: file.type,
    size: file.size,
  };
}

function resolvePreviewUrl(edmId: string): string {
  return `/api/edm/${encodeURIComponent(edmId)}/preview`;
}

function resolveDownloadUrl(edmId: string): string {
  return `/api/edm/${encodeURIComponent(edmId)}/download`;
}
</script>
```

## API

### Props

| 属性 | 类型 | 必填 | 默认值 | 说明 |
|------|------|------|--------|------|
| `modelValue` | `string` | 否 | `''` | 编辑器 HTML 内容（v-model） |
| `upload` | `EdmUploadHandler` | **是** | — | 上传处理函数 |
| `readOnly` | `boolean` | 否 | `false` | 只读模式 |
| `placeholder` | `string` | 否 | `'请输入内容'` | 编辑器 placeholder |
| `resolvePreviewUrl` | `EdmUrlResolver` | 否 | — | 预览 URL 解析函数 |
| `resolveDownloadUrl` | `EdmUrlResolver` | 否 | — | 下载 URL 解析函数 |
| `imageAccept` | `string` | 否 | `'image/*'` | 图片上传 accept |
| `videoAccept` | `string` | 否 | `'video/*'` | 视频上传 accept |
| `fileAccept` | `string` | 否 | `''` | 文件上传 accept |

### Events

| 事件 | Payload | 说明 |
|------|---------|------|
| `update:modelValue` | `string` | v-model 双向绑定 |
| `change` | `string` | 内容变更 |
| `upload-start` | `{ file: File; kind: EdmUploadKind }` | 文件开始上传 |
| `upload-success` | `{ file: File; kind: EdmUploadKind; result: EdmUploadResult }` | 文件上传成功 |
| `upload-error` | `{ file: File; kind: EdmUploadKind; error: unknown }` | 文件上传失败 |

## EdmContentViewer

用于渲染富文本编辑器生成的 HTML 内容。自动根据 `data-edm-id` 解析图片/视频的预览地址和文件的下载地址。

```vue
<EdmContentViewer
  :content="html"
  :resolve-preview-url="resolvePreviewUrl"
  :resolve-download-url="resolveDownloadUrl"
/>
```

### Props

| 属性 | 类型 | 必填 | 默认值 | 说明 |
|------|------|------|--------|------|
| `content` | `string` | 否 | `''` | 编辑器生成的 HTML 内容 |
| `resolvePreviewUrl` | `EdmUrlResolver` | 否 | — | 图片/视频预览地址解析 |
| `resolveDownloadUrl` | `EdmUrlResolver` | 否 | — | 下载地址解析（文件使用此地址） |

### 类型

```ts
type EdmUploadKind = 'image' | 'video' | 'file';

interface EdmUploadResult {
  edmId: string;            // 后端分配的 EDM 资源 ID（必填）
  attachmentId?: number;    // 后端分配的数字附件 ID
  previewUrl?: string;      // 预览地址
  downloadUrl?: string;     // 下载地址
  url?: string;             // 通用 URL（兜底）
  fileName?: string;
  mimeType?: string;
  size?: number;
}

type EdmUploadHandler = (file: File, kind: EdmUploadKind) => Promise<EdmUploadResult>;

type EdmUrlResolver = (
  edmId: string,
  kind: EdmUploadKind,
  result?: EdmUploadResult,
) => string | Promise<string>;
```

### 序列化 HTML 中的 data 属性

上传后插入的嵌入元素在 HTML 中携带以下属性：

```html
<edm-image data-edm-id="image_xxx" data-edm-type="image" data-attachment-id="1716...">
  <img src="/api/edm/image_xxx/download" data-edm-id="image_xxx" ...>
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

如果需要在非 Vue 环境中使用 blot，可单独导入注册函数：

```ts
import { registerEdmBlots } from 'vue-quill-editor-edm';

registerEdmBlots(); // 幂等，重复调用不会重复注册
```

## 本地开发

```bash
npm install
npm run dev
```

编辑器 demo 运行在 `http://127.0.0.1:5173`，使用内存 mock API 模拟上传。

## License

MIT

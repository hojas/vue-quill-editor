# Vue 3 + TypeScript + Quill 2.0.3 EDM Editor

这个示例实现了图片、视频和文件上传扩展：

- 图片：上传后插入自定义 `edmImage` blot，DOM 中保留 `data-edm-id="xxx"`，通过返回的预览地址或 `resolvePreviewUrl` 展示。
- 视频：上传后插入自定义 `edmVideo` blot，DOM 中保留 `data-edm-id="xxx"`，使用原生 `<video controls>` 预览。
- 文件：上传后插入自定义 `edmFile` blot，DOM 中保留 `data-edm-id="xxx"`，以 `<a>` 链接展示，不做内容预览。

自定义 blot 使用独立名称和类名，不覆盖 Quill 默认的 `image`、`video`、`link` 格式。

## 使用

```bash
npm install
npm run dev
```

核心组件在 `src/components/RichTextEditor.vue`，后端接入只需要替换上传函数：

```vue
<RichTextEditor
  v-model="html"
  :upload="uploadEdm"
  :resolve-preview-url="resolvePreviewUrl"
  :resolve-download-url="resolveDownloadUrl"
/>
```

```ts
import type { EdmUploadKind } from './types/edm';

async function uploadEdm(file: File, kind: EdmUploadKind) {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('kind', kind);

  const response = await fetch('/api/edm/upload', {
    method: 'POST',
    body: formData,
  });
  const data = await response.json();

  return {
    edmId: data.edmId,
    fileName: file.name,
    mimeType: file.type,
    size: file.size,
  };
}

function resolvePreviewUrl(edmId: string) {
  return `/api/edm/${encodeURIComponent(edmId)}/preview`;
}

function resolveDownloadUrl(edmId: string) {
  return `/api/edm/${encodeURIComponent(edmId)}/download`;
}
```

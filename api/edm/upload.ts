import type { VercelRequest, VercelResponse } from '@vercel/node';
import { saveFile } from '../../lib/blob-storage';

/** 与前端 EdmUploadResult 一致的返回结构 */
interface EdmUploadResult {
  edmId: string;
  attachmentId: number;
  fileName: string;
  mimeType: string;
  size: number;
}

/**
 * POST /api/edm/upload — 接收 multipart/form-data（字段 `file`），存储到 Vercel Blob。
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const chunks: Buffer[] = [];
    for await (const chunk of req) {
      chunks.push(chunk);
    }
    const body = Buffer.concat(chunks);

    const contentType = req.headers['content-type'] || '';
    const boundary = contentType.split('boundary=')[1];
    if (!boundary) {
      return res.status(400).json({ error: '需要 multipart/form-data' });
    }

    const parts = parseMultipart(body, boundary);
    const filePart = parts.find((p) => p.name === 'file');
    if (!filePart) {
      return res.status(400).json({ error: '未找到上传文件' });
    }

    const mimeType = filePart.contentType || 'application/octet-stream';
    const record = await saveFile(filePart.data, filePart.filename || 'download', mimeType);

    const result: EdmUploadResult = {
      edmId: record.id,
      attachmentId: parseInt(record.id.split('-')[0], 10),
      fileName: record.originalName,
      mimeType: record.mimeType,
      size: record.size,
    };

    return res.status(200).json(result);
  } catch (err) {
    console.error('upload error:', err);
    return res.status(500).json({ error: err instanceof Error ? err.message : '上传失败' });
  }
}

/** 简易 multipart/form-data 解析器（适配 Vercel 环境，无外部依赖） */
function parseMultipart(
  body: Buffer,
  boundary: string,
): Array<{ name: string; filename?: string; contentType?: string; data: Buffer }> {
  const parts: Array<{ name: string; filename?: string; contentType?: string; data: Buffer }> = [];
  const sep = Buffer.from(`--${boundary}`);
  const end = Buffer.from(`--${boundary}--`);
  const nl = Buffer.from('\r\n\r\n');

  const firstSep = body.indexOf(sep);
  if (firstSep === -1) return parts;
  let pos = firstSep + sep.length + 2;
  while (pos < body.length) {
    const remaining = body.subarray(pos);
    if (remaining.indexOf(end) === 0) break;

    const headerEnd = remaining.indexOf(nl);
    if (headerEnd === -1) break;

    const headerText = remaining.subarray(0, headerEnd).toString();
    const dataStart = pos + headerEnd + nl.length;

    const nextSep = body.indexOf(sep, dataStart);
    if (nextSep === -1) break;

    const data = body.subarray(dataStart, nextSep - 2);
    pos = nextSep + sep.length + 2;

    const nameMatch = headerText.match(/name="([^"]+)"/);
    const filenameMatch = headerText.match(/filename="([^"]+)"/);
    const typeMatch = headerText.match(/Content-Type:\s*(.+)/i);

    if (nameMatch) {
      parts.push({
        name: nameMatch[1],
        filename: filenameMatch?.[1],
        contentType: typeMatch?.[1]?.trim(),
        data,
      });
    }
  }

  return parts;
}

export const config = {
  api: {
    bodyParser: false,
  },
};

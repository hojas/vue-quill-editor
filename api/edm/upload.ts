import { put } from '@vercel/blob';

export const config = { api: { bodyParser: false } };

export default async function handler(req: import('http').IncomingMessage, res: import('http').ServerResponse) {
  if (req.method !== 'POST') {
    res.statusCode = 405;
    res.setHeader('Content-Type', 'application/json');
    return res.end(JSON.stringify({ error: 'Method not allowed' }));
  }

  try {
    const chunks: Uint8Array[] = [];
    for await (const chunk of req) {
      chunks.push(chunk);
    }
    const body = Buffer.concat(chunks);

    const ct = req.headers['content-type'] || '';
    const boundary = ct.split('boundary=')[1];
    if (!boundary) {
      res.statusCode = 400;
      res.setHeader('Content-Type', 'application/json');
      return res.end(JSON.stringify({ error: '需要 multipart/form-data' }));
    }

    const filePart = extractFile(body, boundary);
    if (!filePart) {
      res.statusCode = 400;
      res.setHeader('Content-Type', 'application/json');
      return res.end(JSON.stringify({ error: '未找到上传文件' }));
    }

    // 保存到 Vercel Blob
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    const mimeType = filePart.contentType || 'application/octet-stream';
    const pathname = `${id}/${encodeURIComponent(filePart.filename || 'download')}`;
    const blob = await put(pathname, Buffer.from(filePart.data), {
      access: 'public',
      contentType: mimeType,
    });

    res.statusCode = 200;
    res.setHeader('Content-Type', 'application/json');
    return res.end(JSON.stringify({
      edmId: id,
      attachmentId: parseInt(id.split('-')[0], 10),
      fileName: filePart.filename || 'download',
      mimeType,
      size: filePart.data.length,
    }));
  } catch (err) {
    console.error('upload error:', err);
    res.statusCode = 500;
    res.setHeader('Content-Type', 'application/json');
    return res.end(JSON.stringify({ error: err instanceof Error ? err.message : '上传失败' }));
  }
}

function extractFile(body: Buffer, boundary: string): { filename?: string; contentType?: string; data: Uint8Array } | null {
  const B = Buffer.from(`--${boundary}`);
  const NL = Buffer.from('\r\n\r\n');
  const start = body.indexOf(B);
  if (start === -1) return null;
  const headerStart = start + B.length + 2;
  const headerEnd = body.indexOf(NL, headerStart);
  if (headerEnd === -1) return null;
  const headerText = body.subarray(headerStart, headerEnd).toString();
  const dataStart = headerEnd + NL.length;
  const nextBoundary = body.indexOf(B, dataStart);
  if (nextBoundary === -1) return null;
  return {
    filename: headerText.match(/filename="([^"]*)"/)?.[1],
    contentType: headerText.match(/Content-Type:\s*(\S+)/i)?.[1],
    data: body.subarray(dataStart, nextBoundary - 2),
  };
}

import { saveFile } from '../../lib/blob-storage';

export const config = {
  api: {
    bodyParser: false,
  },
};

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

    const record = await saveFile(
      Buffer.from(filePart.data),
      filePart.filename || 'download',
      filePart.contentType || 'application/octet-stream',
    );

    res.statusCode = 200;
    res.setHeader('Content-Type', 'application/json');
    return res.end(JSON.stringify({
      edmId: record.id,
      attachmentId: parseInt(record.id.split('-')[0], 10),
      fileName: record.originalName,
      mimeType: record.mimeType,
      size: record.size,
    }));
  } catch (err) {
    console.error('upload error:', err);
    res.statusCode = 500;
    res.setHeader('Content-Type', 'application/json');
    return res.end(JSON.stringify({
      error: err instanceof Error ? err.message : '上传失败',
    }));
  }
}

/**
 * 从 multipart body 中提取第一个文件。
 *
 * 不依赖第三方库，仅处理标准 multipart/form-data 格式。
 */
function extractFile(
  body: Buffer,
  boundary: string,
): { filename?: string; contentType?: string; data: Uint8Array } | null {
  const B = Buffer.from(`--${boundary}`);
  const NL = Buffer.from('\r\n\r\n');
  const NL2 = Buffer.from('\r\n');

  // 找到第一个 boundary
  const start = body.indexOf(B);
  if (start === -1) return null;

  // 找到 header 结束位置
  const headerStart = start + B.length + 2; // skip boundary + \r\n
  const headerEnd = body.indexOf(NL, headerStart);
  if (headerEnd === -1) return null;

  // 解析 header 获取 filename 和 content-type
  const headerText = body.subarray(headerStart, headerEnd).toString();
  const filenameMatch = headerText.match(/filename="([^"]*)"/);
  const typeMatch = headerText.match(/Content-Type:\s*(\S+)/i);

  // 数据起始位置
  const dataStart = headerEnd + NL.length;

  // 找到下一个 boundary（数据结束位置）
  const nextBoundary = body.indexOf(B, dataStart);
  if (nextBoundary === -1) return null;

  // 数据在前面 boundary 的 \r\n 之前结束
  const dataEnd = nextBoundary - 2;
  const data = body.subarray(dataStart, dataEnd);

  return {
    filename: filenameMatch?.[1],
    contentType: typeMatch?.[1],
    data,
  };
}

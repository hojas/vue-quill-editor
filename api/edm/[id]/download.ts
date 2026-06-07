import { head } from '@vercel/blob';

export default async function handler(req: import('http').IncomingMessage, res: import('http').ServerResponse) {
  if (req.method !== 'GET') {
    res.statusCode = 405;
    res.setHeader('Content-Type', 'application/json');
    return res.end(JSON.stringify({ error: 'Method not allowed' }));
  }

  try {
    const url = new URL(req.url || '', `http://${req.headers.host}`);
    const parts = url.pathname.split('/');
    const id = parts[parts.indexOf('download') - 1];

    if (!id) {
      res.statusCode = 400;
      res.setHeader('Content-Type', 'application/json');
      return res.end(JSON.stringify({ error: '缺少文件 ID' }));
    }

    const { blobs } = await head({ prefix: id });
    if (blobs.length === 0) {
      res.statusCode = 404;
      res.setHeader('Content-Type', 'application/json');
      return res.end(JSON.stringify({ error: '文件不存在' }));
    }

    res.statusCode = 307;
    res.setHeader('Location', blobs[0].url);
    return res.end();
  } catch (err) {
    console.error('download error:', err);
    res.statusCode = 500;
    res.setHeader('Content-Type', 'application/json');
    return res.end(JSON.stringify({ error: err instanceof Error ? err.message : '下载失败' }));
  }
}

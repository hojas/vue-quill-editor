import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getFile } from '../../../lib/blob-storage';

/**
 * GET /api/edm/:id/download — 从 Vercel Blob 获取文件，307 重定向到公开 URL。
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { id } = req.query;
  if (!id || typeof id !== 'string') {
    return res.status(400).json({ error: '缺少文件 ID' });
  }

  const record = await getFile(id);
  if (!record) {
    return res.status(404).json({ error: '文件不存在' });
  }

  return res.redirect(307, record.url);
}

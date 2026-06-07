import { type FastifyInstance, type FastifyRequest } from 'fastify';
import { saveFile, getFile, createFileStream } from '../lib/storage.js';

/** 与前端 EdmUploadResult 一致的返回结构 */
interface EdmUploadResult {
  edmId: string;
  attachmentId: number;
  fileName: string;
  mimeType: string;
  size: number;
}

/**
 * 注册 EDM 上传/下载路由。
 *
 * - POST /api/edm/upload         上传文件
 * - GET  /api/edm/:id/download   下载/展示（inline，浏览器根据 Content-Type 渲染）
 * - GET  /api/edm/config         上传配置
 */
export function edmRoutes(app: FastifyInstance): void {
  // ---- 配置 ----
  app.get('/api/edm/config', async (_req, reply) => {
    const maxCount = parseInt(process.env.EDM_MAX_UPLOAD_COUNT || '5', 10);
    return reply.send({ maxCount });
  });

  // ---- 上传 ----
  app.post('/api/edm/upload', async (req, reply) => {
    const file = await req.file();

    if (!file) {
      return reply.status(400).send({ error: '未找到上传文件' });
    }

    const buffer = await file.toBuffer();
    const kind = inferKind(file.mimetype);

    const record = await saveFile(
      buffer,
      file.filename,
      file.mimetype,
      kind,
    );

    const result: EdmUploadResult = {
      edmId: record.id,
      attachmentId: Date.now(),
      fileName: record.originalName,
      mimeType: record.mimeType,
      size: record.size,
    };

    return reply.send(result);
  });

  // ---- 下载/展示 ----
  // 图片和视频通过 <img>/<video> src 加载时，浏览器根据 Content-Type 渲染，
  // 忽略 Content-Disposition；文件下载由前端 downloadFile() 通过 fetch+blob 处理。
  app.get('/api/edm/:id/download', async (req: FastifyRequest<{ Params: { id: string } }>, reply) => {
    const record = await getFile(req.params.id);
    if (!record) {
      return reply.status(404).send({ error: '文件不存在' });
    }

    reply.header('Content-Type', record.mimeType);
    reply.header(
      'Content-Disposition',
      `inline; filename*=UTF-8''${encodeURIComponent(record.originalName)}`,
    );
    return reply.send(createFileStream(record.storedName));
  });
}

/** 根据 MIME 类型推断资源类型 */
function inferKind(mimeType: string): 'image' | 'video' | 'file' {
  if (mimeType.startsWith('image/')) return 'image';
  if (mimeType.startsWith('video/')) return 'video';
  return 'file';
}

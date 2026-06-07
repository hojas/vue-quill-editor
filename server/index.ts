import Fastify from 'fastify';
import cors from '@fastify/cors';
import multipart from '@fastify/multipart';
import { edmRoutes } from './routes/edm.js';

const PORT = parseInt(process.env.PORT || '3001', 10);
const HOST = process.env.HOST || '127.0.0.1';

async function main() {
  const app = Fastify({ logger: true });

  // CORS — 允许开发时的跨域请求
  await app.register(cors, { origin: true });

  // 文件上传支持（单个文件最大 100MB）
  await app.register(multipart, { limits: { fileSize: 100 * 1024 * 1024 } });

  // 注册 EDM 路由
  edmRoutes(app);

  // 健康检查
  app.get('/api/health', async () => ({ ok: true }));

  await app.listen({ port: PORT, host: HOST });
  console.log(`EDM server listening on http://${HOST}:${PORT}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

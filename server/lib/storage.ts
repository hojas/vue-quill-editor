import { createReadStream, existsSync, mkdirSync } from 'node:fs';
import { readFile, unlink, writeFile } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { v4 as uuid } from 'uuid';

/** 文件元数据 */
export interface StoredFile {
  id: string;
  originalName: string;
  mimeType: string;
  size: number;
  kind: 'image' | 'video' | 'file';
  storedName: string;
  createdAt: string;
}

const UPLOADS_DIR = join(import.meta.dirname, '..', 'uploads');
const METADATA_PATH = join(UPLOADS_DIR, 'metadata.json');

/** 确保 uploads 目录存在 */
function ensureDir(): void {
  if (!existsSync(UPLOADS_DIR)) {
    mkdirSync(UPLOADS_DIR, { recursive: true });
  }
}

/** 读取元数据 JSON */
async function loadMetadata(): Promise<Record<string, StoredFile>> {
  ensureDir();
  try {
    const raw = await readFile(METADATA_PATH, 'utf-8');
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

/** 写入元数据 JSON */
async function saveMetadata(data: Record<string, StoredFile>): Promise<void> {
  ensureDir();
  await writeFile(METADATA_PATH, JSON.stringify(data, null, 2), 'utf-8');
}

/**
 * 保存上传文件并记录元数据。
 */
export async function saveFile(
  fileBuffer: Buffer,
  originalName: string,
  mimeType: string,
  kind: 'image' | 'video' | 'file',
): Promise<StoredFile> {
  const id = uuid();
  const ext = basename(originalName).includes('.') ? '' : '';
  const storedName = `${id}${ext}`;
  const filePath = join(UPLOADS_DIR, storedName);

  ensureDir();
  await writeFile(filePath, fileBuffer);

  const record: StoredFile = {
    id,
    originalName,
    mimeType,
    size: fileBuffer.length,
    kind,
    storedName,
    createdAt: new Date().toISOString(),
  };

  const meta = await loadMetadata();
  meta[id] = record;
  await saveMetadata(meta);

  return record;
}

/** 根据 ID 获取文件元数据 */
export async function getFile(id: string): Promise<StoredFile | null> {
  const meta = await loadMetadata();
  return meta[id] || null;
}

/** 获取文件的本地路径 */
export function getFilePath(storedName: string): string {
  return join(UPLOADS_DIR, storedName);
}

/** 创建文件读取流 */
export function createFileStream(storedName: string) {
  return createReadStream(getFilePath(storedName));
}

/** 删除文件及元数据 */
export async function deleteFile(id: string): Promise<void> {
  const meta = await loadMetadata();
  const record = meta[id];
  if (!record) return;

  const filePath = getFilePath(record.storedName);
  try {
    await unlink(filePath);
  } catch {
    // 文件可能已被删除
  }

  delete meta[id];
  await saveMetadata(meta);
}

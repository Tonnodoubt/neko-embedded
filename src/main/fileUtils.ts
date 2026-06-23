/**
 * fileUtils.ts (main)
 * 原子写 JSON：先写临时文件再 rename，避免写一半被读到损坏内容。对齐主项目 atomic_write_json。
 */
import { renameSync, writeFileSync } from 'node:fs';

export function atomicWriteJson(path: string, value: unknown): void {
  const tempPath = `${path}.tmp`;
  writeFileSync(tempPath, JSON.stringify(value, null, 2), 'utf-8');
  renameSync(tempPath, path);
}

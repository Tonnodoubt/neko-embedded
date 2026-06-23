/**
 * memoryStore.ts (main)
 * 记忆落盘：按角色读写 memory/{name}/ 下的 profile.json / facts.json / recent.json。
 * 缺文件时回退到默认（YUI 角色卡 / 空事实 / 空近期）。对齐主项目按角色目录存储的约定，去掉迁移/分片等机制。
 */
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { app } from 'electron';
import { atomicWriteJson } from './fileUtils';
import { defaultYuiProfile } from '../core/memory/defaultProfile';
import { isCharacterProfile } from '../core/memory/composeContext';
import {
  emptyRecentMemory,
  type CharacterProfile,
  type MemoryFact,
  type MemorySnapshot,
  type RecentMemory,
} from '../core/memory/types';

export class MemoryStore {
  private readonly characterDir: string;

  constructor(characterName: string) {
    this.characterDir = join(app.getAppPath(), 'memory', characterName);
  }

  load(): MemorySnapshot {
    return {
      profile: this.readJson('profile.json', isCharacterProfile, defaultYuiProfile),
      facts: this.readJson('facts.json', Array.isArray, [] as MemoryFact[]),
      recent: this.readJson('recent.json', isRecentMemory, emptyRecentMemory),
    };
  }

  saveProfile(profile: CharacterProfile): void {
    this.write('profile.json', profile);
  }

  saveFacts(facts: MemoryFact[]): void {
    this.write('facts.json', facts);
  }

  saveRecent(recent: RecentMemory): void {
    this.write('recent.json', recent);
  }

  private readJson<T>(file: string, guard: (value: unknown) => boolean, fallback: T): T {
    const path = join(this.characterDir, file);

    if (!existsSync(path)) {
      return fallback;
    }

    try {
      const parsed: unknown = JSON.parse(readFileSync(path, 'utf-8'));
      return guard(parsed) ? (parsed as T) : fallback;
    } catch {
      return fallback;
    }
  }

  private write(file: string, value: unknown): void {
    mkdirSync(this.characterDir, { recursive: true });
    atomicWriteJson(join(this.characterDir, file), value);
  }
}

function isRecentMemory(value: unknown): value is RecentMemory {
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  const record = value as Record<string, unknown>;
  return typeof record['summary'] === 'string' && Array.isArray(record['turns']);
}

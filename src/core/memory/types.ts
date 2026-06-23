/**
 * types.ts (core/memory)
 * 记忆子系统的平台无关类型。对齐主项目 N.E.K.O.TONG 的数据模型（facts / recent / profile），
 * 但裁掉 embedding/向量召回/reflection 等重型字段——嵌入式只保留承载身份与连续性的最小集。
 */

/** 事实归属实体，与主项目一致：主人 / 猫娘自身 / 关系。 */
export type MemoryEntity = 'master' | 'neko' | 'relationship';

/** 一条长期事实（主项目 facts.json 的精简版，去掉 hash/embedding/signal 等机内字段）。 */
export interface MemoryFact {
  id: string;
  text: string;
  importance: number; // 1-10，对齐主项目评分语义
  entity: MemoryEntity;
  source: 'user_observation' | 'ai_disclosure' | 'character_card';
  createdAt: string; // ISO8601
}

/** 角色档案：猫娘自身设定 + 主人基本信息。承载主项目刻意不放进框架 prompt 的角色卡。 */
export interface CharacterProfile {
  neko: Record<string, string | string[]>;
  master: Record<string, string | string[]>;
}

/** 最近对话的压缩记忆：summary 为 LLM 压缩文本，turns 为可选的少量原始轮次。 */
export interface RecentMemory {
  summary: string;
  turns: Array<{ role: 'human' | 'ai'; content: string }>;
}

/** 一次会话开始时用到的完整记忆快照。 */
export interface MemorySnapshot {
  profile: CharacterProfile;
  facts: MemoryFact[];
  recent: RecentMemory;
}

export const emptyRecentMemory: RecentMemory = { summary: '', turns: [] };

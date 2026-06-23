/**
 * composeContext.ts (core/memory)
 * 纯函数：把记忆快照拼成会话开始时注入模型的 context 文本。
 * 形态对齐主项目 memory_server 的注入顺序：「{角色}的信息」+「{主人}的信息」+ 长期记忆 + 最近对话。
 */
import type { CharacterProfile, MemoryFact, MemorySnapshot } from './types';

/** 把档案字段渲染成「- 键：值」列表，数组用「、」连接，空值跳过。 */
function renderProfileBlock(header: string, fields: Record<string, string | string[]>): string {
  const lines: string[] = [];

  for (const [key, value] of Object.entries(fields)) {
    const text = Array.isArray(value) ? value.filter((item) => item.trim() !== '').join('、') : value.trim();
    if (text !== '') {
      lines.push(`- ${key}：${text}`);
    }
  }

  return lines.length > 0 ? `${header}\n${lines.join('\n')}` : '';
}

function renderFacts(facts: readonly MemoryFact[], masterName: string): string {
  if (facts.length === 0) {
    return '';
  }

  const ordered = [...facts].sort((left, right) => right.importance - left.importance);
  const lines = ordered.map((fact) => `- ${fact.text}`);
  return `[关于${masterName}与本喵的长期记忆]\n${lines.join('\n')}`;
}

/**
 * 组装注入文本。profile 总会渲染（承载身份），facts/recent 有才追加。
 * 返回空串表示无可注入内容（理论上不会，profile 至少有角色信息）。
 */
export function composeMemoryContext(
  snapshot: MemorySnapshot,
  lanlanName: string,
  masterName: string,
): string {
  const sections: string[] = [];

  const nekoBlock = renderProfileBlock(`${lanlanName}的信息：`, snapshot.profile.neko);
  if (nekoBlock) {
    sections.push(nekoBlock);
  }

  const masterBlock = renderProfileBlock(`${masterName}的信息：`, snapshot.profile.master);
  if (masterBlock) {
    sections.push(masterBlock);
  }

  const facts = renderFacts(snapshot.facts, masterName);
  if (facts) {
    sections.push(facts);
  }

  const recentSummary = snapshot.recent.summary.trim();
  if (recentSummary !== '') {
    sections.push(`[最近的对话]\n${recentSummary}`);
  }

  return sections.join('\n\n');
}

/** 把记忆 context 追加到框架 prompt 后面，形成会话最终 instructions。 */
export function buildInstructions(basePrompt: string, memoryContext: string): string {
  const trimmedContext = memoryContext.trim();
  return trimmedContext === '' ? basePrompt : `${basePrompt}\n\n${trimmedContext}`;
}

export function isCharacterProfile(value: unknown): value is CharacterProfile {
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  const record = value as Record<string, unknown>;
  return typeof record['neko'] === 'object' && typeof record['master'] === 'object';
}

/**
 * factExtraction.ts (core/memory)
 * 事实抽取的纯函数：对话转写格式化、构造抽取 prompt（主项目 FACT_EXTRACTION_PROMPT 精简版，去掉 event_when）、
 * 解析 LLM 返回的 JSON（容错：去 code fence、截取数组、字段校验/钳制）。网络调用在 main 侧。
 */
import type { MemoryEntity } from './types';

export interface ConversationTurn {
  role: 'human' | 'ai';
  content: string;
}

/** 抽取出的原始事实，尚未带 id/createdAt（那些在 main 侧落盘时补）。 */
export interface ExtractedFact {
  text: string;
  importance: number;
  entity: MemoryEntity;
}

const VALID_ENTITIES: ReadonlySet<string> = new Set(['master', 'neko', 'relationship']);

/** 把对话轮次格式化成「名字 | 内容」，对齐主项目 recent 注入格式。 */
export function formatTranscript(turns: readonly ConversationTurn[], lanlanName: string, masterName: string): string {
  return turns
    .filter((turn) => turn.content.trim() !== '')
    .map((turn) => `${turn.role === 'ai' ? lanlanName : masterName} | ${turn.content.trim()}`)
    .join('\n');
}

export function buildFactExtractionPrompt(transcript: string, lanlanName: string, masterName: string): string {
  return `从以下对话中提取关于 ${lanlanName} 和 ${masterName} 的重要事实信息。

要求：
- 只提取重要且明确的事实（偏好、习惯、身份、关系动态等）
- 忽略闲聊、寒暄、模糊的内容
- 忽略AI幻觉、胡言乱语、无意义的编造内容，只提取对话中有真实依据的事实
- 每条事实必须是一个独立的原子陈述
- entity 标注为 "master"（${masterName}）、"neko"（${lanlanName}自身）或 "relationship"（两者关系）

importance 评分 1-10：
- 10：关键长期信息（姓名、昵称、生日、身份、核心关系节点）
- 8-9：长期稳定的核心偏好 / 固定习惯
- 6-7：普通偏好、日常习惯、近期动态
- 5：次要但有记录价值的观察
- 1-4：弱相关或不确定的线索

======以下为对话======
${transcript}
======以上为对话======

只返回 JSON 数组，不要任何解释：
[
  {"text": "事实描述", "importance": 7, "entity": "master"}
]
如果没有可提取的事实，返回 []。`;
}

/** 容错解析 LLM 返回：去 fence、截取数组、逐项校验。无法解析返回空数组。 */
export function parseExtractedFacts(raw: string): ExtractedFact[] {
  const arrayText = extractJsonArray(raw);
  if (arrayText === null) {
    return [];
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(arrayText);
  } catch {
    return [];
  }

  if (!Array.isArray(parsed)) {
    return [];
  }

  const facts: ExtractedFact[] = [];
  for (const item of parsed) {
    const fact = normalizeFact(item);
    if (fact) {
      facts.push(fact);
    }
  }

  return facts;
}

function extractJsonArray(raw: string): string | null {
  const withoutFence = raw.replace(/```(?:json)?/gi, '').trim();
  const start = withoutFence.indexOf('[');
  const end = withoutFence.lastIndexOf(']');
  return start >= 0 && end > start ? withoutFence.slice(start, end + 1) : null;
}

function normalizeFact(item: unknown): ExtractedFact | null {
  if (typeof item !== 'object' || item === null) {
    return null;
  }

  const record = item as Record<string, unknown>;
  const text = typeof record['text'] === 'string' ? record['text'].trim() : '';
  if (text === '') {
    return null;
  }

  const rawImportance = typeof record['importance'] === 'number' ? record['importance'] : 5;
  const importance = Math.min(10, Math.max(1, Math.round(rawImportance)));

  const rawEntity = typeof record['entity'] === 'string' ? record['entity'] : '';
  const entity: MemoryEntity = VALID_ENTITIES.has(rawEntity) ? (rawEntity as MemoryEntity) : 'master';

  return { text, importance, entity };
}

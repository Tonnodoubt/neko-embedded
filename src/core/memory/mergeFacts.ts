/**
 * mergeFacts.ts (core/memory)
 * 纯函数：把新抽取的事实并入已有事实。文本归一化去重（主项目 SHA-256 精确匹配的精简版），
 * 按 importance 降序，超过上限时截断保留高分项。
 */
import type { MemoryFact } from './types';

function normalize(text: string): string {
  return text.trim().replace(/\s+/g, ' ').toLowerCase();
}

export function mergeFacts(
  existing: readonly MemoryFact[],
  incoming: readonly MemoryFact[],
  maxFacts: number,
): MemoryFact[] {
  const seen = new Set(existing.map((fact) => normalize(fact.text)));
  const merged = [...existing];

  for (const fact of incoming) {
    const key = normalize(fact.text);
    if (key !== '' && !seen.has(key)) {
      seen.add(key);
      merged.push(fact);
    }
  }

  merged.sort((left, right) => right.importance - left.importance);
  return maxFacts > 0 ? merged.slice(0, maxFacts) : merged;
}

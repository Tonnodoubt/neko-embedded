/**
 * mergeFacts.test.ts
 * 事实合并的单测：去重、按重要度排序、上限截断。
 */
import { describe, expect, it } from 'vitest';
import { mergeFacts } from './mergeFacts';
import type { MemoryFact } from './types';

function fact(text: string, importance: number): MemoryFact {
  return { id: text, text, importance, entity: 'master', source: 'user_observation', createdAt: '2026-06-18T00:00:00' };
}

describe('mergeFacts', () => {
  it('drops incoming duplicates by normalized text', () => {
    const existing = [fact('主人喜欢咖啡', 6)];
    const incoming = [fact('  主人喜欢咖啡 ', 8), fact('主人养猫', 5)];
    const result = mergeFacts(existing, incoming, 100);
    expect(result.map((f) => f.text)).toEqual(['主人喜欢咖啡', '主人养猫']);
  });

  it('sorts by importance descending', () => {
    const result = mergeFacts([fact('a', 3)], [fact('b', 9), fact('c', 5)], 100);
    expect(result.map((f) => f.text)).toEqual(['b', 'c', 'a']);
  });

  it('caps to maxFacts keeping the highest importance', () => {
    const result = mergeFacts([], [fact('a', 1), fact('b', 9), fact('c', 5)], 2);
    expect(result.map((f) => f.text)).toEqual(['b', 'c']);
  });

  it('ignores blank incoming text', () => {
    const result = mergeFacts([], [fact('   ', 9)], 100);
    expect(result).toEqual([]);
  });
});

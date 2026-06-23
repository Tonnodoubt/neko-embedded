/**
 * composeContext.test.ts
 * 记忆注入文本组装的单测：档案渲染、事实按重要度排序、空段省略、instructions 拼接。
 */
import { describe, expect, it } from 'vitest';
import { buildInstructions, composeMemoryContext } from './composeContext';
import { DEFAULT_LANLAN_NAME, DEFAULT_MASTER_NAME, defaultYuiProfile } from './defaultProfile';
import { emptyRecentMemory, type MemoryFact, type MemorySnapshot } from './types';

function snapshot(overrides: Partial<MemorySnapshot> = {}): MemorySnapshot {
  return {
    profile: defaultYuiProfile,
    facts: [],
    recent: emptyRecentMemory,
    ...overrides,
  };
}

describe('composeMemoryContext', () => {
  it('renders the catgirl profile with array fields joined', () => {
    const result = composeMemoryContext(snapshot(), DEFAULT_LANLAN_NAME, DEFAULT_MASTER_NAME);
    expect(result).toContain('YUI的信息：');
    expect(result).toContain('- 自称：本喵');
    expect(result).toContain('- 核心特质：理智可靠、嘴上偶尔傲娇，但藏不住关心、内心其实温柔');
    expect(result).toContain('碳基生物的信息：');
  });

  it('omits facts and recent sections when empty', () => {
    const result = composeMemoryContext(snapshot(), DEFAULT_LANLAN_NAME, DEFAULT_MASTER_NAME);
    expect(result).not.toContain('长期记忆');
    expect(result).not.toContain('最近的对话');
  });

  it('lists facts ordered by importance descending', () => {
    const facts: MemoryFact[] = [
      { id: 'a', text: '主人喜欢猫', importance: 4, entity: 'master', source: 'user_observation', createdAt: '2026-06-18T00:00:00' },
      { id: 'b', text: '主人是程序员', importance: 9, entity: 'master', source: 'user_observation', createdAt: '2026-06-18T00:00:00' },
    ];
    const result = composeMemoryContext(snapshot({ facts }), DEFAULT_LANLAN_NAME, DEFAULT_MASTER_NAME);
    expect(result).toContain('长期记忆');
    expect(result.indexOf('主人是程序员')).toBeLessThan(result.indexOf('主人喜欢猫'));
  });

  it('includes the recent summary when present', () => {
    const result = composeMemoryContext(
      snapshot({ recent: { summary: '昨天聊了考试', turns: [] } }),
      DEFAULT_LANLAN_NAME,
      DEFAULT_MASTER_NAME,
    );
    expect(result).toContain('[最近的对话]\n昨天聊了考试');
  });
});

describe('buildInstructions', () => {
  it('appends memory context after the base prompt', () => {
    expect(buildInstructions('BASE', 'CTX')).toBe('BASE\n\nCTX');
  });

  it('returns the base prompt unchanged when context is empty', () => {
    expect(buildInstructions('BASE', '   ')).toBe('BASE');
  });
});

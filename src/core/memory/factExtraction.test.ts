/**
 * factExtraction.test.ts
 * 对话格式化与 LLM-JSON 抽取解析的容错单测。
 */
import { describe, expect, it } from 'vitest';
import { formatTranscript, parseExtractedFacts, type ConversationTurn } from './factExtraction';

describe('formatTranscript', () => {
  it('labels turns with names and skips empty content', () => {
    const turns: ConversationTurn[] = [
      { role: 'human', content: '我是程序员' },
      { role: 'ai', content: '' },
      { role: 'ai', content: '记住啦' },
    ];
    expect(formatTranscript(turns, 'YUI', '碳基生物')).toBe('碳基生物 | 我是程序员\nYUI | 记住啦');
  });
});

describe('parseExtractedFacts', () => {
  it('parses a clean JSON array', () => {
    const facts = parseExtractedFacts('[{"text":"主人是程序员","importance":9,"entity":"master"}]');
    expect(facts).toEqual([{ text: '主人是程序员', importance: 9, entity: 'master' }]);
  });

  it('strips code fences and surrounding prose', () => {
    const raw = '好的，结果如下：\n```json\n[{"text":"喜欢猫","importance":6,"entity":"master"}]\n```';
    expect(parseExtractedFacts(raw)).toEqual([{ text: '喜欢猫', importance: 6, entity: 'master' }]);
  });

  it('clamps importance and defaults invalid entity to master', () => {
    const facts = parseExtractedFacts('[{"text":"a","importance":99,"entity":"???"},{"text":"b","entity":"neko"}]');
    expect(facts[0]).toEqual({ text: 'a', importance: 10, entity: 'master' });
    expect(facts[1]).toEqual({ text: 'b', importance: 5, entity: 'neko' });
  });

  it('drops entries without usable text', () => {
    expect(parseExtractedFacts('[{"importance":5,"entity":"master"},{"text":"   "}]')).toEqual([]);
  });

  it('returns empty array for non-array or garbage', () => {
    expect(parseExtractedFacts('抱歉没有事实')).toEqual([]);
    expect(parseExtractedFacts('{"text":"x"}')).toEqual([]);
  });
});

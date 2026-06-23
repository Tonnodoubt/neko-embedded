/**
 * recentSummary.test.ts
 * 近期摘要 prompt 构造与解析的单测（JSON 优先、纯文本回退）。
 */
import { describe, expect, it } from 'vitest';
import { buildRecentSummaryPrompt, parseSummary } from './recentSummary';

describe('parseSummary', () => {
  it('extracts the summary field from JSON', () => {
    expect(parseSummary('{"summary":"主人在准备考试"}')).toBe('主人在准备考试');
  });

  it('strips code fences around JSON', () => {
    expect(parseSummary('```json\n{"summary":"聊了猫"}\n```')).toBe('聊了猫');
  });

  it('falls back to plain text when no JSON object present', () => {
    expect(parseSummary('  主人今天心情不错  ')).toBe('主人今天心情不错');
  });
});

describe('buildRecentSummaryPrompt', () => {
  it('marks empty previous summary and embeds the transcript', () => {
    const prompt = buildRecentSummaryPrompt('', '碳基生物 | 你好', 'YUI', '碳基生物');
    expect(prompt).toContain('已有摘要：\n（无）');
    expect(prompt).toContain('碳基生物 | 你好');
  });

  it('includes the prior summary when present', () => {
    expect(buildRecentSummaryPrompt('昨天聊了考试', 'x', 'YUI', '碳基生物')).toContain('昨天聊了考试');
  });
});

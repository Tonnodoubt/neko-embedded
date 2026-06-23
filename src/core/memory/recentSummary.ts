/**
 * recentSummary.ts (core/memory)
 * 近期对话压缩的纯函数：构造压缩 prompt、解析 LLM 返回的摘要（兼容 {"summary": "..."} 或纯文本）。
 */

export function buildRecentSummaryPrompt(
  previousSummary: string,
  transcript: string,
  lanlanName: string,
  masterName: string,
): string {
  const priorBlock = previousSummary.trim() === '' ? '（无）' : previousSummary.trim();

  return `你在维护 ${lanlanName} 对与 ${masterName} 最近对话的记忆摘要。请把已有摘要和本次新对话融合成一份更新后的简洁摘要。

要求：
- 用第三人称、简洁中文，保留对后续对话有用的事实与情绪线索
- 丢弃寒暄与无意义内容，不要逐句复述
- 控制在 200 字以内

已有摘要：
${priorBlock}

======本次新对话======
${transcript}
======结束======

只返回 JSON：{"summary": "更新后的摘要"}`;
}

/** 解析摘要：优先取 JSON 的 summary 字段，失败则回退为去 fence 的纯文本。 */
export function parseSummary(raw: string): string {
  const cleaned = raw.replace(/```(?:json)?/gi, '').trim();

  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start >= 0 && end > start) {
    try {
      const parsed: unknown = JSON.parse(cleaned.slice(start, end + 1));
      if (typeof parsed === 'object' && parsed !== null) {
        const summary = (parsed as Record<string, unknown>)['summary'];
        if (typeof summary === 'string') {
          return summary.trim();
        }
      }
    } catch {
      // 落到纯文本回退
    }
  }

  return cleaned;
}

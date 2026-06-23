/**
 * assistClient.ts (main)
 * 辅助文本模型调用：走 DashScope OpenAI 兼容的 /chat/completions（用 Node 原生 fetch，不引依赖）。
 * 遵主项目 memory 硬规则：不传 temperature（兼容拒收该参数的模型）。仅用于记忆抽取/压缩。
 */
import type { AssistConfig } from './config';

const REQUEST_TIMEOUT_MS = 30000;

export async function chatCompletion(config: AssistConfig, prompt: string): Promise<string> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(`${config.baseUrl.replace(/\/$/, '')}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify({
        model: config.model,
        messages: [{ role: 'user', content: prompt }],
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`assist 模型请求失败：HTTP ${response.status}`);
    }

    const data: unknown = await response.json();
    return readContent(data);
  } finally {
    clearTimeout(timeout);
  }
}

function readContent(data: unknown): string {
  if (typeof data !== 'object' || data === null) {
    return '';
  }

  const choices = (data as Record<string, unknown>)['choices'];
  if (!Array.isArray(choices) || choices.length === 0) {
    return '';
  }

  const message = (choices[0] as Record<string, unknown>)['message'];
  if (typeof message !== 'object' || message === null) {
    return '';
  }

  const content = (message as Record<string, unknown>)['content'];
  return typeof content === 'string' ? content : '';
}

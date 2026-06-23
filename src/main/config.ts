/**
 * config.ts (main)
 * 读取并校验项目根目录的 config.json，映射成内核所需的连接配置与人格。
 * 在系统边界做严格校验：缺字段或仍是占位 key 时 fail-fast 抛友好错误。
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { QwenRealtimeVoiceConnectionSettings } from '../core/settings';

const API_KEY_PLACEHOLDER = 'REPLACE_WITH_DASHSCOPE_API_KEY';

export interface NekoPersonaConfig {
  name: string;
  systemPrompt: string;
}

/** 辅助文本模型（记忆抽取/压缩用），走 DashScope OpenAI 兼容接口。 */
export interface AssistConfig {
  apiKey: string;
  baseUrl: string;
  model: string;
}

export interface NekoConfig {
  persona: NekoPersonaConfig;
  voice: QwenRealtimeVoiceConnectionSettings;
  assist: AssistConfig;
}

// 默认对齐主项目 qwen 档：compatible-mode 端点 + default_models.summary_model。
const DEFAULT_ASSIST_BASE_URL = 'https://dashscope.aliyuncs.com/compatible-mode/v1';
const DEFAULT_ASSIST_MODEL = 'qwen-plus';

export function loadConfig(baseDir: string): NekoConfig {
  const configPath = process.env['NEKO_CONFIG']?.trim() || join(baseDir, 'config.json');

  let raw: string;
  try {
    raw = readFileSync(configPath, 'utf-8');
  } catch {
    throw new Error(`找不到配置文件：${configPath}。请先 cp config.example.json config.json 并填入 DashScope API key。`);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error(`配置文件不是合法 JSON：${configPath}`);
  }

  return validateConfig(parsed);
}

function validateConfig(value: unknown): NekoConfig {
  if (typeof value !== 'object' || value === null) {
    throw new Error('配置根必须是一个对象');
  }

  const root = value as Record<string, unknown>;
  const persona = readObject(root['persona'], 'persona');
  const voice = readObject(root['voice'], 'voice');

  const apiKey = readNonEmptyString(voice['apiKey'], 'voice.apiKey');
  if (apiKey === API_KEY_PLACEHOLDER) {
    throw new Error('voice.apiKey 还是占位值，请填入真实 DashScope API key。');
  }

  return {
    persona: {
      name: readNonEmptyString(persona['name'], 'persona.name'),
      systemPrompt: readNonEmptyString(persona['systemPrompt'], 'persona.systemPrompt'),
    },
    voice: {
      apiKey,
      providerLabel: readNonEmptyString(voice['providerLabel'], 'voice.providerLabel'),
      realtimeUrl: readNonEmptyString(voice['realtimeUrl'], 'voice.realtimeUrl'),
      model: readNonEmptyString(voice['model'], 'voice.model'),
      defaultVoiceId: readNonEmptyString(voice['defaultVoiceId'], 'voice.defaultVoiceId'),
    },
    assist: resolveAssist(root['assist'], apiKey),
  };
}

// assist 整段可选；缺省时复用 voice 的 key、走主项目同款端点与默认 summary 模型。
function resolveAssist(value: unknown, fallbackApiKey: string): AssistConfig {
  const block = typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {};
  const apiKey = typeof block['apiKey'] === 'string' && block['apiKey'].trim() !== '' ? block['apiKey'] : fallbackApiKey;
  const baseUrl =
    typeof block['baseUrl'] === 'string' && block['baseUrl'].trim() !== '' ? block['baseUrl'] : DEFAULT_ASSIST_BASE_URL;
  const model = typeof block['model'] === 'string' && block['model'].trim() !== '' ? block['model'] : DEFAULT_ASSIST_MODEL;
  return { apiKey, baseUrl, model };
}

function readObject(value: unknown, field: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null) {
    throw new Error(`配置缺少对象字段：${field}`);
  }

  return value as Record<string, unknown>;
}

function readNonEmptyString(value: unknown, field: string): string {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`配置字段必须是非空字符串：${field}`);
  }

  return value;
}

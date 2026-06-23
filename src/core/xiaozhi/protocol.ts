/**
 * protocol.ts (core/xiaozhi)
 * 小智 WebSocket 协议的平台无关定义：设备↔服务器的 JSON 消息类型、解析、构造。
 * 依据 78/xiaozhi-esp32 docs/websocket.md。纯逻辑，供翻译层服务器复用并单测。
 */

/** 设备与服务器约定的音频参数（hello 交换）。设备上行 16k，服务器下行 24k，Opus 60ms 帧。 */
export interface AudioParams {
  format: string;
  sample_rate: number;
  channels: number;
  frame_duration: number;
}

export const DEVICE_INPUT_AUDIO: AudioParams = { format: 'opus', sample_rate: 16000, channels: 1, frame_duration: 60 };
export const SERVER_OUTPUT_AUDIO: AudioParams = { format: 'opus', sample_rate: 24000, channels: 1, frame_duration: 60 };

// ---------- 设备 → 服务器 ----------

export type ListenState = 'start' | 'stop' | 'detect';
export type ListenMode = 'auto' | 'manual' | 'realtime';

export interface HelloClientMessage {
  type: 'hello';
  version?: number;
  transport?: string;
  features?: Record<string, boolean>;
  audio_params?: Partial<AudioParams>;
}

export interface ListenClientMessage {
  type: 'listen';
  state: ListenState;
  mode?: ListenMode;
  text?: string;
  session_id?: string;
}

export interface AbortClientMessage {
  type: 'abort';
  reason?: string;
  session_id?: string;
}

/** 已识别的设备消息；未知 type 归到 unknown 以便忽略。 */
export type ClientMessage =
  | HelloClientMessage
  | ListenClientMessage
  | AbortClientMessage
  | { type: 'unknown'; raw: Record<string, unknown> };

/** 解析设备发来的文本帧。非法 JSON / 非对象返回 null。 */
export function parseClientMessage(text: string): ClientMessage | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return null;
  }

  if (typeof parsed !== 'object' || parsed === null) {
    return null;
  }

  const record = parsed as Record<string, unknown>;
  const type = typeof record['type'] === 'string' ? record['type'] : '';

  switch (type) {
    case 'hello':
      return { type: 'hello', version: numberOr(record['version']), transport: stringOr(record['transport']) };
    case 'listen':
      return {
        type: 'listen',
        state: (stringOr(record['state']) as ListenState) || 'start',
        mode: record['mode'] as ListenMode | undefined,
        text: stringOr(record['text']),
        session_id: stringOr(record['session_id']),
      };
    case 'abort':
      return { type: 'abort', reason: stringOr(record['reason']), session_id: stringOr(record['session_id']) };
    default:
      return { type: 'unknown', raw: record };
  }
}

// ---------- 服务器 → 设备 ----------

export function buildServerHello(sessionId: string): string {
  return JSON.stringify({
    type: 'hello',
    transport: 'websocket',
    session_id: sessionId,
    audio_params: SERVER_OUTPUT_AUDIO,
  });
}

export function buildStt(sessionId: string, text: string): string {
  return JSON.stringify({ type: 'stt', session_id: sessionId, text });
}

export function buildLlm(sessionId: string, emotion: string, text = ''): string {
  return JSON.stringify({ type: 'llm', session_id: sessionId, emotion, text });
}

export function buildTtsStart(sessionId: string): string {
  return JSON.stringify({ type: 'tts', session_id: sessionId, state: 'start' });
}

export function buildTtsSentenceStart(sessionId: string, text: string): string {
  return JSON.stringify({ type: 'tts', session_id: sessionId, state: 'sentence_start', text });
}

export function buildTtsStop(sessionId: string): string {
  return JSON.stringify({ type: 'tts', session_id: sessionId, state: 'stop' });
}

function stringOr(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

function numberOr(value: unknown): number | undefined {
  return typeof value === 'number' ? value : undefined;
}

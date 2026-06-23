/**
 * voiceSession.ts (main)
 * 主进程语音会话编排：用 Node 的 ws（能带 Authorization 头）驱动 QwenRealtimeVoiceClient，
 * 把内核回调转发给 sink（由 index.ts 桥接到渲染层），并接收渲染层送来的麦克风帧。
 */
import WebSocket from 'ws';
import { QwenRealtimeVoiceClient } from '../core/runtime/QwenRealtimeVoiceClient';
import type { NekoConfig } from './config';

// 内核读取 globalThis.WebSocket 建连，Node 原生 WebSocket 不支持自定义 header，换成 ws。
(globalThis as unknown as { WebSocket: typeof WebSocket }).WebSocket = WebSocket;

export interface VoiceSessionSink {
  onStatus(message: string): void;
  onUserTranscript(text: string): void;
  onAssistantDelta(text: string, isNewMessage: boolean): void;
  onAssistantAudio(pcm: Uint8Array): void;
  onResponseDone(): void;
  onError(error: string): void;
}

export class VoiceSession {
  private client: QwenRealtimeVoiceClient | null = null;

  constructor(
    private readonly config: NekoConfig,
    private readonly instructions: string,
    private readonly sink: VoiceSessionSink,
  ) {}

  async start(): Promise<void> {
    if (this.client) {
      return;
    }

    const client = new QwenRealtimeVoiceClient({
      settings: this.config.voice,
      instructions: this.instructions,
      outputAudio: true,
      voiceId: this.config.voice.defaultVoiceId,
      onStatus: (message) => this.sink.onStatus(message),
      onResponseCreated: () => {},
      onUserActivity: () => {},
      onUserTranscript: (text) => this.sink.onUserTranscript(text),
      onAssistantDelta: (text, isNewMessage) => this.sink.onAssistantDelta(text, isNewMessage),
      onAssistantAudio: (chunk) => this.sink.onAssistantAudio(chunk.pcm),
      onResponseDone: () => this.sink.onResponseDone(),
      onError: (error) => this.sink.onError(error),
    });

    this.client = client;
    await client.connect();
  }

  sendFrame(frame: Int16Array): void {
    this.client?.sendAudioFrame(frame);
  }

  stop(): void {
    this.client?.close();
    this.client = null;
  }
}

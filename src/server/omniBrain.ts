/**
 * omniBrain.ts (server)
 * 把 QwenRealtimeVoiceClient 适配成翻译层的 VoiceBrain：用 Node 的 ws（带鉴权头）连 Omni 实时，
 * 内核回调翻译成连接需要的 handler（转写/回合开始/整句/音频/回合结束）。
 */
import WebSocket from 'ws';
import { QwenRealtimeVoiceClient } from '../core/runtime/QwenRealtimeVoiceClient';
import type { QwenRealtimeVoiceConnectionSettings } from '../core/settings';
import type { VoiceBrain, VoiceBrainHandlers } from './connection';

// 内核读 globalThis.WebSocket 建连，Node 原生不支持自定义 header，换成 ws。
(globalThis as unknown as { WebSocket: typeof WebSocket }).WebSocket = WebSocket;

export class OmniVoiceBrain implements VoiceBrain {
  private client: QwenRealtimeVoiceClient | null = null;
  private assistantText = '';

  constructor(
    private readonly settings: QwenRealtimeVoiceConnectionSettings,
    private readonly instructions: string,
  ) {}

  async start(handlers: VoiceBrainHandlers): Promise<void> {
    if (this.client) {
      return;
    }

    const client = new QwenRealtimeVoiceClient({
      settings: this.settings,
      instructions: this.instructions,
      outputAudio: true,
      voiceId: this.settings.defaultVoiceId,
      onStatus: () => {},
      onResponseCreated: () => {
        this.assistantText = '';
        handlers.onResponseStart();
      },
      onUserActivity: () => {},
      onUserTranscript: (text) => handlers.onUserTranscript(text),
      onAssistantDelta: (text) => {
        this.assistantText += text;
      },
      onAssistantAudio: (chunk) => handlers.onAudio(bytesToInt16LE(chunk.pcm)),
      onResponseDone: () => {
        if (this.assistantText.trim() !== '') {
          handlers.onAssistantSentence(this.assistantText.trim());
        }
        handlers.onResponseDone();
      },
      onError: () => {},
    });

    this.client = client;
    await client.connect();
  }

  pushAudio(pcm: Int16Array): void {
    this.client?.sendAudioFrame(pcm);
  }

  interrupt(): void {
    this.client?.interrupt();
  }

  stop(): void {
    this.client?.close();
    this.client = null;
  }
}

/** PCM16 LE 字节流（内核输出 24k）→ Int16Array（交给翻译层 codec 编码下发）。 */
function bytesToInt16LE(bytes: Uint8Array): Int16Array {
  const sampleCount = Math.floor(bytes.byteLength / 2);
  const view = new DataView(bytes.buffer, bytes.byteOffset, sampleCount * 2);
  const out = new Int16Array(sampleCount);
  for (let i = 0; i < sampleCount; i += 1) {
    out[i] = view.getInt16(i * 2, true);
  }
  return out;
}

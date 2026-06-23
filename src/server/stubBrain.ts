/**
 * stubBrain.ts (server)
 * 占位大脑：实现 VoiceBrain 但不接任何模型，仅让服务器骨架能起、能完成握手。
 * 真实大脑（QwenRealtimeVoiceClient + 记忆的适配器）是下一步要写的，将替换这里。
 */
import type { VoiceBrain, VoiceBrainHandlers } from './connection';

export class StubVoiceBrain implements VoiceBrain {
  private handlers: VoiceBrainHandlers | null = null;

  async start(handlers: VoiceBrainHandlers): Promise<void> {
    this.handlers = handlers;
  }

  pushAudio(_pcm: Int16Array): void {
    // 骨架占位：真实大脑会把 PCM 喂给 Omni 实时客户端。
    void this.handlers;
  }

  interrupt(): void {}

  stop(): void {}
}

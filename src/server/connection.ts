/**
 * connection.ts (server)
 * 一个设备连接的小智协议状态机：握手 → 路由设备消息 → 把大脑事件翻译回小智消息。
 * 只依赖抽象接口（Transport / AudioCodec / VoiceBrain），不碰 ws/electron，可单测。
 */
import {
  buildLlm,
  buildServerHello,
  buildStt,
  buildTtsSentenceStart,
  buildTtsStart,
  buildTtsStop,
  parseClientMessage,
} from '../core/xiaozhi/protocol';
import type { AudioCodec } from '../core/xiaozhi/audioCodec';
import { inferAvatarEmotionFromText } from '../core/emotion/avatarEmotion';

/** 向设备发送的通道。ws socket 适配到这个接口。 */
export interface Transport {
  sendText(text: string): void;
  sendBinary(frame: Uint8Array): void;
}

/** 大脑（Omni）回调：连接把这些翻译成小智下行消息。 */
export interface VoiceBrainHandlers {
  onUserTranscript(text: string): void;
  onResponseStart(): void;
  onAssistantSentence(text: string): void;
  onAudio(pcm: Int16Array): void;
  onResponseDone(): void;
}

/** 大脑接口缝：QwenRealtimeVoiceClient 之后适配到这里；骨架期可注入 stub。 */
export interface VoiceBrain {
  start(handlers: VoiceBrainHandlers): Promise<void>;
  pushAudio(pcm: Int16Array): void;
  interrupt(): void;
  stop(): void;
}

export class XiaozhiConnection {
  private handshaken = false;

  constructor(
    private readonly sessionId: string,
    private readonly transport: Transport,
    private readonly codec: AudioCodec,
    private readonly brain: VoiceBrain,
  ) {}

  /** 处理设备发来的文本 JSON 帧。 */
  async handleText(text: string): Promise<void> {
    const message = parseClientMessage(text);
    if (!message) {
      return;
    }

    switch (message.type) {
      case 'hello':
        await this.onHello();
        return;
      case 'abort':
        this.brain.interrupt();
        return;
      case 'listen':
      case 'unknown':
        return;
    }
  }

  /** 处理设备发来的二进制音频帧（设备 Opus → PCM16 → 喂大脑）。 */
  handleBinary(frame: Uint8Array): void {
    if (!this.handshaken) {
      return;
    }
    this.brain.pushAudio(this.codec.decode(frame));
  }

  close(): void {
    this.brain.stop();
  }

  private async onHello(): Promise<void> {
    if (this.handshaken) {
      return;
    }

    this.transport.sendText(buildServerHello(this.sessionId));
    await this.brain.start(this.buildHandlers());
    this.handshaken = true;
  }

  private buildHandlers(): VoiceBrainHandlers {
    const { sessionId, transport, codec } = this;
    return {
      onUserTranscript: (text) => transport.sendText(buildStt(sessionId, text)),
      onResponseStart: () => transport.sendText(buildTtsStart(sessionId)),
      onAssistantSentence: (text) => {
        const emotion = inferAvatarEmotionFromText(text).emotion;
        transport.sendText(buildLlm(sessionId, emotion, text));
        transport.sendText(buildTtsSentenceStart(sessionId, text));
      },
      onAudio: (pcm) => {
        for (const frame of codec.encode(pcm)) {
          transport.sendBinary(frame);
        }
      },
      onResponseDone: () => transport.sendText(buildTtsStop(sessionId)),
    };
  }
}

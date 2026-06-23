/**
 * connection.test.ts
 * 小智连接状态机单测：握手门控、设备消息路由、大脑事件→小智下行翻译。
 */
import { describe, expect, it } from 'vitest';
import { XiaozhiConnection, type Transport, type VoiceBrain, type VoiceBrainHandlers } from './connection';
import { PcmPassthroughCodec } from '../core/xiaozhi/audioCodec';

class FakeTransport implements Transport {
  texts: string[] = [];
  binaries: Uint8Array[] = [];
  sendText(text: string): void {
    this.texts.push(text);
  }
  sendBinary(frame: Uint8Array): void {
    this.binaries.push(frame);
  }
  parsedTexts(): Array<Record<string, unknown>> {
    return this.texts.map((t) => JSON.parse(t));
  }
}

class FakeBrain implements VoiceBrain {
  handlers: VoiceBrainHandlers | null = null;
  pushed: Int16Array[] = [];
  interrupted = 0;
  async start(handlers: VoiceBrainHandlers): Promise<void> {
    this.handlers = handlers;
  }
  pushAudio(pcm: Int16Array): void {
    this.pushed.push(pcm);
  }
  interrupt(): void {
    this.interrupted += 1;
  }
  stop(): void {}
}

function setup() {
  const transport = new FakeTransport();
  const brain = new FakeBrain();
  const conn = new XiaozhiConnection('sess-1', transport, new PcmPassthroughCodec(), brain);
  return { transport, brain, conn };
}

describe('XiaozhiConnection handshake gating', () => {
  it('ignores audio before hello', () => {
    const { brain, conn } = setup();
    conn.handleBinary(new Uint8Array([1, 0, 2, 0]));
    expect(brain.pushed).toHaveLength(0);
  });

  it('replies server hello and starts the brain on hello', async () => {
    const { transport, brain, conn } = setup();
    await conn.handleText('{"type":"hello","version":1}');
    expect(transport.parsedTexts()[0]).toMatchObject({ type: 'hello', transport: 'websocket', session_id: 'sess-1' });
    expect(brain.handlers).not.toBeNull();
  });

  it('forwards decoded audio to the brain after handshake', async () => {
    const { brain, conn } = setup();
    await conn.handleText('{"type":"hello"}');
    conn.handleBinary(new Uint8Array([1, 0, 2, 0])); // 两个 PCM16 LE 样本
    expect(brain.pushed).toHaveLength(1);
    expect(Array.from(brain.pushed[0] ?? [])).toEqual([1, 2]);
  });
});

describe('XiaozhiConnection translation', () => {
  it('routes abort to brain.interrupt', async () => {
    const { brain, conn } = setup();
    await conn.handleText('{"type":"hello"}');
    await conn.handleText('{"type":"abort","reason":"wake_word_detected"}');
    expect(brain.interrupted).toBe(1);
  });

  it('translates brain events into xiaozhi downstream messages', async () => {
    const { transport, brain, conn } = setup();
    await conn.handleText('{"type":"hello"}');
    const h = brain.handlers;
    expect(h).not.toBeNull();

    h?.onUserTranscript('我是程序员');
    h?.onResponseStart();
    h?.onAssistantSentence('哈哈，本喵记住啦');
    h?.onAudio(new Int16Array([5, -5]));
    h?.onResponseDone();

    const types = transport.parsedTexts().map((m) => `${m['type']}${m['state'] ? ':' + String(m['state']) : ''}`);
    expect(types).toEqual([
      'hello',
      'stt',
      'tts:start',
      'llm',
      'tts:sentence_start',
      'tts:stop',
    ]);
    // 开心句子应推断出 happy 情绪
    const llm = transport.parsedTexts().find((m) => m['type'] === 'llm');
    expect(llm?.['emotion']).toBe('happy');
    // onAudio 走二进制
    expect(transport.binaries).toHaveLength(1);
  });
});

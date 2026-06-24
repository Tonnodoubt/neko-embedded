/**
 * opusCodec.test.ts
 * Opus 编解码单测：编码端按帧攒满才出、余量留存；解码端能把一个 Opus 包还原成 PCM。
 */
import OpusScript from 'opusscript';
import { describe, expect, it } from 'vitest';
import { OpusCodec } from './opusCodec';

const SERVER_FRAME = 1440; // 24k 60ms

function tone(samples: number): Int16Array {
  const pcm = new Int16Array(samples);
  for (let i = 0; i < samples; i += 1) {
    pcm[i] = Math.round(3000 * Math.sin(i / 9));
  }
  return pcm;
}

describe('OpusCodec encode framing', () => {
  it('emits one frame per full 60ms block', () => {
    const codec = new OpusCodec();
    const frames = codec.encode(tone(SERVER_FRAME));
    expect(frames).toHaveLength(1);
    expect(frames[0]?.byteLength).toBeGreaterThan(0);
  });

  it('buffers a partial block until a full frame accumulates', () => {
    const codec = new OpusCodec();
    expect(codec.encode(tone(700))).toHaveLength(0); // 不足一帧，留存
    expect(codec.encode(tone(740))).toHaveLength(1); // 700+740=1440，凑满一帧
  });
});

describe('OpusCodec decode', () => {
  it('decodes a device-style 16k opus packet back to PCM', () => {
    const deviceEncoder = new OpusScript(16000, 1, OpusScript.Application.VOIP);
    const deviceFrameSamples = 960; // 16k 60ms
    const buf = Buffer.allocUnsafe(deviceFrameSamples * 2);
    for (let i = 0; i < deviceFrameSamples; i += 1) {
      buf.writeInt16LE(Math.round(2000 * Math.sin(i / 7)), i * 2);
    }
    const opusPacket = new Uint8Array(deviceEncoder.encode(buf, deviceFrameSamples));

    const decoded = new OpusCodec().decode(opusPacket);
    expect(decoded.length).toBe(deviceFrameSamples);
  });
});

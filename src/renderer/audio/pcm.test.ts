/**
 * pcm.test.ts
 * pcm.ts DSP 纯函数单测：转换的削波/缩放、PCM16 LE 小端解码、48k→16k 降采样。
 */
import { describe, expect, it } from 'vitest';
import { decodePcm16LE, downsampleFloat32, floatTo16BitPcm, int16ToFloat32, isWithinPlayback } from './pcm';

describe('isWithinPlayback', () => {
  it('is active while before playback end plus tail', () => {
    // 播放在 t=2.0 结束，尾巴 0.4 → 到 2.4 之前都算正在出声
    expect(isWithinPlayback(2.3, 2.0, 0.4)).toBe(true);
  });

  it('reopens the mic once past end plus tail', () => {
    expect(isWithinPlayback(2.5, 2.0, 0.4)).toBe(false);
  });

  it('is inactive when nothing is queued (end at 0)', () => {
    expect(isWithinPlayback(5, 0, 0.4)).toBe(false);
  });
});

describe('floatTo16BitPcm', () => {
  it('maps full-scale values to int16 extremes', () => {
    const result = floatTo16BitPcm(new Float32Array([0, 1, -1]));
    expect(Array.from(result)).toEqual([0, 32767, -32768]);
  });

  it('clamps out-of-range samples instead of wrapping', () => {
    const result = floatTo16BitPcm(new Float32Array([1.5, -2]));
    expect(Array.from(result)).toEqual([32767, -32768]);
  });
});

describe('int16ToFloat32', () => {
  it('normalizes int16 back into [-1, 1)', () => {
    const result = int16ToFloat32(new Int16Array([0, 16384, -32768]));
    expect(result[0]).toBeCloseTo(0);
    expect(result[1]).toBeCloseTo(0.5);
    expect(result[2]).toBeCloseTo(-1);
  });

  it('round-trips a mid-range signal within one quantization step', () => {
    const original = new Float32Array([0.25, -0.5, 0.75]);
    const restored = int16ToFloat32(floatTo16BitPcm(original));
    for (let index = 0; index < original.length; index += 1) {
      expect(restored[index]).toBeCloseTo(original[index] ?? 0, 3);
    }
  });
});

describe('decodePcm16LE', () => {
  it('reads samples as little-endian signed 16-bit', () => {
    // 0x0000 = 0, 0x8000(LE bytes 00 80) = -32768, 0x7fff(LE bytes ff 7f) = 32767
    const bytes = new Uint8Array([0x00, 0x00, 0x00, 0x80, 0xff, 0x7f]);
    expect(Array.from(decodePcm16LE(bytes))).toEqual([0, -32768, 32767]);
  });

  it('ignores a trailing odd byte', () => {
    const bytes = new Uint8Array([0x10, 0x00, 0x42]);
    expect(Array.from(decodePcm16LE(bytes))).toEqual([16]);
  });

  it('respects byteOffset on a subarray view', () => {
    const backing = new Uint8Array([0xff, 0xff, 0x01, 0x00]);
    const view = backing.subarray(2); // bytes 01 00 → 1
    expect(Array.from(decodePcm16LE(view))).toEqual([1]);
  });
});

describe('downsampleFloat32', () => {
  it('reduces length by the rate ratio for 48k→16k', () => {
    const input = new Float32Array(48);
    const result = downsampleFloat32(input, 48000, 16000);
    expect(result.length).toBe(16);
  });

  it('preserves a constant signal through box averaging', () => {
    const input = new Float32Array(9).fill(0.4);
    const result = downsampleFloat32(input, 48000, 16000);
    for (const sample of result) {
      expect(sample).toBeCloseTo(0.4);
    }
  });

  it('averages each output sample over its input window', () => {
    const input = new Float32Array([0, 1, 2, 3, 4, 5]);
    const result = downsampleFloat32(input, 48000, 16000); // ratio 3 → avg of [0,1,2],[3,4,5]
    expect(result[0]).toBeCloseTo(1);
    expect(result[1]).toBeCloseTo(4);
  });

  it('returns a copy when target rate is not lower', () => {
    const input = new Float32Array([0.1, 0.2]);
    const result = downsampleFloat32(input, 16000, 16000);
    expect(result.length).toBe(2);
    expect(result[0]).toBeCloseTo(0.1);
    expect(result[1]).toBeCloseTo(0.2);
    expect(result).not.toBe(input);
  });

  it('rejects non-positive rates', () => {
    expect(() => downsampleFloat32(new Float32Array(1), 48000, 0)).toThrow();
  });
});

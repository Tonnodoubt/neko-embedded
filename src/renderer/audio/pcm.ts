/**
 * pcm.ts
 * 渲染层音频 DSP 纯函数：麦克风 Float32 ↔ PCM16 转换、48k→16k 降采样、24k 输出 PCM16 LE 解码。
 * 与 core 内核的音频契约对齐（输入 16kHz Int16、输出 24kHz PCM16 LE），是 MicCapture/PcmPlayer 的底层。
 */

const INT16_MAX = 32767;
const INT16_DIVISOR = 32768;

/**
 * 把 Web Audio 的 Float32 采样（范围约 [-1, 1]）转成 PCM16。
 * 越界值会被削波到 [-1, 1]，负值用 32768、正值用 32767 缩放以充分利用动态范围。
 */
export function floatTo16BitPcm(input: Float32Array): Int16Array {
  const output = new Int16Array(input.length);

  for (let index = 0; index < input.length; index += 1) {
    const sample = input[index] ?? 0;
    const clamped = sample < -1 ? -1 : sample > 1 ? 1 : sample;
    output[index] = clamped < 0 ? Math.round(clamped * INT16_DIVISOR) : Math.round(clamped * INT16_MAX);
  }

  return output;
}

/** PCM16 → Float32（[-1, 1]），用于把输出音频喂给 Web Audio 播放。 */
export function int16ToFloat32(input: Int16Array): Float32Array {
  const output = new Float32Array(input.length);

  for (let index = 0; index < input.length; index += 1) {
    output[index] = (input[index] ?? 0) / INT16_DIVISOR;
  }

  return output;
}

/**
 * 把小端字节流（内核输出的 24kHz PCM16 LE）解码成 Int16Array。
 * 尾部不足 2 字节的残字节会被忽略，避免读越界。
 */
export function decodePcm16LE(bytes: Uint8Array): Int16Array {
  const sampleCount = Math.floor(bytes.length / 2);
  const output = new Int16Array(sampleCount);
  const view = new DataView(bytes.buffer, bytes.byteOffset, sampleCount * 2);

  for (let index = 0; index < sampleCount; index += 1) {
    output[index] = view.getInt16(index * 2, true);
  }

  return output;
}

/**
 * 回声门控判定（纯函数）：当前播放时钟是否仍处于「正在出声 + 尾巴」窗口内。
 * 用于 YUI 说话期间屏蔽麦克风上送，避免喇叭声被麦克风拾回造成自激/回声。
 * 所有时间单位为秒（对齐 Web Audio 的 AudioContext.currentTime）。
 */
export function isWithinPlayback(currentTime: number, playbackEndsAt: number, tailSeconds: number): boolean {
  return currentTime < playbackEndsAt + tailSeconds;
}

/**
 * 降采样：把 inputRate 的 Float32 信号重采样到 targetRate（用于麦克风 48k→16k）。
 * 采用区间平均（box filter），比直接抽取更能抑制混叠。
 * 当 targetRate >= inputRate 时不做处理，原样复制返回（本项目只做降采样）。
 */
export function downsampleFloat32(
  input: Float32Array,
  inputRate: number,
  targetRate: number,
): Float32Array {
  if (targetRate <= 0 || inputRate <= 0) {
    throw new Error('Sample rates must be positive');
  }

  if (targetRate >= inputRate) {
    return input.slice();
  }

  const ratio = inputRate / targetRate;
  const outputLength = Math.floor(input.length / ratio);
  const output = new Float32Array(outputLength);

  for (let index = 0; index < outputLength; index += 1) {
    const start = Math.floor(index * ratio);
    const end = Math.min(input.length, Math.floor((index + 1) * ratio));
    let sum = 0;
    let count = 0;

    for (let cursor = start; cursor < end; cursor += 1) {
      sum += input[cursor] ?? 0;
      count += 1;
    }

    output[index] = count > 0 ? sum / count : 0;
  }

  return output;
}

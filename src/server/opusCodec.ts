/**
 * opusCodec.ts (server)
 * 真实 Opus 编解码（opusscript，纯 JS 免编译）：设备上行 16k Opus→PCM16；Omni 输出 24k PCM16→Opus。
 * 编码端按 60ms 帧（24k=1440 样本）攒够再出，余量留到下次。实现 AudioCodec 接口，替换 PCM 直通桩。
 */
import OpusScript from 'opusscript';
import type { AudioCodec } from '../core/xiaozhi/audioCodec';

const DEVICE_SAMPLE_RATE = 16000;
const SERVER_SAMPLE_RATE = 24000;
const CHANNELS = 1;
const FRAME_DURATION_MS = 60;
const SERVER_FRAME_SAMPLES = (SERVER_SAMPLE_RATE * FRAME_DURATION_MS) / 1000; // 1440

export class OpusCodec implements AudioCodec {
  private readonly decoder = new OpusScript(DEVICE_SAMPLE_RATE, CHANNELS, OpusScript.Application.VOIP);
  private readonly encoder = new OpusScript(SERVER_SAMPLE_RATE, CHANNELS, OpusScript.Application.VOIP);
  private pending: number[] = [];

  /** 设备一个 Opus 包（16k）→ PCM16。复制出独立 Int16Array，避免别名 opusscript 内部缓冲。 */
  decode(frame: Uint8Array): Int16Array {
    const pcm = this.decoder.decode(Buffer.from(frame));
    const out = new Int16Array(Math.floor(pcm.length / 2));
    for (let i = 0; i < out.length; i += 1) {
      out[i] = pcm.readInt16LE(i * 2);
    }
    return out;
  }

  /** Omni 输出 PCM16（块大小不定）→ 攒满 60ms 帧逐个 Opus 编码；不足一帧的余量留存。 */
  encode(pcm: Int16Array): Uint8Array[] {
    for (let i = 0; i < pcm.length; i += 1) {
      this.pending.push(pcm[i] ?? 0);
    }

    const frames: Uint8Array[] = [];
    while (this.pending.length >= SERVER_FRAME_SAMPLES) {
      const chunk = this.pending.splice(0, SERVER_FRAME_SAMPLES);
      const buffer = Buffer.allocUnsafe(SERVER_FRAME_SAMPLES * 2);
      for (let i = 0; i < SERVER_FRAME_SAMPLES; i += 1) {
        buffer.writeInt16LE(chunk[i] ?? 0, i * 2);
      }
      frames.push(new Uint8Array(this.encoder.encode(buffer, SERVER_FRAME_SAMPLES)));
    }
    return frames;
  }
}

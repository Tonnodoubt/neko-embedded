/**
 * audioCodec.ts (core/xiaozhi)
 * 设备帧 ↔ PCM16 的编解码接口（Opus 的插座）。设备两头用 Opus，Omni 内核用 PCM16，翻译层在此转换。
 * 先提供 PcmPassthroughCodec（把帧当裸 PCM16 LE），让骨架不依赖 Opus 也能跑/测；
 * 真实 OpusCodec 之后实现同一接口替换即可。
 */

export interface AudioCodec {
  /** 设备上行帧（一个 Opus 包）→ PCM16（喂 Omni）。 */
  decode(frame: Uint8Array): Int16Array;
  /** Omni 输出 PCM16（块大小不定）→ 0 个或多个设备下行帧（按帧攒够再出）。 */
  encode(pcm: Int16Array): Uint8Array[];
}

/** 直通桩：帧即裸 PCM16 LE，不做真正编解码。仅用于无 Opus 时跑通骨架。 */
export class PcmPassthroughCodec implements AudioCodec {
  decode(frame: Uint8Array): Int16Array {
    const sampleCount = Math.floor(frame.byteLength / 2);
    const view = new DataView(frame.buffer, frame.byteOffset, sampleCount * 2);
    const out = new Int16Array(sampleCount);
    for (let i = 0; i < sampleCount; i += 1) {
      out[i] = view.getInt16(i * 2, true);
    }
    return out;
  }

  encode(pcm: Int16Array): Uint8Array[] {
    const bytes = new Uint8Array(pcm.length * 2);
    const view = new DataView(bytes.buffer);
    for (let i = 0; i < pcm.length; i += 1) {
      view.setInt16(i * 2, pcm[i] ?? 0, true);
    }
    return [bytes];
  }
}

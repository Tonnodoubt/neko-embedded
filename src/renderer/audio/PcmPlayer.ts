/**
 * PcmPlayer.ts
 * 输出播放薄壳：把内核吐出的 24kHz PCM16 LE 字节流解码、无缝排队播放。
 * 提供 clear() 供打断时清空队列；首块开播时回调 onPlaybackStart（供主进程触发回声门控）。
 * DSP 委托已测的 pcm.ts。
 */
import { decodePcm16LE, int16ToFloat32, isWithinPlayback } from './pcm';

const OUTPUT_SAMPLE_RATE = 24000;

export interface PcmPlayerOptions {
  onPlaybackStart?: () => void;
}

export class PcmPlayer {
  private context: AudioContext | null = null;
  private nextStartTime = 0;
  private readonly activeSources = new Set<AudioBufferSourceNode>();

  constructor(private readonly options: PcmPlayerOptions = {}) {}

  /** 接收一段 24kHz PCM16 LE 字节，解码后排到播放队列尾部。 */
  enqueue(bytes: Uint8Array): void {
    const samples = decodePcm16LE(bytes);

    if (samples.length === 0) {
      return;
    }

    const context = this.ensureContext();
    const buffer = context.createBuffer(1, samples.length, OUTPUT_SAMPLE_RATE);
    buffer.getChannelData(0).set(int16ToFloat32(samples));

    const source = context.createBufferSource();
    source.buffer = buffer;
    source.connect(context.destination);

    const now = context.currentTime;
    const wasIdle = this.nextStartTime <= now;
    const startAt = wasIdle ? now : this.nextStartTime;

    if (wasIdle) {
      this.options.onPlaybackStart?.();
    }

    source.onended = () => {
      this.activeSources.delete(source);
    };

    this.activeSources.add(source);
    source.start(startAt);
    this.nextStartTime = startAt + buffer.duration;
  }

  /** 是否仍在出声（含 tailSeconds 尾巴），供回声门控屏蔽麦克风上送。 */
  isPlaying(tailSeconds: number): boolean {
    if (!this.context) {
      return false;
    }

    return isWithinPlayback(this.context.currentTime, this.nextStartTime, tailSeconds);
  }

  /** 打断：立即停掉所有已排期的音频并清空队列。 */
  clear(): void {
    for (const source of this.activeSources) {
      try {
        source.stop();
      } catch {
        // 已结束的源 stop 会抛，忽略。
      }
    }

    this.activeSources.clear();
    this.nextStartTime = this.context?.currentTime ?? 0;
  }

  async dispose(): Promise<void> {
    this.clear();

    if (this.context) {
      await this.context.close();
      this.context = null;
    }
  }

  private ensureContext(): AudioContext {
    if (!this.context) {
      this.context = new AudioContext({ sampleRate: OUTPUT_SAMPLE_RATE });
      this.nextStartTime = 0;
    }

    return this.context;
  }
}

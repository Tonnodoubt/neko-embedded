/**
 * MicCapture.ts
 * 麦克风采集薄壳：getUserMedia 取流 → 按设备原生采样率采 Float32 → 降采样到 16kHz → 转 PCM16，
 * 逐帧回调上抛（交给主进程喂给 Qwen 实时内核）。DSP 全部委托已测的 pcm.ts。
 */
import { downsampleFloat32, floatTo16BitPcm } from './pcm';

const TARGET_SAMPLE_RATE = 16000;
const CAPTURE_BUFFER_SIZE = 2048;

export type MicFrameHandler = (frame: Int16Array) => void;

export class MicCapture {
  private context: AudioContext | null = null;
  private stream: MediaStream | null = null;
  private source: MediaStreamAudioSourceNode | null = null;
  private processor: ScriptProcessorNode | null = null;

  get isRunning(): boolean {
    return this.context !== null;
  }

  async start(onFrame: MicFrameHandler): Promise<void> {
    if (this.context) {
      return;
    }

    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        channelCount: 1,
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
    });
    this.stream = stream;

    const context = new AudioContext();
    this.context = context;
    const inputRate = context.sampleRate;

    const source = context.createMediaStreamSource(stream);
    this.source = source;

    const processor = context.createScriptProcessor(CAPTURE_BUFFER_SIZE, 1, 1);
    this.processor = processor;

    processor.onaudioprocess = (event: AudioProcessingEvent) => {
      const channel = event.inputBuffer.getChannelData(0);
      const downsampled = downsampleFloat32(channel, inputRate, TARGET_SAMPLE_RATE);

      if (downsampled.length > 0) {
        onFrame(floatTo16BitPcm(downsampled));
      }
    };

    source.connect(processor);
    // ScriptProcessor 必须接到 destination 才会触发 onaudioprocess；用静音增益避免回放自身。
    const sink = context.createGain();
    sink.gain.value = 0;
    processor.connect(sink);
    sink.connect(context.destination);
  }

  async stop(): Promise<void> {
    this.processor?.disconnect();
    this.source?.disconnect();
    this.stream?.getTracks().forEach((track) => track.stop());

    if (this.context) {
      await this.context.close();
    }

    this.processor = null;
    this.source = null;
    this.stream = null;
    this.context = null;
  }
}

import { calculateRms } from './realtimeAudio';

const REALTIME_ECHO_SUPPRESSION_AFTER_PLAYBACK_MS = 900;
const REALTIME_STALE_OUTPUT_DROP_MS = 900;
const REALTIME_PRE_ROLL_FRAMES = 8;

export interface RealtimeEchoGateConfig {
  calibrationFrames: number;
  calibrationMinMs: number;
  echoAverageGateMultiplier: number;
  echoPeakGateMultiplier: number;
  initialPlaybackSpeechThreshold: number;
  minPlaybackSpeechThreshold: number;
  minSpeechFrames: number;
}

const IOS_ECHO_GATE: RealtimeEchoGateConfig = {
  calibrationFrames: 10,
  calibrationMinMs: 320,
  echoAverageGateMultiplier: 2.0,
  echoPeakGateMultiplier: 1.15,
  initialPlaybackSpeechThreshold: 0.03,
  minPlaybackSpeechThreshold: 0.02,
  minSpeechFrames: 2,
};

const ANDROID_ECHO_GATE: RealtimeEchoGateConfig = {
  calibrationFrames: 24,
  calibrationMinMs: 900,
  echoAverageGateMultiplier: 4.2,
  echoPeakGateMultiplier: 1.8,
  initialPlaybackSpeechThreshold: 0.08,
  minPlaybackSpeechThreshold: 0.12,
  minSpeechFrames: 6,
};

export function resolveEchoGateConfig(platform: string): RealtimeEchoGateConfig {
  return platform === 'ios' ? IOS_ECHO_GATE : ANDROID_ECHO_GATE;
}

interface SimpleVadState {
  isSpeaking: boolean;
  consecutiveSpeechFrames: number;
  consecutiveSilenceFrames: number;
}

export type RealtimePlaybackInputDecision =
  | { type: 'calibrating' | 'ignored' }
  | { type: 'speech_started'; preRollFrames: Int16Array[] }
  | { type: 'speech_continued' };

export class RealtimeVoiceController {
  private readonly echoGate: RealtimeEchoGateConfig;
  private inputMutedUntil = 0;
  private staleOutputDropUntil = 0;
  private calibrationFrames: number[] = [];
  private calibratedSpeechThreshold: number;
  private playbackStartedAt = 0;
  private preRollFrames: Int16Array[] = [];
  private readonly vad: ReturnType<typeof createSimpleVad>;

  constructor(echoGate: RealtimeEchoGateConfig = ANDROID_ECHO_GATE) {
    this.echoGate = echoGate;
    this.calibratedSpeechThreshold = echoGate.initialPlaybackSpeechThreshold;
    this.vad = createSimpleVad({
      speechThreshold: echoGate.initialPlaybackSpeechThreshold,
      silenceThreshold: echoGate.initialPlaybackSpeechThreshold * 0.75,
      minSpeechFrames: echoGate.minSpeechFrames,
      silenceFrames: 6,
    });
  }

  shouldSuppressInput(now = Date.now()): boolean {
    return now < this.inputMutedUntil;
  }

  shouldDropAssistantOutput(now = Date.now()): boolean {
    return now < this.staleOutputDropUntil;
  }

  clearStaleOutputDrop(): void {
    this.staleOutputDropUntil = 0;
  }

  allowInput(): void {
    this.inputMutedUntil = 0;
  }

  muteInputAfterPlayback(now = Date.now()): void {
    this.inputMutedUntil = now + REALTIME_ECHO_SUPPRESSION_AFTER_PLAYBACK_MS;
  }

  suppressStaleOutput(now = Date.now()): void {
    this.staleOutputDropUntil = now + REALTIME_STALE_OUTPUT_DROP_MS;
  }

  markPlaybackStarted(now = Date.now()): void {
    this.playbackStartedAt = now;
  }

  resetSession(): void {
    this.inputMutedUntil = 0;
    this.staleOutputDropUntil = 0;
    this.resetPlaybackGate();
  }

  resetPlaybackGate(): void {
    this.calibrationFrames = [];
    this.calibratedSpeechThreshold = this.echoGate.initialPlaybackSpeechThreshold;
    this.playbackStartedAt = 0;
    this.preRollFrames = [];
    this.vad.reset();
    this.vad.updateThreshold(this.calibratedSpeechThreshold);
  }

  handleInputDuringPlayback(frame: Int16Array, now = Date.now()): RealtimePlaybackInputDecision {
    const rms = calculateRms(frame);
    const playbackElapsedMs = now - this.playbackStartedAt;

    this.rememberPreRollFrame(frame);

    const isCalibrating =
      this.calibrationFrames.length < this.echoGate.calibrationFrames ||
      playbackElapsedMs < this.echoGate.calibrationMinMs;

    if (isCalibrating && rms < this.calibratedSpeechThreshold) {
      this.calibrationFrames.push(rms);
      this.updatePlaybackSpeechThreshold();
      return { type: 'calibrating' };
    }

    if (rms < this.calibratedSpeechThreshold) {
      return { type: 'ignored' };
    }

    const wasSpeaking = this.vad.getState().isSpeaking;
    const isSpeaking = this.vad.processFrame(frame);

    if (!isSpeaking) {
      return { type: 'ignored' };
    }

    if (!wasSpeaking) {
      const preRollFrames = this.preRollFrames;
      this.preRollFrames = [];
      return { type: 'speech_started', preRollFrames };
    }

    return { type: 'speech_continued' };
  }

  private rememberPreRollFrame(frame: Int16Array): void {
    this.preRollFrames.push(new Int16Array(frame));

    if (this.preRollFrames.length > REALTIME_PRE_ROLL_FRAMES) {
      this.preRollFrames.shift();
    }
  }

  private updatePlaybackSpeechThreshold(): void {
    if (this.calibrationFrames.length === 0) {
      return;
    }

    const averageEchoRms =
      this.calibrationFrames.reduce((sum, value) => sum + value, 0) /
      this.calibrationFrames.length;
    const sortedEchoRms = [...this.calibrationFrames].sort((left, right) => left - right);
    const stablePeakIndex = Math.min(sortedEchoRms.length - 1, Math.floor(sortedEchoRms.length * 0.75));
    const stablePeakRms = sortedEchoRms[stablePeakIndex] ?? averageEchoRms;
    this.calibratedSpeechThreshold = Math.max(
      this.echoGate.minPlaybackSpeechThreshold,
      averageEchoRms * this.echoGate.echoAverageGateMultiplier,
      stablePeakRms * this.echoGate.echoPeakGateMultiplier,
    );
    this.vad.updateThreshold(this.calibratedSpeechThreshold);
  }
}

function createSimpleVad(opts: {
  speechThreshold: number;
  silenceThreshold: number;
  minSpeechFrames: number;
  silenceFrames: number;
}) {
  let speechThreshold = opts.speechThreshold;
  let silenceThreshold = opts.silenceThreshold;
  const state: SimpleVadState = {
    isSpeaking: false,
    consecutiveSpeechFrames: 0,
    consecutiveSilenceFrames: 0,
  };

  return {
    processFrame(frame: Int16Array): boolean {
      const rms = calculateRms(frame);

      if (rms >= speechThreshold) {
        state.consecutiveSpeechFrames += 1;
        state.consecutiveSilenceFrames = 0;

        if (!state.isSpeaking && state.consecutiveSpeechFrames >= opts.minSpeechFrames) {
          state.isSpeaking = true;
        }
      } else if (rms < silenceThreshold) {
        state.consecutiveSilenceFrames += 1;
        state.consecutiveSpeechFrames = 0;

        if (state.isSpeaking && state.consecutiveSilenceFrames >= opts.silenceFrames) {
          state.isSpeaking = false;
        }
      }

      return state.isSpeaking;
    },
    reset(): void {
      state.isSpeaking = false;
      state.consecutiveSpeechFrames = 0;
      state.consecutiveSilenceFrames = 0;
    },
    updateThreshold(threshold: number): void {
      speechThreshold = threshold;
      silenceThreshold = threshold * 0.75;
    },
    getState(): SimpleVadState {
      return { ...state };
    },
  };
}

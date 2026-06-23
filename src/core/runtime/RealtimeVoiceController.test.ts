import { describe, expect, it } from 'vitest';

import { RealtimeVoiceController, resolveEchoGateConfig } from './RealtimeVoiceController';

const iosGate = resolveEchoGateConfig('ios');

describe('RealtimeVoiceController', () => {
  it('suppresses input and stale output inside their windows', () => {
    const controller = new RealtimeVoiceController();

    controller.muteInputAfterPlayback(1000);
    controller.suppressStaleOutput(1000);

    expect(controller.shouldSuppressInput(1200)).toBe(true);
    expect(controller.shouldSuppressInput(2000)).toBe(false);
    expect(controller.shouldDropAssistantOutput(1200)).toBe(true);

    controller.clearStaleOutputDrop();
    expect(controller.shouldDropAssistantOutput(1200)).toBe(false);
  });

  it('calibrates before detecting user speech during playback (iOS gate)', () => {
    const controller = new RealtimeVoiceController(iosGate);
    const quiet = new Int16Array([500, -500, 500, -500]);

    controller.markPlaybackStarted(0);

    for (let index = 0; index < 10; index += 1) {
      expect(controller.handleInputDuringPlayback(quiet, 320)).toEqual({ type: 'calibrating' });
    }

    expect(controller.handleInputDuringPlayback(quiet, 320)).toEqual({ type: 'ignored' });
  });

  it('returns pre-roll frames when speech starts during playback (iOS gate)', () => {
    const controller = new RealtimeVoiceController(iosGate);
    const quiet = new Int16Array([500, -500, 500, -500]);
    const loud = new Int16Array([20000, -20000, 20000, -20000]);

    controller.markPlaybackStarted(0);

    for (let index = 0; index < 10; index += 1) {
      controller.handleInputDuringPlayback(quiet, 320);
    }

    for (let index = 0; index < 1; index += 1) {
      expect(controller.handleInputDuringPlayback(loud, 320).type).toBe('ignored');
    }
    const decision = controller.handleInputDuringPlayback(loud, 320);

    expect(decision.type).toBe('speech_started');
    if (decision.type === 'speech_started') {
      expect(decision.preRollFrames.length).toBeGreaterThan(0);
      expect(decision.preRollFrames.at(-1)).toEqual(loud);
    }

    expect(controller.handleInputDuringPlayback(loud, 320)).toEqual({ type: 'speech_continued' });
  });

  it('does not swallow early user speech while calibrating playback echo (iOS gate)', () => {
    const controller = new RealtimeVoiceController(iosGate);
    const loud = new Int16Array([20000, -20000, 20000, -20000]);

    controller.markPlaybackStarted(0);

    expect(controller.handleInputDuringPlayback(loud, 80).type).toBe('ignored');
    expect(controller.handleInputDuringPlayback(loud, 112).type).toBe('speech_started');
  });

  it('android gate requires more calibration frames and higher threshold', () => {
    const controller = new RealtimeVoiceController(resolveEchoGateConfig('android'));
    const quiet = new Int16Array([500, -500, 500, -500]);

    controller.markPlaybackStarted(0);

    for (let index = 0; index < 24; index += 1) {
      expect(controller.handleInputDuringPlayback(quiet, 900)).toEqual({ type: 'calibrating' });
    }

    expect(controller.handleInputDuringPlayback(quiet, 900)).toEqual({ type: 'ignored' });
  });
});

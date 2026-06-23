import { describe, expect, it } from 'vitest';

import { RealtimeTurnCoordinator } from './RealtimeTurnCoordinator';

describe('RealtimeTurnCoordinator', () => {
  it('reuses the pending user turn until transcript completion', () => {
    const coordinator = new RealtimeTurnCoordinator();

    expect(coordinator.beginUserActivity()).toEqual({ turnId: 'realtime-user-1', isNew: true });
    expect(coordinator.beginUserActivity()).toEqual({ turnId: 'realtime-user-1', isNew: false });
    expect(coordinator.completeUserTranscript()).toEqual({ turnId: 'realtime-user-1', isNew: false });
  });

  it('marks only the first assistant delta as a new message', () => {
    const coordinator = new RealtimeTurnCoordinator();

    expect(coordinator.beginAssistantResponse()).toEqual({ turnId: 'realtime-assistant-1', isNew: true });
    expect(coordinator.acceptAssistantDelta()).toEqual({ turnId: 'realtime-assistant-1', isNew: true });
    expect(coordinator.acceptAssistantDelta()).toEqual({ turnId: 'realtime-assistant-1', isNew: false });
    expect(coordinator.acceptAssistantAudio()).toEqual({ turnId: 'realtime-assistant-1', isNew: false });
    expect(coordinator.finishAssistantResponse()).toEqual({ turnId: 'realtime-assistant-1', isNew: false });
    expect(coordinator.finishAssistantResponse()).toBeNull();
  });

  it('drops stale assistant output after interruption', () => {
    const coordinator = new RealtimeTurnCoordinator();

    coordinator.beginAssistantResponse();
    coordinator.acceptAssistantDelta();
    coordinator.interruptActiveAssistant();

    expect(coordinator.acceptAssistantDelta()).toBeNull();
    expect(coordinator.acceptAssistantAudio()).toBeNull();
    expect(coordinator.finishAssistantResponse()).toBeNull();
  });

  it('resets sequence and active state', () => {
    const coordinator = new RealtimeTurnCoordinator();

    coordinator.beginUserActivity();
    coordinator.beginAssistantResponse();
    coordinator.reset();

    expect(coordinator.completeUserTranscript()).toEqual({ turnId: 'realtime-user-1', isNew: true });
    expect(coordinator.acceptAssistantDelta()).toBeNull();
  });
});

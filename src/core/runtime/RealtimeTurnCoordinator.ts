export interface RealtimeTurnDecision {
  turnId: string;
  isNew: boolean;
}

interface AssistantTurn {
  turnId: string;
  hasEmittedDelta: boolean;
}

export class RealtimeTurnCoordinator {
  private sequence = 0;
  private pendingUserTurnId: string | null = null;
  private activeAssistantTurn: AssistantTurn | null = null;
  private waitingForNextAssistantResponse = false;

  reset(): void {
    this.sequence = 0;
    this.pendingUserTurnId = null;
    this.activeAssistantTurn = null;
    this.waitingForNextAssistantResponse = false;
  }

  beginUserActivity(): RealtimeTurnDecision {
    if (this.pendingUserTurnId) {
      this.interruptActiveAssistant();
      return {
        turnId: this.pendingUserTurnId,
        isNew: false,
      };
    }

    const turnId = this.nextTurnId('user');
    this.pendingUserTurnId = turnId;
    this.interruptActiveAssistant();

    return {
      turnId,
      isNew: true,
    };
  }

  completeUserTranscript(): RealtimeTurnDecision {
    const turnId = this.pendingUserTurnId ?? this.nextTurnId('user');
    const isNew = !this.pendingUserTurnId;

    this.pendingUserTurnId = null;
    this.waitingForNextAssistantResponse = !this.activeAssistantTurn;

    return {
      turnId,
      isNew,
    };
  }

  beginAssistantResponse(): RealtimeTurnDecision {
    const turnId = this.nextTurnId('assistant');
    this.activeAssistantTurn = {
      turnId,
      hasEmittedDelta: false,
    };
    this.waitingForNextAssistantResponse = false;

    return {
      turnId,
      isNew: true,
    };
  }

  acceptAssistantDelta(): RealtimeTurnDecision | null {
    if (!this.activeAssistantTurn || this.waitingForNextAssistantResponse) {
      return null;
    }

    const isNew = !this.activeAssistantTurn.hasEmittedDelta;
    this.activeAssistantTurn.hasEmittedDelta = true;

    return {
      turnId: this.activeAssistantTurn.turnId,
      isNew,
    };
  }

  acceptAssistantAudio(): RealtimeTurnDecision | null {
    if (!this.activeAssistantTurn || this.waitingForNextAssistantResponse) {
      return null;
    }

    return {
      turnId: this.activeAssistantTurn.turnId,
      isNew: false,
    };
  }

  finishAssistantResponse(): RealtimeTurnDecision | null {
    if (!this.activeAssistantTurn) {
      return null;
    }

    const turnId = this.activeAssistantTurn.turnId;
    this.activeAssistantTurn = null;

    return {
      turnId,
      isNew: false,
    };
  }

  interruptActiveAssistant(): void {
    this.activeAssistantTurn = null;
    this.waitingForNextAssistantResponse = true;
  }

  private nextTurnId(role: 'user' | 'assistant'): string {
    this.sequence += 1;
    return `realtime-${role}-${this.sequence}`;
  }
}

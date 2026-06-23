import type { QwenRealtimeVoiceConnectionSettings } from '../settings';
import { encodeBase64, decodeBase64, encodeInt16LE } from '../lib/base64';
import { createAuthenticatedWebSocket, sendJson } from '../lib/websocket';
import { createEventId } from '../lib/eventId';
import { redactSensitiveText } from '../lib/redact';

const OUTPUT_SAMPLE_RATE = 24000;
const CONNECT_TIMEOUT_MS = 15000;

type QwenRealtimeEvent = {
  type?: string;
  delta?: string;
  transcript?: string;
  error?: {
    message?: string;
    code?: string;
  };
};

interface QwenRealtimeVoiceClientOptions {
  settings: QwenRealtimeVoiceConnectionSettings;
  instructions: string;
  outputAudio?: boolean;
  voiceId?: string;
  onStatus(message: string): void;
  onResponseCreated(): void;
  onUserActivity(): void;
  onUserTranscript(text: string): void | Promise<void>;
  onAssistantDelta(text: string, isNewMessage: boolean): void | Promise<void>;
  onAssistantAudio(chunk: { pcm: Uint8Array; sampleRate: number; providerLabel: string }): void;
  onResponseDone(): void | Promise<void>;
  onError(error: string): void;
}

export class QwenRealtimeVoiceClient {
  private socket: WebSocket | null = null;
  private isConnected = false;
  private isFirstAssistantDelta = true;
  private isClosed = false;
  private hasActiveResponse = false;
  private hasAppendedAudio = false;

  constructor(private readonly options: QwenRealtimeVoiceClientOptions) {}

  connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      let isSettled = false;
      const socket = createAuthenticatedWebSocket(resolveRealtimeUrl(this.options.settings), {
        Authorization: `Bearer ${this.options.settings.apiKey}`,
        'X-DashScope-DataInspection': 'enable',
      });
      this.socket = socket;
      const timeoutId = setTimeout(() => {
        settle(() => reject(new Error('Realtime voice connection timed out')));
      }, CONNECT_TIMEOUT_MS);

      const settle = (callback: () => void) => {
        if (isSettled) {
          return;
        }

        isSettled = true;
        clearTimeout(timeoutId);
        callback();
      };

      socket.onopen = () => {
        this.options.onStatus(`${this.options.settings.providerLabel} · 连接中`);
        this.sendSessionUpdate();
      };

      socket.onmessage = (event) => {
        const message = parseMessage(event.data);

        if (!message) {
          return;
        }

        if (message.type === 'error') {
          const error = readQwenError(message, this.options.settings.apiKey);

          if (isIgnorableCancelRaceError(error)) {
            this.hasActiveResponse = false;
            this.options.onStatus(`${this.options.settings.providerLabel} · 已打断`);
            return;
          }

          this.options.onError(error);
          settle(() => reject(new Error(error)));
          return;
        }

        if (message.type === 'session.created' || message.type === 'session.updated') {
          this.isConnected = true;
          this.options.onStatus(`${this.options.settings.providerLabel} · 已连接`);
          settle(resolve);
          return;
        }

        this.handleRealtimeEvent(message);
      };

      socket.onerror = () => {
        const error = 'Realtime voice connection failed';
        this.options.onError(error);
        settle(() => reject(new Error(error)));
      };

      socket.onclose = () => {
        this.isConnected = false;

        if (this.isClosed) {
          settle(resolve);
          return;
        }

        const error = 'Realtime voice connection closed';
        this.options.onError(error);
        settle(() => reject(new Error(error)));
      };
    });
  }

  sendAudioFrame(frame: Int16Array): void {
    if (!this.isConnected || !this.socket || frame.length === 0) {
      return;
    }

    sendJson(this.socket, {
      type: 'input_audio_buffer.append',
      event_id: createEventId('audio'),
      audio: encodeBase64(encodeInt16LE(frame)),
    });
    this.hasAppendedAudio = true;
  }

  sendImageFrame(dataUri: string): boolean {
    const image = extractImageBase64(dataUri);

    if (!this.isConnected || !this.socket || !image) {
      return false;
    }

    if (!this.hasAppendedAudio) {
      return true;
    }

    sendJson(this.socket, {
      type: 'input_image_buffer.append',
      event_id: createEventId('image'),
      image,
    });
    return true;
  }

  interrupt(): void {
    if (!this.socket || !this.isConnected || !this.hasActiveResponse) {
      return;
    }

    sendJson(this.socket, {
      type: 'response.cancel',
      event_id: createEventId('cancel'),
    });
  }

  close(): void {
    this.isClosed = true;
    this.isConnected = false;
    this.hasAppendedAudio = false;

    try {
      this.socket?.close();
    } catch {
      // Ignore close failures from already closed sockets.
    } finally {
      this.socket = null;
    }
  }

  private sendSessionUpdate(): void {
    if (!this.socket) {
      return;
    }

    const outputAudio = this.options.outputAudio ?? true;
    const session: Record<string, unknown> = {
      instructions: this.options.instructions,
      modalities: outputAudio ? ['text', 'audio'] : ['text'],
      input_audio_format: 'pcm',
      input_audio_transcription: {
        model: 'gummy-realtime-v1',
      },
      turn_detection: {
        type: 'server_vad',
        threshold: 0.5,
        prefix_padding_ms: 300,
        silence_duration_ms: 800,
      },
      repetition_penalty: 1.2,
      temperature: 0.7,
    };

    if (outputAudio) {
      session.voice = this.options.voiceId?.trim() || this.options.settings.defaultVoiceId;
      session.output_audio_format = 'pcm';
      session.smooth_output = false;
    }

    sendJson(this.socket, {
      type: 'session.update',
      event_id: createEventId('session'),
      session,
    });
  }

  private handleRealtimeEvent(message: QwenRealtimeEvent): void {
    switch (message.type) {
      case 'response.created':
        this.hasActiveResponse = true;
        this.isFirstAssistantDelta = true;
        this.options.onResponseCreated();
        return;
      case 'input_audio_buffer.speech_started':
        this.options.onUserActivity();
        return;
      case 'input_audio_buffer.speech_stopped':
        return;
      case 'conversation.item.input_audio_transcription.completed':
        if (message.transcript?.trim()) {
          void this.options.onUserTranscript(message.transcript.trim());
        }
        return;
      case 'response.text.delta':
      case 'response.output_text.delta':
      case 'response.audio_transcript.delta':
      case 'response.output_audio_transcript.delta':
        if (message.delta) {
          void this.options.onAssistantDelta(message.delta, this.isFirstAssistantDelta);
          this.isFirstAssistantDelta = false;
        }
        return;
      case 'response.audio.delta':
      case 'response.output_audio.delta':
        if (message.delta) {
          this.options.onAssistantAudio({
            pcm: decodeBase64(message.delta),
            sampleRate: OUTPUT_SAMPLE_RATE,
            providerLabel: this.options.settings.providerLabel,
          });
        }
        return;
      case 'response.done':
        this.hasActiveResponse = false;
        void this.options.onResponseDone();
        return;
      default:
        return;
    }
  }
}

function resolveRealtimeUrl(settings: QwenRealtimeVoiceConnectionSettings): string {
  const url = new URL(settings.realtimeUrl);
  url.searchParams.set('model', settings.model);
  return url.toString();
}

function extractImageBase64(dataUri: string): string {
  const normalized = dataUri.trim();
  const commaIndex = normalized.indexOf(',');

  return commaIndex >= 0 ? normalized.slice(commaIndex + 1).trim() : normalized;
}

function parseMessage(data: unknown): QwenRealtimeEvent | null {
  if (typeof data !== 'string') {
    return null;
  }

  try {
    return JSON.parse(data) as QwenRealtimeEvent;
  } catch {
    return null;
  }
}

function readQwenError(message: QwenRealtimeEvent, apiKey: string): string {
  const detail = message.error?.message || message.error?.code || 'Realtime voice request failed';
  return redactSensitiveText(detail, apiKey);
}

function isIgnorableCancelRaceError(error: string): boolean {
  const normalizedError = error.toLowerCase();
  return normalizedError.includes('none active response');
}

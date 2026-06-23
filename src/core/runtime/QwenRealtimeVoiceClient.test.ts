import { afterEach, describe, expect, it, vi } from 'vitest';

import { QwenRealtimeVoiceClient } from './QwenRealtimeVoiceClient';

const originalWebSocket = globalThis.WebSocket;

afterEach(() => {
  FakeWebSocket.instances = [];

  if (originalWebSocket) {
    globalThis.WebSocket = originalWebSocket;
  } else {
    delete (globalThis as { WebSocket?: typeof WebSocket }).WebSocket;
  }
});

describe('QwenRealtimeVoiceClient', () => {
  it('opens a realtime session with auth headers and voice session settings', async () => {
    installFakeWebSocket();
    const onStatus = vi.fn();
    const client = createClient({ onStatus });

    const connectPromise = client.connect();
    const socket = requireSingleSocket();

    expect(socket.url).toBe('wss://example.test/realtime?model=qwen-realtime');
    expect(socket.options?.headers).toMatchObject({
      Authorization: 'Bearer test-key',
      'X-DashScope-DataInspection': 'enable',
    });

    socket.emitOpen();

    expect(onStatus).toHaveBeenCalledWith('Qwen · 连接中');
    expect(socket.sentPayloads[0]).toMatchObject({
      type: 'session.update',
      session: {
        instructions: 'test',
        modalities: ['text', 'audio'],
        input_audio_format: 'pcm',
        input_audio_transcription: { model: 'gummy-realtime-v1' },
        voice: 'Cherry',
        output_audio_format: 'pcm',
      },
    });

    socket.emitMessage({ type: 'session.updated' });

    await expect(connectPromise).resolves.toBeUndefined();
    expect(onStatus).toHaveBeenCalledWith('Qwen · 已连接');
  });

  it('routes transcript, assistant output, audio, done, and interrupt events', async () => {
    installFakeWebSocket();
    const callbacks = {
      onResponseCreated: vi.fn(),
      onUserActivity: vi.fn(),
      onUserTranscript: vi.fn(),
      onAssistantDelta: vi.fn(),
      onAssistantAudio: vi.fn(),
      onResponseDone: vi.fn(),
    };
    const client = createClient(callbacks);
    const connectPromise = client.connect();
    const socket = requireSingleSocket();

    socket.emitOpen();
    socket.emitMessage({ type: 'session.updated' });
    await connectPromise;

    client.sendAudioFrame(new Int16Array([1, -2]));
    socket.emitMessage({ type: 'response.created' });
    socket.emitMessage({ type: 'input_audio_buffer.speech_started' });
    socket.emitMessage({
      type: 'conversation.item.input_audio_transcription.completed',
      transcript: ' hello ',
    });
    socket.emitMessage({ type: 'response.text.delta', delta: 'hi' });
    socket.emitMessage({ type: 'response.output_text.delta', delta: ' there' });
    socket.emitMessage({ type: 'response.audio.delta', delta: 'AQID' });
    client.interrupt();
    socket.emitMessage({ type: 'response.done' });

    expect(socket.sentPayloads.find((payload) => payload.type === 'input_audio_buffer.append')).toMatchObject({
      audio: 'AQD+/w==',
    });
    expect(callbacks.onResponseCreated).toHaveBeenCalledOnce();
    expect(callbacks.onUserActivity).toHaveBeenCalledOnce();
    expect(callbacks.onUserTranscript).toHaveBeenCalledWith('hello');
    expect(callbacks.onAssistantDelta).toHaveBeenNthCalledWith(1, 'hi', true);
    expect(callbacks.onAssistantDelta).toHaveBeenNthCalledWith(2, ' there', false);
    expect(callbacks.onAssistantAudio).toHaveBeenCalledWith({
      pcm: new Uint8Array([1, 2, 3]),
      sampleRate: 24000,
      providerLabel: 'Qwen',
    });
    expect(socket.sentPayloads[socket.sentPayloads.length - 1]).toMatchObject({
      type: 'response.cancel',
    });
    expect(callbacks.onResponseDone).toHaveBeenCalledOnce();
  });

  it('waits for an audio frame before appending image frames', () => {
    const socketMessages: Record<string, unknown>[] = [];
    const client = new QwenRealtimeVoiceClient({
      settings: {
        apiKey: 'test-key',
        providerLabel: 'Qwen',
        realtimeUrl: 'wss://example.test/realtime',
        model: 'qwen-realtime',
        defaultVoiceId: 'Cherry',
      },
      instructions: 'test',
      onStatus: vi.fn(),
      onResponseCreated: vi.fn(),
      onUserActivity: vi.fn(),
      onUserTranscript: vi.fn(),
      onAssistantDelta: vi.fn(),
      onAssistantAudio: vi.fn(),
      onResponseDone: vi.fn(),
      onError: vi.fn(),
    });

    const testSocket = {
      send(payload: string) {
        socketMessages.push(JSON.parse(payload) as Record<string, unknown>);
      },
    } as WebSocket;
    const clientInternals = client as unknown as {
      isConnected: boolean;
      socket: WebSocket | null;
    };
    clientInternals.isConnected = true;
    clientInternals.socket = testSocket;

    expect(client.sendImageFrame('data:image/jpeg;base64,abc123')).toBe(true);
    expect(socketMessages).toEqual([]);

    client.sendAudioFrame(new Int16Array([1]));
    expect(client.sendImageFrame('data:image/jpeg;base64,abc123')).toBe(true);
    expect(socketMessages[0]).toMatchObject({
      type: 'input_audio_buffer.append',
    });
    expect(socketMessages[1]).toMatchObject({
      type: 'input_image_buffer.append',
      image: 'abc123',
    });
  });
});

interface FakeWebSocketOptions {
  headers?: Record<string, string>;
}

class FakeWebSocket {
  static instances: FakeWebSocket[] = [];

  readonly sentPayloads: Record<string, unknown>[] = [];
  onopen: (() => void) | null = null;
  onmessage: ((event: { data: string }) => void) | null = null;
  onerror: (() => void) | null = null;
  onclose: (() => void) | null = null;

  constructor(
    readonly url: string,
    readonly protocols?: string | string[],
    readonly options?: FakeWebSocketOptions,
  ) {
    FakeWebSocket.instances.push(this);
  }

  send(payload: string): void {
    this.sentPayloads.push(JSON.parse(payload) as Record<string, unknown>);
  }

  close(): void {
    this.onclose?.();
  }

  emitOpen(): void {
    this.onopen?.();
  }

  emitMessage(message: Record<string, unknown>): void {
    this.onmessage?.({ data: JSON.stringify(message) });
  }
}

function installFakeWebSocket(): void {
  FakeWebSocket.instances = [];
  globalThis.WebSocket = FakeWebSocket as unknown as typeof WebSocket;
}

function requireSingleSocket(): FakeWebSocket {
  const socket = FakeWebSocket.instances[0];

  if (!socket) {
    throw new Error('Expected WebSocket to be constructed');
  }

  return socket;
}

function createClient(
  overrides: Partial<ConstructorParameters<typeof QwenRealtimeVoiceClient>[0]> = {},
): QwenRealtimeVoiceClient {
  return new QwenRealtimeVoiceClient({
    settings: {
      apiKey: 'test-key',
      providerLabel: 'Qwen',
      realtimeUrl: 'wss://example.test/realtime',
      model: 'qwen-realtime',
      defaultVoiceId: 'Cherry',
    },
    instructions: 'test',
    onStatus: vi.fn(),
    onResponseCreated: vi.fn(),
    onUserActivity: vi.fn(),
    onUserTranscript: vi.fn(),
    onAssistantDelta: vi.fn(),
    onAssistantAudio: vi.fn(),
    onResponseDone: vi.fn(),
    onError: vi.fn(),
    ...overrides,
  });
}

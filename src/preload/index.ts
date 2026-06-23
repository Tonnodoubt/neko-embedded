/**
 * index.ts (preload)
 * 通过 contextBridge 暴露受限的 neko IPC：启动/停止会话、上送麦克风帧、订阅音频与状态/转写/情绪事件。
 */
import { contextBridge, ipcRenderer } from 'electron';

type StartResult = { ok: boolean; error?: string };
type Unsubscribe = () => void;

function subscribe(channel: string, handler: (...args: unknown[]) => void): Unsubscribe {
  const listener = (_event: unknown, ...args: unknown[]): void => handler(...args);
  ipcRenderer.on(channel, listener);
  return () => ipcRenderer.removeListener(channel, listener);
}

const nekoBridge = {
  version: '0.1.0',
  start: (): Promise<StartResult> => ipcRenderer.invoke('neko:start'),
  stop: (): void => ipcRenderer.send('neko:stop'),
  sendMicFrame: (frame: Int16Array): void => ipcRenderer.send('neko:mic-frame', frame),
  onStatus: (cb: (message: string) => void): Unsubscribe =>
    subscribe('neko:status', (message) => cb(message as string)),
  onUserTranscript: (cb: (text: string) => void): Unsubscribe =>
    subscribe('neko:transcript', (text) => cb(text as string)),
  onAssistantDelta: (cb: (text: string, isNewMessage: boolean) => void): Unsubscribe =>
    subscribe('neko:assistant-delta', (text, isNewMessage) => cb(text as string, isNewMessage as boolean)),
  onAudio: (cb: (pcm: Uint8Array) => void): Unsubscribe =>
    subscribe('neko:audio', (pcm) => cb(pcm as Uint8Array)),
  onResponseDone: (cb: () => void): Unsubscribe => subscribe('neko:response-done', () => cb()),
  onError: (cb: (error: string) => void): Unsubscribe =>
    subscribe('neko:error', (error) => cb(error as string)),
};

contextBridge.exposeInMainWorld('neko', nekoBridge);

export type NekoBridge = typeof nekoBridge;

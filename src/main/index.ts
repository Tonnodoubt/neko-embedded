/**
 * index.ts (main)
 * Electron 主进程入口：创建窗口；加载 config + 记忆并按需启动 Qwen 实时语音会话（Node 端 WebSocket 可带鉴权头）；
 * 通过 IPC 收渲染层麦克风帧、向渲染层推送音频/状态/转写事件；累积本轮转写，会话结束（退出前）做记忆学习。
 */
import { join } from 'node:path';
import { app, BrowserWindow, ipcMain } from 'electron';
import { loadConfig, type NekoConfig } from './config';
import { VoiceSession } from './voiceSession';
import { MemoryStore } from './memoryStore';
import { learnFromConversation } from './memoryLearner';
import { buildInstructions, composeMemoryContext } from '../core/memory/composeContext';
import { DEFAULT_MASTER_NAME } from '../core/memory/defaultProfile';
import type { ConversationTurn } from '../core/memory/factExtraction';

const isDev = !app.isPackaged;

let mainWindow: BrowserWindow | null = null;
let session: VoiceSession | null = null;

interface LearnContext {
  store: MemoryStore;
  config: NekoConfig;
  lanlanName: string;
  masterName: string;
}

let learnContext: LearnContext | null = null;
let turns: ConversationTurn[] = [];
let isLearning = false;
let isQuitting = false;

function createWindow(): void {
  const window = new BrowserWindow({
    width: 720,
    height: 720,
    backgroundColor: '#0b0b10',
    autoHideMenuBar: true,
    // 上板时改为 fullscreen + kiosk；开发期保持窗口化便于调试。
    fullscreen: false,
    webPreferences: {
      preload: join(__dirname, '../preload/index.mjs'),
      sandbox: false,
    },
  });
  mainWindow = window;

  const rendererUrl = process.env['ELECTRON_RENDERER_URL'];

  if (isDev && rendererUrl) {
    void window.loadURL(rendererUrl);
    window.webContents.openDevTools({ mode: 'detach' });
  } else {
    void window.loadFile(join(__dirname, '../renderer/index.html'));
  }
}

function send(channel: string, ...args: unknown[]): void {
  mainWindow?.webContents.send(channel, ...args);
}

function recordUserTurn(text: string): void {
  turns.push({ role: 'human', content: text });
}

function recordAssistantDelta(text: string, isNewMessage: boolean): void {
  const last = turns[turns.length - 1];
  if (isNewMessage || !last || last.role !== 'ai') {
    turns.push({ role: 'ai', content: text });
  } else {
    last.content += text;
  }
}

/** 把本轮累积的转写交给记忆学习，最多并发一个；学习后清空转写。best-effort。 */
async function flushLearning(): Promise<void> {
  if (isLearning || !learnContext || turns.length === 0) {
    return;
  }

  isLearning = true;
  const context = learnContext;
  const captured = turns;
  turns = [];

  try {
    await learnFromConversation({
      store: context.store,
      assist: context.config.assist,
      turns: captured,
      lanlanName: context.lanlanName,
      masterName: context.masterName,
    });
  } finally {
    isLearning = false;
  }
}

function registerIpc(): void {
  ipcMain.handle('neko:start', async (): Promise<{ ok: boolean; error?: string }> => {
    try {
      if (!session) {
        const config = loadConfig();
        const store = new MemoryStore(config.persona.name);
        const snapshot = store.load();
        const masterName =
          (snapshot.profile.master['档案名'] as string | undefined)?.trim() || DEFAULT_MASTER_NAME;
        const memoryContext = composeMemoryContext(snapshot, config.persona.name, masterName);
        const instructions = buildInstructions(config.persona.systemPrompt, memoryContext);

        learnContext = { store, config, lanlanName: config.persona.name, masterName };
        turns = [];

        session = new VoiceSession(config, instructions, {
          onStatus: (message) => send('neko:status', message),
          onUserTranscript: (text) => {
            recordUserTurn(text);
            send('neko:transcript', text);
          },
          onAssistantDelta: (text, isNewMessage) => {
            recordAssistantDelta(text, isNewMessage);
            send('neko:assistant-delta', text, isNewMessage);
          },
          onAssistantAudio: (pcm) => send('neko:audio', pcm),
          onResponseDone: () => send('neko:response-done'),
          onError: (error) => send('neko:error', error),
        });
      }

      await session.start();
      return { ok: true };
    } catch (error: unknown) {
      session = null;
      return { ok: false, error: error instanceof Error ? error.message : '启动语音会话失败' };
    }
  });

  ipcMain.on('neko:mic-frame', (_event, payload: unknown) => {
    const frame = toInt16Array(payload);
    if (frame) {
      session?.sendFrame(frame);
    }
  });

  ipcMain.on('neko:stop', () => {
    session?.stop();
    session = null;
    void flushLearning();
  });
}

function toInt16Array(payload: unknown): Int16Array | null {
  if (payload instanceof Int16Array) {
    return payload;
  }

  if (payload instanceof ArrayBuffer) {
    return new Int16Array(payload);
  }

  if (ArrayBuffer.isView(payload)) {
    const view = payload as ArrayBufferView;
    return new Int16Array(view.buffer, view.byteOffset, Math.floor(view.byteLength / 2));
  }

  return null;
}

void app.whenReady().then(() => {
  registerIpc();
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

// 退出前把未学习的转写落盘（先拦截退出，学完再真正退出）。
app.on('before-quit', (event) => {
  if (isQuitting || turns.length === 0 || !learnContext) {
    return;
  }

  event.preventDefault();
  isQuitting = true;
  void flushLearning().finally(() => app.quit());
});

app.on('window-all-closed', () => {
  session?.stop();
  session = null;

  if (process.platform !== 'darwin') {
    app.quit();
  }
});

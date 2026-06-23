/**
 * renderer.ts
 * 渲染层入口：首次点击后启动会话——麦克风采集帧上送主进程，主进程回传的 24k 音频排队播放。
 * 表情切换（情绪事件）留待 Phase 4。
 */
import { MicCapture } from './audio/MicCapture';
import { PcmPlayer } from './audio/PcmPlayer';

interface NekoBridge {
  version: string;
  start(): Promise<{ ok: boolean; error?: string }>;
  stop(): void;
  sendMicFrame(frame: Int16Array): void;
  onStatus(cb: (message: string) => void): () => void;
  onUserTranscript(cb: (text: string) => void): () => void;
  onAssistantDelta(cb: (text: string, isNewMessage: boolean) => void): () => void;
  onAudio(cb: (pcm: Uint8Array) => void): () => void;
  onResponseDone(cb: () => void): () => void;
  onError(cb: (error: string) => void): () => void;
}

// YUI 出声后再屏蔽麦克风这么久（秒），盖住喇叭声的声学拖尾，回合制下不影响打断。
const PLAYBACK_ECHO_TAIL_SECONDS = 0.4;

const bridge = (window as unknown as { neko?: NekoBridge }).neko;
const statusEl = document.querySelector<HTMLElement>('#status');

function setStatus(text: string): void {
  if (statusEl) {
    statusEl.textContent = text;
  }
}

if (!bridge) {
  setStatus('桥未就绪');
} else {
  setStatus('点击任意处开始对话');

  const player = new PcmPlayer();
  const mic = new MicCapture();
  let started = false;

  bridge.onStatus((message) => setStatus(message));
  bridge.onError((error) => setStatus(`错误：${error}`));
  bridge.onUserTranscript((text) => setStatus(`你：${text}`));
  bridge.onAudio((pcm) => player.enqueue(pcm instanceof Uint8Array ? pcm : new Uint8Array(pcm)));

  const startSession = async (): Promise<void> => {
    if (started) {
      return;
    }
    started = true;

    setStatus('连接中…');
    const result = await bridge.start();

    if (!result.ok) {
      started = false;
      setStatus(`错误：${result.error ?? '启动失败'}`);
      return;
    }

    try {
      await mic.start((frame) => {
        // 回声门控：YUI 正在出声（含尾巴）时不上送麦克风，避免喇叭声被拾回。
        if (!player.isPlaying(PLAYBACK_ECHO_TAIL_SECONDS)) {
          bridge.sendMicFrame(frame);
        }
      });
      setStatus('在听…说话试试');
    } catch (error: unknown) {
      started = false;
      setStatus(`麦克风启动失败：${error instanceof Error ? error.message : String(error)}`);
    }
  };

  document.addEventListener('pointerdown', () => void startSession());
}

export {};

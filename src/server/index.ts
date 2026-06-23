/**
 * index.ts (server)
 * 翻译层服务器入口（骨架）：起小智 WebSocket 服务，先用 PCM 直通 codec + 占位大脑。
 * 待接：真实 Opus codec（替换 PcmPassthroughCodec）、真实 Omni 大脑（替换 StubVoiceBrain）。
 */
import { startXiaozhiServer } from './xiaozhiServer';
import { PcmPassthroughCodec } from '../core/xiaozhi/audioCodec';
import { StubVoiceBrain } from './stubBrain';

const port = Number(process.env['NEKO_SERVER_PORT'] ?? 8000);

startXiaozhiServer({
  port,
  codecFactory: () => new PcmPassthroughCodec(),
  brainFactory: () => new StubVoiceBrain(),
});

// eslint-disable-next-line no-console
console.log(`[neko-server] 小智协议服务器已启动：ws://0.0.0.0:${port}/`);

/**
 * index.ts (server)
 * 翻译层服务器入口：起小智 WebSocket 服务，接真 Omni 大脑（含记忆注入）。
 * 音频暂用 PCM 直通 codec，待接真实 Opus 编解码后即可对接真小智设备 / py-xiaozhi。
 */
import { startXiaozhiServer } from './xiaozhiServer';
import { PcmPassthroughCodec } from '../core/xiaozhi/audioCodec';
import { OmniVoiceBrain } from './omniBrain';
import { loadConfig } from '../main/config';
import { MemoryStore } from '../main/memoryStore';
import { buildInstructions, composeMemoryContext } from '../core/memory/composeContext';
import { DEFAULT_MASTER_NAME } from '../core/memory/defaultProfile';

const baseDir = process.cwd();
const port = Number(process.env['NEKO_SERVER_PORT'] ?? 8000);
const config = loadConfig(baseDir);

// 每个连接载入一次最新记忆，注入到会话 instructions（身份 + 已知事实 + 近期对话）。
function buildBrain(): OmniVoiceBrain {
  const snapshot = new MemoryStore(baseDir, config.persona.name).load();
  const masterName =
    (snapshot.profile.master['档案名'] as string | undefined)?.trim() || DEFAULT_MASTER_NAME;
  const memoryContext = composeMemoryContext(snapshot, config.persona.name, masterName);
  const instructions = buildInstructions(config.persona.systemPrompt, memoryContext);
  return new OmniVoiceBrain(config.voice, instructions);
}

startXiaozhiServer({
  port,
  codecFactory: () => new PcmPassthroughCodec(),
  brainFactory: buildBrain,
});

// eslint-disable-next-line no-console
console.log(`[neko-server] 小智协议服务器已启动：ws://0.0.0.0:${port}/（音频 codec：PCM 直通，待换 Opus）`);

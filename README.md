# N.E.K.O. Embedded

> **路线已定（2026-06-18）**：走 **Qwen-Omni 实时**路线——与主项目 N.E.K.O.TONG 同源（同一个一体化实时大脑、同一套音色路径、同一个 YUI 灵魂）。短暂考虑过的「小智(xiaozhi)流水线」方案已否决（它是 ASR+LLM+TTS 流水线，与主项目架构不同，无法还原 Omni 的体验）。完整权衡见 [`docs/architecture-decision-omni-vs-xiaozhi.md`](docs/architecture-decision-omni-vs-xiaozhi.md)。
>
> **设备侧（硬件到货后）走「第一档」**：买现成 xiaozhi 兼容 ESP32 板，fork 固件只换唤醒词，协议保持小智那套，由我们的服务器做 xiaozhi↔Omni 翻译（回合制，不要全双工打断）。`xiaozhi-server/` 目录留作设备协议参考，不再作为大脑。

嵌入式语音陪伴设备。从 `N.E.K.O.-Mobile` 抽取实时语音内核，去掉 Live2D/VRM 模型、摄像头、桌面同步、记忆/角色面板，只保留：

- **语音对话**：Qwen Omni 云端实时语音（说话进 → 说话出）
- **内置人格**：单一固定角色（`config.json` 的 `systemPrompt`）
- **表情图片**：按回复情绪全屏切换预设 PNG（无 3D 模型）

## 架构

跑在 Electron 上，三进程分工：

| 进程 | 职责 |
|------|------|
| **main**（Node） | 运行实时语音内核。Node 的 `ws` 能给 WebSocket 带 `Authorization` 头——浏览器做不到，这是选 Electron 的主因。读 `config.json`、安全持有 API key。 |
| **preload** | `contextBridge` 暴露受限 IPC（音频帧、情绪事件）。 |
| **renderer**（Chromium） | 纯 I/O：Web Audio 采集麦克风、播放 24kHz PCM、全屏显示表情图。 |

### 目录

```
src/
├── core/              # 平台无关内核，从 mobile 移植
│   ├── lib/           # base64 / eventId / redact / websocket
│   ├── runtime/       # QwenRealtimeVoiceClient + 回合/回声门控/断句
│   ├── emotion/       # 文本 → 情绪推断（驱动切图）
│   └── settings.ts    # 实时语音连接配置类型
├── main/              # Electron 主进程
├── preload/           # 预加载桥
└── renderer/          # 表情显示 + 音频 I/O
```

## 开发

```bash
npm install
cp config.example.json config.json   # 填入 DashScope API key
npm test          # 内核单测（27 个，node 环境）
npm run dev       # 启动 Electron 窗口
npm run build     # 产出 out/
```

## 目标硬件

代码只依赖 **ARM64 + Debian/Ubuntu 系 Linux + USB 音频**，Pi 4/5 或同级国产板（Orange Pi 5、Radxa Rock 5、RK3566 2GB+ 等）均可。避免依赖板载音频，USB 麦克风+音箱最稳。

## 进度

- [x] Phase 0 脚手架（Electron + TS + vitest，可构建）
- [x] Phase 1 移植内核（27 测试全绿）
- [x] Phase 2 Web Audio 音频层（`src/renderer/audio/`：pcm DSP 已测 / MicCapture 16k 采集 / PcmPlayer 24k 播放）
- [x] Phase 3 主进程实时语音 + IPC + config 加载（main：config 校验 / voiceSession 用 ws 带鉴权头驱动内核 / IPC 收发音频帧与事件；preload 桥；renderer 点击启动接采集+播放）
- [x] Phase M 记忆（移植主项目精简版，承载身份+连续性）
  - [x] 片 A 读侧：记忆存储 + 会话开始注入（`src/core/memory/` 纯函数已测 / `src/main/memoryStore.ts` 落盘 / YUI 角色卡走记忆通道注入）
  - [x] 片 B 写侧：退出前用 assist 模型（默认 qwen-plus，可选覆盖）抽事实 + 压缩近期记忆并落盘；事实去重/排序/截断已测，真实端到端抽取已验证
- [ ] Phase 4 表情 UI（情绪 → PNG）
- [ ] Phase 5 人格固化
- [ ] Phase 6 上板部署（kiosk / 自启 / USB 音频 / 回声消除）

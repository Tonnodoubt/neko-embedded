# 小智↔Omni 翻译层设计（硬件路线第 2 步）

> 目标：写一台服务器，对设备**说小智的 WebSocket 协议**，内部跑我们的 Qwen-Omni 实时大脑 + 记忆。
> 设备侧因此能用现成小智固件（只改唤醒词）。前提见 [`hardware-integration-plan.md`](hardware-integration-plan.md)。
> 协议来源：`78/xiaozhi-esp32` 的 `docs/websocket.md`（实现时以其代码为准）。

## 小智 WebSocket 协议要点（设备↔服务器）

- **握手**：设备连接时带 header `Authorization: Bearer <token>` / `Protocol-Version` / `Device-Id`(MAC) / `Client-Id`(UUID)。
  - 设备发 `hello`：`audio_params = {format: opus, sample_rate: 16000, channels: 1, frame_duration: 60}`，`features: {mcp, aec}`。
  - 服务器回 `hello`：`{type:hello, transport:websocket, session_id, audio_params:{format:opus, sample_rate:24000, ...}}`。10s 内没收到视为失败。
- **音频**：双向都是 **Opus 编码的二进制帧**。设备上行 16kHz、下行 24kHz，帧长 60ms。默认二进制 v1 = 裸 Opus 帧（v2/v3 带时间戳头供 AEC，先不用）。
- **设备→服务器 文本消息**：
  - `listen` `{state: start|stop|detect, mode: auto|manual|realtime}`——开/停麦、唤醒词命中。
  - `abort` `{reason: wake_word_detected}`——打断当前 TTS。
  - `mcp`——IoT 工具调用（JSON-RPC 2.0，先不做）。
- **服务器→设备 文本消息**：
  - `stt` `{text}`——用户语音转写（设备显示）。
  - `llm` `{emotion, text}`——更新表情。
  - `tts` `{state: start|sentence_start|stop, text?}`——start→设备进 speaking 停麦；sentence_start→显字幕；stop→回 listening/idle。
  - `system`/`alert`——重启/提示（可选）。
- **状态机**：Idle→Connecting→Listening→(tts start)→Speaking→(tts stop)→Idle。**回合制**，与我们「不要打断」的取舍天然契合。

## 映射：小智消息 ↔ Omni 内核

| 方向 | 小智侧 | 我们的处理（Omni 内核 `src/core`） |
|---|---|---|
| 上行 | 设备 `hello` | 回 `hello`（24k opus），建立 Omni 会话（注入记忆 instructions） |
| 上行 | `listen state:start` | 允许喂帧（Omni 用 server_vad，可不强依赖） |
| 上行 | Opus 音频帧 | **Opus→PCM16 解码** → `client.sendAudioFrame(Int16Array)` |
| 上行 | `abort` | `client.interrupt()` |
| 下行 | Omni `onUserTranscript` | 发 `stt {text}` |
| 下行 | Omni 助手文本（`avatarEmotion` 推断） | 发 `llm {emotion}` + `tts sentence_start {text}` |
| 下行 | Omni `onResponseCreated`/首个音频 | 发 `tts {state:start}` |
| 下行 | Omni `onAssistantAudio`(PCM 24k) | **PCM16→Opus 编码** → 二进制帧发给设备 |
| 下行 | Omni `onResponseDone` | 发 `tts {state:stop}` |

几乎 1:1。`QwenRealtimeVoiceClient` 的回调正好覆盖小智需要的每种下行消息。

## 复用 vs 新写

- **复用**：`src/core`（Omni 客户端、情绪推断、断句）、记忆机制、人格/配置——全是现成。
- **新写**：
  1. **设备侧 WebSocket 服务器**：用已有依赖 `ws` 起 server，不需新依赖。
  2. **Opus 编解码**：上行解码、下行编码——**唯一的新依赖**（Node opus 绑定，如 `@discordjs/opus` / `opusscript`，需先确认）。
  3. 协议状态机 + 消息路由（hello/listen/tts/stt/llm）。

## 待定 / 风险

- **Opus 库选型**（新依赖，需先问）：原生绑定（`@discordjs/opus`，快、需编译）vs 纯 JS（`opusscript`，免编译、慢）。设备帧 60ms@16k=960 样本、下行 60ms@24k=1440 样本，需按帧切分。
- **音频帧切分**：Omni 吐的 PCM 块大小不固定，要重新切成 60ms 帧再 Opus 编码。
- **MCP / IoT 工具**：先不做。
- **鉴权**：自托管可先忽略 token 校验（或固定 token）。
- **二进制协议**：先做 v1（裸 Opus）。

## 验证（不用硬件）

用 [py-xiaozhi](https://github.com/huangjunsen0406/py-xiaozhi) 当假设备连本服务器，完整对话一轮，验证握手 + Opus 编解码 + 回合制 Omni。通过即证明「B + 第一档」走得通。

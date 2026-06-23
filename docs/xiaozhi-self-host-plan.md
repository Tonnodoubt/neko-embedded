> **⛔ 已否决（2026-06-18）**：本方案（小智 ASR+LLM+TTS 流水线当大脑）经权衡后放弃，改走与主项目同源的 Qwen-Omni 实时路线。原因见 [`architecture-decision-omni-vs-xiaozhi.md`](architecture-decision-omni-vs-xiaozhi.md)。
> 下文保留作历史记录与**设备协议参考**——将来设备侧第一档方案仍会复用 xiaozhi 固件/协议（但服务器换成 Omni 翻译层，而非本文的流水线服务器）。

# 小智自托管「大脑」落地计划（硬件无关，先跑起来）

> 目标：在 ESP32 硬件未定之前，**先在自己电脑/服务器上把小智的真服务器跑起来**，配上 Qwen + 我们的人格 + 音色，用现成 PC 客户端当「假设备」对话调试。这台服务器就是将来 ESP32 要连的同一台，**零返工**。

## 架构

```
PC 客户端(py-xiaozhi，当"假设备")           将来：ESP32 设备(fork 小智固件)
        │  Opus / WebSocket                          │  同一个协议、同一个地址
        ▼                                             ▼
   ┌─────────────────────────────────────────────────────────┐
   │  你自托管的 xiaozhi-esp32-server (docker)                 │
   │   VAD(SileroVAD) → ASR(SenseVoice本地) → LLM(Qwen)        │
   │                          → TTS → 情绪标签                 │
   │   人格 prompt / 记忆 / function_call 工具 都在这里         │
   └─────────────────────────────────────────────────────────┘
```

要点：小智不是设备直连大模型，而是**设备↔你的服务器↔(ASR+LLM+TTS 三件套)**。情绪由 **LLM 主动吐标签**，客户端/设备照标签显示表情。我们之前 TS 那套「直连 Qwen 实时」是另一条路，这里不用了（见文末「旧代码处置」）。

## 仓库

| 用途 | 仓库 |
|------|------|
| 服务器（自托管，本计划核心） | [xinnan-tech/xiaozhi-esp32-server](https://github.com/xinnan-tech/xiaozhi-esp32-server) |
| PC 客户端（当"假设备"，跨平台 Win/mac/Linux） | [huangjunsen0406/py-xiaozhi](https://github.com/huangjunsen0406/py-xiaozhi) |
| 设备固件（将来 ESP32 用，先了解） | [78/xiaozhi-esp32](https://github.com/78/xiaozhi-esp32) |

---

## 第一步：跑起服务器（Docker）

按官方 `docs/Deployment.md`，目录结构：

```
xiaozhi-server/
├─ docker-compose.yml          # 从仓库下载
├─ data/
│  └─ .config.yaml             # 你的配置（见第二步）
└─ models/
   └─ SenseVoiceSmall/
      └─ model.pt              # 本地语音识别模型，需单独下载
```

启动 & 看日志：

```bash
docker compose up -d
docker logs -f xiaozhi-esp32-server
```

起来后的服务：
- **WebSocket**（设备/客户端连这里）：`ws://你的IP:8000/xiaozhi/v1/`
- **OTA**（设备激活/升级，自托管就指向这里，避开小智官方云）：`http://你的IP:8003/xiaozhi/ota/`
- **Web 管理面板**：单独的 `xiaozhi-esp32-server-web` 服务，浏览器里配人格/音色/查对话记录

> 以仓库 `docs/Deployment.md` 为准，版本会变。

---

## 第二步：配 Qwen + 人格 + 音色（`data/.config.yaml`）

### LLM 用 Qwen（DashScope OpenAI 兼容接口）

```yaml
AliLLM:
  type: openai
  base_url: https://dashscope.aliyuncs.com/compatible-mode/v1
  model_name: qwen-plus        # 也可 qwen-max / qwen-turbo / qwen-flash
  api_key: 你的DashScope_API_KEY
  temperature: 0.7
  max_tokens: 500
```

### 音色（TTS）

可选项含 `AliyunStreamTTS`（阿里云流式，和我们之前 CosyVoice 同生态，能接自定义音色）、`EdgeTTS`（免费、零配置，先验证用它最省事）、`DoubaoTTS`、`OpenAITTS` 等。每个有自己的配置块（`type` / `voice` / 凭证）。

### 人格（我们的「魂」）

```yaml
prompt: |
  在这里写我们自己的人格设定（性格、说话风格、边界）。
  可以直接搬 NEKO-Mobile 里 defaultLocalCharacterSystemPrompt 那段。
```

### 选用模块（把上面选中）

```yaml
selected_module:
  VAD: SileroVAD
  ASR: FunASR            # SenseVoice 本地识别
  LLM: AliLLM            # ← 切成 Qwen
  TTS: EdgeTTS           # ← 先 EdgeTTS 验证，再换 AliyunStreamTTS
  Memory: nomem          # 想要长期记忆改成对应 memory 模块
  Intent: function_call  # 支持工具/IoT 调用
```

ASR 块（确认本地模型路径）：

```yaml
ASR:
  FunASR:
    type: fun_local
    model_dir: models/SenseVoiceSmall
    output_dir: tmp/
```

---

## 第三步：用 PC 客户端当「假设备」对话

装 [py-xiaozhi](https://github.com/huangjunsen0406/py-xiaozhi)，把它的服务器地址指到你的 `ws://你的IP:8000/xiaozhi/v1/`，就能在电脑上对着你的服务器说话——**完全不需要 ESP32**。它跨平台、有 GUI、自带表情/emoji 显示，正好验证「人格 + Qwen + 音色 + 表情」的整体体验。

---

## 我们的「想法」插在哪（关键：基本不碰 C/固件）

| 想法 | 插入点 | 难度 |
|------|--------|------|
| 人格 / 性格 / 说话风格 | 服务器 `prompt`（或 Web 面板里的角色） | 改文字 |
| 用 Qwen 当大脑 | 服务器 `AliLLM` + `selected_module.LLM` | 改配置 |
| 音色 | 服务器 TTS 模块（`AliyunStreamTTS` 等） | 改配置 |
| 长期记忆 | 服务器 `Memory` 模块 | 改配置/选型 |
| 自定义动作 / IoT / 工具 | 服务器 `Intent: function_call` + 自写函数 | 写 Python 函数 |
| 自定义表情图 | PC 客户端 / 将来 ESP32 固件 UI（按情绪标签换图） | 改客户端/固件 |

**情绪→表情机制**：LLM 在回复里带情绪标签 → 客户端/设备照标签显示对应表情。所以「哪种情绪配哪张图」的映射设计能复用，但具体显示在客户端/固件侧实现。

---

## 迁移到 ESP32（将来，零返工）

硬件定了之后：
1. **服务器原样不动**——人格、Qwen、音色、记忆、工具全是生产配置。
2. ESP32 烧 fork 的小智固件，把服务器地址指到**同一个** `ws://你的IP:8000/xiaozhi/v1/`、OTA 指到你的 `8003`。
3. 自定义表情图从 PC 客户端那边的设计搬到固件 UI。

也就是说，现在在 PC 上调的一切，硬件到货后只是「换个壳连同一个大脑」。

---

## 待办 / 验收

- [x] 脚手架就位：`xiaozhi-server/`（docker-compose + data/.config.yaml + models 目录），见该目录 README
- [ ] 服务器 docker 跑通，日志无报错，端口 8000/8003 可访问
- [~] `.config.yaml` 已切 Qwen（`AliLLM`）+ 人格 prompt，**待填真实 DashScope key**
- [x] SenseVoice `model.pt` 下载到位（936MB，已校验为有效模型）
- [ ] PC 客户端连上，能完整对话一轮（听懂→Qwen 回复→出声）
- [ ] TTS 从 EdgeTTS 切到目标音色（AliyunStreamTTS / 自定义）
- [ ] 跑通情绪→表情显示
- [ ] （可选）记忆 / function_call 工具按需求接入

## 风险 / 注意

- **SenseVoice 模型**要单独下载放对路径，漏了 ASR 起不来。
- **DashScope key** 别提交进仓库（已在 `.gitignore` 排除 `config.json`，注意 `.config.yaml` 也别提交）。
- **回声/抢话**：PC 客户端侧靠 AEC；将来 ESP32 选带麦阵列的板子（如 S3-BOX-3）硬件解决。
- **TTS 选型**：EdgeTTS 免费先验证；要我们自己的音色走 AliyunStreamTTS 接 CosyVoice 那套。
- 端口/内网穿透：本机自测用局域网 IP 即可；远程设备要公网或内网穿透。

---

## 关于 NEKO-Embedded 里的旧 TS 代码

`src/core`（移植的 Qwen 实时语音内核）+ `src/main|preload|renderer`（Electron 脚手架）是上一版「直连 Qwen 实时」方案的产物。走小智这条路后**暂时用不到**，先保留不删（沉没成本不大，且 27 个测试还能当 Qwen 协议参考）。需要的话可以挪到 `legacy/` 或清掉——等你发话再处理。

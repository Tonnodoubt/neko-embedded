# CLAUDE.md — N.E.K.O. Embedded

嵌入式语音陪伴设备。把主项目 **N.E.K.O.TONG** 的「灵魂」搬到一台便宜的硬件上：语音对话 + 内置人格 + 表情图，去掉桌面端的模型/摄像头/面板。

## 头条原则：新功能先看主项目怎么做

**写任何新功能前，先去主项目 `../N.E.K.O.TONG` 看它是怎么实现的，向它靠拢，不要自己另起炉灶。**

N.E.K.O.TONG 是这套产品的本体与「灵魂」来源（模型选型、人格 prompt、音色、记忆、情绪机制都在那里有成熟实现）。本项目是它的嵌入式精简分身，**架构和取舍应与主项目一致**，除非有嵌入式特有的硬约束（无屏交互、USB 音频、ARM Linux、设备无记忆通道等）才偏离，且偏离要在代码或 docs 里写明原因。

动手前的固定动作：

1. 先在主项目里定位对应实现，常用入口：
   - 模型 / 音色 / 各档 provider：`../N.E.K.O.TONG/config/api_providers.json`
   - 人格 prompt（灵魂框架 + 本地化）：`../N.E.K.O.TONG/config/prompts/prompts_chara.py`、`utils/persona_presets.py`
   - 默认角色（YUI 猫娘设定、voice_id）：`../N.E.K.O.TONG/config/characters/zh-CN.json`
   - 实时语音 / 回合协调：`../N.E.K.O.TONG/main_logic/`
   - 记忆：`../N.E.K.O.TONG/memory/`、`memory_server`
2. 能移植就移植、能对齐配置就对齐，别凭记忆或文档臆造模型名/字段。
3. 与主项目的差异（裁剪了什么、为什么）要落到注释或 `docs/`。

## 已定架构（2026-06-18）

走 **Qwen-Omni 实时**路线，与主项目同源（一体化实时大脑 + 同套音色路径 + 同一个 YUI 灵魂）。短暂考虑过的「小智 xiaozhi 流水线」已否决。完整权衡见 [`docs/architecture-decision-omni-vs-xiaozhi.md`](docs/architecture-decision-omni-vs-xiaozhi.md)。

- 大脑：`src/core` 从主项目移植的 Qwen-Omni 实时内核（`QwenRealtimeVoiceClient` 等）。
- 设备侧（硬件到货后）：第一档——现成 xiaozhi 兼容板 + fork 固件只换唤醒词 + 服务器做 xiaozhi↔Omni 翻译（回合制）。
- 音频契约：输入 16kHz PCM16、输出 24kHz PCM16 LE（见 `src/renderer/audio/`）。

## 人格 / 灵魂（重要：与主项目对齐）

- 设备人格 = 主项目 YUI，prompt 由 `prompts_chara` 渲染（`config.json` 的 `persona.systemPrompt`）。
- 主项目刻意**把角色卡（猫娘/本喵/傲娇）留在记忆通道、不放进 system prompt**，以维持「她是真人、无设定」的框架。
- 因此本项目的正解是**移植主项目的记忆机制**来承载身份与连续性，而不是把角色卡硬塞进 prompt。记忆 Phase 落地前，YUI 会偏「素」——这是对齐主项目的代价，记忆补上后即恢复。

## 开发约定

- 内核（`src/core`）平台无关、纯函数优先、带 vitest 单测；新增 DSP/协议逻辑要补测。
- 不引新依赖前先问（当前仅 `ws`）。
- `config.json` 含 key，已 gitignore，勿提交。
- 验证顺序：`npm run type-check` → `npm test` → `npm run build` →（出声）`npm run dev`。

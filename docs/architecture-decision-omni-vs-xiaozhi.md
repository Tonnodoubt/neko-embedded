# 架构岔路调研：Qwen-Omni 实时 vs xiaozhi 流水线（2026-06-18）

> 背景：搭 xiaozhi 服务器配置时发现，主项目 **N.E.K.O.TONG 的灵魂走的根本不是 xiaozhi 那套**。
> 决策前先把两条路的优劣调研清楚。结论见文末。

## 主项目（N.E.K.O.TONG）实际怎么做的

来源：`N.E.K.O.TONG/config/api_providers.json`、`config/prompts/prompts_chara.py`、`config/characters/zh-CN.json`。

- **大脑**：Qwen-Omni **实时**模型 `qwen3-omni-flash-realtime`，走 `wss://dashscope.aliyuncs.com/api-ws/v1/realtime`。说话进、说话出，一体化，不拆 ASR/LLM/TTS。
- **音色**：CosyVoice 克隆（`cosyvoice-v3.5-plus`）。默认角色 YUI 音色 = `voice-tone-RcH2svtsrw`，但这是**免费路（lanlan.tech 赞助）上的共享音色**，不是自有资产。
- **辅助模型**（总结/纠错/情绪/视觉/Agent）：`qwen3.7-plus` / `qwen3.6-flash` 等，走 DashScope OpenAI 兼容接口。
- **灵魂 prompt**：`_LANLAN_PROMPT_TEMPLATE`（英文骨架 + 中文本地化片段），运行时只填 `{LANLAN_NAME}`→`YUI`、`{MASTER_NAME}`→`碳基生物`。角色卡（猫娘/本喵/核心特质/台词）走记忆/UI 另一条通道，**不在发给模型的 system prompt 里**。

## 关键事实

1. **xiaozhi-esp32-server 没有 Omni/一体化实时**。架构铁打的 VAD→ASR→**文本 LLM**→TTS 流水线；配置里的 "realtime" 只指流式 ASR。
2. **被搁置的 `src/core`（约 1530 行 TS、27 测试全绿）就是从主项目移植的 Qwen-Omni 实时内核** —— `QwenRealtimeVoiceClient` / `RealtimeVoiceController` / 回合协调 / 断句 / 情绪推断(`avatarEmotion`)。也就是说**主项目的灵魂和我们扔掉的旧代码同源，跟 xiaozhi 反而是两条路**。
3. **音色殊途同归**：想还原 YUI 真实音色，无论哪条路都得在自己的 DashScope 百炼账号上做一次「声音复刻」拿到自有 voice_id。

## 对比

| 维度 | Qwen-Omni 实时（选项 B，同主项目） | xiaozhi 流水线（选项 A） |
|------|-----------------------------------|--------------------------|
| 与主项目灵魂一致性 | ✅ 完全同源（同模型、同音色路径、同 prompt） | ⚠️ 近似：LLM 换 qwen3.7-plus、TTS 换百炼 CosyVoice，但仍是拆开的流水线 |
| 对话延迟/自然度 | ✅ 一体化、低延迟、原生韵律与情绪 | ⚠️ ASR→LLM→TTS 三段串联，延迟更高、情绪靠 LLM 吐标签再合成 |
| 大脑端开发量 | ✅ 内核已移植测好（src/core） | ✅ 服务器现成 docker，零代码 |
| PC 端开发量（先调人格/音色/表情） | ⚠️ 要补 Web Audio I/O（Phase 2-4，原计划本来就要做） | ✅ 装现成 py-xiaozhi 客户端即可 |
| 音色 = YUI 真实音色 | 需自建 CosyVoice 克隆（已接好克隆链路） | 需自建 CosyVoice 克隆（用百炼 CosyVoice TTS 模块） |
| 情绪→表情切图 | ✅ `avatarEmotion` 已实现文本→情绪 | ✅ LLM 吐情绪标签，客户端照标签换图 |
| 上 ESP32 | ⚠️ 设备↔服务器音频链路要自己接（固件自写或 fork） | ✅ 现成小智固件生态，烧录连服务器即可 |
| 成本 | DashScope Omni + CosyVoice 用量 | DashScope LLM + CosyVoice 用量（多一段 ASR：本地 SenseVoice 免费 / 云端流式约 ¥0.3/分钟） |

## xiaozhi 唯一的硬优势

**ESP32 设备侧现成**：买一块小智兼容板，烧官方固件，改个服务器地址就能连，不用写固件。Omni 路在设备侧要自己接音频链路。

## 推荐

**目前阶段（先在 PC 上调人格/音色/表情，硬件未定）→ 走 Omni 实时（选项 B）更合理：**

1. 体验保真——和主项目一模一样的大脑与音色路径，不打折扣。
2. 复用——实时内核已移植测好，PC 端只差音频 I/O，而那本来就是 NEKO-Embedded 搁置前的原计划。
3. PC 阶段根本不需要 ESP32，xiaozhi 的设备生态优势此刻用不上。

**只有当「省掉 ESP32 固件开发、直接买现成小智板」成为压倒性优先级时，选项 A（xiaozhi）才更划算** —— 但代价是把流水线架构强加到设备端，且体验与主项目有差。

## 结论（2026-06-18 已定）：选 B

走 **Qwen-Omni 实时**，与主项目同源。理由：体验保真、复用已移植的 `src/core` 内核、与主项目灵魂一致；用户接受**回合制、不要全双工打断**，因此设备侧的协议翻译方案（见下）无暗坑。

### 设备侧方案：第一档（硬件到货后落地）

唤醒词住在设备固件里（ESP-SR / WakeNet），换它**必须改固件重烧**，且这一步选 A 选 B 都躲不掉——所以"现成固件一字不改"从来不在选项内。三档中取**第一档**：

1. 买现成 xiaozhi 兼容 ESP32 板（70+ 块成品板，不焊电路）。
2. fork 固件，**只换唤醒词**（menuconfig 拼音配置，或训练 WakeNet 模型；也可改用按键说话省掉唤醒词），其余固件不动。
3. 协议保持小智那套，由**我们的服务器做 xiaozhi↔Omni 翻译**：设备说小智的话，服务器把每一轮（回合制）喂给 Qwen-Omni，拿回音频再下发。复杂度留在服务器（易调），不在嵌入式 C（难调）。

### 音色

无论哪条路，YUI 真实音色都要在自有 DashScope 百炼账号上做一次 **CosyVoice 声音复刻**拿到自有 voice_id。PC 阶段先用 Omni 内置音色（如 Chelsie）跑通，复刻押后。

### 落地动作

- 保留 `src/core`，推进 Phase 2-4（Web Audio → 主进程接 Omni → 表情 UI）。
- `config.json` 走 Omni 形态（`persona.systemPrompt` = 渲染好的 YUI 框架 prompt，已裁掉设备没有的 Visual/Avatar/Memory 三行；`voice.model` = `qwen3-omni-flash-realtime`）。
- `xiaozhi-server/` 封存为**设备协议参考**，不再作为大脑；`docs/xiaozhi-self-host-plan.md` 标记为已否决方案。

### 人格保真（2026-06-18 已定：向主项目靠拢）

主项目刻意把角色卡（猫娘/本喵/傲娇）留在**记忆通道**、不放进 system prompt，以维持"她是真人、没有设定"的框架。**本项目对齐主项目：不把角色卡硬塞进 prompt。** 因此记忆 Phase 落地前 YUI 会偏「素」——这是对齐的代价。正解是**移植主项目的记忆机制**来承载身份与连续性，记忆补上后猫娘味自然恢复。原则见根目录 `CLAUDE.md`。

# 端到端测试：py-xiaozhi 假设备 ↔ 翻译层服务器（无需硬件）

> 目标：用 [py-xiaozhi](https://github.com/huangjunsen0406/py-xiaozhi)（PC 软件假设备）连我们的翻译层服务器，
> 对电脑说话验证「听懂 → Omni(YUI+记忆) → 回话」整条链路。**不烧固件、不需要 ESP32。**
> 接入方式据 py-xiaozhi 源码（`src/protocols/websocket_protocol.py`、`src/utils/config_manager.py`、`main.py`）确认。

## 关键事实（源码确认）

- py-xiaozhi 的 `WebSocketProtocol` **直接读配置 `SYSTEM_OPTIONS.NETWORK.WEBSOCKET_URL`** 连接，带头 `Authorization: Bearer <token>` / `Protocol-Version: 1` / `Device-Id: <mac>`，发 client hello 后等服务器 hello（10s 超时）。
- `main.py --skip-activation` **跳过 OTA/激活**，直接用预设 `WEBSOCKET_URL`。正是我们要的（我们没实现 OTA）。
- 鉴权 token 我们服务器不校验，随便填。
- 音频：输入 16kHz opus（对齐我们解码器）；**py-xiaozhi 默认帧长 20ms，我们服务器下行 60ms**——Opus 包自描述时长、解码端自适应，理论上不影响；若回放卡顿，把服务器输出帧长改 20ms（见末尾）。
- 配置文件：首次运行自动生成于 `get_user_data_dir()/config/config.json`（macOS 约 `~/Library/Application Support/.../config/config.json`，启动日志会打印绝对路径）。

## 步骤

### 1. 起我们的服务器

```bash
cd NEKO-Embedded
npm run server          # 默认 ws://0.0.0.0:8000/，可 NEKO_SERVER_PORT=8123 改端口
```

记下本机局域网 IP（`ipconfig getifaddr en0`）或用 `localhost`。

### 2. 装 py-xiaozhi（已在本机完成，记录步骤备查）

克隆在 `../py-xiaozhi`。环境用 `uv`，macOS 还需两个系统库：

```bash
brew install portaudio opus            # sounddevice / opuslib 的系统依赖
cd ../py-xiaozhi
uv sync --python 3.12                  # 仅 CLI 依赖；要 GUI 加 --extra gui（PySide6，较大）
```

**macOS 关键坑**：opuslib 用 `find_library('opus')` 找不到 Homebrew 的库，运行时必须带
`DYLD_FALLBACK_LIBRARY_PATH=/opt/homebrew/lib`（见第 4 步），否则报 “Could not find Opus library”。

### 3. 配置指向我们的服务器（已设好）

配置文件在 `~/Library/Application Support/py-xiaozhi/config/config.json`，已设：
`SYSTEM_OPTIONS.NETWORK.WEBSOCKET_URL = ws://localhost:8000/`、`WEBSOCKET_ACCESS_TOKEN = test`。
重设命令（如需改端口）：

```bash
cd ../py-xiaozhi
DYLD_FALLBACK_LIBRARY_PATH=/opt/homebrew/lib uv run python -c "
from src.utils.config_manager import ConfigManager
cm = ConfigManager.get_instance()
cm.update_config('SYSTEM_OPTIONS.NETWORK.WEBSOCKET_URL', 'ws://localhost:8000/')
cm.update_config('SYSTEM_OPTIONS.NETWORK.WEBSOCKET_ACCESS_TOKEN', 'test')"
```

### 4. 跳过激活、CLI 模式连服务器对话

```bash
cd ../py-xiaozhi
DYLD_FALLBACK_LIBRARY_PATH=/opt/homebrew/lib uv run python main.py --mode cli --protocol websocket --skip-activation
```

到 `状态: 待命  输入:` 后，**输入 `r` 回车开始对话**（连服务器+开麦），对电脑说话，再 `r` 停。
（CLI 命令：`r` 开始/停止、`x` 打断、`q` 退出、`h` 帮助。首次开麦 macOS 会弹麦克风授权。）
预期：转写出现 → YUI 用 Chelsie 音色回话。GUI 模式则需 `--extra gui` 且 `--mode gui`。

## 排障对照

| 现象 | 可能原因 |
|------|----------|
| 客户端「连接超时」 | 服务器没起 / IP 端口不对 / 防火墙 |
| 连上但无回话 | Omni 未连上（看服务器日志报错）/ DashScope key 失效 |
| 回放卡顿、电音 | 帧长不匹配——把服务器输出改 20ms |
| 听不懂中文 | Omni 输入音频异常（Opus 解码问题） |

### 把服务器输出帧长改 20ms（若需要）

`src/core/xiaozhi/protocol.ts` 的 `SERVER_OUTPUT_AUDIO.frame_duration` 改 20，
`src/server/opusCodec.ts` 的 `FRAME_DURATION_MS` 改 20（→ 每帧 480 样本）。

# 小智自托管服务器（⛔ 已封存为设备协议参考）

> **2026-06-18 起不再作为大脑。** 项目改走 Qwen-Omni 实时（见 [`../docs/architecture-decision-omni-vs-xiaozhi.md`](../docs/architecture-decision-omni-vs-xiaozhi.md)）。
> 本目录保留用于将来研究 xiaozhi 设备↔服务器协议（设备侧第一档方案要 fork 固件并让我们的服务器翻译 xiaozhi↔Omni）。`data/.config.yaml` 里的 LLM/TTS 配置是早期占位，已作废，勿参考。
> `models/SenseVoiceSmall/model.pt`（936MB）当前用不到，需要回收磁盘可删。

---


单模块 docker 部署：VAD + ASR(本地 SenseVoice) + LLM(Qwen) + TTS。设备/客户端连这台，配置见 [`../docs/xiaozhi-self-host-plan.md`](../docs/xiaozhi-self-host-plan.md)。

## 目录

```
xiaozhi-server/
├─ docker-compose.yml              # 官方单模块编排（ghcr 镜像）
├─ data/
│  ├─ .config.yaml.example         # 覆盖配置模板（入库）
│  └─ .config.yaml                 # 真实配置含 key（已 gitignore）
└─ models/SenseVoiceSmall/model.pt # 本地 ASR 模型（~900MB，已 gitignore，单独下载）
```

`.config.yaml` 只写**差异**，其余继承镜像内置默认配置。

## 起步

```bash
# 1. 填 key：编辑 data/.config.yaml，把 api_key 换成真实 DashScope key
# 2. 确认 model.pt 已下载到 models/SenseVoiceSmall/
ls -lh models/SenseVoiceSmall/model.pt

# 3. 启动 + 看日志
docker compose up -d
docker logs -f xiaozhi-esp32-server
```

起来后：
- WebSocket（客户端/设备连这里）：`ws://192.168.77.48:8000/xiaozhi/v1/`
- OTA（设备激活/升级）：`http://192.168.77.48:8003/xiaozhi/ota/`

## 模型手动下载（若后台任务失败）

```bash
curl -fL https://modelscope.cn/models/iic/SenseVoiceSmall/resolve/master/model.pt \
  -o models/SenseVoiceSmall/model.pt
```

## 下一步

PC 客户端 [py-xiaozhi](https://github.com/huangjunsen0406/py-xiaozhi) 当假设备，地址指向上面的 ws，完整对话一轮验证「人格 + Qwen + 音色」。

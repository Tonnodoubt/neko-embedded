/**
 * settings.ts
 * 实时语音连接配置类型。从 mobile 端 localRuntimeSettings 抽取精简而来，只保留嵌入式版用到的 Qwen Omni 实时语音连接参数。
 */

export interface QwenRealtimeVoiceConnectionSettings {
  apiKey: string;
  providerLabel: string;
  realtimeUrl: string;
  model: string;
  defaultVoiceId: string;
}

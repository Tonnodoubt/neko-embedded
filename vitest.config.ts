/**
 * vitest.config.ts
 * 单元测试配置。核心逻辑（实时语音协议、情绪推断、断句）跑在 node 环境，不依赖 Electron。
 */
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});

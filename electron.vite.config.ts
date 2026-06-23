/**
 * electron.vite.config.ts
 * Electron 三进程（main / preload / renderer）构建配置。采用 electron-vite 约定式入口。
 */
import { defineConfig } from 'electron-vite';

export default defineConfig({
  main: {},
  preload: {},
  renderer: {},
});

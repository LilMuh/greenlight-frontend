/// <reference types="vitest/config" />
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";

// 两个页面 = 两个构建入口（MPA），页间跳转保持整页 <a href>。
// base 用相对路径：GitHub Pages 挂在 /greenlight-frontend/ 子路径下，不硬编码仓库名。
export default defineConfig({
  base: "./",
  plugins: [react()],
  build: {
    rollupOptions: {
      input: {
        index: fileURLToPath(new URL("./index.html", import.meta.url)),
        config: fileURLToPath(new URL("./config.html", import.meta.url)),
      },
    },
  },
  test: {
    environment: "node",
  },
});

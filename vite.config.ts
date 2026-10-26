/// <reference types="vitest/config" />
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";

// 两个页面对应两个构建入口（MPA）。页面之间用整页 <a href> 跳转。
// base 用相对路径，不硬编码仓库名。
// 原因：GitHub Pages 把站点挂在 /greenlight-frontend/ 子路径下。
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

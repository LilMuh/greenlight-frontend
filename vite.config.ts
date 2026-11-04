/// <reference types="vitest/config" />
import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";

// 给入口 module script 补 blocking="render"：浏览器在这个脚本执行完之前不画第一帧。
// 配合三个 main.tsx 里 flushSync 做的首次渲染，新页面的第一帧就带头部（切页不见空白帧）。
// 为什么不是别的办法：
// - rel=expect：它只认解析器插入的元素，而且解析一结束就自动解除阻塞，React 渲染出来的头部永远不算。
// - 在 HTML 里放静态头部壳：三份 HTML 要各复制一份头部，账号区和 Auto Booking 标签又依赖用户，
//   静态壳与 React 版本必然对不上，替换时会跳。
// 为什么要插件：Vite 构建时会删掉源 HTML 里的入口 script，重新注入只有 type / crossorigin / src 的 script，
// 自定义属性（blocking）会丢；注入发生在 order: "post" 钩子之前，所以 post 钩子能看到注入后的 script。
// 开发模式也生效（顺带给 @vite/client 补上，无害）。
const renderBlockingEntry: Plugin = {
  name: "gl-render-blocking-entry",
  transformIndexHtml: {
    order: "post",
    handler(html) {
      return html.replace(/<script type="module"(?![^>]*\bblocking=)/g, '<script type="module" blocking="render"');
    },
  },
};

// 三个页面对应三个构建入口（MPA）。页面之间用整页 <a href> 跳转。
// base 用相对路径，不硬编码仓库名。
// 原因：GitHub Pages 把站点挂在 /greenlight-frontend/ 子路径下。
export default defineConfig({
  base: "./",
  plugins: [react(), renderBlockingEntry],
  build: {
    rollupOptions: {
      input: {
        index: fileURLToPath(new URL("./index.html", import.meta.url)),
        config: fileURLToPath(new URL("./config.html", import.meta.url)),
        booking: fileURLToPath(new URL("./booking.html", import.meta.url)),
      },
    },
  },
  test: {
    environment: "node",
  },
});

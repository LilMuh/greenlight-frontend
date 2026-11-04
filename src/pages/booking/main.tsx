import { flushSync } from "react-dom";
import { createRoot } from "react-dom/client";
import { reloadIfSessionChangedOnActivation } from "../../prerenderGuard";
import { App } from "./App";
// 视觉底座（wa-* 类名与配色）直接复用 config 页的样式表，本页只在 styles.css 里补少量样式。
import "../config/styles.css";
import "./styles.css";

// 不包 StrictMode：开发模式下它会把挂载 effect 跑两遍，init 的请求和 offline toast 会重复。

// 被预渲染的页面激活时，如果会话令牌变了（中途登出或换账号）就整页重载
reloadIfSessionChangedOnActivation();

const root = createRoot(document.getElementById("app")!);
// 首次渲染同步提交：入口 script 带 blocking="render"，渲染解除阻塞时头部已在 DOM 里（详见 vite.config.ts）
flushSync(() => root.render(<App />));

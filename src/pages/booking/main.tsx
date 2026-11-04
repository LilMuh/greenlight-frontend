import { createRoot } from "react-dom/client";
import { App } from "./App";
// 视觉底座（wa-* 类名与配色）直接复用 config 页的样式表，本页只在 styles.css 里补少量样式。
import "../config/styles.css";
import "./styles.css";

// 不包 StrictMode：开发模式下它会把挂载 effect 跑两遍，init 的请求和 offline toast 会重复。
createRoot(document.getElementById("app")!).render(<App />);

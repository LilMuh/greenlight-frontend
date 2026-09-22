import { createRoot } from "react-dom/client";
import { App } from "./App";
import "./styles.css";

// 不包 StrictMode：开发模式下它会把挂载 effect 跑两遍，init 的请求和失败 toast 会重复。
createRoot(document.getElementById("app")!).render(<App />);

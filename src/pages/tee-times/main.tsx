import { createRoot } from "react-dom/client";
import { App } from "./App";
import "./styles.css";

// 不包 StrictMode：它在开发模式下会把挂载 effect 跑两遍，init 的请求和失败 toast
// 会重复，和旧页行为对不上。等价迁移期间先保持一致。
createRoot(document.getElementById("app")!).render(<App />);

import { createRoot } from "react-dom/client";
import { App } from "./App";
import "./styles.css";

// 不包 StrictMode：开发模式下挂载 effect 会跑两遍，init 的请求和 offline toast
// 会重复，和旧页行为对不上（同 tee-times 页的理由）。
createRoot(document.getElementById("app")!).render(<App />);

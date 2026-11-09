import { flushSync } from "react-dom";
import { createRoot } from "react-dom/client";
import { reloadIfSessionChangedOnActivation } from "../../prerenderGuard";
import { App } from "./App";
import { takeGoogleReturn } from "./googleRedirect";
import "./styles.css";

// 不包 StrictMode。
// 原因：开发模式下，StrictMode 会把挂载 effect 运行两次，init 的请求和 offline toast 会重复。

// 被预渲染的页面激活时，如果会话令牌变了（中途登出或换账号）就整页重载
reloadIfSessionChangedOnActivation();

// 处理 Google 整页回跳：fragment（里面有 id_token）在首次渲染前就清掉，不留在地址栏和历史记录里。
// 预渲染期间跳过：预渲染页只来自头部标签的普通链接，URL 不会带 Google 回跳参数；
// Google 回跳一定是普通的顶层导航。这样一次性的 pending 也不会被一个用户可能永远看不到的页面消耗掉。
const prerendering = (document as { prerendering?: boolean }).prerendering === true;
const googleReturn = prerendering ? null : takeGoogleReturn();

const root = createRoot(document.getElementById("app")!);
// 首次渲染同步提交：入口 script 带 blocking="render"，渲染解除阻塞时头部已在 DOM 里（详见 vite.config.ts）
flushSync(() => root.render(<App googleReturn={googleReturn} />));

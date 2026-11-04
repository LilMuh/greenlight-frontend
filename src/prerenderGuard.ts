// 预渲染页被激活时的会话校验。
// 背景：头部标签用 Speculation Rules 在悬停时就把目标页预渲染好了（用的是当时的会话令牌）。
// 如果用户在预渲染之后、点击之前登出或换了账号，激活的就是一个用旧令牌渲染的页面，
// 会短暂显示上一个会话的任务或 watch。所以激活时比较令牌，变了就整页重载。
import { getToken } from "./auth";

// 只需要 document 的这一小块形状；prerendering 在不支持预渲染的浏览器里不存在，所以是可选的
type PrerenderTarget = {
  readonly prerendering?: boolean;
  addEventListener(
    type: "prerenderingchange",
    listener: () => void,
    options: { once: boolean },
  ): void;
};

export function reloadIfSessionChangedOnActivation(
  target: PrerenderTarget = document,
  readToken: () => string | null = getToken,
  reload: () => void = () => location.reload(),
): void {
  if (target.prerendering !== true) return;
  const tokenAtPrerender = readToken();
  target.addEventListener(
    "prerenderingchange",
    () => {
      if (readToken() !== tokenAtPrerender) reload();
    },
    { once: true },
  );
}

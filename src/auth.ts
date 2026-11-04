// 会话令牌的存取。令牌存在 localStorage。
// 原因：前后端不在同一站点，浏览器会拦截第三方 Cookie。
// 隐私模式等场景下，localStorage 可能直接抛错。
// 因此每次读写都捕获异常。读不到令牌时，当作未登录。
import { clearHeaderUser } from "./headerUserCache";

const TOKEN_KEY = "greenlight.session";

export function getToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setToken(token: string): void {
  try {
    localStorage.setItem(TOKEN_KEY, token);
  } catch {
    // 存不进去时，令牌只在当前页面有效。刷新后要重新登录
  }
}

// Sign out 与 api.ts 里 UNAUTHORIZED 清令牌都经过这里，所以会话失效时头部缓存一起失效
export function clearToken(): void {
  try {
    localStorage.removeItem(TOKEN_KEY);
  } catch {
    // 同上
  }
  clearHeaderUser();
}

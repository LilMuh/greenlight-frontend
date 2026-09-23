// 会话令牌的存取。存 localStorage：前后端不同站，第三方 Cookie 会被浏览器拦掉。
// 隐私模式等场景 localStorage 可能直接抛错，所以每次读写都兜住，拿不到就当没登录。
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
    // 存不下就只在本页有效，刷新后要重新登录
  }
}

export function clearToken(): void {
  try {
    localStorage.removeItem(TOKEN_KEY);
  } catch {
    // 同上
  }
}

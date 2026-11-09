// Google 登录：整页跳转的 OIDC implicit 流程（response_type=id_token）。
//
// 为什么这样做：
// - iPhone Safari 上 GIS 默认的弹窗模式会在新标签打开 accounts.google.com，选完账号后停在白屏，
//   credential 没能回到 opener（标签挂起 / ITP 让弹窗到 opener 的 postMessage 交接不可靠）。
//   所以所有设备都改成同一标签页整页跳转，再整页回跳。
// - 前端是 GitHub Pages 静态站。GIS 的 redirect 模式要 POST 到 login_uri，必须改后端，因此不用。
//   implicit 流程把 id_token 放在回跳地址的 fragment 里，纯前端就能接住。
//
// 安全：
// - state 防登录 CSRF：别人构造的回跳链接，不能把你登进他的账号。state 必须等于本标签页点击时写入的一次性值。
// - nonce 把 id_token 绑定到本标签页这一次请求。后端不校验 nonce，所以只能在这里校验。
// - 签名、aud、iss、exp 由后端校验。这里解码 payload 只读 nonce，绝不把 payload 里的邮箱等当作身份。
// - 令牌不能留在地址栏和历史记录里：识别到回跳参数后第一件事就是清掉 fragment。
//
// 本模块在 import 时不访问任何浏览器全局。浏览器依赖只在默认依赖工厂被调用时才读取，方便在 Node 里测试。
// 不打印任何 fragment、令牌、state 或 nonce。

import { STRINGS } from "./strings";

export const GOOGLE_AUTH_ENDPOINT = "https://accounts.google.com/o/oauth2/v2/auth";
export const PENDING_KEY = "greenlight.googlePending";
// pending 的有效期。超过这个时间的回跳当作过期（用户在 Google 页停留太久，或时钟倒退）
export const PENDING_MAX_AGE_MS = 10 * 60 * 1000;

export type PendingGoogleLogin = { state: string; nonce: string; createdAt: number };
export type GoogleCallback = { idToken: string | null; error: string | null; state: string | null };
export type GoogleReturn =
  | { kind: "token"; idToken: string }
  | { kind: "cancelled" }
  | { kind: "failed"; reason: "state" | "stale" | "nonce" | "missing" | "google" };

type StorageLike = Pick<Storage, "getItem" | "setItem" | "removeItem">;

// 无 padding 的 base64url：+ 换成 -，/ 换成 _
export function base64UrlEncode(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function randomUrlSafeToken(
  byteLength = 32,
  fill: (bytes: Uint8Array<ArrayBuffer>) => void = (bytes) => void crypto.getRandomValues(bytes),
): string {
  const bytes = new Uint8Array(byteLength);
  fill(bytes);
  return base64UrlEncode(bytes);
}

// redirect_uri 只由当前页面位置推导：同目录下的 config.html，不带 query 和 hash。
// 原因：base 是相对路径 "./"，同一份构建既跑在 GitHub Pages 子路径下，又跑在 localhost:5500。
// 不从查询参数读取任何跳转目标（防开放重定向）。Google 只接受 Cloud Console 里登记过的地址。
export function redirectUriFor(href: string): string {
  const url = new URL("./config.html", href);
  url.search = "";
  url.hash = "";
  return url.href;
}

export function buildGoogleAuthUrl(params: {
  clientId: string; redirectUri: string; state: string; nonce: string;
}): string {
  const query = new URLSearchParams();
  query.set("client_id", params.clientId);
  query.set("redirect_uri", params.redirectUri);
  query.set("response_type", "id_token");
  query.set("scope", "openid email profile");
  query.set("state", params.state);
  query.set("nonce", params.nonce);
  query.set("prompt", "select_account");
  return `${GOOGLE_AUTH_ENDPOINT}?${query.toString()}`;
}

// 解析回跳的 fragment。id_token、error、state 都不存在时返回 null：说明这不是一次回跳
export function parseGoogleCallback(hash: string): GoogleCallback | null {
  const params = new URLSearchParams(hash.startsWith("#") ? hash.slice(1) : hash);
  const idToken = params.get("id_token");
  const error = params.get("error");
  const state = params.get("state");
  if (idToken === null && error === null && state === null) return null;
  return { idToken, error, state };
}

// 解码 JWT 的 payload（不验签）。永不抛错，任何异常都返回 null。
// 只用来读 nonce，不能当作身份。
export function decodeJwtPayload(jwt: string): Record<string, unknown> | null {
  try {
    const parts = jwt.split(".");
    if (parts.length !== 3) return null;
    let base64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    while (base64.length % 4 !== 0) base64 += "=";
    const binary = atob(base64);
    const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
    const parsed: unknown = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return null;
    return parsed as Record<string, unknown>;
  } catch {
    return null;
  }
}

// 解析 sessionStorage 里的 pending。永不抛错
export function parsePending(raw: string | null): PendingGoogleLogin | null {
  if (raw === null) return null;
  try {
    const value: unknown = JSON.parse(raw);
    if (typeof value !== "object" || value === null) return null;
    const { state, nonce, createdAt } = value as Record<string, unknown>;
    if (typeof state !== "string" || state === "") return null;
    if (typeof nonce !== "string" || nonce === "") return null;
    if (typeof createdAt !== "number" || !Number.isFinite(createdAt)) return null;
    return { state, nonce, createdAt };
  } catch {
    return null;
  }
}

// 校验顺序固定：先 state，再时效，再 Google 报的 error，再 id_token，最后 nonce。
// 先校验 state 再看 error：不是本标签页发起的回跳，一律当失败，不显示「已取消」之类的友好提示。
export function evaluateGoogleCallback(
  callback: GoogleCallback,
  pending: PendingGoogleLogin | null,
  now: number,
): GoogleReturn {
  if (pending === null || callback.state === null || callback.state !== pending.state) {
    return { kind: "failed", reason: "state" };
  }
  const age = now - pending.createdAt;
  if (age < 0 || age > PENDING_MAX_AGE_MS) return { kind: "failed", reason: "stale" };
  if (callback.error !== null) {
    return callback.error === "access_denied"
      ? { kind: "cancelled" }
      : { kind: "failed", reason: "google" };
  }
  if (callback.idToken === null) return { kind: "failed", reason: "missing" };
  const payload = decodeJwtPayload(callback.idToken);
  if (payload === null || payload.nonce !== pending.nonce) return { kind: "failed", reason: "nonce" };
  return { kind: "token", idToken: callback.idToken };
}

// 回跳结果对应的 toast 文案。token 没有提示
export function googleReturnMessage(result: GoogleReturn): string | null {
  if (result.kind === "token") return null;
  if (result.kind === "cancelled") return STRINGS.googleCancelled;
  return result.reason === "stale" ? STRINGS.googleExpired : STRINGS.googleFailed;
}

export type SignInDeps = {
  href: string;
  storage: () => StorageLike;
  assign: (url: string) => void;
  now: () => number;
  random: () => string;
};

function defaultSignInDeps(): SignInDeps {
  return {
    href: location.href,
    storage: () => sessionStorage,
    assign: (url) => location.assign(url),
    now: Date.now,
    random: () => randomUrlSafeToken(),
  };
}

// 点击按钮：生成 state 与 nonce，写入 pending，再整页跳到 Google。
// 存储写不进去（例如 iOS 隐私模式）时返回 false 且不跳转：跳过去也回不来校验，不如提示改用验证码。
export function startGoogleSignIn(clientId: string, deps: SignInDeps = defaultSignInDeps()): boolean {
  // 顺序固定：先 state，再 nonce
  const state = deps.random();
  const nonce = deps.random();
  try {
    const storage = deps.storage();
    storage.setItem(PENDING_KEY, JSON.stringify({ state, nonce, createdAt: deps.now() }));
    // 读回比对：有的环境 setItem 不抛错却静默丢弃
    if (storage.getItem(PENDING_KEY) === null) return false;
  } catch {
    return false;
  }
  deps.assign(buildGoogleAuthUrl({ clientId, redirectUri: redirectUriFor(deps.href), state, nonce }));
  return true;
}

export type ReturnDeps = {
  hash: string;
  clearHash: () => void;
  storage: () => StorageLike;
  now: number;
};

function defaultReturnDeps(): ReturnDeps {
  return {
    hash: location.hash,
    clearHash: () => history.replaceState(history.state, "", location.pathname + location.search),
    storage: () => sessionStorage,
    now: Date.now(),
  };
}

// 页面首次渲染之前调用：处理 Google 的回跳。
// 普通加载（hash 不含回跳参数）返回 null，不碰存储、不改历史记录。
// 是回跳时：第一件事就清掉 fragment，然后一次性读出并删除 pending，最后校验。
export function takeGoogleReturn(deps: ReturnDeps = defaultReturnDeps()): GoogleReturn | null {
  const callback = parseGoogleCallback(deps.hash);
  if (callback === null) return null;
  deps.clearHash();

  let pending: PendingGoogleLogin | null = null;
  try {
    const storage = deps.storage();
    pending = parsePending(storage.getItem(PENDING_KEY));
    // 一次性：无论校验结果如何都删掉
    storage.removeItem(PENDING_KEY);
  } catch {
    pending = null;
  }
  return evaluateGoogleCallback(callback, pending, deps.now);
}

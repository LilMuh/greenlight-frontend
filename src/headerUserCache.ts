// 头部用户缓存：让三页的首帧就画出账号区和 Auto Booking 标签，不用等 /api/me 晚到。
// 只存三个展示用字段（loginEmail、admin、enableAutoBooking），绝不存令牌或其他字段。
// 权限仍由后端判定：缓存被篡改最多让头部多显示一个标签，后端照样拒绝；
// getMe 成功后会用新值覆盖缓存，登出与会话失效（clearToken）会清掉缓存。
// 只做 type 导入 api.ts，避免运行时循环依赖。
import type { UserDto } from "./api";

// 与 auth.ts 的 "greenlight.session" 同一命名空间
export const HEADER_USER_KEY = "greenlight.headerUser";

export type HeaderUser = Pick<UserDto, "loginEmail" | "admin" | "enableAutoBooking">;

export type KeyValueStore = Pick<Storage, "getItem" | "setItem" | "removeItem">;

// 隐私模式下访问 localStorage 可能直接抛错，所以连访问本身也包在 try 里
function browserStore(): KeyValueStore | null {
  try {
    if (typeof localStorage === "undefined") return null;
    return localStorage;
  } catch {
    return null;
  }
}

/** 显式挑三个字段组成新对象：传入完整 UserDto 时也只留这三个。 */
export function toHeaderUser(user: HeaderUser): HeaderUser {
  return { loginEmail: user.loginEmail, admin: user.admin, enableAutoBooking: user.enableAutoBooking };
}

/** 严格解析缓存：任何不合规的输入都是 null（宁可首帧少画账号区，也不画错）。 */
export function parseHeaderUser(raw: string | null): HeaderUser | null {
  if (raw === null) return null;
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  const { loginEmail, admin, enableAutoBooking } = record;
  if (typeof loginEmail !== "string" || loginEmail === "") return null;
  if (typeof admin !== "boolean" || typeof enableAutoBooking !== "boolean") return null;
  return toHeaderUser({ loginEmail, admin, enableAutoBooking });
}

/** 没有令牌就不信缓存（令牌被清掉就说明会话已不在）。 */
export function readHeaderUser(hasToken: boolean, store: KeyValueStore | null = browserStore()): HeaderUser | null {
  if (!hasToken || store === null) return null;
  try {
    return parseHeaderUser(store.getItem(HEADER_USER_KEY));
  } catch {
    return null;
  }
}

export function writeHeaderUser(user: HeaderUser, store: KeyValueStore | null = browserStore()): void {
  if (store === null) return;
  try {
    store.setItem(HEADER_USER_KEY, JSON.stringify(toHeaderUser(user)));
  } catch {
    // 写不进去只是下次首帧少画账号区
  }
}

export function clearHeaderUser(store: KeyValueStore | null = browserStore()): void {
  if (store === null) return;
  try {
    store.removeItem(HEADER_USER_KEY);
  } catch {
    // 同上
  }
}

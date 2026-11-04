import { afterEach, describe, expect, it, vi } from "vitest";
import {
  HEADER_USER_KEY,
  clearHeaderUser,
  parseHeaderUser,
  readHeaderUser,
  toHeaderUser,
  writeHeaderUser,
  type KeyValueStore,
} from "./headerUserCache";
import { clearToken, getToken, setToken } from "./auth";
import type { UserDto } from "./api";

// 测试数据只用 example.test 假域名。
const fullUser = (over: Partial<UserDto> = {}): UserDto => ({
  id: 7, loginEmail: "a@example.test", displayName: "Ann", notifyEmail: "notify@example.test",
  notificationsEnabled: true, admin: false, googleLinked: true, enableAutoBooking: true,
  ...over,
});

// 内存 store：node 环境没有可靠的 localStorage
function memoryStore(): KeyValueStore & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return {
    data,
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => void data.set(key, value),
    removeItem: (key) => void data.delete(key),
  };
}

// 三个方法都抛错的 store（模拟隐私模式）
const throwingStore: KeyValueStore = {
  getItem: () => { throw new Error("denied"); },
  setItem: () => { throw new Error("denied"); },
  removeItem: () => { throw new Error("denied"); },
};

describe("头部缓存的字段", () => {
  it("toHeaderUser 只留 loginEmail、admin、enableAutoBooking 三个键", () => {
    const result = toHeaderUser(fullUser());
    expect(Object.keys(result).sort()).toEqual(["admin", "enableAutoBooking", "loginEmail"]);
    expect(result).toEqual({ loginEmail: "a@example.test", admin: false, enableAutoBooking: true });
  });

  it("writeHeaderUser 存下去的 JSON 键集合恰好是这三个，read 读回相等的对象", () => {
    const store = memoryStore();
    writeHeaderUser(fullUser(), store);
    const raw = store.data.get(HEADER_USER_KEY);
    expect(raw).toBeDefined();
    expect(Object.keys(JSON.parse(raw!)).sort()).toEqual(["admin", "enableAutoBooking", "loginEmail"]);
    expect(readHeaderUser(true, store)).toEqual({ loginEmail: "a@example.test", admin: false, enableAutoBooking: true });
  });

  it("没有令牌时不信缓存", () => {
    const store = memoryStore();
    writeHeaderUser(fullUser(), store);
    expect(readHeaderUser(false, store)).toBeNull();
  });

  it("clearHeaderUser 之后读不到", () => {
    const store = memoryStore();
    writeHeaderUser(fullUser(), store);
    clearHeaderUser(store);
    expect(readHeaderUser(true, store)).toBeNull();
  });
});

describe("parseHeaderUser", () => {
  const ok = { loginEmail: "a@example.test", admin: true, enableAutoBooking: false };

  it("null、空串、非 JSON、数组、数字都返回 null", () => {
    for (const raw of [null, "", "{not json", "[]", "12", "null", '"x"']) {
      expect(parseHeaderUser(raw)).toBeNull();
    }
  });

  it("loginEmail 不是字符串或为空串返回 null", () => {
    for (const bad of [1, null, "", undefined]) {
      expect(parseHeaderUser(JSON.stringify({ ...ok, loginEmail: bad }))).toBeNull();
    }
  });

  it("admin / enableAutoBooking 缺失或不是布尔返回 null", () => {
    expect(parseHeaderUser(JSON.stringify({ loginEmail: "a@example.test", enableAutoBooking: false }))).toBeNull();
    expect(parseHeaderUser(JSON.stringify({ loginEmail: "a@example.test", admin: false }))).toBeNull();
    expect(parseHeaderUser(JSON.stringify({ ...ok, admin: "true" }))).toBeNull();
    expect(parseHeaderUser(JSON.stringify({ ...ok, enableAutoBooking: 1 }))).toBeNull();
  });

  it("合法输入多出的键被丢掉", () => {
    const result = parseHeaderUser(JSON.stringify({ ...ok, token: "secret", id: 3 }));
    expect(result).toEqual(ok);
    expect(Object.keys(result!).sort()).toEqual(["admin", "enableAutoBooking", "loginEmail"]);
  });
});

describe("store 异常或不可用", () => {
  it("getItem / setItem / removeItem 抛错：read 返回 null，write、clear 不抛", () => {
    expect(readHeaderUser(true, throwingStore)).toBeNull();
    expect(() => writeHeaderUser(fullUser(), throwingStore)).not.toThrow();
    expect(() => clearHeaderUser(throwingStore)).not.toThrow();
  });

  it("store 为 null（localStorage 不可用）时不抛，read 为 null", () => {
    expect(readHeaderUser(true, null)).toBeNull();
    expect(() => writeHeaderUser(fullUser(), null)).not.toThrow();
    expect(() => clearHeaderUser(null)).not.toThrow();
  });
});

describe("clearToken 同时清掉头部缓存", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("令牌和缓存都被清掉", () => {
    const store = memoryStore();
    vi.stubGlobal("localStorage", store);
    setToken("tok");
    writeHeaderUser(fullUser());
    expect(getToken()).toBe("tok");
    expect(store.data.has(HEADER_USER_KEY)).toBe(true);
    clearToken();
    expect(getToken()).toBeNull();
    expect(store.data.has(HEADER_USER_KEY)).toBe(false);
  });
});

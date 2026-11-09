import { describe, expect, it, vi } from "vitest";
import {
  base64UrlEncode, buildGoogleAuthUrl, decodeJwtPayload, evaluateGoogleCallback,
  googleReturnMessage, GOOGLE_AUTH_ENDPOINT, parseGoogleCallback, parsePending, PENDING_KEY,
  PENDING_MAX_AGE_MS, randomUrlSafeToken, redirectUriFor, startGoogleSignIn, takeGoogleReturn,
  type GoogleCallback, type PendingGoogleLogin, type SignInDeps,
} from "./googleRedirect";
import { STRINGS } from "./strings";

const encoder = new TextEncoder();

// 现造一个伪 JWT：只有 payload 有意义，签名段随便填
function fakeJwt(payload: unknown): string {
  const part = (value: unknown) => base64UrlEncode(encoder.encode(JSON.stringify(value)));
  return `${part({ alg: "none" })}.${part(payload)}.sig`;
}

// 用 Map 做的假 storage
function makeStorage() {
  const map = new Map<string, string>();
  return {
    map,
    getItem: (key: string) => map.get(key) ?? null,
    setItem: (key: string, value: string): void => { map.set(key, value); },
    removeItem: (key: string): void => { map.delete(key); },
  };
}

describe("base64UrlEncode", () => {
  it("用 - 和 _ 代替 + 和 /，且不带 padding", () => {
    expect(base64UrlEncode(new Uint8Array([0xfb, 0xff, 0xbf]))).toBe("-_-_");
    expect(base64UrlEncode(new Uint8Array([0xfb, 0xff]))).toBe("-_8");
  });
});

describe("randomUrlSafeToken", () => {
  it("默认 32 字节，编码成 43 个 URL 安全字符，且每次不同", () => {
    const first = randomUrlSafeToken();
    expect(first).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(randomUrlSafeToken()).not.toBe(first);
  });

  it("注入的 fill 真的被使用，长度按 byteLength", () => {
    const token = randomUrlSafeToken(5, (bytes) => bytes.fill(0xff));
    expect(token).toBe(base64UrlEncode(new Uint8Array(5).fill(0xff)));
  });
});

describe("redirectUriFor", () => {
  it("去掉 query 和 hash，落在同目录的 config.html", () => {
    expect(redirectUriFor("https://lilmuh.github.io/greenlight-frontend/config.html?x=1#id_token=t"))
      .toBe("https://lilmuh.github.io/greenlight-frontend/config.html");
  });

  it("无扩展名和目录根也解析成 config.html", () => {
    expect(redirectUriFor("https://lilmuh.github.io/greenlight-frontend/config"))
      .toBe("https://lilmuh.github.io/greenlight-frontend/config.html");
    expect(redirectUriFor("https://lilmuh.github.io/greenlight-frontend/"))
      .toBe("https://lilmuh.github.io/greenlight-frontend/config.html");
  });

  it("本地地址原样保留", () => {
    expect(redirectUriFor("http://localhost:5500/config.html")).toBe("http://localhost:5500/config.html");
  });
});

describe("buildGoogleAuthUrl", () => {
  const params = {
    clientId: "cid.apps.googleusercontent.com",
    redirectUri: "https://lilmuh.github.io/greenlight-frontend/config.html",
    state: "S",
    nonce: "N",
  };

  it("端点正确，参数键恰好是七个", () => {
    const url = new URL(buildGoogleAuthUrl(params));
    expect(url.origin + url.pathname).toBe(GOOGLE_AUTH_ENDPOINT);
    expect([...url.searchParams.keys()].sort()).toEqual(
      ["client_id", "nonce", "prompt", "redirect_uri", "response_type", "scope", "state"],
    );
  });

  it("固定值与原样回读的值都正确", () => {
    const query = new URL(buildGoogleAuthUrl(params)).searchParams;
    expect(query.get("response_type")).toBe("id_token");
    expect(query.get("scope")).toBe("openid email profile");
    expect(query.get("prompt")).toBe("select_account");
    expect(query.get("client_id")).toBe(params.clientId);
    expect(query.get("redirect_uri")).toBe(params.redirectUri);
    expect(query.get("state")).toBe("S");
    expect(query.get("nonce")).toBe("N");
  });
});

describe("parseGoogleCallback", () => {
  it("不含 id_token、error、state 时返回 null", () => {
    for (const hash of ["", "#", "#section", "#foo=1"]) {
      expect(parseGoogleCallback(hash)).toBeNull();
    }
  });

  it("成功回跳", () => {
    expect(parseGoogleCallback("#state=s&id_token=t&authuser=0"))
      .toEqual({ idToken: "t", error: null, state: "s" });
  });

  it("用户取消的回跳", () => {
    expect(parseGoogleCallback("#error=access_denied&state=s"))
      .toEqual({ idToken: null, error: "access_denied", state: "s" });
  });

  it("不带 # 前缀也能解析", () => {
    expect(parseGoogleCallback("state=s")).toEqual({ idToken: null, error: null, state: "s" });
  });
});

describe("decodeJwtPayload", () => {
  it("补 padding 并按 UTF-8 解码", () => {
    const jwt = "header.eyJub25jZSI6Im4tMSIsIm5hbWUiOiLlvKDkuIkifQ.sig";
    expect(decodeJwtPayload(jwt)).toEqual({ nonce: "n-1", name: "张三" });
  });

  it("坏输入返回 null 且不抛错", () => {
    for (const jwt of ["x", "a.b", "a.!!!.c", "a.WzFd.c", "a.bm90IGpzb24.c"]) {
      expect(() => decodeJwtPayload(jwt)).not.toThrow();
      expect(decodeJwtPayload(jwt)).toBeNull();
    }
  });
});

describe("parsePending", () => {
  it("合法 JSON 解析成对象", () => {
    const pending = { state: "s", nonce: "n", createdAt: 123 };
    expect(parsePending(JSON.stringify(pending))).toEqual(pending);
  });

  it("缺失、垃圾、缺字段、空串、非有限数都返回 null", () => {
    expect(parsePending(null)).toBeNull();
    expect(parsePending("garbage")).toBeNull();
    expect(parsePending(JSON.stringify({ state: "s", nonce: "n" }))).toBeNull();
    expect(parsePending(JSON.stringify({ state: "", nonce: "n", createdAt: 1 }))).toBeNull();
    expect(parsePending(JSON.stringify({ state: "s", nonce: "", createdAt: 1 }))).toBeNull();
    expect(parsePending(JSON.stringify({ state: "s", nonce: "n", createdAt: "1" }))).toBeNull();
    expect(parsePending(JSON.stringify({ state: "s", nonce: "n", createdAt: null }))).toBeNull();
  });
});

describe("evaluateGoogleCallback", () => {
  const now = 1_000_000_000;
  const pendingAt = (createdAt: number): PendingGoogleLogin => ({ state: "S", nonce: "N", createdAt });
  const pending = pendingAt(now - 1000);
  const goodToken = fakeJwt({ nonce: "N", sub: "x" });
  const callback = (overrides: Partial<GoogleCallback> = {}): GoogleCallback =>
    ({ idToken: goodToken, error: null, state: "S", ...overrides });

  it("全部对上时返回 token", () => {
    expect(evaluateGoogleCallback(callback(), pending, now)).toEqual({ kind: "token", idToken: goodToken });
  });

  it("没有 pending、state 不同或回跳没带 state 都是 failed/state", () => {
    const failed = { kind: "failed", reason: "state" };
    expect(evaluateGoogleCallback(callback(), null, now)).toEqual(failed);
    expect(evaluateGoogleCallback(callback({ state: "other" }), pending, now)).toEqual(failed);
    expect(evaluateGoogleCallback(callback({ state: null }), pending, now)).toEqual(failed);
  });

  it("恰好 10 分钟仍有效，再早 1 毫秒过期，未来时间也算过期", () => {
    expect(evaluateGoogleCallback(callback(), pendingAt(now - PENDING_MAX_AGE_MS), now).kind).toBe("token");
    expect(evaluateGoogleCallback(callback(), pendingAt(now - PENDING_MAX_AGE_MS - 1), now))
      .toEqual({ kind: "failed", reason: "stale" });
    expect(evaluateGoogleCallback(callback(), pendingAt(now + 1), now))
      .toEqual({ kind: "failed", reason: "stale" });
  });

  it("access_denied 是取消，其他 error 是 failed/google", () => {
    expect(evaluateGoogleCallback(callback({ idToken: null, error: "access_denied" }), pending, now))
      .toEqual({ kind: "cancelled" });
    expect(evaluateGoogleCallback(callback({ idToken: null, error: "server_error" }), pending, now))
      .toEqual({ kind: "failed", reason: "google" });
  });

  it("state 不符时，即使带着 access_denied 也按 failed/state 处理", () => {
    expect(evaluateGoogleCallback(callback({ idToken: null, error: "access_denied", state: "bad" }), pending, now))
      .toEqual({ kind: "failed", reason: "state" });
  });

  it("没有 id_token 是 failed/missing", () => {
    expect(evaluateGoogleCallback(callback({ idToken: null }), pending, now))
      .toEqual({ kind: "failed", reason: "missing" });
  });

  it("nonce 缺失、不同或 id_token 是垃圾串都是 failed/nonce", () => {
    const failed = { kind: "failed", reason: "nonce" };
    expect(evaluateGoogleCallback(callback({ idToken: fakeJwt({ sub: "x" }) }), pending, now)).toEqual(failed);
    expect(evaluateGoogleCallback(callback({ idToken: fakeJwt({ nonce: "other" }) }), pending, now)).toEqual(failed);
    expect(evaluateGoogleCallback(callback({ idToken: "garbage" }), pending, now)).toEqual(failed);
  });
});

describe("googleReturnMessage", () => {
  it("token 没有提示，取消、过期和其余失败各有文案", () => {
    expect(googleReturnMessage({ kind: "token", idToken: "t" })).toBeNull();
    expect(googleReturnMessage({ kind: "cancelled" })).toBe(STRINGS.googleCancelled);
    expect(googleReturnMessage({ kind: "failed", reason: "stale" })).toBe(STRINGS.googleExpired);
    for (const reason of ["state", "nonce", "missing", "google"] as const) {
      expect(googleReturnMessage({ kind: "failed", reason })).toBe(STRINGS.googleFailed);
    }
  });
});

describe("startGoogleSignIn", () => {
  const href = "https://lilmuh.github.io/greenlight-frontend/config.html";
  const now = 1_700_000_000_000;

  function makeDeps(storage: () => ReturnType<typeof makeStorage> | never) {
    const assigned: string[] = [];
    const tokens = ["S1", "N1"];
    const deps: SignInDeps = {
      href,
      storage,
      assign: (url) => void assigned.push(url),
      now: () => now,
      random: () => tokens.shift()!,
    };
    return { deps, assigned };
  }

  it("写入 pending 后跳转，state 与 nonce 按顺序生成", () => {
    const storage = makeStorage();
    const { deps, assigned } = makeDeps(() => storage);
    expect(startGoogleSignIn("cid", deps)).toBe(true);
    expect(assigned).toHaveLength(1);
    const query = new URL(assigned[0]).searchParams;
    expect(query.get("state")).toBe("S1");
    expect(query.get("nonce")).toBe("N1");
    expect(query.get("client_id")).toBe("cid");
    expect(query.get("redirect_uri")).toBe(href);
    expect(parsePending(storage.map.get(PENDING_KEY) ?? null)).toEqual({ state: "S1", nonce: "N1", createdAt: now });
  });

  it("setItem 抛错时不跳转", () => {
    const storage = { ...makeStorage(), setItem: () => { throw new Error("quota"); } };
    const { deps, assigned } = makeDeps(() => storage);
    expect(startGoogleSignIn("cid", deps)).toBe(false);
    expect(assigned).toHaveLength(0);
  });

  it("取 storage 本身抛错时不跳转", () => {
    const { deps, assigned } = makeDeps(() => { throw new Error("denied"); });
    expect(startGoogleSignIn("cid", deps)).toBe(false);
    expect(assigned).toHaveLength(0);
  });

  it("setItem 静默丢弃（读回为 null）时不跳转", () => {
    const storage = { ...makeStorage(), setItem: () => {} };
    const { deps, assigned } = makeDeps(() => storage);
    expect(startGoogleSignIn("cid", deps)).toBe(false);
    expect(assigned).toHaveLength(0);
  });
});

describe("takeGoogleReturn", () => {
  const href = "http://localhost:5500/config.html";
  const now = 1_700_000_000_000;

  // 先真实地点击一次，拿到写进 storage 的 pending 和跳转 URL 里的 state、nonce
  function startFlow(storage: ReturnType<typeof makeStorage>) {
    const assigned: string[] = [];
    startGoogleSignIn("cid", {
      href, storage: () => storage, assign: (url) => void assigned.push(url),
      now: () => now, random: () => randomUrlSafeToken(),
    });
    const query = new URL(assigned[0]).searchParams;
    return { state: query.get("state")!, nonce: query.get("nonce")! };
  }

  it("往返成功后清 hash、删 pending，且只能用一次", () => {
    const storage = makeStorage();
    const { state, nonce } = startFlow(storage);
    const jwt = fakeJwt({ nonce, sub: "x" });
    const hash = `#state=${state}&id_token=${jwt}&authuser=0`;
    const clearHash = vi.fn();
    const deps = { hash, clearHash, storage: () => storage, now };

    expect(takeGoogleReturn(deps)).toEqual({ kind: "token", idToken: jwt });
    expect(clearHash).toHaveBeenCalledTimes(1);
    expect(storage.map.has(PENDING_KEY)).toBe(false);

    expect(takeGoogleReturn(deps)).toEqual({ kind: "failed", reason: "state" });
  });

  it("普通加载（hash 不含回跳参数）不碰 storage 也不清 hash", () => {
    for (const hash of ["", "#section"]) {
      const storage = makeStorage();
      const getItem = vi.fn(storage.getItem);
      const removeItem = vi.fn(storage.removeItem);
      const clearHash = vi.fn();
      const result = takeGoogleReturn({
        hash, clearHash, storage: () => ({ getItem, setItem: storage.setItem, removeItem }), now,
      });
      expect(result).toBeNull();
      expect(clearHash).not.toHaveBeenCalled();
      expect(getItem).not.toHaveBeenCalled();
      expect(removeItem).not.toHaveBeenCalled();
    }
  });

  it("取 storage 抛错时仍然清 hash，并返回 failed/state", () => {
    const clearHash = vi.fn();
    const result = takeGoogleReturn({
      hash: "#state=s&id_token=t", clearHash, storage: () => { throw new Error("denied"); }, now,
    });
    expect(result).toEqual({ kind: "failed", reason: "state" });
    expect(clearHash).toHaveBeenCalledTimes(1);
  });
});

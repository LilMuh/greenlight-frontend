import { describe, expect, it } from "vitest";
import {
  POLL_INTERVAL_MS, POLL_MAX_MS, accountPlacement, askForPassword, cardState, formatVerifiedAt, lineStatusLabel, reasonHint,
  shouldKeepPolling,
} from "./accountCardLogic";
import { STRINGS } from "./strings";
import type { BookingAccountDto, BookingAccountReason } from "../../api";

// 测试数据只用 .invalid 这类假域名，公开仓库里不放任何真实地址。
const account = (over: Partial<BookingAccountDto> = {}): BookingAccountDto => ({
  id: 1, loginEmail: "acct@example.invalid", kind: "OWN", status: "VALID", reason: null,
  classCode: "PUB", verifiedAt: "2026-11-09T20:00:00Z", verifying: false,
  ...over,
});

describe("cardState 五种显示", () => {
  it("管理员永远是 admin，即使有记录", () => {
    expect(cardState(null, true)).toBe("admin");
    expect(cardState(account(), true)).toBe("admin");
  });
  it("没有记录是 none", () => {
    expect(cardState(null, false)).toBe("none");
    expect(cardState(undefined, false)).toBe("none");
  });
  it("verifying 为 true 是验证中（状态与原因不变也一样）", () => {
    expect(cardState(account({ verifying: true }), false)).toBe("verifying");
    expect(cardState(account({ status: "NEEDS_ACTION", reason: "BAD_CREDENTIALS", verifying: true }), false)).toBe("verifying");
  });
  it("刚提交、执行器未开始：verifying=false 且 NOT_VERIFIED 也显示为验证中", () => {
    expect(cardState(account({ status: "NEEDS_ACTION", reason: "NOT_VERIFIED" }), false)).toBe("verifying");
  });
  it("VALID 与 NEEDS_ACTION", () => {
    expect(cardState(account(), false)).toBe("valid");
    expect(cardState(account({ status: "NEEDS_ACTION", reason: "BAD_CREDENTIALS" }), false)).toBe("needsAction");
  });
});

describe("shouldKeepPolling", () => {
  const start = 1_000_000;
  const verifying = account({ verifying: true });
  it("验证中且未超时继续轮询", () => {
    expect(shouldKeepPolling(verifying, start, start + POLL_INTERVAL_MS)).toBe(true);
    expect(shouldKeepPolling(verifying, start, start + POLL_MAX_MS - 1)).toBe(true);
  });
  it("超过 3 分钟停止", () => {
    expect(shouldKeepPolling(verifying, start, start + POLL_MAX_MS)).toBe(false);
  });
  it("不在验证中就停止；没有记录也停止", () => {
    expect(shouldKeepPolling(account(), start, start + 1)).toBe(false);
    expect(shouldKeepPolling(account({ status: "NEEDS_ACTION", reason: "CHALLENGE" }), start, start + 1)).toBe(false);
    expect(shouldKeepPolling(null, start, start + 1)).toBe(false);
  });
  it("NOT_VERIFIED 也继续轮询", () => {
    expect(shouldKeepPolling(account({ status: "NEEDS_ACTION", reason: "NOT_VERIFIED" }), start, start + 1)).toBe(true);
  });
});

describe("D-16 原因提示", () => {
  // 与后端 BookingAccountReason 的 15 个值逐字一致
  const reasons: BookingAccountReason[] = [
    "NOT_VERIFIED", "VERIFY_FAILED", "BAD_CREDENTIALS", "CHALLENGE", "OTP_REQUIRED", "UNEXPECTED_PAGE",
    "LOGIN_TIMEOUT", "TOKEN_REJECTED", "NO_CREDENTIALS", "NO_CARD_ON_FILE", "UNSUPPORTED_CLASS", "KEY_MISMATCH",
    "DECRYPT_FAILED", "ACCOUNT_MISMATCH", "PROFILE_ERROR",
  ];
  it("BAD_CREDENTIALS 提示重新输入密码", () => {
    expect(reasonHint("BAD_CREDENTIALS")).toBe("密码错误，请重新输入密码。");
  });
  it("其余 14 个原因都提示联系管理员并带上原因码", () => {
    expect(reasons).toHaveLength(15);
    for (const reason of reasons.filter((item) => item !== "BAD_CREDENTIALS")) {
      expect(reasonHint(reason), reason).toBe(`请联系管理员（原因：${reason}）。`);
    }
  });
  it("没有原因码（VALID）时没有提示", () => {
    expect(reasonHint(null)).toBe("");
  });
  it("askForPassword 只对 BAD_CREDENTIALS 为真", () => {
    for (const reason of reasons) expect(askForPassword(reason), reason).toBe(reason === "BAD_CREDENTIALS");
    expect(askForPassword(null)).toBe(false);
  });
});

describe("formatVerifiedAt", () => {
  it("按站点时区显示到分钟，读不出返回空串", () => {
    // 温哥华偏移取决于 tzdata（UTC-8 或 UTC-7），两种都是同一天的 12:00 或 13:00
    expect(formatVerifiedAt("2026-11-09T20:00:00Z")).toMatch(/^2026-11-09 1[23]:00$/);
    expect(formatVerifiedAt(null)).toBe("");
    expect(formatVerifiedAt("not a date")).toBe("");
  });
});

describe("accountPlacement（D-18：账号卡片放哪里）", () => {
  it("管理员永远是 admin，有没有记录都一样", () => {
    expect(accountPlacement(true, null)).toBe("admin");
    expect(accountPlacement(true, undefined)).toBe("admin");
    expect(accountPlacement(true, account())).toBe("admin");
  });
  it("还没拿到、没绑定、NEEDS_ACTION（任何原因，含 NOT_VERIFIED 与验证中）都是 card", () => {
    expect(accountPlacement(false, undefined)).toBe("card");
    expect(accountPlacement(false, null)).toBe("card");
    expect(accountPlacement(false, account({ status: "NEEDS_ACTION", reason: "BAD_CREDENTIALS" }))).toBe("card");
    expect(accountPlacement(false, account({ status: "NEEDS_ACTION", reason: "CHALLENGE" }))).toBe("card");
    expect(accountPlacement(false, account({ status: "NEEDS_ACTION", reason: "NOT_VERIFIED" }))).toBe("card");
    expect(accountPlacement(false, account({ status: "NEEDS_ACTION", reason: "NOT_VERIFIED", verifying: true }))).toBe("card");
  });
  it("VALID 是 line，VALID 且验证中也是 line", () => {
    expect(accountPlacement(false, account())).toBe("line");
    expect(accountPlacement(false, account({ verifying: true }))).toBe("line");
  });
});

describe("lineStatusLabel", () => {
  it("OWN VALID 是 Valid，SHARED VALID 是 Shared，VALID 且验证中是 Verifying…", () => {
    expect(lineStatusLabel(account())).toBe(STRINGS.statusValid);
    expect(lineStatusLabel(account({ kind: "SHARED" }))).toBe(STRINGS.statusShared);
    expect(lineStatusLabel(account({ verifying: true }))).toBe(STRINGS.statusVerifying);
    expect(lineStatusLabel(account({ kind: "SHARED", verifying: true }))).toBe(STRINGS.statusVerifying);
  });
});

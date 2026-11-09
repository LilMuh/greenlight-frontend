import { describe, expect, it } from "vitest";
import { POLL_INTERVAL_MS, POLL_MAX_MS, cardState, shouldKeepPolling } from "./accountCardLogic";
import type { BookingAccountDto } from "../../api";

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

import { describe, it, expect } from "vitest";
import { accountEmail, headerTabs, resolveHeaderUser, tabGridColumns, type HeaderPage } from "./headerLogic";
import type { HeaderUser } from "../headerUserCache";
import type { UserDto } from "../api";

// 测试数据只用 example.test 假域名。
const user = (over: Partial<UserDto> = {}): UserDto => ({
  id: 1, loginEmail: "a@example.test", displayName: null, notifyEmail: "a@example.test",
  notificationsEnabled: true, admin: false, googleLinked: false, enableAutoBooking: false,
  ...over,
});

const pages = (tabs: ReturnType<typeof headerTabs>) => tabs.map((tab) => tab.page);

describe("头部标签列表", () => {
  it("未登录（null / undefined）在 Search：只有 Search 和 Watch Alerts", () => {
    for (const u of [null, undefined]) {
      const tabs = headerTabs(u, "search");
      expect(pages(tabs)).toEqual(["search", "watch"]);
      expect(tabs.map((tab) => tab.href)).toEqual(["index.html", "config.html"]);
      expect(tabs.map((tab) => tab.label)).toEqual(["Search", "Watch Alerts"]);
    }
  });

  it("普通用户（未开启订场）在 Search / Watch：只有两项", () => {
    for (const active of ["search", "watch"] as HeaderPage[]) {
      expect(pages(headerTabs(user(), active))).toEqual(["search", "watch"]);
    }
  });

  it("开启订场的普通用户、管理员在任一页：三项，第三项是 Auto Booking", () => {
    for (const u of [user({ enableAutoBooking: true }), user({ admin: true }), user({ admin: true, enableAutoBooking: true })]) {
      for (const active of ["search", "watch", "booking"] as HeaderPage[]) {
        const tabs = headerTabs(u, active);
        expect(pages(tabs)).toEqual(["search", "watch", "booking"]);
        expect(tabs[2].href).toBe("booking.html");
        expect(tabs[2].label).toBe("Auto Booking");
      }
    }
  });

  it("active 为 booking 时，即使未登录或普通用户也有三项（当前页总是选中态）", () => {
    for (const u of [null, undefined, user()]) {
      expect(pages(headerTabs(u, "booking"))).toEqual(["search", "watch", "booking"]);
    }
  });

  it("active 布尔值当且仅当 page 等于传入的 active", () => {
    const tabs = headerTabs(user({ admin: true }), "watch");
    expect(tabs.map((tab) => tab.active)).toEqual([false, true, false]);
    expect(headerTabs(null, "booking").map((tab) => tab.active)).toEqual([false, false, true]);
  });
});

describe("标签条网格列", () => {
  it("等宽、可收缩的列", () => {
    expect(tabGridColumns(2)).toBe("repeat(2, minmax(0, 1fr))");
    expect(tabGridColumns(3)).toBe("repeat(3, minmax(0, 1fr))");
  });
});

describe("账号区邮箱", () => {
  it("未登录没有邮箱，已登录是登录邮箱", () => {
    expect(accountEmail(null)).toBeNull();
    expect(accountEmail(undefined)).toBeNull();
    expect(accountEmail(user({ loginEmail: "b@example.test" }))).toBe("b@example.test");
  });
});

describe("头部用户的取值（页面确认值优先，缓存兜底）", () => {
  const cached: HeaderUser = { loginEmail: "c@example.test", admin: false, enableAutoBooking: true };

  it("页面还在确认（undefined）：有缓存用缓存，没缓存仍是 undefined", () => {
    expect(resolveHeaderUser(undefined, cached)).toEqual(cached);
    expect(resolveHeaderUser(undefined, null)).toBeUndefined();
  });

  it("页面确认未登录（null）：以页面为准，不用缓存", () => {
    expect(resolveHeaderUser(null, cached)).toBeNull();
  });

  it("页面确认了用户：以页面为准，不用不同的缓存", () => {
    const confirmed: HeaderUser = { loginEmail: "d@example.test", admin: true, enableAutoBooking: false };
    expect(resolveHeaderUser(confirmed, cached)).toEqual(confirmed);
  });

  it("只有三个字段的 HeaderUser 也能算标签和邮箱", () => {
    const tabs = headerTabs(cached, "search");
    expect(pages(tabs)).toEqual(["search", "watch", "booking"]);
    expect(tabs[2].label).toBe("Auto Booking");
    expect(accountEmail(cached)).toBe("c@example.test");
  });
});

import { describe, it, expect } from "vitest";
import {
  accountLabel, addDays, canCreate, canSeeBooking, defaultPlayDate, defaultRunAt, describeResult,
  northlandsCourseId, occupiedBy, playLineText, runLineText, runParts, siteToday, toRunAtLocal, weekdayShort,
} from "./logic";
import { STRINGS } from "./strings";
import { ERROR_MESSAGES } from "../config/strings";
import type { BookingTaskDto, UserDto } from "../../api";

// 测试数据只用 example.test 这类假域名，公开仓库里不放任何真实地址。
const task = (over: Partial<BookingTaskDto> = {}): BookingTaskDto => ({
  id: 1, courseId: 9, courseSlug: "northlands", courseName: "Northlands",
  playDate: "2026-11-08", runAt: "2026-11-03T14:00:00Z", runAtLocal: "2026-11-03T07:00",
  timeStart: "08:00", timeEnd: "10:00", players: 2, maxPrice: 100, sort: "EARLIEST",
  status: "PENDING", resultDetail: null, createdAt: "2026-11-02T20:00:00Z", finishedAt: null,
  creatorLoginEmail: "a@example.test", mine: false, cancellable: false, bookingAccountEmail: null, editable: false,
  ...over,
});

describe("站点日期与缺省运行时间", () => {
  // 注：故意不用整点边界。BC 的偏移取决于 tzdata（标准规则 11 月是 UTC-8，新规则全年 UTC-7），
  // 下面的瞬时在两种偏移下得到同一个站点日期。
  it("温哥华 11-02 晚上（UTC 已是 11-03）：缺省运行日是 11-03，证明不用 UTC 日期", () => {
    const now = new Date("2026-11-03T06:30:00Z"); // 温哥华 22:30 或 23:30，仍是 11-02
    expect(siteToday(now)).toBe("2026-11-02");
    expect(defaultRunAt(now)).toEqual({ date: "2026-11-03", time: "07:00" });
  });
  it("温哥华已过 11-03 零点：缺省运行日跟着滚到 11-04", () => {
    const now = new Date("2026-11-03T08:30:00Z"); // 温哥华 00:30 或 01:30，已是 11-03
    expect(siteToday(now)).toBe("2026-11-03");
    expect(defaultRunAt(now)).toEqual({ date: "2026-11-04", time: "07:00" });
  });
  it("缺省打球日是运行日 + 5 天", () => {
    expect(defaultPlayDate("2026-11-03")).toBe("2026-11-08");
  });
  it("addDays 跨月、跨年、跨闰日", () => {
    expect(addDays("2026-11-28", 5)).toBe("2026-12-03");
    expect(addDays("2026-12-29", 5)).toBe("2027-01-03");
    expect(addDays("2028-02-27", 2)).toBe("2028-02-29");
    expect(addDays("2026-03-02", -2)).toBe("2026-02-28");
  });
  it("toRunAtLocal 拼成不带时区的站点本地时间", () => {
    expect(toRunAtLocal("2026-11-03", "07:00")).toBe("2026-11-03T07:00");
  });
});

describe("星期与卡片两行时间", () => {
  it("weekdayShort 按纯日历日算星期", () => {
    expect(weekdayShort("2026-11-03")).toBe("Tue");
    expect(weekdayShort("2026-11-05")).toBe("Thu");
    expect(weekdayShort("2026-11-08")).toBe("Sun");
    expect(weekdayShort("2026-03-01")).toBe("Sun");
    expect(weekdayShort("2028-02-29")).toBe("Tue");
  });
  it("weekdayShort 输入不是 yyyy-MM-dd 时返回 null", () => {
    expect(weekdayShort("bad")).toBeNull();
    expect(weekdayShort("")).toBeNull();
    expect(weekdayShort("2026-1-3")).toBeNull();
  });
  it("runParts 拆出日期和时刻，null 或格式不对返回 null", () => {
    expect(runParts("2026-11-03T07:00")).toEqual({ date: "2026-11-03", time: "07:00" });
    expect(runParts(null)).toBeNull();
    expect(runParts("2026-11-03 07:00")).toBeNull();
  });
  it("runLineText 是「星期 日期 时刻」", () => {
    expect(runLineText(task())).toBe("Tue 2026-11-03 07:00");
  });
  it("runAtLocal 为 null 时运行行原样显示 runAt，不猜星期", () => {
    expect(runLineText(task({ runAtLocal: null }))).toBe("2026-11-03T14:00:00Z");
  });
  it("playLineText 是「星期 日期 · 起–止」", () => {
    expect(playLineText(task())).toBe("Sun 2026-11-08 · 08:00–10:00");
  });
});

describe("占用提示", () => {
  it("只认 PENDING / RUNNING 且 runAtLocal 逐字相等", () => {
    const list = [
      task({ id: 1, runAtLocal: "2026-11-03T07:00", status: "PENDING" }),
      task({ id: 2, runAtLocal: "2026-11-03T07:05", status: "RUNNING", creatorLoginEmail: "b@example.test" }),
      task({ id: 3, runAtLocal: "2026-11-03T07:10", status: "BOOKED" }),
      task({ id: 4, runAtLocal: "2026-11-03T07:15", status: "CANCELLED" }),
    ];
    expect(occupiedBy(list, "2026-11-03T07:00")?.id).toBe(1);
    expect(occupiedBy(list, "2026-11-03T07:05")?.creatorLoginEmail).toBe("b@example.test");
    expect(occupiedBy(list, "2026-11-03T07:10")).toBeNull(); // 终态不占
    expect(occupiedBy(list, "2026-11-03T07:15")).toBeNull();
    expect(occupiedBy(list, "2026-11-03T07:01")).toBeNull(); // 差一分钟不算
    expect(occupiedBy([], "2026-11-03T07:00")).toBeNull();
  });
  it("excludeId 跳过正在编辑的那条，不传时行为不变", () => {
    const list = [task({ id: 1, runAtLocal: "2026-11-03T07:00", status: "PENDING" })];
    expect(occupiedBy(list, "2026-11-03T07:00", 1)).toBeNull();
    expect(occupiedBy(list, "2026-11-03T07:00", 2)?.id).toBe(1);
    expect(occupiedBy(list, "2026-11-03T07:00", null)?.id).toBe(1);
  });
  it("站点没有放号规则时 runAtLocal 为 null，不会误占", () => {
    expect(occupiedBy([task({ runAtLocal: null })], "2026-11-03T07:00")).toBeNull();
  });
});

describe("northlandsCourseId", () => {
  it("按 slug 找，不写死 id", () => {
    expect(northlandsCourseId([{ id: 1, slug: "langara" }, { id: 17, slug: "northlands" }])).toBe(17);
  });
  it("没有 northlands 时为 null", () => {
    expect(northlandsCourseId([{ id: 1, slug: "langara" }])).toBeNull();
    expect(northlandsCourseId([])).toBeNull();
  });
});

const user = (over: Partial<UserDto> = {}): UserDto => ({
  id: 1, loginEmail: "a@example.test", displayName: null, notifyEmail: "a@example.test",
  notificationsEnabled: true, admin: false, googleLinked: false, enableAutoBooking: false,
  ...over,
});

describe("入口可见性（D-15 / D-16）", () => {
  it("canSeeBooking：未登录 false；管理员 true；开启订场的用户 true；其余 false", () => {
    expect(canSeeBooking(null)).toBe(false);
    expect(canSeeBooking(undefined)).toBe(false);
    expect(canSeeBooking(user({ admin: true }))).toBe(true);
    expect(canSeeBooking(user({ enableAutoBooking: true }))).toBe(true);
    expect(canSeeBooking(user())).toBe(false);
  });
  it("canCreate：管理员不能建（即便开了订场）；开启订场的普通用户能；其余不能", () => {
    expect(canCreate(null)).toBe(false);
    expect(canCreate(user({ admin: true, enableAutoBooking: true }))).toBe(false);
    expect(canCreate(user({ admin: true }))).toBe(false);
    expect(canCreate(user({ enableAutoBooking: true }))).toBe(true);
    expect(canCreate(user())).toBe(false);
  });
});

describe("订场账号邮箱显示（D-16）", () => {
  it("后端给 null 时显示 Unknown，不猜", () => {
    expect(accountLabel(task({ bookingAccountEmail: null }))).toBe(STRINGS.unknown);
    expect(STRINGS.unknown).toBe("Unknown");
  });
  it("后端给了就原样显示", () => {
    expect(accountLabel(task({ bookingAccountEmail: "acct@example.test" }))).toBe("acct@example.test");
  });
});

describe("describeResult 结果说明", () => {
  const slot = { date: "2026-11-08", time: "08:10", players: 2, pricePerPlayer: 85, teeSheetId: 1 };
  const pricing = { subTotal: 170, totalTax: 8.5, total: 178.5 };

  it("DRY_RUN_OK：含时段、算价、是否已解锁与 dry run", () => {
    const text = describeResult(task({ status: "DRY_RUN_OK", resultDetail: { mode: "dry-run", result: "DRY_RUN_OK", slot, pricing, unlocked: true } }));
    expect(text.toLowerCase()).toContain("dry run");
    expect(text).toContain("08:10");
    expect(text).toContain("2026-11-08");
    expect(text).toContain("178.50");
    expect(text.toLowerCase()).toContain("released");
    const notUnlocked = describeResult(task({ status: "DRY_RUN_OK", resultDetail: { slot, pricing, unlocked: false } }));
    expect(notUnlocked.toLowerCase()).toContain("not confirmed");
  });
  it("BOOKED：含时段、总价、确认号", () => {
    const text = describeResult(task({ status: "BOOKED", resultDetail: { result: "BOOKED", slot, pricing, reservationId: 4242 } }));
    expect(text).toContain("08:10");
    expect(text).toContain("178.50");
    expect(text).toContain("4242");
  });
  it("NOT_BOOKED：按 reason 说明，含 MISSED_WINDOW，认不出的 reason 也给一句", () => {
    const reason = (value: string) => describeResult(task({ status: "NOT_BOOKED", resultDetail: { reason: value } }));
    expect(reason("NOT_RELEASED")).toMatch(/released/i);
    expect(reason("NO_MATCHING_SLOT")).toMatch(/no slot/i);
    expect(reason("ALL_CANDIDATES_FAILED")).toMatch(/none could/i);
    expect(reason("NO_TRUSTED_DATA")).toMatch(/usable data/i);
    expect(reason("STARTED_AFTER_DEADLINE")).toMatch(/deadline/i);
    expect(reason("MISSED_WINDOW")).toMatch(/missed/i);
    expect(reason("SOMETHING_NEW")).toMatch(/not booked/i);
    const withStep = describeResult(task({ status: "NOT_BOOKED", resultDetail: { reason: "ALL_CANDIDATES_FAILED", failedStep: "CheckBookingLimit" } }));
    expect(withStep).toContain("CheckBookingLimit");
  });
  it("FAILED：按 code / cause 说明，并说明没下单", () => {
    const failed = (detail: Record<string, unknown>) => describeResult(task({ status: "FAILED", resultDetail: detail }));
    expect(failed({ cause: "SCRAPER_UNREACHABLE" })).toMatch(/couldn't be reached/i);
    expect(failed({ cause: "REQUEST_REJECTED" })).toMatch(/rejected/i);
    expect(failed({ cause: "SCRAPER_ERROR", code: "LOGIN_FAILED" })).toContain("LOGIN_FAILED");
    expect(failed({})).toMatch(/nothing was ordered/i);
  });
  it("UNKNOWN：到 Northlands 网站确认，系统不会重试（D-06）", () => {
    const text = describeResult(task({ status: "UNKNOWN", resultDetail: { reason: "RESERVE_TIMEOUT" } }));
    expect(text).toMatch(/check the northlands site/i);
    expect(text).toMatch(/will not retry/i);
    expect(describeResult(task({ status: "UNKNOWN", resultDetail: { cause: "RESTARTED_WHILE_RUNNING" } }))).toMatch(/restart/i);
  });
  it("PENDING / RUNNING / CANCELLED 各一句", () => {
    expect(describeResult(task({ status: "PENDING" }))).toMatch(/waiting/i);
    expect(describeResult(task({ status: "RUNNING" }))).toMatch(/running/i);
    expect(describeResult(task({ status: "CANCELLED" }))).toMatch(/cancelled/i);
  });
  it("resultDetail 缺字段或类型不对时不抛错", () => {
    for (const status of ["DRY_RUN_OK", "BOOKED", "NOT_BOOKED", "FAILED", "UNKNOWN"] as const) {
      expect(() => describeResult(task({ status, resultDetail: null }))).not.toThrow();
      expect(() => describeResult(task({ status, resultDetail: {} }))).not.toThrow();
      expect(() => describeResult(task({ status, resultDetail: { slot: "x", pricing: 5, reservationId: {}, reason: 3, unlocked: "yes" } }))).not.toThrow();
      expect(describeResult(task({ status, resultDetail: null })).length).toBeGreaterThan(0);
    }
  });
});

describe("13 个 BOOKING_* 错误码文案", () => {
  const codes = [
    "BOOKING_NOT_ENABLED", "BOOKING_ADMIN_CANNOT_CREATE", "BOOKING_RUN_AT_TAKEN", "BOOKING_COURSE_UNSUPPORTED",
    "BOOKING_DATE_OUT_OF_WINDOW", "BOOKING_RUN_AT_INVALID", "BOOKING_TIME_INVALID", "BOOKING_PLAYERS_INVALID",
    "BOOKING_PRICE_INVALID", "BOOKING_SORT_INVALID", "BOOKING_TASK_NOT_FOUND", "BOOKING_TASK_NOT_PENDING",
    "BOOKING_TASK_ABOUT_TO_RUN",
  ];
  it("每个码都有非空英文文案", () => {
    for (const code of codes) {
      expect(ERROR_MESSAGES[code], code).toBeTruthy();
      expect(ERROR_MESSAGES[code]).toMatch(/^[\x20-\x7E—’]+$/);
    }
  });
});

import { describe, it, expect } from "vitest";
import {
  accountLabel, addDays, canCreate, canSeeBooking, cardResultText, createBlockedReason, defaultPlayDate, defaultRunAt,
  describeResult, bookedSlotView, isRunAtTaken, northlandsCourseId, playLineText, runLineText, runParts, shortTime, siteToday,
  toRunAtLocal, weekdayShort, whenLabels,
} from "./logic";
import { STRINGS } from "./strings";
import { ERROR_MESSAGES } from "../config/strings";
import type { BookingAccountDto, BookingTaskDto, BookingTaskStatus, UserDto } from "../../api";

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

describe("占用提示（D-14：不含身份）", () => {
  const OCCUPIED = ["2026-11-03T07:00", "2026-11-03T07:30"];
  it("别人占用的分钟（occupiedRunAtLocal）逐字相等才算占用", () => {
    expect(isRunAtTaken(OCCUPIED, [], "2026-11-03T07:00")).toBe(true);
    expect(isRunAtTaken(OCCUPIED, [], "2026-11-03T07:30")).toBe(true);
    expect(isRunAtTaken(OCCUPIED, [], "2026-11-03T07:01")).toBe(false); // 差一分钟不算
    expect(isRunAtTaken([], [], "2026-11-03T07:00")).toBe(false);
  });
  it("自己另一个活动任务占着这一分钟也算占用，终态不占", () => {
    const own = [
      task({ id: 1, runAtLocal: "2026-11-03T08:00", status: "PENDING" }),
      task({ id: 2, runAtLocal: "2026-11-03T08:05", status: "RUNNING" }),
      task({ id: 3, runAtLocal: "2026-11-03T08:10", status: "BOOKED" }),
      task({ id: 4, runAtLocal: "2026-11-03T08:15", status: "CANCELLED" }),
    ];
    expect(isRunAtTaken([], own, "2026-11-03T08:00")).toBe(true);
    expect(isRunAtTaken([], own, "2026-11-03T08:05")).toBe(true);
    expect(isRunAtTaken([], own, "2026-11-03T08:10")).toBe(false);
    expect(isRunAtTaken([], own, "2026-11-03T08:15")).toBe(false);
  });
  it("正在编辑的自己的任务那一分钟不算占用；编辑别的任务时仍算", () => {
    const own = [task({ id: 1, runAtLocal: "2026-11-03T08:00", status: "PENDING" })];
    expect(isRunAtTaken([], own, "2026-11-03T08:00", 1)).toBe(false);
    expect(isRunAtTaken([], own, "2026-11-03T08:00", 2)).toBe(true);
    expect(isRunAtTaken([], own, "2026-11-03T08:00", null)).toBe(true);
  });
  it("编辑自己的任务时，别人占用的分钟照样算占用", () => {
    const own = [task({ id: 1, runAtLocal: "2026-11-03T08:00", status: "PENDING" })];
    expect(isRunAtTaken(OCCUPIED, own, "2026-11-03T07:00", 1)).toBe(true);
  });
  it("站点没有放号规则时 runAtLocal 为 null，不会误占", () => {
    expect(isRunAtTaken([], [task({ runAtLocal: null })], "2026-11-03T07:00")).toBe(false);
  });
  it("提示文案不带邮箱和任务号", () => {
    expect(STRINGS.occupied).toBe("That run time is already taken.");
    expect(STRINGS.occupied).not.toMatch(/[@#]/);
    expect(ERROR_MESSAGES.BOOKING_RUN_AT_TAKEN).toBe("That run time is already taken.");
    expect(ERROR_MESSAGES.BOOKING_RUN_AT_TAKEN).not.toMatch(/who|@|#/i);
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

const account = (over: Partial<BookingAccountDto> = {}): BookingAccountDto => ({
  id: 1, loginEmail: "acct@example.invalid", kind: "OWN", status: "VALID", reason: null,
  classCode: "PUB", verifiedAt: "2026-11-09T20:00:00Z", verifying: false,
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
  it("canCreate（D-07）：开启订场的普通用户且账号 VALID 才能建；无账号 / NEEDS_ACTION / 验证中 / 管理员都不能", () => {
    const booker = user({ enableAutoBooking: true });
    expect(canCreate(null, account())).toBe(false);
    expect(canCreate(booker, account())).toBe(true);
    expect(canCreate(booker, null)).toBe(false); // 没绑定
    expect(canCreate(booker, undefined)).toBe(false); // 还没拿到
    expect(canCreate(booker, account({ status: "NEEDS_ACTION", reason: "BAD_CREDENTIALS" }))).toBe(false);
    expect(canCreate(booker, account({ status: "NEEDS_ACTION", reason: "NOT_VERIFIED", verifying: true }))).toBe(false);
    expect(canCreate(user({ admin: true, enableAutoBooking: true }), account())).toBe(false); // 管理员不能建
    expect(canCreate(user({ admin: true }), account())).toBe(false);
    expect(canCreate(user(), account())).toBe(false); // 没开订场
  });
  it("createBlockedReason：没绑定 / 验证中 / Needs action 各有说明；VALID、没拿到、非订场用户没有说明", () => {
    const booker = user({ enableAutoBooking: true });
    expect(createBlockedReason(booker, null)).toBe(STRINGS.createNeedsLink);
    expect(createBlockedReason(booker, account({ status: "NEEDS_ACTION", reason: "NOT_VERIFIED", verifying: true }))).toBe(STRINGS.createVerifying);
    expect(createBlockedReason(booker, account({ status: "NEEDS_ACTION", reason: "NOT_VERIFIED" }))).toBe(STRINGS.createVerifying);
    expect(createBlockedReason(booker, account({ status: "NEEDS_ACTION", reason: "CHALLENGE" }))).toBe(STRINGS.createNeedsAction);
    expect(createBlockedReason(booker, account())).toBeNull();
    expect(createBlockedReason(booker, undefined)).toBeNull();
    expect(createBlockedReason(user({ admin: true }), null)).toBeNull();
    expect(createBlockedReason(user(), null)).toBeNull();
    expect(createBlockedReason(null, null)).toBeNull();
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
    // Phase 6：账号已解绑 / 不是 VALID（带 reason），都说明没有下单
    expect(failed({ cause: "BOOKING_ACCOUNT_UNBOUND" })).toMatch(/unlinked.*nothing was ordered/);
    expect(failed({ cause: "BOOKING_ACCOUNT_NOT_VALID", reason: "BAD_CREDENTIALS" })).toMatch(/Re-enter your password/);
    expect(failed({ cause: "BOOKING_ACCOUNT_NOT_VALID", reason: "CHALLENGE" })).toMatch(/CHALLENGE.*Contact the admin/);
    expect(failed({ cause: "BOOKING_ACCOUNT_NOT_VALID" })).toMatch(/wasn't valid.*nothing was ordered/);
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

describe("11 个 BOOKING_ACCOUNT_* 错误码文案", () => {
  const codes = [
    "BOOKING_ACCOUNT_REQUIRED", "BOOKING_ACCOUNT_NOT_FOUND", "BOOKING_ACCOUNT_EMAIL_TAKEN", "BOOKING_ACCOUNT_ALREADY_LINKED",
    "BOOKING_ACCOUNT_BUSY", "BOOKING_ACCOUNT_KEY_MISMATCH", "BOOKING_ACCOUNT_PAYLOAD_INVALID", "BOOKING_ACCOUNT_VERIFYING",
    "BOOKING_ACCOUNT_VERIFY_RATE_LIMITED", "BOOKING_ACCOUNT_SERVICE_UNAVAILABLE", "BOOKING_ACCOUNT_ADMIN_FORBIDDEN",
  ];
  it("全部都有非空英文文案", () => {
    expect(codes).toHaveLength(11);
    for (const code of codes) {
      expect(ERROR_MESSAGES[code], code).toBeTruthy();
      expect(ERROR_MESSAGES[code]).toMatch(/^[\x20-\x7E—’]+$/);
    }
  });
  it("ALREADY_LINKED 说先解绑，VERIFY_RATE_LIMITED 说十分钟后再试，EMAIL_TAKEN 不带占用者信息", () => {
    expect(ERROR_MESSAGES.BOOKING_ACCOUNT_ALREADY_LINKED).toMatch(/unlink/i);
    expect(ERROR_MESSAGES.BOOKING_ACCOUNT_VERIFY_RATE_LIMITED).toMatch(/ten minutes/);
    expect(ERROR_MESSAGES.BOOKING_ACCOUNT_EMAIL_TAKEN).not.toMatch(/@/);
  });
});

describe("BOOKED 时段块", () => {
  const booked = (slot: unknown, over: Partial<BookingTaskDto> = {}): BookingTaskDto =>
    task({
      status: "BOOKED",
      resultDetail: { slot, pricing: { total: 280 }, reservationId: 387292 },
      ...over,
    });
  const slot = { date: "2026-11-14", time: "09:00", players: 4, pricePerPlayer: 70 };

  it("shortTime 只去掉小时的前导零，其余原样", () => {
    expect(shortTime("09:00")).toBe("9:00");
    expect(shortTime("00:30")).toBe("0:30");
    expect(shortTime("14:50")).toBe("14:50");
    expect(shortTime("7:05")).toBe("7:05");
    expect(shortTime("morning")).toBe("morning");
  });

  it("三行内容严格按用户指定的格式，不含价格和确认号", () => {
    const view = bookedSlotView(booked(slot));
    expect(view).toEqual({ label: "BOOKED TEE TIME (2026-11-14)", headline: "SAT 9:00", players: "4 players" });
    const text = JSON.stringify(view);
    expect(text).not.toContain("280");
    expect(text).not.toContain("387292");
    expect(text).not.toContain("$");
  });

  it("星期由日期算出：2026-11-08 是 SUN，不照抄设计稿", () => {
    expect(bookedSlotView(booked({ ...slot, date: "2026-11-08" }))?.headline).toBe("SUN 9:00");
  });

  it("下午时间保持 24 小时制", () => {
    expect(bookedSlotView(booked({ ...slot, time: "14:50" }))?.headline).toBe("SAT 14:50");
  });

  it("1 人是单数；players 读不出只省略那一行", () => {
    expect(bookedSlotView(booked({ ...slot, players: 1 }))?.players).toBe("1 player");
    expect(bookedSlotView(booked({ date: "2026-11-14", time: "09:00" }))?.players).toBeNull();
    expect(bookedSlotView(booked({ ...slot, players: "4" }))?.players).toBeNull();
  });

  it("不是 BOOKED、或 slot 读不出时返回 null，回退到原来的结果句", () => {
    expect(bookedSlotView(booked(slot, { status: "DRY_RUN_OK" }))).toBeNull();
    expect(bookedSlotView(task({ status: "BOOKED", resultDetail: null }))).toBeNull();
    expect(bookedSlotView(booked(undefined))).toBeNull();
    expect(bookedSlotView(booked("slot"))).toBeNull();
    expect(bookedSlotView(booked({ ...slot, date: undefined }))).toBeNull();
    expect(bookedSlotView(booked({ ...slot, date: "2026-1-3" }))).toBeNull();
    expect(bookedSlotView(booked({ ...slot, time: "" }))).toBeNull();
    expect(bookedSlotView(booked({ ...slot, time: undefined }))).toBeNull();
  });

  it("describeResult 仍带 total 和确认号", () => {
    const text = describeResult(booked(slot));
    expect(text).toContain("280.00");
    expect(text).toContain("Confirmation #387292");
  });
});

describe("卡片结果句", () => {
  const slot = { date: "2026-11-14", time: "09:00", players: 4, pricePerPlayer: 70 };
  const booked = (detail: Record<string, unknown> | null): BookingTaskDto =>
    task({ status: "BOOKED", resultDetail: detail });

  it("BOOKED 且时段块建得出来：不显示结果句（null）", () => {
    expect(cardResultText(booked({ slot, pricing: { total: 280 }, reservationId: 387292 }))).toBeNull();
  });

  it("BOOKED 且没有 resultDetail：回退到 describeResult 的句子", () => {
    const t = booked(null);
    expect(cardResultText(t)).toBe(describeResult(t));
    expect(cardResultText(t)).toBe("Booked.");
  });

  it("BOOKED 但 slot 缺 time：回退句不丢确认号", () => {
    const t = booked({ slot: { ...slot, time: undefined }, pricing: { total: 280 }, reservationId: 387292 });
    expect(cardResultText(t)).toBe(describeResult(t));
    expect(cardResultText(t)).toContain("Confirmation #387292");
  });

  it("DRY_RUN_OK 带可读 slot：照旧显示结果句（dry run 不做色块）", () => {
    const t = task({ status: "DRY_RUN_OK", resultDetail: { slot, pricing: { total: 280 }, unlocked: true } });
    expect(cardResultText(t)).not.toBeNull();
    expect(cardResultText(t)).toBe(describeResult(t));
  });

  it("其他状态的结果句不变", () => {
    for (const status of ["PENDING", "RUNNING", "NOT_BOOKED", "FAILED", "UNKNOWN", "CANCELLED"] as BookingTaskStatus[]) {
      const t = task({ status, resultDetail: { slot, reason: "X" } });
      expect(cardResultText(t)).toBe(describeResult(t));
    }
  });
});

describe("两行时间的标签", () => {
  it("PENDING / RUNNING 仍是 Runs / Plays", () => {
    for (const status of ["PENDING", "RUNNING"] as BookingTaskStatus[]) {
      expect(whenLabels(status)).toEqual({ run: STRINGS.runsAt, play: STRINGS.plays });
    }
    expect(STRINGS.runsAt).toBe("Runs");
    expect(STRINGS.plays).toBe("Plays");
  });

  it("已结束的任务是 Ran / Wanted", () => {
    const finished: BookingTaskStatus[] = ["BOOKED", "DRY_RUN_OK", "NOT_BOOKED", "FAILED", "UNKNOWN", "CANCELLED"];
    for (const status of finished) {
      expect(whenLabels(status)).toEqual({ run: STRINGS.ranAt, play: STRINGS.wanted });
    }
    expect(STRINGS.ranAt).toBe("Ran");
    expect(STRINGS.wanted).toBe("Wanted");
  });
});

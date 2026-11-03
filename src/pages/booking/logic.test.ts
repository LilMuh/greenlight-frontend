import { describe, it, expect } from "vitest";
import {
  addDays, defaultPlayDate, defaultRunAt, northlandsCourseId, occupiedBy, siteToday, toRunAtLocal,
} from "./logic";
import type { BookingTaskDto } from "../../api";

// 测试数据只用 example.test 这类假域名，公开仓库里不放任何真实地址。
const task = (over: Partial<BookingTaskDto> = {}): BookingTaskDto => ({
  id: 1, courseId: 9, courseSlug: "northlands", courseName: "Northlands",
  playDate: "2026-11-08", runAt: "2026-11-03T14:00:00Z", runAtLocal: "2026-11-03T07:00",
  timeStart: "08:00", timeEnd: "10:00", players: 2, maxPrice: 100, sort: "EARLIEST",
  status: "PENDING", resultDetail: null, createdAt: "2026-11-02T20:00:00Z", finishedAt: null,
  creatorLoginEmail: "a@example.test", mine: false, cancellable: false, bookingAccountEmail: null,
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

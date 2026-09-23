import { describe, it, expect } from "vitest";
import {
  sortWeekdays, weekdaysText, parseClock, formatClock, minuteOptions,
  normalizeCourses, normalizeWatch, toDto, defaultFormCourses,
  isCourseInMaintenance, classifyError, groupByOwner, foreignOwnerEmail,
} from "./logic";
import { STRINGS, ERROR_MESSAGES } from "./strings";
import { ApiError, type CourseDto, type WatchConfigDto } from "../../api";

const courseDtos: CourseDto[] = [
  { id: 1, slug: "langara", name: "Langara Golf Course", imageUrl: null, source: "cps", site: "golfvancouver", address: null, rating: null, ratingCount: null, maintenance: false },
  { id: 2, slug: "riverway", name: "Riverway Golf Course", imageUrl: null, source: "cps", site: "golfburnaby", address: null, rating: null, ratingCount: null, maintenance: true },
];
const courses = normalizeCourses(courseDtos);

describe("sortWeekdays / weekdaysText", () => {
  it("ISO 序（周一在前）", () => {
    expect(sortWeekdays(["SUN", "MON", "SAT"])).toEqual(["MON", "SAT", "SUN"]);
  });
  it("空数组 -> 空串；七天全勾 -> Every day", () => {
    expect(weekdaysText([])).toBe("");
    expect(weekdaysText(["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"])).toBe(STRINGS.everyDay);
  });
  it("部分勾选 -> 标签逗号串；认不出的 code 原样保留", () => {
    expect(weekdaysText(["SUN", "SAT"])).toBe("Sat, Sun");
    expect(weekdaysText(["XXX"])).toBe("XXX");
  });
});

describe("parseClock / formatClock / minuteOptions", () => {
  it("正常解析与零填充回写", () => {
    expect(parseClock("16:45")).toEqual({ hour: 16, minute: 45 });
    expect(parseClock("7:05")).toEqual({ hour: 7, minute: 5 });
    expect(formatClock(7, 5)).toBe("07:05");
  });
  it("越界各自 clamp，垃圾输入回 0:0", () => {
    expect(parseClock("99:99")).toEqual({ hour: 23, minute: 59 });
    expect(parseClock("abc")).toEqual({ hour: 0, minute: 0 });
    expect(parseClock(null)).toEqual({ hour: 0, minute: 0 });
  });
  it("minuteOptions：档位内原样；老数据的分钟补进档位并排序", () => {
    expect(minuteOptions(30)).toEqual([0, 30]);
    expect(minuteOptions(45)).toEqual([0, 30, 45]);
  });
});

describe("normalizeCourses / defaultFormCourses / isCourseInMaintenance", () => {
  it("maintenance 只认 === true；默认选中集排除维护中", () => {
    expect(courses[1].maintenance).toBe(true);
    expect(defaultFormCourses(courses)).toEqual([1]);
  });
  it("认不出的 courseId 当作正常（清单没加载完别锁死界面）", () => {
    expect(isCourseInMaintenance(courses, 999)).toBe(false);
    expect(isCourseInMaintenance(courses, 2)).toBe(true);
  });
});

describe("normalizeWatch / toDto", () => {
  it("缺省字段落默认值；courseName 缺失按 courses 查名", () => {
    const record = { id: 7, courseId: 1, weekdays: null } as unknown as WatchConfigDto;
    const watch = normalizeWatch(record, courses);
    expect(watch).toEqual({
      id: 7, courseId: 1, courseName: "Langara Golf Course",
      weekdays: [], timeStart: "06:00", timeEnd: "20:00",
      players: 4, maxPrice: 300, active: true, ownerId: null, ownerEmail: null,
    });
  });
  it("带上主人（管理员按它分组）", () => {
    const watch = normalizeWatch({ id: 7, courseId: 1, ownerId: 3, ownerEmail: "amy@x.com" } as unknown as WatchConfigDto, courses);
    expect(watch.ownerId).toBe(3);
    expect(watch.ownerEmail).toBe("amy@x.com");
  });
  it("active !== false 才算启用（undefined 当启用）", () => {
    const off = normalizeWatch({ id: 1, courseId: 1, active: false } as unknown as WatchConfigDto, courses);
    expect(off.active).toBe(false);
  });
  it("toDto 字段齐全，PUT 请求体形状不变", () => {
    const watch = normalizeWatch({ id: 7, courseId: 1, courseName: "Langara Golf Course", weekdays: ["SAT"], timeStart: "08:00", timeEnd: "12:00", players: 2, maxPrice: 80, active: true }, courses);
    expect(toDto(watch)).toEqual({
      id: 7, courseId: 1, weekdays: ["SAT"], timeStart: "08:00", timeEnd: "12:00",
      players: 2, maxPrice: 80, active: true,
    });
  });
});

// 管理员视图：所有人的 watch 按主人分组
const ADMIN = { id: 9, loginEmail: "admin" };
const owned = (id: number, ownerId: number | null, ownerEmail: string | null) =>
  normalizeWatch({ id, courseId: 1, ownerId, ownerEmail } as unknown as WatchConfigDto, courses);

describe("groupByOwner", () => {
  it("自己一组排最前，其余按邮箱排；组内保持原顺序（新的在前）", () => {
    const groups = groupByOwner(
      [owned(6, 2, "zoe@x.com"), owned(5, 9, "admin"), owned(4, 3, "amy@x.com"), owned(3, 2, "zoe@x.com")],
      ADMIN,
    );
    expect(groups.map((group) => [group.ownerEmail, group.isMe, group.watches.map((watch) => watch.id)])).toEqual([
      ["admin", true, [5]],
      ["amy@x.com", false, [4]],
      ["zoe@x.com", false, [6, 3]],
    ]);
  });
  it("没带主人的（旧后端）算自己的", () => {
    expect(groupByOwner([owned(1, null, null)], ADMIN)).toEqual([
      { ownerId: 9, ownerEmail: "admin", isMe: true, watches: [owned(1, null, null)] },
    ]);
  });
  it("没有 watch 就没有组", () => {
    expect(groupByOwner([], ADMIN)).toEqual([]);
  });
});

describe("foreignOwnerEmail", () => {
  it("别人的 watch 返回主人邮箱；自己的、没带主人的、没找到的都是 null", () => {
    expect(foreignOwnerEmail(owned(1, 3, "amy@x.com"), ADMIN.id)).toBe("amy@x.com");
    expect(foreignOwnerEmail(owned(1, 9, "admin"), ADMIN.id)).toBeNull();
    expect(foreignOwnerEmail(owned(1, null, null), ADMIN.id)).toBeNull();
    expect(foreignOwnerEmail(undefined, ADMIN.id)).toBeNull();
  });
});

describe("classifyError", () => {
  it("非 ApiError（fetch 抛的）= 后端离线，置 offline", () => {
    expect(classifyError(new TypeError("Failed to fetch"))).toEqual({ offline: true, signedOut: false, message: STRINGS.offline });
  });
  it("认识的 code 用对应文案，不置 offline", () => {
    expect(classifyError(new ApiError(409, "WATCH_DUPLICATE", ""))).toEqual({ offline: false, signedOut: false, message: ERROR_MESSAGES.WATCH_DUPLICATE });
  });
  it("认不出的 code 落 genericError——不崩、不谎称离线", () => {
    expect(classifyError(new ApiError(422, "BRAND_NEW_CODE", ""))).toEqual({ offline: false, signedOut: false, message: STRINGS.genericError });
  });
  it("UNAUTHORIZED = 会话没了，页面要回到登录态", () => {
    expect(classifyError(new ApiError(401, "UNAUTHORIZED", ""))).toEqual({
      offline: false, signedOut: true, message: ERROR_MESSAGES.UNAUTHORIZED,
    });
  });
});

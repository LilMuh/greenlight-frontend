import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  buildDates, priceMatch, bookingUrl, groupTeeTimes, computeCards,
  normalizeCourses, maintenanceCourseIds, classifyFailure, shortCourseName,
} from "./logic";
import { STRINGS } from "./strings";
import { ApiError, type CourseDto } from "../../api";

const courseDtos: CourseDto[] = [
  { id: 1, slug: "langara", name: "Langara", imageUrl: "http://img/l.jpg", source: "cps", site: "golfvancouver", address: "290 W 49th Ave, Vancouver, BC V5X 3T4, Canada", rating: 4.3, ratingCount: 1330, maintenance: false },
  { id: 2, slug: "riverway", name: "Riverway", imageUrl: null, source: "cps", site: "golfburnaby", address: null, rating: null, ratingCount: null, maintenance: true },
];
const courses = normalizeCourses(courseDtos);

describe("normalizeCourses / maintenanceCourseIds", () => {
  it("用 slug 当 id，maintenance 只认 === true", () => {
    expect(courses[0]).toMatchObject({ id: "langara", maintenance: false });
    expect(maintenanceCourseIds(courses)).toEqual(["riverway"]);
  });
});

// 边界都取开区间下界（price > 70 才算 high），和档位文案 "$41–70"/"$71–120" 对得上
describe("priceMatch", () => {
  it.each([
    [40, "low", true], [41, "low", false],
    [40, "mid", false], [41, "mid", true], [70, "mid", true], [71, "mid", false],
    [70, "high", false], [71, "high", true], [120, "high", true], [121, "high", false],
    [120, "top", false], [121, "top", true],
    [999, "all", true],
  ] as const)("price=%s bucket=%s -> %s", (price, bucket, expected) => {
    expect(priceMatch(price, bucket)).toBe(expected);
  });
});

describe("buildDates", () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });
  it("今天 + 后 7 天共 8 天，ISO 本地时区零填充", () => {
    vi.setSystemTime(new Date(2026, 8, 19, 15, 30));
    const dates = buildDates();
    expect(dates).toHaveLength(8);
    expect(dates[0].iso).toBe("2026-09-19");
    expect(dates[7].iso).toBe("2026-09-26");
  });
  it("跨月正确", () => {
    vi.setSystemTime(new Date(2026, 8, 30));
    expect(buildDates()[1].iso).toBe("2026-10-01");
  });
});

describe("bookingUrl", () => {
  it("CPS：Date/CourseId/TeeOffTime 范围全带上", () => {
    const url = new URL(bookingUrl({ id: "fraserview", source: "cps", site: "golfvancouver" }, "2026-09-20")!);
    expect(url.origin + url.pathname).toBe("https://golfvancouver.cps.golf/onlineresweb/search-teetime");
    expect(url.searchParams.get("Date")).toBe("2026-09-20");
    expect(url.searchParams.get("CourseId")).toBe("2");
    expect(url.searchParams.get("TeeOffTimeMin")).toBe("0");
    expect(url.searchParams.get("TeeOffTimeMax")).toBe("23.999722222222225");
  });
  it("CPS 认不出的 slug：不带 CourseId，其余参数照旧", () => {
    const url = new URL(bookingUrl({ id: "brand-new", source: "cps", site: "golfburnaby" }, "2026-09-20")!);
    expect(url.searchParams.has("CourseId")).toBe(false);
    expect(url.searchParams.get("Date")).toBe("2026-09-20");
  });
  it("TEI：裸预订页，不拼日期参数（站点会全部忽略）", () => {
    expect(bookingUrl({ id: "nicklaus-north", source: "tei", site: "nicklausnorth" }, "2026-09-20"))
      .toBe("https://nicklausnorth.totaleintegrated.com/Book-a-Tee-Time");
  });
  it("没有 site 或来源不认识 -> null（UI 退回按钮 + toast）", () => {
    expect(bookingUrl({ id: "x", source: "cps", site: null }, "2026-09-20")).toBeNull();
    expect(bookingUrl({ id: "x", source: "mystery", site: "s" }, "2026-09-20")).toBeNull();
  });
});

describe("groupTeeTimes", () => {
  it("按球场分组，/api/courses 的元数据挂上，price/seats 数字化", () => {
    const grouped = groupTeeTimes([
      { courseId: "langara", course: "Langara", time: "07:00", price: "63", availableSeats: "2" },
      { courseId: "langara", course: "Langara", time: "07:30", price: 63, availableSeats: null },
      { courseId: "riverway", course: "Riverway", time: "08:00", price: 45, availableSeats: 4 },
    ], courses);
    expect(grouped).toHaveLength(2);
    const langara = grouped.find((c) => c.id === "langara")!;
    expect(langara.imageUrl).toBe("http://img/l.jpg");
    expect(langara.site).toBe("golfvancouver");
    expect(langara.teeTimes).toEqual([
      { time: "07:00", price: 63, availableSeats: 2 },
      { time: "07:30", price: 63, availableSeats: null },
    ]);
  });
  it("认不出的 courseId：名字退回 course 字段，元数据 null", () => {
    const grouped = groupTeeTimes(
      [{ courseId: "ghost", course: "Ghost GC", time: "09:00", price: 50, availableSeats: null }],
      courses,
    );
    expect(grouped[0]).toMatchObject({ id: "ghost", name: "Ghost GC", imageUrl: null, site: null });
  });
  it("price 解析不了 -> 0；null 入参 -> []", () => {
    const grouped = groupTeeTimes(
      [{ courseId: "langara", course: null, time: "07:00", price: "abc", availableSeats: null }],
      courses,
    );
    expect(grouped[0].teeTimes[0].price).toBe(0);
    expect(groupTeeTimes(null, courses)).toEqual([]);
  });
});

describe("computeCards", () => {
  const day = () => groupTeeTimes([
    { courseId: "langara", course: "Langara", time: "08:00", price: 63, availableSeats: 2 },
    { courseId: "langara", course: "Langara", time: "07:00", price: 80, availableSeats: 4 },
    { courseId: "riverway", course: "Riverway", time: "06:30", price: 45, availableSeats: null },
  ], courses);

  it("排除的球场整卡消失", () => {
    const cards = computeCards(day(), ["riverway"], "all", "time");
    expect(cards.map((card) => card.course.id)).toEqual(["langara"]);
  });
  it("价格筛后剩余时段保留，cheapest/earliest 取自筛后集合", () => {
    // mid = $41–70：langara 只剩 08:00@63，riverway 保住 06:30@45
    const cards = computeCards(day(), [], "mid", "time");
    const langara = cards.find((card) => card.course.id === "langara")!;
    expect(langara.teeTimes).toEqual([{ time: "08:00", price: 63, availableSeats: 2 }]);
    expect(langara.cheapest).toBe(63);
    expect(langara.earliest).toBe("08:00");
  });
  it("价格筛掉全部时段的卡不出现", () => {
    // top = >$120：两家都没有
    expect(computeCards(day(), [], "top", "time")).toEqual([]);
  });
  it("sort=time 按最早时段升序", () => {
    expect(computeCards(day(), [], "all", "time").map((card) => card.course.id)).toEqual(["riverway", "langara"]);
  });
  it("sort=price 按最低价升序", () => {
    expect(computeCards(day(), [], "all", "price").map((card) => card.course.id)).toEqual(["riverway", "langara"]);
  });
  it("sort=rec 评分高在前，null 评分排最后（不是当 0）", () => {
    expect(computeCards(day(), [], "all", "rec").map((card) => card.course.id)).toEqual(["langara", "riverway"]);
  });
});

describe("shortCourseName", () => {
  it("去掉 Golf / Course 关键词", () => {
    expect(shortCourseName("Langara Golf Course")).toBe("Langara");
    expect(shortCourseName("Fraserview Golf Course")).toBe("Fraserview");
  });
  it("Golf & Country Club 这类：连 & 一起收拾干净", () => {
    expect(shortCourseName("Hazelmere Golf & Country Club")).toBe("Hazelmere Country Club");
  });
  it("不含关键词的名字原样返回", () => {
    expect(shortCourseName("Kings Links by the Sea")).toBe("Kings Links by the Sea");
  });
  it("整个名字都是关键词时退回原名，不给空白", () => {
    expect(shortCourseName("Golf Course")).toBe("Golf Course");
  });
});

describe("classifyFailure", () => {
  it("非 ApiError（fetch 抛的）= 根本没连上", () => {
    expect(classifyFailure(new TypeError("Failed to fetch"))).toBe(STRINGS.offline);
  });
  it("UNAUTHORIZED -> 部署配置问题的文案", () => {
    expect(classifyFailure(new ApiError(401, "UNAUTHORIZED", ""))).toBe(STRINGS.unauthorized);
  });
  it("5xx -> 后端出错文案", () => {
    expect(classifyFailure(new ApiError(502, null, ""))).toBe(STRINGS.serverError);
  });
  it("其它 4xx -> 笼统加载失败", () => {
    expect(classifyFailure(new ApiError(404, "ENDPOINT_NOT_FOUND", ""))).toBe(STRINGS.loadFailed);
  });
});

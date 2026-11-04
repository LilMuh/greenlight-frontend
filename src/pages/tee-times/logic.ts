// tee-time 页的纯逻辑层。这里的函数不操作 DOM，也不发请求。
// 输出只由输入决定，因此全部可以单测。
import { ApiError, type CourseDto, type TeeTimeDto } from "../../api";
import { STRINGS, type PriceBucket, type SortBy } from "./strings";

export interface CourseView {
  id: string; // slug，与 tee-time 的 courseId 一致
  name: string;
  imageUrl: string | null;
  source: string | null;
  site: string | null;
  address: string | null;
  rating: number | null;
  ratingCount: number | null;
  maintenance: boolean;
}

export interface TeeSlot {
  time: string;
  price: number;
  availableSeats: number | null;
}

export interface CourseDay {
  id: string;
  name: string;
  imageUrl: string | null;
  source: string | null;
  site: string | null;
  address: string | null;
  rating: number | null;
  ratingCount: number | null;
  teeTimes: TeeSlot[];
}

export interface Card {
  course: CourseDay;
  teeTimes: TeeSlot[];
  cheapest: number;
  earliest: string;
}

// --- Booking deep links -----------------------------------------------------
// 数据库没有存预订页 URL。这里按 source + site + slug 拼接出来。
// CPS 的参数名（Date / CourseId / TeeOffTimeMin/Max）来自真站实测。
// 不带 Players。原因：落地页默认 Any，已经最宽松。传数字反而会筛掉时段。
const CPS_DAY_MIN = "0";
const CPS_DAY_MAX = "23.999722222222225"; // CPS 搜索页自己用的上界

// slug → CPS 站内球场 id。/api/courses 不返回这个 id，因此前端保留一份。
// - id 只在站点内唯一。这张表按全局唯一的 slug 索引，因此不会撞号。
// - 表里没有的 slug 不带 CourseId。这时落地页列出当天全部球场。
// - key 必须逐字等于后端的 slug（查表用 course.id）。因此 key 保持 kebab-case，并统一加引号。
const CPS_COURSE_IDS: Record<string, number> = {
  "langara": 1, "fraserview": 2, "mccleery": 3, // golfvancouver
  "burnaby-mountain": 1, "riverway": 2, // golfburnaby
  // westcoastgolfgroup。Swaneset 有两条球道，各有自己的 id，因此分成两项
  "hazelmere": 1, "belmont": 2, "swaneset-resort": 3, "swaneset-links": 4,
  "kings-links": 1, // kingslinks，整个站点只有这一个球场
  "northlands": 1, // northlands，整个站点只有这一个球场
};

// 拼接某球场某天的预订页链接。拼不出时返回 null，UI 退化成按钮 + toast。
// TEI 的订位页没有日期深链（实测各种日期参数都被忽略）。因此只给不带参数的页面链接。
export function bookingUrl(
  course: { id: string; source: string | null; site: string | null },
  isoDate: string,
): string | null {
  if (!course.site) return null;
  if (course.source === "tei") {
    return `https://${course.site}.totaleintegrated.com/Book-a-Tee-Time`;
  }
  if (course.source !== "cps") return null;
  const url = new URL(`https://${course.site}.cps.golf/onlineresweb/search-teetime`);
  url.searchParams.set("Date", isoDate);
  const cpsCourseId = CPS_COURSE_IDS[course.id];
  if (cpsCourseId != null) url.searchParams.set("CourseId", String(cpsCourseId));
  url.searchParams.set("TeeOffTimeMin", CPS_DAY_MIN);
  url.searchParams.set("TeeOffTimeMax", CPS_DAY_MAX);
  return url.toString();
}

// 日期条的数据源：从今天起连续 8 天。每天带一个本地时区的 "YYYY-MM-DD"。
export function buildDates(): { date: Date; iso: string }[] {
  const today = new Date();
  today.setHours(0, 0, 0, 0); // 把当前时刻设为当天零点。原因：这组对象表示日期，不表示时刻
  const dates = [];
  // 今天加后 7 天，共 8 天，与 scraper 的抓取范围一致
  for (let index = 0; index < 8; index++) {
    const date = new Date(today);
    date.setDate(today.getDate() + index);
    dates.push({ date, iso: toISO(date) });
  }
  return dates;
}

// 返回本地时区的 "YYYY-MM-DD"。不用 toISOString()。
// 原因：toISOString() 按 UTC 计算，温哥华晚上的日期会变成第二天。
export function toISO(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

// 每档的下界都是开区间（price > 70 才算 high）。这样与档位文案里的 "$71–120" 一致。
export function priceMatch(price: number, bucket: PriceBucket): boolean {
  if (bucket === "all") return true;
  if (bucket === "low") return price <= 40;
  if (bucket === "mid") return price > 40 && price <= 70;
  if (bucket === "high") return price > 70 && price <= 120;
  if (bucket === "top") return price > 120;
  return true;
}

// 用 slug 做标识。原因：tee-time 的 courseId 也是 slug，两边能直接对应。
// address / rating / ratingCount 来自 Google Maps，可能为 null。卡片对每个字段分别降级显示。
export function normalizeCourses(courseDtos: CourseDto[]): CourseView[] {
  return courseDtos.map((course) => ({
    id: course.slug,
    name: course.name,
    imageUrl: course.imageUrl,
    source: course.source ?? null,
    site: course.site ?? null,
    address: course.address ?? null,
    rating: course.rating ?? null,
    ratingCount: course.ratingCount ?? null,
    maintenance: course.maintenance === true,
  }));
}

// 维护中球场的 id 列表。它是筛选的默认排除项，init 和 Reset 都用它。
export function maintenanceCourseIds(courses: CourseView[]): string[] {
  return courses.filter((course) => course.maintenance).map((course) => course.id);
}

// 把 /api/tee-times 的扁平列表按球场分组，再挂上 /api/courses 的元数据（照片、评分等）。
// 缺少的字段单独降级（例如 seats 缺失时为 null）。一条脏数据不会影响整页。
export function groupTeeTimes(
  teeTimeList: TeeTimeDto[] | null | undefined,
  courses: CourseView[],
): CourseDay[] {
  const byCourseId = new Map<string, CourseDay>();
  for (const teeTime of teeTimeList || []) {
    // courseId 是球场 slug（后端契约保证非空）。用它在球场清单里查元数据。
    // 清单里没有这个球场时（例如 /api/courses 请求失败），只降级元数据，分组照常进行
    const courseId = teeTime.courseId;
    const matchedCourse = courses.find((course) => course.id === courseId);
    if (!byCourseId.has(courseId)) {
      byCourseId.set(courseId, {
        id: courseId,
        name: matchedCourse ? matchedCourse.name : teeTime.course,
        // 元数据来自 /api/courses。查不到球场时全部为 null，卡片对每个字段分别降级
        imageUrl: matchedCourse ? matchedCourse.imageUrl : null,
        source: matchedCourse ? matchedCourse.source : null,
        site: matchedCourse ? matchedCourse.site : null,
        address: matchedCourse ? matchedCourse.address : null,
        rating: matchedCourse ? matchedCourse.rating : null,
        ratingCount: matchedCourse ? matchedCourse.ratingCount : null,
        teeTimes: [],
      });
    }
    byCourseId.get(courseId)!.teeTimes.push({
      time: teeTime.time,
      price: Number(teeTime.price) || 0,
      availableSeats: teeTime.availableSeats != null ? Number(teeTime.availableSeats) : null,
    });
  }
  return [...byCourseId.values()];
}

// 把当天数据变成要显示的卡片：
// 1. 去掉被排除的球场。
// 2. 按价格档过滤时段。时段全被过滤掉的卡片整张不显示。
// 3. 算出每张卡片的最低价和最早时段。
// 4. 按选定方式排序。
export function computeCards(
  dayData: CourseDay[],
  excludedCourseIds: string[],
  priceBucket: PriceBucket,
  sortBy: SortBy,
): Card[] {
  const cards: Card[] = dayData
    .filter((course) => !excludedCourseIds.includes(course.id))
    .map((course) => ({
      course,
      teeTimes: course.teeTimes.filter((teeTime) => priceMatch(teeTime.price, priceBucket)),
    }))
    .filter((card) => card.teeTimes.length > 0)
    .map(({ course, teeTimes }) => ({
      course,
      teeTimes,
      cheapest: Math.min(...teeTimes.map((teeTime) => teeTime.price)),
      earliest: teeTimes.map((teeTime) => teeTime.time).slice().sort()[0],
    }));

  if (sortBy === "price") cards.sort((left, right) => left.cheapest - right.cheapest);
  else if (sortBy === "time") cards.sort((left, right) => left.earliest.localeCompare(right.earliest));
  // "rec" 表示评分高的排前面。rating 来自 Google Maps 抓取，可能为 null。
  // 没有评分的排到最后，不当成 0 混进低分区。原因：那样会把「没数据」显示成「评价差」。
  else cards.sort((left, right) => (right.course.rating ?? -1) - (left.course.rating ?? -1));

  return cards;
}

// 卡片标题用的短名："Langara Golf Course" → "Langara"。
// 去掉 Golf/Course 这类词。原因：
// - 每张卡片都重复这些词。
// - 它们会把手机上的球场名挤成两行。
// 完整名留在 title 提示里，因此不损失信息。
// "Golf & Country Club" 的 & 和 Golf 一起去掉，这样不会剩下单独一个 &。
// 全名都是这类词时，返回原名，不渲染空标题。
export function shortCourseName(name: string): string {
  const short = name
    .replace(/\bGolf\b\s*&\s*/gi, "")
    .replace(/\b(Golf|Course)\b/gi, "")
    .replace(/\s{2,}/g, " ")
    .trim();
  return short || name;
}

// 把一次请求失败翻译成给用户看的一句话。要分清三种原因：
// - 没连上：去启动服务。
// - 密钥不对：去改部署配置。
// - 后端 5xx：稍等一会再试。
export function classifyFailure(error: unknown): string {
  if (!(error instanceof ApiError)) return STRINGS.offline; // fetch 自己抛的错误表示没连上后端
  if (error.code === "UNAUTHORIZED") return STRINGS.unauthorized;
  if (error.status >= 500) return STRINGS.serverError;
  return STRINGS.loadFailed;
}

// tee-time 页的纯逻辑层：从旧 main.js 逐字搬运，唯一结构性改动是把对模块级
// state 的闭包引用改成显式参数（courses / excludedCourseIds / ...），好让它们可测。
import { ApiError, type CourseDto, type TeeTimeDto } from "../../api";
import { STRINGS, type PriceBucket, type SortBy } from "./strings";

export interface CourseView {
  id: string; // slug，和 tee-time 的 courseId 对得上
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
//
// tee_time / course 表里都没存预订页 URL，只能按 source + site + slug 反推。后端邮件
// 里那条 BOOK 链接（BookingLinkBuilder + greenlight.mail.booking-url-template）做的是
// 同一件事，但那份模板在后端配置里，没有任何 API 暴露出来，所以这里另拼一份。
//
// 参数名 Date / CourseId / TeeOffTimeMin / TeeOffTimeMax 是 2026-08-06 在
// golfvancouver.cps.golf 上实测的：改这两个参数，页面自己发出的 TeeTimes 请求里
// searchDate / courseIds 会跟着变，左侧球场下拉也会选中对应球场。注意这套首字母大写的
// 参数名，和它转发给自己后端 API 时用的 searchDate / courseIds 不是一套。
//
// 不带 Player：这一页没有「几个人打」这个概念，落地页的 Players 默认就是 Any，
// 那已经是最宽松的，硬塞一个数字反而会把时段筛掉。
const CPS_DAY_MIN = "0";
const CPS_DAY_MAX = "23.999722222222225"; // CPS 搜索页自己用的上界

// slug → CPS 内部球场 id。CPS 用一个小整数区分同站点下的球场，/api/courses 不返回它，
// 只能在前端留一份，来源是 greenlight-scraper 里按站点分的那几个枚举
// （GolfVancouverCourseId / GolfBurnabyCourseId / WestCoastGolfGroupCourseId /
// KingsLinksCourseId）。
// 这个 id 只在站点内唯一——四个站点都有 1 号球场——但这张表按 slug 索引，slug 全局唯一，
// 且 bookingUrl 拿到 id 时已经用 course.site 拼好了域名，所以撞号不影响。
// 认不出的 slug 就不带 CourseId——落地页会列出当天全部球场，日期仍然是对的。
const CPS_COURSE_IDS: Record<string, number> = {
  langara: 1, fraserview: 2, mccleery: 3, // golfvancouver
  "burnaby-mountain": 1, riverway: 2, // golfburnaby
  // westcoastgolfgroup。Swaneset 在 CPS 里是两条各自有 id 的 18 洞球道，分开两行
  hazelmere: 1, belmont: 2, "swaneset-resort": 3, "swaneset-links": 4,
  "kings-links": 1, // kingslinks，整个站点就这一个球场
};

// TEI（Total e Integrated）的订位页【没有日期深链】：2026-09-15 实测 ?date= / ?Date= /
// ?TeeDate= / ?SelectedDate= / 路径段全被忽略，一律回今天，日期只能靠页面里的回发。
// 所以这里只给裸页面——硬拼一个站点不认的参数，人点进去还是落在今天，比不带更困惑。
// 后端邮件里那条链接同理，见 application.yml 的 booking-url-template.tei。
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

export function buildDates(): { date: Date; iso: string }[] {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const dates = [];
  // 今天 + 后 7 天，共 8 天，和 scraper 的抓取范围对齐
  for (let index = 0; index < 8; index++) {
    const date = new Date(today);
    date.setDate(today.getDate() + index);
    dates.push({ date, iso: toISO(date) });
  }
  return dates;
}

export function toISO(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

// 边界都取开区间下界（price > 70 才算 high），和档位文案里的 "$71–120" 对得上。
export function priceMatch(price: number, bucket: PriceBucket): boolean {
  if (bucket === "all") return true;
  if (bucket === "low") return price <= 40;
  if (bucket === "mid") return price > 40 && price <= 70;
  if (bucket === "high") return price > 70 && price <= 120;
  if (bucket === "top") return price > 120;
  return true;
}

// 用 slug 当标识：tee-time 的 courseId 也是 slug，两边好对应。
// address / rating / ratingCount 来自 Google Maps，可能为 null，卡片各自降级。
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

// 维护中的球场（course.maintenance）：上游站点抓不动，后端已经把它摘出去了。
// 这里当作筛选的默认排除项用——init 和 Reset 都从这里取，两边不各写一遍。
export function maintenanceCourseIds(courses: CourseView[]): string[] {
  return courses.filter((course) => course.maintenance).map((course) => course.id);
}

// Turn a flat /api/tee-times list into the design's per-course grouping. The
// backend gives { courseId, course, time, price, availableSeats, ... }; the seat
// count may be missing, so it degrades to null rather than breaking the card.
export function groupTeeTimes(
  teeTimeList: TeeTimeDto[] | null | undefined,
  courses: CourseView[],
): CourseDay[] {
  const byCourseId = new Map<string, CourseDay>();
  for (const teeTime of teeTimeList || []) {
    const courseKey = String(teeTime.courseId ?? teeTime.course ?? "");
    const matchedCourse = courses.find((course) => course.id === courseKey || course.name === courseKey);
    const courseId = matchedCourse ? matchedCourse.id : courseKey;
    if (!byCourseId.has(courseId)) {
      byCourseId.set(courseId, {
        id: courseId,
        name: matchedCourse ? matchedCourse.name : String(teeTime.course ?? courseKey),
        // 照片、地址、评分、source/site 都来自 /api/courses，tee-time 接口不带它们，
        // 在这里挂上去。source/site 是拼预订链接用的，取不到就退化成不可点的按钮。
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
  // "rec" = 评分高的排前面。rating 是 Google Maps 抓来的，可能为 null——没评分的
  // 排到最后，而不是当成 0 混进低分区，那会把「没数据」说成「评价差」。
  else cards.sort((left, right) => (right.course.rating ?? -1) - (left.course.rating ?? -1));

  return cards;
}

// 卡片标题用的短名："Langara Golf Course" → "Langara"。Golf/Course 这类词每张卡
// 都重复、又把手机上的球场名挤成两行，去掉不损失信息（完整名留在 title 提示里）。
// "Golf & Country Club" 的 & 跟着 Golf 一起摘，免得剩下一个孤零零的 &。
// 全名都是关键词时退回原名，不渲染空标题。
export function shortCourseName(name: string): string {
  const short = name
    .replace(/\bGolf\b\s*&\s*/gi, "")
    .replace(/\b(Golf|Course)\b/gi, "")
    .replace(/\s{2,}/g, " ")
    .trim();
  return short || name;
}

/**
 * 旧 noteFailure 的分类部分（offline 标记归 reducer 管）。
 * 这一页是只读的，任何一个读请求挂了结果都一样：没有数据可显示，走空态。
 * 但**原因**对人的意思完全不同——后端没开要去起服务，密钥不对要去改部署配置，
 * 后端 500 则什么都不用做。之前一律说「Backend offline」，会让人跑去查一台好好的机器。
 */
export function classifyFailure(error: unknown): string {
  if (!(error instanceof ApiError)) return STRINGS.offline; // fetch 自己抛的 = 根本没连上
  if (error.code === "UNAUTHORIZED") return STRINGS.unauthorized;
  if (error.status >= 500) return STRINGS.serverError;
  return STRINGS.loadFailed;
}

// tee-time 页的纯逻辑层：不碰 DOM、不发请求，输入什么就返回什么，全部可以单测。
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
// 数据库没存预订页 URL，按 source + site + slug 拼出来。
// CPS 的参数名（Date / CourseId / TeeOffTimeMin/Max）是在真站上实测出来的。
// 不带 Players：落地页默认 Any 已是最宽松，塞数字反而会筛掉时段。
const CPS_DAY_MIN = "0";
const CPS_DAY_MAX = "23.999722222222225"; // CPS 搜索页自己用的上界

// slug → CPS 站内球场 id（/api/courses 不返回它，只能前端留一份）。
// id 只在站点内唯一，但这张表按全局唯一的 slug 索引，不怕撞号；
// 认不出的 slug 就不带 CourseId，落地页退化成列出当天全部球场。
const CPS_COURSE_IDS: Record<string, number> = {
  langara: 1, fraserview: 2, mccleery: 3, // golfvancouver
  "burnaby-mountain": 1, riverway: 2, // golfburnaby
  // westcoastgolfgroup。Swaneset 是两条各自有 id 的球道，分开两行
  hazelmere: 1, belmont: 2, "swaneset-resort": 3, "swaneset-links": 4,
  "kings-links": 1, // kingslinks，整个站点就这一个球场
};

// 拼某球场某天的预订页链接；拼不出返回 null（UI 退化成按钮 + toast）。
// TEI 的订位页没有日期深链（各种日期参数实测都被忽略），所以只给裸页面链接。
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

// 日期条的数据源：今天起连续 8 天，每天配一个本地时区的 "YYYY-MM-DD"。
export function buildDates(): { date: Date; iso: string }[] {
  const today = new Date();
  today.setHours(0, 0, 0, 0); // 把「此刻」抹成当天零点：这组对象表示日期，不是时刻
  const dates = [];
  // 今天 + 后 7 天，共 8 天，和 scraper 的抓取范围对齐
  for (let index = 0; index < 8; index++) {
    const date = new Date(today);
    date.setDate(today.getDate() + index);
    dates.push({ date, iso: toISO(date) });
  }
  return dates;
}

// 本地时区的 "YYYY-MM-DD"。不用 toISOString()：那个按 UTC 算，温哥华的晚上会串成第二天。
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

// 维护中球场的 id 列表：筛选的默认排除项，init 和 Reset 都从这里取。
export function maintenanceCourseIds(courses: CourseView[]): string[] {
  return courses.filter((course) => course.maintenance).map((course) => course.id);
}

// 把 /api/tee-times 的扁平列表按球场分组，并把 /api/courses 的元数据（照片、评分等）挂上去。
// 缺什么降级什么（seats 缺就 null），不让一条脏数据毁掉整页。
export function groupTeeTimes(
  teeTimeList: TeeTimeDto[] | null | undefined,
  courses: CourseView[],
): CourseDay[] {
  const byCourseId = new Map<string, CourseDay>();
  for (const teeTime of teeTimeList || []) {
    // 这条时段自称属于谁：优先 courseId（slug），缺了退回球场名，都缺就空串
    const courseKey = String(teeTime.courseId ?? teeTime.course ?? "");
    // 拿 key 去球场清单认亲：key 可能是 slug 也可能是名字，两个字段都试
    const matchedCourse = courses.find((course) => course.id === courseKey || course.name === courseKey);
    const courseId = matchedCourse ? matchedCourse.id : courseKey;
    if (!byCourseId.has(courseId)) {
      byCourseId.set(courseId, {
        id: courseId,
        name: matchedCourse ? matchedCourse.name : String(teeTime.course ?? courseKey),
        // 元数据来自 /api/courses；认亲失败就全 null，卡片各自降级
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

// 把当天数据变成要显示的卡片：去掉被排除的球场、按价格档过滤时段，
// 时段全被滤光的卡整张消失，剩下的算出最低价/最早时段，再按选定方式排序。
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

// 把一次请求失败翻译成给人看的一句话。三种原因要说清楚：
// 没连上（去起服务）、密钥不对（去改部署配置）、后端 5xx（等一会就好）。
export function classifyFailure(error: unknown): string {
  if (!(error instanceof ApiError)) return STRINGS.offline; // fetch 自己抛的 = 根本没连上
  if (error.code === "UNAUTHORIZED") return STRINGS.unauthorized;
  if (error.status >= 500) return STRINGS.serverError;
  return STRINGS.loadFailed;
}

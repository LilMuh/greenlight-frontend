// 订场页的纯逻辑层：不碰 DOM、不发请求，全部可以单测。
import type { BookingTaskDto, CourseDto } from "../../api";

// 站点时区，与后端 SiteRule.zone 一致（America/Vancouver）。
// BC 已改成全年 UTC-7，但这里只用 Intl 按时区名取日期，不写死任何偏移，
// 这样 tzdata 变了也不用改代码；同理绝不用浏览器时区（研究 Pitfall 11）。
export const SITE_ZONE = "America/Vancouver";

/** 站点放号的本地时刻：每天 07:00 放出第 5 天的号（D-07 / 研究 Q8）。 */
export const RELEASE_TIME = "07:00";
/** 放号后第几天可订：run 当天 + 5 天。 */
export const RELEASE_DAYS_AHEAD = 5;

/** 站点本地「今天」，yyyy-MM-dd。now 由调用方传入，便于测试。 */
export function siteToday(now: Date): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: SITE_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const pick = (type: string) => parts.find((part) => part.type === type)?.value ?? "";
  return `${pick("year")}-${pick("month")}-${pick("day")}`;
}

/** 按日历日加减天数（与时区无关，用 UTC 做纯日期运算）。 */
export function addDays(isoDate: string, days: number): string {
  const [year, month, day] = isoDate.split("-").map(Number);
  const moved = new Date(Date.UTC(year, month - 1, day + days));
  return moved.toISOString().slice(0, 10);
}

/** 运行时间的缺省值：站点本地明天 07:00。 */
export function defaultRunAt(now: Date): { date: string; time: string } {
  return { date: addDays(siteToday(now), 1), time: RELEASE_TIME };
}

/** 打球日期的缺省值：运行日 + 5 天，也就是那天 07:00 放出的那一天。 */
export function defaultPlayDate(runAtDate: string): string {
  return addDays(runAtDate, RELEASE_DAYS_AHEAD);
}

/** 拼成后端要的站点本地 yyyy-MM-ddTHH:mm（不带时区，后端按 SiteRule.zone 解释）。 */
export function toRunAtLocal(date: string, time: string): string {
  return `${date}T${time}`;
}

/**
 * D-09：同一个运行时间只能有一个活动任务。返回占着 runAtLocal 的 PENDING / RUNNING 任务，没有则 null。
 * 占用者一律从 scheduled 列表里找——后端 409 的 message 只带任务号，不带邮箱（05-06）。
 */
export function occupiedBy(scheduled: BookingTaskDto[], runAtLocal: string): BookingTaskDto | null {
  return (
    scheduled.find(
      (task) => (task.status === "PENDING" || task.status === "RUNNING") && task.runAtLocal === runAtLocal,
    ) ?? null
  );
}

/** Northlands 的球场 id：按 slug 找，不写死数字 id（库里的 id 由序列分配）。 */
export function northlandsCourseId(courses: Pick<CourseDto, "id" | "slug">[]): number | null {
  return courses.find((course) => course.slug === "northlands")?.id ?? null;
}

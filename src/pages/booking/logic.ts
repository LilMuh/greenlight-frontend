// 订场页的纯逻辑层：不碰 DOM、不发请求，全部可以单测。
import type { BookingTaskDto, CourseDto, UserDto } from "../../api";
import { STRINGS } from "./strings";

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
export function occupiedBy(
  scheduled: BookingTaskDto[],
  runAtLocal: string,
  excludeId: number | null = null,
): BookingTaskDto | null {
  return (
    scheduled.find(
      (task) =>
        // 编辑中的任务自己不算占用，后端 requireRunAtFree 同样排除自己
        task.id !== excludeId &&
        (task.status === "PENDING" || task.status === "RUNNING") &&
        task.runAtLocal === runAtLocal,
    ) ?? null
  );
}

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;

/**
 * yyyy-MM-dd 的短星期（Sun..Sat），格式不对返回 null。
 * 纯日历日：用 Date.UTC + getUTCDay，和浏览器时区无关，与 addDays 同理（研究 Pitfall 11）。
 * 不用 Intl / toLocale*：结果会随语言环境变。
 */
export function weekdayShort(isoDate: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(isoDate)) return null;
  const [year, month, day] = isoDate.split("-").map(Number);
  return WEEKDAYS[new Date(Date.UTC(year, month - 1, day)).getUTCDay()];
}

/** 拆开站点本地的 yyyy-MM-ddTHH:mm；null 或格式不对返回 null。 */
export function runParts(runAtLocal: string | null): { date: string; time: string } | null {
  const match = runAtLocal ? /^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})$/.exec(runAtLocal) : null;
  return match ? { date: match[1], time: match[2] } : null;
}

// 星期拿不到就省略，不猜
const withWeekday = (date: string, rest: string): string => {
  const weekday = weekdayShort(date);
  return `${weekday ? `${weekday} ` : ""}${date}${rest}`;
};

/** 运行行：「Tue 2026-11-03 07:00」。没有站点本地时间就原样显示 runAt。 */
export function runLineText(task: Pick<BookingTaskDto, "runAtLocal" | "runAt">): string {
  const parts = runParts(task.runAtLocal);
  return parts ? withWeekday(parts.date, ` ${parts.time}`) : task.runAt;
}

/** 打球行：「Thu 2026-11-05 · 07:00–10:00」。 */
export function playLineText(task: Pick<BookingTaskDto, "playDate" | "timeStart" | "timeEnd">): string {
  return withWeekday(task.playDate, ` · ${task.timeStart}–${task.timeEnd}`);
}

/** Northlands 的球场 id：按 slug 找，不写死数字 id（库里的 id 由序列分配）。 */
export function northlandsCourseId(courses: Pick<CourseDto, "id" | "slug">[]): number | null {
  return courses.find((course) => course.slug === "northlands")?.id ?? null;
}

// --- 入口可见性与展示 -------------------------------------------------------------
// 注意：这里只决定「显示什么」。建、查、取消的权限全由后端 BookingTaskService 判定（05-06），
// 前端藏起来不是安全措施。

/** D-15 / D-16：管理员和开启了订场的用户能看到订场页的列表；未登录、未开启的看不到。 */
export function canSeeBooking(user: UserDto | null | undefined): boolean {
  return !!user && (user.admin || user.enableAutoBooking);
}

/** D-15：管理员能看能取消，但不能建任务；只有开启了订场的普通用户看得到建任务表单。 */
export function canCreate(user: UserDto | null | undefined): boolean {
  return !!user && !user.admin && user.enableAutoBooking;
}

/** D-02 / D-16：订场账号邮箱由后端动态给；scraper 读不到时是 null，显示 Unknown，不猜。 */
export function accountLabel(task: BookingTaskDto): string {
  return task.bookingAccountEmail ?? STRINGS.unknown;
}

// resultDetail 来自后端落库的 JSON（05-07 映射表），键可能缺、类型可能不对：一律收窄，缺了就省略，绝不抛错。
function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}
const asString = (value: unknown): string | null => (typeof value === "string" && value ? value : null);
const asNumber = (value: unknown): number | null =>
  typeof value === "number" && Number.isFinite(value) ? value : null;
const money = (value: number | null): string | null => (value == null ? null : `$${value.toFixed(2)}`);

// 「08:10 on 2026-11-08 for 2 players」这类时段短语；slot 读不出就是 null
function slotPhrase(detail: Record<string, unknown>): string | null {
  const slot = asRecord(detail.slot);
  const time = asString(slot?.time);
  const date = asString(slot?.date);
  if (!time || !date) return null;
  const players = asNumber(slot?.players);
  const who = players != null ? ` for ${players} ${players === 1 ? "player" : "players"}` : "";
  return `${time} on ${date}${who}`;
}

function pricePhrase(detail: Record<string, unknown>): string | null {
  const pricing = asRecord(detail.pricing);
  const total = money(asNumber(pricing?.total));
  if (total) return `total ${total}`;
  const subTotal = money(asNumber(pricing?.subTotal));
  return subTotal ? `subtotal ${subTotal}, tax unknown` : null;
}

const NOT_BOOKED_REASONS: Record<string, string> = {
  NOT_RELEASED: "Tee times for that day weren't released yet when the task ran.",
  NO_MATCHING_SLOT: "No slot matched your time window, players and price.",
  ALL_CANDIDATES_FAILED: "Matching slots were found but none could be locked or passed the site's checks.",
  NO_TRUSTED_DATA: "The site never returned usable data before the deadline.",
  STARTED_AFTER_DEADLINE: "The task started after its deadline.",
  // 05-07：后端领取时已过运行窗口（例如后端当时没在跑），任务没有补跑
  MISSED_WINDOW: "The run window was missed (the backend wasn't running in time), so the task didn't run.",
};

/**
 * 一条任务的状态与结果，给人看的一句话（英文）。
 * 映射来自 05-07 的结果表；UNKNOWN 明说「系统不会重试」——D-06：不重发、不核对，由人去站点确认。
 */
export function describeResult(task: BookingTaskDto): string {
  const detail = asRecord(task.resultDetail) ?? {};
  switch (task.status) {
    case "PENDING":
      return "Waiting for its run time.";
    case "RUNNING":
      return "Running now — this can take a few minutes.";
    case "CANCELLED":
      return "Cancelled before it ran.";
    case "DRY_RUN_OK": {
      const parts = ["Dry run — nothing was booked."];
      const slot = slotPhrase(detail);
      const price = pricePhrase(detail);
      if (slot) parts.push(`It would have booked ${slot}${price ? `, ${price}` : ""}.`);
      parts.push(detail.unlocked === true ? "The held slot was released." : "Slot release was not confirmed.");
      return parts.join(" ");
    }
    case "BOOKED": {
      const slot = slotPhrase(detail);
      const price = pricePhrase(detail);
      const reservationId = asNumber(detail.reservationId);
      return [
        slot ? `Booked ${slot}${price ? `, ${price}` : ""}.` : "Booked.",
        reservationId != null ? `Confirmation #${reservationId}.` : "",
      ].filter(Boolean).join(" ");
    }
    case "NOT_BOOKED": {
      const reason = asString(detail.reason);
      const base = (reason && NOT_BOOKED_REASONS[reason]) || "Not booked.";
      const step = asString(detail.failedStep);
      return step ? `${base} (Last failed step: ${step}.)` : base;
    }
    case "FAILED": {
      const cause = asString(detail.cause);
      const code = asString(detail.code);
      if (cause === "SCRAPER_UNREACHABLE") return "The booking service couldn't be reached — nothing was ordered.";
      if (cause === "REQUEST_REJECTED") return "The booking service rejected the request — nothing was ordered.";
      if (code) return `The booking failed (${code}) — nothing was ordered.`;
      return "The booking failed — nothing was ordered.";
    }
    case "UNKNOWN": {
      const base = "Result unknown — please check the Northlands site to confirm. The system will not retry.";
      return asString(detail.cause) === "RESTARTED_WHILE_RUNNING"
        ? `${base} (The backend restarted while this was running.)`
        : base;
    }
  }
}

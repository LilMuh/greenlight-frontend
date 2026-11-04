// config 页的纯逻辑层。这里的函数不操作 DOM，也不发请求，因此全部可以单测。
import { ApiError, type CourseDto, type WatchConfigDto } from "../../api";
import {
  ERROR_MESSAGES, MINUTE_CHOICES, PLAYERS_DEFAULT, PRICE_DEFAULT, STRINGS,
  TIME_END_DEFAULT, TIME_START_DEFAULT, WEEKDAYS,
} from "./strings";

/** /api/courses 归一化后的引用。config 页用数字 id，因为 watch-config 按数字 id 关联球场。 */
export interface CourseRef {
  id: number;
  slug: string;
  name: string;
  maintenance: boolean;
}

/** 一条 watch 在 UI 里的形状。一条 watch 只对应一个球场。 */
export interface WatchView {
  id: number;
  courseId: number;
  courseName: string;
  weekdays: string[];
  timeStart: string;
  timeEnd: string;
  players: number;
  maxPrice: number;
  active: boolean;
  ownerId: number | null; // 旧后端不返回主人，这时为 null
  ownerEmail: string | null;
}

/** 管理员视图里的一组：一个主人名下的 watch。 */
export interface WatchGroup {
  ownerId: number;
  ownerEmail: string;
  isMe: boolean;
  watches: WatchView[];
}

// 必须带上 maintenance。下面几处都依赖它：
// - 默认全选。
// - 球场能不能点。
// - 维护徽章。
// - 卡片上的维护说明。
export function normalizeCourses(courseDtos: CourseDto[]): CourseRef[] {
  return courseDtos.map((course) => ({
    id: course.id,
    slug: course.slug,
    name: course.name,
    maintenance: course.maintenance === true,
  }));
}

// 按数字 id 查球场名。清单里没有时，用 id 作为名字
export function courseName(courses: CourseRef[], courseId: number): string {
  const match = courses.find((course) => course.id === courseId);
  return match ? match.name : String(courseId);
}

// 球场是否在维护。认不出的 courseId 当作正常。原因：清单没加载完时，界面不能被锁死。
export function isCourseInMaintenance(courses: CourseRef[], courseId: number): boolean {
  const match = courses.find((course) => course.id === courseId);
  return match ? match.maintenance === true : false;
}

// 把后端的 watch 记录整理成 UI 用的形状。缺少的字段用默认值。一条 watch 只对应一个球场。
export function normalizeWatch(record: WatchConfigDto, courses: CourseRef[]): WatchView {
  return {
    id: record.id,
    courseId: record.courseId,
    courseName: record.courseName ?? courseName(courses, record.courseId),
    weekdays: Array.isArray(record.weekdays) ? record.weekdays : [],
    timeStart: record.timeStart ?? TIME_START_DEFAULT,
    timeEnd: record.timeEnd ?? TIME_END_DEFAULT,
    players: Number(record.players ?? PLAYERS_DEFAULT),
    maxPrice: Number(record.maxPrice ?? PRICE_DEFAULT),
    active: record.active !== false,
    ownerId: record.ownerId ?? null,
    ownerEmail: record.ownerEmail ?? null,
  };
}

// PUT /{id} 的请求体形状。
export function toDto(watch: WatchView): WatchConfigDto {
  return {
    id: watch.id,
    courseId: watch.courseId,
    weekdays: watch.weekdays,
    timeStart: watch.timeStart,
    timeEnd: watch.timeEnd,
    players: watch.players,
    maxPrice: watch.maxPrice,
    active: watch.active,
  };
}

// 管理员视图：按主人分组。
// - 自己的组排最前，其余按邮箱排序。
// - 组内保持后端给的顺序（新的在前）。
// - 没有主人的 watch（旧后端）算作自己的。
export function groupByOwner(watches: WatchView[], me: { id: number; loginEmail: string }): WatchGroup[] {
  const groups = new Map<number, WatchGroup>();
  for (const watch of watches) {
    const ownerId = watch.ownerId ?? me.id;
    const isMe = ownerId === me.id;
    let group = groups.get(ownerId);
    if (!group) {
      group = { ownerId, ownerEmail: isMe ? me.loginEmail : watch.ownerEmail ?? String(ownerId), isMe, watches: [] };
      groups.set(ownerId, group);
    }
    group.watches.push(watch);
  }
  return [...groups.values()].sort((left, right) =>
    left.isMe !== right.isMe ? (left.isMe ? -1 : 1) : left.ownerEmail.localeCompare(right.ownerEmail),
  );
}

// 判断管理员正在改的是不是别人的 watch。是时，返回主人邮箱。
// 表单标题要写明主人。否则管理员会以为改的是自己的 watch。
export function foreignOwnerEmail(watch: WatchView | undefined, meId: number): string | null {
  if (!watch || watch.ownerId == null || watch.ownerId === meId) return null;
  return watch.ownerEmail;
}

// 后端按 ISO 顺序（周一在前）存储和返回星期，前端也按这个顺序排。
// 这样卡片上的顺序与邮件里的一致。
export function sortWeekdays(codes: string[]): string[] {
  const order = WEEKDAYS.map((weekday) => weekday.code as string);
  return [...codes].sort((left, right) => order.indexOf(left) - order.indexOf(right));
}

// ["SAT","SUN"] → "Sat, Sun"。七天全选表示不按星期筛选，这时直接写 "Every day"。
export function weekdaysText(codes: string[]): string {
  if (!codes.length) return "";
  if (codes.length === WEEKDAYS.length) return STRINGS.everyDay;
  return sortWeekdays(codes)
    .map((code) => WEEKDAYS.find((weekday) => weekday.code === code)?.label ?? code)
    .join(", ");
}

// 时间统一用 24 小时制 "HH:MM"。这与后端存的格式一致，字符串可以直接比较大小。
// 不要用 <input type="time">。原因：在 12 小时制设备上，用户容易漏选 AM/PM。
// 下午 4:45 存成 04:45 后，这条 watch 永远不会命中。
export function parseClock(value: unknown): { hour: number; minute: number } {
  const match = /^(\d{1,2}):(\d{2})$/.exec(String(value ?? "").trim());
  if (!match) return { hour: 0, minute: 0 };
  return { hour: Math.min(23, Number(match[1])), minute: Math.min(59, Number(match[2])) };
}

export function formatClock(hour: number, minute: number): string {
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

// 库里有不在档位上的分钟值（早先用原生控件存的，例如 16:45 / 16:57）。
// 因此把当前值补进选项里。这样编辑一条老 watch 时，分钟值不会被意外改掉。
export function minuteOptions(current: number): number[] {
  if (MINUTE_CHOICES.includes(current)) return MINUTE_CHOICES;
  return [...MINUTE_CHOICES, current].sort((left, right) => left - right);
}

// 新建表单的默认球场：全选，但排除维护中的球场。原因：否则一提交，后端就返回 409 拒绝。
export function defaultFormCourses(courses: CourseRef[]): number[] {
  return courses.filter((course) => !course.maintenance).map((course) => course.id);
}

// 把一次失败翻译成给用户看的一句话，并决定是否把页面标成离线：
// - 没连上：用 offline 文案。
// - 后端拒绝：按 code 选文案。
// - 认不出的 code：用通用的兜底文案。
export function classifyError(error: unknown): { offline: boolean; signedOut: boolean; message: string } {
  if (!(error instanceof ApiError)) {
    return { offline: true, signedOut: false, message: STRINGS.offline };
  }
  return {
    offline: false,
    // 会话过期：api.ts 已经删除令牌，页面要随之回到登录界面
    signedOut: error.code === "UNAUTHORIZED",
    message: ERROR_MESSAGES[error.code ?? ""] ?? STRINGS.genericError,
  };
}

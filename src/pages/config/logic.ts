// config 页的纯逻辑层：不碰 DOM、不发请求，全部可以单测。
import { ApiError, type CourseDto, type WatchConfigDto } from "../../api";
import {
  ERROR_MESSAGES, MINUTE_CHOICES, PLAYERS_DEFAULT, PRICE_DEFAULT, STRINGS,
  TIME_END_DEFAULT, TIME_START_DEFAULT, WEEKDAYS,
} from "./strings";

/** /api/courses 归一化后的引用（config 页用数字 id：watch-config 按它关联）。 */
export interface CourseRef {
  id: number;
  slug: string;
  name: string;
  maintenance: boolean;
}

/** 一条 watch 在 UI 里的形状。One watch = one course。 */
export interface WatchView {
  id: number;
  courseId: number;
  courseName: string;
  weekdays: string[];
  timeStart: string;
  timeEnd: string;
  players: number;
  maxPrice: number;
  email: string;
  active: boolean;
}

// maintenance 必须带上：默认全选、能不能点、徽章、卡片上那句说明全靠它
export function normalizeCourses(courseDtos: CourseDto[]): CourseRef[] {
  return courseDtos.map((course) => ({
    id: course.id,
    slug: course.slug,
    name: course.name,
    maintenance: course.maintenance === true,
  }));
}

// 按数字 id 查球场名；清单里没有就把 id 当名字用
export function courseName(courses: CourseRef[], courseId: number): string {
  const match = courses.find((course) => course.id === courseId);
  return match ? match.name : String(courseId);
}

// 球场是否在维护。认不出的 courseId 当作正常，别因为清单没加载完把界面锁死。
export function isCourseInMaintenance(courses: CourseRef[], courseId: number): boolean {
  const match = courses.find((course) => course.id === courseId);
  return match ? match.maintenance === true : false;
}

// 把后端的 watch 记录整理成 UI 用的形状（缺字段落默认值）。一条 watch 只对应一个球场。
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
    email: record.email ?? "",
    active: record.active !== false,
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
    email: watch.email,
    active: watch.active,
  };
}

// 后端按 ISO 序（周一在前）存和返回，前端跟着排：卡片上的顺序和邮件里的一致。
export function sortWeekdays(codes: string[]): string[] {
  const order = WEEKDAYS.map((weekday) => weekday.code as string);
  return [...codes].sort((left, right) => order.indexOf(left) - order.indexOf(right));
}

// ["SAT","SUN"] → "Sat, Sun"；七天全勾说明没做筛选，直接写 "Every day"。
export function weekdaysText(codes: string[]): string {
  if (!codes.length) return "";
  if (codes.length === WEEKDAYS.length) return STRINGS.everyDay;
  return sortWeekdays(codes)
    .map((code) => WEEKDAYS.find((weekday) => weekday.code === code)?.label ?? code)
    .join(", ");
}

// 时间统一用 24 小时制 "HH:MM"，和后端存的一致，字符串可以直接比大小。
// 刻意不用 <input type="time">：12 小时制设备上容易漏拨 AM/PM，
// 下午 4:45 存成 04:45 就是一条永远不命中的 watch。
export function parseClock(value: unknown): { hour: number; minute: number } {
  const match = /^(\d{1,2}):(\d{2})$/.exec(String(value ?? "").trim());
  if (!match) return { hour: 0, minute: 0 };
  return { hour: Math.min(23, Number(match[1])), minute: Math.min(59, Number(match[2])) };
}

export function formatClock(hour: number, minute: number): string {
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

// 库里存着不在档位上的分钟（早先用原生控件存的，例如 16:45 / 16:57）。把当前值
// 补进选项里，编辑一条老 watch 才不会顺手把分钟改掉。
export function minuteOptions(current: number): number[] {
  if (MINUTE_CHOICES.includes(current)) return MINUTE_CHOICES;
  return [...MINUTE_CHOICES, current].sort((left, right) => left - right);
}

// 新建表单的默认球场：全选但排除维护中的——不然一提交就被后端 409 拒掉。
export function defaultFormCourses(courses: CourseRef[]): number[] {
  return courses.filter((course) => !course.maintenance).map((course) => course.id);
}

// 把一次失败翻译成给人看的一句话，并决定要不要把页面标成离线：
// 没连上 → offline 文案；后端拒了 → 按 code 挑文案；认不出的 code → 笼统兜底。
export function classifyError(error: unknown): { offline: boolean; message: string } {
  if (!(error instanceof ApiError)) {
    return { offline: true, message: STRINGS.offline };
  }
  return { offline: false, message: ERROR_MESSAGES[error.code ?? ""] ?? STRINGS.genericError };
}

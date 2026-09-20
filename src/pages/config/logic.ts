// config 页的纯逻辑层：从旧 legacy/config.js 逐字搬运，唯一结构性改动是把对模块级
// state 的闭包引用改成显式参数（courses），好让它们可测。
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

export function courseName(courses: CourseRef[], courseId: number): string {
  const match = courses.find((course) => course.id === courseId);
  return match ? match.name : String(courseId);
}

// 维护中：上游站点抓不动，后端已经把这个球场摘出去了（course.maintenance）。
// 认不出的 courseId 当作正常，别因为清单还没加载完就把界面全锁死。
export function isCourseInMaintenance(courses: CourseRef[], courseId: number): boolean {
  const match = courses.find((course) => course.id === courseId);
  return match ? match.maintenance === true : false;
}

// Coerce a backend watch record into the shape the UI expects. One watch holds a
// single course (courseId + courseName come straight from the backend).
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

// The payload shape the backend's PUT /{id} expects.
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

// 时间在 state、界面和线上格式里都是 24 小时制的 "HH:MM"，和后端存的、
// tee_time.time_local 用的是同一套，直接可比。
//
// 刻意不用 <input type="time">：那个控件在 12 小时制的设备上把 AM/PM 做成滚轮里的
// 一列（iPhone）或键盘录入时可以不动的一段（桌面）。拨了时和分却漏掉 meridiem，
// 下午 4:45 就存成了 04:45，窗口倒挂，这条 watch 从此一条都不命中。选 24 小时制的
// 小时就没有 meridiem 这个东西可漏了。
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

// 新建表单里球场的默认选中集：全选，但维护中的排除掉——不然一打开页面它就被勾上，
// 一提交必被后端 409 拒掉。init 和 resetForm 都从这里取，别各写一遍（写重过一次了）。
export function defaultFormCourses(courses: CourseRef[]): number[] {
  return courses.filter((course) => !course.maintenance).map((course) => course.id);
}

/**
 * 把一次失败翻译成给人看的一句话，并决定要不要把页面标成离线（旧 reportError 的纯分类部分）。
 *
 * 分三档，因为对人的意思完全不同：
 *   - 根本没连上（fetch 抛 TypeError）→ 后端离线，去看服务；
 *   - 连上了、后端拒了这次请求（4xx 带 code）→ 是这次填的东西有问题，改了再来；
 *   - 认不出的 code → 说得笼统一点，但不崩、也不谎称后端离线。
 */
export function classifyError(error: unknown): { offline: boolean; message: string } {
  if (!(error instanceof ApiError)) {
    return { offline: true, message: STRINGS.offline };
  }
  return { offline: false, message: ERROR_MESSAGES[error.code ?? ""] ?? STRINGS.genericError };
}

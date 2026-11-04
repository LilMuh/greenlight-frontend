// 三个页面共用的头部：纯逻辑（标签列表、账号区），不引 CSS，不碰 DOM，便于在 node 环境下单测。
import type { HeaderUser } from "../headerUserCache";
import { canSeeBooking } from "../pages/booking/logic";

// 头部自带文案，不读各页的 STRINGS，这样三页的头部永远一致
export const HEADER_STRINGS = {
  appName: "GreenLight",
  signOut: "Sign out",
  pagesLabel: "Pages",
  navSearch: "Search",
  navWatch: "Watch Alerts",
  navBooking: "Auto Booking",
} as const;

export type HeaderPage = "search" | "watch" | "booking";

export type HeaderTab = {
  page: HeaderPage;
  label: string;
  href: string;
  active: boolean;
};

/**
 * 头部有哪些标签。Search、Watch Alerts 永远在；Auto Booking 在 canSeeBooking(user) 为真时出现。
 * 注意两点：
 * 1. 这里只决定「显示什么」，权限全由后端判定（前端藏起来不是安全措施）。
 *    canSeeBooking 是 D-15 / D-16 的唯一判定，从订场页的 logic 引入，不复制一份。
 * 2. 当前页的标签永远显示成选中态：active 为 booking 时，即使登录态还没确认也显示 Auto Booking 标签。
 */
export function headerTabs(user: HeaderUser | null | undefined, active: HeaderPage): HeaderTab[] {
  const tabs: HeaderTab[] = [
    { page: "search", label: HEADER_STRINGS.navSearch, href: "index.html", active: active === "search" },
    { page: "watch", label: HEADER_STRINGS.navWatch, href: "config.html", active: active === "watch" },
  ];
  if (canSeeBooking(user) || active === "booking") {
    tabs.push({ page: "booking", label: HEADER_STRINGS.navBooking, href: "booking.html", active: active === "booking" });
  }
  return tabs;
}

/** 标签条的等宽网格列；minmax(0, 1fr) 让窄屏下文字能折行而不是撑出屏幕。 */
export function tabGridColumns(count: number): string {
  return `repeat(${count}, minmax(0, 1fr))`;
}

/** 账号区显示的邮箱：已登录是登录邮箱，未登录（含还在确认）是 null，此时不渲染账号区。 */
export function accountEmail(user: HeaderUser | null | undefined): string | null {
  return user ? user.loginEmail : null;
}

/**
 * 头部实际显示的用户。三种取值：
 * - confirmed 不是 undefined：页面已经确认（已登录的用户，或确认未登录的 null），以页面为准；
 * - confirmed 是 undefined（还在等 /api/me）且有缓存：先按缓存画，首帧就有账号区和 Auto Booking 标签；
 * - 还在确认且没有缓存：返回 undefined，保持原来「还在确认」的显示。
 */
export function resolveHeaderUser(
  confirmed: HeaderUser | null | undefined,
  cached: HeaderUser | null,
): HeaderUser | null | undefined {
  if (confirmed !== undefined) return confirmed;
  return cached ?? undefined;
}

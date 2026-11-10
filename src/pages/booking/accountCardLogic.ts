// 「我的订场账号」卡片的纯逻辑：不碰 DOM、不发请求，可以单测。
import type { BookingAccountDto, BookingAccountReason } from "../../api";
import { SITE_ZONE } from "./logic";
import { STRINGS } from "./strings";

/** 提交或重新验证后，每 3 秒查一次结果。 */
export const POLL_INTERVAL_MS = 3000;
/** 最多轮询 3 分钟；超时只提示稍后回来看，不当成错误。 */
export const POLL_MAX_MS = 180000;

export type CardState = "admin" | "none" | "verifying" | "valid" | "needsAction";

/**
 * 是否按「验证中」显示：后端的在途标记为 true，或者原因码还是 NOT_VERIFIED。
 * 后者是「刚提交、执行器还没开始」的极短窗口：此时 verifying 可能还是 false，但它不是用户要处理的问题（06-07）。
 */
export function isVerifying(account: BookingAccountDto): boolean {
  return account.verifying || account.reason === "NOT_VERIFIED";
}

/** 卡片显示哪一种：管理员只有总览（没有自己的绑定）；没有记录是未绑定；其余按状态。 */
export function cardState(account: BookingAccountDto | null | undefined, isAdmin: boolean): CardState {
  if (isAdmin) return "admin";
  if (!account) return "none";
  if (isVerifying(account)) return "verifying";
  return account.status === "VALID" ? "valid" : "needsAction";
}

// --- D-18（修订 D-13）：账号卡片的位置 ------------------------------------------------
// 账号卡片只在没有 VALID 账号时出现，占建任务表单的位置（表单这时不渲染）；VALID 之后缩成页面顶部的一行小字。
// 页面上没有重新验证按钮：验证失败（NEEDS_ACTION）直接在卡片里重新输入密码。

/** admin：页面顶部的只读总览；line：页面顶部一行小字；card：表单位置的紧凑卡片。 */
export type AccountPlacement = "admin" | "line" | "card";

/** 管理员 admin；VALID 是 line；其余（还没拿到、没绑定、验证中、NEEDS_ACTION）都是 card。 */
export function accountPlacement(isAdmin: boolean, account: BookingAccountDto | null | undefined): AccountPlacement {
  if (isAdmin) return "admin";
  return account?.status === "VALID" ? "line" : "card";
}

/** 一行小字里的状态词：验证中 → Verifying…；共享账号 → Shared；否则 Valid。 */
export function lineStatusLabel(account: BookingAccountDto): string {
  if (isVerifying(account)) return STRINGS.statusVerifying;
  return account.kind === "SHARED" ? STRINGS.statusShared : STRINGS.statusValid;
}

/** 还要不要继续轮询：还在验证中，并且从 startedAt 起不到 POLL_MAX_MS。 */
export function shouldKeepPolling(account: BookingAccountDto | null | undefined, startedAt: number, now: number): boolean {
  return !!account && isVerifying(account) && now - startedAt < POLL_MAX_MS;
}

// --- D-16：NEEDS_ACTION 的原因提示 ----------------------------------------------------
// 页面其余文案是英文，这两句是 D-16 锁定的中文提示，不要改成英文。
// 只有 BAD_CREDENTIALS 是用户自己能处理的（站点明确拒绝了邮箱或密码）；其余原因用户处理不了，提示联系管理员并带上原因码。

/** 只有凭据被站点明确拒绝时才让用户重新输入密码（与后端 BookingAccountReason.askUserForPassword 一致）。 */
export function askForPassword(reason: BookingAccountReason | null | undefined): boolean {
  return reason === "BAD_CREDENTIALS";
}

/** 原因码对应的中文提示；没有原因码（VALID）返回空串。 */
export function reasonHint(reason: BookingAccountReason | null | undefined): string {
  if (!reason) return "";
  return askForPassword(reason) ? "密码错误，请重新输入密码。" : `请联系管理员（原因：${reason}）。`;
}

/** 验证时间按站点本地（温哥华）显示成「2026-11-09 12:00」；读不出返回空串，不猜。 */
export function formatVerifiedAt(iso: string | null | undefined): string {
  const time = iso ? Date.parse(iso) : NaN;
  if (Number.isNaN(time)) return "";
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: SITE_ZONE, year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).formatToParts(new Date(time));
  const pick = (type: string) => parts.find((part) => part.type === type)?.value ?? "";
  return `${pick("year")}-${pick("month")}-${pick("day")} ${pick("hour")}:${pick("minute")}`;
}

// 「我的订场账号」卡片的纯逻辑：不碰 DOM、不发请求，可以单测。
import type { BookingAccountDto } from "../../api";

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

/** 还要不要继续轮询：还在验证中，并且从 startedAt 起不到 POLL_MAX_MS。 */
export function shouldKeepPolling(account: BookingAccountDto | null | undefined, startedAt: number, now: number): boolean {
  return !!account && isVerifying(account) && now - startedAt < POLL_MAX_MS;
}

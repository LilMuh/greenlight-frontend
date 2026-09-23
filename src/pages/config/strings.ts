// --- Static reference data --------------------------------------------------

// 价格滑块范围（CAD）。上限要盖住最贵球场的时段（Nicklaus North 到 $285），
// 钉低了那些场次永远匹配不上。
export const PRICE_MIN = 20;
export const PRICE_MAX = 300;
// 默认拉满：不过滤价格，先把所有场次都收进来。
export const PRICE_DEFAULT = PRICE_MAX;

// 默认时间窗：全天可打的时段。
export const TIME_START_DEFAULT = "06:00";
export const TIME_END_DEFAULT = "20:00";

// 分钟档位：watch 的时间窗是粗筛，整点和半点够用。
export const MINUTE_CHOICES = [0, 30];

// 默认人数：一组打满 4 人。
export const PLAYERS_DEFAULT = 4;

// watch 按星期定，不按日期：「每周六早上」下个月还成立。code 和后端存的一致。
export const WEEKDAYS = [
  { code: "MON", label: "Mon" },
  { code: "TUE", label: "Tue" },
  { code: "WED", label: "Wed" },
  { code: "THU", label: "Thu" },
  { code: "FRI", label: "Fri" },
  { code: "SAT", label: "Sat" },
  { code: "SUN", label: "Sun" },
] as const;

export const STRINGS = {
  appName: "GreenLight", tagline: "Watch tee times, get notified",
  navQuery: "Search", navWatch: "Watch Alerts",
  coursesLabel: "Golf Courses", weekdaysLabel: "Weekdays", rangeTo: "to",
  timeRangeLabel: "Time Window", playersLabel: "Players", maxPriceLabel: "Max Price",
  emailLabel: "Alerts go to", emailPlaceholder: "you@example.com",
  // 登录
  signInTitle: "Sign in to manage your alerts",
  signInHint: "Use Google, or get a 6-digit code by email.",
  signInHintEmailOnly: "We'll email you a 6-digit code.",
  orDivider: "or",
  sendCode: "Email me a code", signIn: "Sign in", useOtherEmail: "Use a different email",
  codeLabel: "6-digit code", codeSent: (email: string) => `We sent a code to ${email}. It expires in 10 minutes.`,
  signOut: "Sign out", signedOut: "Signed out.",
  adminSignIn: "Admin sign-in", backToUserSignIn: "Back to regular sign-in",
  usernameLabel: "Username", passwordLabel: "Password",
  notSet: "Not set — add one in Account to get alerts",
  // 账号面板
  accountTitle: "Account",
  signedInAs: "Signed in as", alertEmailLabel: "Alert emails go to",
  changeEmail: "Change", changeEmailHint: "We'll send a code to the new address to confirm it's yours.",
  confirmEmail: "Confirm", notifyEmailChanged: "Alert email updated.",
  alertsOn: "Email alerts are on", alertsOff: "Email alerts are off — your watches are paused",
  turnOff: "Turn off", turnOn: "Turn on",
  cancel: "Cancel", edit: "Edit", delete: "Delete",
  noWatches: "No watches yet — create one on the left.",
  active: "Active", paused: "Paused",
  newTitle: "New Watch", editTitle: "Edit Watch",
  createBtn: "Create Watch", saveBtn: "Save",
  needCourse: "Pick at least one course.",
  needWeekday: "Pick at least one weekday.",
  needTimeOrder: "End time must be later than start time.",
  saved: "Watch saved.", deleted: "Watch deleted.",
  offline: "Backend offline — please try again once it's up.",
  // 后端好好的、只是这次请求不合法时的兜底。和 offline 分开：那句会让人跑去看服务
  genericError: "That didn't go through — please try again.",
  courseLocked: "A watch's course can't be changed — create a new one instead.",
  maintenanceBadge: "Under maintenance",
  // 点到维护中的球场时说一句，否则那一行只是点不动，看不出是坏了还是没点中
  maintenanceToast: "That course is under maintenance — it can't be watched right now.",
  // 存量 watch 的卡片上说明它为什么不发邮件了
  maintenanceCardNote: "This course is under maintenance — this watch is paused.",
  playerUnit: " players",
  everyDay: "Every day",
  countText: (watchCount: number) => `Watches: ${watchCount}`,
  hitsText: (hitCount: number) =>
    hitCount > 0 ? `${hitCount} matching now` : "No matches yet",
} as const;

// --- Error reporting --------------------------------------------------------
// 后端错误按 code 挑文案（后端的 message 是调试串，不进界面）。
// 认不出的 code 落到 genericError：不崩、也不谎称后端离线。
export const ERROR_MESSAGES: Record<string, string> = {
  // 业务规则：人能自己改好的，就说清楚该怎么改
  WATCH_DUPLICATE: "You already have an alert for that course — edit that one instead.",
  WATCH_COURSE_IMMUTABLE: "A watch's course can't be changed — create a new one instead.",
  WATCH_WEEKDAYS_REQUIRED: "Pick at least one weekday.",
  WATCH_TIME_INVALID: "Time window looks wrong — use 24h HH:MM with start no later than end.",
  WATCH_EMAIL_INVALID: "That email address doesn't look right — check it and try again.",
  WATCH_NOT_FOUND: "That alert is gone — reload the page.",
  COURSE_NOT_FOUND: "That course is gone — reload the page.",
  COURSE_IN_MAINTENANCE: "That course is under maintenance — it can't be watched right now.",
  MAIL_SEND_FAILED: "The email couldn't be sent — check the mail settings and your alert address.",
  // 请求本身不合法。人改不了这些，但话得说得不一样：让人知道该找谁
  UNAUTHORIZED: "Your session has ended — please sign in again.",
  FORBIDDEN: "Only admins can do that.",
  AUTH_GOOGLE_INVALID: "Google sign-in didn't go through — try again or use an email code.",
  AUTH_CODE_INVALID: "That code is wrong or has expired — check it or request a new one.",
  AUTH_RATE_LIMITED: "Too many attempts — wait a bit and try again.",
  AUTH_CREDENTIALS_INVALID: "Wrong username or password.",
  EMAIL_INVALID: "That email address doesn't look right — check it and try again.",
  MALFORMED_JSON_BODY: "The page sent something the backend couldn't read — reload and try again.",
  MISSING_PARAMETER: "The page sent an incomplete request — reload and try again.",
  INVALID_PARAMETER: "The page sent an unusable value — reload and try again.",
  METHOD_NOT_ALLOWED: "The page called the backend the wrong way — reload and try again.",
  ENDPOINT_NOT_FOUND: "This page is talking to a backend that doesn't have that feature.",
  // 后端自己出 bug 了。明确说不是你的问题，免得人回去反复改表单
  INTERNAL_ERROR: "Something broke on the server — not your fault. Try again in a moment.",
};

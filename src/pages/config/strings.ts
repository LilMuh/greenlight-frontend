// --- Static reference data --------------------------------------------------

// 价格滑块范围（CAD）。上限必须覆盖最贵球场的时段（Nicklaus North 到 $285）。
// 否则上限设低后，那些时段永远匹配不上。
export const PRICE_MIN = 20;
export const PRICE_MAX = 300;
// 默认设为最大值：不按价格过滤，所有时段都包括在内。
export const PRICE_DEFAULT = PRICE_MAX;

// 默认时间窗：全天可打的时段。
export const TIME_START_DEFAULT = "06:00";
export const TIME_END_DEFAULT = "20:00";

// 分钟档位：watch 的时间窗只做粗筛，因此整点和半点就够用。
export const MINUTE_CHOICES = [0, 30];

// 默认人数：一组打满 4 人。
export const PLAYERS_DEFAULT = 4;

// watch 按星期设定，不按日期。原因：「每周六早上」到下个月仍然有效。code 与后端存的一致。
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
  navQuery: "Search", navWatch: "Watch Alerts", navBooking: "Auto Booking",
  coursesLabel: "Golf Courses", weekdaysLabel: "Weekdays", rangeTo: "to",
  timeRangeLabel: "Time Window", playersLabel: "Players", maxPriceLabel: "Max Price",
  emailLabel: "Alerts go to", emailPlaceholder: "you@example.com",
  // 登录
  signInTitle: "Sign in to manage your alerts",
  signInHint: "Use Google, or get a 6-digit code by email.",
  signInHintEmailOnly: "We'll email you a 6-digit code.",
  orDivider: "or",
  // Google 按钮上的文字
  continueWithGoogle: "Continue with Google",
  // 从 Google 回跳后、等后端确认登录期间显示
  googleSigningIn: "Signing you in with Google…",
  // 用户在 Google 页面点了取消
  googleCancelled: "Google sign-in was cancelled.",
  // 点击到回跳超过 10 分钟，或时钟倒退
  googleExpired: "That Google sign-in took too long — please try again.",
  // 回跳的 state / nonce 对不上，或 Google 返回了其他错误
  googleFailed: "Google sign-in didn't go through — try again or use an email code.",
  // 浏览器存不了 sessionStorage，无法安全地跳转到 Google 再回来
  googleStorageBlocked: "This browser is blocking the storage Google sign-in needs — use an email code instead.",
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
  // 管理员改别人的 watch 时，标题写明主人
  editOthersTitle: (ownerEmail: string) => `Edit ${ownerEmail}'s Watch`,
  createBtn: "Create Watch", saveBtn: "Save",
  needCourse: "Pick at least one course.",
  needWeekday: "Pick at least one weekday.",
  needTimeOrder: "End time must be later than start time.",
  saved: "Watch saved.", deleted: "Watch deleted.",
  offline: "Backend offline — please try again once it's up.",
  // 后端正常、只是这次请求不合法时的兜底文案。
  // 它与 offline 分开。原因：offline 文案会让用户去检查服务。
  genericError: "That didn't go through — please try again.",
  courseLocked: "A watch's course can't be changed — create a new one instead.",
  maintenanceBadge: "Under maintenance",
  // 点到维护中的球场时，弹出这句提示。
  // 否则那一行只是点不动，用户分不清是坏了还是没点中
  maintenanceToast: "That course is under maintenance — it can't be watched right now.",
  // 已有 watch 的卡片上，说明它为什么不再发邮件
  maintenanceCardNote: "This course is under maintenance — this watch is paused.",
  playerUnit: " players",
  everyDay: "Every day",
  countText: (watchCount: number) => `Watches: ${watchCount}`,
  // 管理员视图：所有人的 watch 按主人分组
  countTextAdmin: (watchCount: number, userCount: number) => `Watches: ${watchCount} · Users: ${userCount}`,
  ownerYou: (loginEmail: string) => `${loginEmail} (you)`,
  hitsText: (hitCount: number) =>
    hitCount > 0 ? `${hitCount} matching now` : "No matches yet",
} as const;

// --- Error reporting --------------------------------------------------------
// 后端错误按 code 选文案。后端的 message 是调试用的字符串，不显示在界面上。
// 认不出的 code 用 genericError：页面不崩溃，也不错误地提示后端离线。
export const ERROR_MESSAGES: Record<string, string> = {
  // 业务规则错误：用户能自己改正，因此文案说清楚怎么改
  WATCH_DUPLICATE: "You already have an alert for that course — edit that one instead.",
  WATCH_COURSE_IMMUTABLE: "A watch's course can't be changed — create a new one instead.",
  WATCH_WEEKDAYS_REQUIRED: "Pick at least one weekday.",
  WATCH_TIME_INVALID: "Time window looks wrong — use 24h HH:MM with start no later than end.",
  WATCH_EMAIL_INVALID: "That email address doesn't look right — check it and try again.",
  WATCH_NOT_FOUND: "That alert is gone — reload the page.",
  COURSE_NOT_FOUND: "That course is gone — reload the page.",
  COURSE_IN_MAINTENANCE: "That course is under maintenance — it can't be watched right now.",
  MAIL_SEND_FAILED: "The email couldn't be sent — check the mail settings and your alert address.",
  // 自动订场（跨仓库契约：与后端 ApiErrorCode 的 BOOKING_* 同名，后端只追加不改名，05-06）
  BOOKING_NOT_ENABLED: "Auto booking isn't enabled for your account.",
  BOOKING_ADMIN_CANNOT_CREATE: "Admins can view and cancel booking tasks but can't create or edit them.",
  BOOKING_RUN_AT_TAKEN: "That run time is already taken.",
  BOOKING_COURSE_UNSUPPORTED: "Auto booking isn't available for that course.",
  BOOKING_DATE_OUT_OF_WINDOW: "That play date can't be booked at that run time — a day opens at 07:00, five days ahead.",
  BOOKING_RUN_AT_INVALID: "Run time looks wrong — pick a valid time in the future.",
  BOOKING_TIME_INVALID: "Time window looks wrong — use 24h HH:MM with start no later than end.",
  BOOKING_PLAYERS_INVALID: "Players must be between 1 and 4.",
  BOOKING_PRICE_INVALID: "Max price must be a whole number from 1 to 1000.",
  BOOKING_SORT_INVALID: "Pick either Earliest or Cheapest.",
  BOOKING_TASK_NOT_FOUND: "That booking task is gone — reload the page.",
  BOOKING_TASK_NOT_PENDING: "That task has already started or finished, so it can't be changed or cancelled.",
  BOOKING_TASK_ABOUT_TO_RUN: "That task is about to run, so it can no longer be edited.",
  // 我的订场账号（跨仓库契约：与后端 ApiErrorCode 的 BOOKING_ACCOUNT_* 同名，只追加不改名，06-06）
  BOOKING_ACCOUNT_REQUIRED: "Link and verify your Northlands account first (My booking account, above).",
  BOOKING_ACCOUNT_NOT_FOUND: "No booking account is linked — reload the page.",
  BOOKING_ACCOUNT_EMAIL_TAKEN: "That Northlands account is already linked by someone else.",
  BOOKING_ACCOUNT_ALREADY_LINKED: "You already have a different Northlands account linked — unlink it first.",
  BOOKING_ACCOUNT_BUSY: "A task is using your booking account right now — try again in a few minutes.",
  BOOKING_ACCOUNT_KEY_MISMATCH: "The encryption key was just rotated — submit once more and the page will use the new key.",
  BOOKING_ACCOUNT_PAYLOAD_INVALID: "The page sent something the backend couldn't read — reload and try again.",
  BOOKING_ACCOUNT_VERIFYING: "Your account is being verified — wait for it to finish.",
  BOOKING_ACCOUNT_VERIFY_RATE_LIMITED: "Too many verification attempts — try again in about ten minutes.",
  BOOKING_ACCOUNT_SERVICE_UNAVAILABLE: "The booking service isn't available right now — try again later or contact the admin.",
  BOOKING_ACCOUNT_ADMIN_FORBIDDEN: "Admins can't link a booking account.",
  // 请求本身不合法。用户改正不了这些错误，但文案要不同，让用户知道该找谁
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
  // 后端自身的 bug。文案明确说不是用户的问题。否则用户会反复修改表单
  INTERNAL_ERROR: "Something broke on the server — not your fault. Try again in a moment.",
};

// 订场页文案（英文，与另外两个页面一致）。错误文案复用 config 页的 ERROR_MESSAGES，不复制一份。
export { ERROR_MESSAGES } from "../config/strings";

export const STRINGS = {
  appName: "GreenLight", tagline: "Book tee times automatically",
  navQuery: "Search", navWatch: "Watch Alerts", navBooking: "Auto Booking",
  signOut: "Sign out", signedOut: "Signed out.",
  // 表单
  newTitle: "New Booking Task",
  runDateLabel: "Run on", runTimeLabel: "Run time", playDateLabel: "Play date",
  timeRangeLabel: "Time Window", rangeTo: "to",
  playersLabel: "Players", maxPriceLabel: "Max price per player (CAD)",
  sortLabel: "Pick the", sortEarliest: "Earliest", sortCheapest: "Cheapest",
  siteZoneNote: "Times are Northlands local time (Vancouver).",
  createBtn: "Schedule Booking",
  editBtn: "Edit", editTitle: (id: number) => `Edit task #${id}`,
  saveBtn: "Save changes", cancelEditBtn: "Cancel edit",
  needPlayDate: "Pick a play date.", needRunDate: "Pick a run date.",
  needTimeOrder: "End time must be later than start time.",
  needPrice: "Max price must be a whole number from 1 to 1000.",
  needCourse: "Northlands isn't available right now — reload the page.",
  created: "Booking task scheduled.", updated: "Booking task updated.", cancelled: "Booking task cancelled.",
  // D-09 / D-10 / D-14：同一运行时间全局只能有一个任务；订场任务互相独立，只说被占用，不说是谁、哪个任务
  occupied: "That run time is already taken.",
  // 登录与可见性（D-15 / D-16）
  signInPrompt: "Sign in on the Watch Alerts page first, then come back here.",
  signInLink: "Go to Watch Alerts to sign in",
  notEnabled: "Auto booking is not enabled for your account.",
  adminNote: "Admins can see every task and cancel pending ones, but can't create tasks.",
  // D-07：建任务前提——账号 VALID。D-18：账号卡片占表单的位置，这三句是卡片顶部的提示
  createNeedsLink: "Link your Northlands account to schedule bookings — tasks you schedule are booked under it.",
  createVerifying: "Checking your Northlands account — you can schedule bookings once it's valid.",
  createNeedsAction: "Your Northlands account needs attention before you can schedule bookings.",
  // 列表
  scheduledTitle: "Scheduled", scheduledEmpty: "Nothing is scheduled right now.",
  // D-14：普通用户只有自己的任务；管理员看所有人的
  scheduledHint: "Your pending and running tasks. One task per run time across GreenLight.",
  scheduledHintAdmin: "Pending and running tasks from everyone.",
  myTitle: "My tasks", myTitleAdmin: "All tasks", myEmpty: "No tasks yet.",
  countText: (count: number) => `${count} task${count === 1 ? "" : "s"}`,
  loadingTasks: "Loading…",
  offline: "Backend offline — please try again once it's up.",
  runsAt: "Runs", plays: "Plays",
  // 任务已结束（PENDING / RUNNING 以外）：两行时间改说「跑过」和「想要的」。CSS 已有 uppercase，显示为 RAN / WANTED
  ranAt: "Ran", wanted: "Wanted",
  // BOOKED 卡片的深绿时段块（用户 2026-11-04 指定格式）
  bookedLabel: (date: string) => `BOOKED TEE TIME (${date})`,
  playerCount: (count: number) => (count === 1 ? "1 player" : `${count} players`),
  // 卡片标题：球场名 + 任务号
  taskTitle: (courseName: string, id: number) => `${courseName} #${id}`,
  sortText: (sort: "EARLIEST" | "CHEAPEST") => (sort === "EARLIEST" ? "Earliest" : "Cheapest"),
  maxPriceText: (price: number) => `≤ $${price} / player`,
  // D-16：订场账号邮箱 scraper 读不到时显示 Unknown，不猜
  unknown: "Unknown",
  bookingAccount: "Booking account",
  playerUnit: " players",
  statusText: {
    PENDING: "Pending", RUNNING: "Running", BOOKED: "Booked", DRY_RUN_OK: "Dry run OK",
    NOT_BOOKED: "Not booked", FAILED: "Failed", UNKNOWN: "Unknown result", CANCELLED: "Cancelled",
  },
  // 我的订场账号卡片（D-13）。页面文案保持英文；NEEDS_ACTION 的原因提示是 D-16 锁定的中文，在 accountCardLogic.ts
  accountTitle: "My booking account",
  accountEmailLabel: "Northlands login email", accountPasswordLabel: "Northlands password",
  accountPasswordNote: "Your password is encrypted in this browser before it is sent; GreenLight's servers never see it.",
  linkBtn: "Link account", linking: "Linking…",
  accountLoading: "Loading…",
  accountLoadFailed: "Couldn't load your booking account — reload the page.",
  accountVerifying: "Verifying… this can take a minute.",
  accountStillVerifying: "Still verifying — check back in a few minutes.",
  statusValid: "Valid", statusShared: "Shared", statusNeedsAction: "Needs action", statusVerifying: "Verifying…",
  accountClassLabel: "Class", accountVerifiedLabel: "Last verified",
  // 非 BAD_CREDENTIALS 的待处理原因：用户处理不了，但仍可以重新输入密码再检查一次
  accountRetryNote: "You can re-enter the password to run the check again.",
  changePasswordBtn: "Change password", unlinkBtn: "Unlink", closeFormBtn: "Close",
  changePasswordSubmit: "Save new password",
  unlinkConfirm:
    "Unlink this Northlands account? All of its pending booking tasks will fail, their creators will be emailed, and its browser profile will be deleted.",
  unlinked: "Booking account unlinked.",
  // 管理员总览（D-12）：只读，没有绑定表单
  adminAccountsTitle: "Booking accounts",
  adminAccountsHint: "Read-only overview of everyone's linked Northlands account. Admins can't link or change accounts.",
  adminAccountsEmpty: "No booking accounts yet.", adminAccountsLoading: "Loading…",
  adminAccountsFailed: "Couldn't load the booking accounts — reload the page.",
  adminUserLabel: "GreenLight user", adminKindLabel: "Kind",
  // 加密前就被拒绝：什么都没发出去，不是网络错误
  keyUntrusted: "This page can't verify the encryption key, so nothing was sent. Please contact the admin.",
  credentialsTooLong: "The email and password are too long (300 bytes at most together) — nothing was sent.",
  needEmailPassword: "Enter both the Northlands email and password.",
  cancelBtn: "Cancel task",
  cancelConfirm: "Cancel this booking task?",
} as const;

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
  // D-09 / D-16：谁占了这个运行时间（创建者的完整登录邮箱 + 任务号）
  occupied: (email: string, id: number) =>
    `That run time is already taken by ${email} (task #${id}).`,
  // 登录与可见性（D-15 / D-16）
  signInPrompt: "Sign in on the Watch Alerts page first, then come back here.",
  signInLink: "Go to Watch Alerts to sign in",
  notEnabled: "Auto booking is not enabled for your account.",
  adminNote: "Admins can see every task and cancel pending ones, but can't create tasks.",
  // 列表
  scheduledTitle: "Scheduled", scheduledEmpty: "Nothing is scheduled right now.",
  scheduledHint: "Pending and running tasks from everyone. One task per run time.",
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
  cancelBtn: "Cancel task",
  cancelConfirm: "Cancel this booking task?",
} as const;

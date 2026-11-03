// 订场页文案（英文，与另外两个页面一致）。错误文案复用 config 页的 ERROR_MESSAGES，不复制一份。
export { ERROR_MESSAGES } from "../config/strings";

export const STRINGS = {
  appName: "GreenLight", tagline: "Book tee times automatically",
  navQuery: "Search", navWatch: "Watch Alerts", navBooking: "Auto Booking",
  signOut: "Sign out",
  // 表单
  newTitle: "New Booking Task",
  runDateLabel: "Run on", runTimeLabel: "Run time", playDateLabel: "Play date",
  timeRangeLabel: "Time Window", rangeTo: "to",
  playersLabel: "Players", maxPriceLabel: "Max price per player (CAD)",
  sortLabel: "Pick the", sortEarliest: "Earliest", sortCheapest: "Cheapest",
  siteZoneNote: "Times are Northlands local time (Vancouver).",
  createBtn: "Schedule Booking",
  needPlayDate: "Pick a play date.", needRunDate: "Pick a run date.",
  needTimeOrder: "End time must be later than start time.",
  needPrice: "Max price must be a whole number from 1 to 1000.",
  needCourse: "Northlands isn't available right now — reload the page.",
  created: "Booking task scheduled.", cancelled: "Booking task cancelled.",
  // D-09 / D-16：谁占了这个运行时间（创建者的完整登录邮箱 + 任务号）
  occupied: (email: string, id: number) =>
    `That run time is already taken by ${email} (task #${id}).`,
  // 列表
  scheduledTitle: "Scheduled", scheduledEmpty: "Nothing scheduled.",
  noPending: "—",
  loadingTasks: "Loading…",
  offline: "Backend offline — please try again once it's up.",
  // D-16：订场账号邮箱 scraper 读不到时显示 Unknown，不猜
  unknown: "Unknown",
  createdBy: "Created by", bookingAccount: "Booking account",
  playerUnit: " players",
} as const;

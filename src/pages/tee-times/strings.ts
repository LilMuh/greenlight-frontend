// 价格档位。在 120 再分出最高一档。
// 原因：不分时，"$70+" 一档覆盖 70 到 135，选了这档几乎不起筛选作用。
export const PRICE_BUCKETS = ["all", "low", "mid", "high", "top"] as const;
export type PriceBucket = (typeof PRICE_BUCKETS)[number];
export const SORTS = ["rec", "price", "time"] as const;
export type SortBy = (typeof SORTS)[number];
// 默认按开球时间排序。原因：用户找 tee time 时，最先看的是「几点能打」。
export const SORT_DEFAULT: SortBy = "time";

export const STRINGS = {
  appName: "GreenLight", tagline: "Find & book tee times near you",
  navQuery: "Search", navWatch: "Watch Alerts",
  filterTitle: "Filters", courseFilterTitle: "Golf Courses", priceFilterTitle: "Price Range",
  sortFilterTitle: "Sort by", reset: "Reset", done: "Done",
  prices: { all: "Any", low: "≤$40", mid: "$41–70", high: "$71–120", top: "$120+" },
  sorts: { rec: "Recommended", price: "Lowest price", time: "Earliest time" },
  coursesChip: (selected: number, total: number) => `${selected} of ${total} courses`,
  book: "Book",
  // 维护中的球场默认排除，也不能点开。
  // 原因：上游站点抓取不了，时段数据已经停止更新。
  maintenanceBadge: "Under maintenance",
  maintenanceToast: "That course is under maintenance — its tee times aren't being updated.",
  noResults: "No tee times match your filters.",
  // 时段行翻页箭头的读屏标签（视觉上就是 ‹ ›）
  earlierTimes: "Earlier times", laterTimes: "Later times",
  // "(1/4)" 表示剩 1 个位，一组满员 4 人。
  // 这种写法比 "1 seats" 短，同时说明了容量。
  seatsText: (available: number) => `(${available}/4)`,
  loading: "Loading…", today: "Today",
  weekdays: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"],
  monthLabel: (monthIndex: number) => ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"][monthIndex],
  countText: (courseCount: number, slotCount: number) => `Found ${courseCount} courses, ${slotCount} time slots`,
  bookToast: (name: string) => "Redirecting to booking: " + name,
  offline: "Backend offline — no data to show.",
  // 拿不到数据的原因不止「后端没开」一种。
  // 提示必须说对原因。否则用户会去排查一台正常的服务器。
  unauthorized: "This page isn't authorized to talk to the backend — no data to show.",
  serverError: "The backend hit an error — not your fault. Try again in a moment.",
  loadFailed: "Couldn't load data from the backend.",
} as const;

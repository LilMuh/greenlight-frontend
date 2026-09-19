// 原来最高一档是开口的 "$70+"。接进 West Coast Golf Group 之后那一档从 $70 一路混到
// $135（Hazelmere / Swaneset），点它等于没筛，所以在 120 处再切一刀。
export const PRICE_BUCKETS = ["all", "low", "mid", "high", "top"] as const;
export type PriceBucket = (typeof PRICE_BUCKETS)[number];
export const SORTS = ["rec", "price", "time"] as const;
export type SortBy = (typeof SORTS)[number];
// 默认按开球时间从早到晚排。找 tee time 的人第一眼要看的是「几点能打」，
// 评分（rec）是选球场时才有用的次要标准，何况它来自 Google Maps、可能整列都是 null。
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
  // 维护中的球场：上游站点抓不动，时段数据已经停更，所以默认排除、也点不进来
  maintenanceBadge: "Under maintenance",
  maintenanceToast: "That course is under maintenance — its tee times aren't being updated.",
  noResults: "No tee times match your filters.",
  // 时段行翻页箭头的读屏标签（视觉上就是 ‹ ›）
  earlierTimes: "Earlier times", laterTimes: "Later times",
  loading: "Loading…", seatsUnit: " seats", today: "Today",
  weekdays: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"],
  monthLabel: (monthIndex: number) => ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"][monthIndex],
  countText: (courseCount: number, slotCount: number) => `Found ${courseCount} courses, ${slotCount} time slots`,
  bookToast: (name: string) => "Redirecting to booking: " + name,
  offline: "Backend offline — no data to show.",
  // 拿不到数据的原因不止「后端没开」一种，说错了会让人跑去查一台好好的服务器
  unauthorized: "This page isn't authorized to talk to the backend — no data to show.",
  serverError: "The backend hit an error — not your fault. Try again in a moment.",
  loadFailed: "Couldn't load data from the backend.",
} as const;

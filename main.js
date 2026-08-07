// Tee-time search page. Mirrors the imported "TeeTime Query" design, wired to
// the tee-times API in api.js. Data shown is only what the backend returns — if
// it's unreachable the page shows an empty state and an offline notice rather
// than any fabricated data. All filtering/sorting runs client-side.
import { getHealth, getCourses, getTeeTimes } from "./api.js";

const PRICE_BUCKETS = ["all", "low", "mid", "high"];
const SORTS = ["rec", "price", "time"];

// --- Booking deep links -----------------------------------------------------
//
// tee_time / course 表里都没存预订页 URL，只能按 source + site + slug 反推。后端邮件
// 里那条 BOOK 链接（BookingLinkBuilder + greenlight.mail.booking-url-template）做的是
// 同一件事，但那份模板在后端配置里，没有任何 API 暴露出来，所以这里另拼一份。
//
// 参数名 Date / CourseId / TeeOffTimeMin / TeeOffTimeMax 是 2026-08-06 在
// golfvancouver.cps.golf 上实测的：改这两个参数，页面自己发出的 TeeTimes 请求里
// searchDate / courseIds 会跟着变，左侧球场下拉也会选中对应球场。注意这套首字母大写的
// 参数名，和它转发给自己后端 API 时用的 searchDate / courseIds 不是一套。
//
// 不带 Player：这一页没有「几个人打」这个概念，落地页的 Players 默认就是 Any，
// 那已经是最宽松的，硬塞一个数字反而会把时段筛掉。
const CPS_DAY_MIN = "0";
const CPS_DAY_MAX = "23.999722222222225"; // CPS 搜索页自己用的上界

// slug → CPS 内部球场 id。CPS 用一个小整数区分同站点下的球场，/api/courses 不返回它，
// 只能在前端留一份，来源是 greenlight-scraper 的 CpsCourseId 枚举。
// 认不出的 slug 就不带 CourseId——落地页会列出当天全部球场，日期仍然是对的。
const CPS_COURSE_IDS = { langara: 1, fraserview: 2, mccleery: 3 };

function bookingUrl(course, isoDate) {
  if (course.source !== "cps" || !course.site) return null;
  const url = new URL(`https://${course.site}.cps.golf/onlineresweb/search-teetime`);
  url.searchParams.set("Date", isoDate);
  const cpsCourseId = CPS_COURSE_IDS[course.id];
  if (cpsCourseId != null) url.searchParams.set("CourseId", String(cpsCourseId));
  url.searchParams.set("TeeOffTimeMin", CPS_DAY_MIN);
  url.searchParams.set("TeeOffTimeMax", CPS_DAY_MAX);
  return url.toString();
}

// --- Copy -------------------------------------------------------------------

const STRINGS = {
  appName: "GreenLight", tagline: "Find & book tee times near you",
  navQuery: "Search", navWatch: "Watch Alerts",
  filterTitle: "Filters", courseFilterTitle: "Golf Courses", priceFilterTitle: "Price Range",
  sortFilterTitle: "Sort by", reset: "Reset", done: "Done",
  prices: { all: "Any", low: "≤$40", mid: "$41–70", high: "$70+" },
  sorts: { rec: "Recommended", price: "Lowest price", time: "Earliest time" },
  coursesChip: (selected, total) => `${selected} of ${total} courses`,
  book: "Book",
  noResults: "No tee times match your filters.",
  loading: "Loading…", seatsUnit: " seats", today: "Today",
  weekdays: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"],
  monthLabel: (monthIndex) => ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"][monthIndex],
  countText: (courseCount, slotCount) => `Found ${courseCount} courses, ${slotCount} time slots`,
  bookToast: (name) => "Redirecting to booking: " + name,
  offline: "Backend offline — no data to show.",
};

// --- State ------------------------------------------------------------------

const state = {
  offline: false,
  loading: true,
  courses: [], // [{ id, name, imageUrl }]
  dayData: [], // tee times for the selected date: [{ id, name, imageUrl, teeTimes:[{time,price,availableSeats}] }]
  dates: buildDates(),
  selectedDateIndex: 0,
  filterOpen: false,
  priceBucket: "all",
  excludedCourseIds: [],
  sortBy: "rec",
  selectedChip: null,
  toast: "",
};

let toastTimer = null;
const app = document.getElementById("app");

// --- Helpers ----------------------------------------------------------------

function buildDates() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const dates = [];
  // 今天 + 后 7 天，共 8 天，和 scraper 的抓取范围对齐
  for (let index = 0; index < 8; index++) {
    const date = new Date(today);
    date.setDate(today.getDate() + index);
    dates.push({ date, iso: toISO(date) });
  }
  return dates;
}

function toISO(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[character]));
}

function priceMatch(price, bucket) {
  if (bucket === "all") return true;
  if (bucket === "low") return price <= 40;
  if (bucket === "mid") return price > 40 && price <= 70;
  if (bucket === "high") return price > 70;
  return true;
}

function showToast(message, durationMs = 2200) {
  state.toast = message;
  render();
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    state.toast = "";
    render();
  }, durationMs);
}

// --- Course decoration (Google Maps 数据，随时可能为 null) --------------------
//
// 地址和评分是抓 Google Maps 页面拿的，Google 改版式就会取不到，后端那边取不到写
// null 不写假值。所以这两块各自独立降级：有就显示，没有就整块不渲染——绝不显示
// "⭐ 0" 或者空括号，那看起来像「这个球场评分是 0」而不是「我们没拿到数据」。

// "⭐ 4.3 (1,330)"。只有评分没有评价数时就不显示括号那截。
function ratingHtml(course) {
  if (course.rating == null) return "";
  const count = course.ratingCount != null ? ` (${Number(course.ratingCount).toLocaleString()})` : "";
  return `<span class="tt-card-rating">⭐ ${escapeHtml(String(course.rating))}${escapeHtml(count)}</span>`;
}

// 库里存的是完整地址（"7800 Vivian Dr, Vancouver, BC V5S 2V9, Canada"），
// 卡片放不下也不需要省市邮编，只取前两段："7800 Vivian Dr, Vancouver"。
// 完整值留在后端，以后做导航链接/算距离时还用得上。
//
// 城市那段单独包一层 .tt-addr-city：手机宽度下 CSS 会把它藏掉，只剩街道，
// 省得和球场名抢那一行。放 CSS 里做是为了不必监听 resize 重渲染。
function addressHtml(course) {
  if (!course.address) return "";
  const [street = "", city = ""] = String(course.address).split(",");
  if (!street.trim()) return "";
  const cityHtml = city.trim() ? `<span class="tt-addr-city">, ${escapeHtml(city.trim())}</span>` : "";
  return `<span class="tt-card-address" title="${escapeHtml(course.address)}">${escapeHtml(street.trim())}${cityHtml}</span>`;
}

// Turn a flat /api/tee-times list into the design's per-course grouping. The
// backend gives { courseId, course, time, price, availableSeats, ... }; the seat
// count may be missing, so it degrades to null rather than breaking the card.
function groupTeeTimes(teeTimeList) {
  const byCourseId = new Map();
  for (const teeTime of teeTimeList || []) {
    const courseKey = String(teeTime.courseId ?? teeTime.course ?? "");
    const matchedCourse = state.courses.find((course) => course.id === courseKey || course.name === courseKey);
    const courseId = matchedCourse ? matchedCourse.id : courseKey;
    if (!byCourseId.has(courseId)) {
      byCourseId.set(courseId, {
        id: courseId,
        name: matchedCourse ? matchedCourse.name : String(teeTime.course ?? courseKey),
        // 照片、地址、评分、source/site 都来自 /api/courses，tee-time 接口不带它们，
        // 在这里挂上去。source/site 是拼预订链接用的，取不到就退化成不可点的按钮。
        imageUrl: matchedCourse ? matchedCourse.imageUrl : null,
        source: matchedCourse ? matchedCourse.source : null,
        site: matchedCourse ? matchedCourse.site : null,
        address: matchedCourse ? matchedCourse.address : null,
        rating: matchedCourse ? matchedCourse.rating : null,
        ratingCount: matchedCourse ? matchedCourse.ratingCount : null,
        teeTimes: [],
      });
    }
    byCourseId.get(courseId).teeTimes.push({
      time: teeTime.time,
      price: Number(teeTime.price) || 0,
      availableSeats: teeTime.availableSeats != null ? Number(teeTime.availableSeats) : null,
    });
  }
  return [...byCourseId.values()];
}

// --- Data loading -----------------------------------------------------------

async function loadDay() {
  state.loading = true;
  render();
  const iso = state.dates[state.selectedDateIndex].iso;
  try {
    const teeTimeList = await getTeeTimes({ date: iso });
    state.dayData = groupTeeTimes(teeTimeList);
  } catch {
    state.offline = true;
    state.dayData = []; // backend down — show nothing, not fake data
  }
  state.loading = false;
  render();
}

// --- Filtering / sorting ----------------------------------------------------

function computeCards() {
  const cards = state.dayData
    .filter((course) => !state.excludedCourseIds.includes(course.id))
    .map((course) => {
      const teeTimes = course.teeTimes.filter((teeTime) => priceMatch(teeTime.price, state.priceBucket));
      return { course, teeTimes };
    })
    .filter((card) => card.teeTimes.length > 0);

  for (const card of cards) {
    card.cheapest = Math.min(...card.teeTimes.map((teeTime) => teeTime.price));
    card.earliest = card.teeTimes.map((teeTime) => teeTime.time).slice().sort()[0];
  }

  if (state.sortBy === "price") cards.sort((left, right) => left.cheapest - right.cheapest);
  else if (state.sortBy === "time") cards.sort((left, right) => left.earliest.localeCompare(right.earliest));
  // "rec" = 评分高的排前面。rating 是 Google Maps 抓来的，可能为 null——没评分的
  // 排到最后，而不是当成 0 混进低分区，那会把「没数据」说成「评价差」。
  else cards.sort((left, right) => (right.course.rating ?? -1) - (left.course.rating ?? -1));

  return cards;
}

// --- Rendering --------------------------------------------------------------

function render() {
  const strings = STRINGS;
  const selectedIso = state.dates[state.selectedDateIndex].iso;

  const dates = state.dates
    .map((dateInfo, index) => {
      const isActive = index === state.selectedDateIndex;
      const label = index === 0 ? strings.today : strings.weekdays[dateInfo.date.getDay()];
      return `<div class="tt-date${isActive ? " is-active" : ""}" data-act="date" data-idx="${index}">
        <span class="tt-date-top">${escapeHtml(label)}</span>
        <span class="tt-date-num">${dateInfo.date.getDate()}</span>
        <span class="tt-date-top">${escapeHtml(strings.monthLabel(dateInfo.date.getMonth()))}</span>
      </div>`;
    })
    .join("");

  const courseChecks = state.courses
    .map((course) => {
      const isIncluded = !state.excludedCourseIds.includes(course.id);
      return `<div class="tt-course${isIncluded ? " is-on" : ""}" data-act="course" data-id="${escapeHtml(course.id)}">
        <span class="tt-box"></span>
        <span class="tt-course-name">${escapeHtml(course.name)}</span>
      </div>`;
    })
    .join("");

  const priceChips = PRICE_BUCKETS.map(
    (bucket) => `<button class="tt-chip-btn${state.priceBucket === bucket ? " is-active" : ""}" data-act="price" data-val="${bucket}">${escapeHtml(strings.prices[bucket])}</button>`
  ).join("");

  const sortOptions = SORTS.map(
    (sortOption) => `<button class="tt-chip-btn${state.sortBy === sortOption ? " is-active" : ""}" data-act="sort" data-val="${sortOption}">${escapeHtml(strings.sorts[sortOption])}</button>`
  ).join("");

  // 面板收起时用户看不到自己选了什么，所以把生效的筛选摘成 chips 放在按钮旁边，
  // 数量同时当作按钮上的角标。默认值（Any / Recommended / 球场全选）不算生效。
  const summaryChips = [];
  if (state.priceBucket !== "all") summaryChips.push(strings.prices[state.priceBucket]);
  const includedCourseCount = state.courses.filter((course) => !state.excludedCourseIds.includes(course.id)).length;
  if (state.courses.length && includedCourseCount < state.courses.length) {
    summaryChips.push(strings.coursesChip(includedCourseCount, state.courses.length));
  }
  if (state.sortBy !== "rec") summaryChips.push(strings.sorts[state.sortBy]);

  const summaryHtml = summaryChips
    .map((label) => `<span class="tt-summary-chip">${escapeHtml(label)}</span>`)
    .join("");

  const cards = computeCards();
  const totalSlots = cards.reduce((total, card) => total + card.teeTimes.length, 0);

  let countText;
  if (state.loading) countText = strings.loading;
  else countText = strings.countText(cards.length, totalSlots);

  const cardsHtml = cards
    .map(({ course, teeTimes }) => {
      const teeSlotsHtml = teeTimes
        .map((teeTime) => {
          const chipKey = course.id + "|" + teeTime.time;
          const isSelected = state.selectedChip === chipKey;
          const isLow = teeTime.availableSeats != null && teeTime.availableSeats <= 2;
          const seatsHtml = teeTime.availableSeats != null ? `<span class="tt-tee-slots${isLow ? " is-low" : ""}">${teeTime.availableSeats}${escapeHtml(strings.seatsUnit)}</span>` : "";
          return `<div class="tt-tee${isSelected ? " is-on" : ""}" data-act="chip" data-key="${escapeHtml(chipKey)}">
            <span class="tt-tee-time">${escapeHtml(teeTime.time)}</span>
            <span class="tt-tee-price">$${teeTime.price}</span>
            ${seatsHtml}
          </div>`;
        })
        .join("");
      // 图片加载失败就把 <img> 摘掉，露出 .tt-photo 的条纹底，不显示裂图
      const photoHtml = course.imageUrl
        ? `<img src="${escapeHtml(course.imageUrl)}" alt="" loading="lazy" onerror="this.remove()">`
        : "";
      // 拼得出链接就用真 <a>（能新标签打开、能右键复制）；拼不出（比如 /api/courses
      // 没取到、source 不是 cps）退回原来的按钮 + toast，不给一个点了没反应的链接。
      const url = bookingUrl(course, selectedIso);
      const bookHtml = url
        ? `<a class="tt-book" href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(strings.book)}</a>`
        : `<button class="tt-book" data-act="book" data-id="${escapeHtml(course.id)}">${escapeHtml(strings.book)}</button>`;
      return `<div class="tt-card">
        <div class="tt-card-row">
          <div class="tt-photo">${photoHtml}</div>
          <div class="tt-card-info">
            <strong class="tt-card-name">${escapeHtml(course.name)}</strong>
            ${ratingHtml(course)}
            ${addressHtml(course)}
          </div>
          ${bookHtml}
        </div>
        <div class="tt-tees">${teeSlotsHtml}</div>
      </div>`;
    })
    .join("");

  // 加载中不清空列表，只把上一天的卡片调淡：清空会让内容整整消失一帧（列表超过一屏时
  // 还会连带滚动条消失、位置跳回顶部），切日期时看到的「闪」就是这一下。空白期长短等于
  // /api/tee-times 的响应时间。只有首次加载、手上一条数据都没有时才留空。
  const listBody = cards.length
    ? `<div class="tt-cards${state.loading ? " is-loading" : ""}">${cardsHtml}</div>`
    : state.loading
    ? ""
    : `<div class="tt-empty">${escapeHtml(strings.noResults)}</div>`;

  app.innerHTML = `
    <div class="tt-header">
      <div class="tt-brand">
        <span class="tt-dot"></span>
        <div class="tt-brand-text">
          <strong>${escapeHtml(strings.appName)}</strong>
          <small>${escapeHtml(strings.tagline)}</small>
        </div>
      </div>
      <div class="tt-head-right">
        <div class="tt-nav">
          <a href="index.html" class="is-active">${escapeHtml(strings.navQuery)}</a>
          <a href="config.html">${escapeHtml(strings.navWatch)}</a>
        </div>
      </div>
    </div>

    <div class="tt-toolbar">
      <div class="tt-toolbar-inner">
        <div class="tt-dates">${dates}</div>

        <div class="tt-filter-row">
          <button class="tt-filter-btn${state.filterOpen ? " is-open" : ""}" data-act="filter">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true">
              <line x1="21" y1="6" x2="3" y2="6"></line><line x1="17" y1="12" x2="7" y2="12"></line><line x1="13" y1="18" x2="11" y2="18"></line>
            </svg>
            <span>${escapeHtml(strings.filterTitle)}</span>
            ${summaryChips.length ? `<span class="tt-filter-badge">${summaryChips.length}</span>` : ""}
            <svg class="tt-caret" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <polyline points="6 9 12 15 18 9"></polyline>
            </svg>
          </button>
          <div class="tt-summary">${summaryHtml}</div>
          <span class="tt-count">${escapeHtml(countText)}</span>
        </div>

        ${state.filterOpen ? `<div class="tt-panel">
          <div class="tt-section">
            <div class="tt-section-title">${escapeHtml(strings.courseFilterTitle)}</div>
            <div class="tt-courses">${courseChecks || `<span class="tt-course-name">—</span>`}</div>
          </div>
          <div class="tt-section">
            <div class="tt-section-title">${escapeHtml(strings.priceFilterTitle)}</div>
            <div class="tt-chips">${priceChips}</div>
          </div>
          <div class="tt-section">
            <div class="tt-section-title">${escapeHtml(strings.sortFilterTitle)}</div>
            <div class="tt-sorts">${sortOptions}</div>
          </div>
          <div class="tt-panel-actions">
            <button class="tt-btn-reset" data-act="reset">${escapeHtml(strings.reset)}</button>
            <button class="tt-btn-done" data-act="filter">${escapeHtml(strings.done)}</button>
          </div>
        </div>` : ""}
      </div>
    </div>

    <div class="tt-body">${listBody}</div>

    ${state.toast ? `<div class="tt-toast">${escapeHtml(state.toast)}</div>` : ""}
  `;
}

// --- Event delegation -------------------------------------------------------

app.addEventListener("click", (event) => {
  const target = event.target.closest("[data-act]");
  if (!target) return;
  const action = target.dataset.act;
  const id = target.dataset.id;
  const value = target.dataset.val;
  const index = target.dataset.idx;
  const key = target.dataset.key;
  switch (action) {
    case "date":
      state.selectedDateIndex = parseInt(index, 10);
      state.selectedChip = null;
      loadDay();
      break;
    case "filter":
      state.filterOpen = !state.filterOpen;
      render();
      break;
    case "reset":
      state.priceBucket = "all";
      state.sortBy = "rec";
      state.excludedCourseIds = [];
      render();
      break;
    case "course":
      state.excludedCourseIds = state.excludedCourseIds.includes(id)
        ? state.excludedCourseIds.filter((excludedId) => excludedId !== id)
        : [...state.excludedCourseIds, id];
      render();
      break;
    case "price":
      state.priceBucket = value;
      render();
      break;
    case "sort":
      state.sortBy = value;
      render();
      break;
    case "chip":
      state.selectedChip = state.selectedChip === key ? null : key;
      render();
      break;
    case "book": {
      const course = state.courses.find((candidate) => candidate.id === id)
        || state.dayData.find((candidate) => candidate.id === id);
      showToast(STRINGS.bookToast(course ? course.name : id));
      break;
    }
  }
});

// --- Init -------------------------------------------------------------------

async function init() {
  render(); // paint the shell immediately (loading state)

  // Health check is best-effort; a failure just flags offline mode.
  try {
    await getHealth();
  } catch {
    state.offline = true;
  }

  try {
    const courses = await getCourses();
    if (Array.isArray(courses) && courses.length) {
      // 用 slug 当标识：tee-time 的 courseId 也是 slug，两边好对应
      // address / rating / ratingCount 来自 Google Maps，可能为 null，卡片各自降级
      state.courses = courses.map((course) => ({
        id: course.slug,
        name: course.name,
        imageUrl: course.imageUrl,
        source: course.source ?? null,
        site: course.site ?? null,
        address: course.address ?? null,
        rating: course.rating ?? null,
        ratingCount: course.ratingCount ?? null,
      }));
    }
  } catch {
    state.offline = true;
  }

  await loadDay();

  if (state.offline) showToast(STRINGS.offline, 2600);
}

init();

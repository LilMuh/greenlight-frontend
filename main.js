// Tee-time search page. Mirrors the imported "TeeTime Query" design, wired to
// the tee-times API in api.js. Data shown is only what the backend returns — if
// it's unreachable the page shows an empty state and an offline notice rather
// than any fabricated data. All filtering/sorting runs client-side.
import { getHealth, getCourses, getTeeTimes } from "./api.js";

const PERIODS = ["all", "am", "pm", "eve"];
const PRICE_BUCKETS = ["all", "low", "mid", "high"];
const SORTS = ["rec", "price", "time"];

// --- Copy -------------------------------------------------------------------

const STRINGS = {
  appName: "GreenLight", tagline: "Find & book tee times near you",
  navQuery: "Search", navWatch: "Watch Alerts",
  playersLabel: "Players", periodLabel: "Time of day",
  filterTitle: "Filters", courseFilterTitle: "Golf Courses", priceFilterTitle: "Price Range",
  availOnly: "Available (3+) only",
  periods: { all: "All day", am: "Morning", pm: "Afternoon", eve: "Evening" },
  prices: { all: "Any", low: "≤$40", mid: "$41–70", high: "$70+" },
  sorts: { rec: "Recommended", price: "Lowest price", time: "Earliest time" },
  book: "Book",
  noResults: "No tee times match your filters.",
  loading: "Loading…", slotsLeft: " left", today: "Today",
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
  courses: [], // [{ id, name }]
  dayData: [], // tee times for the selected date: [{ id, name, teeTimes:[{time,price,slots}] }]
  dates: buildDates(),
  selectedDateIndex: 0,
  players: 2,
  period: "all",
  priceBucket: "all",
  onlyAvailable: false,
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

function periodMatch(time, period) {
  if (period === "all") return true;
  const hour = parseInt(String(time).split(":")[0], 10);
  if (period === "am") return hour < 11;
  if (period === "pm") return hour >= 11 && hour < 15;
  if (period === "eve") return hour >= 15;
  return true;
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

// Turn a flat /api/tee-times list into the design's per-course grouping. The
// backend gives { courseId, course, time, price, ... }; slots may be missing,
// so it degrades to null rather than breaking the card.
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
        teeTimes: [],
      });
    }
    byCourseId.get(courseId).teeTimes.push({
      time: teeTime.time,
      price: Number(teeTime.price) || 0,
      slots: teeTime.slots != null ? Number(teeTime.slots) : null,
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
      const teeTimes = course.teeTimes.filter(
        (teeTime) =>
          periodMatch(teeTime.time, state.period) &&
          priceMatch(teeTime.price, state.priceBucket) &&
          (!state.onlyAvailable || teeTime.slots == null || teeTime.slots >= 3)
      );
      return { course, teeTimes };
    })
    .filter((card) => card.teeTimes.length > 0);

  for (const card of cards) {
    card.cheapest = Math.min(...card.teeTimes.map((teeTime) => teeTime.price));
    card.earliest = card.teeTimes.map((teeTime) => teeTime.time).slice().sort()[0];
  }

  if (state.sortBy === "price") cards.sort((left, right) => left.cheapest - right.cheapest);
  else if (state.sortBy === "time") cards.sort((left, right) => left.earliest.localeCompare(right.earliest));
  // "rec" keeps backend/source order.

  return cards;
}

// --- Rendering --------------------------------------------------------------

function render() {
  const strings = STRINGS;

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

  const players = [1, 2, 3, 4]
    .map((count) => `<button class="tt-num${state.players === count ? " is-active" : ""}" data-act="players" data-val="${count}">${count}</button>`)
    .join("");

  const periods = PERIODS.map(
    (period) => `<button class="tt-period${state.period === period ? " is-active" : ""}" data-act="period" data-val="${period}">${escapeHtml(strings.periods[period])}</button>`
  ).join("");

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

  const sortTabs = SORTS.map(
    (sortOption) => `<button class="tt-sort-btn${state.sortBy === sortOption ? " is-active" : ""}" data-act="sort" data-val="${sortOption}">${escapeHtml(strings.sorts[sortOption])}</button>`
  ).join("");

  const cards = computeCards();
  const totalSlots = cards.reduce((total, card) => total + card.teeTimes.length, 0);

  let countText;
  if (state.loading) countText = strings.loading;
  else countText = strings.countText(cards.length, totalSlots);

  const cardsHtml = cards
    .map(({ course, teeTimes, cheapest }) => {
      const teeSlotsHtml = teeTimes
        .map((teeTime) => {
          const chipKey = course.id + "|" + teeTime.time;
          const isSelected = state.selectedChip === chipKey;
          const isLow = teeTime.slots != null && teeTime.slots <= 2;
          const slotsHtml = teeTime.slots != null ? `<span class="tt-tee-slots${isLow ? " is-low" : ""}">${teeTime.slots}${escapeHtml(strings.slotsLeft)}</span>` : "";
          return `<div class="tt-tee${isSelected ? " is-on" : ""}" data-act="chip" data-key="${escapeHtml(chipKey)}">
            <span class="tt-tee-time">${escapeHtml(teeTime.time)}</span>
            <span class="tt-tee-price">$${teeTime.price}</span>
            ${slotsHtml}
          </div>`;
        })
        .join("");
      return `<div class="tt-card">
        <div class="tt-card-row">
          <div class="tt-photo"><span>course photo</span></div>
          <div class="tt-card-info">
            <strong class="tt-card-name">${escapeHtml(course.name)}</strong>
          </div>
          <div class="tt-card-right">
            <div class="tt-price">from $${cheapest}</div>
            <button class="tt-book" data-act="book" data-id="${escapeHtml(course.id)}">${escapeHtml(strings.book)}</button>
          </div>
        </div>
        <div class="tt-tees">${teeSlotsHtml}</div>
      </div>`;
    })
    .join("");

  const listBody = state.loading
    ? ""
    : cards.length
    ? `<div class="tt-cards">${cardsHtml}</div>`
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
      <div class="tt-dates">${dates}</div>
      <div class="tt-controls">
        <div class="tt-control">
          <span class="tt-control-label">${escapeHtml(strings.playersLabel)}</span>
          <div class="tt-nums">${players}</div>
        </div>
        <div class="tt-control">
          <span class="tt-control-label">${escapeHtml(strings.periodLabel)}</span>
          <div class="tt-periods">${periods}</div>
        </div>
      </div>
    </div>

    <div class="tt-body">
      <div class="tt-sidebar">
        <div class="tt-filter-title">${escapeHtml(strings.filterTitle)}</div>
        <div class="tt-section">
          <div class="tt-section-title">${escapeHtml(strings.courseFilterTitle)}</div>
          ${courseChecks || `<div class="tt-course-name">—</div>`}
        </div>
        <div class="tt-section">
          <div class="tt-section-title">${escapeHtml(strings.priceFilterTitle)}</div>
          <div class="tt-chips">${priceChips}</div>
        </div>
        <div class="tt-toggle-row" data-act="avail">
          <span class="tt-toggle-label">${escapeHtml(strings.availOnly)}</span>
          <div class="tt-switch${state.onlyAvailable ? " is-on" : ""}"><div class="tt-switch-knob"></div></div>
        </div>
      </div>

      <div class="tt-main">
        <div class="tt-main-head">
          <span class="tt-count">${escapeHtml(countText)}</span>
          <div class="tt-sort">${sortTabs}</div>
        </div>
        ${listBody}
      </div>
    </div>

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
    case "players":
      state.players = parseInt(value, 10);
      render();
      break;
    case "period":
      state.period = value;
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
    case "avail":
      state.onlyAvailable = !state.onlyAvailable;
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
      state.courses = courses.map((course) => ({ id: course.slug, name: course.name }));
    }
  } catch {
    state.offline = true;
  }

  await loadDay();

  if (state.offline) showToast(STRINGS.offline, 2600);
}

init();

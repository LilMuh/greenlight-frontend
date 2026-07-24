// Tee-time search page. Mirrors the imported "TeeTime Query" design, wired to
// the tee-times API in api.js. Same philosophy as config.js: if the backend is
// unreachable the page still renders against sample data, and every filter/sort
// runs client-side over whatever tee times we managed to load.
import { getHealth, getCourses, getTeeTimes } from "./api.js";

// --- Sample data (offline fallback so the page is always demonstrable) -------
// Real Vancouver courses + realistic CAD green fees, used only when the backend
// can't be reached.

const MOCK_COURSES = [
  { id: "fraserview", name: "Fraserview Golf Course",
    teeTimes: [ {time:"07:00",price:52,slots:6},{time:"09:20",price:48,slots:3},{time:"12:40",price:42,slots:8},{time:"15:50",price:34,slots:5},{time:"16:30",price:30,slots:9} ] },
  { id: "langara", name: "Langara Golf Course",
    teeTimes: [ {time:"06:50",price:50,slots:4},{time:"08:30",price:46,slots:1},{time:"11:10",price:44,slots:6},{time:"14:20",price:40,slots:3},{time:"17:00",price:28,slots:7} ] },
  { id: "mccleery", name: "McCleery Golf Course",
    teeTimes: [ {time:"07:00",price:55,slots:2},{time:"09:40",price:50,slots:5},{time:"12:30",price:46,slots:1},{time:"16:10",price:32,slots:6} ] },
];

const PERIODS = ["all", "am", "pm", "eve"];
const PRICE_BUCKETS = ["all", "low", "mid", "high"];
const SORTS = ["rec", "price", "time"];

// --- Copy -------------------------------------------------------------------

const S = {
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
  monthLabel: (m) => ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"][m],
  countText: (c, t) => `Found ${c} courses, ${t} time slots`,
  bookToast: (name) => "Redirecting to booking: " + name,
  offline: "Backend offline — showing sample data.",
};

// --- State ------------------------------------------------------------------

const state = {
  offline: false,
  loading: true,
  courses: [], // [{ id, name }]
  dayData: [], // tee times for the selected date: [{ id, name, teeTimes:[{time,price,slots}] }]
  dates: buildDates(),
  selectedDateIdx: 0,
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
  const base = new Date();
  base.setHours(0, 0, 0, 0);
  const out = [];
  for (let i = 0; i < 10; i++) {
    const d = new Date(base);
    d.setDate(base.getDate() + i);
    out.push({ date: d, iso: toISO(d) });
  }
  return out;
}

function toISO(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function esc(str) {
  return String(str ?? "").replace(/[&<>"']/g, (ch) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[ch]));
}

function periodMatch(time, period) {
  if (period === "all") return true;
  const h = parseInt(String(time).split(":")[0], 10);
  if (period === "am") return h < 11;
  if (period === "pm") return h >= 11 && h < 15;
  if (period === "eve") return h >= 15;
  return true;
}

function priceMatch(price, bucket) {
  if (bucket === "all") return true;
  if (bucket === "low") return price <= 40;
  if (bucket === "mid") return price > 40 && price <= 70;
  if (bucket === "high") return price > 70;
  return true;
}

function showToast(msg, ms = 2200) {
  state.toast = msg;
  render();
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    state.toast = "";
    render();
  }, ms);
}

// Turn a flat /api/tee-times list into the design's per-course grouping. The
// backend gives { courseId, course, time, price, ... }; slots may be missing,
// so it degrades to null rather than breaking the card.
function groupTeeTimes(list) {
  const byCourse = new Map();
  for (const tt of list || []) {
    const key = String(tt.courseId ?? tt.course ?? "");
    const known = state.courses.find((c) => c.id === key || c.name === key);
    const id = known ? known.id : key;
    if (!byCourse.has(id)) {
      byCourse.set(id, {
        id,
        name: known ? known.name : String(tt.course ?? key),
        teeTimes: [],
      });
    }
    byCourse.get(id).teeTimes.push({
      time: tt.time,
      price: Number(tt.price) || 0,
      slots: tt.slots != null ? Number(tt.slots) : null,
    });
  }
  return [...byCourse.values()];
}

// --- Data loading -----------------------------------------------------------

async function loadDay() {
  state.loading = true;
  render();
  const iso = state.dates[state.selectedDateIdx].iso;
  try {
    const list = await getTeeTimes({ date: iso });
    state.dayData = groupTeeTimes(list);
  } catch {
    state.offline = true;
    state.dayData = MOCK_COURSES; // demo data (not date-specific)
  }
  state.loading = false;
  render();
}

// --- Filtering / sorting ----------------------------------------------------

function computeCards() {
  const cards = state.dayData
    .filter((c) => !state.excludedCourseIds.includes(c.id))
    .map((c) => {
      const teeTimes = c.teeTimes.filter(
        (tt) =>
          periodMatch(tt.time, state.period) &&
          priceMatch(tt.price, state.priceBucket) &&
          (!state.onlyAvailable || tt.slots == null || tt.slots >= 3)
      );
      return { c, teeTimes };
    })
    .filter((x) => x.teeTimes.length > 0);

  for (const x of cards) {
    x.cheapest = Math.min(...x.teeTimes.map((tt) => tt.price));
    x.earliest = x.teeTimes.map((tt) => tt.time).slice().sort()[0];
  }

  if (state.sortBy === "price") cards.sort((a, b) => a.cheapest - b.cheapest);
  else if (state.sortBy === "time") cards.sort((a, b) => a.earliest.localeCompare(b.earliest));
  // "rec" keeps backend/source order.

  return cards;
}

// --- Rendering --------------------------------------------------------------

function render() {
  const s = S;

  const dates = state.dates
    .map((d, i) => {
      const on = i === state.selectedDateIdx;
      const top = i === 0 ? s.today : s.weekdays[d.date.getDay()];
      return `<div class="tt-date${on ? " is-active" : ""}" data-act="date" data-idx="${i}">
        <span class="tt-date-top">${esc(top)}</span>
        <span class="tt-date-num">${d.date.getDate()}</span>
        <span class="tt-date-top">${esc(s.monthLabel(d.date.getMonth()))}</span>
      </div>`;
    })
    .join("");

  const players = [1, 2, 3, 4]
    .map((n) => `<button class="tt-num${state.players === n ? " is-active" : ""}" data-act="players" data-val="${n}">${n}</button>`)
    .join("");

  const periods = PERIODS.map(
    (p) => `<button class="tt-period${state.period === p ? " is-active" : ""}" data-act="period" data-val="${p}">${esc(s.periods[p])}</button>`
  ).join("");

  const courseChecks = state.courses
    .map((c) => {
      const on = !state.excludedCourseIds.includes(c.id);
      return `<div class="tt-course${on ? " is-on" : ""}" data-act="course" data-id="${esc(c.id)}">
        <span class="tt-box"></span>
        <span class="tt-course-name">${esc(c.name)}</span>
      </div>`;
    })
    .join("");

  const priceChips = PRICE_BUCKETS.map(
    (b) => `<button class="tt-chip-btn${state.priceBucket === b ? " is-active" : ""}" data-act="price" data-val="${b}">${esc(s.prices[b])}</button>`
  ).join("");

  const sortTabs = SORTS.map(
    (v) => `<button class="tt-sort-btn${state.sortBy === v ? " is-active" : ""}" data-act="sort" data-val="${v}">${esc(s.sorts[v])}</button>`
  ).join("");

  const cards = computeCards();
  const totalSlots = cards.reduce((sum, x) => sum + x.teeTimes.length, 0);

  let countText;
  if (state.loading) countText = s.loading;
  else countText = s.countText(cards.length, totalSlots);

  const cardsHtml = cards
    .map(({ c, teeTimes, cheapest }) => {
      const tees = teeTimes
        .map((tt) => {
          const key = c.id + "|" + tt.time;
          const on = state.selectedChip === key;
          const low = tt.slots != null && tt.slots <= 2;
          const slots = tt.slots != null ? `<span class="tt-tee-slots${low ? " is-low" : ""}">${tt.slots}${esc(s.slotsLeft)}</span>` : "";
          return `<div class="tt-tee${on ? " is-on" : ""}" data-act="chip" data-key="${esc(key)}">
            <span class="tt-tee-time">${esc(tt.time)}</span>
            <span class="tt-tee-price">$${tt.price}</span>
            ${slots}
          </div>`;
        })
        .join("");
      return `<div class="tt-card">
        <div class="tt-card-row">
          <div class="tt-photo"><span>course photo</span></div>
          <div class="tt-card-info">
            <strong class="tt-card-name">${esc(c.name)}</strong>
          </div>
          <div class="tt-card-right">
            <div class="tt-price">from $${cheapest}</div>
            <button class="tt-book" data-act="book" data-id="${esc(c.id)}">${esc(s.book)}</button>
          </div>
        </div>
        <div class="tt-tees">${tees}</div>
      </div>`;
    })
    .join("");

  const listBody = state.loading
    ? ""
    : cards.length
    ? `<div class="tt-cards">${cardsHtml}</div>`
    : `<div class="tt-empty">${esc(s.noResults)}</div>`;

  app.innerHTML = `
    <div class="tt-header">
      <div class="tt-brand">
        <span class="tt-dot"></span>
        <div class="tt-brand-text">
          <strong>${esc(s.appName)}</strong>
          <small>${esc(s.tagline)}</small>
        </div>
      </div>
      <div class="tt-head-right">
        <div class="tt-nav">
          <a href="index.html" class="is-active">${esc(s.navQuery)}</a>
          <a href="config.html">${esc(s.navWatch)}</a>
        </div>
      </div>
    </div>

    <div class="tt-toolbar">
      <div class="tt-dates">${dates}</div>
      <div class="tt-controls">
        <div class="tt-control">
          <span class="tt-control-label">${esc(s.playersLabel)}</span>
          <div class="tt-nums">${players}</div>
        </div>
        <div class="tt-control">
          <span class="tt-control-label">${esc(s.periodLabel)}</span>
          <div class="tt-periods">${periods}</div>
        </div>
      </div>
    </div>

    <div class="tt-body">
      <div class="tt-sidebar">
        <div class="tt-filter-title">${esc(s.filterTitle)}</div>
        <div class="tt-section">
          <div class="tt-section-title">${esc(s.courseFilterTitle)}</div>
          ${courseChecks || `<div class="tt-course-name">—</div>`}
        </div>
        <div class="tt-section">
          <div class="tt-section-title">${esc(s.priceFilterTitle)}</div>
          <div class="tt-chips">${priceChips}</div>
        </div>
        <div class="tt-toggle-row" data-act="avail">
          <span class="tt-toggle-label">${esc(s.availOnly)}</span>
          <div class="tt-switch${state.onlyAvailable ? " is-on" : ""}"><div class="tt-switch-knob"></div></div>
        </div>
      </div>

      <div class="tt-main">
        <div class="tt-main-head">
          <span class="tt-count">${esc(countText)}</span>
          <div class="tt-sort">${sortTabs}</div>
        </div>
        ${listBody}
      </div>
    </div>

    ${state.toast ? `<div class="tt-toast">${esc(state.toast)}</div>` : ""}
  `;
}

// --- Event delegation -------------------------------------------------------

app.addEventListener("click", (e) => {
  const el = e.target.closest("[data-act]");
  if (!el) return;
  const { act, id, val, idx, key } = el.dataset;
  switch (act) {
    case "date":
      state.selectedDateIdx = parseInt(idx, 10);
      state.selectedChip = null;
      loadDay();
      break;
    case "players":
      state.players = parseInt(val, 10);
      render();
      break;
    case "period":
      state.period = val;
      render();
      break;
    case "course":
      state.excludedCourseIds = state.excludedCourseIds.includes(id)
        ? state.excludedCourseIds.filter((x) => x !== id)
        : [...state.excludedCourseIds, id];
      render();
      break;
    case "price":
      state.priceBucket = val;
      render();
      break;
    case "avail":
      state.onlyAvailable = !state.onlyAvailable;
      render();
      break;
    case "sort":
      state.sortBy = val;
      render();
      break;
    case "chip":
      state.selectedChip = state.selectedChip === key ? null : key;
      render();
      break;
    case "book": {
      const c = state.courses.find((x) => x.id === id) || state.dayData.find((x) => x.id === id);
      showToast(S.bookToast(c ? c.name : id));
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
      state.courses = courses.map((c) => ({ id: String(c.id), name: c.name }));
    }
  } catch {
    state.offline = true;
  }
  if (!state.courses.length) {
    state.courses = MOCK_COURSES.map(({ id, name }) => ({ id, name }));
  }

  await loadDay();

  if (state.offline) showToast(S.offline, 2600);
}

init();

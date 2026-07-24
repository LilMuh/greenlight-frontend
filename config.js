// Watch Alerts page. Mirrors the imported "Watch Alerts" design, wired to the
// watch-config API in api.js. Follows main.js's philosophy: if the backend is
// unreachable the page still works — it falls back to sample data so the UI is
// demonstrable, and every write degrades to a local-only update.
import {
  getCourses,
  listWatchConfigs,
  saveWatchConfig,
  deleteWatchConfig,
} from "./api.js";

// --- Static reference data --------------------------------------------------

// Used only when the backend can't be reached, so the page still renders.
const FALLBACK_COURSES = [
  { id: "fraserview", name: "Fraserview Golf Course" },
  { id: "langara", name: "Langara Golf Course" },
  { id: "mccleery", name: "McCleery Golf Course" },
];

const SAMPLE_WATCHES = [
  { id: "w1", courseIds: ["fraserview", "mccleery"], dateStart: "2026-08-01", dateEnd: "2026-08-15", period: "am", players: 2, maxPrice: 60, email: "you@example.com", active: true },
  { id: "w2", courseIds: ["langara"], dateStart: "2026-07-25", dateEnd: "2026-07-31", period: "all", players: 4, maxPrice: 45, email: "you@example.com", active: false },
];

const PERIODS = ["all", "am", "pm", "eve"];

// Price slider bounds (CAD) — Vancouver municipal green fees sit ~$20–100.
const PRICE_MIN = 20;
const PRICE_MAX = 100;
const PRICE_DEFAULT = 60;

const S = {
  appName: "GreenLight", tagline: "Watch tee times, get notified",
  navQuery: "Search", navWatch: "Watch Alerts",
  coursesLabel: "Golf Courses", dateRangeLabel: "Date Range", rangeTo: "to",
  periodLabel: "Time Window", playersLabel: "Players", maxPriceLabel: "Max Price",
  emailLabel: "Notify Email", emailPlaceholder: "you@example.com",
  cancel: "Cancel", edit: "Edit", delete: "Delete",
  noWatches: "No watches yet — create one on the left.",
  periods: { all: "All day", am: "Morning", pm: "Afternoon", eve: "Evening" },
  active: "Active", paused: "Paused",
  newTitle: "New Watch", editTitle: "Edit Watch",
  createBtn: "Create Watch", saveBtn: "Save",
  needCourseEmail: "Pick a course and enter your email.",
  saved: "Watch saved.", deleted: "Watch deleted.",
  offline: "Backend offline — changes are kept on this page only.",
  playerUnit: " players",
  countText: (n) => `Watches: ${n}`,
};

// --- State ------------------------------------------------------------------

const state = {
  offline: false,
  courses: FALLBACK_COURSES,
  watches: [],
  formCourses: FALLBACK_COURSES.map((c) => c.id),
  formDateStart: "2026-07-25",
  formDateEnd: "2026-08-01",
  formPeriod: "all",
  formPlayers: 2,
  formMaxPrice: PRICE_DEFAULT,
  formEmail: "",
  editingId: null,
  toast: "",
};

let toastTimer = null;
const app = document.getElementById("app");

// --- Helpers ----------------------------------------------------------------

function esc(str) {
  return String(str ?? "").replace(/[&<>"']/g, (ch) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[ch]));
}

function courseName(id) {
  const c = state.courses.find((x) => x.id === id);
  return c ? c.name : id;
}

// Backend records may not match the design's field names exactly; coerce them
// into the shape the UI expects and fill in sensible defaults.
function normalizeWatch(w) {
  return {
    id: String(w.id ?? "w" + Date.now()),
    courseIds: (w.courseIds ?? w.courses ?? []).map(String),
    dateStart: w.dateStart ?? w.startDate ?? "",
    dateEnd: w.dateEnd ?? w.endDate ?? "",
    period: PERIODS.includes(w.period) ? w.period : "all",
    players: Number(w.players ?? 2),
    maxPrice: Number(w.maxPrice ?? PRICE_DEFAULT),
    email: w.email ?? "",
    active: w.active !== false,
  };
}

function showToast(msg, ms = 2000) {
  state.toast = msg;
  render();
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    state.toast = "";
    render();
  }, ms);
}

function resetForm() {
  state.formCourses = state.courses.map((c) => c.id);
  state.formDateStart = "2026-07-25";
  state.formDateEnd = "2026-08-01";
  state.formPeriod = "all";
  state.formPlayers = 2;
  state.formMaxPrice = PRICE_DEFAULT;
  state.formEmail = "";
  state.editingId = null;
}

// --- Rendering --------------------------------------------------------------

function render() {
  const s = S;

  const courseRows = state.courses
    .map((c) => {
      const on = state.formCourses.includes(c.id);
      return `<div class="wa-course${on ? " is-on" : ""}" data-act="course" data-id="${esc(c.id)}">
        <span class="wa-box"></span>
        <span class="wa-course-name">${esc(c.name)}</span>
      </div>`;
    })
    .join("");

  const periodPills = PERIODS.map(
    (p) =>
      `<button class="wa-pill${state.formPeriod === p ? " is-active" : ""}" data-act="period" data-val="${p}">${esc(s.periods[p])}</button>`
  ).join("");

  const playerPills = [1, 2, 3, 4]
    .map(
      (n) =>
        `<button class="wa-num${state.formPlayers === n ? " is-active" : ""}" data-act="players" data-val="${n}">${n}</button>`
    )
    .join("");

  const cards = state.watches
    .map((w) => {
      const coursesText = w.courseIds.map(courseName).join(", ");
      const chips = [
        `${w.dateStart} ~ ${w.dateEnd}`,
        s.periods[w.period],
        `${w.players}${s.playerUnit}`,
        `≤$${w.maxPrice}`,
      ]
        .map((txt) => `<span class="wa-chip">${esc(txt)}</span>`)
        .join("");
      return `<div class="wa-card">
        <div class="wa-card-top">
          <div class="wa-card-head">
            <strong>${esc(coursesText)}</strong>
            <span class="wa-card-email">${esc(w.email)}</span>
          </div>
          <div class="wa-status${w.active ? " is-on" : ""}" data-act="toggle" data-id="${esc(w.id)}">
            <span class="wa-status-dot"></span>
            <span class="wa-status-text">${esc(w.active ? s.active : s.paused)}</span>
          </div>
        </div>
        <div class="wa-chips">${chips}</div>
        <div class="wa-card-actions">
          <button class="wa-edit" data-act="edit" data-id="${esc(w.id)}">${esc(s.edit)}</button>
          <button class="wa-delete" data-act="delete" data-id="${esc(w.id)}">${esc(s.delete)}</button>
        </div>
      </div>`;
    })
    .join("");

  const listBody = state.watches.length
    ? `<div class="wa-cards">${cards}</div>`
    : `<div class="wa-empty">${esc(s.noWatches)}</div>`;

  app.innerHTML = `
    <div class="wa-header">
      <div class="wa-brand">
        <span class="wa-dot"></span>
        <div class="wa-brand-text">
          <strong>${esc(s.appName)}</strong>
          <small>${esc(s.tagline)}</small>
        </div>
      </div>
      <div class="wa-head-right">
        <div class="wa-nav">
          <a href="index.html">${esc(s.navQuery)}</a>
          <a href="config.html" class="is-active">${esc(s.navWatch)}</a>
        </div>
      </div>
    </div>

    <div class="wa-body">
      <div class="wa-form">
        <div class="wa-form-title">${esc(state.editingId ? s.editTitle : s.newTitle)}</div>

        <div class="wa-field">
          <div class="wa-label">${esc(s.coursesLabel)}</div>
          <div>${courseRows}</div>
        </div>

        <div class="wa-field">
          <div class="wa-label">${esc(s.dateRangeLabel)}</div>
          <div class="wa-daterow">
            <input type="date" class="wa-date" id="wa-date-start" value="${esc(state.formDateStart)}" />
            <span class="wa-to">${esc(s.rangeTo)}</span>
            <input type="date" class="wa-date" id="wa-date-end" value="${esc(state.formDateEnd)}" />
          </div>
        </div>

        <div class="wa-field">
          <div class="wa-label">${esc(s.periodLabel)}</div>
          <div class="wa-pills">${periodPills}</div>
        </div>

        <div class="wa-field">
          <div class="wa-label">${esc(s.playersLabel)}</div>
          <div class="wa-pills">${playerPills}</div>
        </div>

        <div class="wa-field">
          <div class="wa-price-head">
            <span>${esc(s.maxPriceLabel)}</span>
            <span class="wa-price-val" id="wa-price-val">$${state.formMaxPrice}</span>
          </div>
          <input type="range" class="wa-range" id="wa-price" min="${PRICE_MIN}" max="${PRICE_MAX}" step="5" value="${state.formMaxPrice}" />
        </div>

        <div class="wa-field">
          <div class="wa-label">${esc(s.emailLabel)}</div>
          <input type="email" class="wa-email" id="wa-email" placeholder="${esc(s.emailPlaceholder)}" value="${esc(state.formEmail)}" />
        </div>

        <div class="wa-actions">
          <button class="wa-submit" data-act="submit">${esc(state.editingId ? s.saveBtn : s.createBtn)}</button>
          ${state.editingId ? `<button class="wa-cancel" data-act="cancel">${esc(s.cancel)}</button>` : ""}
        </div>
      </div>

      <div class="wa-list">
        <div class="wa-count">${esc(s.countText(state.watches.length))}</div>
        ${listBody}
      </div>
    </div>

    ${state.toast ? `<div class="wa-toast">${esc(state.toast)}</div>` : ""}
  `;

  wireInputs();
}

// Text/date/range inputs commit on change (or live for the slider label) so a
// re-render never clobbers what the user is typing.
function wireInputs() {
  const start = document.getElementById("wa-date-start");
  const end = document.getElementById("wa-date-end");
  const price = document.getElementById("wa-price");
  const priceVal = document.getElementById("wa-price-val");
  const email = document.getElementById("wa-email");

  start.addEventListener("change", (e) => (state.formDateStart = e.target.value));
  end.addEventListener("change", (e) => (state.formDateEnd = e.target.value));
  email.addEventListener("input", (e) => (state.formEmail = e.target.value));
  price.addEventListener("input", (e) => {
    state.formMaxPrice = parseInt(e.target.value, 10);
    priceVal.textContent = "$" + state.formMaxPrice;
  });
}

// --- Actions ----------------------------------------------------------------

function toggleFormCourse(id) {
  state.formCourses = state.formCourses.includes(id)
    ? state.formCourses.filter((x) => x !== id)
    : [...state.formCourses, id];
  render();
}

async function submitForm() {
  const s = S;
  if (!state.formEmail || state.formCourses.length === 0) {
    showToast(s.needCourseEmail, 2200);
    return;
  }
  const entry = normalizeWatch({
    id: state.editingId || "w" + Date.now(),
    courseIds: [...state.formCourses],
    dateStart: state.formDateStart,
    dateEnd: state.formDateEnd,
    period: state.formPeriod,
    players: state.formPlayers,
    maxPrice: state.formMaxPrice,
    email: state.formEmail,
    active: true,
  });

  try {
    const saved = await saveWatchConfig(entry);
    if (saved && saved.id != null) entry.id = String(saved.id);
  } catch {
    state.offline = true; // keep the entry locally
  }

  const exists = state.watches.some((w) => w.id === entry.id);
  state.watches = exists
    ? state.watches.map((w) => (w.id === entry.id ? entry : w))
    : [entry, ...state.watches];
  resetForm();
  showToast(state.offline ? s.offline : s.saved, 2000);
}

function startEdit(id) {
  const w = state.watches.find((x) => x.id === id);
  if (!w) return;
  state.formCourses = [...w.courseIds];
  state.formDateStart = w.dateStart;
  state.formDateEnd = w.dateEnd;
  state.formPeriod = w.period;
  state.formPlayers = w.players;
  state.formMaxPrice = w.maxPrice;
  state.formEmail = w.email;
  state.editingId = w.id;
  render();
}

async function deleteWatch(id) {
  const s = S;
  try {
    await deleteWatchConfig(id);
  } catch {
    state.offline = true;
  }
  state.watches = state.watches.filter((w) => w.id !== id);
  if (state.editingId === id) resetForm();
  showToast(state.offline ? s.offline : s.deleted, 1800);
}

async function toggleActive(id) {
  const w = state.watches.find((x) => x.id === id);
  if (!w) return;
  const updated = { ...w, active: !w.active };
  state.watches = state.watches.map((x) => (x.id === id ? updated : x));
  render();
  try {
    await saveWatchConfig(updated);
  } catch {
    state.offline = true;
  }
}

// --- Event delegation -------------------------------------------------------

app.addEventListener("click", (e) => {
  const el = e.target.closest("[data-act]");
  if (!el) return;
  const { act, id, val } = el.dataset;
  switch (act) {
    case "course":
      toggleFormCourse(id);
      break;
    case "period":
      state.formPeriod = val;
      render();
      break;
    case "players":
      state.formPlayers = parseInt(val, 10);
      render();
      break;
    case "submit":
      submitForm();
      break;
    case "cancel":
      resetForm();
      render();
      break;
    case "toggle":
      toggleActive(id);
      break;
    case "edit":
      startEdit(id);
      break;
    case "delete":
      deleteWatch(id);
      break;
  }
});

// --- Init -------------------------------------------------------------------

async function init() {
  render(); // paint immediately with fallback data

  try {
    const courses = await getCourses();
    if (Array.isArray(courses) && courses.length) {
      state.courses = courses.map((c) => ({ id: String(c.id), name: c.name }));
      state.formCourses = state.courses.map((c) => c.id);
    }
  } catch {
    state.offline = true; // keep FALLBACK_COURSES
  }

  try {
    const watches = await listWatchConfigs();
    state.watches = (watches || []).map(normalizeWatch);
  } catch {
    state.offline = true;
    state.watches = SAMPLE_WATCHES.map(normalizeWatch); // demo data
  }

  render();
}

init();

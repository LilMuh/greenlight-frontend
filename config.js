// Watch Alerts page. Mirrors the imported "Watch Alerts" design, wired to the
// watch-config API in api.js. Data shown (courses, existing watches) is only
// what the backend returns — if it's unreachable the page shows an empty state
// and an offline notice rather than any fabricated data.
//
// One watch = one course. Creating with several courses checked sends a single
// batch request; the backend loops and returns one watch per course, so each
// course becomes its own card. Editing a watch edits that one row (single course).
import {
  getCourses,
  listWatchConfigs,
  getMatches,
  createWatchConfigs,
  updateWatchConfig,
  deleteWatchConfig,
} from "./api.js";

// --- Static reference data --------------------------------------------------

// Price slider bounds (CAD) — Vancouver municipal green fees sit ~$20–100.
const PRICE_MIN = 20;
const PRICE_MAX = 100;
// 默认拉满：不过滤价格，先把所有场次都收进来。
const PRICE_DEFAULT = PRICE_MAX;

// Default watch time window: whole playable day.
const TIME_START_DEFAULT = "06:00";
const TIME_END_DEFAULT = "20:00";

// Default players: a full foursome.
const PLAYERS_DEFAULT = 4;

const STRINGS = {
  appName: "GreenLight", tagline: "Watch tee times, get notified",
  navQuery: "Search", navWatch: "Watch Alerts",
  coursesLabel: "Golf Courses", dateRangeLabel: "Date Range", rangeTo: "to",
  timeRangeLabel: "Time Window", playersLabel: "Players", maxPriceLabel: "Max Price",
  emailLabel: "Notify Email", emailPlaceholder: "you@example.com",
  cancel: "Cancel", edit: "Edit", delete: "Delete",
  noWatches: "No watches yet — create one on the left.",
  active: "Active", paused: "Paused",
  newTitle: "New Watch", editTitle: "Edit Watch",
  createBtn: "Create Watch", saveBtn: "Save",
  needCourseEmail: "Pick a course and enter your email.",
  saved: "Watch saved.", deleted: "Watch deleted.",
  offline: "Backend offline — please try again once it's up.",
  playerUnit: " players",
  countText: (watchCount) => `Watches: ${watchCount}`,
  hitsText: (hitCount) =>
    hitCount > 0 ? `${hitCount} matching now` : "No matches yet",
};

// --- State ------------------------------------------------------------------

const state = {
  offline: false,
  courses: [], // [{ id: number, slug, name }]
  watches: [], // [{ id, courseId, courseName, ... }]
  hitsByWatchId: {}, // { [watchId]: hitCount } —— 来自 /api/matches
  formCourses: [], // selected course ids (numbers)
  formDateStart: todayISO(),
  formDateEnd: todayISO(),
  formTimeStart: TIME_START_DEFAULT,
  formTimeEnd: TIME_END_DEFAULT,
  formPlayers: PLAYERS_DEFAULT,
  formMaxPrice: PRICE_DEFAULT,
  formEmail: "",
  editingId: null,
  toast: "",
};

let toastTimer = null;
const app = document.getElementById("app");

// --- Helpers ----------------------------------------------------------------

// 当天日期（本地时区），YYYY-MM-DD —— 日期范围的默认值。
function todayISO() {
  const today = new Date();
  const year = today.getFullYear();
  const month = String(today.getMonth() + 1).padStart(2, "0");
  const day = String(today.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[character]));
}

function courseName(courseId) {
  const match = state.courses.find((course) => course.id === courseId);
  return match ? match.name : courseId;
}

// Coerce a backend watch record into the shape the UI expects. One watch holds a
// single course (courseId + courseName come straight from the backend).
function normalizeWatch(record) {
  return {
    id: record.id,
    courseId: record.courseId,
    courseName: record.courseName ?? courseName(record.courseId),
    dateStart: record.dateStart ?? "",
    dateEnd: record.dateEnd ?? "",
    timeStart: record.timeStart ?? TIME_START_DEFAULT,
    timeEnd: record.timeEnd ?? TIME_END_DEFAULT,
    players: Number(record.players ?? PLAYERS_DEFAULT),
    maxPrice: Number(record.maxPrice ?? PRICE_DEFAULT),
    email: record.email ?? "",
    active: record.active !== false,
  };
}

// The payload shape the backend's PUT /{id} expects.
function toDto(watch) {
  return {
    id: watch.id,
    courseId: watch.courseId,
    dateStart: watch.dateStart,
    dateEnd: watch.dateEnd,
    timeStart: watch.timeStart,
    timeEnd: watch.timeEnd,
    players: watch.players,
    maxPrice: watch.maxPrice,
    email: watch.email,
    active: watch.active,
  };
}

function showToast(message, durationMs = 2000) {
  state.toast = message;
  render();
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    state.toast = "";
    render();
  }, durationMs);
}

function resetForm() {
  state.formCourses = state.courses.map((course) => course.id);
  state.formDateStart = todayISO();
  state.formDateEnd = todayISO();
  state.formTimeStart = TIME_START_DEFAULT;
  state.formTimeEnd = TIME_END_DEFAULT;
  state.formPlayers = PLAYERS_DEFAULT;
  state.formMaxPrice = PRICE_DEFAULT;
  state.formEmail = "";
  state.editingId = null;
}

// --- Rendering --------------------------------------------------------------

function render() {
  const strings = STRINGS;

  const courseRows = state.courses
    .map((course) => {
      const isSelected = state.formCourses.includes(course.id);
      return `<div class="wa-course${isSelected ? " is-on" : ""}" data-act="course" data-id="${escapeHtml(course.id)}">
        <span class="wa-box"></span>
        <span class="wa-course-name">${escapeHtml(course.name)}</span>
      </div>`;
    })
    .join("");

  const playerPills = [1, 2, 3, 4]
    .map(
      (count) =>
        `<button class="wa-num${state.formPlayers === count ? " is-active" : ""}" data-act="players" data-val="${count}">${count}</button>`
    )
    .join("");

  const cards = state.watches
    .map((watch) => {
      const chips = [
        `${watch.dateStart} ~ ${watch.dateEnd}`,
        `${watch.timeStart}–${watch.timeEnd}`,
        `${watch.players}${strings.playerUnit}`,
        `≤$${watch.maxPrice}`,
      ]
        .map((chipText) => `<span class="wa-chip">${escapeHtml(chipText)}</span>`)
        .join("");
      const hitCount = state.hitsByWatchId[watch.id] ?? 0;
      const hitBadge = `<span class="wa-hits${hitCount > 0 ? " is-hot" : ""}">${escapeHtml(strings.hitsText(hitCount))}</span>`;
      return `<div class="wa-card">
        <div class="wa-card-top">
          <div class="wa-card-head">
            <strong>${escapeHtml(watch.courseName)}</strong>
            <span class="wa-card-email">${escapeHtml(watch.email)}</span>
          </div>
          <div class="wa-status${watch.active ? " is-on" : ""}" data-act="toggle" data-id="${escapeHtml(watch.id)}">
            <span class="wa-status-dot"></span>
            <span class="wa-status-text">${escapeHtml(watch.active ? strings.active : strings.paused)}</span>
          </div>
        </div>
        <div class="wa-card-hits">${hitBadge}</div>
        <div class="wa-chips">${chips}</div>
        <div class="wa-card-actions">
          <button class="wa-edit" data-act="edit" data-id="${escapeHtml(watch.id)}">${escapeHtml(strings.edit)}</button>
          <button class="wa-delete" data-act="delete" data-id="${escapeHtml(watch.id)}">${escapeHtml(strings.delete)}</button>
        </div>
      </div>`;
    })
    .join("");

  const listBody = state.watches.length
    ? `<div class="wa-cards">${cards}</div>`
    : `<div class="wa-empty">${escapeHtml(strings.noWatches)}</div>`;

  app.innerHTML = `
    <div class="wa-header">
      <div class="wa-brand">
        <span class="wa-dot"></span>
        <div class="wa-brand-text">
          <strong>${escapeHtml(strings.appName)}</strong>
          <small>${escapeHtml(strings.tagline)}</small>
        </div>
      </div>
      <div class="wa-head-right">
        <div class="wa-nav">
          <a href="index.html">${escapeHtml(strings.navQuery)}</a>
          <a href="config.html" class="is-active">${escapeHtml(strings.navWatch)}</a>
        </div>
      </div>
    </div>

    <div class="wa-body">
      <div class="wa-form">
        <div class="wa-form-title">${escapeHtml(state.editingId ? strings.editTitle : strings.newTitle)}</div>

        <div class="wa-field">
          <div class="wa-label">${escapeHtml(strings.coursesLabel)}</div>
          <div>${courseRows}</div>
        </div>

        <div class="wa-field">
          <div class="wa-label">${escapeHtml(strings.dateRangeLabel)}</div>
          <div class="wa-daterow">
            <input type="date" class="wa-date" id="wa-date-start" value="${escapeHtml(state.formDateStart)}" />
            <span class="wa-to">${escapeHtml(strings.rangeTo)}</span>
            <input type="date" class="wa-date" id="wa-date-end" value="${escapeHtml(state.formDateEnd)}" />
          </div>
        </div>

        <div class="wa-field">
          <div class="wa-label">${escapeHtml(strings.timeRangeLabel)}</div>
          <div class="wa-daterow">
            <input type="time" class="wa-date" id="wa-time-start" value="${escapeHtml(state.formTimeStart)}" />
            <span class="wa-to">${escapeHtml(strings.rangeTo)}</span>
            <input type="time" class="wa-date" id="wa-time-end" value="${escapeHtml(state.formTimeEnd)}" />
          </div>
        </div>

        <div class="wa-field">
          <div class="wa-label">${escapeHtml(strings.playersLabel)}</div>
          <div class="wa-pills">${playerPills}</div>
        </div>

        <div class="wa-field">
          <div class="wa-price-head">
            <span>${escapeHtml(strings.maxPriceLabel)}</span>
            <span class="wa-price-val" id="wa-price-val">$${state.formMaxPrice}</span>
          </div>
          <input type="range" class="wa-range" id="wa-price" min="${PRICE_MIN}" max="${PRICE_MAX}" step="5" value="${state.formMaxPrice}" />
        </div>

        <div class="wa-field">
          <div class="wa-label">${escapeHtml(strings.emailLabel)}</div>
          <input type="email" class="wa-email" id="wa-email" placeholder="${escapeHtml(strings.emailPlaceholder)}" value="${escapeHtml(state.formEmail)}" />
        </div>

        <div class="wa-actions">
          <button class="wa-submit" data-act="submit">${escapeHtml(state.editingId ? strings.saveBtn : strings.createBtn)}</button>
          ${state.editingId ? `<button class="wa-cancel" data-act="cancel">${escapeHtml(strings.cancel)}</button>` : ""}
        </div>
      </div>

      <div class="wa-list">
        <div class="wa-count">${escapeHtml(strings.countText(state.watches.length))}</div>
        ${listBody}
      </div>
    </div>

    ${state.toast ? `<div class="wa-toast">${escapeHtml(state.toast)}</div>` : ""}
  `;

  wireInputs();
}

// Text/date/time/range inputs commit on change (or live for the slider label) so
// a re-render never clobbers what the user is typing.
function wireInputs() {
  const dateStart = document.getElementById("wa-date-start");
  const dateEnd = document.getElementById("wa-date-end");
  const timeStart = document.getElementById("wa-time-start");
  const timeEnd = document.getElementById("wa-time-end");
  const price = document.getElementById("wa-price");
  const priceValue = document.getElementById("wa-price-val");
  const email = document.getElementById("wa-email");

  dateStart.addEventListener("change", (event) => (state.formDateStart = event.target.value));
  dateEnd.addEventListener("change", (event) => (state.formDateEnd = event.target.value));
  timeStart.addEventListener("change", (event) => (state.formTimeStart = event.target.value));
  timeEnd.addEventListener("change", (event) => (state.formTimeEnd = event.target.value));
  email.addEventListener("input", (event) => (state.formEmail = event.target.value));
  price.addEventListener("input", (event) => {
    state.formMaxPrice = parseInt(event.target.value, 10);
    priceValue.textContent = "$" + state.formMaxPrice;
  });
}

// --- Actions ----------------------------------------------------------------

// Create mode: multi-select (each course becomes its own watch). Edit mode: a
// watch is a single course, so a click replaces the selection (radio-like).
function toggleFormCourse(rawCourseId) {
  const courseId = Number(rawCourseId);
  if (state.editingId != null) {
    state.formCourses = [courseId];
  } else {
    state.formCourses = state.formCourses.includes(courseId)
      ? state.formCourses.filter((selectedId) => selectedId !== courseId)
      : [...state.formCourses, courseId];
  }
  render();
}

async function submitForm() {
  const strings = STRINGS;
  if (!state.formEmail || state.formCourses.length === 0) {
    showToast(strings.needCourseEmail, 2200);
    return;
  }
  const config = {
    dateStart: state.formDateStart,
    dateEnd: state.formDateEnd,
    timeStart: state.formTimeStart,
    timeEnd: state.formTimeEnd,
    players: state.formPlayers,
    maxPrice: state.formMaxPrice,
    email: state.formEmail,
  };

  try {
    if (state.editingId != null) {
      const current = state.watches.find((watch) => watch.id === state.editingId);
      const dto = { id: state.editingId, courseId: state.formCourses[0], active: current ? current.active : true, ...config };
      const saved = await updateWatchConfig(state.editingId, dto);
      state.watches = state.watches.map((watch) => (watch.id === state.editingId ? normalizeWatch(saved) : watch));
    } else {
      const created = await createWatchConfigs({ courseIds: state.formCourses, active: true, ...config });
      state.watches = [...(created || []).map(normalizeWatch), ...state.watches];
    }
    resetForm();
    await loadMatches();
    showToast(strings.saved, 2000);
  } catch {
    state.offline = true;
    showToast(strings.offline, 2200);
  }
  render();
}

function startEdit(watchId) {
  const watch = state.watches.find((candidate) => candidate.id === watchId);
  if (!watch) return;
  state.editingId = watch.id;
  state.formCourses = [watch.courseId];
  state.formDateStart = watch.dateStart;
  state.formDateEnd = watch.dateEnd;
  state.formTimeStart = watch.timeStart;
  state.formTimeEnd = watch.timeEnd;
  state.formPlayers = watch.players;
  state.formMaxPrice = watch.maxPrice;
  state.formEmail = watch.email;
  render();
}

async function deleteWatch(watchId) {
  const strings = STRINGS;
  try {
    await deleteWatchConfig(watchId);
  } catch {
    state.offline = true;
    showToast(strings.offline, 2000);
    return;
  }
  state.watches = state.watches.filter((watch) => watch.id !== watchId);
  if (state.editingId === watchId) resetForm();
  showToast(strings.deleted, 1800);
}

async function toggleActive(watchId) {
  const watch = state.watches.find((candidate) => candidate.id === watchId);
  if (!watch) return;
  const updated = { ...watch, active: !watch.active };
  state.watches = state.watches.map((candidate) => (candidate.id === watchId ? updated : candidate));
  render();
  try {
    await updateWatchConfig(watchId, toDto(updated));
  } catch {
    state.offline = true;
    showToast(STRINGS.offline, 2000);
  }
}

// --- Event delegation -------------------------------------------------------

app.addEventListener("click", (event) => {
  const target = event.target.closest("[data-act]");
  if (!target) return;
  const action = target.dataset.act;
  const id = target.dataset.id;
  const value = target.dataset.val;
  switch (action) {
    case "course":
      toggleFormCourse(id);
      break;
    case "players":
      state.formPlayers = parseInt(value, 10);
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
      toggleActive(Number(id));
      break;
    case "edit":
      startEdit(Number(id));
      break;
    case "delete":
      deleteWatch(Number(id));
      break;
  }
});

// 拉一遍匹配结果，按 watchId 存命中数供卡片展示。只读——失败就当作 0，不打断页面。
async function loadMatches() {
  try {
    const matches = await getMatches();
    const hitsByWatchId = {};
    for (const match of matches || []) {
      hitsByWatchId[match.watchId] = match.hitCount;
    }
    state.hitsByWatchId = hitsByWatchId;
  } catch {
    state.hitsByWatchId = {};
  }
}

// --- Init -------------------------------------------------------------------

async function init() {
  render(); // paint the shell immediately

  try {
    const courses = await getCourses();
    if (Array.isArray(courses) && courses.length) {
      state.courses = courses.map((course) => ({ id: course.id, slug: course.slug, name: course.name }));
      state.formCourses = state.courses.map((course) => course.id);
    }
  } catch {
    state.offline = true; // no courses to show; leave the list empty
  }

  try {
    const watches = await listWatchConfigs();
    state.watches = (watches || []).map(normalizeWatch);
  } catch {
    state.offline = true;
    state.watches = []; // backend down — show nothing, not fake data
  }

  await loadMatches();

  render();
  if (state.offline) showToast(STRINGS.offline, 2600);
}

init();

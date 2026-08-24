// Watch Alerts page. Mirrors the imported "Watch Alerts" design, wired to the
// watch-config API in api.js. Data shown (courses, existing watches) is only
// what the backend returns — if it's unreachable the page shows an empty state
// and an offline notice rather than any fabricated data.
//
// One watch = one course. Creating with several courses checked sends a single
// batch request; the backend loops and returns one watch per course, so each
// course becomes its own card. Editing a watch edits that one row (single course).
import {
  ApiError,
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

// Minute choices for the time picker. A watch window is a coarse filter, so the
// hour and the half hour are all it needs.
const MINUTE_CHOICES = [0, 30];

// Default players: a full foursome.
const PLAYERS_DEFAULT = 4;

// A watch is pinned to weekdays, not dates: "every Saturday morning" stays true
// next month, a date range doesn't. The backend turns each weekday back into
// concrete dates inside its 8-day scrape window. Codes match what it stores.
const WEEKDAYS = [
  { code: "MON", label: "Mon" },
  { code: "TUE", label: "Tue" },
  { code: "WED", label: "Wed" },
  { code: "THU", label: "Thu" },
  { code: "FRI", label: "Fri" },
  { code: "SAT", label: "Sat" },
  { code: "SUN", label: "Sun" },
];

const STRINGS = {
  appName: "GreenLight", tagline: "Watch tee times, get notified",
  navQuery: "Search", navWatch: "Watch Alerts",
  coursesLabel: "Golf Courses", weekdaysLabel: "Weekdays", rangeTo: "to",
  timeRangeLabel: "Time Window", playersLabel: "Players", maxPriceLabel: "Max Price",
  emailLabel: "Notify Email", emailPlaceholder: "you@example.com",
  cancel: "Cancel", edit: "Edit", delete: "Delete",
  noWatches: "No watches yet — create one on the left.",
  active: "Active", paused: "Paused",
  newTitle: "New Watch", editTitle: "Edit Watch",
  createBtn: "Create Watch", saveBtn: "Save",
  needCourseEmail: "Pick a course and enter your email.",
  needWeekday: "Pick at least one weekday.",
  needTimeOrder: "End time must be later than start time.",
  saved: "Watch saved.", deleted: "Watch deleted.",
  offline: "Backend offline — please try again once it's up.",
  // 后端好好的、只是这次请求不合法时的兜底。和 offline 分开：那句会让人跑去看服务
  genericError: "That didn't go through — please try again.",
  courseLocked: "A watch's course can't be changed — create a new one instead.",
  playerUnit: " players",
  everyDay: "Every day",
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
  formWeekdays: [], // selected weekday codes, e.g. ["SAT","SUN"]
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

// 后端按 ISO 序（周一在前）存和返回，前端跟着排：卡片上的顺序和邮件里的一致。
function sortWeekdays(codes) {
  const order = WEEKDAYS.map((weekday) => weekday.code);
  return [...codes].sort((left, right) => order.indexOf(left) - order.indexOf(right));
}

// ["SAT","SUN"] → "Sat, Sun"；七天全勾说明没做筛选，直接写 "Every day"。
function weekdaysText(codes) {
  if (!codes.length) return "";
  if (codes.length === WEEKDAYS.length) return STRINGS.everyDay;
  return sortWeekdays(codes)
    .map((code) => WEEKDAYS.find((weekday) => weekday.code === code)?.label ?? code)
    .join(", ");
}

// 时间在 state、界面和线上格式里都是 24 小时制的 "HH:MM"，和后端存的、
// tee_time.time_local 用的是同一套，直接可比。
//
// 刻意不用 <input type="time">：那个控件在 12 小时制的设备上把 AM/PM 做成滚轮里的
// 一列（iPhone）或键盘录入时可以不动的一段（桌面）。拨了时和分却漏掉 meridiem，
// 下午 4:45 就存成了 04:45，窗口倒挂，这条 watch 从此一条都不命中。选 24 小时制的
// 小时就没有 meridiem 这个东西可漏了。
function parseClock(value) {
  const match = /^(\d{1,2}):(\d{2})$/.exec(String(value ?? "").trim());
  if (!match) return { hour: 0, minute: 0 };
  return { hour: Math.min(23, Number(match[1])), minute: Math.min(59, Number(match[2])) };
}

function formatClock(hour, minute) {
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

// 库里存着不在档位上的分钟（早先用原生控件存的，例如 16:45 / 16:57）。把当前值
// 补进选项里，编辑一条老 watch 才不会顺手把分钟改掉。
function minuteOptions(current) {
  if (MINUTE_CHOICES.includes(current)) return MINUTE_CHOICES;
  return [...MINUTE_CHOICES, current].sort((left, right) => left - right);
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
    weekdays: Array.isArray(record.weekdays) ? record.weekdays : [],
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
    weekdays: watch.weekdays,
    timeStart: watch.timeStart,
    timeEnd: watch.timeEnd,
    players: watch.players,
    maxPrice: watch.maxPrice,
    email: watch.email,
    active: watch.active,
  };
}

// --- Error reporting --------------------------------------------------------
//
// 后端出错时回的是 {"code","message"}（code 取值见 greenlight-backend 的 ApiErrorCode）。
// 这里只认 code，不显示后端那句 message —— 那是英文调试串，界面文案该跟着界面走。
//
// 认不出的 code 一律落到 genericError：后端加了新 code 而这份静态页还是旧的，
// 页面会说得笼统一点，但不会崩、也不会谎称后端离线。
const ERROR_MESSAGES = {
  // 业务规则：人能自己改好的，就说清楚该怎么改
  WATCH_DUPLICATE: "You already have an alert for that course — edit that one instead.",
  WATCH_COURSE_IMMUTABLE: "A watch's course can't be changed — create a new one instead.",
  WATCH_WEEKDAYS_REQUIRED: "Pick at least one weekday.",
  WATCH_NOT_FOUND: "That alert is gone — reload the page.",
  COURSE_NOT_FOUND: "That course is gone — reload the page.",
  MAIL_SEND_FAILED: "The email couldn't be sent — check the mail settings.",
  // 请求本身不合法。人改不了这些，但话得说得不一样：让人知道该找谁
  UNAUTHORIZED: "This page isn't authorized to talk to the backend.",
  MALFORMED_JSON_BODY: "The page sent something the backend couldn't read — reload and try again.",
  MISSING_PARAMETER: "The page sent an incomplete request — reload and try again.",
  INVALID_PARAMETER: "The page sent an unusable value — reload and try again.",
  METHOD_NOT_ALLOWED: "The page called the backend the wrong way — reload and try again.",
  ENDPOINT_NOT_FOUND: "This page is talking to a backend that doesn't have that feature.",
  // 后端自己出 bug 了。明确说不是你的问题，免得人回去反复改表单
  INTERNAL_ERROR: "Something broke on the server — not your fault. Try again in a moment.",
};

/**
 * 把一次失败翻译成给人看的一句话，并决定要不要把页面标成离线。
 *
 * 分三档，因为对人的意思完全不同：
 *   - 根本没连上（fetch 抛 TypeError）→ 后端离线，去看服务；
 *   - 连上了、后端拒了这次请求（4xx 带 code）→ 是这次填的东西有问题，改了再来；
 *   - 连上了、后端自己炸了（5xx）→ 不是用户的错，也不是离线，笼统说一句。
 * 改这个之前所有失败都走「后端离线」，填错一个字也会被告知去检查服务器。
 */
function reportError(error) {
  if (!(error instanceof ApiError)) {
    state.offline = true;
    showToast(STRINGS.offline, 2200);
    return;
  }
  showToast(ERROR_MESSAGES[error.code] ?? STRINGS.genericError, 2600);
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
  // 星期不给默认值：勾哪几天是这条 watch 最要紧的决定，替人预设只会被将错就错地提交
  state.formWeekdays = [];
  state.formTimeStart = TIME_START_DEFAULT;
  state.formTimeEnd = TIME_END_DEFAULT;
  state.formPlayers = PLAYERS_DEFAULT;
  state.formMaxPrice = PRICE_DEFAULT;
  state.formEmail = "";
  state.editingId = null;
}

// --- Rendering --------------------------------------------------------------

// 一段时间的选择器：24 小时制的时 + 分两个下拉。
// which 是 "start" / "end"，用来在 id 上做区分。
function timePicker(which, value24) {
  const { hour, minute } = parseClock(value24);

  const hourOptions = Array.from({ length: 24 }, (unused, index) => index)
    .map(
      (option) =>
        `<option value="${option}"${option === hour ? " selected" : ""}>${String(option).padStart(2, "0")}</option>`
    )
    .join("");

  const minutePicks = minuteOptions(minute)
    .map(
      (option) =>
        `<option value="${option}"${option === minute ? " selected" : ""}>${String(option).padStart(2, "0")}</option>`
    )
    .join("");

  return `<div class="wa-timepick">
    <select class="wa-time-sel" id="wa-hour-${which}">${hourOptions}</select>
    <span class="wa-colon">:</span>
    <select class="wa-time-sel" id="wa-minute-${which}">${minutePicks}</select>
  </div>`;
}

function render() {
  const strings = STRINGS;

  // 编辑态球场是锁死的（见 toggleFormCourse），整块置灰，选中的那个照常高亮
  const coursesLocked = state.editingId != null;
  const courseRows = state.courses
    .map((course) => {
      const isSelected = state.formCourses.includes(course.id);
      return `<div class="wa-course${isSelected ? " is-on" : ""}${coursesLocked ? " is-locked" : ""}" data-act="course" data-id="${escapeHtml(course.id)}">
        <span class="wa-box"></span>
        <span class="wa-course-name">${escapeHtml(course.name)}</span>
      </div>`;
    })
    .join("");

  const weekdayPills = WEEKDAYS.map((weekday) => {
    const isOn = state.formWeekdays.includes(weekday.code);
    return `<button class="wa-day${isOn ? " is-active" : ""}" data-act="weekday" data-val="${weekday.code}">${escapeHtml(weekday.label)}</button>`;
  }).join("");

  const playerPills = [1, 2, 3, 4]
    .map(
      (count) =>
        `<button class="wa-num${state.formPlayers === count ? " is-active" : ""}" data-act="players" data-val="${count}">${count}</button>`
    )
    .join("");

  const cards = state.watches
    .map((watch) => {
      const chips = [
        weekdaysText(watch.weekdays),
        `${watch.timeStart}–${watch.timeEnd}`,
        `${watch.players}${strings.playerUnit}`,
        `≤$${watch.maxPrice}`,
      ]
        .filter(Boolean)
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
          ${coursesLocked ? `<div class="wa-hint">${escapeHtml(strings.courseLocked)}</div>` : ""}
        </div>

        <div class="wa-field">
          <div class="wa-label">${escapeHtml(strings.weekdaysLabel)}</div>
          <div class="wa-days">${weekdayPills}</div>
        </div>

        <div class="wa-field">
          <div class="wa-label">${escapeHtml(strings.timeRangeLabel)}</div>
          <div class="wa-timerow">
            ${timePicker("start", state.formTimeStart)}
            <span class="wa-to">${escapeHtml(strings.rangeTo)}</span>
            ${timePicker("end", state.formTimeEnd)}
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
  const price = document.getElementById("wa-price");
  const priceValue = document.getElementById("wa-price-val");
  const email = document.getElementById("wa-email");

  wireTimeSelects("start");
  wireTimeSelects("end");
  email.addEventListener("input", (event) => (state.formEmail = event.target.value));
  price.addEventListener("input", (event) => {
    state.formMaxPrice = parseInt(event.target.value, 10);
    priceValue.textContent = "$" + state.formMaxPrice;
  });
}

// 时/分下拉改动后只写回 state，不重绘：重绘会把手机上刚拉开的原生下拉关掉。
function wireTimeSelects(which) {
  const hour = document.getElementById(`wa-hour-${which}`);
  const minute = document.getElementById(`wa-minute-${which}`);
  const commit = () => writeFormTime(which, formatClock(Number(hour.value), Number(minute.value)));
  hour.addEventListener("change", commit);
  minute.addEventListener("change", commit);
}

// --- Actions ----------------------------------------------------------------

// Create mode: multi-select (each course becomes its own watch).
//
// 编辑态不给改球场：(邮箱, 球场) 是一条 watch 的身份，换球场等于换成另一条，
// 而那条可能已经存在。后端会以 WATCH_COURSE_IMMUTABLE 拒掉，这里不等它拒——
// 让人填完整个表单再被驳回是最差的顺序，直接点不动并说明原因。
function toggleFormCourse(rawCourseId) {
  if (state.editingId != null) {
    showToast(STRINGS.courseLocked, 2600);
    return;
  }
  const courseId = Number(rawCourseId);
  state.formCourses = state.formCourses.includes(courseId)
    ? state.formCourses.filter((selectedId) => selectedId !== courseId)
    : [...state.formCourses, courseId];
  render();
}

function readFormTime(which) {
  return which === "start" ? state.formTimeStart : state.formTimeEnd;
}

function writeFormTime(which, value) {
  if (which === "start") state.formTimeStart = value;
  else state.formTimeEnd = value;
}

// 星期是多选：勾中的再点一次取消。一天都不勾的 watch 后端会拒，提交前先拦下来。
function toggleFormWeekday(code) {
  state.formWeekdays = state.formWeekdays.includes(code)
    ? state.formWeekdays.filter((selected) => selected !== code)
    : [...state.formWeekdays, code];
  render();
}

async function submitForm() {
  const strings = STRINGS;
  if (!state.formEmail || state.formCourses.length === 0) {
    showToast(strings.needCourseEmail, 2200);
    return;
  }
  if (state.formWeekdays.length === 0) {
    showToast(strings.needWeekday, 2200);
    return;
  }
  // 两个值都是零填充的 "HH:MM"，字符串比较就是时间先后，和后端 BETWEEN 的口径一致。
  // 结束不晚于开始的窗口在 SQL 里恒为空集，会静悄悄地一条都不命中——挡在这里。
  if (state.formTimeEnd <= state.formTimeStart) {
    showToast(strings.needTimeOrder, 2400);
    return;
  }
  const config = {
    weekdays: sortWeekdays(state.formWeekdays),
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
  } catch (error) {
    reportError(error);
  }
  render();
}

function startEdit(watchId) {
  const watch = state.watches.find((candidate) => candidate.id === watchId);
  if (!watch) return;
  state.editingId = watch.id;
  state.formCourses = [watch.courseId];
  state.formWeekdays = [...watch.weekdays];
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
  } catch (error) {
    reportError(error);
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
  } catch (error) {
    // 乐观更新已经画到界面上了，失败就滚回去，别让开关停在一个库里没有的状态
    state.watches = state.watches.map((candidate) => (candidate.id === watchId ? watch : candidate));
    reportError(error);
    render();
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
    case "weekday":
      toggleFormWeekday(value);
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

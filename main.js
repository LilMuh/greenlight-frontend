import { getHealth, getCourses, getTeeTimes } from "./api.js";

const statusEl = document.getElementById("status");
const resultsEl = document.getElementById("results");
const formEl = document.getElementById("filters");
const dateEl = document.getElementById("date");
const courseEl = document.getElementById("course");

const today = () => new Date().toISOString().slice(0, 10);

// Fill the course dropdown from the backend. If it can't be reached we just
// keep "All courses" — the date search still works.
async function loadCourses() {
  try {
    const courses = await getCourses();
    for (const c of courses) {
      const option = document.createElement("option");
      option.value = c.id;
      option.textContent = c.name;
      courseEl.append(option);
    }
  } catch {
    // 拿不到球场清单就只留 All courses
  }
}

// Load tee times for the picked date (+ optional course) and render them.
async function loadTeeTimes() {
  const params = { date: dateEl.value };
  if (courseEl.value) params.course = courseEl.value;

  statusEl.textContent = "Loading…";
  try {
    const list = await getTeeTimes(params);
    statusEl.textContent = list.length
      ? `${list.length} tee time(s) on ${dateEl.value}.`
      : `No tee times on ${dateEl.value}.`;
    resultsEl.innerHTML = list
      .map((t) => `<li><strong>${t.time}</strong> — ${t.course} · ${t.holes} holes · $${t.price}</li>`)
      .join("");
  } catch (err) {
    statusEl.textContent = `Failed to load tee times: ${err.message}`;
    resultsEl.innerHTML = "";
  }
}

async function init() {
  try {
    await getHealth();
  } catch (err) {
    statusEl.textContent = `Backend not reachable at the configured API_BASE — ${err.message}`;
    return;
  }

  dateEl.value = today();
  await loadCourses();
  await loadTeeTimes();

  formEl.addEventListener("submit", (e) => {
    e.preventDefault();
    loadTeeTimes();
  });
}

init();

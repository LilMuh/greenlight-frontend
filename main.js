import { getHealth, getTeeTimes } from "./api.js";

const statusEl = document.getElementById("status");
const resultsEl = document.getElementById("results");

// Minimal skeleton: confirm the backend is reachable and list whatever tee times
// it has stored. Rendering/filters get fleshed out later.
async function init() {
  try {
    await getHealth();
  } catch (err) {
    statusEl.textContent = `Backend not reachable at the configured API_BASE — ${err.message}`;
    return;
  }

  try {
    const data = await getTeeTimes();
    const list = Array.isArray(data) ? data : (data.teeTimes ?? []);
    statusEl.textContent = list.length ? `${list.length} tee time(s).` : "No tee times stored yet.";
    resultsEl.innerHTML = list
      .map((t) => `<li>${t.date} ${t.time} — ${t.course} ($${t.price})</li>`)
      .join("");
  } catch (err) {
    statusEl.textContent = `Failed to load tee times: ${err.message}`;
  }
}

init();

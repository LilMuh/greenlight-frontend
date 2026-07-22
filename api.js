// Every backend call lives here. Point API_BASE at your greenlight-backend.
// Keeping all fetch calls behind named functions means a future framework move
// only rewrites rendering, not this module.
const API_BASE = "http://localhost:8080";

async function req(path, options) {
  const res = await fetch(API_BASE + path, options);
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  return res.status === 204 ? null : res.json();
}

const jsonBody = (body) => ({
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify(body),
});

export const getHealth = () => req("/api/health");
export const getCourses = () => req("/api/courses");
export const getTeeTimes = (params = {}) => {
  const q = new URLSearchParams(params).toString();
  return req("/api/tee-times" + (q ? `?${q}` : ""));
};
export const listWatchConfigs = () => req("/api/watch-configs");
export const saveWatchConfig = (cfg) => req("/api/watch-configs", jsonBody(cfg));
export const deleteWatchConfig = (id) => req(`/api/watch-configs/${id}`, { method: "DELETE" });

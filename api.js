// Every backend call lives here. Point API_BASE at your greenlight-backend.
// Keeping all fetch calls behind named functions means a future framework move
// only rewrites rendering, not this module.
const API_BASE = "http://localhost:8080";

async function request(path, options) {
  const response = await fetch(API_BASE + path, options);
  if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
  return response.status === 204 ? null : response.json();
}

const jsonBody = (body) => ({
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify(body),
});

export const getHealth = () => request("/api/health");
export const getCourses = () => request("/api/courses");
export const getTeeTimes = (params = {}) => {
  const queryString = new URLSearchParams(params).toString();
  return request("/api/tee-times" + (queryString ? `?${queryString}` : ""));
};
export const listWatchConfigs = () => request("/api/watch-configs");
// 批量创建：一组 courseIds + 共享 config，后端逐个球场建一条 watch，返回创建的数组。
export const createWatchConfigs = (batch) => request("/api/watch-configs", jsonBody(batch));
// 更新单条：PUT /{id}，返回更新后的记录。
export const updateWatchConfig = (id, config) =>
  request(`/api/watch-configs/${id}`, { ...jsonBody(config), method: "PUT" });
export const deleteWatchConfig = (id) => request(`/api/watch-configs/${id}`, { method: "DELETE" });

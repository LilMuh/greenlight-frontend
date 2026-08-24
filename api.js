// Every backend call lives here. Point API_BASE at your greenlight-backend.
// Keeping all fetch calls behind named functions means a future framework move
// only rewrites rendering, not this module.
// 部署时由 .github/workflows/deploy.yml 用仓库变量 API_BASE 替换掉。
const API_BASE = "__API_BASE__";

// /api/** 的共享密钥，后端 ApiKeyFilter 校验。同样在部署时替换（来自仓库 secret）。
//
// 这不是真正的凭据：本仓库是公开的、页面是静态的，密钥随构建产物一起发出去，
// 打开开发者工具就能看到。它挡的是扫到域名随手试的人和自动扫描器——后端跑在
// Tailscale Funnel 上，没有账号体系，写接口不能完全裸着。
//
// 占位符没被替换掉（本地直接开文件）时留空，后端那边留空密钥＝关卡关闭，正好对上。
const API_KEY_SLOT = "__API_KEY__";
const API_KEY = API_KEY_SLOT.startsWith("__") ? "" : API_KEY_SLOT;

/**
 * 后端回的一次业务失败。区别于网络层失败（fetch 自己抛的 TypeError）——
 * 那个说明后端不可达，这个说明后端好好的、是这次请求本身不合法。
 *
 * code 是后端 ApiErrorCode 的名字（如 "WATCH_DUPLICATE"），页面按它挑文案；
 * 后端的 message 是英文调试串，不进界面。拿不到 body（502、纯文本错误页）时 code 为 null。
 */
export class ApiError extends Error {
  constructor(status, code, message) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
  }
}

async function request(path, options = {}) {
  const headers = { ...options.headers };
  if (API_KEY) headers["X-Greenlight-Key"] = API_KEY;
  const response = await fetch(API_BASE + path, { ...options, headers });
  if (!response.ok) {
    // 错误体是 {"code","message"}，但网关和未处理异常给的是 HTML，所以解析失败要吞掉
    const body = await response.json().catch(() => null);
    throw new ApiError(
      response.status,
      body?.code ?? null,
      body?.message ?? `${response.status} ${response.statusText}`,
    );
  }
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
// 匹配结果：每条启用中的 watch 当前命中的空位（只读展示，后端不发通知）。
export const getMatches = () => request("/api/matches");
export const listWatchConfigs = () => request("/api/watch-configs");
// 批量创建：一组 courseIds + 共享 config，后端逐个球场建一条 watch，返回创建的数组。
export const createWatchConfigs = (batch) => request("/api/watch-configs", jsonBody(batch));
// 更新单条：PUT /{id}，返回更新后的记录。
export const updateWatchConfig = (id, config) =>
  request(`/api/watch-configs/${id}`, { ...jsonBody(config), method: "PUT" });
export const deleteWatchConfig = (id) => request(`/api/watch-configs/${id}`, { method: "DELETE" });

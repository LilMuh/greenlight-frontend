// Every backend call lives here. Point VITE_API_BASE at your greenlight-backend.
// Keeping all fetch calls behind named functions means UI code never touches fetch.
// 部署时由 .github/workflows/deploy.yml 在构建期注入（仓库变量 API_BASE / secret API_KEY），
// Vite 会把 VITE_* 内联进产物。本地开发不设环境变量时退回 localhost:8080。
const API_BASE: string = import.meta.env.VITE_API_BASE ?? "http://localhost:8080";

// /api/** 的共享密钥，后端 ApiKeyFilter 校验。
//
// 这不是真正的凭据：本仓库是公开的、页面是静态的，密钥随构建产物一起发出去，
// 打开开发者工具就能看到。它挡的是扫到域名随手试的人和自动扫描器——后端跑在
// Tailscale Funnel 上，没有账号体系，写接口不能完全裸着。
//
// 本地不设 VITE_API_KEY 时留空，后端那边留空密钥＝关卡关闭，正好对上。
const API_KEY: string = import.meta.env.VITE_API_KEY ?? "";

// --- 后端 DTO（以旧代码实际读写的字段为准） -----------------------------------

/** GET /api/courses 的一项。address/rating/ratingCount 来自 Google Maps 抓取，可能为 null。 */
export interface CourseDto {
  id: number; // watch-config 引用的数字 id
  slug: string; // tee-time 页当标识用；tee-time 的 courseId 也是 slug
  name: string;
  imageUrl: string | null;
  source: string | null; // "cps" | "tei" | 未来新来源
  site: string | null; // 拼预订链接用的子域
  address: string | null;
  rating: number | null;
  ratingCount: number | null;
  maintenance: boolean | null;
}

/** GET /api/tee-times 的一项（扁平列表，前端再按球场分组）。 */
export interface TeeTimeDto {
  courseId: string | null; // slug
  course: string | null; // 球场名，courseId 缺失时的后备
  time: string; // "HH:MM"
  price: number | string;
  availableSeats: number | string | null;
}

/** watch-config 记录（GET 列表项、PUT 的请求/响应体）。 */
export interface WatchConfigDto {
  id: number;
  courseId: number;
  courseName?: string | null;
  weekdays: string[]; // ["MON", ...]
  timeStart: string; // "HH:MM"
  timeEnd: string;
  players: number;
  maxPrice: number;
  email: string;
  active: boolean;
}

/** POST /api/watch-configs：一组球场 + 共享配置，后端逐球场建一条 watch。 */
export interface CreateWatchBatchDto {
  courseIds: number[];
  weekdays: string[];
  timeStart: string;
  timeEnd: string;
  players: number;
  maxPrice: number;
  email: string;
  active: boolean;
}

/** GET /api/matches 的一项：每条启用中的 watch 当前命中的空位数。 */
export interface MatchDto {
  watchId: number;
  hitCount: number;
}

/**
 * 后端回的一次业务失败。区别于网络层失败（fetch 自己抛的 TypeError）——
 * 那个说明后端不可达，这个说明后端好好的、是这次请求本身不合法。
 *
 * code 是后端 ApiErrorCode 的名字（如 "WATCH_DUPLICATE"），页面按它挑文案；
 * 后端的 message 是英文调试串，不进界面。拿不到 body（502、纯文本错误页）时 code 为 null。
 */
export class ApiError extends Error {
  readonly status: number;
  readonly code: string | null;

  constructor(status: number, code: string | null, message: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
  }
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const headers: Record<string, string> = { ...(options.headers as Record<string, string>) };
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
  return response.status === 204 ? (null as T) : response.json();
}

const jsonBody = (body: unknown) => ({
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify(body),
});

export const getHealth = () => request<unknown>("/api/health");
export const getCourses = () => request<CourseDto[]>("/api/courses");
export const getTeeTimes = (params: Record<string, string> = {}) => {
  const queryString = new URLSearchParams(params).toString();
  return request<TeeTimeDto[]>("/api/tee-times" + (queryString ? `?${queryString}` : ""));
};
// 匹配结果：每条启用中的 watch 当前命中的空位（只读展示，后端不发通知）。
export const getMatches = () => request<MatchDto[]>("/api/matches");
export const listWatchConfigs = () => request<WatchConfigDto[]>("/api/watch-configs");
// 批量创建：一组 courseIds + 共享 config，后端逐个球场建一条 watch，返回创建的数组。
export const createWatchConfigs = (batch: CreateWatchBatchDto) =>
  request<WatchConfigDto[]>("/api/watch-configs", jsonBody(batch));
// 更新单条：PUT /{id}，返回更新后的记录。
export const updateWatchConfig = (id: number, config: WatchConfigDto) =>
  request<WatchConfigDto>(`/api/watch-configs/${id}`, { ...jsonBody(config), method: "PUT" });
export const deleteWatchConfig = (id: number) =>
  request<null>(`/api/watch-configs/${id}`, { method: "DELETE" });

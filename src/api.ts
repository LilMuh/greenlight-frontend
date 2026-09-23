// 所有后端调用都集中在这个文件，UI 代码不直接碰 fetch。
// VITE_API_BASE 部署时由 deploy.yml 在构建期注入；本地不设就退回 localhost:8080。
import { clearToken, getToken } from "./auth";

const API_BASE: string = import.meta.env.VITE_API_BASE ?? "http://localhost:8080";

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
  // 后端契约保证非空：tee_time.course_id NOT NULL（外键），course.slug NOT NULL UNIQUE，
  // DTO 直接取 course.getSlug()/getName()，序列化不省略字段
  courseId: string; // 球场 slug
  course: string; // 球场展示名
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
  active: boolean;
}

/** GET /api/me：当前账号。提醒发到 notifyEmail，它可以和登录邮箱不同。 */
export interface UserDto {
  id: number;
  loginEmail: string;
  displayName: string | null;
  notifyEmail: string;
  notificationsEnabled: boolean; // false = 在邮件里点了退订
  admin: boolean;
  googleLinked: boolean;
}

/** 两种登录方式成功后都回这个。token 只在这一次响应里出现。 */
export interface LoginResultDto {
  token: string;
  user: UserDto;
}

/** GET /api/matches 的一项：每条启用中的 watch 当前命中的空位数。 */
export interface MatchDto {
  watchId: number;
  hitCount: number;
}

/**
 * 后端回的业务失败（网络层失败是 fetch 自己抛的 TypeError，那说明后端不可达）。
 * code 是后端 ApiErrorCode 的名字，页面按它挑文案；拿不到错误体时 code 为 null。
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

// 所有请求的共同通道：拼上后端地址、带上会话令牌，非 2xx 解析错误体并抛 ApiError。
async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const headers: Record<string, string> = { ...(options.headers as Record<string, string>) };
  const token = getToken();
  if (token) headers["Authorization"] = `Bearer ${token}`;
  const response = await fetch(API_BASE + path, { ...options, headers });
  if (!response.ok) {
    // 错误体是 {"code","message"}，但网关和未处理异常给的是 HTML，所以解析失败要吞掉
    const body = await response.json().catch(() => null);
    // 会话过期或被撤销：丢掉本地令牌，页面据此回到登录态
    if (body?.code === "UNAUTHORIZED") clearToken();
    throw new ApiError(
      response.status,
      body?.code ?? null,
      body?.message ?? `${response.status} ${response.statusText}`,
    );
  }
  return response.status === 204 ? (null as T) : response.json();
}

// 把对象序列化成 JSON 请求体（默认 POST，调用方可覆盖 method）
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

// --- 登录与账号 -----------------------------------------------------------------
export const loginWithGoogle = (idToken: string) =>
  request<LoginResultDto>("/api/auth/google", jsonBody({ idToken }));
// 不管邮箱有没有注册都回 204
export const startEmailLogin = (email: string) =>
  request<null>("/api/auth/email/start", jsonBody({ email }));
export const verifyEmailLogin = (email: string, code: string) =>
  request<LoginResultDto>("/api/auth/email/verify", jsonBody({ email, code }));
export const logout = () => request<null>("/api/auth/logout", { method: "POST" });
export const getMe = () => request<UserDto>("/api/me");
export const setNotificationsEnabled = (notificationsEnabled: boolean) =>
  request<UserDto>("/api/me", { ...jsonBody({ notificationsEnabled }), method: "PATCH" });
// 换通知邮箱：先给新地址发码，填对了才换
export const startNotifyEmailChange = (email: string) =>
  request<null>("/api/me/notify-email/start", jsonBody({ email }));
export const verifyNotifyEmailChange = (code: string) =>
  request<UserDto>("/api/me/notify-email/verify", jsonBody({ code }));

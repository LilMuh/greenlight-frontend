// 所有后端调用都集中在这个文件。UI 代码不直接调用 fetch。
// 部署时，deploy.yml 在构建期注入 VITE_API_BASE。本地不设置时，默认用 localhost:8080。
import { clearToken, getToken } from "./auth";

const API_BASE: string = import.meta.env.VITE_API_BASE ?? "http://localhost:8080";

// --- 后端 DTO（以旧代码实际读写的字段为准） -----------------------------------

/** GET /api/courses 的一项。address/rating/ratingCount 来自 Google Maps 抓取，可能为 null。 */
export interface CourseDto {
  id: number; // watch-config 引用的数字 id
  slug: string; // tee-time 页用它做标识。tee-time 的 courseId 也是 slug
  name: string;
  imageUrl: string | null;
  source: string | null; // "cps" | "tei" | 未来新来源
  site: string | null; // 用于拼接预订链接的子域
  address: string | null;
  rating: number | null;
  ratingCount: number | null;
  maintenance: boolean | null;
}

/** GET /api/tee-times 的一项（扁平列表，前端再按球场分组）。 */
export interface TeeTimeDto {
  // 后端契约保证下面两个字段非空。原因：
  // - tee_time.course_id 是 NOT NULL 外键。
  // - course.slug 是 NOT NULL UNIQUE。
  // - DTO 直接取 course.getSlug()/getName()，序列化时不省略字段。
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
  // 这条 watch 的主人。只读，PUT 时不用带。
  // 管理员能看到所有人的 watch，页面按它分组。
  ownerId?: number;
  ownerEmail?: string | null;
}

/** POST /api/watch-configs 的请求体：一组球场和一份共享配置。后端为每个球场建一条 watch。 */
export interface CreateWatchBatchDto {
  courseIds: number[];
  weekdays: string[];
  timeStart: string;
  timeEnd: string;
  players: number;
  maxPrice: number;
  active: boolean;
}

/** GET /api/me：当前账号。提醒发到 notifyEmail。它可以和登录邮箱不同。 */
export interface UserDto {
  id: number;
  loginEmail: string;
  displayName: string | null;
  notifyEmail: string | null; // 管理员账号设置前为空
  notificationsEnabled: boolean; // false 表示用户在邮件里点了退订
  admin: boolean;
  googleLinked: boolean;
}

/** 两种登录方式成功后都返回这个结构。token 只在这一次响应里出现。 */
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
 * 后端返回的业务失败。
 * 网络层失败不走这里：fetch 自己抛 TypeError，表示后端不可达。
 * code 是后端 ApiErrorCode 的名字，页面按它选文案。拿不到错误体时，code 为 null。
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

// 所有请求都经过这个函数：
// - 拼接后端地址。
// - 带上会话令牌。
// - 非 2xx 时解析错误体，并抛 ApiError。
async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const headers: Record<string, string> = { ...(options.headers as Record<string, string>) };
  const token = getToken();
  if (token) headers["Authorization"] = `Bearer ${token}`;
  const response = await fetch(API_BASE + path, { ...options, headers });
  if (!response.ok) {
    // 错误体通常是 {"code","message"}。但网关和未处理异常返回的是 HTML。
    // 因此解析失败时忽略异常，body 记为 null。
    const body = await response.json().catch(() => null);
    // 会话过期或被撤销时，删除本地令牌。页面据此回到登录界面。
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
// 匹配结果：每条启用中的 watch 当前命中的空位。只用于展示，后端不会因此发通知。
export const getMatches = () => request<MatchDto[]>("/api/matches");
export const listWatchConfigs = () => request<WatchConfigDto[]>("/api/watch-configs");
// 批量创建：传一组 courseIds 和一份共享配置。后端为每个球场建一条 watch，并返回新建的数组。
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
// 无论邮箱是否已注册，后端都返回 204
export const startEmailLogin = (email: string) =>
  request<null>("/api/auth/email/start", jsonBody({ email }));
export const verifyEmailLogin = (email: string, code: string) =>
  request<LoginResultDto>("/api/auth/email/verify", jsonBody({ email, code }));
// 管理员专用：用户名和密码登录。普通用户没有密码
export const loginAsAdmin = (username: string, password: string) =>
  request<LoginResultDto>("/api/auth/admin", jsonBody({ username, password }));
export const logout = () => request<null>("/api/auth/logout", { method: "POST" });
export const getMe = () => request<UserDto>("/api/me");
export const setNotificationsEnabled = (notificationsEnabled: boolean) =>
  request<UserDto>("/api/me", { ...jsonBody({ notificationsEnabled }), method: "PATCH" });
// 更换通知邮箱：先给新地址发验证码。用户填对验证码后，才更换。
export const startNotifyEmailChange = (email: string) =>
  request<null>("/api/me/notify-email/start", jsonBody({ email }));
export const verifyNotifyEmailChange = (code: string) =>
  request<UserDto>("/api/me/notify-email/verify", jsonBody({ code }));

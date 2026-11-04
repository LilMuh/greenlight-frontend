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
  // 这条 watch 的主人，只读（PUT 时不用带）。管理员看的是所有人的，靠它分组
  ownerId?: number;
  ownerEmail?: string | null;
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
  notifyEmail: string | null; // 管理员账号设置前为空
  notificationsEnabled: boolean; // false = 在邮件里点了退订
  admin: boolean;
  googleLinked: boolean;
  enableAutoBooking: boolean; // false = 看不到订场入口（D-15 / D-16）；管理员另看 admin
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

// --- 自动订场（跨仓库契约：字段名逐字对齐后端 BookingTask*Dto record，05-06） -------

/** 订场任务状态。PENDING / RUNNING 是活动态；其余是终态。UNKNOWN = 不知道订没订上，不重试。 */
export type BookingTaskStatus =
  | "PENDING" | "RUNNING" | "BOOKED" | "DRY_RUN_OK"
  | "NOT_BOOKED" | "FAILED" | "UNKNOWN" | "CANCELLED";

export type BookingSort = "EARLIEST" | "CHEAPEST";

/** POST /api/booking-tasks 的请求体。runAtLocal 是站点本地时间 yyyy-MM-ddTHH:mm，不带时区。 */
export interface BookingTaskCreateDto {
  courseId: number;
  playDate: string; // yyyy-MM-dd，球场当地
  runAtLocal: string;
  timeStart: string; // HH:mm
  timeEnd: string;
  players: number; // 1–4
  maxPrice: number; // 单人价上限，加元整数
  sort: BookingSort;
}

/** 一条订场任务。创建者与订场账号邮箱只在登录后的 API 里出现，页面和测试里不写任何真实地址。 */
export interface BookingTaskDto {
  id: number;
  courseId: number;
  courseSlug: string;
  courseName: string;
  playDate: string;
  runAt: string; // ISO 瞬时
  runAtLocal: string | null; // 站点没有放号规则时为 null
  timeStart: string;
  timeEnd: string;
  players: number;
  maxPrice: number;
  sort: BookingSort;
  status: BookingTaskStatus;
  resultDetail: Record<string, unknown> | null;
  createdAt: string;
  finishedAt: string | null;
  creatorLoginEmail: string;
  mine: boolean;
  cancellable: boolean;
  bookingAccountEmail: string | null; // null = scraper 读不到，显示 Unknown，不猜
  editable: boolean; // 后端算：PENDING、自己的、不是管理员、原定运行时间在锁定窗口外
}

/** GET /api/booking-tasks：scheduled = 所有人的 PENDING / RUNNING；mine = 自己的全部（管理员是所有人的）。 */
export interface BookingTasksDto {
  scheduled: BookingTaskDto[];
  mine: BookingTaskDto[];
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
// 管理员专用：账号密码登录。普通用户没有密码
export const loginAsAdmin = (username: string, password: string) =>
  request<LoginResultDto>("/api/auth/admin", jsonBody({ username, password }));
export const logout = () => request<null>("/api/auth/logout", { method: "POST" });
export const getMe = () => request<UserDto>("/api/me");
export const setNotificationsEnabled = (notificationsEnabled: boolean) =>
  request<UserDto>("/api/me", { ...jsonBody({ notificationsEnabled }), method: "PATCH" });
// 换通知邮箱：先给新地址发码，填对了才换
export const startNotifyEmailChange = (email: string) =>
  request<null>("/api/me/notify-email/start", jsonBody({ email }));
export const verifyNotifyEmailChange = (code: string) =>
  request<UserDto>("/api/me/notify-email/verify", jsonBody({ code }));

// --- 自动订场 -------------------------------------------------------------------
export const listBookingTasks = () => request<BookingTasksDto>("/api/booking-tasks");
export const createBookingTask = (dto: BookingTaskCreateDto) =>
  request<BookingTaskDto>("/api/booking-tasks", jsonBody(dto));
// 取消：任务记录保留、状态改 CANCELLED（不是 DELETE）
// 修改待执行任务：请求体与新建相同，规则全在后端；返回修改后的记录。
export const updateBookingTask = (id: number, dto: BookingTaskCreateDto) =>
  request<BookingTaskDto>(`/api/booking-tasks/${id}`, { ...jsonBody(dto), method: "PUT" });
export const cancelBookingTask = (id: number) =>
  request<BookingTaskDto>(`/api/booking-tasks/${id}/cancel`, { method: "POST" });

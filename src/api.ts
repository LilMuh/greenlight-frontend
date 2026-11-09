// 所有后端调用都集中在这个文件。UI 代码不直接调用 fetch。
// 部署时，deploy.yml 在构建期注入 VITE_API_BASE。本地不设置时，默认用 localhost:8080。
import { clearToken, getToken } from "./auth";
import { writeHeaderUser } from "./headerUserCache";

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
  enableAutoBooking: boolean; // false = 看不到订场入口（D-15 / D-16）；管理员另看 admin
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

/**
 * GET /api/booking-tasks：订场任务互相独立（D-14）。
 * scheduled = 自己的 PENDING / RUNNING（管理员是所有人的）；mine = 自己的全部（管理员是所有人的）；
 * occupiedRunAtLocal = 别人占用的站点本地运行分钟串（yyyy-MM-ddTHH:mm），不含任务号、邮箱或用户，只用来提前提示「已被占用」。
 */
export interface BookingTasksDto {
  scheduled: BookingTaskDto[];
  mine: BookingTaskDto[];
  occupiedRunAtLocal: string[];
}

// --- 我的订场账号（跨仓库契约：字段名逐字对齐后端 BookingAccount*Dto / BookingKeyDto，06-06 / 06-07） ----------

/** 持久状态只有两个（D-16）。「验证中」不是状态，由 verifying 标记给出。 */
export type BookingAccountStatus = "VALID" | "NEEDS_ACTION";

/** NEEDS_ACTION 的原因码，与后端 BookingAccountReason 枚举逐字一致（只追加不改名）。 */
export type BookingAccountReason =
  | "NOT_VERIFIED" | "VERIFY_FAILED" | "BAD_CREDENTIALS" | "CHALLENGE" | "OTP_REQUIRED"
  | "UNEXPECTED_PAGE" | "LOGIN_TIMEOUT" | "TOKEN_REJECTED" | "NO_CREDENTIALS" | "NO_CARD_ON_FILE"
  | "UNSUPPORTED_CLASS" | "KEY_MISMATCH" | "DECRYPT_FAILED" | "ACCOUNT_MISMATCH" | "PROFILE_ERROR";

export type BookingAccountKind = "OWN" | "SHARED";

/** GET /api/booking-account：自己的订场账号。没有密文、公钥指纹和浏览器 profile id。 */
export interface BookingAccountDto {
  id: number;
  loginEmail: string;
  kind: BookingAccountKind;
  status: BookingAccountStatus;
  reason: BookingAccountReason | null; // VALID 时为 null
  classCode: string | null;
  verifiedAt: string | null; // ISO 瞬时
  verifying: boolean; // 后端内存里的在途标记
}

/** GET /api/booking-account/key：scraper 的公钥，后端原样转发。只有 keyId 等于写死的指纹才能用来加密（D-15）。 */
export interface BookingKeyDto {
  keyId: string; // 16 位小写十六进制
  algorithm: string; // RSA-OAEP-256
  spki: string; // SPKI DER 的标准 base64
}

/** PUT /api/booking-account 的请求体：后端永远看不到明文（D-05）。 */
export interface BookingAccountBindDto {
  keyId: string;
  loginEmail: string;
  ciphertext: string;
}

/** GET /api/booking-accounts（管理员只读总览）的一项：同样没有任何秘密字段。 */
export interface BookingAccountAdminDto {
  id: number;
  userId: number;
  userLoginEmail: string;
  loginEmail: string;
  kind: BookingAccountKind;
  status: BookingAccountStatus;
  reason: BookingAccountReason | null;
  classCode: string | null;
  verifiedAt: string | null;
  verifying: boolean;
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
// 登录成功就写头部缓存（只含三个展示字段）。令牌由页面随后 setToken；
// 读缓存要求有令牌，所以缓存先写、令牌后存没有问题。
const cacheLoginUser = (result: LoginResultDto): LoginResultDto => {
  writeHeaderUser(result.user);
  return result;
};

export const loginWithGoogle = (idToken: string) =>
  request<LoginResultDto>("/api/auth/google", jsonBody({ idToken })).then(cacheLoginUser);
// 无论邮箱是否已注册，后端都返回 204
export const startEmailLogin = (email: string) =>
  request<null>("/api/auth/email/start", jsonBody({ email }));
export const verifyEmailLogin = (email: string, code: string) =>
  request<LoginResultDto>("/api/auth/email/verify", jsonBody({ email, code })).then(cacheLoginUser);
// 管理员专用：用户名和密码登录。普通用户没有密码
export const loginAsAdmin = (username: string, password: string) =>
  request<LoginResultDto>("/api/auth/admin", jsonBody({ username, password })).then(cacheLoginUser);
export const logout = () => request<null>("/api/auth/logout", { method: "POST" });
// getMe 成功后用新值覆盖头部缓存（校正首帧按缓存画出的账号区）
export const getMe = () =>
  request<UserDto>("/api/me").then((user) => {
    writeHeaderUser(user);
    return user;
  });
export const setNotificationsEnabled = (notificationsEnabled: boolean) =>
  request<UserDto>("/api/me", { ...jsonBody({ notificationsEnabled }), method: "PATCH" });
// 更换通知邮箱：先给新地址发验证码。用户填对验证码后，才更换。
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

// --- 我的订场账号 ---------------------------------------------------------------
// 绑定：取公钥 → 浏览器加密（accountCrypto）→ PUT，返回 202（验证在后台进行，状态用 GET 轮询）。
export const getBookingKey = () => request<BookingKeyDto>("/api/booking-account/key");
// 没绑定返回 204（null）；管理员不调用这个，用 listBookingAccounts
export const getMyBookingAccount = () => request<BookingAccountDto | null>("/api/booking-account");
export const linkBookingAccount = (dto: BookingAccountBindDto) =>
  request<BookingAccountDto>("/api/booking-account", { ...jsonBody(dto), method: "PUT" });
// 重新验证：202，verifying=true；PUT 与它共用限频
export const reverifyBookingAccount = () =>
  request<BookingAccountDto>("/api/booking-account/verify", { method: "POST" });
// 解绑：204。该账号全部待执行任务会失败，并给创建者发邮件
export const unlinkBookingAccount = () => request<null>("/api/booking-account", { method: "DELETE" });
// 管理员只读总览
export const listBookingAccounts = () => request<BookingAccountAdminDto[]>("/api/booking-accounts");

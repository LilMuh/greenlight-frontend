# React 迁移 PR 1（Vite 骨架 + api.ts + tee-time 页）Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把 tee-time 页（index.html）等价迁移到 Vite + React 19 + TypeScript；config 页暂走 legacy 旧代码；部署从 sed 注入切到构建期环境变量。

**Architecture:** Vite MPA 双入口（index.html / config.html）。tee-time 页一个 React root：`useReducer`（action 名沿用旧 `data-act` 值）+ 按旧 `render()` 注释边界拆的四个组件。纯逻辑进 `logic.ts`（Vitest 覆盖），数据获取直译旧 `init`/`loadDay` 时序。

**Tech Stack:** React 19, TypeScript (strict), Vite, Vitest。无 router/状态库/UI 库。

**Spec:** `docs/superpowers/specs/2026-09-18-react-migration-design.md`

## Global Constraints

- **等价迁移**：功能/交互/文案与线上版逐一对齐；`STRINGS`、`ERROR_MESSAGES` 等文案逐字保留。
- **CSS 一字不改**：`index.html` 内联 `<style>` 内容原样搬到 `src/pages/tee-times/styles.css`，diff 必须是纯搬运。
- **旧注释随代码走**：搬函数时中文注释一并搬（它们记录了「为什么」，如 CPS 参数实测、维护中球场语义）。
- Vite `base: "./"`（Pages 挂 `/greenlight-frontend/` 子路径）。
- 环境变量：`VITE_API_BASE`（缺省 `http://localhost:8080`）、`VITE_API_KEY`（缺省 `""` = 后端关卡关闭）。
- Node 22 / npm。`package-lock.json` 提交。
- 分支 `react-migration`（已存在，spec 已提交在上面）。每个 Task 一个 commit。
- 不装 ESLint/Prettier/Testing Library——本 PR 不引入清单外的依赖。

---

### Task 1: Vite + TypeScript + Vitest 脚手架

现有静态页在 Vite 下原样能跑（都是 ES module），本任务只加工具链，不动任何页面代码。

**Files:**
- Create: `package.json`, `vite.config.ts`, `tsconfig.json`
- Modify: `.gitignore`

**Interfaces:**
- Produces: `npm run dev` / `npm run build`（产出 `dist/`，含两个入口页）/ `npm test`（vitest run）/ `npm run typecheck`。后续任务全部依赖这套命令。

- [ ] **Step 1: 写 package.json**

```json
{
  "name": "greenlight-frontend",
  "private": true,
  "version": "0.0.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "preview": "vite preview",
    "test": "vitest run",
    "typecheck": "tsc --noEmit"
  }
}
```

- [ ] **Step 2: 安装依赖**

```bash
npm install react react-dom
npm install -D typescript vite @vitejs/plugin-react @types/react @types/react-dom vitest
```

- [ ] **Step 3: 写 vite.config.ts**

```ts
/// <reference types="vitest/config" />
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";

// 两个页面 = 两个构建入口（MPA），页间跳转保持整页 <a href>。
// base 用相对路径：GitHub Pages 挂在 /greenlight-frontend/ 子路径下，不硬编码仓库名。
export default defineConfig({
  base: "./",
  plugins: [react()],
  build: {
    rollupOptions: {
      input: {
        index: fileURLToPath(new URL("./index.html", import.meta.url)),
        config: fileURLToPath(new URL("./config.html", import.meta.url)),
      },
    },
  },
  test: {
    environment: "node",
  },
});
```

- [ ] **Step 4: 写 tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "moduleResolution": "bundler",
    "jsx": "react-jsx",
    "strict": true,
    "noEmit": true,
    "isolatedModules": true,
    "skipLibCheck": true,
    "allowJs": true,
    "types": ["vite/client"]
  },
  "include": ["src"]
}
```

（`allowJs`: Task 6 会把旧 config.js/api.js 挪进 `src/legacy/`。）

- [ ] **Step 5: .gitignore 加一行 `dist/`**

- [ ] **Step 6: 验证构建**

Run: `npm run build && ls dist/index.html dist/config.html`
Expected: 构建成功，两个入口页都在 `dist/`。（此时页面仍是旧 vanilla 代码，Vite 只是打包它们。）

Run: `npm run dev &`（或前台开着），curl `http://localhost:5173/index.html` 与 `/config.html`
Expected: 200，HTML 里能看到 `<div ... id="app">`。验证完停掉 dev server。

注意：本任务**不跑** `npm test`——还没有测试文件，`vitest run` 会因找不到用例报错，属预期。

- [ ] **Step 7: Commit**

```bash
git add package.json package-lock.json vite.config.ts tsconfig.json .gitignore
git commit -m "build: Vite + TypeScript + Vitest 脚手架（MPA 双入口）"
```

---

### Task 2: src/api.ts —— api.js 的带类型直译

逻辑零改动。仅有的两处语义变化：占位符注入 → Vite 环境变量（保留「缺省 = 本地后端 / 关卡关闭」语义）。旧 api.js 原地保留（config 页还在用），Task 6 处理它。

**Files:**
- Create: `src/api.ts`

**Interfaces:**
- Produces（后续任务和 PR 2 依赖的完整出口）:
  - `class ApiError extends Error { status: number; code: string | null }`
  - `getHealth(): Promise<unknown>`
  - `getCourses(): Promise<CourseDto[]>`
  - `getTeeTimes(params?: Record<string, string>): Promise<TeeTimeDto[]>`
  - `getMatches(): Promise<MatchDto[]>`
  - `listWatchConfigs(): Promise<WatchConfigDto[]>`
  - `createWatchConfigs(batch: CreateWatchBatchDto): Promise<WatchConfigDto[]>`
  - `updateWatchConfig(id: number, config: WatchConfigDto): Promise<WatchConfigDto>`
  - `deleteWatchConfig(id: number): Promise<null>`
  - 类型 `CourseDto` / `TeeTimeDto` / `WatchConfigDto` / `CreateWatchBatchDto` / `MatchDto`

- [ ] **Step 1: 写 src/api.ts（全文）**

DTO 字段以旧代码实际读写为唯一依据（main.js 的 init/groupTeeTimes、config.js 的 normalizeWatch/toDto/loadMatches），不猜测未使用字段。注意 course 有两个标识：数字 `id`（watch-config 用）和 `slug`（tee-time 页当 id 用）。

```ts
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
```

- [ ] **Step 2: 类型检查**

Run: `npm run typecheck`
Expected: 0 errors。

- [ ] **Step 3: Commit**

```bash
git add src/api.ts
git commit -m "feat: api.ts —— api.js 的带类型直译，占位符注入改为 Vite 环境变量"
```

---

### Task 3: strings.ts + logic.ts（TDD，等价性的机器证明）

纯函数从 main.js 逐字搬运，唯一改动：闭包引用 `state.courses` 改成显式参数。先写测试（用例全部从旧实现的语义推导），再搬实现。

**Files:**
- Create: `src/pages/tee-times/strings.ts`
- Create: `src/pages/tee-times/logic.ts`
- Test: `src/pages/tee-times/logic.test.ts`

**Interfaces:**
- Consumes: `CourseDto`, `TeeTimeDto`, `ApiError`（Task 2）
- Produces:
  - `strings.ts`: `PRICE_BUCKETS`, `type PriceBucket`, `SORTS`, `type SortBy`, `SORT_DEFAULT`, `STRINGS`
  - `logic.ts`:
    - `interface CourseView { id: string; name: string; imageUrl: string | null; source: string | null; site: string | null; address: string | null; rating: number | null; ratingCount: number | null; maintenance: boolean }`
    - `interface TeeSlot { time: string; price: number; availableSeats: number | null }`
    - `interface CourseDay`（CourseView 去 maintenance、加 `teeTimes: TeeSlot[]`）
    - `interface Card { course: CourseDay; teeTimes: TeeSlot[]; cheapest: number; earliest: string }`
    - `normalizeCourses(courseDtos: CourseDto[]): CourseView[]`
    - `maintenanceCourseIds(courses: CourseView[]): string[]`
    - `buildDates(): { date: Date; iso: string }[]`
    - `toISO(date: Date): string`
    - `priceMatch(price: number, bucket: PriceBucket): boolean`
    - `bookingUrl(course: { id: string; source: string | null; site: string | null }, isoDate: string): string | null`
    - `groupTeeTimes(teeTimeList: TeeTimeDto[] | null | undefined, courses: CourseView[]): CourseDay[]`
    - `computeCards(dayData: CourseDay[], excludedCourseIds: string[], priceBucket: PriceBucket, sortBy: SortBy): Card[]`
    - `classifyFailure(error: unknown): string`

- [ ] **Step 1: 写 strings.ts**

`STRINGS` 从 main.js 67–92 行**逐字**复制（含全部中文注释），只加类型壳：

```ts
export const PRICE_BUCKETS = ["all", "low", "mid", "high", "top"] as const;
export type PriceBucket = (typeof PRICE_BUCKETS)[number];
export const SORTS = ["rec", "price", "time"] as const;
export type SortBy = (typeof SORTS)[number];
// 默认按开球时间从早到晚排。找 tee time 的人第一眼要看的是「几点能打」，
// 评分（rec）是选球场时才有用的次要标准，何况它来自 Google Maps、可能整列都是 null。
export const SORT_DEFAULT: SortBy = "time";

export const STRINGS = {
  /* main.js 的 STRINGS 对象逐字复制到这里，一条不漏：
     appName / tagline / navQuery / navWatch / filterTitle / courseFilterTitle /
     priceFilterTitle / sortFilterTitle / reset / done / prices / sorts /
     coursesChip / book / maintenanceBadge / maintenanceToast / noResults /
     loading / seatsUnit / today / weekdays / monthLabel / countText / bookToast /
     offline / unauthorized / serverError / loadFailed，含原注释 */
} as const;
```

（执行时从 main.js 复制原文，不要凭记忆重敲。）

- [ ] **Step 2: 写失败测试 logic.test.ts（完整用例）**

```ts
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  buildDates, priceMatch, bookingUrl, groupTeeTimes, computeCards,
  normalizeCourses, maintenanceCourseIds, classifyFailure,
} from "./logic";
import { STRINGS } from "./strings";
import { ApiError, type CourseDto } from "../../api";

const courseDtos: CourseDto[] = [
  { id: 1, slug: "langara", name: "Langara", imageUrl: "http://img/l.jpg", source: "cps", site: "golfvancouver", address: "290 W 49th Ave, Vancouver, BC V5X 3T4, Canada", rating: 4.3, ratingCount: 1330, maintenance: false },
  { id: 2, slug: "riverway", name: "Riverway", imageUrl: null, source: "cps", site: "golfburnaby", address: null, rating: null, ratingCount: null, maintenance: true },
];
const courses = normalizeCourses(courseDtos);

describe("normalizeCourses / maintenanceCourseIds", () => {
  it("用 slug 当 id，maintenance 只认 === true", () => {
    expect(courses[0]).toMatchObject({ id: "langara", maintenance: false });
    expect(maintenanceCourseIds(courses)).toEqual(["riverway"]);
  });
});

// 边界都取开区间下界（price > 70 才算 high），和档位文案 "$41–70"/"$71–120" 对得上
describe("priceMatch", () => {
  it.each([
    [40, "low", true], [41, "low", false],
    [40, "mid", false], [41, "mid", true], [70, "mid", true], [71, "mid", false],
    [70, "high", false], [71, "high", true], [120, "high", true], [121, "high", false],
    [120, "top", false], [121, "top", true],
    [999, "all", true],
  ] as const)("price=%s bucket=%s -> %s", (price, bucket, expected) => {
    expect(priceMatch(price, bucket)).toBe(expected);
  });
});

describe("buildDates", () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });
  it("今天 + 后 7 天共 8 天，ISO 本地时区零填充", () => {
    vi.setSystemTime(new Date(2026, 8, 19, 15, 30));
    const dates = buildDates();
    expect(dates).toHaveLength(8);
    expect(dates[0].iso).toBe("2026-09-19");
    expect(dates[7].iso).toBe("2026-09-26");
  });
  it("跨月正确", () => {
    vi.setSystemTime(new Date(2026, 8, 30));
    expect(buildDates()[1].iso).toBe("2026-10-01");
  });
});

describe("bookingUrl", () => {
  it("CPS：Date/CourseId/TeeOffTime 范围全带上", () => {
    const url = new URL(bookingUrl({ id: "fraserview", source: "cps", site: "golfvancouver" }, "2026-09-20")!);
    expect(url.origin + url.pathname).toBe("https://golfvancouver.cps.golf/onlineresweb/search-teetime");
    expect(url.searchParams.get("Date")).toBe("2026-09-20");
    expect(url.searchParams.get("CourseId")).toBe("2");
    expect(url.searchParams.get("TeeOffTimeMin")).toBe("0");
    expect(url.searchParams.get("TeeOffTimeMax")).toBe("23.999722222222225");
  });
  it("CPS 认不出的 slug：不带 CourseId，其余参数照旧", () => {
    const url = new URL(bookingUrl({ id: "brand-new", source: "cps", site: "golfburnaby" }, "2026-09-20")!);
    expect(url.searchParams.has("CourseId")).toBe(false);
    expect(url.searchParams.get("Date")).toBe("2026-09-20");
  });
  it("TEI：裸预订页，不拼日期参数（站点会全部忽略）", () => {
    expect(bookingUrl({ id: "nicklaus-north", source: "tei", site: "nicklausnorth" }, "2026-09-20"))
      .toBe("https://nicklausnorth.totaleintegrated.com/Book-a-Tee-Time");
  });
  it("没有 site 或来源不认识 -> null（UI 退回按钮 + toast）", () => {
    expect(bookingUrl({ id: "x", source: "cps", site: null }, "2026-09-20")).toBeNull();
    expect(bookingUrl({ id: "x", source: "mystery", site: "s" }, "2026-09-20")).toBeNull();
  });
});

describe("groupTeeTimes", () => {
  it("按球场分组，/api/courses 的元数据挂上，price/seats 数字化", () => {
    const grouped = groupTeeTimes([
      { courseId: "langara", course: "Langara", time: "07:00", price: "63", availableSeats: "2" },
      { courseId: "langara", course: "Langara", time: "07:30", price: 63, availableSeats: null },
      { courseId: "riverway", course: "Riverway", time: "08:00", price: 45, availableSeats: 4 },
    ], courses);
    expect(grouped).toHaveLength(2);
    const langara = grouped.find((c) => c.id === "langara")!;
    expect(langara.imageUrl).toBe("http://img/l.jpg");
    expect(langara.site).toBe("golfvancouver");
    expect(langara.teeTimes).toEqual([
      { time: "07:00", price: 63, availableSeats: 2 },
      { time: "07:30", price: 63, availableSeats: null },
    ]);
  });
  it("认不出的 courseId：名字退回 course 字段，元数据 null", () => {
    const grouped = groupTeeTimes(
      [{ courseId: "ghost", course: "Ghost GC", time: "09:00", price: 50, availableSeats: null }],
      courses,
    );
    expect(grouped[0]).toMatchObject({ id: "ghost", name: "Ghost GC", imageUrl: null, site: null });
  });
  it("price 解析不了 -> 0；null 入参 -> []", () => {
    const grouped = groupTeeTimes(
      [{ courseId: "langara", course: null, time: "07:00", price: "abc", availableSeats: null }],
      courses,
    );
    expect(grouped[0].teeTimes[0].price).toBe(0);
    expect(groupTeeTimes(null, courses)).toEqual([]);
  });
});

describe("computeCards", () => {
  const day = () => groupTeeTimes([
    { courseId: "langara", course: "Langara", time: "08:00", price: 63, availableSeats: 2 },
    { courseId: "langara", course: "Langara", time: "07:00", price: 80, availableSeats: 4 },
    { courseId: "riverway", course: "Riverway", time: "06:30", price: 45, availableSeats: null },
  ], courses);

  it("排除的球场整卡消失", () => {
    const cards = computeCards(day(), ["riverway"], "all", "time");
    expect(cards.map((card) => card.course.id)).toEqual(["langara"]);
  });
  it("价格筛后没有时段的时段被剔除，cheapest/earliest 取自筛后集合", () => {
    // mid = $41–70：langara 只剩 08:00@63，riverway 保住 06:30@45
    const cards = computeCards(day(), [], "mid", "time");
    const langara = cards.find((card) => card.course.id === "langara")!;
    expect(langara.teeTimes).toEqual([{ time: "08:00", price: 63, availableSeats: 2 }]);
    expect(langara.cheapest).toBe(63);
    expect(langara.earliest).toBe("08:00");
  });
  it("价格筛掉全部时段的卡不出现", () => {
    // top = >$120：两家都没有
    expect(computeCards(day(), [], "top", "time")).toEqual([]);
  });
  it("sort=time 按最早时段升序", () => {
    expect(computeCards(day(), [], "all", "time").map((card) => card.course.id)).toEqual(["riverway", "langara"]);
  });
  it("sort=price 按最低价升序", () => {
    expect(computeCards(day(), [], "all", "price").map((card) => card.course.id)).toEqual(["riverway", "langara"]);
  });
  it("sort=rec 评分高在前，null 评分排最后（不是当 0）", () => {
    expect(computeCards(day(), [], "all", "rec").map((card) => card.course.id)).toEqual(["langara", "riverway"]);
  });
});

describe("classifyFailure", () => {
  it("非 ApiError（fetch 抛的）= 根本没连上", () => {
    expect(classifyFailure(new TypeError("Failed to fetch"))).toBe(STRINGS.offline);
  });
  it("UNAUTHORIZED -> 部署配置问题的文案", () => {
    expect(classifyFailure(new ApiError(401, "UNAUTHORIZED", ""))).toBe(STRINGS.unauthorized);
  });
  it("5xx -> 后端出错文案", () => {
    expect(classifyFailure(new ApiError(502, null, ""))).toBe(STRINGS.serverError);
  });
  it("其它 4xx -> 笼统加载失败", () => {
    expect(classifyFailure(new ApiError(404, "ENDPOINT_NOT_FOUND", ""))).toBe(STRINGS.loadFailed);
  });
});
```

- [ ] **Step 3: 跑测试确认失败**

Run: `npm test`
Expected: FAIL —— `logic.ts` 不存在（Cannot find module）。

- [ ] **Step 4: 写 logic.ts**

函数体从 main.js **逐字搬运**（含 CPS_COURSE_IDS 表、CPS_DAY_MIN/MAX、全部中文注释），仅做三类机械改动：加类型标注；`state.courses` 闭包 → `courses` 参数；`noteFailure` 的分类逻辑抽成纯函数 `classifyFailure`（offline 标记留给 reducer）。

```ts
import { ApiError, type CourseDto, type TeeTimeDto } from "../../api";
import { STRINGS, type PriceBucket, type SortBy } from "./strings";

export interface CourseView {
  id: string; // slug，和 tee-time 的 courseId 对得上
  name: string;
  imageUrl: string | null;
  source: string | null;
  site: string | null;
  address: string | null;
  rating: number | null;
  ratingCount: number | null;
  maintenance: boolean;
}

export interface TeeSlot {
  time: string;
  price: number;
  availableSeats: number | null;
}

export interface CourseDay {
  id: string;
  name: string;
  imageUrl: string | null;
  source: string | null;
  site: string | null;
  address: string | null;
  rating: number | null;
  ratingCount: number | null;
  teeTimes: TeeSlot[];
}

export interface Card {
  course: CourseDay;
  teeTimes: TeeSlot[];
  cheapest: number;
  earliest: string;
}

/* 以下每个函数上方，把 main.js 里对应的中文注释块原样搬来（执行时复制原文）：
   - CPS_DAY_MIN/MAX + CPS_COURSE_IDS 前面那三段（深链参数实测、id 表来源）
   - bookingUrl 前面 TEI 无日期深链那段
   - buildDates 里「今天 + 后 7 天」那行
   - priceMatch 前面开区间那行
   - groupTeeTimes 前面 + 内部两段
   - maintenanceCourseIds / normalizeCourses（init 里 slug 那两行）
   - computeCards 里 rec 排序 null 处理那两行 */

const CPS_DAY_MIN = "0";
const CPS_DAY_MAX = "23.999722222222225";

const CPS_COURSE_IDS: Record<string, number> = {
  langara: 1, fraserview: 2, mccleery: 3,
  "burnaby-mountain": 1, riverway: 2,
  hazelmere: 1, belmont: 2, "swaneset-resort": 3, "swaneset-links": 4,
  "kings-links": 1,
};

export function bookingUrl(
  course: { id: string; source: string | null; site: string | null },
  isoDate: string,
): string | null {
  if (!course.site) return null;
  if (course.source === "tei") {
    return `https://${course.site}.totaleintegrated.com/Book-a-Tee-Time`;
  }
  if (course.source !== "cps") return null;
  const url = new URL(`https://${course.site}.cps.golf/onlineresweb/search-teetime`);
  url.searchParams.set("Date", isoDate);
  const cpsCourseId = CPS_COURSE_IDS[course.id];
  if (cpsCourseId != null) url.searchParams.set("CourseId", String(cpsCourseId));
  url.searchParams.set("TeeOffTimeMin", CPS_DAY_MIN);
  url.searchParams.set("TeeOffTimeMax", CPS_DAY_MAX);
  return url.toString();
}

export function buildDates(): { date: Date; iso: string }[] {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const dates = [];
  for (let index = 0; index < 8; index++) {
    const date = new Date(today);
    date.setDate(today.getDate() + index);
    dates.push({ date, iso: toISO(date) });
  }
  return dates;
}

export function toISO(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function priceMatch(price: number, bucket: PriceBucket): boolean {
  if (bucket === "all") return true;
  if (bucket === "low") return price <= 40;
  if (bucket === "mid") return price > 40 && price <= 70;
  if (bucket === "high") return price > 70 && price <= 120;
  if (bucket === "top") return price > 120;
  return true;
}

export function normalizeCourses(courseDtos: CourseDto[]): CourseView[] {
  return courseDtos.map((course) => ({
    id: course.slug,
    name: course.name,
    imageUrl: course.imageUrl,
    source: course.source ?? null,
    site: course.site ?? null,
    address: course.address ?? null,
    rating: course.rating ?? null,
    ratingCount: course.ratingCount ?? null,
    maintenance: course.maintenance === true,
  }));
}

export function maintenanceCourseIds(courses: CourseView[]): string[] {
  return courses.filter((course) => course.maintenance).map((course) => course.id);
}

export function groupTeeTimes(
  teeTimeList: TeeTimeDto[] | null | undefined,
  courses: CourseView[],
): CourseDay[] {
  const byCourseId = new Map<string, CourseDay>();
  for (const teeTime of teeTimeList || []) {
    const courseKey = String(teeTime.courseId ?? teeTime.course ?? "");
    const matchedCourse = courses.find((course) => course.id === courseKey || course.name === courseKey);
    const courseId = matchedCourse ? matchedCourse.id : courseKey;
    if (!byCourseId.has(courseId)) {
      byCourseId.set(courseId, {
        id: courseId,
        name: matchedCourse ? matchedCourse.name : String(teeTime.course ?? courseKey),
        imageUrl: matchedCourse ? matchedCourse.imageUrl : null,
        source: matchedCourse ? matchedCourse.source : null,
        site: matchedCourse ? matchedCourse.site : null,
        address: matchedCourse ? matchedCourse.address : null,
        rating: matchedCourse ? matchedCourse.rating : null,
        ratingCount: matchedCourse ? matchedCourse.ratingCount : null,
        teeTimes: [],
      });
    }
    byCourseId.get(courseId)!.teeTimes.push({
      time: teeTime.time,
      price: Number(teeTime.price) || 0,
      availableSeats: teeTime.availableSeats != null ? Number(teeTime.availableSeats) : null,
    });
  }
  return [...byCourseId.values()];
}

export function computeCards(
  dayData: CourseDay[],
  excludedCourseIds: string[],
  priceBucket: PriceBucket,
  sortBy: SortBy,
): Card[] {
  const cards: Card[] = dayData
    .filter((course) => !excludedCourseIds.includes(course.id))
    .map((course) => ({
      course,
      teeTimes: course.teeTimes.filter((teeTime) => priceMatch(teeTime.price, priceBucket)),
    }))
    .filter((card) => card.teeTimes.length > 0)
    .map(({ course, teeTimes }) => ({
      course,
      teeTimes,
      cheapest: Math.min(...teeTimes.map((teeTime) => teeTime.price)),
      earliest: teeTimes.map((teeTime) => teeTime.time).slice().sort()[0],
    }));

  if (sortBy === "price") cards.sort((left, right) => left.cheapest - right.cheapest);
  else if (sortBy === "time") cards.sort((left, right) => left.earliest.localeCompare(right.earliest));
  else cards.sort((left, right) => (right.course.rating ?? -1) - (left.course.rating ?? -1));

  return cards;
}

/** 旧 noteFailure 的分类部分（offline 标记归 reducer 管）。三档语义见旧注释。 */
export function classifyFailure(error: unknown): string {
  if (!(error instanceof ApiError)) return STRINGS.offline; // fetch 自己抛的 = 根本没连上
  if (error.code === "UNAUTHORIZED") return STRINGS.unauthorized;
  if (error.status >= 500) return STRINGS.serverError;
  return STRINGS.loadFailed;
}
```

- [ ] **Step 5: 跑测试确认通过**

Run: `npm test && npm run typecheck`
Expected: 全绿，0 type errors。

- [ ] **Step 6: Commit**

```bash
git add src/pages/tee-times/strings.ts src/pages/tee-times/logic.ts src/pages/tee-times/logic.test.ts
git commit -m "feat: tee-time 页纯逻辑迁入 logic.ts，Vitest 锁定等价语义"
```

---

### Task 4: reducer.ts（TDD）

旧事件委托的 `switch` 逐分支翻译；action.type 沿用 `data-act` 值，新旧可并排对读。维护中球场的拦截 toast 是副作用，留在组件层（Task 5），reducer 只管纯状态。

**Files:**
- Create: `src/pages/tee-times/reducer.ts`
- Test: `src/pages/tee-times/reducer.test.ts`

**Interfaces:**
- Consumes: `normalizeCourses`, `maintenanceCourseIds`, `groupTeeTimes`, `buildDates`, 类型（Task 3）；`CourseDto`, `TeeTimeDto`（Task 2）
- Produces:
  - `interface State { offline: boolean; loading: boolean; courses: CourseView[]; dayData: CourseDay[]; dates: { date: Date; iso: string }[]; selectedDateIndex: number; filterOpen: boolean; priceBucket: PriceBucket; excludedCourseIds: string[]; sortBy: SortBy; selectedChip: string | null }`
  - `type Action =` `{type:"date";index:number}` | `{type:"filter"}` | `{type:"reset"}` | `{type:"course";id:string}` | `{type:"price";value:PriceBucket}` | `{type:"sort";value:SortBy}` | `{type:"chip";key:string}` | `{type:"coursesLoaded";courses:CourseDto[]}` | `{type:"loadStart"}` | `{type:"dayLoaded";teeTimeList:TeeTimeDto[]}` | `{type:"failure"}` | `{type:"dayFailed"}`
  - `createInitialState(): State`
  - `reducer(state: State, action: Action): State`

- [ ] **Step 1: 写失败测试 reducer.test.ts**

```ts
import { describe, it, expect } from "vitest";
import { createInitialState, reducer } from "./reducer";
import type { CourseDto } from "../../api";

const courseDtos: CourseDto[] = [
  { id: 1, slug: "langara", name: "Langara", imageUrl: null, source: "cps", site: "golfvancouver", address: null, rating: 4.3, ratingCount: 100, maintenance: false },
  { id: 2, slug: "riverway", name: "Riverway", imageUrl: null, source: "cps", site: "golfburnaby", address: null, rating: null, ratingCount: null, maintenance: true },
];

const loadedState = () => reducer(createInitialState(), { type: "coursesLoaded", courses: courseDtos });

describe("reducer", () => {
  it("初始态：loading、8 个日期、默认排序 time", () => {
    const state = createInitialState();
    expect(state.loading).toBe(true);
    expect(state.dates).toHaveLength(8);
    expect(state.sortBy).toBe("time");
    expect(state.excludedCourseIds).toEqual([]);
  });
  it("coursesLoaded：维护中的球场进默认排除名单", () => {
    expect(loadedState().excludedCourseIds).toEqual(["riverway"]);
  });
  it("date：切日期清掉选中的时段 chip", () => {
    const state = reducer({ ...loadedState(), selectedChip: "langara|07:00" }, { type: "date", index: 3 });
    expect(state.selectedDateIndex).toBe(3);
    expect(state.selectedChip).toBeNull();
  });
  it("filter：开合翻转", () => {
    expect(reducer(loadedState(), { type: "filter" }).filterOpen).toBe(true);
  });
  it("course：排除/取消排除来回切", () => {
    let state = reducer(loadedState(), { type: "course", id: "langara" });
    expect(state.excludedCourseIds).toContain("langara");
    state = reducer(state, { type: "course", id: "langara" });
    expect(state.excludedCourseIds).not.toContain("langara");
  });
  it("reset：回到「维护中排除在外」的默认态，不是清空", () => {
    let state = reducer(loadedState(), { type: "course", id: "langara" });
    state = reducer(state, { type: "price", value: "top" });
    state = reducer(state, { type: "sort", value: "rec" });
    state = reducer(state, { type: "reset" });
    expect(state.excludedCourseIds).toEqual(["riverway"]);
    expect(state.priceBucket).toBe("all");
    expect(state.sortBy).toBe("time");
  });
  it("chip：同一个 key 再点一次取消", () => {
    let state = reducer(loadedState(), { type: "chip", key: "a|07:00" });
    expect(state.selectedChip).toBe("a|07:00");
    state = reducer(state, { type: "chip", key: "a|07:00" });
    expect(state.selectedChip).toBeNull();
  });
  it("loadStart/dayLoaded：分组挂上 courses 元数据并结束 loading", () => {
    let state = reducer(loadedState(), { type: "loadStart" });
    expect(state.loading).toBe(true);
    state = reducer(state, {
      type: "dayLoaded",
      teeTimeList: [{ courseId: "langara", course: "Langara", time: "07:00", price: 63, availableSeats: 2 }],
    });
    expect(state.loading).toBe(false);
    expect(state.dayData[0].rating).toBe(4.3);
  });
  it("dayFailed：清空数据、标 offline、结束 loading（绝不编造数据）", () => {
    const state = reducer(reducer(loadedState(), { type: "loadStart" }), { type: "dayFailed" });
    expect(state).toMatchObject({ offline: true, dayData: [], loading: false });
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npm test`
Expected: reducer.test.ts FAIL（模块不存在），logic.test.ts 仍绿。

- [ ] **Step 3: 写 reducer.ts**

```ts
import type { CourseDto, TeeTimeDto } from "../../api";
import { SORT_DEFAULT, type PriceBucket, type SortBy } from "./strings";
import {
  buildDates, groupTeeTimes, maintenanceCourseIds, normalizeCourses,
  type CourseDay, type CourseView,
} from "./logic";

export interface State {
  offline: boolean; // 有过一次拿不到数据的失败。UI 的空态由 dayData 为空表达，这个标记只决定 init 时要不要弹失败 toast
  loading: boolean;
  courses: CourseView[];
  dayData: CourseDay[];
  dates: { date: Date; iso: string }[];
  selectedDateIndex: number;
  filterOpen: boolean;
  priceBucket: PriceBucket;
  excludedCourseIds: string[];
  sortBy: SortBy;
  selectedChip: string | null;
}

export function createInitialState(): State {
  return {
    offline: false,
    loading: true,
    courses: [],
    dayData: [],
    dates: buildDates(),
    selectedDateIndex: 0,
    filterOpen: false,
    priceBucket: "all",
    excludedCourseIds: [],
    sortBy: SORT_DEFAULT,
    selectedChip: null,
  };
}

// action.type 沿用旧 data-act 值，和 main.js 事件委托的 switch 并排可对读。
// 维护中球场点击的拦截（toast）是副作用，在 App 层做，这里只进纯状态变更。
export type Action =
  | { type: "date"; index: number }
  | { type: "filter" }
  | { type: "reset" }
  | { type: "course"; id: string }
  | { type: "price"; value: PriceBucket }
  | { type: "sort"; value: SortBy }
  | { type: "chip"; key: string }
  | { type: "coursesLoaded"; courses: CourseDto[] }
  | { type: "loadStart" }
  | { type: "dayLoaded"; teeTimeList: TeeTimeDto[] }
  | { type: "failure" }
  | { type: "dayFailed" };

export function reducer(state: State, action: Action): State {
  switch (action.type) {
    case "date":
      return { ...state, selectedDateIndex: action.index, selectedChip: null };
    case "filter":
      return { ...state, filterOpen: !state.filterOpen };
    case "reset":
      // Reset 回到默认，而默认就包含「维护中的排除在外」，不是清空
      return {
        ...state,
        priceBucket: "all",
        sortBy: SORT_DEFAULT,
        excludedCourseIds: maintenanceCourseIds(state.courses),
      };
    case "course":
      return {
        ...state,
        excludedCourseIds: state.excludedCourseIds.includes(action.id)
          ? state.excludedCourseIds.filter((excludedId) => excludedId !== action.id)
          : [...state.excludedCourseIds, action.id],
      };
    case "price":
      return { ...state, priceBucket: action.value };
    case "sort":
      return { ...state, sortBy: action.value };
    case "chip":
      return { ...state, selectedChip: state.selectedChip === action.key ? null : action.key };
    case "coursesLoaded": {
      const courses = normalizeCourses(action.courses);
      // 维护中的球场默认排除：时段早就停更了，混在结果里只会让人对着过期数据点 Book
      return { ...state, courses, excludedCourseIds: maintenanceCourseIds(courses) };
    }
    case "loadStart":
      return { ...state, loading: true };
    case "dayLoaded":
      // 分组要用 state.courses 挂元数据，所以放这里做而不是 App 里
      return { ...state, dayData: groupTeeTimes(action.teeTimeList, state.courses), loading: false };
    case "failure":
      return { ...state, offline: true };
    case "dayFailed":
      // 拿不到就什么都不显示，绝不编造
      return { ...state, offline: true, dayData: [], loading: false };
  }
}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `npm test && npm run typecheck`
Expected: 全绿。

- [ ] **Step 5: Commit**

```bash
git add src/pages/tee-times/reducer.ts src/pages/tee-times/reducer.test.ts
git commit -m "feat: tee-time 页 reducer —— 旧事件委托 switch 的逐分支直译"
```

---

### Task 5: 组件 + App + 入口 + CSS 搬运 + index.html 瘦身

**Files:**
- Create: `src/pages/tee-times/components/DateStrip.tsx`
- Create: `src/pages/tee-times/components/FilterBar.tsx`
- Create: `src/pages/tee-times/components/CourseCard.tsx`
- Create: `src/pages/tee-times/components/Toast.tsx`
- Create: `src/pages/tee-times/App.tsx`
- Create: `src/pages/tee-times/main.tsx`
- Create: `src/pages/tee-times/styles.css`（从 index.html 搬运）
- Modify: `index.html`（去掉内联 style，script 指向 main.tsx）

**Interfaces:**
- Consumes: Task 2–4 的全部出口。
- Produces: 页面本身（无被后续任务消费的出口）。

- [ ] **Step 1: 搬 CSS（机械提取，禁止改动）**

```bash
mkdir -p src/pages/tee-times/components
awk '/<style>/{flag=1;next}/<\/style>/{flag=0}flag' index.html > src/pages/tee-times/styles.css
```

验证是纯搬运：`grep -c "" src/pages/tee-times/styles.css` 的行数应等于 index.html 中 `<style>` 与 `</style>` 之间的行数（约 598 行）；抽查首尾几行与原文一致。

- [ ] **Step 2: 写 DateStrip.tsx**

```tsx
import { STRINGS } from "../strings";

interface Props {
  dates: { date: Date; iso: string }[];
  selectedIndex: number;
  onSelect: (index: number) => void;
}

export function DateStrip({ dates, selectedIndex, onSelect }: Props) {
  return (
    <div className="tt-dates">
      {dates.map((dateInfo, index) => {
        const isActive = index === selectedIndex;
        const label = index === 0 ? STRINGS.today : STRINGS.weekdays[dateInfo.date.getDay()];
        return (
          <div
            key={dateInfo.iso}
            className={`tt-date${isActive ? " is-active" : ""}`}
            onClick={() => onSelect(index)}
          >
            <span className="tt-date-top">{label}</span>
            <span className="tt-date-num">{dateInfo.date.getDate()}</span>
            <span className="tt-date-top">{STRINGS.monthLabel(dateInfo.date.getMonth())}</span>
          </div>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 3: 写 FilterBar.tsx**（筛选行 + 展开面板，对应旧 render 的 toolbar 下半段）

```tsx
import { PRICE_BUCKETS, SORTS, SORT_DEFAULT, STRINGS, type PriceBucket, type SortBy } from "../strings";
import type { CourseView } from "../logic";

interface Props {
  courses: CourseView[];
  excludedCourseIds: string[];
  priceBucket: PriceBucket;
  sortBy: SortBy;
  filterOpen: boolean;
  countText: string;
  onToggleOpen: () => void;
  onReset: () => void;
  onToggleCourse: (course: CourseView) => void;
  onPrice: (bucket: PriceBucket) => void;
  onSort: (sort: SortBy) => void;
}

export function FilterBar(props: Props) {
  const { courses, excludedCourseIds, priceBucket, sortBy, filterOpen, countText } = props;

  // 面板收起时用户看不到自己选了什么，所以把生效的筛选摘成 chips 放在按钮旁边，
  // 数量同时当作按钮上的角标。默认值（Any / Earliest time / 球场全选）不算生效。
  const summaryChips: string[] = [];
  if (priceBucket !== "all") summaryChips.push(STRINGS.prices[priceBucket]);
  // 维护中的球场不算进「球场全选」这个默认值里：它们本来就排除掉了，
  // 拿它们当分母的话页面一打开就挂着一个「8 of 10 courses」的角标，看着像用户自己筛过。
  const selectableCourses = courses.filter((course) => !course.maintenance);
  const includedCourseCount = selectableCourses.filter(
    (course) => !excludedCourseIds.includes(course.id),
  ).length;
  if (selectableCourses.length && includedCourseCount < selectableCourses.length) {
    summaryChips.push(STRINGS.coursesChip(includedCourseCount, selectableCourses.length));
  }
  if (sortBy !== SORT_DEFAULT) summaryChips.push(STRINGS.sorts[sortBy]);

  return (
    <>
      <div className="tt-filter-row">
        <button className={`tt-filter-btn${filterOpen ? " is-open" : ""}`} onClick={props.onToggleOpen}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
            <line x1="21" y1="6" x2="3" y2="6" />
            <line x1="17" y1="12" x2="7" y2="12" />
            <line x1="13" y1="18" x2="11" y2="18" />
          </svg>
          <span>{STRINGS.filterTitle}</span>
          {summaryChips.length > 0 && <span className="tt-filter-badge">{summaryChips.length}</span>}
          <svg className="tt-caret" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </button>
        <div className="tt-summary">
          {summaryChips.map((label) => (
            <span key={label} className="tt-summary-chip">{label}</span>
          ))}
        </div>
        <span className="tt-count">{countText}</span>
      </div>

      {filterOpen && (
        <div className="tt-panel">
          <div className="tt-section">
            <div className="tt-section-title">{STRINGS.courseFilterTitle}</div>
            <div className="tt-courses">
              {courses.length === 0 && <span className="tt-course-name">—</span>}
              {courses.map((course) => {
                const isIncluded = !excludedCourseIds.includes(course.id);
                return (
                  <div
                    key={course.id}
                    className={`tt-course${isIncluded ? " is-on" : ""}${course.maintenance ? " is-maintenance" : ""}`}
                    onClick={() => props.onToggleCourse(course)}
                  >
                    <span className="tt-box" />
                    <span className="tt-course-name">{course.name}</span>
                    {course.maintenance && <span className="tt-course-badge">{STRINGS.maintenanceBadge}</span>}
                  </div>
                );
              })}
            </div>
          </div>
          <div className="tt-section">
            <div className="tt-section-title">{STRINGS.priceFilterTitle}</div>
            <div className="tt-chips">
              {PRICE_BUCKETS.map((bucket) => (
                <button
                  key={bucket}
                  className={`tt-chip-btn${priceBucket === bucket ? " is-active" : ""}`}
                  onClick={() => props.onPrice(bucket)}
                >
                  {STRINGS.prices[bucket]}
                </button>
              ))}
            </div>
          </div>
          <div className="tt-section">
            <div className="tt-section-title">{STRINGS.sortFilterTitle}</div>
            <div className="tt-sorts">
              {SORTS.map((sortOption) => (
                <button
                  key={sortOption}
                  className={`tt-chip-btn${sortBy === sortOption ? " is-active" : ""}`}
                  onClick={() => props.onSort(sortOption)}
                >
                  {STRINGS.sorts[sortOption]}
                </button>
              ))}
            </div>
          </div>
          <div className="tt-panel-actions">
            <button className="tt-btn-reset" onClick={props.onReset}>{STRINGS.reset}</button>
            <button className="tt-btn-done" onClick={props.onToggleOpen}>{STRINGS.done}</button>
          </div>
        </div>
      )}
    </>
  );
}
```

- [ ] **Step 4: 写 CourseCard.tsx**（评分/地址各自独立降级；Book 链接拼不出退回按钮 + toast——旧注释一并搬）

```tsx
import { STRINGS } from "../strings";
import { bookingUrl, type Card } from "../logic";

interface Props {
  card: Card;
  selectedIso: string;
  selectedChip: string | null;
  onChip: (key: string) => void;
  onBookFallback: (courseName: string) => void;
}

export function CourseCard({ card, selectedIso, selectedChip, onChip, onBookFallback }: Props) {
  const { course, teeTimes } = card;
  const url = bookingUrl(course, selectedIso);
  // 库里存的是完整地址，卡片只取前两段："7800 Vivian Dr, Vancouver"。
  // 城市那段单独包 .tt-addr-city：手机宽度下 CSS 会把它藏掉（不监听 resize）。
  const [street = "", city = ""] = String(course.address ?? "").split(",");

  return (
    <div className="tt-card">
      <div className="tt-card-row">
        <div className="tt-photo">
          {course.imageUrl && (
            // 图片加载失败就把 <img> 摘掉，露出条纹底，不显示裂图
            <img src={course.imageUrl} alt="" loading="lazy" onError={(event) => event.currentTarget.remove()} />
          )}
        </div>
        <div className="tt-card-info">
          <strong className="tt-card-name">{course.name}</strong>
          {/* 评分/地址来自 Google Maps，可能为 null——有就显示，没有整块不渲染，
              绝不显示 "⭐ 0" 或空括号 */}
          {course.rating != null && (
            <span className="tt-card-rating">
              ⭐ {course.rating}
              {course.ratingCount != null && ` (${Number(course.ratingCount).toLocaleString()})`}
            </span>
          )}
          {course.address != null && street.trim() !== "" && (
            <span className="tt-card-address" title={course.address}>
              {street.trim()}
              {city.trim() !== "" && <span className="tt-addr-city">, {city.trim()}</span>}
            </span>
          )}
        </div>
        {url ? (
          <a className="tt-book" href={url} target="_blank" rel="noopener noreferrer">{STRINGS.book}</a>
        ) : (
          <button className="tt-book" onClick={() => onBookFallback(course.name)}>{STRINGS.book}</button>
        )}
      </div>
      <div className="tt-tees">
        {teeTimes.map((teeTime) => {
          const chipKey = course.id + "|" + teeTime.time;
          const isSelected = selectedChip === chipKey;
          const isLow = teeTime.availableSeats != null && teeTime.availableSeats <= 2;
          return (
            <div key={chipKey} className={`tt-tee${isSelected ? " is-on" : ""}`} onClick={() => onChip(chipKey)}>
              <span className="tt-tee-time">{teeTime.time}</span>
              <span className="tt-tee-price">${teeTime.price}</span>
              {teeTime.availableSeats != null && (
                <span className={`tt-tee-slots${isLow ? " is-low" : ""}`}>
                  {teeTime.availableSeats}
                  {STRINGS.seatsUnit}
                </span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
```

- [ ] **Step 5: 写 Toast.tsx**

```tsx
export function Toast({ message }: { message: string }) {
  if (!message) return null;
  return <div className="tt-toast">{message}</div>;
}
```

- [ ] **Step 6: 写 App.tsx**（init/loadDay 时序 = 旧代码直译；失败原因记第一个）

```tsx
import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import { getCourses, getHealth, getTeeTimes } from "../../api";
import { STRINGS } from "./strings";
import { classifyFailure, computeCards, type CourseView } from "./logic";
import { createInitialState, reducer } from "./reducer";
import { DateStrip } from "./components/DateStrip";
import { FilterBar } from "./components/FilterBar";
import { CourseCard } from "./components/CourseCard";
import { Toast } from "./components/Toast";

export function App() {
  const [state, dispatch] = useReducer(reducer, undefined, createInitialState);
  const [toast, setToast] = useState("");
  const toastTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const showToast = useCallback((message: string, durationMs = 2200) => {
    setToast(message);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(""), durationMs);
  }, []);

  // 旧 loadDay 的直译。返回失败原因（成功为 null），init 用它挑「第一个失败原因」。
  const loadDay = useCallback(async (iso: string): Promise<string | null> => {
    dispatch({ type: "loadStart" });
    try {
      const teeTimeList = await getTeeTimes({ date: iso });
      dispatch({ type: "dayLoaded", teeTimeList });
      return null;
    } catch (error) {
      dispatch({ type: "dayFailed" });
      return classifyFailure(error);
    }
  }, []);

  // 旧 init 的直译：health 尽力而为 → courses → 第一天数据 → 失败原因 toast。
  // 只记第一个失败原因：后面几个请求多半是同一个根因的连锁反应。
  useEffect(() => {
    const firstIso = state.dates[0].iso;
    let firstReason: string | null = null;
    const note = (reason: string | null) => {
      if (reason) firstReason = firstReason ?? reason;
    };
    (async () => {
      try {
        await getHealth();
      } catch (error) {
        dispatch({ type: "failure" });
        note(classifyFailure(error));
      }
      try {
        const courses = await getCourses();
        if (Array.isArray(courses) && courses.length) dispatch({ type: "coursesLoaded", courses });
      } catch (error) {
        dispatch({ type: "failure" });
        note(classifyFailure(error));
      }
      note(await loadDay(firstIso));
      if (firstReason) showToast(firstReason, 2600);
    })();
    // 只在挂载时跑一遍；dates 挂载后不再变化
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSelectDate = (index: number) => {
    dispatch({ type: "date", index });
    void loadDay(state.dates[index].iso);
  };

  const handleToggleCourse = (course: CourseView) => {
    // 维护中的球场点不动，并说明原因（旧事件委托 case "course" 的拦截）
    if (course.maintenance) {
      showToast(STRINGS.maintenanceToast);
      return;
    }
    dispatch({ type: "course", id: course.id });
  };

  const selectedIso = state.dates[state.selectedDateIndex].iso;
  const cards = computeCards(state.dayData, state.excludedCourseIds, state.priceBucket, state.sortBy);
  const totalSlots = cards.reduce((total, card) => total + card.teeTimes.length, 0);
  const countText = state.loading ? STRINGS.loading : STRINGS.countText(cards.length, totalSlots);

  return (
    <>
      <div className="tt-header">
        <div className="tt-brand">
          <span className="tt-dot" />
          <div className="tt-brand-text">
            <strong>{STRINGS.appName}</strong>
            <small>{STRINGS.tagline}</small>
          </div>
        </div>
        <div className="tt-head-right">
          <div className="tt-nav">
            <a href="index.html" className="is-active">{STRINGS.navQuery}</a>
            <a href="config.html">{STRINGS.navWatch}</a>
          </div>
        </div>
      </div>

      <div className="tt-toolbar">
        <div className="tt-toolbar-inner">
          <DateStrip dates={state.dates} selectedIndex={state.selectedDateIndex} onSelect={handleSelectDate} />
          <FilterBar
            courses={state.courses}
            excludedCourseIds={state.excludedCourseIds}
            priceBucket={state.priceBucket}
            sortBy={state.sortBy}
            filterOpen={state.filterOpen}
            countText={countText}
            onToggleOpen={() => dispatch({ type: "filter" })}
            onReset={() => dispatch({ type: "reset" })}
            onToggleCourse={handleToggleCourse}
            onPrice={(value) => dispatch({ type: "price", value })}
            onSort={(value) => dispatch({ type: "sort", value })}
          />
        </div>
      </div>

      <div className="tt-body">
        {cards.length > 0 ? (
          // 加载中不清空列表，只把上一天的卡片调淡：清空会让内容消失一帧、滚动位置跳顶。
          // 只有首次加载、手上一条数据都没有时才留空。
          <div className={`tt-cards${state.loading ? " is-loading" : ""}`}>
            {cards.map((card) => (
              <CourseCard
                key={card.course.id}
                card={card}
                selectedIso={selectedIso}
                selectedChip={state.selectedChip}
                onChip={(key) => dispatch({ type: "chip", key })}
                onBookFallback={(name) => showToast(STRINGS.bookToast(name))}
              />
            ))}
          </div>
        ) : state.loading ? null : (
          <div className="tt-empty">{STRINGS.noResults}</div>
        )}
      </div>

      <Toast message={toast} />
    </>
  );
}
```

- [ ] **Step 7: 写 main.tsx**

```tsx
import { createRoot } from "react-dom/client";
import { App } from "./App";
import "./styles.css";

// 不包 StrictMode：它在开发模式下会把挂载 effect 跑两遍，init 的请求和失败 toast
// 会重复，和旧页行为对不上。等价迁移期间先保持一致。
createRoot(document.getElementById("app")!).render(<App />);
```

- [ ] **Step 8: 改写 index.html（全文替换）**

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>GreenLight — Tee Times</title>
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link
      href="https://fonts.googleapis.com/css2?family=Manrope:wght@400;600;700;800&display=swap"
      rel="stylesheet"
    />
  </head>
  <body>
    <div class="tt" id="app"><!-- rendered by src/pages/tee-times/main.tsx --></div>
    <script type="module" src="/src/pages/tee-times/main.tsx"></script>
  </body>
</html>
```

（保留 `<div class="tt" id="app">` 作为 React 容器：`.tt` 是整套 CSS 的命名空间根，挂载点不变则样式不变。）

- [ ] **Step 9: 验证**

Run: `npm test && npm run typecheck && npm run build`
Expected: 全绿、构建成功。

Run: `npm run dev`，浏览器开 `http://localhost:5173/index.html`
Expected（后端未起时）: 页头/日期条/筛选按钮正常渲染，toast 显示 "Backend offline — no data to show."，空态无卡片。若本地后端在跑：卡片、筛选、排序、chip、Book 链接逐项可用。

- [ ] **Step 10: Commit**

```bash
git add src/pages/tee-times index.html
git commit -m "feat: tee-time 页迁移到 React（组件按旧 render 注释边界拆分）"
```

---

### Task 6: config 页接入 legacy 通道

旧 config.js/api.js 挪进 `src/legacy/`，config.html 指过去。legacy 代码唯一允许的改动：api.js 的占位符注入改成环境变量（sed 已从 workflow 删除，不改这两行 config 页就没有后端地址）。

**Files:**
- Move: `config.js` → `src/legacy/config.js`
- Move: `api.js` → `src/legacy/api.js`（改 2 处）
- Modify: `config.html:607`（script src）
- 注意: 根目录 `main.js` 本任务**不删**（spec 定于 PR 2 清理；它已无引用，不进构建）。

**Interfaces:**
- Consumes: 无
- Produces: `config.html` 在 Vite 下可构建可运行，行为与线上一致。

- [ ] **Step 1: 挪文件**

```bash
mkdir -p src/legacy
git mv config.js src/legacy/config.js
git mv api.js src/legacy/api.js
```

（config.js 里 `import ... from "./api.js"` 是相对路径，两个文件一起挪，无需改。）

- [ ] **Step 2: src/legacy/api.js 换掉占位符两段**

删掉：

```js
const API_BASE = "__API_BASE__";
```

和 `API_KEY_SLOT` 那两行（含其上「占位符没被替换掉时留空」一句注释），换成：

```js
// 构建期由 Vite 注入（deploy.yml 的 VITE_API_BASE / VITE_API_KEY）。
// 本地开发不设时退回 localhost:8080；密钥留空＝后端关卡关闭，正好对上。
const API_BASE = import.meta.env.VITE_API_BASE ?? "http://localhost:8080";
const API_KEY = import.meta.env.VITE_API_KEY ?? "";
```

其余内容（含「这不是真正的凭据」注释块）一律不动。

- [ ] **Step 3: config.html 的 script 行改为**

```html
<script type="module" src="/src/legacy/config.js"></script>
```

- [ ] **Step 4: 验证**

Run: `npm run build && npm run preview`，浏览器开 `http://localhost:4173/config.html`
Expected: config 页照旧渲染（后端未起时 offline toast + 空列表）；`index.html` 的 React 版也正常。

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "chore: 旧 config 页挪入 src/legacy，API 地址改为构建期注入"
```

---

### Task 7: deploy.yml 切换 + 收尾验证

**Files:**
- Modify: `.github/workflows/deploy.yml`（全文替换）

**Interfaces:**
- Consumes: Task 1 的 npm scripts；仓库变量 `API_BASE`、secret `API_KEY`（已存在，名字不变）。
- Produces: 推 main 后 Pages 部署 `dist/`。

- [ ] **Step 1: 全文替换 deploy.yml**

```yaml
name: Deploy to GitHub Pages

on:
  push:
    branches: [main]
  workflow_dispatch:

permissions:
  contents: read
  pages: write
  id-token: write

concurrency:
  group: pages
  cancel-in-progress: true

jobs:
  deploy:
    runs-on: ubuntu-latest
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: npm
      - run: npm ci
      - run: npm test
      # 后端地址和 API 密钥都不进源码，构建期由 Vite 内联进产物。
      # 密钥最终会随静态产物公开（页面是公开的），放 secret 只是别让它出现在构建日志里。
      - run: npm run build
        env:
          VITE_API_BASE: ${{ vars.API_BASE }}
          VITE_API_KEY: ${{ secrets.API_KEY }}
      # 环境变量没注入时产物里会带着 localhost 兜底值——部署前抓出来，别让它上线
      - name: Fail if API_BASE was not injected
        run: |
          if grep -r "localhost:8080" dist; then
            echo "VITE_API_BASE was not injected into the build"
            exit 1
          fi
      - uses: actions/upload-pages-artifact@v3
        with:
          path: dist
      - id: deployment
        uses: actions/deploy-pages@v4
```

- [ ] **Step 2: 本地全量验证**

```bash
npm test && npm run typecheck && npm run build
VITE_API_BASE=https://example.test VITE_API_KEY=k npm run build && ! grep -r "localhost:8080" dist
npm run preview  # 手工过一遍两页
```

Expected: 测试全绿；注入后的 dist 无 localhost 残留；preview 下 `index.html`（React 版）与 `config.html`（legacy）都可用。

- [ ] **Step 3: 手工等价性对照（spec §测试与验收 的 index 页部分）**

对照物：线上 https://lilmuh.github.io/greenlight-frontend/ （需本地后端起着才能对数据交互）：
日期条选中/今天标签/跨月、筛选开合、价格档、排序、球场勾选、维护中球场 toast、Reset 语义、chip 选中/取消、Book 链接参数、offline/401/5xx 文案、加载中列表调淡不清空。

- [ ] **Step 4: Commit + 推分支 + 开 PR**

```bash
git add .github/workflows/deploy.yml
git commit -m "ci: 部署切到 Vite 构建，API 配置从 sed 注入改为构建期环境变量"
git push -u origin react-migration
```

PR 标题：`React 迁移第一批：Vite 骨架 + tee-time 页 / React migration batch 1`。正文列出：等价迁移范围、config 页走 legacy、部署流程变化（提醒 reviewer 检查仓库变量 API_BASE / secret API_KEY 仍在用）、手工对照结果。

---

## PR 2 预告（另写计划）

config 页 React 化（表单 + watch 列表 + `clock.ts`）、删 `src/legacy/` 与根目录 `main.js`/`styles.css`、README 更新。PR 1 合并且线上验证后再写。

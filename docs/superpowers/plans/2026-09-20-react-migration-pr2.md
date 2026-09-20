# React 迁移 PR 2（config 页 + 清理 + README）Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** watch-config 页（config.html）等价迁移到 React；删除 `src/legacy/` 与根目录死代码；README 跟上现实。迁移完成后仓库内不再有旧渲染模式的代码。

**Architecture:** 与 tee-time 页同构：`src/pages/config/` 下 strings/logic/reducer/components/App/main + 原样搬运的 styles.css。一个 `useReducer`，action 名沿用旧 `data-act` 值。乐观更新（Active/Paused 开关）在 App 层做请求、reducer 只管纯状态翻转与回滚。

**Tech Stack:** 同 PR 1（React 19 + TS strict + Vite + Vitest），不新增依赖。

**Spec:** `docs/superpowers/specs/2026-09-18-react-migration-design.md`

## Global Constraints

- **等价迁移**：交互与线上 config 页逐一对齐；`STRINGS` / `ERROR_MESSAGES` 文案逐字保留；旧中文注释随代码走。
- **CSS 一字不改**：config.html 内联 `<style>`（`.wa-` 命名空间，约 590 行）原样搬到 `src/pages/config/styles.css`。
- 四个老补丁在 React 下应自然消失，验收时逐一确认不回退：价格滑块双渲染路径、时/分下拉"不能重绘"例外、展开卡片焦点找回、`wireInputs` 重绑。
- 保留的刻意设计不许"顺手优化"：不用 `<input type="time">`（AM/PM 漏拨会存出倒挂窗口）；分钟档位兼容老数据（`minuteOptions`）；星期不给默认值；折叠详情整块不渲染（不是 display:none）。
- 分支 `react-config`；每 Task 一个 commit；`npm test && npm run typecheck && npm run build` 全绿才算完。

---

### Task 1: config 页 strings.ts + logic.ts（TDD）

**Files:**
- Create: `src/pages/config/strings.ts`（常量 + STRINGS + ERROR_MESSAGES，全部从 legacy 逐字复制，含注释）
- Create: `src/pages/config/logic.ts`
- Test: `src/pages/config/logic.test.ts`

**Interfaces（logic.ts 出口）:**
- `interface CourseRef { id: number; slug: string; name: string; maintenance: boolean }`
- `interface WatchView { id: number; courseId: number; courseName: string; weekdays: string[]; timeStart: string; timeEnd: string; players: number; maxPrice: number; email: string; active: boolean }`
- `normalizeCourses(courseDtos: CourseDto[]): CourseRef[]`（init 里的映射：id/slug/name/maintenance === true）
- `normalizeWatch(record: WatchConfigDto, courses: CourseRef[]): WatchView`（courseName 缺失时按 courseId 查 courses 兜底）
- `toDto(watch: WatchView): WatchConfigDto`
- `sortWeekdays(codes: string[]): string[]` / `weekdaysText(codes: string[]): string`
- `parseClock(value: unknown): { hour: number; minute: number }` / `formatClock(hour: number, minute: number): string` / `minuteOptions(current: number): number[]`
- `isCourseInMaintenance(courses: CourseRef[], courseId: number): boolean` / `courseName(courses: CourseRef[], courseId: number): string`
- `defaultFormCourses(courses: CourseRef[]): number[]`
- `classifyError(error: unknown): { offline: boolean; message: string }`（旧 reportError 拆纯函数：非 ApiError → offline 文案 + offline:true；ApiError → `ERROR_MESSAGES[code] ?? genericError`）

**Steps:**

- [ ] **Step 1**: strings.ts —— 从 `src/legacy/config.js` 逐字复制 `PRICE_MIN/MAX/DEFAULT`、`TIME_START/END_DEFAULT`、`MINUTE_CHOICES`、`PLAYERS_DEFAULT`、`WEEKDAYS`、`STRINGS`、`ERROR_MESSAGES`（三段注释一并搬），只加类型标注（`countText: (n: number) => ...` 等）。
- [ ] **Step 2**: 写失败测试 logic.test.ts，用例（全部从旧实现语义推导）：

```ts
// sortWeekdays: ISO 序（周一在前）——["SUN","MON","SAT"] → ["MON","SAT","SUN"]
// weekdaysText: 空数组 → ""；七天全勾 → "Every day"；["SAT","SUN"] → "Sat, Sun"；认不出的 code 原样保留
// parseClock: "16:45"→{16,45}；"7:05"→{7,5}；"99:99"→{23,59}(各自 clamp)；"abc"/null→{0,0}
// formatClock: (7,5) → "07:05"
// minuteOptions: 30 → [0,30]；45 → [0,30,45]（老数据的分钟补进档位并排序）
// normalizeCourses: maintenance 只认 === true
// normalizeWatch: 缺省字段落默认值（timeStart "06:00"、players 4、maxPrice 300、active !== false）；
//   courseName 缺失时按 courses 查名，查不到回退 courseId
// toDto(normalizeWatch(x)) 字段齐全（id/courseId/weekdays/timeStart/timeEnd/players/maxPrice/email/active）
// defaultFormCourses: 全选但排除 maintenance
// classifyError: TypeError → {offline:true, message:STRINGS.offline}；
//   ApiError("WATCH_DUPLICATE") → 对应文案且 offline:false；
//   ApiError(未知 code "NEW_CODE") → genericError（后端加新 code 不崩、不谎称离线）
```

- [ ] **Step 3**: `npm test` 确认新文件测试 FAIL（模块不存在）。
- [ ] **Step 4**: logic.ts —— 函数体从 legacy 逐字搬，闭包 `state.courses` 改参数；`reportError` 的界面副作用（toast/render）留给 App，这里只留 `classifyError` 纯分类。旧注释全部随行。
- [ ] **Step 5**: `npm test && npm run typecheck` 全绿。
- [ ] **Step 6**: Commit `feat: config 页纯逻辑迁入 logic.ts（TDD）`。

---

### Task 2: reducer.ts（TDD）

**Files:**
- Create: `src/pages/config/reducer.ts`
- Test: `src/pages/config/reducer.test.ts`

**Interfaces:**

```ts
export interface State {
  offline: boolean;
  courses: CourseRef[];
  watches: WatchView[];
  hitsByWatchId: Record<number, number>;
  expandedWatchIds: number[];
  formCourses: number[];
  formWeekdays: string[];
  formTimeStart: string;
  formTimeEnd: string;
  formPlayers: number;
  formMaxPrice: number;
  formEmail: string;
  editingId: number | null;
}
export function createInitialState(): State;
// action 名沿用旧 data-act / 函数名；副作用（请求、toast、滚动）都在 App 层
export type Action =
  | { type: "coursesLoaded"; courses: CourseDto[] }     // + formCourses = defaultFormCourses
  | { type: "watchesLoaded"; watches: WatchConfigDto[] }
  | { type: "hitsLoaded"; hits: Record<number, number> }
  | { type: "offline" }
  | { type: "course"; id: number }        // 锁定/维护拦截在组件层
  | { type: "weekday"; code: string }
  | { type: "players"; count: number }
  | { type: "price"; value: number }
  | { type: "email"; value: string }
  | { type: "time"; which: "start" | "end"; value: string }
  | { type: "expand"; id: number }
  | { type: "edit"; id: number }          // 表单载入该 watch（含 formCourses=[courseId]）
  | { type: "cancel" }                    // resetForm 直译（星期清空、editingId=null）
  | { type: "created"; watches: WatchConfigDto[] }  // 前插 + resetForm
  | { type: "updated"; watch: WatchConfigDto }      // 替换 + resetForm
  | { type: "deleted"; id: number }       // 过滤；正在编辑这条则 resetForm
  | { type: "setWatchActive"; id: number; active: boolean }; // 乐观更新与回滚共用
```

**Steps:**

- [ ] **Step 1**: 写失败测试，覆盖每个分支，重点：
  - coursesLoaded 后 formCourses 排除维护中球场
  - edit 载入表单 + cancel 恢复默认（星期为空、editingId 清掉）
  - deleted 恰好是 editingId → 表单重置
  - created 前插、updated 原位替换，两者都重置表单
  - expand 二次点击收起；setWatchActive 翻转指定条目不动别的
- [ ] **Step 2**: FAIL 确认 → 实现 reducer.ts（旧函数体逐段直译，注释随行）→ 全绿。
- [ ] **Step 3**: Commit `feat: config 页 reducer（TDD）`。

---

### Task 3: 组件 + App + 入口 + CSS 搬运 + config.html 瘦身

**Files:**
- Create: `src/pages/config/components/WatchForm.tsx`（左栏整个表单；内含 TimePicker 子组件——时/分两个受控 `<select>`，React 下改值可以放心 dispatch，不会重建 DOM 关掉手机原生下拉）
- Create: `src/pages/config/components/WatchCard.tsx`（卡片：展开热区 role=button + Enter/空格 onKeyDown、Active/Paused 开关 stopPropagation、折叠时详情不渲染、维护提示）
- Create: `src/pages/config/components/Toast.tsx`（`.wa-toast`）
- Create: `src/pages/config/App.tsx`
- Create: `src/pages/config/main.tsx`（挂载到 `<div class="wa" id="app">`；不包 StrictMode，同 PR 1 理由）
- Create: `src/pages/config/styles.css`（awk 原样提取 config.html 的 `<style>` 内容）
- Modify: `config.html`（去内联 style，script 指向 `/src/pages/config/main.tsx`）

**App.tsx 关键直译点（每处对应 legacy 的一段）:**
- init：courses → watches → matches 依次加载，各自 catch 置 offline，最后 offline 则 toast（`STRINGS.offline`, 2600ms）
- `submitForm`：三道前置校验（球场+邮箱、星期、`formTimeEnd <= formTimeStart` 字符串比较）→ 编辑走 `updateWatchConfig`（active 取当前值）/ 新建走 `createWatchConfigs` 批量 → dispatch updated/created → `loadMatches()` → toast saved → 失败 `classifyError` 弹对应文案（offline 同时置标记）
- `toggleActive`：开启前拦维护中（toast，省一次回滚闪烁）→ 乐观 `setWatchActive` → 请求失败回滚再弹错
- `deleteWatch`：请求成功才动列表（非乐观，与旧一致）
- `startEdit`：dispatch edit 后 `formRef.current?.scrollIntoView({behavior:"smooth", block:"start"})`——React 下节点不会被替换，不再需要"必须在 render 之后"的时序注释
- 展开卡片不再需要 `.focus()` 找回——组件树 diff 不动那颗按钮
- 价格滑块：单一渲染路径 `value={state.formMaxPrice}` + `onChange` dispatch；`#wa-price-val` 那条手动 `textContent` 路径消失

**Steps:**

- [ ] **Step 1**: `awk '/<style>/{flag=1;next}/<\/style>/{flag=0}flag' config.html > src/pages/config/styles.css`，行数比对确认纯搬运。
- [ ] **Step 2**: 写四个组件 + App + main（JSX 对照 legacy render() 的段落边界翻译：表单五个 `.wa-field`、卡片、header/nav）。
- [ ] **Step 3**: config.html 全文替换为瘦身版（保留 fonts link 与 `<div class="wa" id="app">`）。
- [ ] **Step 4**: `npm test && npm run typecheck && npm run build`；mock 后端 + playwright 截图（桌面 + iPhone），对照线上：新建表单默认态、勾球场/星期、时分下拉、滑块拖动、创建/编辑/删除/启停、展开收起、维护中球场行为。
- [ ] **Step 5**: Commit `feat: config 页迁移到 React`。

---

### Task 4: 删除全部遗留代码

**Files:**
- Delete: `src/legacy/`（config.js、api.js）
- Delete: 根目录 `main.js`（旧 tee-time 页实现，已无引用）
- Delete: 根目录 `styles.css`（52 行，无任何页面链接）

**Steps:**

- [ ] **Step 1**: `git rm -r src/legacy main.js styles.css`
- [ ] **Step 2**: `grep -rn "legacy\|main\.js" index.html config.html src/ vite.config.ts` 确认零引用；`npm run build` 全绿。
- [ ] **Step 3**: Commit `chore: 删除 legacy 与根目录死代码——迁移收官`。

---

### Task 5: README 更新（中英两份）

**Files:**
- Modify: `README.md`、`README.zh-CN.md`

**改动点（两份同步）:**
- 技术栈表：`Vanilla HTML/JS` → `React + TypeScript (Vite)`
- "This repository" 段：改为 Vite MPA 双入口描述 + 新目录树（index/config.html 入口、src/api.ts、src/pages/{tee-times,config}/）
- Running locally：`npx serve .` → `npm install && npm run dev`；说明 `VITE_API_BASE` / `VITE_API_KEY` 环境变量（默认 localhost:8080 / 空）
- api.js 那段话改指 `src/api.ts`；补一句 `npm test`（Vitest 纯函数测试）
- Roadmap：勾掉 "Connect config.html to the watch-config API"、"Tee-time view with filters"、"Migrate to a framework"；留下 live refresh
- 部署段（如有提及 sed）改为构建期环境变量注入

**Steps:**

- [ ] **Step 1**: 改两份 README；`grep -n "vanilla\|serve \.\|No framework" README*.md` 清零。
- [ ] **Step 2**: Commit `docs: README 跟上 React + Vite 现实`。

---

### Task 6: 收尾验证

- [ ] `npm test && npm run typecheck && npm run build`；`VITE_API_BASE=https://example.test npm run build && ! grep -r localhost:8080 dist`
- [ ] `npm run preview` 两页冒烟；截图给用户过目
- [ ] 用户确认后合并 push main（触发部署），盯 workflow 到绿、线上抽查

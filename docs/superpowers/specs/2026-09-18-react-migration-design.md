# React 迁移设计 / React Migration Design

日期：2026-09-18
状态：已批准（等价迁移，分两批落地）

## 目标与范围

把前端从「无构建步骤的 vanilla HTML/JS」迁移到 **Vite + React + TypeScript**。

**纯等价迁移**：功能、UI、交互与线上版本（https://lilmuh.github.io/greenlight-frontend/）逐交互对齐，不引入新功能、不重做视觉。验收标准是"跟线上页面对照分不出差别"。

不在范围内：路由库、状态库、UI 库、Tailwind、SSR/meta-framework、Roadmap 里的新功能（实时刷新等）。

## 为什么迁（动机记录）

现有模型是"全局 state + 全量 `innerHTML` 重建 + 事件委托"，衍生了四处补丁，且每加交互可能再多一处：

1. `config.js` 价格滑块：state 变了不能 render（滑块会跳），标签靠第二条渲染路径手动改（`priceValue.textContent`）——同一数字两处渲染代码。
2. `config.js` 时/分下拉："改动后只写回 state 不重绘"的例外，否则手机原生下拉被关掉——失去了时间变化时刷新界面的能力。
3. `config.js toggleExpanded`：重建后焦点掉回 `<body>`，手动 `querySelector().focus()` 找回。
4. 每次 render 后 `wireInputs()` 重绑监听；74 处 `escapeHtml()` 手工转义；34 个 `data-*` 属性做对象序列化/反查。

React 的按需 diff 使这四类补丁全部消失（JSX 默认转义、事件直接挂元素、DOM 节点不被无谓重建）。

## 技术选型

| 决策 | 选择 | 理由 |
| --- | --- | --- |
| 框架 | React 19（`react` + `react-dom`，`createRoot`） | 与现有 state+render 心智模型最近，逐行对译；Angular 全家桶对两页单人项目是负担 |
| 语言 | TypeScript | 构建步骤已引入，边际成本≈0；后端 DTO 契约从注释变成编译期检查；与 scraper 栈一致 |
| 构建 | Vite，MPA 双入口 | `index.html`/`config.html` 都是构建入口，URL 与整页跳转行为不变，Pages 无需 fallback hack |
| 页面架构 | 两个独立 React root，无前端路由 | 与现状一致；页间跳转仍是 `<a href>` |
| 状态 | 每页一个 `useReducer` | 现有 `state` 扁平对象 + click switch 就是现成 reducer；action 名沿用 `data-act` 值 |
| 数据获取 | `useEffect` + `api.ts`，无请求库 | 等价迁移，`loadDay`/`init`/`loadMatches` 时序原样保留 |
| CSS | 现有内联 `<style>` 原样搬到 `src/pages/*/styles.css`，一字不改 | `.tt-`/`.wa-` 前缀已隔离两页，无冲突 |
| 测试 | Vitest 只测纯函数，无 Testing Library | 见"测试与验收" |

## 目录结构

```
greenlight-frontend/
├── index.html                  # Vite 入口（瘦身：<head> + <div id="root"> + <script src="/src/pages/tee-times/main.tsx">）
├── config.html                 # 同上 → src/pages/config/main.tsx（第一批期间指向 legacy）
├── vite.config.ts              # 双入口 MPA，base: "./"
├── tsconfig.json
├── package.json
├── .github/workflows/deploy.yml
└── src/
    ├── api.ts                  # api.js 原样翻译 + DTO 类型（Course/TeeTime/WatchConfig/ApiError）
    ├── lib/clock.ts            # parseClock/formatClock 等跨页纯函数
    ├── pages/
    │   ├── tee-times/
    │   │   ├── main.tsx        # createRoot
    │   │   ├── App.tsx         # 状态（useReducer）+ 数据加载
    │   │   ├── components/     # DateStrip / FilterPanel / CourseCard / Toast ...
    │   │   ├── logic.ts        # groupTeeTimes / priceMatch / bookingUrl / buildDates（纯函数）
    │   │   └── styles.css      # index.html 内联 600 行原样搬入
    │   └── config/             # 第二批，结构同 tee-times
    └── legacy/                 # 第一批期间存放旧 config.js + 旧 api.js；第二批删除
```

- 两页各留各的 `STRINGS`（现状即两份独立文案，不合并）。
- `escapeHtml` 不迁移，JSX 替代。
- 组件只按现有 `render()` 的注释边界拆（日期条、筛选面板、球场卡片、toast、config 表单、watch 列表），不发明新抽象。

## api.ts

逻辑零改动，只加类型。占位符注入改为 Vite 环境变量，保留原语义：

```ts
const API_BASE = import.meta.env.VITE_API_BASE ?? "http://localhost:8080";
const API_KEY  = import.meta.env.VITE_API_KEY ?? "";  // 空 = 后端 ApiKeyFilter 关卡关闭
```

`ApiError`（status/code/message 三元组、body 解析失败吞掉降级为 null code）原样保留——config 页的 `ERROR_MESSAGES` 按 code 挑文案依赖它。

DTO 类型以现有 JS 注释和实际后端响应为准：`Course { id, name, imageUrl, maintenance, rating?, address?, ... }`、`TeeTime { time, price, availableSeats }`、watch-config 的 `normalizeWatch`/`toDto` 对应的两个形状。迁移时以旧代码实际读写的字段为唯一依据，不猜测未使用字段。

## 构建与部署

`deploy.yml` 的 `sed` 注入替换为构建期环境变量：

```yaml
- uses: actions/setup-node@v4
  with: { node-version: 22, cache: npm }
- run: npm ci
- run: npm test
- run: npm run build
  env:
    VITE_API_BASE: ${{ vars.API_BASE }}
    VITE_API_KEY: ${{ secrets.API_KEY }}
- uses: actions/upload-pages-artifact@v3
  with: { path: dist }
```

- 现有注释「密钥随静态产物公开，放 secret 只为不进构建日志」照搬到新 workflow。
- `base: "./"`（相对路径），Pages 挂在 `/greenlight-frontend/` 子路径下不硬编码仓库名。
- 测试不绿不部署（`npm test` 在 build 之前）。
- Google Fonts `<link>` 留在两个 HTML 入口里不动。

第一批期间 `config.html` 仍走旧 JS：旧 `config.js`/`api.js` 是 ES module，挪进 `src/legacy/` 后 Vite 直接把 `config.html` 当第二入口打包，无需双轨部署。legacy 里的 `api.js` 保留 `__API_BASE__` 占位符方案不可行（sed 已删），改为同样读 `import.meta.env`——这是 legacy 代码唯一允许的改动（两行）。

## 测试与验收

**Vitest 纯函数测试，先测后搬**：

1. 对旧实现写用例：`groupTeeTimes`、`priceMatch`、`buildDates`、`toISO`、`bookingUrl`、`parseClock`/`formatClock`、`sortWeekdays`/`weekdaysText`、`normalizeWatch`/`toDto`。
2. 用例跑在旧 JS 上确认绿。
3. 函数搬进 TS，同一批用例继续绿——等价性的机器证明。

**UI 手工对照清单**（每批上线前逐项过，对照物是当前线上页）：

- [ ] 日期条：选中态、今天标签、跨月显示
- [ ] 筛选面板开合、价格档、排序、球场勾选/排除、维护中球场点击出 toast 且不可选
- [ ] Reset 回到"排除维护中球场"的默认态（不是清空）
- [ ] chip 选中/取消、Book 按钮 toast、预订跳转 URL（CPS 球场带 course id/日期参数）
- [ ] 后端 offline / 401 / 5xx 三种失败文案区分正确
- [ ] config 页：表单默认值、多选球场（编辑态锁定 + 文案）、星期多选、时间下拉、价格滑块拖动数字实时跟随且滑块不跳
- [ ] 手机浏览器：时/分下拉拉开后改值不被关掉
- [ ] 展开 watch 卡片后焦点可继续 Tab 到 Edit/Delete
- [ ] Edit 时平滑滚动到表单
- [ ] 新建（多球场批量）、更新、删除、启停 watch 全链路
- [ ] matches 列表加载
- [ ] 错误码文案表（`ERROR_MESSAGES`）逐码触发或代码对读确认

## 分批计划

| 批次 | 内容 | 验证 |
| --- | --- | --- |
| PR 1 | Vite 骨架 + `api.ts` + tee-time 页 React 化；`config.html` 走 `src/legacy/`；`deploy.yml` 切换；纯函数测试 | 两页线上都能用；index 页过手工清单 |
| PR 2 | config 页 React 化；删 `src/legacy/`、旧 `main.js`/`styles.css`；README 更新（技术栈、`npm run dev`、Roadmap 勾掉迁移项） | config 页过手工清单 |

任何一批出问题，revert 该批的 merge commit 即可，另一页不受影响。

## 风险与对策

| 风险 | 对策 |
| --- | --- |
| CSS 搬运时被"顺手优化" | 明确规则：一字不改，diff 里 styles.css 应当是纯新增文件、内容与原 `<style>` 块逐字节一致 |
| reducer 翻译漏分支 | action 名沿用 `data-act` 值，新旧 switch 并排对读 review |
| 部署后资源 404 | `base: "./"` + 上线前用 `npm run preview` 在子路径下冒烟 |
| 环境变量没注入（Pages 构建产物里出现 localhost） | build 后 grep `dist/` 确认无 `localhost:8080`，写进 workflow 或验收清单 |
| 旧 URL 断链 | 无此风险：`index.html`/`config.html` 路径不变 |

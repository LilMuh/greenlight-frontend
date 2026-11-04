# GreenLight ⛳

GreenLight 持续监控温哥华的高尔夫球场。出现符合你条件的开球时段时，它会发邮件通知你。

**线上地址：<https://lilmuh.github.io/greenlight-frontend/>**

> 服务端（后端、抓取和数据库 schema）在一个私有 monorepo 里维护。这个公开仓库只包含网页前端。

## 功能说明

温哥华各市政球场的开球时段很快就被订走。周末下午和 twilight 优惠时段通常在放出后几分钟内就被订完。之后只能等别人取消。手动刷新订位页面不现实。

GreenLight 负责监控：

* 你设定监控条件：球场、星期、开球时间范围和人数。
* 后端定时轮询各家订位系统。它把不同平台的数据转换成统一格式，并保存当前可订的时段。
* 出现匹配的时段时，系统立即发邮件。某个时段被订走后又重新放出时，系统会再次通知。
* 网页端读取数据库里的数据。因此页面加载快，每次访问也不会请求订位网站。

## 架构

GreenLight 由公开的前端（本仓库）和私有的服务端 monorepo（`greenlight`）组成。两者各自独立部署。

```
  greenlight-frontend  ──REST/JSON──▶  greenlight/backend
  （本仓库）                            Spring Boot
  React + TypeScript（Vite）            · 提供给前端的 REST API
                                       · @Scheduled 定时轮询
                                       · 去重与邮件提醒
                                            │            │
                                        JPA │            │ HTTP
                                            ▼            ▼
                              greenlight/database   greenlight/scraper
                              Postgres + Liquibase  Node，负责抓取与
                                                    数据归一化
                                                    （POST /scrape）
```

| 仓库 | 职责 | 技术栈 |
| --- | --- | --- |
| **greenlight-frontend**（本仓库） | 网页界面：编辑监控条件，查看当前可订时段。 | React、TypeScript、Vite |
| `greenlight/backend`（私有） | REST API、定时轮询、去重和邮件提醒。 | Java 21、Spring Boot、Gradle |
| `greenlight/scraper`（私有） | 从各订位系统抓取可订时段，并转换成统一格式。 | Node、TypeScript |
| `greenlight/database`（私有） | 表结构（Liquibase）和本地数据库环境（Docker）。 | PostgreSQL、Liquibase |

前端保持公开。原因：静态站点本来就会原样发到访客的浏览器里。后端、抓取和数据库 schema 合并在私有 monorepo（`greenlight`）里维护。两个仓库之间只共享一份约定好的 JSON 契约。

## 本仓库

前端用 React + TypeScript，由 Vite 构建成双入口 MPA。每个页面有自己的 React root，页面之间用普通链接跳转。前端只与后端 REST API 通信，不直接访问 scraper 或数据库。

```
greenlight-frontend/
├── index.html               # 入口：时段列表
├── config.html              # 入口：监控条件编辑
├── vite.config.ts           # 双入口 MPA 构建
└── src/
    ├── api.ts               # 所有后端请求 + DTO 类型集中在这里
    └── pages/
        ├── tee-times/       # strings / logic / reducer / components / styles.css
        └── config/          # 同样的结构
```

所有 `fetch` 调用都封装在 `src/api.ts` 中，对外提供具名函数，例如 `getTeeTimes()`、`listWatchConfigs()` 和 `createWatchConfigs()`。前后端的 JSON 契约用 TypeScript 类型固定下来。纯逻辑（分组、筛选、预订链接和表单归一化）由 Vitest 测试覆盖。运行测试用 `npm test`。

### 使用的接口

| 方法 | 路径 | 用途 |
| --- | --- | --- |
| `GET` | `/api/health` | 连通性检查 |
| `GET` | `/api/courses` | 填充球场选择器 |
| `GET` | `/api/tee-times?course=&date=&onlyAvailable=` | 时段列表 |
| `GET` | `/api/watch-configs` | 列出已保存的监控条件 |
| `POST` | `/api/watch-configs` | 新建 |
| `PUT` | `/api/watch-configs/{id}` | 修改 |
| `DELETE` | `/api/watch-configs/{id}` | 删除 |

## 本地运行

### 前置条件

前端单独运行时没有数据可展示。请先按顺序启动其余服务：

1. `greenlight/database`：运行 `docker compose up -d`，然后执行 Liquibase changelog。
2. `greenlight/scraper`：运行 `npm install && npm run dev`。
3. `greenlight/backend`：启动 Spring Boot 应用。开发环境下，必须在 CORS 中放行前端的来源。否则所有请求都会失败。

详细步骤见 monorepo 中各目录的 README。

### 启动前端

```bash
npm install
npm run dev
```

打开命令行输出的地址。`npm test` 运行单元测试。`npm run build` 把静态站点输出到 `dist/`。

### 配置后端地址

后端地址和 Google OAuth Client ID 在构建和开发时从 Vite 环境变量读取。部署 workflow 从仓库变量 `API_BASE` 和 `GOOGLE_CLIENT_ID` 注入它们：

```bash
VITE_API_BASE=http://localhost:8080 VITE_GOOGLE_CLIENT_ID=xxx.apps.googleusercontent.com npm run dev
```

不设置 `VITE_API_BASE` 时，默认用 `http://localhost:8080`。没有 Client ID 时，页面隐藏 Google 按钮，只能用邮箱验证码登录。后端处于 dev 邮件模式时，验证码会写在后端日志里。

### 登录

时段查询页公开。Watch Alerts 页需要登录：用 Google，或用邮箱接收 6 位验证码。每个账号只能看到自己的 watch。

管理员账号用用户名和密码登录。管理员能看到所有人的 watch，列表按主人分组。管理员能修改、启停或删除任何一条 watch。

会话令牌存在 `localStorage` 里，请求时带上 `Authorization: Bearer …`。

## 后续计划

- [x] 将 `config.html` 接入 watch-config 接口
- [x] 时段列表支持球场和日期筛选
- [ ] 增加实时刷新：先轮询 `/api/tee-times`，以后改为 SSE 或 WebSocket
- [x] 迁移到框架：React + TypeScript（Vite），2026-09

## 相关仓库

* 🖥️ greenlight-frontend（本仓库，公开）：线上地址 <https://lilmuh.github.io/greenlight-frontend/>
* 🔒 greenlight（私有服务端 monorepo）：`backend/` Spring Boot、`scraper/` Node、`database/` Liquibase

## 开源协议

[GNU Affero General Public License v3.0](LICENSE)。

你可以自由使用、修改和再分发这些代码。Affero 条款在 GPL 之上增加一个条件：
如果你把修改过的版本部署成网络服务，必须向这个服务的使用者提供修改后版本的源码。

服务端 monorepo 使用同一个协议。
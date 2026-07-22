# GreenLight ⛳

GreenLight 会持续监控温哥华的高尔夫球场，一旦出现符合你条件的开球时段，就通过邮件通知你。

> 说明：本项目由四个仓库组成，下方 GitHub 链接中的 `OWNER` 为占位符，仓库推送后需要替换。

## 功能说明

温哥华各市政球场的开球时段流转很快，周末下午和 twilight 优惠时段通常在放出后几分钟内就被订完，之后只能等待他人取消。手动刷新订位页面并不现实。

监控这部分交给 GreenLight：

* 由你设定监控条件：球场、日期、开球时间范围、人数。
* 后端定时轮询各家订位系统，将不同平台的数据归一化为统一格式，并保存当前可订的时段。
* 出现匹配时段时立即发送邮件；某个时段被订走后重新释放，会再次通知。
* 网页端直接读取数据库，因此加载速度快，也不会在每次访问时都去请求订位网站。

## 架构

四个仓库，各自独立部署。

```
  greenlight-frontend  ──REST/JSON──▶  greenlight-backend
  （本仓库）                            Spring Boot
  纯静态 HTML/JS                        · 提供给前端的 REST API
                                       · @Scheduled 定时轮询
                                       · 去重与邮件提醒
                                            │            │
                                        JPA │            │ HTTP
                                            ▼            ▼
                              greenlight-database   greenlight-scraper
                              Postgres + Liquibase  Node，负责抓取与
                                                    数据归一化
                                                    （POST /scrape）
```

| 仓库 | 职责 | 技术栈 |
| --- | --- | --- |
| **greenlight-frontend**（本仓库） | 网页界面：编辑监控条件、查看当前可订时段。 | 原生 HTML/JS |
| [greenlight-backend](https://github.com/LilMuh/greenlight-backend) | REST API、定时轮询、去重、邮件提醒。 | Java 21、Spring Boot、Gradle |
| [greenlight-scraper](https://github.com/LilMuh/greenlight-scraper) | 从各订位系统抓取可订时段并统一格式。 | Node、TypeScript |
| [greenlight-database](https://github.com/LilMuh/greenlight-database) | 表结构（Liquibase）与本地数据库环境（Docker）。 | PostgreSQL、Liquibase |

拆分的原因是这几部分在技术上关联很少：一个 JVM 服务、一个 Node worker、一个静态站点和一套数据库 schema，发版节奏也各不相同。跨仓库的只有一份约定好的 JSON 契约。

## 本仓库

纯 HTML、CSS 和 JavaScript，不使用框架，也无需构建。仅与后端 REST API 通信，不直接访问 scraper 或数据库。

```
greenlight-frontend/
├── index.html     # 时段列表，展示后端已存储的数据
├── config.html    # 监控条件编辑：球场、日期、时间范围、人数
├── api.js         # 所有后端请求集中在这里
├── main.js        # 页面逻辑与渲染
├── styles.css
└── README.md
```

所有 `fetch` 调用都封装在 `api.js` 中，对外暴露具名函数（`getTeeTimes()`、`listWatchConfigs()`、`saveWatchConfig()` 等）。日后若迁移到框架，该文件基本可以沿用，只需重写渲染部分。

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

前端单独运行没有数据可展示，需要先按顺序启动其余服务：

1. [greenlight-database](https://github.com/LilMuh/greenlight-database)：`docker compose up -d`，然后执行 Liquibase changelog。
2. [greenlight-scraper](https://github.com/LilMuh/greenlight-scraper)：`npm install && npm run dev`。
3. [greenlight-backend](https://github.com/LilMuh/greenlight-backend)：启动 Spring Boot 应用。开发环境下需在 CORS 中放行前端来源，否则所有请求都会失败。

详细步骤见各仓库的 README。

### 启动前端

均为静态文件，任意静态服务器均可：

```bash
npx serve .
# 或者
python -m http.server 5173
```

打开命令行输出的地址即可。

### 配置后端地址

`api.js` 中默认为 `http://localhost:8080`，后端地址不同时在此修改。

```js
// api.js
const API_BASE = "http://localhost:8080";
```

## 后续计划

- [ ] 将 `config.html` 接入 watch-config 接口
- [ ] 时段列表支持球场、日期筛选和「仅看可订」开关
- [ ] 增加实时刷新，先采用轮询 `/api/tee-times`，后续改为 SSE 或 WebSocket
- [ ] 界面复杂度上升后再考虑迁移到框架

## 相关仓库

* 🖥️ greenlight-frontend（本仓库）
* 🧠 [greenlight-backend](https://github.com/LilMuh/greenlight-backend)
* 🕸️ [greenlight-scraper](https://github.com/LilMuh/greenlight-scraper)
* 🗄️ [greenlight-database](https://github.com/LilMuh/greenlight-database)

## 开源协议

尚未确定，仓库公开前需要先明确。
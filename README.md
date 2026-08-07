**English** | [中文](README.zh-CN.md)

# GreenLight ⛳

GreenLight monitors Vancouver golf courses and emails you when a tee time matching your criteria becomes available.

> Note: this project spans four repositories. The GitHub links below still use `OWNER` as a placeholder. Replace them once the repositories are pushed.

## What it does

Tee times at the municipal courses around Vancouver go quickly. Weekend afternoons and twilight slots are often gone within minutes of being released, and after that the only opportunity is catching a cancellation. Checking the booking sites by hand isn't practical.

GreenLight handles the monitoring:

* You define what you're looking for: courses, dates, a tee-off time window, and group size.
* The backend polls the courses' booking systems on a schedule, normalizes each provider into a single format, and stores the current openings.
* You get an email as soon as a matching slot appears, and again if a slot is booked and later frees up.
* The web UI reads from the database, so pages load quickly and the booking sites aren't hit on every page view.

## Architecture

Four repositories, each deployed independently.

```
  greenlight-frontend  ──REST/JSON──▶  greenlight-backend
  (this repo)                          Spring Boot
  static HTML/JS                       · REST API for the UI
                                       · @Scheduled poller
                                       · dedup + email alerts
                                            │            │
                                        JPA │            │ HTTP
                                            ▼            ▼
                              greenlight-database   greenlight-scraper
                              Postgres + Liquibase  Node, fetches and
                                                    normalizes tee times
                                                    (POST /scrape)
```

| Repository | Role | Stack |
| --- | --- | --- |
| **greenlight-frontend** (this repo) | The web UI: edit watch configs, view current tee times. | Vanilla HTML/JS |
| [greenlight-backend](https://github.com/LilMuh/greenlight-backend) | REST API, scheduled polling, de-duplication, email alerts. | Java 21, Spring Boot, Gradle |
| [greenlight-scraper](https://github.com/LilMuh/greenlight-scraper) | Fetches availability from each booking system and normalizes it. | Node, TypeScript |
| [greenlight-database](https://github.com/LilMuh/greenlight-database) | Schema (Liquibase) and local database infrastructure (Docker). | PostgreSQL, Liquibase |

The pieces are separate because they have little in common technically: a JVM service, a Node worker, a static site, and a database schema. Their release cadences differ as well. The only thing crossing a repository boundary is a documented JSON contract.

## This repository

Plain HTML, CSS, and JavaScript. No framework and no build step. It only talks to the backend's REST API, never to the scraper or the database directly.

```
greenlight-frontend/
├── index.html     # tee-time view, showing what the backend has stored
├── config.html    # watch-config editor: courses, dates, time window, group size
├── api.js         # all backend calls live here
├── main.js        # page logic and rendering
├── styles.css
└── README.md
```

All `fetch` calls are wrapped in `api.js` behind named functions (`getTeeTimes()`, `listWatchConfigs()`, `saveWatchConfig()`, and so on). If the UI later moves to a framework, that file carries over largely unchanged and only the rendering needs rewriting.

### Endpoints used

| Method | Path | Used for |
| --- | --- | --- |
| `GET` | `/api/health` | connectivity check |
| `GET` | `/api/courses` | populating the course pickers |
| `GET` | `/api/tee-times?course=&date=&onlyAvailable=` | the tee-time view |
| `GET` | `/api/watch-configs` | listing saved watches |
| `POST` | `/api/watch-configs` | creating a watch |
| `PUT` | `/api/watch-configs/{id}` | updating a watch |
| `DELETE` | `/api/watch-configs/{id}` | deleting a watch |

## Running locally

### Prerequisites

The frontend has nothing to display on its own, so bring up the rest of the stack first:

1. [greenlight-database](https://github.com/LilMuh/greenlight-database): `docker compose up -d`, then apply the Liquibase changelog.
2. [greenlight-scraper](https://github.com/LilMuh/greenlight-scraper): `npm install && npm run dev`.
3. [greenlight-backend](https://github.com/LilMuh/greenlight-backend): start the Spring Boot application. In development, make sure CORS allows this frontend's origin, otherwise every request will fail.

See each repository's README for details.

### Running the frontend

The files are static, so any server will do:

```bash
npx serve .
# or
python -m http.server 5173
```

Then open the URL it prints.

### Configuring the API base URL

`api.js` defaults to `http://localhost:8080`. Update it there if your backend runs elsewhere.

```js
// api.js
const API_BASE = "http://localhost:8080";
```

## Roadmap

- [ ] Connect `config.html` to the watch-config API
- [ ] Tee-time view with course and date filters plus an "available only" toggle
- [ ] Live refresh, polling `/api/tee-times` initially and moving to SSE or WebSockets later
- [ ] Migrate to a framework if the UI grows enough to justify it

## Related repositories

* 🖥️ greenlight-frontend (this repo)
* 🧠 [greenlight-backend](https://github.com/LilMuh/greenlight-backend)
* 🕸️ [greenlight-scraper](https://github.com/LilMuh/greenlight-scraper)
* 🗄️ [greenlight-database](https://github.com/LilMuh/greenlight-database)

## License

[GNU Affero General Public License v3.0](LICENSE).

You may use, modify and redistribute this code. The Affero clause adds one
condition on top of the GPL: if you run a modified version as a network service,
you must offer its source to the people using it.

All four GreenLight repositories are under the same license.
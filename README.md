**English** | [中文](README.zh-CN.md)

# GreenLight ⛳

GreenLight monitors Vancouver golf courses and emails you when a tee time matching your criteria becomes available.

**Live site: <https://lilmuh.github.io/greenlight-frontend/>**

> The server side (backend, scraper, database schema) lives in a private monorepo; this public repository contains the web UI only.

## What it does

Tee times at the municipal courses around Vancouver go quickly. Weekend afternoons and twilight slots are often gone within minutes of being released, and after that the only opportunity is catching a cancellation. Checking the booking sites by hand isn't practical.

GreenLight handles the monitoring:

* You define what you're looking for: courses, weekdays, a tee-off time window, and group size.
* The backend polls the courses' booking systems on a schedule, normalizes each provider into a single format, and stores the current openings.
* You get an email as soon as a matching slot appears, and again if a slot is booked and later frees up.
* The web UI reads from the database, so pages load quickly and the booking sites aren't hit on every page view.

## Architecture

A public frontend (this repo) and a private server-side monorepo (`greenlight`), deployed independently.

```
  greenlight-frontend  ──REST/JSON──▶  greenlight/backend
  (this repo)                          Spring Boot
  static HTML/JS                       · REST API for the UI
                                       · @Scheduled poller
                                       · dedup + email alerts
                                            │            │
                                        JPA │            │ HTTP
                                            ▼            ▼
                              greenlight/database   greenlight/scraper
                              Postgres + Liquibase  Node, fetches and
                                                    normalizes tee times
                                                    (POST /scrape)
```

| Repository | Role | Stack |
| --- | --- | --- |
| **greenlight-frontend** (this repo) | The web UI: edit watch configs, view current tee times. | Vanilla HTML/JS |
| `greenlight/backend` (private) | REST API, scheduled polling, de-duplication, email alerts. | Java 21, Spring Boot, Gradle |
| `greenlight/scraper` (private) | Fetches availability from each booking system and normalizes it. | Node, TypeScript |
| `greenlight/database` (private) | Schema (Liquibase) and local database infrastructure (Docker). | PostgreSQL, Liquibase |

The frontend stays public — a static site ships to the visitor's browser as-is anyway — while the backend, scraper, and database schema are maintained together in the private `greenlight` monorepo. The only thing crossing the repository boundary is a documented JSON contract.

## This repository

Plain HTML, CSS, and JavaScript. No framework and no build step. It only talks to the backend's REST API, never to the scraper or the database directly.

```
greenlight-frontend/
├── index.html     # tee-time view, showing what the backend has stored
├── config.html    # watch-config editor: courses, weekdays, time window, group size
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

1. `greenlight/database`: `docker compose up -d`, then apply the Liquibase changelog.
2. `greenlight/scraper`: `npm install && npm run dev`.
3. `greenlight/backend`: start the Spring Boot application. In development, make sure CORS allows this frontend's origin, otherwise every request will fail.

See each directory's README in the monorepo for details.

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

* 🖥️ greenlight-frontend (this repo, public) — live at <https://lilmuh.github.io/greenlight-frontend/>
* 🔒 greenlight (private server-side monorepo) — `backend/` Spring Boot, `scraper/` Node, `database/` Liquibase

## License

[GNU Affero General Public License v3.0](LICENSE).

You may use, modify and redistribute this code. The Affero clause adds one
condition on top of the GPL: if you run a modified version as a network service,
you must offer its source to the people using it.

The server-side monorepo is under the same license.
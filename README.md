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
  React + TypeScript (Vite)            · REST API for the UI
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
| **greenlight-frontend** (this repo) | The web UI: edit watch configs, view current tee times. | React, TypeScript, Vite |
| `greenlight/backend` (private) | REST API, scheduled polling, de-duplication, email alerts. | Java 21, Spring Boot, Gradle |
| `greenlight/scraper` (private) | Fetches availability from each booking system and normalizes it. | Node, TypeScript |
| `greenlight/database` (private) | Schema (Liquibase) and local database infrastructure (Docker). | PostgreSQL, Liquibase |

The frontend stays public — a static site ships to the visitor's browser as-is anyway — while the backend, scraper, and database schema are maintained together in the private `greenlight` monorepo. The only thing crossing the repository boundary is a documented JSON contract.

## This repository

React + TypeScript, built with Vite as a two-entry MPA (each page is its own React root; navigation between them is a plain link). It only talks to the backend's REST API, never to the scraper or the database directly.

```
greenlight-frontend/
├── index.html               # entry: tee-time view
├── config.html              # entry: watch-config editor
├── vite.config.ts           # two-entry MPA build
└── src/
    ├── api.ts               # all backend calls + DTO types live here
    └── pages/
        ├── tee-times/       # strings / logic / reducer / components / styles.css
        └── config/          # same structure
```

All `fetch` calls are wrapped in `src/api.ts` behind named functions (`getTeeTimes()`, `listWatchConfigs()`, `createWatchConfigs()`, and so on), with the backend's JSON contract captured as TypeScript types. Pure logic (grouping, filtering, booking links, form normalization) is covered by Vitest — `npm test`.

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

```bash
npm install
npm run dev
```

Then open the URL it prints. `npm test` runs the unit tests; `npm run build` produces the static site in `dist/`.

### Configuring the API base URL

The backend address and the Google OAuth Client ID are read from Vite environment variables at build/dev time (the deploy workflow injects them from repository variables `API_BASE` and `GOOGLE_CLIENT_ID`):

```bash
VITE_API_BASE=http://localhost:8080 VITE_GOOGLE_CLIENT_ID=xxx.apps.googleusercontent.com npm run dev
```

Unset, `VITE_API_BASE` falls back to `http://localhost:8080`. Without a Client ID the Google button is hidden and only email-code sign-in is offered; with the backend in dev mail mode the code is printed in the backend log.

### Sign-in

The tee-time search page is public. The Watch Alerts page requires sign-in (Google, or a 6-digit code sent by email); each account only sees its own watches. The session token is kept in `localStorage` and sent as `Authorization: Bearer …`.

## Roadmap

- [x] Connect `config.html` to the watch-config API
- [x] Tee-time view with course and date filters
- [ ] Live refresh, polling `/api/tee-times` initially and moving to SSE or WebSockets later
- [x] Migrate to a framework — React + TypeScript on Vite (2026-09)

## Related repositories

* 🖥️ greenlight-frontend (this repo, public) — live at <https://lilmuh.github.io/greenlight-frontend/>
* 🔒 greenlight (private server-side monorepo) — `backend/` Spring Boot, `scraper/` Node, `database/` Liquibase

## License

[GNU Affero General Public License v3.0](LICENSE).

You may use, modify and redistribute this code. The Affero clause adds one
condition on top of the GPL: if you run a modified version as a network service,
you must offer its source to the people using it.

The server-side monorepo is under the same license.